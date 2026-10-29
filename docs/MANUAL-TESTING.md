# Manual & assistive-technology testing

Automation catches roughly 30–40% of WCAG issues. This checklist covers the rest. Run it
**per release** for changed pages, and do a **full pass quarterly** or before any conformance claim.

## Before you start: read the transcript

`tests/screen-reader` records what a simulated screen reader would announce on every page and UI state
(`tests/screen-reader/transcripts.spec.ts-snapshots/`, also attached to each test in the HTML report). Read
or listen to it first (`npm run read-aloud -- <page-id>`): it shows the headings, landmarks, link and
field lists, reading order and Tab announcements, so the manual pass can focus on what only a real screen
reader shows, such as verbosity, browse-mode behaviour, live-region timing and VoiceOver/Safari differences.

## AT / browser matrix

| Screen reader | Browser | Platform | Priority |
|---|---|---|---|
| JAWS (current) | Chrome | Windows | Required |
| NVDA (current) | Firefox + Chrome | Windows | Required |
| VoiceOver | Safari | macOS | Required |
| VoiceOver | Safari | iOS | Required |
| TalkBack | Chrome | Android | Required if mobile audience |
| Dragon NaturallySpeaking | Chrome | Windows | Spot-check (2.5.3) |
| Windows High Contrast / forced colors | Edge | Windows | Spot-check (1.4.11) |

## Criteria with no meaningful automation (status `manual` in the coverage report)

| SC | What a human checks |
|---|---|
| 1.2.x | Captions accurate and synchronized; audio description present; transcripts |
| 1.3.2 / 1.3.3 | Reading order matches meaning; instructions don't rely on shape/position/sound |
| 1.4.2 | Auto-playing audio > 3s can be paused or muted |
| 1.4.5 | No images of text (except logos) |
| 1.4.11 | UI component boundaries and states, focus indicators, and icons reach 3:1 |
| 2.1.4 | Single-character shortcuts can be turned off or remapped |
| 2.2.1 / 2.2.2 | Session timeouts warn and can be extended; carousels/animations can be paused |
| 2.3.1 | No content flashes more than 3 times per second |
| 2.4.5 | At least two ways to find each page (nav, search, sitemap) |
| 2.4.6 | Headings and labels are *descriptive*, not just present |
| 2.5.1 / 2.5.2 / 2.5.4 / 2.5.7 | Gesture, pointer-up, motion, and drag interactions have single-pointer alternatives |
| 3.1.2 | Foreign-language passages have `lang` |
| 3.2.2 / 3.2.4 | Changing inputs doesn't trigger unexpected context changes; same function is labelled the same |
| 3.3.4 | Legal/financial/data submissions are reversible, checked, or confirmed |
| 3.3.7 | Info entered earlier in a flow is auto-filled or selectable |
| 3.3.8 | Login doesn't require a cognitive test; password managers and paste work |

## Criteria rated `partial`: confirm what automation can't

- **1.1.1** alt text is *meaningful*, and decorative images are `alt=""`
- **1.4.3** contrast of text over images and gradients (axe reports these as "incomplete")
- **2.4.3** review every tab-order snapshot diff in PRs
- **2.4.4** link text makes sense in context
- **4.1.2** custom widgets announce role, state, and changes correctly in each screen reader
- **4.1.3** status messages are actually *spoken* (live region timing varies by AT)

## Recording results

Log each finding as a ticket with: SC, page/state, AT+browser, steps, expected vs. actual,
severity. Link the ticket from any waiver in `src/a11y/waivers.ts`.
