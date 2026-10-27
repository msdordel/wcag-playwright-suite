/**
 * WCAG 2.2 Level A + AA success criteria (55; 4.1.1 Parsing is obsolete in 2.2).
 *
 * `automation` is an honest rating of what this suite can determine:
 *   automated: a test can make a reliable pass/fail call for the states it exercises
 *   partial:   automation catches some failures; a human must still confirm conformance
 *   manual:    no meaningful automated signal; a human or assistive-technology audit only
 *
 * The coverage reporter uses this list, so an SC with no tests appears as a gap
 * and is not silently left out.
 */
export type Automation = 'automated' | 'partial' | 'manual';

export interface Criterion {
  id: string;
  name: string;
  level: 'A' | 'AA';
  since: '2.0' | '2.1' | '2.2';
  automation: Automation;
}

export const CRITERIA: Criterion[] = [
  { id: '1.1.1', name: 'Non-text Content', level: 'A', since: '2.0', automation: 'partial' },
  { id: '1.2.1', name: 'Audio-only and Video-only (Prerecorded)', level: 'A', since: '2.0', automation: 'manual' },
  { id: '1.2.2', name: 'Captions (Prerecorded)', level: 'A', since: '2.0', automation: 'manual' },
  { id: '1.2.3', name: 'Audio Description or Media Alternative (Prerecorded)', level: 'A', since: '2.0', automation: 'manual' },
  { id: '1.2.4', name: 'Captions (Live)', level: 'AA', since: '2.0', automation: 'manual' },
  { id: '1.2.5', name: 'Audio Description (Prerecorded)', level: 'AA', since: '2.0', automation: 'manual' },
  { id: '1.3.1', name: 'Info and Relationships', level: 'A', since: '2.0', automation: 'partial' },
  { id: '1.3.2', name: 'Meaningful Sequence', level: 'A', since: '2.0', automation: 'manual' },
  { id: '1.3.3', name: 'Sensory Characteristics', level: 'A', since: '2.0', automation: 'manual' },
  { id: '1.3.4', name: 'Orientation', level: 'AA', since: '2.1', automation: 'partial' },
  { id: '1.3.5', name: 'Identify Input Purpose', level: 'AA', since: '2.1', automation: 'partial' },
  { id: '1.4.1', name: 'Use of Color', level: 'A', since: '2.0', automation: 'partial' },
  { id: '1.4.2', name: 'Audio Control', level: 'A', since: '2.0', automation: 'manual' },
  { id: '1.4.3', name: 'Contrast (Minimum)', level: 'AA', since: '2.0', automation: 'partial' },
  { id: '1.4.4', name: 'Resize Text', level: 'AA', since: '2.0', automation: 'partial' },
  { id: '1.4.5', name: 'Images of Text', level: 'AA', since: '2.0', automation: 'manual' },
  { id: '1.4.10', name: 'Reflow', level: 'AA', since: '2.1', automation: 'automated' },
  { id: '1.4.11', name: 'Non-text Contrast', level: 'AA', since: '2.1', automation: 'manual' },
  { id: '1.4.12', name: 'Text Spacing', level: 'AA', since: '2.1', automation: 'partial' },
  { id: '1.4.13', name: 'Content on Hover or Focus', level: 'AA', since: '2.1', automation: 'partial' },
  { id: '2.1.1', name: 'Keyboard', level: 'A', since: '2.0', automation: 'partial' },
  { id: '2.1.2', name: 'No Keyboard Trap', level: 'A', since: '2.0', automation: 'automated' },
  { id: '2.1.4', name: 'Character Key Shortcuts', level: 'A', since: '2.1', automation: 'manual' },
  { id: '2.2.1', name: 'Timing Adjustable', level: 'A', since: '2.0', automation: 'manual' },
  { id: '2.2.2', name: 'Pause, Stop, Hide', level: 'A', since: '2.0', automation: 'manual' },
  { id: '2.3.1', name: 'Three Flashes or Below Threshold', level: 'A', since: '2.0', automation: 'manual' },
  { id: '2.4.1', name: 'Bypass Blocks', level: 'A', since: '2.0', automation: 'automated' },
  { id: '2.4.2', name: 'Page Titled', level: 'A', since: '2.0', automation: 'partial' },
  { id: '2.4.3', name: 'Focus Order', level: 'A', since: '2.0', automation: 'partial' },
  { id: '2.4.4', name: 'Link Purpose (In Context)', level: 'A', since: '2.0', automation: 'partial' },
  { id: '2.4.5', name: 'Multiple Ways', level: 'AA', since: '2.0', automation: 'manual' },
  { id: '2.4.6', name: 'Headings and Labels', level: 'AA', since: '2.0', automation: 'manual' },
  { id: '2.4.7', name: 'Focus Visible', level: 'AA', since: '2.0', automation: 'automated' },
  { id: '2.4.11', name: 'Focus Not Obscured (Minimum)', level: 'AA', since: '2.2', automation: 'automated' },
  { id: '2.5.1', name: 'Pointer Gestures', level: 'A', since: '2.1', automation: 'manual' },
  { id: '2.5.2', name: 'Pointer Cancellation', level: 'A', since: '2.1', automation: 'manual' },
  { id: '2.5.3', name: 'Label in Name', level: 'A', since: '2.1', automation: 'partial' },
  { id: '2.5.4', name: 'Motion Actuation', level: 'A', since: '2.1', automation: 'manual' },
  { id: '2.5.7', name: 'Dragging Movements', level: 'AA', since: '2.2', automation: 'manual' },
  { id: '2.5.8', name: 'Target Size (Minimum)', level: 'AA', since: '2.2', automation: 'automated' },
  { id: '3.1.1', name: 'Language of Page', level: 'A', since: '2.0', automation: 'automated' },
  { id: '3.1.2', name: 'Language of Parts', level: 'AA', since: '2.0', automation: 'manual' },
  { id: '3.2.1', name: 'On Focus', level: 'A', since: '2.0', automation: 'partial' },
  { id: '3.2.2', name: 'On Input', level: 'A', since: '2.0', automation: 'manual' },
  { id: '3.2.3', name: 'Consistent Navigation', level: 'AA', since: '2.0', automation: 'automated' },
  { id: '3.2.4', name: 'Consistent Identification', level: 'AA', since: '2.0', automation: 'manual' },
  { id: '3.2.6', name: 'Consistent Help', level: 'A', since: '2.2', automation: 'automated' },
  { id: '3.3.1', name: 'Error Identification', level: 'A', since: '2.0', automation: 'partial' },
  { id: '3.3.2', name: 'Labels or Instructions', level: 'A', since: '2.0', automation: 'partial' },
  { id: '3.3.3', name: 'Error Suggestion', level: 'AA', since: '2.0', automation: 'partial' },
  { id: '3.3.4', name: 'Error Prevention (Legal, Financial, Data)', level: 'AA', since: '2.0', automation: 'manual' },
  { id: '3.3.7', name: 'Redundant Entry', level: 'A', since: '2.2', automation: 'manual' },
  { id: '3.3.8', name: 'Accessible Authentication (Minimum)', level: 'AA', since: '2.2', automation: 'manual' },
  { id: '4.1.2', name: 'Name, Role, Value', level: 'A', since: '2.0', automation: 'partial' },
  { id: '4.1.3', name: 'Status Messages', level: 'AA', since: '2.1', automation: 'partial' },
];

/** SCs that axe-core rules map to; used to annotate axe scans so coverage is traceable. */
export const AXE_MAPPED_CRITERIA = [
  '1.1.1', '1.3.1', '1.3.5', '1.4.1', '1.4.3', '1.4.4', '1.4.12', '2.1.1', '2.2.1', '2.2.2',
  '2.4.1', '2.4.2', '2.4.4', '2.5.3', '2.5.8', '3.1.1', '3.1.2', '3.3.2', '4.1.2',
];
