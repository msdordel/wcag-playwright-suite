import type { Result } from 'axe-core';

/**
 * Waiver register: known violations accepted temporarily. Each waiver MUST have a
 * ticket, a reason, and an expiry. After the expiry date the waiver stops applying
 * and the build fails again. tests/governance/waivers.spec.ts enforces these rules.
 */
export interface Waiver {
  /** axe rule id, e.g. 'color-contrast' */
  rule: string;
  /** Substring matched against the axe node target selector. Omit to waive the rule for the matched URLs. */
  target?: string;
  /** Only applies on URLs matching this pattern. Omit for all pages. */
  url?: RegExp;
  ticket: string;
  reason: string;
  /** ISO date (YYYY-MM-DD). */
  expires: string;
  approvedBy: string;
}

export const WAIVERS: Waiver[] = [
  // {
  //   rule: 'color-contrast',
  //   target: '.vendor-chat-widget',
  //   ticket: 'A11Y-123',
  //   reason: 'Third-party chat widget; vendor fix committed for v5.2',
  //   expires: '2026-12-31',
  //   approvedBy: 'Accessibility Lead',
  // },
];

export function isExpired(w: Waiver, today = new Date()): boolean {
  return new Date(`${w.expires}T23:59:59Z`) < today;
}

export function applyWaivers(violations: Result[], url: string, waivers = WAIVERS) {
  const active = waivers.filter((w) => !isExpired(w) && (!w.url || w.url.test(url)));
  const blocking: Result[] = [];
  const waived: { rule: string; ticket: string; nodes: number }[] = [];

  for (const v of violations) {
    const matching = active.filter((w) => w.rule === v.id);
    const remaining = v.nodes.filter((node) => {
      const target = node.target.join(' ');
      const w = matching.find((m) => !m.target || target.includes(m.target));
      if (w) {
        const entry = waived.find((x) => x.ticket === w.ticket && x.rule === v.id);
        entry ? entry.nodes++ : waived.push({ rule: v.id, ticket: w.ticket, nodes: 1 });
      }
      return !w;
    });
    if (remaining.length) blocking.push({ ...v, nodes: remaining });
  }
  return { blocking, waived };
}
