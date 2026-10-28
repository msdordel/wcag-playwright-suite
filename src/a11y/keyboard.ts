import type { Page } from '@playwright/test';

export interface FocusStop {
  /** Stable id stamped on the element as data-a11y-stop, so it can be re-located. */
  id: string;
  tag: string;
  role: string | null;
  name: string;
  /** Viewport-relative rect at the moment of focus. */
  rect: { x: number; y: number; width: number; height: number };
}

export const stopSelector = (stop: FocusStop) => `[data-a11y-stop="${stop.id}"]`;

/**
 * The key that moves to the next stop. Safari on macOS skips links on plain Tab unless a system
 * setting is on, so WebKit on darwin uses Option+Tab, which includes them.
 */
export function tabKey(page: Page, { reverse = false } = {}): string {
  const isMacWebKit = page.context().browser()?.browserType().name() === 'webkit' && process.platform === 'darwin';
  return `${reverse ? 'Shift+' : ''}${isMacWebKit ? 'Alt+' : ''}Tab`;
}

/** Describe document.activeElement (piercing open shadow roots) and stamp it with a stop id. */
export async function activeElement(page: Page): Promise<FocusStop | null> {
  return page.evaluate(() => {
    // Once focus moves to browser UI, some engines (Firefox) leave activeElement on the last
    // element, so check hasFocus() to avoid reading that as a trap.
    if (!document.hasFocus()) return null;
    let el = document.activeElement as HTMLElement | null;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
    if (!el || el === document.body || el === document.documentElement) return null;

    const w = window as unknown as { __a11yStopSeq?: number };
    if (!el.dataset.a11yStop) el.dataset.a11yStop = String((w.__a11yStopSeq = (w.__a11yStopSeq ?? 0) + 1));

    const r = el.getBoundingClientRect();
    const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || (el as HTMLInputElement).value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 60);
    return {
      id: el.dataset.a11yStop,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      name,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
  });
}

export interface TraversalResult {
  stops: FocusStop[];
  /** Focus cycled within a subset of stops and could not leave (2.1.2 failure). */
  trappedAt: FocusStop | null;
  /** Hit `max` before the sequence ended; the results are incomplete. */
  exhausted: boolean;
}

/**
 * Tab forward from the top of the document until focus leaves the page or wraps.
 * `onStop` runs while each element holds focus, for per-stop assertions.
 */
/** Stops inside a single iframe before focus that never leaves it counts as a trap. */
const IFRAME_TAB_LIMIT = 50;

export async function tabThrough(
  page: Page,
  { max = 300, onStop }: { max?: number; onStop?: (stop: FocusStop) => Promise<void> } = {},
): Promise<TraversalResult> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const stops: FocusStop[] = [];
  const seen = new Set<string>();
  let tabsInsideFrame = 0;

  for (let i = 0; i < max; i++) {
    await page.keyboard.press(tabKey(page));
    const stop = await activeElement(page);
    if (!stop) {
      if (stops.length) return { stops, trappedAt: null, exhausted: false }; // focus left the document
      continue;
    }
    // While focus moves through an iframe's own document, the top page only sees the <iframe>.
    // Keep tabbing until focus comes back out; it's a trap only if it never does.
    if (stop.tag === 'iframe' && stop.id === stops.at(-1)?.id && tabsInsideFrame++ < IFRAME_TAB_LIMIT) continue;
    tabsInsideFrame = 0;
    if (seen.has(stop.id)) {
      // Headless Firefox has no browser UI to tab into, so focus stays on the last element.
      // That counts as the end of the page only when nothing tabbable follows it in the DOM.
      if (stop.id === stops.at(-1)?.id && !(await hasTabbableAfter(page, stop))) {
        return { stops, trappedAt: null, exhausted: false };
      }
      // Wrapping back to the very first stop is normal; landing on any other seen stop is a cycle.
      const trapped = stop.id !== stops[0].id;
      return { stops, trappedAt: trapped ? stop : null, exhausted: false };
    }
    seen.add(stop.id);
    stops.push(stop);
    if (onStop) await onStop(stop);
  }
  return { stops, trappedAt: null, exhausted: true };
}

async function hasTabbableAfter(page: Page, stop: FocusStop): Promise<boolean> {
  return page.locator(stopSelector(stop)).evaluate((el) =>
    [...document.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
    )].some(
      (c) =>
        c !== el &&
        !el.contains(c) &&
        !!(el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        !(c as HTMLButtonElement).disabled &&
        c.checkVisibility(),
    ),
  );
}

/**
 * Elements that should be reachable by Tab but were not visited (2.1.1 signal).
 * Only native/explicit tabbables can be detected. Click handlers on generic divs are
 * invisible to this check and must be found in manual testing.
 */
export async function unreachableFocusables(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const candidates = document.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type="hidden"]):not([type="radio"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
    );
    return [...candidates]
      .filter((el) => !el.dataset.a11yStop)
      .filter((el) => !(el as HTMLButtonElement).disabled && !el.closest('[inert], [aria-hidden="true"]'))
      .filter((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      .map((el) => el.outerHTML.slice(0, 120));
  });
}

const INDICATOR_PROPS = [
  'outline-style', 'outline-width', 'outline-color', 'outline-offset', 'box-shadow',
  'border-top-color', 'border-bottom-color', 'border-bottom-width', 'background-color',
  'color', 'text-decoration-line',
];

/**
 * 2.4.7: is there a visible difference between the focused and unfocused element?
 * Compares computed styles first, then falls back to a pixel comparison of the padded region,
 * which also catches indicators drawn by ancestors (:focus-within) or pseudo-elements.
 * Leaves the element focused again on return.
 */
export async function hasVisibleFocusIndicator(page: Page, stop: FocusStop): Promise<boolean> {
  const el = page.locator(stopSelector(stop));
  if (stop.rect.width === 0 || stop.rect.height === 0) return false;

  // With outline-style none, outline width/color/offset draw nothing. Chromium's UA :focus-visible
  // style still changes outline-offset, which would pass a page that removed its focus ring.
  const styles = () => el.evaluate((n, props) => {
    const cs = getComputedStyle(n);
    const noOutline = cs.outlineStyle === 'none';
    return props.map((p) => (noOutline && p.startsWith('outline-') ? 'none' : cs.getPropertyValue(p))).join('|');
  }, INDICATOR_PROPS);
  // Padded element box, intersected with the viewport. Off-screen elements (2.4.11's concern)
  // leave nothing to screenshot, so only their computed styles are compared.
  const pad = 8;
  const vp = page.viewportSize()!;
  const x = Math.max(0, stop.rect.x - pad);
  const y = Math.max(0, stop.rect.y - pad);
  const width = Math.min(vp.width, stop.rect.x + stop.rect.width + pad) - x;
  const height = Math.min(vp.height, stop.rect.y + stop.rect.height + pad) - y;
  const clip = width > 0 && height > 0 ? { x, y, width, height } : null;
  const shot = () => (clip ? page.screenshot({ clip, animations: 'disabled', caret: 'hide' }) : Promise.resolve(null));

  const focusedStyles = await styles();
  const focusedShot = await shot();
  await el.evaluate((n) => (n as HTMLElement).blur());
  const blurredStyles = await styles();
  const blurredShot = await shot();
  // Restore focus. Modality is still "keyboard", so :focus-visible continues to match.
  await el.evaluate((n) => (n as HTMLElement).focus({ focusVisible: true } as FocusOptions));

  return focusedStyles !== blurredStyles || (!!focusedShot && !!blurredShot && !focusedShot.equals(blurredShot));
}

/** 2.4.11: true when the focused element is ENTIRELY hidden (sticky headers, cookie banners, off-screen). */
export async function isEntirelyObscured(page: Page, stop: FocusStop): Promise<boolean> {
  return page.locator(stopSelector(stop)).evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return true;
    const samples = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]];
    return samples.every(([fx, fy]) => {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true;
      const hit = document.elementFromPoint(x, y);
      return !!hit && hit !== el && !el.contains(hit) && !hit.contains(el);
    });
  });
}
