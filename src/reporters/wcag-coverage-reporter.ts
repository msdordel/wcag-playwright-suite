import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig, Reporter, Suite } from '@playwright/test/reporter';
import { CRITERIA } from '../a11y/wcag-criteria';
import { WCAG_TARGET } from '../a11y/config';

/**
 * Writes reports/wcag-coverage.{md,json}: one row for each WCAG A/AA criterion, giving
 * automated evidence, pass/fail, and whether a manual audit is still required.
 * Use it as input to your ACR/VPAT and audit packet. It is not a conformance claim.
 */
type Row = { tests: number; passed: number; failed: number; failures: string[] };

export default class WcagCoverageReporter implements Reporter {
  private root?: Suite;
  constructor(private opts: { outputDir?: string } = {}) {}

  onBegin(_config: FullConfig, suite: Suite) {
    this.root = suite;
  }

  onEnd() {
    if (!this.root) return;
    const rows = new Map<string, Row>(CRITERIA.map((c) => [c.id, { tests: 0, passed: 0, failed: 0, failures: [] }]));
    const manualReview = new Set<string>();

    for (const t of this.root.allTests()) {
      const outcome = t.outcome();
      if (outcome === 'skipped') continue;
      const lastRun = t.results.at(-1);
      // Runtime annotations live on the result in newer Playwright and on the test in older versions.
      for (const a of [...(lastRun?.annotations ?? []), ...t.annotations]) {
        if (a.type === 'needs-manual-review' && a.description) manualReview.add(`${t.title}: ${a.description}`);
      }
      // A test can cover several SCs. When an error message names specific SCs (as the
      // soft assertions in this suite do), only those SCs fail; otherwise all of them do.
      const scIds = t.annotations.filter((x) => x.type === 'wcag').map((x) => x.description!);
      const errorText = (lastRun?.errors ?? []).map((e) => e.message ?? '').join('\n');
      const named = scIds.filter((id) => new RegExp(`(^|[^\\d.])${id.replace(/\./g, '\\.')}(?![\\d])`).test(errorText));
      for (const id of scIds) {
        const row = rows.get(id);
        if (!row) continue;
        row.tests++;
        const failedHere = outcome !== 'expected' && outcome !== 'flaky' && (named.length === 0 || named.includes(id));
        if (!failedHere) row.passed++;
        else {
          row.failed++;
          row.failures.push(`${t.parent.project()?.name ?? ''} › ${t.titlePath().slice(2).join(' › ')}`);
        }
      }
    }

    const status = (id: string) => {
      const r = rows.get(id)!;
      const c = CRITERIA.find((x) => x.id === id)!;
      if (r.failed) return '❌ Fails';
      if (c.automation === 'manual') return '🔍 Manual audit required';
      if (!r.tests) return '⚠️ No automated coverage';
      return c.automation === 'automated' ? '✅ Passes (tested states)' : '🟡 Automated checks pass; manual audit required';
    };

    const outDir = this.opts.outputDir ?? 'reports';
    fs.mkdirSync(outDir, { recursive: true });

    const md = [
      `# WCAG ${WCAG_TARGET} coverage — ${new Date().toISOString().slice(0, 10)}`,
      '',
      '> Automated evidence only. A criterion is not conformant until manual and assistive-technology testing confirm it.',
      '',
      '| SC | Criterion | Level | Automation | Tests | Status |',
      '|---|---|---|---|---|---|',
      ...CRITERIA.map((c) => {
        const r = rows.get(c.id)!;
        return `| ${c.id} | ${c.name} | ${c.level} | ${c.automation} | ${r.passed}/${r.tests} | ${status(c.id)} |`;
      }),
      '',
      '## Failures',
      ...[...rows].flatMap(([id, r]) => r.failures.map((f) => `- **${id}** ${f}`)),
      '',
      '## axe "incomplete" items for manual review',
      ...[...manualReview].map((m) => `- ${m}`),
    ].join('\n');

    fs.writeFileSync(path.join(outDir, 'wcag-coverage.md'), md);
    fs.writeFileSync(
      path.join(outDir, 'wcag-coverage.json'),
      JSON.stringify(CRITERIA.map((c) => ({ ...c, ...rows.get(c.id), status: status(c.id) })), null, 2),
    );
  }

  printsToStdio() {
    return false;
  }
}
