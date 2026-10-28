import type { Page } from '@playwright/test';
import { test, expect, gotoStable, sc } from '../../src/a11y/fixtures';
import {
  tabThrough, unreachableFocusables, hasVisibleFocusIndicator, isEntirelyObscured, type FocusStop,
} from '../../src/a11y/keyboard';
import { PAGES, unsupportedReason } from '../../data/pages';

const describe = (s: FocusStop) => `${s.role ?? s.tag} "${s.name}"`;

/**
 * Layer 2: tabs through each page once and checks every focus stop.
 * Each criterion has its own soft assertion, so one run reports all failures at once.
 */
for (const p of PAGES) {
  test(
    `keyboard traversal: ${p.name}`,
    sc('2.1.1', '2.1.2', '2.4.3', '2.4.7', '2.4.11', '3.2.1'),
    async ({ page, browserName }, testInfo) => {
      const unsupported = unsupportedReason(p, browserName);
      test.skip(!!unsupported, unsupported);
      // Two screenshots per focus stop; pages with 100+ stops need more than 30s on CI runners.
      test.slow();
      await gotoStable(page, p.path);
      const startUrl = page.url();
      const popups: Page[] = [];
      page.context().on('page', (pg) => popups.push(pg));

      const noIndicator: string[] = [];
      const obscured: string[] = [];

      const { stops, trappedAt, exhausted } = await tabThrough(page, {
        onStop: async (stop) => {
          if (await isEntirelyObscured(page, stop)) obscured.push(describe(stop));
          if (!(await hasVisibleFocusIndicator(page, stop))) noIndicator.push(describe(stop));
        },
      });

      expect(stops.length, '2.1.1 Keyboard: page has no keyboard-focusable elements').toBeGreaterThan(0);
      if (exhausted) testInfo.annotations.push({ type: 'warning', description: 'Hit stop limit; traversal incomplete' });

      expect.soft(trappedAt && describe(trappedAt), '2.1.2 No Keyboard Trap: focus cycled without leaving').toBeNull();
      expect.soft(await unreachableFocusables(page), '2.1.1 Keyboard: visible interactive elements never received focus').toEqual([]);
      expect.soft(noIndicator, '2.4.7 Focus Visible: no visible change when focused').toEqual([]);
      expect.soft(obscured, '2.4.11 Focus Not Obscured: focused element entirely hidden').toEqual([]);
      expect.soft(page.url(), '3.2.1 On Focus: focus alone navigated the page').toBe(startUrl);
      expect.soft(popups.length, '3.2.1 On Focus: focus alone opened a window').toBe(0);

      // 2.4.3: no tool can judge whether an order is "meaningful". Snapshotting the order
      // means any change shows up as a diff a human must approve (npm run update-tab-order).
      expect
        .soft(stops.map(describe).join('\n'), '2.4.3 Focus Order: sequence changed; review, then update snapshot')
        .toMatchSnapshot(`${p.id}-tab-order.txt`);
    },
  );
}
