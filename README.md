# WCAG Playwright Suite

A reference architecture for **WCAG 2.2 AA** testing with Playwright. It produces evidence for each
success criterion, so the results can feed an ACR/VPAT or a Section 508 review, not just a pass/fail count.

It ships pointed at four of **Deque's intentionally inaccessible demo sites**, so a fresh clone shows the
suite finding real defects:

| Site id | Site | Pages tested |
|---|---|---|
| `workshop` | [Broken Workshop](https://broken-workshop.dequelabs.com/) | Recipe dashboard, plus 3 modal and error states |
| `dream` | [Dream Destination](https://dequeuniversity.com/demo/dream) | Home (single-page booking site) |
| `mars` | [Mars Commuter](https://dequeuniversity.com/demo/mars/) | Home (inner links are stubs) |
| `computech` | [Gefälscht CompuTech](https://webtestingcourse.dequecloud.com/) | Home, Laptops & Notebooks, a product, Cart, Contact |

> **Expect failures.** Against these targets, a passing suite would mean the tests are broken.

---

## Quick start

Requires **Node 22+**.

```bash
git clone <this repo> && cd wcag-playwright-suite
npm ci
npx playwright install --with-deps   # Chromium, Firefox, WebKit
npm test                             # runs against all four demo sites
```

A full run takes about 90 seconds on a laptop.

### Common commands

| Command | What it does |
|---|---|
| `npm test` | Full suite, all layers, all browsers |
| `SITES=dream,mars npm test` | Only some sites (ids from the table above) |
| `npm run test:sc -- @sc-2.4.7` | Only tests that provide evidence for one success criterion |
| `npm run test:critical` | Critical pages only (suitable as a PR gate) |
| `npm run test:axe` / `test:keyboard` / `test:adaptation` | One layer |
| `npx playwright test tests/unit` | Browserless unit tests for the content heuristics (< 1s) |
| `npm run update-tab-order` | Re-baseline tab order **after a human has reviewed the diff** |
| `npm run typecheck` | TypeScript check |

Set `WCAG_TARGET` to `2.0-AA`, `2.1-AA`, or `2.2-AA` (default) to change which axe rules gate the build
and which criteria the coverage report lists.

---

## Viewing results

Each run produces four outputs:

| Output | How to open | Use it for |
|---|---|---|
| **HTML report** | `npm run report` (serves `playwright-report/` at http://localhost:9323) | Triage. Filter by **Failed**, open a test for its screenshot, step-by-step trace, and `axe … .json` attachment (every violation with selectors). Search `@sc-4.1.2` to see all evidence for a criterion. |
| **Results by browser** | `reports/browser-results.html` (open in a browser; also `.md` and `.json`) | Where it fails, why, and how to fix it. Pass/fail charts and tables by browser, by site and by WCAG criterion. **Failures explained** has one row per problem: the page, the WCAG criterion (linked to W3C's explanation), what's wrong, the affected elements, **how to fix it**, and its status in each browser. Then every test × browser. The `.md` copy has the same tables without the charts. |
| **WCAG coverage matrix** | `reports/wcag-coverage.md` (also `.json`) | Audit and compliance. One row for each A/AA criterion: tests run, pass/fail, and whether a manual audit is still required. It also lists axe "incomplete" items queued for human review. |
| **Console** | Terminal output | Each failure message starts with the SC id, e.g. `4.1.2 dialog needs an accessible name`. |

In **CI** (GitHub Actions, `.github/workflows/accessibility.yml`), the browser results and coverage matrix are
posted to the job summary. The HTML report and both reports are uploaded as the `a11y-evidence` artifact and kept for 90 days.
Run the workflow manually from the Actions tab and enter `sites` (for example `computech`) to test a subset.

---

## Target sites and latest results

**Run of 2026-10-28** (Chromium, Firefox and WebKit on macOS): **107 passed, 75 failed, 10 skipped.**
The failures were triaged, and each one traces to a defect in the site, not a test artifact. The 10 skips are
CompuTech's keyboard tests in Firefox; see [Browser strategy](#browser-strategy).

### Broken Workshop: 74 passed, 15 failed

A single-page "Recipe Dashboard". Its states are the dashboard, the *Cook* modal, the *Edit* modal,
and the Edit form with validation errors.

| SC | Defect | Caught by |
|---|---|---|
| 1.1.1 | 5 recipe images have no alt text | axe |
| 1.1.1 | Stat icons have `alt="decorative icon"`; should be `alt=""` | content-quality check (axe passes it) |
| 1.4.3 | "Beginner" label contrast 2.17:1 (needs 4.5:1) | axe |
| 2.1.1 | *Edit* control does nothing on Enter | keyboard component test |
| 2.4.2 | Page title is `[INSERT TITLE HERE]` | content-quality check (axe passes it) |
| 4.1.2 | *Edit* is a `div tabindex=0` with no role and an empty name | component test, tab-order snapshot |
| 4.1.2 | Modal has no accessible name and no `aria-modal` | dialog test |
| 4.1.2 | Yumminess field's `<label>` is a single space, so the field has no name | form test (axe passes it) |

**What passed:** no keyboard traps, focus always visible and never obscured, a working skip link,
320px reflow, 200% zoom, text-spacing tolerance, form error identification, and focus return
when a modal closes.

### Dream Destination: 11 of 15 page tests failed

| SC | Defect | Caught by |
|---|---|---|
| 1.3.1 | No `main` landmark | structure test |
| 1.4.3 | Text below 4.5:1 contrast | axe |
| 1.3.1 | `<ul>` with non-`<li>` children | axe |
| 1.4.4, 1.4.10, 1.4.12 | Horizontal scrolling at 320px; text clipped at 200% zoom and with text-spacing overrides | adaptation tests |
| 2.1.1 | "Swap stations" has `tabindex="-1"`, so the keyboard can't reach it | keyboard traversal |
| 2.4.1 | No skip link | bypass-blocks test |
| 2.4.7 | Station inputs and social links show no focus indicator (all 3 engines) | keyboard traversal |
| 2.4.11 | Fixed cookie-consent banner covers 16 focused footer links | keyboard traversal |

### Mars Commuter: 13 of 15 page tests failed

| SC | Defect | Caught by |
|---|---|---|
| 1.1.1 | Image has `alt="icecream.jpg"` | content-quality check (axe passes it) |
| 1.3.1 | No `main` landmark | structure test |
| 3.1.1 | `<html>` has no `lang` | structure test, axe |
| 1.1.1, 2.4.4, 4.1.2 | Images without alt; empty links; unnamed frame, select, and button; disallowed ARIA attributes | axe |
| 1.4.1, 1.4.3, 2.5.8 | Links distinguished only by color; low contrast; targets under 24px | axe |
| 1.4.4, 1.4.10, 1.4.12 | Fails reflow, zoom, and text spacing | adaptation tests |
| 2.4.1, 2.4.7 | No skip link; controls with no focus indicator (all 3 engines) | keyboard tests |

### Gefälscht CompuTech: 36 of 63 page tests failed

| SC | Defect | Caught by |
|---|---|---|
| 1.3.1 | No landmarks on any page | structure test |
| 2.4.2 | All 5 pages share the title `Gefälscht~~~Gefälscht CompuTech~~~` | title-uniqueness test |
| 1.1.1, 2.4.4, 4.1.2 | Images without alt; empty links; unlabeled form fields | axe |
| 1.4.1, 1.4.3, 2.5.8 | Links distinguished only by color; low contrast; targets under 24px | axe |
| 1.4.10 | Every page scrolls horizontally at 320px | adaptation test |
| 2.4.1 | No skip link | bypass-blocks test |
| 2.4.7 | `outline: none` on navigation links, with no replacement indicator, on every page | keyboard traversal |

**What passed:** main navigation and site search are consistent across all 5 pages (3.2.3).

**What automation can't settle on any site** (left for manual review): whether alt text and labels are
*accurate*, and the axe "incomplete" items listed in the coverage matrix.

---

## How the suite is organized

### Principles

1. **Organize by success criterion.** Every test declares its SCs with `sc('2.4.7')`, which tags
   it `@sc-2.4.7` and records it for the coverage report.
2. **Be honest about coverage.** Each SC is rated `automated`, `partial`, or `manual`
   (`src/a11y/wcag-criteria.ts`). The report never says "conforms", and untested SCs show as gaps.
3. **Layer beyond axe.** axe covers about a third of WCAG. Three of the defects above were caught
   only by the other layers.
4. **Govern exceptions.** Never hide a violation with an exclude. Each exception goes in
   `src/a11y/waivers.ts` with a ticket, an approver, and an expiry of 90 days or less, enforced by a test.
5. **Report every failure in one run.** Soft assertions prefixed with the SC id let the reporter
   attribute each failure to the right criterion.

### Layers

| Layer | Folder | What it proves | Key SCs |
|---|---|---|---|
| 1. Rule scan | `tests/automated` | axe-core on every page **and UI state** in `data/pages.ts` | 1.1.1, 1.4.3, 2.5.8, 4.1.2 … |
| 2. Keyboard | `tests/keyboard` | Tab through every page: reachability, traps, visible and unobscured focus, no change on focus, tab-order snapshot, skip link | 2.1.1, 2.1.2, 2.4.1, 2.4.3, 2.4.7, 2.4.11, 3.2.1 |
| 3. Adaptation | `tests/adaptation` | 320px reflow, 200% zoom, text-spacing override, orientation | 1.3.4, 1.4.4, 1.4.10, 1.4.12 |
| 4. Semantics | `tests/semantics` | Descriptive titles, lang, landmarks, consistent navigation; **meaningful names** (no placeholders, filename alts, or "decorative" alts) | 1.1.1, 2.4.2, 2.4.6, 3.1.1, 3.2.3 |
| 5. Patterns | `tests/forms`, `tests/components` | Error identification and association, focus management, modal dialog contract, hover/focus popups | 2.1.1, 3.3.1, 4.1.2, 1.4.13 |
| 6. Governance | `tests/governance` | Waivers are ticketed, approved, and unexpired | — |
| — Unit | `tests/unit` | The content heuristics themselves, against known-good and known-bad strings | — |
| 7. Manual / AT | `docs/MANUAL-TESTING.md` | Screen reader matrix and checklist for what automation can't judge | 1.2.x, 2.4.6, 3.3.8 … |

```
playwright.config.ts          browsers, reporters, default target
data/pages.ts                 page + UI-state inventory           ← ADAPT for your app
src/a11y/config.ts            WCAG target → axe tags, reflow exemptions
src/a11y/wcag-criteria.ts     the 55 A/AA criteria with automation ratings
src/a11y/fixtures.ts          `axe` fixture (waivers, attachments), sc(), gotoStable()
src/a11y/keyboard.ts          tab traversal, focus-indicator diff, obscured check, reachability
src/a11y/adaptation.ts        reflow overflow, clipped-text detection, 1.4.12 CSS
src/a11y/content-quality.ts   placeholder / meaningless-name heuristics
src/a11y/waivers.ts           waiver register
src/reporters/                → reports/wcag-coverage.{md,json}, reports/browser-results.{html,md,json}
```

### Browser strategy

DOM-level checks (axe, adaptation, semantics) run once, in Chromium. Keyboard, form, and component
behavior differs by engine, so it runs in Chromium, Firefox, and WebKit. The harness accounts for
known engine quirks:
- WebKit on macOS uses Option+Tab, because Safari's Tab key skips links by default.
- Headless Firefox keeps focus on the last element instead of moving to browser UI.
- Some modal libraries render a 0×0 dialog wrapper, which Playwright reports as hidden.
- Chromium's built-in focus style changes `outline-offset` even when the page sets `outline: none`. The
  focus-visible check ignores outline properties unless an outline is actually drawn.
- While focus is inside an iframe, the parent page only sees the `<iframe>`. Traversal keeps tabbing until
  focus comes back out, and reports a trap only if it doesn't.

CompuTech's server sends the wrong intermediate TLS certificate. Chromium and WebKit fetch the right
one; Playwright's Firefox refuses the page (`SEC_ERROR_UNKNOWN_ISSUER`). Its Firefox keyboard tests are
skipped with that reason rather than run with certificate checks turned off. A site declares this with
`unsupportedBrowsers` in `data/pages.ts`.

---

## Adapting it to your app

1. Replace the sites in `data/pages.ts` with yours. List every route and the UI states that matter
   (open menus, dialogs, error states), and the shared regions to compare across pages (`consistentRegions`).
3. Replace the selectors in `tests/forms` and `tests/components`. Copy those files for each form and widget.
4. Delete the tab-order baselines in `tests/keyboard/*-snapshots/`. Then, after someone has walked each
   page's tab order by hand, generate new ones with `npm run update-tab-order`.

## Known limits

- **Focus visible** proves the element's appearance changes, not that the change has enough contrast (1.4.11 is manual).
- **Clipped text** detects overflow clipping, not overlapping text.
- **Reachability** can't see click handlers on non-focusable `div`s.
- **Content checks** catch obvious junk (placeholders, filenames, "image", "decorative"), not inaccurate descriptions.
- Automation finds roughly 30–40% of WCAG issues. See `docs/MANUAL-TESTING.md` for the rest.

## License

[MIT](LICENSE) © 2026 Mark Dordel
