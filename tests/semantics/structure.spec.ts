import { test, expect, gotoStable, sc } from '../../src/a11y/fixtures';
import { titleFindings, formatFinding } from '../../src/a11y/content-quality';
import { PAGES, SITES, pagesOf } from '../../data/pages';

for (const site of SITES) {
  /**
   * 2.4.2 Page Titled: the title must *describe* the page. Presence alone isn't enough:
   * "[INSERT TITLE HERE]", "React App" and "Untitled" all exist and all fail.
   * Uniqueness is judged within a site: two sites may legitimately share a page title.
   */
  test(`2.4.2 every page has a descriptive, unique title: ${site.name}`, sc('2.4.2'), async ({ page }, testInfo) => {
    const titles = new Map<string, string>();
    for (const p of pagesOf(site)) {
      await gotoStable(page, p.path);
      const title = (await page.title()).trim();
      const h1 = await page.getByRole('heading', { level: 1 }).first().textContent({ timeout: 1_000 }).catch(() => null);

      const findings = titleFindings(title, h1?.trim() ?? null);
      expect.soft(findings.filter((f) => f.severity === 'fail').map(formatFinding), `2.4.2 ${p.name}: title is not descriptive`).toEqual([]);
      for (const f of findings.filter((f) => f.severity === 'review')) {
        testInfo.annotations.push({ type: 'needs-manual-review', description: `2.4.2 ${p.name}: ${formatFinding(f)}` });
      }

      const clash = titles.get(title);
      expect.soft(clash, `2.4.2 ${p.name} shares its title with ${clash}`).toBeUndefined();
      titles.set(title, p.name);
    }
  });

  /**
   * 3.2.3 / 3.2.6: shared regions must keep the same structure and order on every page.
   * Comparing ARIA snapshots checks what assistive technology users get, not CSS layout.
   * Strict equality goes beyond the SC, which allows items to be added. Relax it if needed.
   */
  for (const region of site.consistentRegions ?? []) {
    test(`${region.sc} ${site.name}: ${region.name} is consistent across pages`, sc(region.sc), async ({ page }) => {
      const [first, ...rest] = pagesOf(site);
      await gotoStable(page, first.path);
      const baseline = await region.locate(page).ariaSnapshot();

      for (const p of rest) {
        await gotoStable(page, p.path);
        const snap = await region.locate(page).ariaSnapshot();
        expect.soft(snap, `${region.sc} ${region.name} on "${p.name}" differs from "${first.name}"`).toBe(baseline);
      }
    });
  }
}

for (const p of PAGES) {
  test(`3.1.1 page language is declared and valid: ${p.name}`, sc('3.1.1'), async ({ page }) => {
    await gotoStable(page, p.path);
    await expect(page.locator('html'), `3.1.1 Language of Page: <html lang> is missing or not a valid language code on ${p.name}`).toHaveAttribute('lang', /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/);
  });

  test(`1.3.1 exposes a main landmark and a level-1 heading: ${p.name}`, sc('1.3.1', '2.4.6'), async ({ page }) => {
    await gotoStable(page, p.path);
    await expect.soft(page.getByRole('main'), `1.3.1 Info and Relationships: page must have exactly one main landmark (${p.name})`).toHaveCount(1);
    await expect.soft(page.getByRole('heading', { level: 1 }), `1.3.1 Info and Relationships: page has no level-1 heading (${p.name})`).not.toHaveCount(0);
  });
}
