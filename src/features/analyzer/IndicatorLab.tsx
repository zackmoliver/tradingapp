import React from "react";
import { AnalyzerState } from "./types";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";

export function IndicatorLab({
  analyzerState, onStateChange, onApplyToStrategy, isApplying,
}:{
  analyzerState: AnalyzerState;
  onStateChange: (s: AnalyzerState) => void;
  onApplyToStrategy: () => void;
  isApplying: boolean;
}) {
  const toggle = (key: string) => {
    const set = new Set(analyzerState.enabledIndicators);
    set.has(key) ? set.delete(key) : set.add(key);
    onStateChange({ ...analyzerState, enabledIndicators: [...set] });
  };

  const setParam = (k: string, v: number) => {
    onStateChange({ ...analyzerState, params: { ...analyzerState.params, [k]: v } });
  };

  return (
    <Card>
      <CardHeader title="Indicator Lab" subtitle="Enable indicators & tune parameters" />
      <CardBody className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-700 dark:text-slate-300">SMA</label>
          <input type="checkbox" checked={analyzerState.enabledIndicators.includes('SMA')} onChange={() => toggle('SMA')} />
          <input type="number" className="ml-auto w-24 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                 value={analyzerState.params.sma ?? 50}
                 onChange={(e)=>setParam('sma', Number(e.target.value||50))}/>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-700 dark:text-slate-300">RSI</label>
          <input type="checkbox" checked={analyzerState.enabledIndicators.includes('RSI')} onChange={() => toggle('RSI')} />
          <input type="number" className="ml-auto w-24 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                 value={analyzerState.params.rsi ?? 40}
                 onChange={(e)=>setParam('rsi', Number(e.target.value||40))}/>
        </div>
        <button
          onClick={onApplyToStrategy}
          disabled={isApplying}
          className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isApplying ? 'Applying…' : 'Apply to Strategy'}
        </button>
      </CardBody>
    </Card>
  );
}
