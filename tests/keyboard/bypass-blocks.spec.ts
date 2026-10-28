import { test, expect, gotoStable, sc } from '../../src/a11y/fixtures';
import { PAGES, unsupportedReason } from '../../data/pages';
import { tabKey } from '../../src/a11y/keyboard';

/**
 * 2.4.1 Bypass Blocks. WCAG also accepts landmarks and headings, which axe checks.
 * Many strict orgs require a working skip link as well, so this test enforces one.
 */
for (const p of PAGES) {
  test(`skip link works: ${p.name}`, sc('2.4.1', '2.4.7'), async ({ page, browserName }) => {
    const unsupported = unsupportedReason(p, browserName);
    test.skip(!!unsupported, unsupported);
    await gotoStable(page, p.path);
    await page.keyboard.press(tabKey(page));

    const skip = page.locator(':focus');
    await expect(skip, '2.4.1 Bypass Blocks: first Tab stop is not a "skip to content" link').toHaveAccessibleName(/skip to (main )?content/i);
    await expect(skip, '2.4.7 Focus Visible: skip link stays off-screen when focused').toBeInViewport();

    await page.keyboard.press('Enter');
    const focusInMain = await page.evaluate(() => {
      const main = document.querySelector('main, [role="main"]');
      return !!main && (main === document.activeElement || main.contains(document.activeElement));
    });
    expect(focusInMain, '2.4.1 Bypass Blocks: activating the skip link does not move focus into <main> (main may need tabindex="-1")').toBe(true);
  });
}
