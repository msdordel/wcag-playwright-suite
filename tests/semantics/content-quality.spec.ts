import { test, expect, gotoStable, sc } from '../../src/a11y/fixtures';
import { accessibleNodes, nameFindings, formatFinding } from '../../src/a11y/content-quality';
import { PAGES } from '../../data/pages';

/**
 * Names that exist but say nothing. axe passes alt="decorative icon", alt="cake.png", or a heading
 * reading "[INSERT HEADING]" because a name is present. These checks read the accessibility tree
 * the way a screen-reader user hears it.
 */
const SCS = ['1.1.1', '2.4.4', '2.4.6', '3.3.2', '4.1.2'];
const SC_PROBLEM: Record<string, string> = {
  '1.1.1': 'Non-text Content: image alt text does not describe the image',
  '2.4.4': 'Link Purpose: link text does not say where the link goes',
  '2.4.6': 'Headings and Labels: heading or label does not describe its content',
  '3.3.2': 'Labels or Instructions: form field label is meaningless',
  '4.1.2': 'Name, Role, Value: control has a meaningless accessible name',
};

for (const p of PAGES) {
  const states = [{ name: 'default state', setup: async () => {} }, ...(p.states ?? [])];

  for (const state of states) {
    test(`meaningful names: ${p.name} – ${state.name}`, sc(...SCS), async ({ page }, testInfo) => {
      await gotoStable(page, p.path);
      await state.setup(page);

      const findings = nameFindings(await accessibleNodes(page));
      for (const scId of [...SCS, 'content']) {
        const fails = findings.filter((f) => f.sc === scId && f.severity === 'fail').map(formatFinding);
        const label = scId === 'content' ? 'Content quality (not a WCAG criterion): placeholder or template text in visible content' : `${scId} ${SC_PROBLEM[scId]}`;
        expect.soft(fails, label).toEqual([]);
      }
      for (const f of findings.filter((f) => f.severity === 'review')) {
        testInfo.annotations.push({ type: 'needs-manual-review', description: `${f.sc} ${formatFinding(f)}` });
      }
    });
  }
}
