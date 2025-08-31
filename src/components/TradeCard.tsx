// src/components/TradeCard.tsx
// Trade idea card component

import React from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import EquityMini from '@/components/EquityMini';
import { toPct, toMoney } from '@/lib/date';
import { useAppBus, BacktestParams } from '@/context/AppBus';

export interface TradeIdea {
  strategy: string;
  params: any;
  score: number;
  cagr: number;
  win_rate: number;
  max_dd: number;
  preview: { t: string; equity: number; drawdown: number }[];
  ticker?: string;
  start_date?: string;
  end_date?: string;
  initial_capital?: number;
  seed?: number;
}

interface TradeCardProps {
  idea: TradeIdea;
  onApply?: (params: BacktestParams) => void;
}

export default function TradeCard({ idea, onApply }: TradeCardProps) {
  const { setBacktestParams, navigateToBacktest } = useAppBus();

  const handleApplyToBacktest = () => {
    const params: BacktestParams = {
      ticker: idea.ticker || 'AAPL',
      start_date: idea.start_date || '01/01/2023',
      end_date: idea.end_date || '12/31/2023',
      strategy: idea.strategy as BacktestParams['strategy'],
      initial_capital: idea.initial_capital || 100000,
      seed: idea.seed,
    };

    setBacktestParams(params);
    
    if (onApply) {
      onApply(params);
    }
    
    // Navigate to backtest page
    navigateToBacktest();
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 dark:text-green-400';
    if (score >= 0.6) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 0.8) return 'Excellent';
    if (score >= 0.6) return 'Good';
    if (score >= 0.4) return 'Fair';
    return 'Poor';
  };

  return (
    <Card>
      <CardHeader
        title={`${idea.strategy} Strategy`}
        subtitle={`${getScoreLabel(idea.score)} (${(idea.score * 100).toFixed(0)}%)`}
      />
      <CardBody className="space-y-4">
        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-slate-500 dark:text-slate-400">Win Rate</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {toPct(idea.win_rate)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">CAGR</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {toPct(idea.cagr)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Max DD</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {toPct(Math.abs(idea.max_dd))}
            </div>
          </div>
        </div>

        {/* Mini equity sparkline */}
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Equity Curve</div>
          <EquityMini 
            data={idea.preview} 
            height={32}
            color={idea.cagr >= 0 ? "#10b981" : "#ef4444"}
          />
        </div>

        {/* Apply button */}
        <button
          onClick={handleApplyToBacktest}
          className="w-full rounded-lg bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Apply to Backtest
        </button>
      </CardBody>
    </Card>
  );
}
