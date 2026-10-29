import { test, expect, gotoStable, sc } from '../../src/a11y/fixtures';
import { tabThrough } from '../../src/a11y/keyboard';
import { accessibilityTree, announce, focusedNode, openScreenReader, transcript } from '../../src/a11y/screen-reader';
import { PAGES } from '../../data/pages';

/**
 * Simulated screen reader (src/a11y/screen-reader.ts). For each page and UI state it records what a
 * listener would hear: the quick-navigation lists, the browse-mode reading order and, in the default
 * state, each Tab stop. The transcript is a reviewed snapshot, so any change in what is announced shows
 * up as a diff a human approves (npm run update-transcripts). Listen to one: npm run read-aloud -- <page-id>.
 */
test.skip(({ browserName }) => browserName !== 'chromium', "Reads Chromium's accessibility tree through the DevTools protocol");

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

for (const p of PAGES) {
  const states = [{ name: 'default state', setup: async () => {} }, ...(p.states ?? [])];

  for (const [i, state] of states.entries()) {
    test(`screen reader: ${p.name} – ${state.name}`, sc('1.3.2', '4.1.2'), async ({ page }, testInfo) => {
      await gotoStable(page, p.path);
      await state.setup(page);
      const cdp = await openScreenReader(page);
      // Read the tree before tabbing, so focus-triggered changes (menus, tooltips) don't leak in.
      const tree = await accessibilityTree(cdp);

      // Tab announcements in the default state only; dialog focus is covered by tests/components.
      let tabStops: string[] | undefined;
      const roleless: string[] = [];
      const nameless: string[] = [];
      if (i === 0) {
        test.slow(); // one DevTools round trip per focus stop
        tabStops = [];
        await tabThrough(page, {
          onStop: async () => {
            const n = await focusedNode(cdp);
            if (!n) return;
            const said = announce(n);
            tabStops!.push(said);
            if (n.role === 'generic') roleless.push(said);
            else if (said.includes('⚠ no name')) nameless.push(said);
          },
        });
      }

      const text = transcript(await page.title(), tree, tabStops);
      await testInfo.attach('screen-reader-transcript.txt', { body: text, contentType: 'text/plain' });

      expect.soft(roleless, '4.1.2 Name, Role, Value: Tab stops a screen reader announces without a role').toEqual([]);
      expect.soft(nameless, '4.1.2 Name, Role, Value: Tab stops a screen reader announces without a name').toEqual([]);
      expect
        .soft(text, '1.3.2 Meaningful Sequence: what a screen reader announces changed; review, then run npm run update-transcripts')
        .toMatchSnapshot(`${p.id}${i ? `-${slug(state.name)}` : ''}-screen-reader.txt`);
    });
  }
}
