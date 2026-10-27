import { test, expect, gotoStable, sc } from '../../src/a11y/fixtures';
import { accessibleNodes, nameFindings, formatFinding } from '../../src/a11y/content-quality';
import { PAGES } from '../../data/pages';

/**
 * Names that exist but say nothing. axe passes alt="decorative icon", alt="cake.png", or a heading
 * reading "[INSERT HEADING]" because a name is present. These checks read the accessibility tree
 * the way a screen-reader user hears it.
 */
const SCS = ['1.1.1', '2.4.4', '2.4.6', '3.3.2', '4.1.2'];

for (const p of PAGES) {
  const states = [{ name: 'default state', setup: async () => {} }, ...(p.states ?? [])];

  for (const state of states) {
    test(`meaningful names: ${p.name} – ${state.name}`, sc(...SCS), async ({ page }, testInfo) => {
      await gotoStable(page, p.path);
      await state.setup(page);

      const findings = nameFindings(await accessibleNodes(page));
      for (const scId of [...SCS, 'content']) {
        const fails = findings.filter((f) => f.sc === scId && f.severity === 'fail').map(formatFinding);
        const label = scId === 'content' ? 'Placeholder or template text in visible content' : `${scId} meaningless accessible name`;
        expect.soft(fails, label).toEqual([]);
      }
      for (const f of findings.filter((f) => f.severity === 'review')) {
        testInfo.annotations.push({ type: 'needs-manual-review', description: `${f.sc} ${formatFinding(f)}` });
      }
    });
  }
}
