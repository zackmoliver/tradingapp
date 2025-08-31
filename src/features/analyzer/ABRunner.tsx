import React, { useState } from "react";
import { AnalyzerState, ABTestResult, BacktestResult } from "./types";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { toPct } from "@/lib/date";

export function ABRunner({
  currentState, onRunAB,
}:{ currentState: AnalyzerState; onRunAB: (
      profileA: string|null, profileB: string|null, customA?: AnalyzerState, customB?: AnalyzerState
    ) => Promise<ABTestResult>; }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<ABTestResult | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const r = await onRunAB('Balanced', 'Aggressive');
      setResult(r);
    } finally { setLoading(false); }
  };

  const R = ({ r }:{ r: BacktestResult }) => (
    <ul className="text-sm space-y-1 text-slate-700 dark:text-slate-300">
      <li>CAGR: {toPct(r.cagr)}</li>
      <li>Sharpe: {r.sharpe_ratio.toFixed(2)}</li>
      <li>Max DD: {toPct(Math.abs(r.max_drawdown))}</li>
      <li>Win Rate: {toPct(r.win_rate)}</li>
    </ul>
  );

  return (
    <Card>
      <CardHeader title="A/B Runner" subtitle="Compare two indicator profiles" />
      <CardBody className="space-y-4">
        <button
          onClick={run}
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Running A/B…' : 'Run A/B'}
        </button>

        {result && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2 text-slate-900 dark:text-slate-100">{result.profileA.name}</h4>
              <R r={result.profileA.result} />
            </div>
            <div>
              <h4 className="font-semibold mb-2 text-slate-900 dark:text-slate-100">{result.profileB.name}</h4>
              <R r={result.profileB.result} />
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
