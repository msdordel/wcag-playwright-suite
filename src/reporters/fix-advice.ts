import { TEST_ERROR, understandingUrl, type Finding } from './failure-details';

/**
 * Fix recommendations for the report. Most specific first: the axe rule, then this suite's own
 * checks (criterion + wording of the failure), then a per-criterion default, then W3C's guidance.
 * Advice is a starting point for the developer; the linked rule or criterion page has the detail.
 */
export interface Advice {
  text: string;
  link?: string;
}

const AXE: Record<string, string> = {
  'color-contrast':
    'Darken the text or lighten its background until contrast is at least 4.5:1 (3:1 for text 24px+, or 18.66px+ bold). Fix the colour token, not one-off overrides.',
  'image-alt': 'Add alt text to every <img> that says what it shows or does. Use alt="" for purely decorative images.',
  'input-image-alt': 'Give the image button alt text that names its action, e.g. alt="Search".',
  'role-img-alt': 'Give role="img" elements an accessible name with aria-label or aria-labelledby.',
  'svg-img-alt': 'Give meaningful SVGs role="img" and a <title> or aria-label; hide decorative ones with aria-hidden="true".',
  label: 'Give every form field a visible <label for="…">, or aria-labelledby pointing at visible text. Placeholder text is not a label.',
  'select-name': 'Associate a visible <label> with the <select>, or use aria-labelledby.',
  'link-name':
    'Give each link text that says where it goes. For image links, put the destination in the image alt (alt="Desktops"); for icon links, add visually hidden text or aria-label.',
  'button-name': 'Give the button visible text, or an aria-label for icon-only buttons (aria-label="Open calendar").',
  'frame-title':
    'Add a title to the <iframe> describing its content (title="Product video"). Hide purely technical frames with aria-hidden="true" and tabindex="-1".',
  'html-has-lang': 'Add the page language to the <html> element, e.g. <html lang="en">.',
  'html-lang-valid': 'Use a valid language code on <html>, e.g. lang="en" or lang="en-US".',
  'valid-lang': 'Use valid language codes in lang attributes, e.g. lang="fr" for French passages.',
  'document-title': 'Add a <title> that describes the page: "Page topic – Site name".',
  'aria-allowed-attr': "Remove ARIA attributes the element's role doesn't support, or give it a role that supports them.",
  'aria-prohibited-attr':
    'Remove aria-label/aria-labelledby from elements whose role cannot be named (e.g. a plain div or span), or give the element a suitable role.',
  'aria-required-attr': 'Add the ARIA attributes the role requires, e.g. aria-checked on role="checkbox".',
  'aria-required-children': 'Give the role its required children, e.g. role="list" must contain role="listitem".',
  'aria-required-parent': 'Place the element inside its required parent role, e.g. role="tab" inside role="tablist".',
  'aria-valid-attr-value': 'Fix invalid ARIA values, e.g. aria-expanded must be "true" or "false" and ID references must exist.',
  'aria-hidden-focus': 'Do not put focusable elements inside aria-hidden content. Use the inert attribute, or tabindex="-1" on them.',
  'aria-dialog-name': 'Name the dialog with aria-labelledby pointing at its heading.',
  'nested-interactive': 'Do not nest interactive controls (a button inside a link). Make them siblings.',
  list: 'Make <ul>/<ol> contain only <li> children (plus script/template). Move other elements inside an <li>.',
  listitem: 'Place <li> elements only inside <ul> or <ol>.',
  'definition-list': 'Make <dl> contain only <dt>/<dd> groups.',
  'link-in-text-block':
    'Underline links inside text (the browser default), or give them 3:1 contrast with the surrounding text plus a non-colour cue on hover and focus.',
  'target-size': 'Make each target at least 24×24 CSS px, or space small targets so a 24px circle centred on each does not overlap its neighbours.',
  'duplicate-id-aria': 'Make IDs referenced by ARIA or labels unique on the page.',
  'scrollable-region-focusable': 'Make scrollable regions keyboard-reachable: add tabindex="0" and an accessible name.',
  'meta-viewport': 'Remove maximum-scale and user-scalable=no from the viewport meta tag so users can zoom.',
  'meta-refresh': 'Remove automatic page refresh or redirect, or let users turn it off.',
  blink: 'Remove <blink> and other content that flashes or moves without a pause control.',
  marquee: 'Replace <marquee> with static content, or provide a pause control.',
  'empty-heading': 'Give every heading text, or remove the empty heading.',
  'th-has-data-cells': 'Make sure each table header labels data cells, or remove unused headers.',
  'td-headers-attr': 'Point headers attributes at <th> IDs within the same table.',
  bypass: 'Add a "Skip to main content" link or landmarks so keyboard users can bypass repeated blocks.',
  'autocomplete-valid': 'Use valid autocomplete tokens on personal-data fields, e.g. autocomplete="email".',
};

interface Check {
  sc: string;
  match: RegExp;
  text: string;
}

/** This suite's own checks, matched on the criterion and the failure's wording. */
const CHECKS: Check[] = [
  { sc: '1.4.10', match: /scroll/i, text: 'Let content reflow at 320 CSS px: replace fixed widths with max-width: 100% and flexible layouts (flex/grid with wrapping), and stack columns with media queries. Only tables, maps and similar may scroll on their own.' },
  { sc: '1.4.4', match: /clipped/i, text: 'Let text containers grow with the text: size fonts in rem/em, use min-height instead of fixed heights, and avoid overflow: hidden on text.' },
  { sc: '1.4.12', match: /clipped|spacing/i, text: "Don't fix the height of text boxes or hide overflow. Text must survive line-height 1.5, paragraph spacing 2em, letter spacing 0.12em and word spacing 0.16em." },
  { sc: '1.3.4', match: /rotate|orientation/i, text: 'Do not lock orientation. Remove orientation media queries that hide content or ask users to rotate the device.' },
  { sc: '1.3.1', match: /main landmark/i, text: 'Wrap the primary content in a single <main> element.' },
  { sc: '1.3.1', match: /level-1 heading/i, text: 'Add one <h1> that names the main content of the page.' },
  { sc: '1.1.1', match: /alt|image/i, text: 'Write alt text that says what the image shows or does, or use alt="" if it is decorative. File names and words like "image" or "decorative icon" give no information.' },
  { sc: '2.1.1', match: /never received focus|no keyboard-focusable/i, text: 'Make every interactive element reachable with Tab: remove tabindex="-1" from controls, and use native <button> and <a href> instead of clickable divs.' },
  { sc: '2.1.1', match: /enter|open/i, text: 'Use a native <button>, which handles Enter and Space. Otherwise add role="button", tabindex="0" and Enter/Space key handlers.' },
  { sc: '2.1.2', match: /escape/i, text: 'Close the dialog on Escape and return focus to the control that opened it.' },
  { sc: '2.1.2', match: /cycled|trap/i, text: 'Make sure keyboard users can leave every component with Tab, Shift+Tab or Escape.' },
  { sc: '2.4.1', match: /skip/i, text: 'Add a "Skip to main content" link as the first focusable element, visible on focus, pointing at <main id="main" tabindex="-1">.' },
  { sc: '2.4.7', match: /skip link/i, text: 'Show the skip link when it is focused, e.g. .skip-link:focus { position: static; } or translate it into view.' },
  { sc: '2.4.7', match: /visible change|focus/i, text: 'Never remove the focus outline without a replacement. Add a :focus-visible style with at least 3:1 contrast, e.g. outline: 3px solid #1a73e8; outline-offset: 2px.' },
  { sc: '2.4.11', match: /hidden|obscured/i, text: 'Keep focused elements in view: add scroll-padding-top/bottom for sticky headers and footers, and stop cookie banners or chat widgets from covering content.' },
  { sc: '2.4.3', match: /sequence changed|order/i, text: 'Walk the new tab order by hand. If it is right, re-baseline with npm run update-tab-order; if not, fix the DOM order rather than using positive tabindex.' },
  { sc: '2.4.3', match: /return/i, text: 'When a dialog closes, move focus back to the control that opened it.' },
  { sc: '2.4.3', match: /into the dialog|escaped modal/i, text: 'Move focus into the dialog when it opens, and keep it there until the dialog closes.' },
  { sc: '2.4.3', match: /focus did not move|after a failed/i, text: 'After a failed submit, move focus to the first invalid field or to an error summary.' },
  { sc: '2.4.2', match: /shares its title/i, text: 'Give each page a unique title that leads with its own topic, e.g. "Cart – Gefälscht CompuTech".' },
  { sc: '2.4.2', match: /.*/, text: 'Replace the title with one that describes the page: "Page topic – Site name".' },
  { sc: '2.4.4', match: /.*/, text: 'Make link text describe its destination ("View cart", not "Click here" or a bare image).' },
  { sc: '2.4.6', match: /.*/, text: 'Make headings and labels describe the content or field they introduce.' },
  { sc: '3.1.1', match: /.*/, text: 'Add a valid language code to the <html> element, e.g. <html lang="en">.' },
  { sc: '3.2.1', match: /.*/, text: 'Do not navigate, submit or open windows when a control receives focus. Wait for the user to activate it.' },
  { sc: '3.2.3', match: /.*/, text: 'Keep shared navigation in the same order, with the same items, on every page.' },
  { sc: '3.3.1', match: /aria-invalid/i, text: 'Set aria-invalid="true" on the invalid field.' },
  { sc: '3.3.1', match: /associated|describedby|errormessage/i, text: 'Link the error text to its field with aria-describedby (or aria-errormessage).' },
  { sc: '3.3.1', match: /.*/, text: 'Show the error as text next to the field, link it with aria-describedby, and move focus to the first invalid field.' },
  { sc: '3.3.2', match: /.*/, text: 'Give the field a visible label that says what to enter.' },
  { sc: '4.1.2', match: /dialog.*name|accessible name \(aria-labelledby/i, text: 'Name the dialog: add aria-labelledby pointing at its heading.' },
  { sc: '4.1.2', match: /aria-modal|showModal/i, text: 'Open the dialog with <dialog>.showModal(), or add aria-modal="true" to the role="dialog" element.' },
  { sc: '4.1.2', match: /role=button|expose role/i, text: 'Use a native <button> for clickable controls, or add role="button" and a name.' },
  { sc: '4.1.2', match: /name/i, text: 'Give the control a name that describes its purpose: visible text, a <label>, or aria-label.' },
];

export function adviceFor(f: Finding): Advice {
  if (f.source === TEST_ERROR) {
    return { text: 'Not an accessibility finding: the check never ran. Re-run; if it repeats, check the site is reachable and allow more time for slow pages.' };
  }
  const rule = f.source?.match(/^axe ([\w-]+)/)?.[1];
  if (rule) return { text: AXE[rule] ?? 'Follow the fix guidance on the axe rule page.', link: f.link };
  if (!f.scs.length) return { text: 'Replace placeholder or template text with the real content before release.' };

  for (const sc of f.scs) {
    const check = CHECKS.find((c) => c.sc === sc && c.match.test(f.what));
    if (check) return { text: check.text, link: understandingUrl(sc) };
  }
  return { text: "See W3C's guidance on meeting this criterion.", link: understandingUrl(f.scs[0]) };
}
