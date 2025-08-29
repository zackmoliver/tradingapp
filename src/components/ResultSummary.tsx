/**
 * Result Summary Component
 * 
 * Professional summary cards displaying key backtest metrics:
 * - Strategy name and configuration
 * - Date range with duration
 * - Trade statistics
 * - Performance metrics (Win Rate, CAGR, Max Drawdown)
 * 
 * Updates instantly when new BacktestSummary data arrives.
 */

import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Target, 
  Award, 
  AlertTriangle,
  BarChart3,
  DollarSign
} from 'lucide-react';
import { BacktestSummary } from '../types/backtest';

interface ResultSummaryProps {
  summary: BacktestSummary;
  className?: string;
}

interface SummaryCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'success' | 'danger' | 'warning' | 'neutral' | 'primary';
  className?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend = 'neutral',
  color = 'neutral',
  className = ''
}) => {
  const colorClasses = {
    success: 'bg-success-50 border-success-200 text-success-800',
    danger: 'bg-danger-50 border-danger-200 text-danger-800',
    warning: 'bg-warning-50 border-warning-200 text-warning-800',
    neutral: 'bg-neutral-50 border-neutral-200 text-neutral-800',
    primary: 'bg-primary-50 border-primary-200 text-primary-800'
  };

  const iconColorClasses = {
    success: 'text-success-600',
    danger: 'text-danger-600',
    warning: 'text-warning-600',
    neutral: 'text-neutral-600',
    primary: 'text-primary-600'
  };

  const trendIcon = trend === 'up' ? (
    <TrendingUp className="w-4 h-4 text-success-500" />
  ) : trend === 'down' ? (
    <TrendingDown className="w-4 h-4 text-danger-500" />
  ) : null;

  return (
    <div className={`summary-card bg-white rounded-lg border shadow-sm p-6 transition-all duration-200 hover:shadow-md ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
              <div className={iconColorClasses[color]}>
                {icon}
              </div>
            </div>
            {trendIcon}
          </div>
          
          <h3 className="text-sm font-medium text-neutral-600 mb-1">
            {title}
          </h3>
          
          <p className="text-2xl font-bold text-neutral-900 mb-1">
            {value}
          </p>
          
          {subtitle && (
            <p className="text-sm text-neutral-500">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const ResultSummary: React.FC<ResultSummaryProps> = ({ summary, className = '' }) => {
  // Format percentage values to 2 decimal places
  const formatPercentage = (value: number): string => {
    return `${(value * 100).toFixed(2)}%`;
  };

  // Format number values
  const formatNumber = (value: number): string => {
    return value.toLocaleString();
  };

  // Calculate date range duration
  const calculateDuration = (start: string, end: string): string => {
    try {
      const startDate = new Date(start);
      const endDate = new Date(end);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays < 30) {
        return `${diffDays} days`;
      } else if (diffDays < 365) {
        const months = Math.round(diffDays / 30);
        return `${months} month${months > 1 ? 's' : ''}`;
      } else {
        const years = Math.round(diffDays / 365);
        return `${years} year${years > 1 ? 's' : ''}`;
      }
    } catch {
      return 'Unknown duration';
    }
  };

  // Determine trend and color for metrics
  const getWinRateColor = (winRate: number) => {
    if (winRate >= 0.7) return 'success';
    if (winRate >= 0.5) return 'warning';
    return 'danger';
  };

  const getCAGRColor = (cagr: number) => {
    if (cagr >= 0.15) return 'success';
    if (cagr >= 0.05) return 'warning';
    return 'danger';
  };

  const getDrawdownColor = (drawdown: number) => {
    const absDrawdown = Math.abs(drawdown);
    if (absDrawdown <= 0.1) return 'success';
    if (absDrawdown <= 0.2) return 'warning';
    return 'danger';
  };

  return (
    <div className={`result-summary ${className}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Strategy Card */}
        <SummaryCard
          title="Strategy"
          value={summary.strategy}
          subtitle="Trading strategy used"
          icon={<BarChart3 className="w-5 h-5" />}
          color="primary"
          trend="neutral"
        />

        {/* Date Range Card */}
        <SummaryCard
          title="Date Range"
          value={`${summary.start} - ${summary.end}`}
          subtitle={calculateDuration(summary.start, summary.end)}
          icon={<Calendar className="w-5 h-5" />}
          color="neutral"
          trend="neutral"
        />

        {/* Trades Card */}
        <SummaryCard
          title="Total Trades"
          value={formatNumber(summary.trades)}
          subtitle="Executed positions"
          icon={<Target className="w-5 h-5" />}
          color="neutral"
          trend="neutral"
        />

        {/* Win Rate Card */}
        <SummaryCard
          title="Win Rate"
          value={formatPercentage(summary.win_rate)}
          subtitle="Successful trades"
          icon={<Award className="w-5 h-5" />}
          color={getWinRateColor(summary.win_rate)}
          trend={summary.win_rate > 0.5 ? 'up' : 'down'}
        />

        {/* CAGR Card */}
        <SummaryCard
          title="CAGR"
          value={formatPercentage(summary.cagr)}
          subtitle="Compound Annual Growth Rate"
          icon={<TrendingUp className="w-5 h-5" />}
          color={getCAGRColor(summary.cagr)}
          trend={summary.cagr > 0 ? 'up' : 'down'}
        />

        {/* Max Drawdown Card */}
        <SummaryCard
          title="Max Drawdown"
          value={formatPercentage(Math.abs(summary.max_dd))}
          subtitle="Maximum portfolio decline"
          icon={<AlertTriangle className="w-5 h-5" />}
          color={getDrawdownColor(summary.max_dd)}
          trend="down"
        />
      </div>
    </div>
  );
};

export default ResultSummary;
