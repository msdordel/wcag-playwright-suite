import { test as base, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Result } from 'axe-core';
import { axeTags, GLOBAL_EXCLUDES, WCAG_TARGET } from './config';
import { applyWaivers } from './waivers';

/**
 * Traceability helper: tags a test with the success criteria it provides evidence for.
 *   test('...', sc('2.4.7', '2.4.11'), async ({ page }) => { ... })
 * - tags (`@sc-2.4.7`) let you run by criterion: npm run test:sc -- @sc-2.4.7
 * - annotations feed the WCAG coverage reporter
 */
export function sc(...criteria: string[]) {
  return {
    tag: criteria.map((c) => `@sc-${c}`),
    annotation: criteria.map((c) => ({ type: 'wcag', description: c })),
  };
}

export interface ScanOptions {
  /** Restrict the scan to a region, e.g. an open dialog. */
  include?: string[];
  exclude?: string[];
  /** Used in attachment names; defaults to the URL path. */
  label?: string;
}

type A11yFixtures = {
  /** Run an axe scan for the configured WCAG target and fail on any un-waived violation. */
  axe: (opts?: ScanOptions) => Promise<void>;
};

export const test = base.extend<A11yFixtures>({
  axe: async ({ page }, use, testInfo) => {
    await use(async (opts = {}) => {
      let builder = new AxeBuilder({ page }).withTags(axeTags());
      for (const s of opts.include ?? []) builder = builder.include(s);
      for (const s of [...GLOBAL_EXCLUDES, ...(opts.exclude ?? [])]) builder = builder.exclude(s);

      const results = await builder.analyze();
      const { blocking, waived } = applyWaivers(results.violations, page.url());
      const label = opts.label ?? new URL(page.url()).pathname;

      await testInfo.attach(`axe ${label}.json`, {
        contentType: 'application/json',
        body: JSON.stringify(
          { url: page.url(), target: WCAG_TARGET, blocking, waived, incomplete: results.incomplete },
          null,
          2,
        ),
      });
      // "incomplete" = axe could not decide (e.g. contrast over a background image).
      // These items are not failures. They go on the manual review queue.
      if (results.incomplete.length) {
        testInfo.annotations.push({
          type: 'needs-manual-review',
          description: results.incomplete.map((r) => `${r.id} (${r.nodes.length})`).join(', '),
        });
      }
      for (const w of waived) {
        testInfo.annotations.push({ type: 'waived', description: `${w.rule} x${w.nodes} — ${w.ticket}` });
      }

      expect.soft(blocking, formatViolations(label, blocking)).toEqual([]);
    });
  },
});

export { expect };

/** Navigate and wait until the page is settled enough to audit. */
export async function gotoStable(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  // Both waits are capped: third-party embeds (video players, social widgets) can delay the load
  // event or keep the network busy indefinitely, and the page is testable well before they finish.
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
}

function formatViolations(label: string, violations: Result[]): string {
  if (!violations.length) return '';
  const lines = violations.map((v) => {
    const wcag = v.tags.filter((t) => /^wcag\d{3,}$/.test(t)).map((t) => t.replace(/^wcag(\d)(\d)(\d+)$/, '$1.$2.$3'));
    const shown = v.nodes.slice(0, 5).map((n) => `      - ${n.target.join(' ')}`);
    if (v.nodes.length > 5) shown.push(`      - …and ${v.nodes.length - 5} more`);
    const nodes = shown.join('\n');
    return `  [${v.impact}] ${v.id} (SC ${wcag.join(', ') || 'n/a'}): ${v.help}\n    ${v.helpUrl}\n${nodes}`;
  });
  return `${violations.length} WCAG violation(s) on ${label}:\n${lines.join('\n')}`;
}
