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
import { formatPercentage, formatDate } from '../utils/formatters';

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
    return {
      t: point.t,
      drawdown,
    };
  });

  return (
    <div className={className}>
      <h2 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center space-x-2">
        {/* Optional: use an icon here */}
        <span>Drawdown Curve</span>
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={ddSeries}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis
            dataKey="t"
            stroke="#737373"
            fontSize={12}
            tickFormatter={(val) => formatDate(val, 'short')}
          />
          <YAxis
            stroke="#737373"
            fontSize={12}
            tickFormatter={(val) => formatPercentage(val)}
          />
          <Tooltip
            formatter={(value: number) => [formatPercentage(value), 'Drawdown']}
            labelFormatter={(label) => `Date: ${formatDate(label)}`}
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
