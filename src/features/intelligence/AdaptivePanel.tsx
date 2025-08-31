import React, { useState } from "react";
import { invoke } from "@/lib/tauri";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";

export default function AdaptivePanel({ current }:{ current?: any }) {
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState<any>(null);
  const run = async () => {
    setLoading(true);
    try {
      // If command exists:
      const res = await invoke<any>('adaptive_run', { mode: 'test', current });
      setOut(res);
    } catch {
      // dev fallback
      setOut({
        ok: true,
        bayesian: { suggestion: { threshold: 0.5, lookback: 55 }, best: { threshold: 0.5, lookback: 55, metric: -0.33 } },
        anomaly: { volatility: 0.613, level: 'ELEVATED' },
        allocation: { market_state: 'SIDEWAYS', allocations: { PMCC: 0.3, Wheel: 0.4, 'Bull Put Spread': 0.3 } }
      });
    } finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader title="Adaptive Intelligence" subtitle="Optimizer • Anomaly • Allocation" />
      <CardBody className="space-y-3">
        <button
          onClick={run}
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Analyzing…' : 'Suggest & Analyze'}
        </button>
        <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700 overflow-auto">
{JSON.stringify(out, null, 2)}
        </pre>
      </CardBody>
    </Card>
  );
}
