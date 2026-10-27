import { test, expect, gotoStable, sc } from '../../src/a11y/fixtures';
import { PAGES } from '../../data/pages';
import { tabKey } from '../../src/a11y/keyboard';

/**
 * 2.4.1 Bypass Blocks. WCAG also accepts landmarks and headings, which axe checks.
 * Many strict orgs require a working skip link as well, so this test enforces one.
 */
for (const p of PAGES) {
  test(`skip link works: ${p.name}`, sc('2.4.1', '2.4.7'), async ({ page }) => {
    await gotoStable(page, p.path);
    await page.keyboard.press(tabKey(page));

    const skip = page.locator(':focus');
    await expect(skip, 'first Tab stop must be a skip link').toHaveAccessibleName(/skip to (main )?content/i);
    await expect(skip, 'skip link must become visible when focused').toBeInViewport();

    await page.keyboard.press('Enter');
    const focusInMain = await page.evaluate(() => {
      const main = document.querySelector('main, [role="main"]');
      return !!main && (main === document.activeElement || main.contains(document.activeElement));
    });
    expect(focusInMain, 'activating skip link must move focus into <main> (main may need tabindex="-1")').toBe(true);
  });
}
