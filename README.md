# WCAG Playwright Suite

A reference architecture for **WCAG 2.2 AA** testing with Playwright. It produces evidence for each
success criterion, so the results can feed an ACR/VPAT or a Section 508 review, not just a pass/fail count.

It ships pointed at **[Deque's Broken Workshop](https://broken-workshop.dequelabs.com/)**, a demo app
built with intentional accessibility bugs, so a fresh clone shows the suite finding real defects.

> **Expect failures.** Against the default target, a passing suite would mean the tests are broken.

---

## Quick start

Requires **Node 22+**.

```bash
git clone <this repo> && cd wcag-playwright-suite
npm ci
npx playwright install --with-deps   # Chromium, Firefox, WebKit
npm test                             # runs against the Deque demo by default
```

A full run takes about 30 seconds on a laptop.

### Common commands

| Command | What it does |
|---|---|
| `npm test` | Full suite, all layers, all browsers |
| `BASE_URL=https://staging.example.gov npm test` | Run against another site |
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

Each run produces three outputs:

| Output | How to open | Use it for |
|---|---|---|
| **HTML report** | `npm run report` (serves `playwright-report/` at http://localhost:9323) | Triage. Filter by **Failed**, open a test for its screenshot, step-by-step trace, and `axe … .json` attachment (every violation with selectors). Search `@sc-4.1.2` to see all evidence for a criterion. |
| **WCAG coverage matrix** | `reports/wcag-coverage.md` (also `.json`) | Audit and compliance. One row for each A/AA criterion: tests run, pass/fail, and whether a manual audit is still required. It also lists axe "incomplete" items queued for human review. |
| **Console** | Terminal output | Each failure message starts with the SC id, e.g. `4.1.2 dialog needs an accessible name`. |

In **CI** (GitHub Actions, `.github/workflows/accessibility.yml`), the coverage matrix is posted to the
job summary. The HTML report and matrix are uploaded as the `a11y-evidence` artifact and kept for 90 days.
Run the workflow manually from the Actions tab and enter a `base_url` to test any site.

---

## Target site and latest results

**Target:** https://broken-workshop.dequelabs.com/ is a single-page "Recipe Dashboard". Its states
are the dashboard, the *Cook* modal, the *Edit* modal, and the Edit form with validation errors.

**Run of 2026-10-27:** 74 passed, 15 failed (Chromium, Firefox and WebKit on macOS). Every failure was
checked by hand and is a real defect, not a test artifact:

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

**What automation can't settle here** (left for manual review): a `menubar` wrapping the logo, and
focusable content behind the open modal (axe `aria-hidden-focus`, "incomplete"). Whether the alt text
and labels are *accurate* also needs a person.

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
src/reporters/                → reports/wcag-coverage.{md,json}
```

### Browser strategy

DOM-level checks (axe, adaptation, semantics) run once, in Chromium. Keyboard, form, and component
behavior differs by engine, so it runs in Chromium, Firefox, and WebKit. The harness accounts for
known engine quirks:
- WebKit on macOS uses Option+Tab, because Safari's Tab key skips links by default.
- Headless Firefox keeps focus on the last element instead of moving to browser UI.
- Some modal libraries render a 0×0 dialog wrapper, which Playwright reports as hidden.

---

## Adapting it to your app

1. Point `BASE_URL` at your site.
2. Replace `data/pages.ts` with every route and the UI states that matter: open menus, dialogs, error states.
3. Replace the selectors in `tests/forms` and `tests/components`. Copy those files for each form and widget.
4. Delete the tab-order baselines in `tests/keyboard/*-snapshots/`. Then, after someone has walked each
   page's tab order by hand, generate new ones with `npm run update-tab-order`.

## Known limits

- **Focus visible** proves the element's appearance changes, not that the change has enough contrast (1.4.11 is manual).
- **Clipped text** detects overflow clipping, not overlapping text.
- **Reachability** can't see click handlers on non-focusable `div`s.
- **Content checks** catch obvious junk (placeholders, filenames, "image", "decorative"), not inaccurate descriptions.
- Automation finds roughly 30–40% of WCAG issues. See `docs/MANUAL-TESTING.md` for the rest.
