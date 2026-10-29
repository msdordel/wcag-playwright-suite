import { test, expect } from '@playwright/test';
import { announce, quickNav, readingOrder, transcript, type SrNode } from '../../src/a11y/screen-reader';

/** Guards what the simulated reader says for each kind of node, using hand-built accessibility trees. */
const node = (role: string, name = '', props: SrNode['props'] = {}, children: SrNode[] = [], extra: Partial<SrNode> = {}): SrNode => ({
  role,
  name,
  props,
  children,
  ...extra,
});
const text = (t: string) => node('StaticText', t);

test('announcements follow name, role, states, value, description', () => {
  expect(announce(node('heading', 'Dashboard', { level: 1 }))).toBe('heading level 1, Dashboard');
  expect(announce(node('link', 'Home'))).toBe('Home, link');
  expect(announce(node('button', 'More', { expanded: false, hasPopup: 'menu' }))).toBe('More, button, collapsed, has menu popup');
  expect(announce(node('checkbox', 'Agree', { checked: 'true' }))).toBe('Agree, check box, checked');
  expect(announce(node('textbox', 'Email', { required: true, invalid: 'true' }, [], { description: 'We never share it' }))).toBe(
    'Email, edit, required, invalid entry, We never share it',
  );
  expect(announce(node('combobox', 'Size', {}, [], { value: 'Large' }))).toBe('Size, combo box, Large');
  expect(announce(node('dialog', 'Cook', { modal: true }))).toBe('Cook, dialog, modal');
  expect(announce(node('navigation', 'Main'))).toBe('navigation landmark, Main');
});

test('missing names and roles are flagged the way a listener would notice them', () => {
  expect(announce(node('image'))).toBe('⚠ no description, graphic');
  expect(announce(node('link'))).toBe('⚠ no name, link');
  expect(announce(node('generic', '', { focusable: true }, [node('image', 'Edit')]))).toBe('Edit ⚠ no role');
});

test('reading order indents landmarks and lists, and runs inline text together', () => {
  const root = node('RootWebArea', '', {}, [
    node('navigation', 'Main', {}, [node('list', '', {}, [node('listitem', '', {}, [node('link', 'Home', {}, [text('Home')])])])]),
    node('main', '', {}, [node('paragraph', '', {}, [text('Plain '), node('strong', '', {}, [text('bold')]), text(' text.')])]),
  ]);
  expect(readingOrder(root)).toEqual(['navigation landmark, Main', '  list with 1 items', '    Home, link', 'main landmark', '  Plain bold text.']);
});

test('quick navigation lists headings, landmarks, links and form fields', () => {
  const root = node('RootWebArea', '', {}, [
    node('main', '', {}, [node('heading', 'Cart', { level: 2 }), node('link', 'Checkout'), node('textbox', 'Search'), node('button', 'Go')]),
  ]);
  expect(quickNav(root)).toEqual({ headings: ['h2 Cart'], landmarks: ['main landmark'], links: ['Checkout'], formFields: ['Search, edit'] });
});

test('transcript has the title, every section, and numbered Tab stops', () => {
  const t = transcript('Cart – Shop', node('RootWebArea', '', {}, [node('heading', 'Cart', { level: 1 })]), ['Checkout, link']);
  expect(t).toContain('Page title: Cart – Shop');
  expect(t).toContain('## Headings (1)\n- h1 Cart');
  expect(t).toContain('## Tab order (what each Tab stop announces)\n1. Checkout, link');
  expect(transcript('', node('RootWebArea'))).toContain('Page title: ⚠ no title');
});
