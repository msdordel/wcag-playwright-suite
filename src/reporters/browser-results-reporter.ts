import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig, Reporter, Suite, TestCase } from '@playwright/test/reporter';
import { ALL_SITES, PAGES } from '../../data/pages';
import { compareSc, criterion, findingsFrom, understandingUrl, TEST_ERROR, type Finding } from './failure-details';
import { adviceFor } from './fix-advice';

/**
 * Writes reports/browser-results.{md,html,json}: pass/fail counts per browser, per site and browser,
 * failures per WCAG criterion and browser, a test-by-browser matrix, and every failure explained
 * (criterion, what is wrong, affected elements). The coverage report answers "which criteria fail";
 * this one answers "where, in which browser, and why".
 */
type Status = 'passed' | 'failed' | 'flaky' | 'skipped';
type Counts = Record<Status, number>;

const BROWSER_NAMES: Record<string, string> = {
  chromium: 'Chromium (Chrome, Edge)',
  firefox: 'Firefox',
  webkit: 'WebKit (Safari)',
};
const ICON: Record<Status, string> = { passed: '✅ Pass', failed: '❌ Fail', flaky: '⚠️ Flaky', skipped: '⏭ Skip' };
const OTHER = 'Site-independent';
const NOT_WCAG = 'Not a WCAG criterion';
const ERRORS = 'Test errors (timeouts, crashes): not accessibility findings';
/** Why many cells read "Not run". Matches the engine strategy in playwright.config.ts. */
const COVERAGE_NOTE =
  'Firefox and WebKit run only the keyboard, form and dialog tests, because those behave differently by engine. ' +
  'axe, zoom/reflow, structure and content checks inspect the page itself and give the same answer in every engine, so they run once, in Chromium. ' +
  "Screen-reader transcripts read Chromium's accessibility tree, so they run in Chromium only.";
const RATE_NOTE = 'Compare pass rates only for tests that ran in both browsers.';

const empty = (): Counts => ({ passed: 0, failed: 0, flaky: 0, skipped: 0 });
const ran = (c: Counts) => c.passed + c.failed + c.flaky;
const rate = (c: Counts) => (ran(c) ? `${Math.round(((c.passed + c.flaky) / ran(c)) * 100)}%` : '–');

interface Cell {
  status: Status;
  findings: Finding[];
}

interface Row {
  file: string;
  title: string;
  site: string;
  /** The page the test ran against, when the title identifies one. */
  url?: string;
  byBrowser: Map<string, Cell>;
}

/** This check's outcome in one browser. 'other' = the test failed there, but not with this problem. */
type CheckStatus = 'failed' | 'passed' | 'skipped' | 'flaky' | 'other' | 'not-run';

/** One problem, merged across the browsers it occurred in. */
interface FailureRow {
  test: string;
  site: string;
  url?: string;
  statuses: Map<string, CheckStatus>;
  finding: Finding;
}

interface Data {
  date: string;
  browsers: string[];
  byBrowser: Map<string, Counts>;
  bySite: Map<string, Map<string, Counts>>;
  sites: string[];
  /** SC id (or NOT_WCAG) → browser → tests that passed, failed or were skipped for that criterion. */
  bySc: Map<string, Map<string, Counts>>;
  sorted: Row[];
  failures: FailureRow[];
  total: Counts;
}

export default class BrowserResultsReporter implements Reporter {
  private root?: Suite;
  private browsers: string[] = [];
  constructor(private opts: { outputDir?: string } = {}) {}

  onBegin(config: FullConfig, suite: Suite) {
    this.root = suite;
    this.browsers = config.projects.map((p) => p.name);
  }

  onEnd() {
    if (!this.root) return;
    const rows = new Map<string, Row>();
    const byBrowser = new Map(this.browsers.map((b) => [b, empty()]));
    const bySite = new Map<string, Map<string, Counts>>();
    const bySc = new Map<string, Map<string, Counts>>();

    for (const t of this.root.allTests()) {
      const browser = t.parent.project()?.name ?? 'unknown';
      const status = statusOf(t);
      const file = path.relative('tests', t.location.file);
      const title = t.titlePath().slice(3).join(' › ');
      const site = ALL_SITES.find((s) => title.includes(`${s.name} ›`) || title.includes(`${s.name}:`) || title.endsWith(s.name))?.name ?? OTHER;

      const testScs = t.annotations.filter((a) => a.type === 'wcag').map((a) => a.description!);
      const messages = status === 'failed' ? (t.results.at(-1)?.errors ?? []).map((e) => e.message ?? e.value ?? '') : [];
      const findings = findingsFrom(messages, testScs);

      const key = `${file}::${title}`;
      const row = rows.get(key) ?? { file, title, site, url: pageUrl(title, site), byBrowser: new Map() };
      row.byBrowser.set(browser, { status, findings });
      rows.set(key, row);

      if (!byBrowser.has(browser)) byBrowser.set(browser, empty());
      byBrowser.get(browser)![status]++;
      if (!bySite.has(site)) bySite.set(site, new Map());
      const siteCounts = bySite.get(site)!;
      if (!siteCounts.has(browser)) siteCounts.set(browser, empty());
      siteCounts.get(browser)![status]++;

      // Per criterion, a test passes unless one of its findings names that criterion, matching the
      // coverage report's attribution. Untagged failures (content quality) count under NOT_WCAG.
      const failedIds = new Set(findings.flatMap((f) => (f.scs.length ? f.scs : [f.source === TEST_ERROR ? ERRORS : NOT_WCAG])));
      // A test that errored gave no verdict on its criteria, so they count as neither passed nor failed.
      const errored = findings.some((f) => f.source === TEST_ERROR);
      for (const id of new Set([...(errored ? [] : testScs), ...failedIds])) {
        if (!bySc.has(id)) bySc.set(id, new Map());
        const m = bySc.get(id)!;
        if (!m.has(browser)) m.set(browser, empty());
        const outcome: Status = status === 'skipped' ? 'skipped' : failedIds.has(id) ? 'failed' : status === 'flaky' ? 'flaky' : 'passed';
        m.get(browser)![outcome]++;
      }
    }

    // Failures first, then flaky, so the rows that need attention lead the matrix.
    const weight = (r: Row) => {
      const s = [...r.byBrowser.values()].map((x) => x.status);
      return s.includes('failed') ? 0 : s.includes('flaky') ? 1 : 2;
    };
    const sorted = [...rows.values()].sort((a, b) => weight(a) - weight(b) || a.file.localeCompare(b.file) || a.title.localeCompare(b.title));
    const sites = [...ALL_SITES.map((s) => s.name), OTHER].filter((s) => bySite.has(s));
    const total = [...byBrowser.values()].reduce((acc, c) => (Object.keys(acc).forEach((k) => (acc[k as Status] += c[k as Status])), acc), empty());

    const data: Data = {
      date: new Date().toISOString().slice(0, 10),
      browsers: this.browsers,
      byBrowser,
      bySite,
      sites,
      bySc: new Map([...bySc].sort(([a], [b]) => (/^\d/.test(a) && /^\d/.test(b) ? compareSc(a, b) : /^\d/.test(a) ? -1 : /^\d/.test(b) ? 1 : a.localeCompare(b)))),
      sorted,
      failures: mergeAcrossBrowsers(sorted, this.browsers),
      total,
    };
    const outDir = this.opts.outputDir ?? 'reports';
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'browser-results.md'), markdown(data));
    fs.writeFileSync(path.join(outDir, 'browser-results.html'), html(data));
    fs.writeFileSync(
      path.join(outDir, 'browser-results.json'),
      JSON.stringify(
        {
          date: data.date,
          byBrowser: Object.fromEntries(byBrowser),
          bySite: Object.fromEntries([...bySite].map(([s, m]) => [s, Object.fromEntries(m)])),
          bySc: Object.fromEntries([...data.bySc].map(([s, m]) => [s, Object.fromEntries(m)])),
          failures: data.failures.map((f) => ({ ...f, statuses: Object.fromEntries(f.statuses) })),
          tests: sorted.map((r) => ({ file: r.file, title: r.title, site: r.site, results: Object.fromEntries(r.byBrowser) })),
        },
        null,
        2,
      ),
    );
  }

  printsToStdio() {
    return false;
  }
}

function statusOf(t: TestCase): Status {
  const o = t.outcome();
  return o === 'expected' ? 'passed' : o === 'skipped' ? 'skipped' : o === 'flaky' ? 'flaky' : 'failed';
}

/** URL of the page a test title names (longest match wins), else the site's first page. */
function pageUrl(title: string, site: string): string | undefined {
  const page = PAGES.filter((p) => title.includes(p.name)).sort((a, b) => b.name.length - a.name.length)[0];
  return page?.path ?? siteUrl(site);
}

function siteUrl(site: string): string | undefined {
  const s = ALL_SITES.find((x) => x.name === site);
  return s && new URL(s.pages[0].path, s.origin).href;
}

/**
 * The same problem in Chromium, Firefox and WebKit becomes one row with a status per browser.
 * Engines can report slightly different element lists for one problem, so details are merged.
 */
function mergeAcrossBrowsers(rows: Row[], browsers: string[]): FailureRow[] {
  const out: FailureRow[] = [];
  for (const r of rows) {
    const merged = new Map<string, { finding: Finding; failedIn: Set<string> }>();
    for (const b of browsers) {
      for (const f of r.byBrowser.get(b)?.findings ?? []) {
        const key = JSON.stringify([f.scs, f.what, f.source]);
        const m = merged.get(key);
        if (!m) {
          merged.set(key, { finding: { ...f, details: [...f.details] }, failedIn: new Set([b]) });
          continue;
        }
        m.failedIn.add(b);
        const added = f.details.filter((x) => !m.finding.details.includes(x));
        m.finding.details.push(...added);
        m.finding.more = Math.max(m.finding.more, f.more);
      }
    }
    for (const { finding, failedIn } of merged.values()) {
      const statuses = new Map<string, CheckStatus>(
        browsers.map((b) => {
          const cell = r.byBrowser.get(b);
          if (!cell) return [b, 'not-run'];
          if (failedIn.has(b)) return [b, 'failed'];
          return [b, cell.status === 'failed' ? 'other' : cell.status];
        }),
      );
      const extra = Math.max(0, finding.details.length - 8);
      out.push({ test: r.title, site: r.site, url: r.url, statuses, finding: { ...finding, details: finding.details.slice(0, 8), more: finding.more + extra } });
    }
  }
  return out;
}

const CHECK_TEXT: Record<CheckStatus, string> = {
  failed: '❌ Fail',
  passed: '✅ Pass',
  skipped: '⏭ Skip',
  flaky: '⚠️ Flaky',
  other: 'Not found*',
  'not-run': 'Not run',
};
const CHECK_NOTE =
  '*Not found: the test failed in that browser on a different check, so this check either passed there or did not run because the test stopped first.';

const label = (b: string) => BROWSER_NAMES[b] ?? b;
const shortLabel = (b: string) => label(b).replace(/ \(.*\)$/, '');
const scTitle = (id: string) => {
  const c = criterion(id);
  return c ? `${id} ${c.name} (${c.level})` : id;
};
const scStatus = (m: Map<string, Counts>, id = '') => {
  const all = [...m.values()];
  if (id === ERRORS) return '⚠️ Errors';
  return all.some((c) => c.failed) ? ICON.failed : all.some((c) => c.passed || c.flaky) ? ICON.passed : ICON.skipped;
};
const cellText = (c?: Counts) => (c ? `✅ ${c.passed} · ❌ ${c.failed}${c.flaky ? ` · ⚠️ ${c.flaky}` : ''}${c.skipped ? ` · ⏭ ${c.skipped}` : ''}` : 'Not run');
const failedScs = (cell: Cell) => [...new Set(cell.findings.flatMap((f) => f.scs))].sort(compareSc);
const shortUrl = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');
/** Failures grouped by test, in report order, so each test's page and title are shown once. */
function byTest(failures: FailureRow[]): { test: string; url?: string; items: FailureRow[] }[] {
  const groups: { test: string; url?: string; items: FailureRow[] }[] = [];
  for (const f of failures) {
    const last = groups.at(-1);
    if (last?.test === f.test) last.items.push(f);
    else groups.push({ test: f.test, url: f.url, items: [f] });
  }
  return groups;
}

/** "selector — what is wrong with it" → [selector, issue]. */
const splitDetail = (x: string): [string, string?] => {
  const i = x.indexOf(' — ');
  return i < 0 ? [x] : [x.slice(0, i), x.slice(i + 3)];
};

const sumCounts = (cs: Counts[]) => cs.reduce((acc, c) => ({ passed: acc.passed + c.passed, failed: acc.failed + c.failed, flaky: acc.flaky + c.flaky, skipped: acc.skipped + c.skipped }), empty());

/**
 * Horizontal stacked bars of test counts on one shared scale, in fixed order pass → fail → skip.
 * Bars are decorative (aria-hidden); every value is in the text beside the bar and in the table below.
 */
function chart(title: string, rows: { name: string; counts: Counts }[]): string {
  const max = Math.max(1, ...rows.map((r) => ran(r.counts) + r.counts.skipped));
  const pct = (n: number) => `${((n / max) * 100).toFixed(2)}%`;
  const seg = (cls: string, n: number, what: string, name: string) => (n ? `<span class="seg ${cls}" style="width:${pct(n)}" title="${esc(name)}: ${n} ${what}"></span>` : '');
  return `<figure class="chart">
<figcaption>${esc(title)}</figcaption>
<ul class="legend" aria-label="Legend"><li><span class="sw pass"></span>✓ Passed</li><li><span class="sw fail"></span>✗ Failed</li><li><span class="sw skip"></span>Skipped</li></ul>
<div class="bars">
${rows
  .map(({ name, counts: c }) => {
    const passed = c.passed + c.flaky;
    return `<span class="bar-label">${esc(name)}</span><span class="bar" aria-hidden="true">${seg('pass', passed, 'passed', name)}${seg('fail', c.failed, 'failed', name)}${seg('skip', c.skipped, 'skipped', name)}</span><span class="bar-value">✓ ${passed} passed · ✗ ${c.failed} failed${c.skipped ? ` · ${c.skipped} skipped` : ''}</span>`;
  })
  .join('\n')}
</div>
</figure>`;
}

const noScLabel = (f: Finding) => (f.source === TEST_ERROR ? 'Test error (no accessibility verdict)' : NOT_WCAG);
const scIdLink = (id: string) => (understandingUrl(id) ? `[${id}](${understandingUrl(id)})` : id);
const md = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function markdown(d: Data): string {
  const head = (cols: string[]) => [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`];
  const scLink = (id: string) => (understandingUrl(id) ? `[${scTitle(id)}](${understandingUrl(id)})` : scTitle(id));
  return [
    `# Results by browser — ${d.date}`,
    '',
    '## Summary',
    ...head(['Browser', 'Passed', 'Failed', 'Flaky', 'Skipped', 'Pass rate']),
    ...d.browsers.map((b) => {
      const c = d.byBrowser.get(b)!;
      return `| ${label(b)} | ${c.passed} | ${c.failed} | ${c.flaky} | ${c.skipped} | ${rate(c)} |`;
    }),
    `| **All** | **${d.total.passed}** | **${d.total.failed}** | **${d.total.flaky}** | **${d.total.skipped}** | **${rate(d.total)}** |`,
    '',
    `> ${COVERAGE_NOTE} ${RATE_NOTE}`,
    '',
    '## By site',
    ...head(['Site', ...d.browsers.map(label)]),
    ...d.sites.map((s) => `| ${siteUrl(s) ? `[${s}](${siteUrl(s)})` : s} | ${d.browsers.map((b) => cellText(d.bySite.get(s)!.get(b))).join(' | ')} |`),
    '',
    '## Results by WCAG criterion',
    'Tests that passed and failed for each criterion, per browser.',
    '',
    ...head(['WCAG criterion', 'Status', ...d.browsers.map(label)]),
    ...[...d.bySc].map(([id, m]) => `| ${/^\d/.test(id) ? scLink(id) : id} | ${scStatus(m, id)} | ${d.browsers.map((b) => (id === ERRORS && !m.get(b) ? 'None' : cellText(m.get(b)))).join(' | ')} |`),
    '',
    '## Failures explained',
    ...(d.failures.length
      ? [
          ...byTest(d.failures).flatMap(({ test, url, items }) => [
            `### ${test}`,
            ...(url ? [`Page: [${shortUrl(url)}](${url})`, ''] : ['']),
            ...items.flatMap(({ statuses, finding: f }) => {
              const fix = adviceFor(f);
              return [
                `- **${f.scs.length ? f.scs.map(scLink).join(', ') : noScLabel(f)}**: ${f.what}${f.source ? ` _(${f.link ? `[${f.source}](${f.link})` : f.source})_` : ''}`,
                `  ${d.browsers.map((b) => `${shortLabel(b)}: ${CHECK_TEXT[statuses.get(b)!]}`).join(' · ')}`,
                ...f.details.map((x) => {
                  const [target, issue] = splitDetail(x);
                  return `  - \`${target}\`${issue ? `: ${issue}` : ''}`;
                }),
                ...(f.more ? [`  - …and ${f.more} more`] : []),
                `  - **How to fix:** ${fix.text}${fix.link ? ` [More](${fix.link})` : ''}`,
              ];
            }),
            '',
          ]),
          CHECK_NOTE,
        ]
      : ['None.']),
    '',
    '## Every test',
    `“Not run” means the test isn't run in that browser by design. ${COVERAGE_NOTE}`,
    '',
    ...head(['Test', 'Page', ...d.browsers.map(label)]),
    ...d.sorted.map((r) => {
      const cells = d.browsers.map((b) => {
        const c = r.byBrowser.get(b);
        if (!c) return 'Not run';
        const scs = failedScs(c);
        return c.status === 'failed' && scs.length ? `${ICON.failed} (${scs.map(scIdLink).join(', ')})` : ICON[c.status];
      });
      return `| ${md(r.title)} | ${r.url ? `[${shortUrl(r.url)}](${r.url})` : '–'} | ${cells.join(' | ')} |`;
    }),
    '',
  ].join('\n');
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function html(d: Data): string {
  const scLink = (id: string) => {
    const url = understandingUrl(id);
    return url ? `<a href="${url}">${esc(scTitle(id))}</a>` : esc(scTitle(id));
  };
  const statusCell = (c?: Cell) => {
    if (!c) return '<td class="na">Not run</td>';
    const scs = failedScs(c);
    const extra = c.status === 'failed' && scs.length ? `<br><small>${scs.map(scIdAnchor).join(', ')}</small>` : '';
    return `<td class="s-${c.status}">${ICON[c.status]}${extra}</td>`;
  };
  const countsCell = (c?: Counts) =>
    c
      ? `<td><span>${c.passed} passed</span>, <span class="${c.failed ? 'fail' : ''}">${c.failed} failed</span>${c.flaky ? `, ${c.flaky} flaky` : ''}${c.skipped ? `, ${c.skipped} skipped` : ''}</td>`
      : '<td class="na">Not run</td>';
  /** Bare SC number linked to its Understanding page; the full name is in the accessible name and tooltip. */
  const scIdAnchor = (id: string) => {
    const url = understandingUrl(id);
    return url ? `<a href="${url}" aria-label="${esc(scTitle(id))}" title="${esc(scTitle(id))}">${esc(id)}</a>` : esc(id);
  };
  const pageLink = (url?: string) => (url ? `<a href="${esc(url)}">${esc(shortUrl(url))}</a>` : '–');
  const statusChip = (b: string, s: CheckStatus) =>
    `<span class="chip ${s === 'failed' ? 's-failed' : s === 'passed' ? 's-passed' : s === 'flaky' ? 's-flaky' : 'na'}">${esc(shortLabel(b))}: ${CHECK_TEXT[s]}</span>`;
  const problem = ({ statuses, finding: f }: FailureRow) => {
    const fix = adviceFor(f);
    const elements = f.details.length
      ? `<ul class="els">${f.details
          .map((x) => {
            const [target, issue] = splitDetail(x);
            return `<li><code>${esc(target)}</code>${issue ? `<span>${esc(issue)}</span>` : ''}</li>`;
          })
          .join('')}${f.more ? `<li class="na">…and ${f.more} more</li>` : ''}</ul>`
      : '';
    return `<li class="problem">
<div class="p-head"><span class="crit">${f.scs.length ? f.scs.map(scLink).join(' · ') : esc(noScLabel(f))}</span><span class="chips">${d.browsers.map((b) => statusChip(b, statuses.get(b)!)).join('')}</span></div>
<p class="p-what"><strong>${esc(f.what)}</strong>${f.source ? ` <small>${f.link ? `<a href="${esc(f.link)}">${esc(f.source)}</a>` : esc(f.source)}</small>` : ''}</p>
${elements}
<p class="p-fix"><span class="fix-label">How to fix</span> ${esc(fix.text)}${fix.link ? ` <a href="${esc(fix.link)}" aria-label="More about how to fix this">More</a>` : ''}</p>
</li>`;
  };
  const failureGroups = () =>
    byTest(d.failures)
      .map(
        ({ test, url, items }, i) => `<section class="fx" aria-labelledby="fx-${i}">
<h3 id="fx-${i}">${esc(test)}</h3>
<p class="meta">${url ? `${pageLink(url)} · ` : ''}${items.length} problem${items.length === 1 ? '' : 's'}</p>
<ul class="problems">
${items.map(problem).join('\n')}
</ul>
</section>`,
      )
      .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Results by browser – ${d.date}</title>
<style>
  :root { color-scheme: light dark; --bg: #fff; --fg: #1b1b1b; --muted: #5c5c5c; --line: #d6d6d6; --head: #f2f2f2; --link: #0b57d0;
          --pass-bg: #e6f4ea; --pass-fg: #0f5c2e; --fail-bg: #fde8e8; --fail-fg: #8a1414; --flaky-bg: #fff4d6; --flaky-fg: #6b4a00; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #161616; --fg: #ececec; --muted: #b0b0b0; --line: #3a3a3a; --head: #222; --link: #8ab4f8;
            --pass-bg: #12311d; --pass-fg: #9be3b4; --fail-bg: #3d1515; --fail-fg: #ffb3b3; --flaky-bg: #3a2e0a; --flaky-fg: #ffd97a; }
  }
  body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
  main { max-width: 1440px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; } h2 { font-size: 1.2rem; margin: 32px 0 8px; }
  p.meta { color: var(--muted); margin: 0 0 16px; }
  a { color: var(--link); }
  nav ul { display: flex; flex-wrap: wrap; gap: 4px 16px; list-style: none; padding: 0; margin: 0 0 8px; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; }
  caption { text-align: left; color: var(--muted); padding: 0 0 6px; }
  th, td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; vertical-align: top; }
  thead th { background: var(--head); position: sticky; top: 0; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .s-passed { background: var(--pass-bg); color: var(--pass-fg); white-space: nowrap; }
  .s-failed { background: var(--fail-bg); color: var(--fail-fg); font-weight: 600; }
  .s-failed small { font-weight: normal; }
  .s-flaky  { background: var(--flaky-bg); color: var(--flaky-fg); white-space: nowrap; }
  .s-skipped, .na { color: var(--muted); white-space: nowrap; }
  .fail { color: var(--fail-fg); font-weight: 600; }
  tbody th { font-weight: normal; }
  td ul { margin: 0; padding-left: 18px; }
  td a { overflow-wrap: anywhere; }
  code { font-size: 0.85em; white-space: pre-wrap; word-break: break-word; }
  .fx { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 20px; }
  .fx h3 { font-size: 1.05rem; margin: 0 0 2px; text-wrap: balance; }
  .fx > .meta { margin: 0 0 8px; overflow-wrap: anywhere; }
  .problems { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .problem { border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; display: grid; gap: 6px; min-width: 0; }
  .p-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; align-items: baseline; }
  .crit { font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { font-size: 0.8em; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); white-space: nowrap; }
  .p-what, .p-fix { margin: 0; max-width: 75ch; }
  .els { margin: 0; padding-left: 18px; display: grid; gap: 2px; }
  .els li { overflow-wrap: anywhere; }
  .els code { font-size: 0.85em; }
  .els span { color: var(--muted); }
  .els span::before { content: " — "; }
  .p-fix { background: color-mix(in srgb, var(--link) 7%, transparent); border-radius: 4px; padding: 6px 8px; }
  .fix-label { font-weight: 600; margin-right: 4px; }
  /* Charts: status colours (fixed in both modes) plus icon + text, since green/red alone fail colour-blind separation. */
  :root { --good: #0ca30c; --critical: #d03b3b; --skip: #8a897f; --track: #e1e0d9; }
  @media (prefers-color-scheme: dark) { :root { --track: #2c2c2a; } }
  figure.chart { margin: 8px 0 16px; padding: 0; }
  figure.chart figcaption { font-weight: 600; margin-bottom: 6px; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0 0 10px; padding: 0; list-style: none; color: var(--muted); font-size: 0.9em; }
  .legend li { display: inline-flex; align-items: center; gap: 6px; }
  .sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  .bars { display: grid; grid-template-columns: minmax(120px, max-content) minmax(160px, 1fr) minmax(170px, max-content); gap: 6px 12px; align-items: center; }
  .bars > * { min-width: 0; }
  .bar { display: flex; gap: 2px; height: 20px; }
  .seg { height: 100%; min-width: 2px; }
  .seg:last-child { border-radius: 0 4px 4px 0; }
  .seg.pass, .sw.pass { background: var(--good); }
  .seg.fail, .sw.fail { background: var(--critical); }
  .seg.skip, .sw.skip { background: var(--skip); }
  .bar-label { white-space: nowrap; }
  .bar-value { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 0.9em; }
  @media (max-width: 640px) { .bars { grid-template-columns: minmax(0, 1fr); } .bar-label { white-space: normal; } .bar-value { margin-bottom: 8px; white-space: normal; } }
  @media (forced-colors: active), print {
    .seg, .sw { forced-color-adjust: none; border: 1px solid CanvasText; }
    .seg.fail, .sw.fail { background: repeating-linear-gradient(45deg, var(--critical) 0 3px, #fff 3px 6px); }
  }
  label { display: inline-flex; gap: 6px; align-items: center; margin: 4px 0 10px; }
  :focus-visible { outline: 3px solid var(--link); outline-offset: 2px; }
</style>
</head>
<body>
<main>
<h1>Results by browser</h1>
<p class="meta">Run of ${d.date} · ${d.total.passed} passed, ${d.total.failed} failed, ${d.total.flaky} flaky, ${d.total.skipped} skipped</p>
<nav aria-label="Sections"><ul>
  <li><a href="#summary">Summary</a></li><li><a href="#by-site">By site</a></li><li><a href="#by-sc">Results by WCAG criterion</a></li>
  <li><a href="#failures">Failures explained</a></li><li><a href="#every-test">Every test</a></li>
</ul></nav>

<h2 id="summary">Summary</h2>
${chart('Passes and fails by browser', d.browsers.map((b) => ({ name: label(b), counts: d.byBrowser.get(b)! })))}
<div class="scroll" role="region" tabindex="0" aria-labelledby="summary"><table aria-labelledby="summary">
<thead><tr><th scope="col">Browser</th><th scope="col">Passed</th><th scope="col">Failed</th><th scope="col">Flaky</th><th scope="col">Skipped</th><th scope="col">Pass rate</th></tr></thead>
<tbody>
${d.browsers
  .map((b) => {
    const c = d.byBrowser.get(b)!;
    return `<tr><th scope="row">${esc(label(b))}</th><td class="num">${c.passed}</td><td class="num${c.failed ? ' fail' : ''}">${c.failed}</td><td class="num">${c.flaky}</td><td class="num">${c.skipped}</td><td class="num">${rate(c)}</td></tr>`;
  })
  .join('\n')}
<tr><th scope="row"><strong>All browsers</strong></th><td class="num"><strong>${d.total.passed}</strong></td><td class="num fail">${d.total.failed}</td><td class="num">${d.total.flaky}</td><td class="num">${d.total.skipped}</td><td class="num"><strong>${rate(d.total)}</strong></td></tr>
</tbody></table></div>
<p class="meta">${COVERAGE_NOTE} ${RATE_NOTE}</p>

<h2 id="by-site">By site</h2>
${chart('Passes and fails by site, all browsers', d.sites.map((s) => ({ name: s, counts: sumCounts([...d.bySite.get(s)!.values()]) })))}
<div class="scroll" role="region" tabindex="0" aria-labelledby="by-site"><table aria-labelledby="by-site">
<thead><tr><th scope="col">Site</th>${d.browsers.map((b) => `<th scope="col">${esc(label(b))}</th>`).join('')}</tr></thead>
<tbody>
${d.sites.map((s) => `<tr><th scope="row">${siteUrl(s) ? `<a href="${esc(siteUrl(s)!)}">${esc(s)}</a>` : esc(s)}</th>${d.browsers.map((b) => countsCell(d.bySite.get(s)!.get(b))).join('')}</tr>`).join('\n')}
</tbody></table></div>

<h2 id="by-sc">Results by WCAG criterion</h2>
${chart('Passes and fails by WCAG criterion, all browsers', [...d.bySc].map(([id, m]) => ({ name: /^\d/.test(id) ? `${id} ${criterion(id)?.name ?? ''}` : id, counts: sumCounts([...m.values()]) })))}
<div class="scroll" role="region" tabindex="0" aria-labelledby="by-sc"><table aria-labelledby="by-sc">
<caption>Tests that passed and failed for each criterion, per browser. Each criterion links to W3C's explanation of what it requires.</caption>
<thead><tr><th scope="col">WCAG criterion</th><th scope="col">Status</th>${d.browsers.map((b) => `<th scope="col">${esc(label(b))}</th>`).join('')}</tr></thead>
<tbody>
${[...d.bySc]
  .map(([id, m]) => {
    const st = scStatus(m, id);
    const cls = st === ICON.failed ? 's-failed' : st === ICON.passed ? 's-passed' : 'na';
    return `<tr><th scope="row">${/^\d/.test(id) ? scLink(id) : esc(id)}</th><td class="${cls}">${st}</td>${d.browsers.map((b) => (id === ERRORS && !m.get(b) ? '<td class="na">None</td>' : countsCell(m.get(b)))).join('')}</tr>`;
  })
  .join('\n')}
</tbody></table></div>

<h2 id="failures">Failures explained</h2>
${
  d.failures.length
    ? `<p class="meta">Grouped by test. Each problem shows its WCAG criterion, its status in each browser, the affected elements and how to fix it. A problem found in several browsers is listed once. ${CHECK_NOTE}</p>
${failureGroups()}`
    : '<p>None.</p>'
}

<h2 id="every-test">Every test</h2>
<label><input type="checkbox" id="only-failed"> Show only tests that failed in at least one browser</label>
<div class="scroll" role="region" tabindex="0" aria-labelledby="every-test"><table aria-labelledby="every-test" id="matrix">
<caption>Failed cells list the WCAG criteria that failed. “Not run” means the test isn't run in that browser by design.</caption>
<thead><tr><th scope="col">Test</th><th scope="col">Page</th>${d.browsers.map((b) => `<th scope="col">${esc(label(b))}</th>`).join('')}</tr></thead>
<tbody>
${d.sorted
  .map((r) => {
    const failed = [...r.byBrowser.values()].some((x) => x.status === 'failed');
    return `<tr${failed ? ' data-failed' : ''}><th scope="row">${esc(r.title)}<br><small class="na">${esc(r.file)}</small></th><td>${pageLink(r.url)}</td>${d.browsers.map((b) => statusCell(r.byBrowser.get(b))).join('')}</tr>`;
  })
  .join('\n')}
</tbody></table></div>
</main>
<script>
  const box = document.getElementById('only-failed');
  box.addEventListener('change', () => {
    for (const tr of document.querySelectorAll('#matrix tbody tr')) tr.hidden = box.checked && !tr.hasAttribute('data-failed');
  });
</script>
</body>
</html>
`;
}
