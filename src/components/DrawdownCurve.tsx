import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { toPct, chartTickFormatter, parseMMDDYYYY } from '../lib/date';

interface EquityPoint {
  t: string;
  equity: number;
}

interface DrawdownCurveProps {
  data: EquityPoint[];
  className?: string;
}

const DrawdownCurve: React.FC<DrawdownCurveProps> = ({ data = [], className = '' }) => {
  // Compute running max and drawdown percentage series
  let runningMax = -Infinity;
  const ddSeries = data.map((point) => {
    runningMax = Math.max(runningMax, point.equity);
    const drawdown = runningMax > 0 ? (point.equity - runningMax) / runningMax : 0;
    const parsedDate = parseMMDDYYYY(point.t);
    return {
      t: point.t,
      date: parsedDate || new Date(),
      drawdown,
    };
  }).filter(point => point.date); // Remove invalid dates

  return (
    <div className={className}>
      <h2 className="subsection-title mb-6 flex items-center gap-2">
        {/* Optional: use an icon here */}
        <span>Drawdown Curve</span>
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={ddSeries}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis
            dataKey="date"
            stroke="#737373"
            fontSize={12}
            tickFormatter={chartTickFormatter}
          />
          <YAxis
            stroke="#737373"
            fontSize={12}
            tickFormatter={toPct}
          />
          <Tooltip
            formatter={(value: number) => [toPct(value), 'Drawdown']}
            labelFormatter={(label) => `Date: ${chartTickFormatter(label)}`}
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
          />
          <Line type="monotone" dataKey="drawdown" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DrawdownCurve;
