/**
 * Conformance target. Default is WCAG 2.2 AA; override per environment with WCAG_TARGET.
 * (Section 508 legally references WCAG 2.0 AA — testing to 2.2 AA is a superset.)
 */
export type WcagTarget = '2.0-AA' | '2.1-AA' | '2.2-AA';

export const WCAG_TARGET = (process.env.WCAG_TARGET ?? '2.2-AA') as WcagTarget;

const AXE_TAGS: Record<WcagTarget, string[]> = {
  '2.0-AA': ['wcag2a', 'wcag2aa'],
  '2.1-AA': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  '2.2-AA': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
};

/** axe tags that gate the build. `best-practice` is deliberately excluded: not a WCAG failure. */
export function axeTags(target: WcagTarget = WCAG_TARGET): string[] {
  return AXE_TAGS[target];
}

/**
 * Regions excluded from EVERY scan. Keep this empty. A strict org should record each
 * exception as a ticketed, expiring waiver (see waivers.ts) instead of hiding it here.
 */
export const GLOBAL_EXCLUDES: string[] = [];

/** Content allowed to scroll in two dimensions under 1.4.10 Reflow (data tables, maps, diagrams). */
export const REFLOW_EXEMPT = ['table', '[data-reflow-exempt]', 'pre', 'code', '[role="application"]'];
