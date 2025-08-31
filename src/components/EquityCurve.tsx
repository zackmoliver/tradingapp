import React, { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Area, AreaChart, Legend } from "recharts";
import { toMMDDYYYY, toMoney, toPct, parseMMDDYYYY } from "@/lib/date";
import { BacktestPoint } from "@/types/backtest";
import { BenchmarkPoint } from "@/lib/benchmark";

interface EquityCurveProps {
  data: { date: Date; value: number }[] | BacktestPoint[];
  benchmarkData?: BenchmarkPoint[];
  className?: string;
  height?: string | number;
  showDrawdown?: boolean;
  showBenchmark?: boolean;
  onBenchmarkToggle?: (show: boolean) => void;
}

export default function EquityCurve({
  data,
  benchmarkData,
  className = "",
  height,
  showDrawdown = false,
  showBenchmark = false,
  onBenchmarkToggle
}: EquityCurveProps) {
  const [viewMode, setViewMode] = useState<'equity' | 'drawdown' | 'both'>('equity');
  const [internalShowBenchmark, setInternalShowBenchmark] = useState(showBenchmark);

  const handleBenchmarkToggle = (show: boolean) => {
    setInternalShowBenchmark(show);
    onBenchmarkToggle?.(show);
  };

  // Normalize data format
  const chartData = data.map(d => {
    if ('t' in d) {
      // BacktestPoint format - use parseMMDDYYYY for proper parsing
      const date = parseMMDDYYYY(d.t);
      return {
        date: date.getTime(),
        portfolio: d.equity,
        drawdown: d.drawdown * 100, // Convert to percentage
        formattedDate: d.t
      };
    } else {
      // Legacy format
      return {
        date: d.date.getTime(),
        portfolio: d.value,
        drawdown: 0,
        formattedDate: toMMDDYYYY(d.date)
      };
    }
  }).filter(d => !isNaN(d.date) && !isNaN(d.portfolio)); // Filter out invalid data

  // Add benchmark data if available
  const benchmarkMap = new Map<number, number>();
  if (benchmarkData && internalShowBenchmark) {
    benchmarkData.forEach(point => {
      const date = parseMMDDYYYY(point.t);
      if (!isNaN(date.getTime())) {
        benchmarkMap.set(date.getTime(), point.equity);
      }
    });
  }

  // Merge benchmark data with chart data
  const mergedData = chartData.map(point => ({
    ...point,
    benchmark: benchmarkMap.get(point.date) || null
  }));

  const hasDrawdownData = mergedData.some(d => d.drawdown !== 0);
  const hasBenchmarkData = benchmarkData && benchmarkData.length > 0;

  if (mergedData.length === 0) {
    return (
      <div className={`flex items-center justify-center h-[260px] text-slate-500 dark:text-slate-400 ${className}`}>
        No data available
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Controls */}
      <div className="flex gap-2 mb-4">
        {hasDrawdownData && (
          <>
            <button
              onClick={() => setViewMode('equity')}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === 'equity'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              Equity
            </button>
            <button
              onClick={() => setViewMode('drawdown')}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === 'drawdown'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              Drawdown
            </button>
          </>
        )}

        {hasBenchmarkData && viewMode === 'equity' && (
          <label className="flex items-center gap-2 ml-4">
            <input
              type="checkbox"
              checked={internalShowBenchmark}
              onChange={(e) => handleBenchmarkToggle(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">Show Benchmark</span>
          </label>
        )}
      </div>

      <div className="h-[260px] sm:h-[280px]" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={mergedData}
            margin={{ top: 8, right: 16, bottom: 28, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
            <XAxis
              dataKey="date"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              tickMargin={10}
              tickFormatter={(v: number) => {
                const d = new Date(v);
                return toMMDDYYYY(d);
              }}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tickFormatter={(v: number) => toMoney(v, 0)}
              width={72}
              tickMargin={8}
            />
            <Tooltip
              labelFormatter={(v: number) => toMMDDYYYY(new Date(v))}
              formatter={(val: number, name: string) => {
                if (name === 'portfolio') return [toMoney(val), 'Portfolio'];
                if (name === 'benchmark') return [toMoney(val), 'Benchmark'];
                return [toMoney(val), 'Equity'];
              }}
            />
            {internalShowBenchmark && hasBenchmarkData && (
              <Legend />
            )}
            <Line
              type="monotone"
              dataKey="portfolio"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              name="Portfolio"
              isAnimationActive={false}
            />
            {internalShowBenchmark && hasBenchmarkData && (
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Benchmark"
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
