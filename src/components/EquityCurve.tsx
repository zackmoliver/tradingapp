/**
 * Equity Curve Chart Component
 * 
 * Professional responsive chart displaying portfolio equity over time.
 * Uses Recharts with proper formatting and responsive design.
 * 
 * Props: data from BacktestSummary.equity_curve
 * X-axis: t (date in MM/DD/YYYY format)
 * Y-axis: equity (portfolio value)
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { BacktestPoint } from '../types/backtest';

interface EquityCurveProps {
  data: BacktestPoint[];
  className?: string;
}

interface ChartDataPoint {
  date: string;
  equity: number;
  originalDate: string;
}

const EquityCurve: React.FC<EquityCurveProps> = ({ data, className = '' }) => {
  // Transform data for Recharts
  const chartData: ChartDataPoint[] = data.map(point => ({
    date: point.t,
    equity: point.equity,
    originalDate: point.t
  }));

  // Calculate initial capital for reference line
  const initialCapital = data.length > 0 ? data[0].equity : 100000;

  // Format currency for display
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format date for display
  const formatDate = (dateStr: string): string => {
    try {
      // Handle MM/DD/YYYY format
      if (dateStr.includes('/')) {
        return dateStr;
      }
      
      // Handle other date formats
      const date = new Date(dateStr);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    } catch {
      return dateStr;
    }
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const value = payload[0].value;
      const formattedDate = formatDate(label);
      
      return (
        <div className="bg-white p-3 border border-neutral-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-neutral-900 mb-1">
            {formattedDate}
          </p>
          <p className="text-sm text-neutral-600">
            Portfolio Value: <span className="font-semibold text-neutral-900">{formatCurrency(value)}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom tick formatter for X-axis
  const formatXAxisTick = (tickItem: string): string => {
    try {
      const date = new Date(tickItem);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${month}/${day}`;
    } catch {
      // If parsing fails, try to extract month/day from MM/DD/YYYY
      const parts = tickItem.split('/');
      if (parts.length >= 2) {
        return `${parseInt(parts[0])}/${parseInt(parts[1])}`;
      }
      return tickItem;
    }
  };

  return (
    <div className={`equity-curve-chart bg-white rounded-lg shadow-sm border border-neutral-200 p-6 ${className}`}>
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-neutral-900 flex items-center space-x-2">
          <TrendingUp className="w-5 h-5 text-primary-600" />
          <span>Equity Curve</span>
        </h3>
        <div className="text-sm text-neutral-500">
          Portfolio Value Over Time
        </div>
      </div>

      {/* Chart Container */}
      <div className="chart-container h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            
            <XAxis
              dataKey="date"
              stroke="#737373"
              fontSize={12}
              tickFormatter={formatXAxisTick}
              interval="preserveStartEnd"
            />
            
            <YAxis
              stroke="#737373"
              fontSize={12}
              tickFormatter={(value) => formatCurrency(value)}
              domain={['dataMin * 0.95', 'dataMax * 1.05']}
            />
            
            <Tooltip content={<CustomTooltip />} />
            
            {/* Reference line for initial capital */}
            <ReferenceLine
              y={initialCapital}
              stroke="#94a3b8"
              strokeDasharray="5 5"
              label={{
                value: "Initial Capital",
                position: "insideTopRight",
                style: { fontSize: '12px', fill: '#6b7280' }
              }}
            />
            
            {/* Main equity line */}
            <Line
              type="monotone"
              dataKey="equity"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                stroke: '#2563eb',
                strokeWidth: 2,
                fill: '#ffffff'
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart Footer */}
      <div className="flex items-center justify-between mt-4 text-xs text-neutral-500">
        <span>
          Initial: {formatCurrency(initialCapital)}
        </span>
        <span>
          Final: {formatCurrency(data[data.length - 1]?.equity || initialCapital)}
        </span>
      </div>
    </div>
  );
};

export default EquityCurve;
