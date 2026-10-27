import { test, expect, gotoStable, sc } from '../../src/a11y/fixtures';

/**
 * 1.4.13 Content on Hover or Focus. Tooltips, popovers, and hover menus must be:
 *   dismissible (Escape closes them without moving pointer or focus),
 *   hoverable (the pointer can move onto the popup without it closing), and
 *   persistent (they stay open until dismissed or until hover/focus leaves).
 * ADAPT: one entry per hover/focus-triggered component.
 */
// The Deque demo has no hover- or focus-triggered popups. Add one entry per component when your app does.
const CASES: { name: string; path: string; trigger: { role: 'button' | 'link'; name: RegExp } }[] = [];

for (const c of CASES) {
  test.describe(`1.4.13 ${c.name}`, () => {
    test.beforeEach(async ({ page }) => gotoStable(page, c.path));

    test('appears on keyboard focus, not only hover', sc('1.4.13', '2.1.1'), async ({ page }) => {
      await page.getByRole(c.trigger.role, { name: c.trigger.name }).focus();
      await expect(page.getByRole('tooltip')).toBeVisible();
    });

    test('dismissible with Escape', sc('1.4.13'), async ({ page }) => {
      await page.getByRole(c.trigger.role, { name: c.trigger.name }).hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('tooltip')).toBeHidden();
    });

    test('hoverable: pointer can move onto the popup', sc('1.4.13'), async ({ page }) => {
      await page.getByRole(c.trigger.role, { name: c.trigger.name }).hover();
      const tip = page.getByRole('tooltip');
      await tip.hover();
      await page.waitForTimeout(1_000); // the popup must persist, not close on a delay
      await expect(tip).toBeVisible();
    });
  });
}
