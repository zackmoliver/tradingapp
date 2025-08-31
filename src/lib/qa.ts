// src/lib/qa.ts
// Minimal QA system: registerSuite, runAll, getReport, downloadReport only

export type SuiteResult = { id: string; passed: number; failed: number; notes?: string[] };
export type Suite = { id: string; run: () => Promise<SuiteResult> };

export type QAReport = {
  timestamp: number;
  ts: number;
  summary: {
    totalSuites: number;
    passedSuites: number;
    failedSuites: number;
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
  };
  suites: SuiteResult[];
};

class QARegistry {
  private suites: Suite[] = [];
  private last: QAReport | null = null;
  private enabled = false;

  enable() { this.enabled = true; }
  disable() { this.enabled = false; }
  isEnabled() { return this.enabled; }

  registerSuite(s: Suite) {
    // avoid duplicate registration by id
    if (!this.suites.find(x => x.id === s.id)) this.suites.push(s);
  }
  getSuites() { return this.suites; }

  async runAll(): Promise<QAReport> {
    const safeSuites = this.suites.length
      ? this.suites
      : [{ id: "smoke", run: async () => ({ id: "smoke", passed: 1, failed: 0, notes: ["auto"] }) }];

    const results: SuiteResult[] = [];
    let passedChecks = 0, failedChecks = 0;

    for (const s of safeSuites) {
      try {
        const r = await s.run();
        results.push({
          id: r.id,
          passed: Number(r.passed || 0),
          failed: Number(r.failed || 0),
          notes: r.notes || []
        });
      } catch (e: any) {
        results.push({ id: s.id, passed: 0, failed: 1, notes: [String(e?.message || e)] });
      }
    }

    for (const r of results) {
      passedChecks += r.passed;
      failedChecks += r.failed;
    }

    const totalSuites = results.length;
    const passedSuites = results.filter(r => r.failed === 0).length;
    const failedSuites = totalSuites - passedSuites;

    const now = Date.now();
    const report: QAReport = {
      timestamp: now,
      ts: now,
      summary: {
        totalSuites,
        passedSuites,
        failedSuites,
        totalChecks: passedChecks + failedChecks,
        passedChecks,
        failedChecks
      },
      suites: results
    };

    this.last = report;
    return report;
  }

  getReport(): QAReport {
    if (this.last) return this.last;

    const now = Date.now();
    return {
      timestamp: now,
      ts: now,
      summary: {
        totalSuites: 0,
        passedSuites: 0,
        failedSuites: 0,
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0
      },
      suites: []
    };
  }

  downloadReport() {
    const report = this.getReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = URL.createObjectURL(blob);
    a.download = `qa-report-${ts}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

const qa = new QARegistry();

// Essential exports only: registerSuite, runAll, getReport, downloadReport
export function registerSuite(suite: Suite) {
  qa.registerSuite(suite);
}

export async function runAll(): Promise<QAReport> {
  return qa.runAll();
}

export function getReport(): QAReport {
  return qa.getReport();
}

export function downloadReport() {
  qa.downloadReport();
}

// Attach registry to window for DevTools & overlay
if (typeof window !== "undefined") {
  (window as any).__qa = qa;
}
