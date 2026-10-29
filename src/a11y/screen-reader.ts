import type { CDPSession, Page } from '@playwright/test';

/**
 * A simulated screen reader. It reads the accessibility tree Chromium exposes to screen readers
 * (the same tree NVDA and JAWS receive from Chrome) and turns it into what a listener would hear.
 *
 * It is evidence, not a substitute: real screen readers add their own verbosity rules, browse-mode
 * quirks and live-region timing, and VoiceOver with Safari uses WebKit's tree. Keep the manual
 * passes in docs/MANUAL-TESTING.md for sign-off.
 */
export interface SrNode {
  role: string;
  name: string;
  description?: string;
  value?: string;
  props: Record<string, string | number | boolean | undefined>;
  children: SrNode[];
}

type AXValue = { value?: unknown };
interface AXNode {
  nodeId: string;
  ignored: boolean;
  role?: AXValue;
  name?: AXValue;
  description?: AXValue;
  value?: AXValue;
  properties?: { name: string; value: AXValue }[];
  childIds?: string[];
  backendDOMNodeId?: number;
}

const str = (v?: AXValue) => (v?.value === undefined || v.value === null ? '' : String(v.value)).replace(/\s+/g, ' ').trim();

function toNode(n: AXNode, byId: Map<string, AXNode>): SrNode[] {
  const kids = (n.childIds ?? []).flatMap((id) => (byId.has(id) ? toNode(byId.get(id)!, byId) : []));
  const role = str(n.role);
  // Ignored nodes (hidden content, presentational wrappers) are skipped; their visible children are kept.
  if (n.ignored || role === 'InlineTextBox' || role === 'ListMarker' || role === 'none') return kids;
  const props: SrNode['props'] = {};
  for (const p of n.properties ?? []) props[p.name] = p.value.value as SrNode['props'][string];
  // Text runs keep their edge spaces so "Plain <b>bold</b> text" reads as three words, not one.
  const name = role === 'StaticText' ? String(n.name?.value ?? '').replace(/\s+/g, ' ') : str(n.name);
  return [{ role, name, description: str(n.description) || undefined, value: str(n.value) || undefined, props, children: kids }];
}

/** The page's accessibility tree, rooted at the document. Chromium only (uses the DevTools protocol). */
export async function accessibilityTree(cdp: CDPSession): Promise<SrNode> {
  const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: AXNode[] };
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const root = nodes.find((n) => str(n.role) === 'RootWebArea') ?? nodes[0];
  return toNode(root, byId)[0] ?? { role: 'RootWebArea', name: '', props: {}, children: [] };
}

/** The accessibility node for the element that has focus (piercing shadow roots), or null. */
export async function focusedNode(cdp: CDPSession): Promise<SrNode | null> {
  const { result } = (await cdp.send('Runtime.evaluate', {
    expression: `(() => { let el = document.activeElement; while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement; return el === document.body ? null : el; })()`,
  })) as { result: { objectId?: string } };
  if (!result.objectId) return null;
  const { node } = (await cdp.send('DOM.describeNode', { objectId: result.objectId })) as { node: { backendNodeId: number } };
  const { nodes } = (await cdp.send('Accessibility.getPartialAXTree', { backendNodeId: node.backendNodeId, fetchRelatives: false })) as { nodes: AXNode[] };
  const own = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId) ?? nodes[0];
  if (!own) return null;
  // A focusable element Chromium ignores (e.g. a plain div with tabindex) is still announced by its text.
  const role = own.ignored ? 'generic' : str(own.role);
  const props: SrNode['props'] = {};
  for (const p of own.properties ?? []) props[p.name] = p.value.value as SrNode['props'][string];
  return { role, name: str(own.name), description: str(own.description) || undefined, value: str(own.value) || undefined, props, children: [] };
}

/** Words a screen reader uses for each role (NVDA-style); roles not listed are read as-is. */
const ROLE_WORDS: Record<string, string> = {
  link: 'link',
  button: 'button',
  image: 'graphic',
  img: 'graphic',
  textbox: 'edit',
  searchbox: 'search edit',
  checkbox: 'check box',
  radio: 'radio button',
  combobox: 'combo box',
  listbox: 'list box',
  option: 'option',
  slider: 'slider',
  spinbutton: 'spin button',
  switch: 'switch',
  tab: 'tab',
  tablist: 'tab list',
  tabpanel: 'tab panel',
  menu: 'menu',
  menubar: 'menu bar',
  menuitem: 'menu item',
  dialog: 'dialog',
  alertdialog: 'alert dialog',
  table: 'table',
  grid: 'grid',
  list: 'list',
  tree: 'tree view',
  treeitem: 'tree view item',
  progressbar: 'progress bar',
  Iframe: 'frame',
  separator: 'separator',
};

const LANDMARKS: Record<string, string> = {
  banner: 'banner landmark',
  navigation: 'navigation landmark',
  main: 'main landmark',
  contentinfo: 'content information landmark',
  complementary: 'complementary landmark',
  search: 'search landmark',
  form: 'form landmark',
  region: 'region',
};

/** Roles whose name comes from their own content, so reading their children would repeat it. */
const NAMED_FROM_CONTENT = new Set(['link', 'button', 'heading', 'option', 'cell', 'columnheader', 'rowheader', 'tab', 'menuitem', 'treeitem', 'checkbox', 'radio', 'switch', 'combobox', 'listbox', 'image', 'img', 'textbox', 'searchbox', 'StaticText']);

/** Inline wrappers whose text runs into the surrounding line. */
const INLINE = new Set(['StaticText', 'strong', 'emphasis', 'generic', 'LabelText', 'mark', 'code', 'time', 'abbr', 'subscript', 'superscript', 'deletion', 'insertion']);

const CONTROLS = new Set(['link', 'button', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'slider', 'spinbutton', 'switch', 'tab', 'menuitem', 'option', 'treeitem']);

export const isControl = (n: SrNode) => CONTROLS.has(n.role);

/** The text inside a node, for elements that have no accessible name of their own. */
const textOf = (n: SrNode): string =>
  (n.role === 'StaticText' ? n.name : n.name && n.role !== 'generic' ? ` ${n.name} ` : n.children.map(textOf).join('')).replace(/\s+/g, ' ').trim();

function states(n: SrNode): string[] {
  const p = n.props;
  const out: string[] = [];
  if (p.checked === 'true') out.push(n.role === 'switch' ? 'on' : 'checked');
  else if (p.checked === 'false') out.push(n.role === 'switch' ? 'off' : 'not checked');
  else if (p.checked === 'mixed') out.push('half checked');
  if (p.pressed === 'true') out.push('pressed');
  else if (p.pressed === 'false') out.push('not pressed');
  if (p.expanded === true) out.push('expanded');
  else if (p.expanded === false) out.push('collapsed');
  if (p.selected === true && n.role !== 'option') out.push('selected');
  if (p.hasPopup && p.hasPopup !== 'false') out.push(p.hasPopup === 'true' ? 'has popup' : `has ${p.hasPopup} popup`);
  if (p.modal === true) out.push('modal');
  if (p.required === true) out.push('required');
  if (p.invalid && p.invalid !== 'false') out.push('invalid entry');
  if (p.disabled === true) out.push('unavailable');
  if (p.readonly === true) out.push('read only');
  if (typeof p.current === 'string' && p.current !== 'false') out.push(`current ${p.current === 'true' ? 'item' : p.current}`);
  return out;
}

/** One announcement, in the order screen readers usually speak it: name, role, states, value, description. */
export function announce(n: SrNode): string {
  if (n.role === 'heading') return `heading level ${n.props.level ?? '?'}, ${n.name || '⚠ no name'}`;
  if (LANDMARKS[n.role]) return [LANDMARKS[n.role], n.name].filter(Boolean).join(', ');
  if (n.role === 'list') return `list with ${n.children.filter((c) => c.role === 'listitem').length} items`;
  if (n.role === 'generic') return `${n.name || textOf(n) || '(no text)'} ⚠ no role`;
  const role = ROLE_WORDS[n.role] ?? n.role;
  const name = n.name || (n.role === 'image' || n.role === 'img' ? '⚠ no description' : isControl(n) ? '⚠ no name' : '');
  const parts = [name, role, ...states(n)];
  if (n.value && n.value !== n.name) parts.push(n.value);
  else if (!n.value && n.props.placeholder) parts.push(`placeholder ${n.props.placeholder}`);
  if (n.description) parts.push(n.description);
  if (n.props.live && n.props.live !== 'off') parts.unshift(`live region (${n.props.live})`);
  return parts.filter(Boolean).join(', ');
}

/** Containers a screen reader announces on entry; their contents are indented beneath them. */
const ANNOUNCED_CONTAINERS = new Set(['list', 'table', 'grid', 'dialog', 'alertdialog', 'tablist', 'menu', 'menubar', 'tree', 'Iframe', 'status', 'alert', 'log']);

/** Browse-mode reading order: what a listener hears pressing the down arrow through the page. */
export function readingOrder(root: SrNode): string[] {
  const lines: string[] = [];
  let buffer = '';
  let bufferDepth = 0;
  const say = (text: string, depth: number) => lines.push(`${'  '.repeat(depth)}${text}`);
  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim();
    if (text) say(text, bufferDepth);
    buffer = '';
  };
  const walk = (n: SrNode, depth: number) => {
    if (n.role === 'StaticText') {
      if (!buffer) bufferDepth = depth;
      buffer += n.name;
      return;
    }
    // A focusable generic (e.g. div tabindex=0) is announced as itself, so its missing role shows.
    if (INLINE.has(n.role) && !(n.role === 'generic' && n.props.focusable === true)) {
      n.children.forEach((c) => walk(c, depth));
      return;
    }
    flush();
    if (n.role === 'RootWebArea') {
      n.children.forEach((c) => walk(c, depth));
    } else if (NAMED_FROM_CONTENT.has(n.role) || n.role === 'generic') {
      say(announce(n), depth);
    } else if (LANDMARKS[n.role] || ANNOUNCED_CONTAINERS.has(n.role)) {
      say(announce(n), depth);
      n.children.forEach((c) => walk(c, depth + 1));
    } else {
      // Paragraphs, list items, rows and other structure: read the contents; name a labelled group.
      if ((n.role === 'group' || n.role === 'radiogroup') && n.name) say(`grouping, ${n.name}`, depth);
      n.children.forEach((c) => walk(c, depth));
    }
    flush();
  };
  walk(root, 0);
  flush();
  return lines;
}

export interface QuickNav {
  headings: string[];
  landmarks: string[];
  links: string[];
  formFields: string[];
}

/** The element lists screen-reader users jump through (NVDA's Elements List, VoiceOver's rotor). */
export function quickNav(root: SrNode): QuickNav {
  const nav: QuickNav = { headings: [], landmarks: [], links: [], formFields: [] };
  const walk = (n: SrNode) => {
    if (n.role === 'heading') nav.headings.push(`h${n.props.level ?? '?'} ${n.name || '⚠ no name'}`);
    else if (LANDMARKS[n.role] && (n.role !== 'region' || n.name)) nav.landmarks.push(announce(n));
    else if (n.role === 'link') nav.links.push(n.name || '⚠ no name');
    else if (isControl(n) && n.role !== 'link' && n.role !== 'button' && n.role !== 'option' && n.role !== 'tab' && n.role !== 'menuitem' && n.role !== 'treeitem') nav.formFields.push(announce(n));
    for (const c of n.children) walk(c);
  };
  walk(root);
  return nav;
}

/** The whole transcript as text, for snapshots, attachments and read-aloud. */
export function transcript(title: string, root: SrNode, tabStops?: string[]): string {
  const nav = quickNav(root);
  const section = (heading: string, items: string[], style: 'bullets' | 'numbers' | 'plain' = 'bullets') => [
    `## ${heading}`,
    ...(items.length ? items.map((x, i) => (style === 'numbers' ? `${i + 1}. ${x}` : style === 'bullets' ? `- ${x}` : x)) : ['(none)']),
    '',
  ];
  return [
    `Page title: ${title || '⚠ no title'}`,
    '',
    ...section(`Headings (${nav.headings.length})`, nav.headings),
    ...section(`Landmarks (${nav.landmarks.length})`, nav.landmarks),
    ...section(`Links (${nav.links.length})`, nav.links),
    ...section(`Form fields (${nav.formFields.length})`, nav.formFields),
    ...section('Reading order (browse mode, down arrow)', readingOrder(root), 'plain'),
    ...(tabStops ? section('Tab order (what each Tab stop announces)', tabStops, 'numbers') : []),
  ].join('\n');
}

/** Opens a DevTools session for the page and enables what the reader needs. */
export async function openScreenReader(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');
  await cdp.send('DOM.enable');
  return cdp;
}
