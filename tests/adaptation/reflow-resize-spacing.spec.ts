import { test, expect, gotoStable, sc } from '../../src/a11y/fixtures';
import { horizontalOverflow, clippedText, TEXT_SPACING_CSS } from '../../src/a11y/adaptation';
import { PAGES } from '../../data/pages';

/**
 * Layer 3: visual adaptation. Checks that content survives zoom, reflow, and the
 * text-spacing overrides that low-vision and dyslexic users apply.
 */
for (const p of PAGES) {
  test.describe(`adaptation: ${p.name}`, () => {
    test('1.4.10 reflows at 320 CSS px without horizontal scrolling', sc('1.4.10'), async ({ page }) => {
      // 320px wide = 1280px viewport at 400% zoom, which is the SC's reference case.
      await page.setViewportSize({ width: 320, height: 256 });
      await gotoStable(page, p.path);
      expect(await horizontalOverflow(page), 'content requires horizontal scrolling at 320px').toEqual([]);
    });

    test('1.4.4 usable at 200% zoom', sc('1.4.4'), async ({ page }) => {
      // Page zoom: 200% of a 1280px window = 640 CSS px.
      await page.setViewportSize({ width: 640, height: 400 });
      await gotoStable(page, p.path);
      expect.soft(await clippedText(page), 'text clipped at 200% page zoom').toEqual([]);

      // Text-only zoom: root font size doubled.
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect.soft(await clippedText(page), 'text clipped at 200% text-only zoom').toEqual([]);
    });

    test('1.4.12 tolerates text-spacing overrides', sc('1.4.12'), async ({ page }) => {
      await gotoStable(page, p.path);
      await page.addStyleTag({ content: TEXT_SPACING_CSS });
      expect(await clippedText(page), 'text clipped after applying 1.4.12 spacing').toEqual([]);
    });

    test('1.3.4 works in both orientations', sc('1.3.4'), async ({ page }) => {
      for (const [width, height] of [[390, 844], [844, 390]]) {
        await page.setViewportSize({ width, height });
        await gotoStable(page, p.path);
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.getByText(/rotate (your )?(device|screen)/i)).toHaveCount(0);
      }
    });
  });
}
