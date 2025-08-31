// src/components/EquityMini.tsx
// Compact equity sparkline component

import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { parseMMDDYYYY } from '@/lib/date';
import { coerceCurve } from '@/lib/guards';

interface EquityMiniProps {
  data: { t: string; equity: number; drawdown: number }[];
  className?: string;
  height?: number;
  color?: string;
}

export default function EquityMini({ 
  data, 
  className = "", 
  height = 40,
  color = "#2563eb" 
}: EquityMiniProps) {
  // Sanitize and convert data
  const chartData = coerceCurve(data)
    .map(p => ({
      date: parseMMDDYYYY(p.t).getTime(),
      equity: p.equity
    }))
    .filter(d => !isNaN(d.date) && !isNaN(d.equity));

  if (chartData.length === 0) {
    return (
      <div 
        className={`flex items-center justify-center text-xs text-slate-400 ${className}`}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="equity"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
