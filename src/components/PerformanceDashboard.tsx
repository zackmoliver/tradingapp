/**
 * Performance Dashboard Component
 * 
 * Professional-grade dashboard for displaying backtest results with:
 * - Key performance metrics in organized tiles
 * - Interactive equity curve visualization
 * - Risk metrics and trade statistics
 * - Responsive design with modern UI
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
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Target, 
  Shield, 
  BarChart3,
  Calendar,
  Clock,
  Award,
  AlertTriangle
} from 'lucide-react';
import { BacktestResult, PerformanceMetricTile, ChartDataPoint } from '../types/backtest';
import { formatCurrency, formatPercentage, formatNumber, formatDate } from '../utils/formatters';

interface PerformanceDashboardProps {
  backtestResult?: BacktestResult | null;
  className?: string;
}

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({ 
  backtestResult, 
  className = '' 
}) => {
  // Handle null/undefined backtestResult
  if (!backtestResult) {
    return (
      <div className={`performance-dashboard space-y-6 ${className}`}>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 text-center">
          <div className="flex items-center justify-center space-x-2 text-neutral-500">
            <Clock className="w-5 h-5" />
            <span>Loading performance data...</span>
          </div>
        </div>
      </div>
    );
  }

  // Transform equity curve data for chart with null checking
  const equityChartData: ChartDataPoint[] = backtestResult.equity_curve?.data_points?.map(point => ({
    date: point.date,
    value: point.portfolio_value,
    label: formatDate(point.date)
  })) || [];

  // Calculate performance metrics for tiles with null checking
  const performanceMetrics: PerformanceMetricTile[] = [
    {
      title: 'Total Return',
      value: backtestResult.performance_summary?.total_return || 0,
      format: 'percentage',
      trend: (backtestResult.performance_summary?.total_return || 0) > 0 ? 'up' : 'down',
      color: (backtestResult.performance_summary?.total_return || 0) > 0 ? 'success' : 'danger',
      description: 'Overall portfolio return'
    },
    {
      title: 'Annualized Return',
      value: backtestResult.performance_summary?.annualized_return || 0,
      format: 'percentage',
      trend: (backtestResult.performance_summary?.annualized_return || 0) > 0 ? 'up' : 'down',
      color: (backtestResult.performance_summary?.annualized_return || 0) > 0 ? 'success' : 'danger',
      description: 'Yearly return rate'
    },
    {
      title: 'Sharpe Ratio',
      value: backtestResult.performance_summary?.sharpe_ratio || 0,
      format: 'ratio',
      trend: (backtestResult.performance_summary?.sharpe_ratio || 0) > 1 ? 'up' : 'neutral',
      color: (backtestResult.performance_summary?.sharpe_ratio || 0) > 1 ? 'success' : 'warning',
      description: 'Risk-adjusted return'
    },
    {
      title: 'Max Drawdown',
      value: Math.abs(backtestResult.performance_summary?.max_drawdown || 0),
      format: 'percentage',
      trend: 'down',
      color: Math.abs(backtestResult.performance_summary?.max_drawdown || 0) < 0.1 ? 'success' : 'warning',
      description: 'Maximum portfolio decline'
    },
    {
      title: 'Win Rate',
      value: backtestResult.trade_summary?.win_rate || 0,
      format: 'percentage',
      trend: (backtestResult.trade_summary?.win_rate || 0) > 0.5 ? 'up' : 'down',
      color: (backtestResult.trade_summary?.win_rate || 0) > 0.5 ? 'success' : 'danger',
      description: 'Percentage of winning trades'
    },
    {
      title: 'Profit Factor',
      value: backtestResult.trade_summary?.profit_factor || 0,
      format: 'ratio',
      trend: (backtestResult.trade_summary?.profit_factor || 0) > 1 ? 'up' : 'down',
      color: (backtestResult.trade_summary?.profit_factor || 0) > 1 ? 'success' : 'danger',
      description: 'Gross profit / Gross loss'
    }
  ];

  return (
    <div className={`performance-dashboard space-y-6 ${className}`}>
      {/* Header Section */}
      <div className="dashboard-header bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">
              Performance Dashboard
            </h1>
            <p className="text-neutral-600 mt-1">
              Strategy: {backtestResult.strategy_id} | Run: {backtestResult.run_id}
            </p>
          </div>
          <div className="flex items-center space-x-4 text-sm text-neutral-500">
            <div className="flex items-center space-x-1">
              <Calendar className="w-4 h-4" />
              <span>
                {formatDate(backtestResult.execution_info?.start_date)} - {formatDate(backtestResult.execution_info?.end_date)}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock className="w-4 h-4" />
              <span>{backtestResult.execution_info?.duration_days} days</span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics Grid */}
      <div className="metrics-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {performanceMetrics.map((metric, index) => (
          <MetricTile key={index} metric={metric} />
        ))}
      </div>

      {/* Equity Curve Chart */}
      <div className="equity-chart bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center space-x-2">
            <BarChart3 className="w-5 h-5" />
            <span>Equity Curve</span>
          </h2>
          <div className="text-sm text-neutral-500">
            Portfolio Value Over Time
          </div>
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
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <ReferenceLine 
                y={backtestResult.execution_info?.initial_capital} 
                stroke="#94a3b8" 
                strokeDasharray="5 5"
                label={{ value: "Initial Capital", position: "insideTopRight" }}
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

      {/* Additional Metrics Row */}
      <div className="additional-metrics grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trade Statistics */}
        <div className="trade-stats bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center space-x-2">
            <Target className="w-5 h-5" />
            <span>Trade Statistics</span>
          </h3>
          <div className="space-y-3">
            <StatRow 
              label="Total Trades" 
              value={formatNumber(backtestResult.trade_summary?.total_trades || 0)} 
            />
            <StatRow 
              label="Winning Trades" 
              value={formatNumber(backtestResult.trade_summary?.winning_trades || 0)}
              color="success"
            />
            <StatRow 
              label="Losing Trades" 
              value={formatNumber(backtestResult.trade_summary?.losing_trades || 0)}
              color="danger"
            />
            <StatRow 
              label="Average Win" 
              value={formatCurrency(backtestResult.trade_summary?.average_win || 0)}
              color="success"
            />
            <StatRow 
              label="Average Loss" 
              value={formatCurrency(backtestResult.trade_summary?.average_loss || 0)}
              color="danger"
            />
          </div>
        </div>

        {/* Risk Metrics */}
        <div className="risk-metrics bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center space-x-2">
            <Shield className="w-5 h-5" />
            <span>Risk Metrics</span>
          </h3>
          <div className="space-y-3">
            <StatRow 
              label="Volatility" 
              value={formatPercentage(backtestResult.performance_summary?.volatility || 0)} 
            />
            <StatRow 
              label="Sortino Ratio" 
              value={formatNumber(backtestResult.performance_summary?.sortino_ratio || 0, 2)}
            />
            <StatRow 
              label="Calmar Ratio" 
              value={formatNumber(backtestResult.performance_summary?.calmar_ratio || 0, 2)}
            />
            <StatRow 
              label="Beta" 
              value={formatNumber(backtestResult.risk_metrics?.beta || 0, 2)}
            />
            <StatRow 
              label="VaR (95%)" 
              value={formatPercentage(Math.abs(backtestResult.risk_metrics?.value_at_risk_95 || 0))}
              color="warning"
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