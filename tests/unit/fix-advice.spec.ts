import { test, expect } from '@playwright/test';
import { adviceFor } from '../../src/reporters/fix-advice';
import { findingsFrom } from '../../src/reporters/failure-details';

/** Each failure message the suite produces should get its specific advice, not the generic fallback. */
const advise = (msg: string, scs: string[] = []) => adviceFor(findingsFrom([msg], scs)[0]);

test('axe rules get rule-specific advice and keep the rule link', () => {
  const msg = [
    '1 WCAG violation(s) on Cart:',
    '  [critical] image-alt (SC 1.1.1): Images must have alternative text',
    '    https://dequeuniversity.com/rules/axe/4.14/image-alt?application=playwright',
    '      - img',
  ].join('\n');
  const a = advise(msg);
  expect(a.text).toMatch(/alt=""/);
  expect(a.link).toContain('image-alt');
});

test("the suite's own checks get specific advice", () => {
  const cases: [string, RegExp][] = [
    ['1.4.10 Reflow: content scrolls horizontally at 320 CSS px', /max-width: 100%/],
    ['1.4.12 Text Spacing: text clipped after increasing line, letter, word and paragraph spacing', /line-height 1\.5/],
    ['2.1.1 Keyboard: visible interactive elements never received focus', /tabindex="-1"/],
    ['2.4.1 Bypass Blocks: first Tab stop is not a "skip to content" link', /Skip to main content/],
    ['2.4.7 Focus Visible: skip link stays off-screen when focused', /position: static/],
    ['2.4.7 Focus Visible: no visible change when focused', /:focus-visible/],
    ['2.4.11 Focus Not Obscured: focused element entirely hidden', /scroll-padding/],
    ['2.4.2 Gefälscht CompuTech › Cart shares its title with Gefälscht CompuTech › Home', /unique title/],
    ['3.1.1 Language of Page: <html lang> is missing or not a valid language code on Home', /lang="en"/],
    ['1.3.1 Info and Relationships: page must have exactly one main landmark (Home)', /<main>/],
    ['4.1.2 dialog needs an accessible name (aria-labelledby → heading)', /aria-labelledby/],
    ['4.1.2 dialog must be aria-modal or opened with showModal()', /showModal/],
  ];
  for (const [msg, expected] of cases) expect(advise(msg).text, msg).toMatch(expected);
});

test('test errors are flagged as not accessibility findings', () => {
  expect(advise('Test timeout of 30000ms exceeded.', ['1.3.1']).text).toMatch(/Not an accessibility finding/);
});

test('unknown wording falls back to the W3C page for the criterion', () => {
  const a = advise('2.5.3 something new');
  expect(a.link).toBe('https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html');
});
