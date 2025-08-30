/**
 * Performance Dashboard Component
 *
 * Professional‑grade dashboard for displaying backtest results with:
 * – Key performance metrics in organized tiles
 * – Interactive equity curve visualization
 * – Risk metrics and trade statistics
 * – Responsive design with modern UI
 */

import React, { useState } from 'react';

import {
  Target,
  Shield,
  BarChart3,
  Calendar,
  Download,
  FileText,
  CheckCircle
} from 'lucide-react';
import type { BacktestSummary } from '../types/backtest';
import { formatCurrency, formatPercentage, formatNumber } from '../utils/formatters';
import { safeExportBacktestToCsv, getExportStats } from '../lib/exportCsv';
import { showSuccessToast, showErrorToast } from '../lib/toast';
import ResultSummary from './ResultSummary';
import EquityCurve from './EquityCurve';
import DrawdownCurve from './DrawdownCurve';

interface PerformanceDashboardProps {
  /**
   * The summary of a completed backtest. When this changes, the dashboard
   * automatically re-renders with the new metrics and charts.
   */
  backtestResult: BacktestSummary;
  /**
   * Optional additional CSS classes to apply to the root element.
   */
  className?: string;
}

/**
 * Renders a full performance dashboard for a given backtest. It breaks the
 * summary into cards, charts, and stat rows. All fields are destructured
 * from the `backtestResult` prop to prevent undefined variables and to
 * provide sensible fallbacks when data is missing.
 */
const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  backtestResult,
  className = '',
}) => {
  // CSV export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Handle CSV export
  const handleCsvExport = async () => {
    if (isExporting) return;

    setIsExporting(true);
    setExportSuccess(false);

    try {
      await safeExportBacktestToCsv(backtestResult);
      setExportSuccess(true);

      // Show success toast
      showSuccessToast('CSV exported', 'Backtest data has been exported successfully');

      // Reset success state after 3 seconds
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (error) {
      console.error('CSV export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showErrorToast('Export failed', `Failed to export CSV: ${errorMessage}`);
    } finally {
      setIsExporting(false);
    }
  };
  // Destructure all fields up front. Use default values to avoid undefined.
  const {
    strategy,
    trades = 0,
    win_rate = 0,
    cagr = 0,
    max_dd = 0,
    start = '',
    end = '',
    equity_curve,
  } = backtestResult;

  // Provide a fallback for the equity curve array
  const equityCurve = equity_curve ?? [];

  return (
    <div className={`performance-dashboard space-y-6 ${className}`}>
      {/* Header Section */}
      <div className="dashboard-header bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 flex items-center space-x-2">
              <BarChart3 className="w-6 h-6 text-primary-600" />
              <span>Performance Dashboard</span>
            </h1>
            <p className="text-neutral-600 mt-1">
              Comprehensive backtest analysis and metrics
            </p>
          </div>

          <div className="flex items-center space-x-4">
            {/* Export Statistics */}
            <div className="hidden md:flex items-center space-x-4 text-sm text-neutral-500">
              <div className="flex items-center space-x-1">
                <Calendar className="w-4 h-4" />
                <span>Live Results</span>
              </div>
              <div className="flex items-center space-x-1">
                <FileText className="w-4 h-4" />
                <span>{equityCurve.length} data points</span>
              </div>
            </div>

            {/* Download CSV Button */}
            <button
              onClick={handleCsvExport}
              disabled={isExporting}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm transition-all duration-200 ${
                exportSuccess
                  ? 'text-success-700 bg-success-50 border-success-200'
                  : isExporting
                  ? 'text-neutral-500 bg-neutral-100 cursor-not-allowed'
                  : 'text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
              }`}
            >
              {exportSuccess ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Downloaded!
                </>
              ) : isExporting ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Download CSV
                </>
              )}
            </button>
          </div>
        </div>

        {/* Export Info */}
        {!isExporting && !exportSuccess && (
          <div className="mt-4 pt-4 border-t border-neutral-100">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                Export includes equity curve data and performance metrics
              </span>
              <span>
                File: {(() => {
                  try {
                    const stats = getExportStats(backtestResult);
                    return `${stats.filename} (${stats.estimatedSize})`;
                  } catch {
                    return 'backtest_export.csv';
                  }
                })()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Result Summary Cards */}
      <ResultSummary summary={backtestResult} className="animate-fade-in" />

      {/* Charts Section */}
      <div className="charts-section grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Equity Curve Chart */}
        <EquityCurve data={backtestResult.equity_curve} className="animate-slide-up" />

        {/* Drawdown Curve Chart */}
        <DrawdownCurve data={backtestResult.equity_curve} className="animate-slide-up" />
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
              value={formatCurrency(equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : 0)}
              color="success"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// -- Helper components ------------------------------------------------------



interface StatRowProps {
  label: string;
  value: string | number;
  color?: 'success' | 'danger' | 'warning' | 'neutral';
}

/**
 * A simple row for displaying a label and a value. It allows for color
 * overrides to highlight important values like profits, losses or warnings.
 */
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