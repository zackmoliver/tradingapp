import React from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Tooltip from "@/components/ui/Tooltip";
import { BacktestSummary } from "@/types/backtest";
import { calculateAllMetrics, formatMetric, getMetricColor, METRIC_DESCRIPTIONS } from "@/lib/metrics";
import { BenchmarkMetrics, formatBenchmarkMetrics, getMetricColor as getBenchmarkColor } from "@/lib/benchmark";
import { toPct, toMoney } from "@/lib/date";

interface ResultSummaryProps {
  rows?: [string, string][];
  summary?: BacktestSummary;
  benchmarkMetrics?: BenchmarkMetrics;
}

export default function ResultSummary({ rows, summary, benchmarkMetrics }: ResultSummaryProps) {
  // If we have a BacktestSummary, calculate and display enhanced metrics
  if (summary) {
    const metrics = calculateAllMetrics(summary.equity_curve, summary.trade_log);

    const enhancedRows: Array<{ key: string; label: string; value: string; color?: string; tooltip?: string }> = [
      // Basic metrics
      { key: 'cagr', label: 'CAGR', value: toPct(summary.cagr), color: getMetricColor(summary.cagr) },
      { key: 'trades', label: 'Total Trades', value: summary.trades.toString() },
      { key: 'win_rate', label: 'Win Rate', value: toPct(summary.win_rate), color: getMetricColor(summary.win_rate) },
      { key: 'max_dd', label: 'Max Drawdown', value: toPct(Math.abs(summary.max_dd)), color: getMetricColor(summary.max_dd, false) },

      // Advanced metrics with tooltips
      {
        key: 'sharpe',
        label: 'Sharpe Ratio',
        value: formatMetric(metrics.sharpe),
        color: getMetricColor(metrics.sharpe),
        tooltip: METRIC_DESCRIPTIONS.sharpe
      },
      {
        key: 'sortino',
        label: 'Sortino Ratio',
        value: formatMetric(metrics.sortino),
        color: getMetricColor(metrics.sortino),
        tooltip: METRIC_DESCRIPTIONS.sortino
      },
      {
        key: 'profit_factor',
        label: 'Profit Factor',
        value: formatMetric(metrics.profitFactor),
        color: getMetricColor(metrics.profitFactor),
        tooltip: METRIC_DESCRIPTIONS.profitFactor
      },
      {
        key: 'volatility',
        label: 'Volatility',
        value: toPct(metrics.volatility),
        color: getMetricColor(metrics.volatility, false),
        tooltip: METRIC_DESCRIPTIONS.volatility
      }
    ];

    return (
      <Card>
        <CardHeader title="Performance Summary" subtitle={`${summary.symbol} • ${summary.start} to ${summary.end}`} />
        <CardBody>
          <dl className="grid grid-cols-1 gap-3">
            {enhancedRows.map((row) => (
              <div key={row.key} className="flex items-center justify-between border-b last:border-b-0 border-slate-200 dark:border-slate-800 py-2">
                <dt className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  {row.label}
                  {row.tooltip && (
                    <Tooltip content={row.tooltip}>
                      <span className="text-xs text-slate-400 cursor-help">ⓘ</span>
                    </Tooltip>
                  )}
                </dt>
                <dd className={`text-sm font-medium ${row.color || 'text-slate-900 dark:text-slate-100'}`}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          {/* Benchmark Metrics Section */}
          {benchmarkMetrics && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Benchmark Comparison
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      Alpha
                      <Tooltip content="Excess return over benchmark after adjusting for risk (beta). Positive alpha indicates outperformance.">
                        <span className="text-xs text-slate-400 cursor-help">ⓘ</span>
                      </Tooltip>
                    </span>
                    <span className={`text-xs font-medium ${getBenchmarkColor(benchmarkMetrics.alpha, 'alpha')}`}>
                      {formatBenchmarkMetrics(benchmarkMetrics).alpha}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      Beta
                      <Tooltip content="Sensitivity to benchmark movements. 1.0 = same volatility as benchmark, >1.0 = more volatile.">
                        <span className="text-xs text-slate-400 cursor-help">ⓘ</span>
                      </Tooltip>
                    </span>
                    <span className={`text-xs font-medium ${getBenchmarkColor(benchmarkMetrics.beta, 'beta')}`}>
                      {formatBenchmarkMetrics(benchmarkMetrics).beta}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      Correlation
                      <Tooltip content="How closely the portfolio moves with the benchmark. 1.0 = perfect correlation.">
                        <span className="text-xs text-slate-400 cursor-help">ⓘ</span>
                      </Tooltip>
                    </span>
                    <span className={`text-xs font-medium ${getBenchmarkColor(benchmarkMetrics.correlation, 'correlation')}`}>
                      {formatBenchmarkMetrics(benchmarkMetrics).correlation}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      Info Ratio
                      <Tooltip content="Risk-adjusted excess return. Higher values indicate better risk-adjusted outperformance.">
                        <span className="text-xs text-slate-400 cursor-help">ⓘ</span>
                      </Tooltip>
                    </span>
                    <span className={`text-xs font-medium ${getBenchmarkColor(benchmarkMetrics.information_ratio, 'ir')}`}>
                      {formatBenchmarkMetrics(benchmarkMetrics).informationRatio}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Additional details section */}
          {(summary.trade_log && summary.trade_log.length > 0) && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <div>Avg Return: {toPct(metrics.averageReturn)}</div>
                <div>Downside Vol: {toPct(metrics.downsideVolatility)}</div>
                <div>Strategy: {summary.strategy}</div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  // Fallback to legacy rows format
  if (rows) {
    return (
      <Card>
        <CardHeader title="Performance Summary" />
        <CardBody>
          <dl className="grid grid-cols-1 gap-4">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b last:border-b-0 border-slate-200 dark:border-slate-800 py-2">
                <dt className="text-sm text-slate-500 dark:text-slate-400">{k}</dt>
                <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    );
  }

  // Empty state
  return (
    <Card>
      <CardHeader title="Performance Summary" />
      <CardBody>
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          No performance data available
        </div>
      </CardBody>
    </Card>
  );
}
