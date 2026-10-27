import type { Page } from '@playwright/test';

/**
 * Content-quality heuristics: catch names that exist but are meaningless. axe only checks
 * that a title, alt, or label is present. These checks catch placeholder copy, leaked template
 * syntax, filenames used as alt text, and generic names that tell a screen-reader user nothing.
 *
 * Severity:
 *   fail   — never acceptable in production (placeholders, template leaks, filename alts)
 *   review — often wrong but can be fine in context (e.g. "Read more" inside a labelled card);
 *            recorded as needs-manual-review instead of failing the build
 */
export type Severity = 'fail' | 'review';

export interface Finding {
  sc: string;
  severity: Severity;
  role: string;
  name: string;
  reason: string;
}

/** Text that should never ship: authoring placeholders and unrendered template or runtime values. */
const PLACEHOLDER: [RegExp, string][] = [
  [/\[\s*(insert|add|enter|your|todo|tbd|placeholder)\b[^\]]*\]/i, 'authoring placeholder'],
  [/\b(lorem ipsum|dolor sit amet)\b/i, 'lorem ipsum'],
  // Not TBD or XXX: "Date: TBD" and SSN hints like XXX-XX-XXXX are legitimate content.
  [/\b(TODO|FIXME)\b/, 'TODO marker'],
  [/\{\{.*?\}\}|\$\{.*?\}|<%.*?%>/, 'unrendered template syntax'],
  [/(^|\s)(undefined|null|NaN|\[object Object\])(\s|$)/, 'leaked runtime value'],
];

/** Framework and tool defaults that mean nobody wrote a real title. */
const DEFAULT_TITLES = /^(untitled|untitled document|title|page title|new page|document|home ?page|index|react app|vite app|vue app|create next app|angular|my app|app|welcome)$/i;

/** Alt text that names the medium instead of describing the content. */
const GENERIC_ALT = /^(image|img|photo|photograph|picture|pic|graphic|icon|logo|banner|spacer|alt|alt text|placeholder|thumbnail|null|image of|picture of)$/i;
const FILENAME_ALT = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$|^(img|image|dsc|screenshot|photo)[-_ ]?\d+/i;
/** Alt that describes an image as decorative means it should be alt="" so screen readers skip it. */
const SELF_DESCRIBED_DECORATIVE = /\b(decorative|decoration|spacer|presentational)\b/i;

/** Link text that gives no purpose out of context. ("Submit" or "Continue" on a form button is fine.) */
const GENERIC_LINK = /^(click here|click|here|read more|more|learn more|details|link|this|go)$/i;
const GENERIC_BUTTON = /^(button|click|click here|here)$/i;

export function placeholderReason(text: string): string | null {
  for (const [re, reason] of PLACEHOLDER) if (re.test(text)) return reason;
  return null;
}

/** 2.4.2: a title must exist and describe the page, which a placeholder or framework default cannot. */
export function titleFindings(title: string, h1: string | null): Finding[] {
  const t = title.trim();
  const out: Finding[] = [];
  const add = (severity: Severity, reason: string) => out.push({ sc: '2.4.2', severity, role: 'title', name: t, reason });

  if (!t) add('fail', 'empty <title>');
  else if (placeholderReason(t)) add('fail', placeholderReason(t)!);
  else if (DEFAULT_TITLES.test(t)) add('fail', 'framework/tool default title');
  else if (t.length < 4) add('fail', 'too short to describe the page');
  else if (h1 && !sharesSignificantWord(t, h1)) add('review', `title shares no words with the h1 "${h1}"`);
  return out;
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'your', 'from', 'this', 'that', 'page', 'home', 'welcome']);
function sharesSignificantWord(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((w) => !STOP_WORDS.has(w)) ?? []);
  const wa = words(a);
  return [...words(b)].some((w) => wa.has(w));
}

/** One accessible node, parsed from Playwright's ARIA snapshot (the tree assistive technology gets). */
interface AxNode {
  role: string;
  name: string;
}

const LINE = /^\s*- (?<role>[a-z]+)(?: "(?<name>(?:[^"\\]|\\.)*)")?(?<rest>.*)$/;

export async function accessibleNodes(page: Page): Promise<AxNode[]> {
  const snapshot = await page.locator('body').ariaSnapshot();
  const nodes: AxNode[] = [];
  for (const line of snapshot.split('\n')) {
    const m = LINE.exec(line);
    if (!m?.groups) continue;
    const { role, rest } = m.groups;
    let name = m.groups.name?.replace(/\\"/g, '"') ?? '';
    // Text nodes and values appear as `- text: Foo` / `- textbox "Label": value`.
    if (role === 'text') name = rest.replace(/^:\s*/, '').replace(/^"|"$/g, '');
    nodes.push({ role, name });
  }
  return nodes;
}

const CONTROL_ROLES = new Set(['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'option']);
const FIELD_ROLES = new Set(['textbox', 'searchbox', 'spinbutton', 'combobox', 'listbox', 'slider']);

/** Audit every name in the accessibility tree. Each finding names the SC it bears on. */
export function nameFindings(nodes: AxNode[]): Finding[] {
  const out: Finding[] = [];
  for (const { role, name } of nodes) {
    const n = name.trim();
    const add = (sc: string, severity: Severity, reason: string) => out.push({ sc, severity, role, name: n, reason });
    const placeholder = n && placeholderReason(n);

    if (role === 'img') {
      if (placeholder) add('1.1.1', 'fail', placeholder);
      else if (FILENAME_ALT.test(n)) add('1.1.1', 'fail', 'filename used as alt text');
      else if (SELF_DESCRIBED_DECORATIVE.test(n)) add('1.1.1', 'fail', 'decorative image should have alt="" (it is announced instead)');
      else if (GENERIC_ALT.test(n)) add('1.1.1', 'fail', 'alt names the medium, not the content');
    } else if (role === 'heading') {
      if (placeholder) add('2.4.6', 'fail', placeholder);
    } else if (CONTROL_ROLES.has(role)) {
      if (placeholder) add('4.1.2', 'fail', placeholder);
      else if (role === 'link' && GENERIC_LINK.test(n)) add('2.4.4', 'review', 'generic link text; confirm purpose is clear from context');
      else if (GENERIC_BUTTON.test(n)) add('4.1.2', 'review', 'generic button name; confirm purpose is clear from context');
    } else if (FIELD_ROLES.has(role)) {
      if (placeholder) add('3.3.2', 'fail', placeholder);
    } else if (role === 'text' && placeholder) {
      // Leaked placeholders in body copy aren't a specific SC, but they still mean the content is broken.
      add('content', 'fail', placeholder);
    }
  }
  // De-duplicate repeated components (e.g. the same icon on 8 cards).
  const seen = new Set<string>();
  return out.filter((f) => {
    const key = `${f.sc}|${f.role}|${f.name}|${f.reason}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

export const formatFinding = (f: Finding) => `${f.role} "${f.name}": ${f.reason}`;
