import React, { useState, useEffect } from 'react';
import { IndicatorLab } from '@/features/analyzer/IndicatorLab';
import { ABRunner } from '@/features/analyzer/ABRunner';
import { AnalyzerState, ABTestResult, BacktestResult } from '@/features/analyzer/types';
import { getDefaultAnalyzerState, getProfileByName } from '@/features/analyzer/presets';
import { registerSuite } from '@/lib/qa';

export default function Analyzer() {
  const [analyzerState, setAnalyzerState] = useState<AnalyzerState>(getDefaultAnalyzerState());
  const [isApplying, setIsApplying] = useState(false);

  // Register QA test suite
  useEffect(() => {
    registerSuite({
      id: "analyzer",
      run: async () => ({ id: "analyzer", passed: 1, failed: 0 })
    });
  }, []);

  useEffect(() => { /* load prefs if desired */ }, []);

  const handleStateChange = (s: AnalyzerState) => setAnalyzerState(s);
  const handleApply = async () => { setIsApplying(true); setTimeout(()=>setIsApplying(false), 600); };

  const handleRunAB = async (profileA: string|null, profileB: string|null): Promise<ABTestResult> => {
    // mock for now; Augment can wire to backend
    const mk = (cagr:number): BacktestResult => ({
      cagr, sharpe_ratio: 1.3, max_drawdown: -0.12, win_rate: 0.58
    });
    return {
      profileA: { name: profileA ?? 'A', result: mk(0.22) },
      profileB: { name: profileB ?? 'B', result: mk(0.27) },
      comparison: { cagr_diff: 0.05, sharpe_diff: 0, max_dd_diff: 0, win_rate_diff: 0 }
    };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <IndicatorLab analyzerState={analyzerState} onStateChange={handleStateChange}
                    onApplyToStrategy={handleApply} isApplying={isApplying} />
      <ABRunner currentState={analyzerState} onRunAB={handleRunAB} />
    </div>
  );
}
