import { test, expect } from '@playwright/test';
import { titleFindings, nameFindings } from '../../src/a11y/content-quality';

/** Guards the heuristics themselves: every pattern change must keep these verdicts. */
const fails = (role: string, name: string) =>
  nameFindings([{ role, name }]).filter((f) => f.severity === 'fail').map((f) => f.reason);
const reviews = (role: string, name: string) =>
  nameFindings([{ role, name }]).filter((f) => f.severity === 'review').map((f) => f.reason);
const titleFails = (t: string, h1: string | null = null) => titleFindings(t, h1).filter((f) => f.severity === 'fail');

test.describe('titles', () => {
  for (const bad of ['[INSERT TITLE HERE]', '', 'React App', 'Untitled', 'Vite App', '{{ pageTitle }}', 'undefined', 'Lorem ipsum', 'TODO title'])
    test(`rejects ${JSON.stringify(bad)}`, () => expect(titleFails(bad)).not.toEqual([]));

  for (const good of ['Recipe Dashboard – Broken Workshop', 'Apply for a permit | City of Springfield', 'Contact us'])
    test(`accepts ${JSON.stringify(good)}`, () => expect(titleFails(good)).toEqual([]));

  test('flags title unrelated to h1 for review only', () => {
    const f = titleFindings('Acme Corp', 'Apply for a building permit');
    expect(f.map((x) => x.severity)).toEqual(['review']);
  });
});

test.describe('image alt', () => {
  for (const bad of ['decorative icon', 'cake.png', 'IMG_2041', 'DSC-0042', 'image', 'Photo', 'spacer', '[insert alt]'])
    test(`rejects ${JSON.stringify(bad)}`, () => expect(fails('img', bad)).not.toEqual([]));

  for (const good of ['Chocolate cake on a white plate', 'City seal', 'Edit', 'Bar chart of monthly ratings'])
    test(`accepts ${JSON.stringify(good)}`, () => expect(fails('img', good)).toEqual([]));
});

test.describe('controls and text', () => {
  test('placeholder button name fails', () => expect(fails('button', '[Insert label]')).not.toEqual([]));
  test('template leak in text fails', () => expect(fails('text', 'Hello {{ user.name }}')).not.toEqual([]));
  test('"undefined" leak in text fails', () => expect(fails('text', 'Welcome, undefined')).not.toEqual([]));

  for (const fine of ['Submit', 'Continue', 'OK', 'Save', 'Cook Chocolate Cake'])
    test(`button ${JSON.stringify(fine)} is not flagged`, () => {
      expect(fails('button', fine)).toEqual([]);
      expect(reviews('button', fine)).toEqual([]);
    });

  test('"Read more" link goes to review, not fail', () => {
    expect(fails('link', 'Read more')).toEqual([]);
    expect(reviews('link', 'Read more')).not.toEqual([]);
  });

  for (const legit of ['Hearing date: TBD', 'Format: XXX-XX-XXXX', 'Null and void'])
    test(`legit text ${JSON.stringify(legit)} is not flagged`, () => expect(fails('text', legit)).toEqual([]));
});
