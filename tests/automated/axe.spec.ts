import { test, gotoStable, sc } from '../../src/a11y/fixtures';
import { AXE_MAPPED_CRITERIA } from '../../src/a11y/wcag-criteria';
import { PAGES } from '../../data/pages';

/**
 * Layer 1: rule-based scan of every page and UI state.
 * Fast and broad, but it covers only about a third of WCAG. Passing it is necessary, not sufficient.
 */
for (const p of PAGES) {
  const meta = sc(...AXE_MAPPED_CRITERIA);
  if (p.critical) meta.tag.push('@critical');

  test.describe(`axe: ${p.name}`, () => {
    test('default state', { ...meta, tag: [...meta.tag, '@axe'] }, async ({ page, axe }) => {
      await gotoStable(page, p.path);
      await axe({ label: p.name });
    });

    for (const state of p.states ?? []) {
      test(`state: ${state.name}`, { ...meta, tag: [...meta.tag, '@axe'] }, async ({ page, axe }) => {
        await gotoStable(page, p.path);
        await state.setup(page);
        await axe({ label: `${p.name} – ${state.name}` });
      });
    }
  });
}
