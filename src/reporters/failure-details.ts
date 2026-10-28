import { CRITERIA, type Criterion } from '../a11y/wcag-criteria';

/**
 * Turns Playwright error messages into readable findings: which WCAG criteria broke, what is
 * wrong in plain words, and which elements are affected. Relies on the suite's conventions:
 * assertion messages start with the SC id, and axe failures use formatViolations().
 */
export interface Finding {
  /** SC ids, e.g. ['1.4.3']. Empty when the failure isn't tied to a WCAG criterion. */
  scs: string[];
  what: string;
  /** Affected elements or expected/received values, capped at MAX_DETAILS. */
  details: string[];
  /** How many more details were left out. */
  more: number;
  /** For axe: rule id and impact. 'test error' for timeouts and crashes, which aren't accessibility findings. */
  source?: string;
  /** For axe: the rule's documentation page. */
  link?: string;
}

const MAX_DETAILS = 8;
export const TEST_ERROR = 'test error';
/** Infrastructure failures: the check never produced a verdict, so no criterion is blamed. */
const INFRA_ERROR = /^(Test timeout of \d+ms exceeded|.*Target page, context or browser has been closed|page\.(goto|evaluate|screenshot): |.*net::ERR_|.*SEC_ERROR_)/;
const SC_ID = /\b\d\.\d\.\d{1,2}\b/g;
const KNOWN = new Set(CRITERIA.map((c) => c.id));

export const criterion = (id: string): Criterion | undefined => CRITERIA.find((c) => c.id === id);

/** W3C "Understanding" page. The 2.2 set covers every 2.0 and 2.1 criterion except the removed 4.1.1. */
export function understandingUrl(id: string): string | undefined {
  const c = criterion(id);
  if (!c) return undefined;
  const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`;
}

export const compareSc = (a: string, b: string) => {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

export const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

/** @param fallbackScs the test's own SC tags, used when a message names no criterion. */
export function findingsFrom(messages: string[], fallbackScs: string[] = []): Finding[] {
  const findings = messages.flatMap((raw) => {
    const msg = stripAnsi(raw).replace(/^Error:\s*/, '');
    if (/^\d+ WCAG violation\(s\) on /.test(msg)) return axeFindings(msg);
    if (INFRA_ERROR.test(msg)) return [{ scs: [], what: msg.split('\n')[0], details: [], more: 0, source: TEST_ERROR }];
    return [assertionFinding(msg, fallbackScs)];
  });
  // A timeout usually arrives with the action it interrupted; report one test error, listing the rest.
  const errors = findings.filter((f) => f.source === TEST_ERROR);
  if (errors.length < 2) return findings;
  return [...findings.filter((f) => f.source !== TEST_ERROR), { ...errors[0], details: errors.slice(1).map((e) => e.what) }];
}

function axeFindings(msg: string): Finding[] {
  const out: Finding[] = [];
  const lines = msg.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s+\[(\w+)\] ([\w-]+) \(SC ([^)]*)\): (.*)$/);
    if (!m) continue;
    const [, impact, rule, scList, help] = m;
    const link = lines[i + 1]?.trim().startsWith('http') ? lines[i + 1].trim() : undefined;
    const nodes: string[] = [];
    let unlisted = 0;
    for (let j = i + 1; j < lines.length && !/^\s+\[\w+\] /.test(lines[j]); j++) {
      const node = lines[j].match(/^\s+- (.*)$/);
      const rest = node?.[1].match(/^…and (\d+) more$/);
      if (rest) unlisted = Number(rest[1]);
      else if (node) nodes.push(node[1]);
    }
    out.push({
      scs: (scList.match(SC_ID) ?? []).filter((id) => KNOWN.has(id)),
      what: help,
      details: nodes.slice(0, MAX_DETAILS),
      more: Math.max(0, nodes.length - MAX_DETAILS) + unlisted,
      source: `axe ${rule} · ${impact}`,
      link,
    });
  }
  return out;
}

function assertionFinding(msg: string, fallbackScs: string[]): Finding {
  const [first = '', ...rest] = msg.split('\n');
  const leading = first.match(/^((?:\d\.\d\.\d{1,2})(?:,\s*\d\.\d\.\d{1,2})*)\s+/);
  const named = (leading ? leading[1] : first).match(SC_ID)?.filter((id) => KNOWN.has(id)) ?? [];
  const scs = named.length ? named : first.startsWith('Content quality') ? [] : fallbackScs;

  let what = leading ? first.slice(leading[0].length) : first;
  // "Focus Visible: no visible change" → "no visible change"; the criterion name is shown separately.
  const name = scs.length ? criterion(scs[0])?.name : undefined;
  const label = what.match(/^([^:]{3,60}):\s+(.*)$/);
  if (name && label && name.toLowerCase().startsWith(label[1].toLowerCase())) what = label[2];
  what = what.charAt(0).toUpperCase() + what.slice(1);

  const items = arrayItems(rest) ?? expectedReceived(rest);
  return { scs, what, details: items.slice(0, MAX_DETAILS), more: Math.max(0, items.length - MAX_DETAILS) };
}

/** The "+ Received" side of a toEqual([]) diff: the offending elements. */
function arrayItems(lines: string[]): string[] | null {
  const start = lines.findIndex((l) => /^\+ Array \[$/.test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^\+ \]$/.test(l));
  // Multi-line strings are split across "+ " lines; rejoin with spaces so the JSON parses.
  const body = lines.slice(start + 1, end < 0 ? undefined : end).map((l) => l.replace(/^\+ ?/, '')).join(' ');
  try {
    return (JSON.parse(`[${body.replace(/,\s*$/, '')}]`) as unknown[]).map((x) => (typeof x === 'string' ? x : JSON.stringify(x)).replace(/\s+/g, ' ').trim());
  } catch {
    return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
  }
}

/** "Expected: 1" / "Received: 0" lines from locator matchers. */
function expectedReceived(lines: string[]): string[] {
  const pick = (re: RegExp) => lines.map((l) => l.match(re)?.[1]?.trim()).find(Boolean);
  const expected = pick(/^Expected(?: [a-z]+)?:\s+(.*)$/);
  const received = pick(/^Received(?: [a-z]+)?:\s+(.*)$/);
  if (!expected && !received) return [];
  return [`Found: ${received === '""' ? '(empty)' : received ?? '(nothing)'}`, ...(expected ? [`Expected: ${expected}`] : [])];
}
