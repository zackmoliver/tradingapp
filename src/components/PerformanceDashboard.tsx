/**
 * Performance Dashboard Component
 * 
 * Professional‑grade dashboard for displaying backtest results with:
 * – Key performance metrics in organized tiles
 * – Interactive equity curve visualization
 * – Risk metrics and trade statistics
 * – Responsive design with modern UI
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
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Shield,
  BarChart3,
  Calendar,
  Clock,
} from 'lucide-react';
import { BacktestSummary, PerformanceMetricTile, ChartDataPoint } from '../types/backtest';
import { formatCurrency, formatPercentage, formatNumber, formatDate } from '../utils/formatters';
import ResultSummary from './ResultSummary';

interface PerformanceDashboardProps {
  backtestResult: BacktestSummary;
  className?: string;
}

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  backtestResult,
  className = '',
}) => {
  // Transform equity curve data for chart
  const equityChartData: ChartDataPoint[] = backtestResult.equity_curve.map(point => ({
    date: point.t,
    value: point.equity,
    label: formatDate(point.t)
  }));

  return (
    <div className={`performance-dashboard space-y-6 ${className}`}>
      {/* Header Section */}
      <div className="dashboard-header bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Performance Dashboard</h1>
            <p className="text-neutral-600 mt-1">
              Comprehensive backtest analysis and metrics
            </p>
          </div>
          <div className="flex items-center space-x-4 text-sm text-neutral-500">
            <div className="flex items-center space-x-1">
              <Calendar className="w-4 h-4" />
              <span>Live Results</span>
            </div>
          </div>
        </div>
      </div>

      {/* Result Summary Cards */}
      <ResultSummary
        summary={backtestResult}
        className="animate-fade-in"
      />

      {/* Equity Curve Chart */}
      <div className="equity-chart bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center space-x-2">
            <BarChart3 className="w-5 h-5" />
            <span>Equity Curve</span>
          </h2>
          <div className="text-sm text-neutral-500">Portfolio Value Over Time</div>
        </div>

        <div className="chart-container h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={equityChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis
                dataKey="date"
                stroke="#737373"
                fontSize={12}
                tickFormatter={(value) => formatDate(value, 'short')}
              />
              <YAxis
                stroke="#737373"
                fontSize={12}
                tickFormatter={(value) => formatCurrency(value, 'compact')}
              />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), 'Portfolio Value']}
                labelFormatter={(label) => `Date: ${formatDate(label)}`}
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
              />
              <ReferenceLine
                y={equityCurve[0]?.equity || 100000}
                stroke="#94a3b8"
                strokeDasharray="5 5"
                label={{ value: 'Initial Capital', position: 'insideTopRight' }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#3b82f6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Simplified Metrics Row */}
      <div className="additional-metrics grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Strategy Information */}
        <div className="strategy-info bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center space-x-2">
            <Target className="w-5 h-5" />
            <span>Strategy Details</span>
          </h3>
          <div className="space-y-3">
            <StatRow label="Strategy" value={strategy} />
            <StatRow label="Total Trades" value={formatNumber(trades)} />
            <StatRow
              label="Win Rate"
              value={formatPercentage(win_rate)}
              color={win_rate > 0.5 ? 'success' : 'danger'}
            />
            <StatRow
              label="CAGR"
              value={formatPercentage(cagr)}
              color={cagr > 0 ? 'success' : 'danger'}
            />
          </div>
        </div>

        {/* Performance Summary */}
        <div className="performance-summary bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center space-x-2">
            <Shield className="w-5 h-5" />
            <span>Performance Summary</span>
          </h3>
          <div className="space-y-3">
            <StatRow label="Start Date" value={start} />
            <StatRow label="End Date" value={end} />
            <StatRow
              label="Max Drawdown"
              value={formatPercentage(Math.abs(max_dd))}
              color="warning"
            />
            <StatRow
              label="Final Equity"
              value={formatCurrency(equityCurve[equityCurve.length - 1]?.equity || 0)}
              color="success"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Metric Tile Component
interface MetricTileProps {
  metric: PerformanceMetricTile;
}

const MetricTile: React.FC<MetricTileProps> = ({ metric }) => {
  const getColorClasses = (color?: string) => {
    switch (color) {
      case 'success':
        return 'text-success-600 bg-success-50 border-success-200';
      case 'danger':
        return 'text-danger-600 bg-danger-50 border-danger-200';
      case 'warning':
        return 'text-warning-600 bg-warning-50 border-warning-200';
      default:
        return 'text-neutral-600 bg-neutral-50 border-neutral-200';
    }
  };

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-success-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-danger-500" />;
      default:
        return <DollarSign className="w-4 h-4 text-neutral-500" />;
    }
  };

  const formatValue = (value: string | number, format: string) => {
    if (typeof value === 'string') return value;

    switch (format) {
      case 'percentage':
        return formatPercentage(value);
      case 'currency':
        return formatCurrency(value);
      case 'ratio':
        return formatNumber(value, 2);
      default:
        return formatNumber(value);
    }
  };

  return (
    <div className={`metric-tile bg-white rounded-lg shadow-sm border p-4 ${getColorClasses(metric.color)}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-neutral-700">{metric.title}</h3>
        {getTrendIcon(metric.trend)}
      </div>
      <div className="metric-value">
        <p className="text-2xl font-bold text-neutral-900">
          {formatValue(metric.value, metric.format)}
        </p>
        {metric.description && (
          <p className="text-xs text-neutral-500 mt-1">{metric.description}</p>
        )}
      </div>
    </div>
  );
};

// Stat Row Component
interface StatRowProps {
  label: string;
  value: string;
  color?: 'success' | 'danger' | 'warning' | 'neutral';
}

const StatRow: React.FC<StatRowProps> = ({ label, value, color = 'neutral' }) => {
  const getTextColor = (color: string) => {
    switch (color) {
      case 'success':
        return 'text-success-600';
      case 'danger':
        return 'text-danger-600';
      case 'warning':
        return 'text-warning-600';
      default:
        return 'text-neutral-900';
    }
  };

  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-neutral-600">{label}</span>
      <span className={`text-sm font-medium ${getTextColor(color)}`}>{value}</span>
    </div>
  );
};

export default PerformanceDashboard;
