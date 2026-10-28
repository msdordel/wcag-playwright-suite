import { test, expect } from '@playwright/test';
import { findingsFrom, understandingUrl } from '../../src/reporters/failure-details';

/** Guards the report's failure parsing against the message formats the suite produces. */

test('axe summary becomes one finding per rule, with criterion, nodes and rule link', () => {
  const msg = [
    'Error: 2 WCAG violation(s) on Cart:',
    '  [serious] color-contrast (SC 1.4.3): Elements must meet minimum color contrast ratio thresholds',
    '    https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=playwright',
    '      - #header > p',
    '      - #container > h2',
    '      - …and 9 more',
    '  [serious] link-name (SC 2.4.4, 4.1.2): Links must have discernible text',
    '    https://dequeuniversity.com/rules/axe/4.14/link-name?application=playwright',
    '      - a[href="desktops.php"]',
  ].join('\n');
  const [contrast, link] = findingsFrom([msg]);
  expect(contrast).toMatchObject({
    scs: ['1.4.3'],
    what: 'Elements must meet minimum color contrast ratio thresholds',
    details: ['#header > p', '#container > h2'],
    more: 9,
    source: 'axe color-contrast · serious',
    link: 'https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=playwright',
  });
  expect(link.scs).toEqual(['2.4.4', '4.1.2']);
});

test('SC-prefixed list assertion: criterion name is dropped from the description, elements kept', () => {
  const msg = [
    'Error: 2.4.7 Focus Visible: no visible change when focused',
    '',
    'expect(received).toEqual(expected) // deep equality',
    '',
    '- Expected  - 1',
    '+ Received  + 4',
    '',
    '- Array []',
    '+ Array [',
    '+   "a \\"Home\\"",',
    '+   "input \\"From station\\"",',
    '+ ]',
  ].join('\n');
  expect(findingsFrom([msg])).toEqual([
    { scs: ['2.4.7'], what: 'No visible change when focused', details: ['a "Home"', 'input "From station"'], more: 0 },
  ]);
});

test('multi-line strings in the diff are rejoined', () => {
  const msg = ['1.4.4 Resize Text: text clipped at 200% page zoom', '+ Array [', '+   "div: \\"10% off Crater', '+', '+ Book select\\"",', '+ ]'].join('\n');
  expect(findingsFrom([msg])[0].details).toEqual(['div: "10% off Crater Book select"']);
});

test('locator assertion reports what was found and expected', () => {
  const msg = [
    '3.1.1 Language of Page: <html lang> is missing or not a valid language code on Mars Commuter › Home',
    '',
    'Locator: locator(\'html\')',
    'Expected pattern: /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/',
    'Received string:  ""',
  ].join('\n');
  const [f] = findingsFrom([msg]);
  expect(f.scs).toEqual(['3.1.1']);
  expect(f.what).toBe('<html lang> is missing or not a valid language code on Mars Commuter › Home');
  expect(f.details).toEqual(['Found: (empty)', 'Expected: /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/']);
});

test('a message with no criterion falls back to the test tags; content quality has none', () => {
  expect(findingsFrom(['2.4.1 skip link must move focus'], ['2.4.1', '2.4.7'])[0].scs).toEqual(['2.4.1']);
  expect(findingsFrom(['Focus did not move'], ['2.4.1'])[0].scs).toEqual(['2.4.1']);
  expect(findingsFrom(['Content quality (not a WCAG criterion): placeholder text'], ['1.1.1'])[0].scs).toEqual([]);
});

test('timeouts and closed pages are test errors, not WCAG failures', () => {
  for (const msg of [
    'Test timeout of 30000ms exceeded.',
    'Error: Locator.evaluate: Test timeout of 30000ms exceeded.',
    'Error: page.goto: SEC_ERROR_UNKNOWN_ISSUER',
    'Error: page.goto: Unacceptable TLS certificate',
    'Page.evaluate: Target page, context or browser has been closed',
  ]) {
    expect(findingsFrom([msg], ['1.3.1'])[0]).toMatchObject({ scs: [], source: 'test error' });
  }
});

test('a timeout and the action it interrupted are one test error', () => {
  const f = findingsFrom(['Test timeout of 30000ms exceeded.', 'Error: page.goto: net::ERR_TIMED_OUT at https://example.com/']);
  expect(f).toHaveLength(1);
  expect(f[0].details).toEqual(['page.goto: net::ERR_TIMED_OUT at https://example.com/']);
});

test('long element lists are capped with a count of the rest', () => {
  const items = Array.from({ length: 12 }, (_, i) => `+   "a \\"Link ${i}\\"",`);
  const [f] = findingsFrom([['2.4.7 Focus Visible: no visible change when focused', '+ Array [', ...items, '+ ]'].join('\n')]);
  expect(f.details).toHaveLength(8);
  expect(f.more).toBe(4);
});

test('criteria link to the W3C Understanding page', () => {
  expect(understandingUrl('1.4.3')).toBe('https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html');
  expect(understandingUrl('4.1.2')).toBe('https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html');
  expect(understandingUrl('2.4.11')).toBe('https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html');
});
