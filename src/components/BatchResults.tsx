// src/components/BatchResults.tsx
// Results grid with progress tracking for batch backtests

import React, { useMemo } from 'react';
import { 
  Download, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Play, 
  Pause,
  TrendingUp,
  TrendingDown,
  BarChart3
} from 'lucide-react';
import { BatchBacktestResults, BatchBacktestItem, BatchCsvExportOptions } from '@/types/batch';
import { toPct, toMoney } from '@/lib/date';

interface BatchResultsProps {
  results: BatchBacktestResults;
  onExportCsv: (options: BatchCsvExportOptions) => void;
  onCancel?: () => void;
  className?: string;
}

const StatusIcon: React.FC<{ status: BatchBacktestItem['status'] }> = ({ status }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-600" />;
    case 'running':
      return <Play className="w-4 h-4 text-blue-600 animate-pulse" />;
    case 'cancelled':
      return <Pause className="w-4 h-4 text-gray-600" />;
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
};

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

export const BatchResults: React.FC<BatchResultsProps> = ({
  results,
  onExportCsv,
  onCancel,
  className = '',
}) => {
  const { items, progress, summary } = results;

  // Sort items by status and then by completion time
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      // Running items first
      if (a.status === 'running' && b.status !== 'running') return -1;
      if (b.status === 'running' && a.status !== 'running') return 1;
      
      // Then completed items
      if (a.status === 'completed' && b.status !== 'completed') return -1;
      if (b.status === 'completed' && a.status !== 'completed') return 1;
      
      // Then failed items
      if (a.status === 'failed' && b.status !== 'failed') return -1;
      if (b.status === 'failed' && a.status !== 'failed') return 1;
      
      // Within same status, sort by ticker then strategy
      if (a.ticker !== b.ticker) return a.ticker.localeCompare(b.ticker);
      return a.strategy.localeCompare(b.strategy);
    });
  }, [items]);

  const progressPercentage = progress.total > 0 
    ? ((progress.completed + progress.failed) / progress.total) * 100 
    : 0;

  const handleExport = () => {
    onExportCsv({
      includeMetrics: true,
      includeTimestamps: true,
      includeErrors: true,
      sortBy: 'cagr',
      sortOrder: 'desc',
    });
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header with Progress */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Batch Backtest Results
          </h3>
          <div className="flex items-center gap-2">
            {progress.running && onCancel && (
              <button
                onClick={onCancel}
                className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleExport}
              disabled={progress.completed === 0}
              className="inline-flex items-center gap-2 px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>
              Progress: {progress.completed + progress.failed} / {progress.total}
            </span>
            <span>{progressPercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          {progress.running && progress.estimatedTimeRemaining && (
            <div className="text-xs text-gray-500 mt-1">
              Estimated time remaining: {formatDuration(progress.estimatedTimeRemaining)}
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="text-lg font-semibold text-green-600">{summary.successfulRuns}</div>
            <div className="text-gray-600">Successful</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-red-600">{summary.failedRuns}</div>
            <div className="text-gray-600">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {summary.averageDuration > 0 ? formatDuration(summary.averageDuration) : '-'}
            </div>
            <div className="text-gray-600">Avg Duration</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-blue-600">
              {summary.bestPerformer ? toPct(summary.bestPerformer.value) : '-'}
            </div>
            <div className="text-gray-600">Best CAGR</div>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ticker
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Strategy
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                CAGR
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Win Rate
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Max DD
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trades
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedItems.map((item) => {
              const duration = item.startTime && item.endTime 
                ? item.endTime - item.startTime 
                : undefined;

              return (
                <tr 
                  key={item.id}
                  className={`
                    ${item.status === 'running' ? 'bg-blue-50' : ''}
                    ${item.status === 'failed' ? 'bg-red-50' : ''}
                    hover:bg-gray-50
                  `}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={item.status} />
                      <span className="text-sm capitalize text-gray-900">
                        {item.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">
                      {item.ticker}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-gray-900">
                      {item.strategy}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {item.result ? (
                      <div className="flex items-center justify-end gap-1">
                        {item.result.cagr > 0 ? (
                          <TrendingUp className="w-3 h-3 text-green-600" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-600" />
                        )}
                        <span className={`text-sm font-medium ${
                          item.result.cagr > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {toPct(item.result.cagr)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {item.result ? (
                      <span className="text-sm text-gray-900">
                        {toPct(item.result.win_rate)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {item.result ? (
                      <span className="text-sm text-red-600">
                        {toPct(Math.abs(item.result.max_dd))}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {item.result ? (
                      <span className="text-sm text-gray-900">
                        {item.result.trades}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {duration ? (
                      <span className="text-sm text-gray-600">
                        {formatDuration(duration)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Error Details */}
      {items.some(item => item.error) && (
        <div className="p-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Errors:</h4>
          <div className="space-y-1">
            {items
              .filter(item => item.error)
              .map(item => (
                <div key={item.id} className="text-sm text-red-600">
                  <span className="font-medium">{item.ticker} - {item.strategy}:</span> {item.error}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 && (
        <div className="p-8 text-center">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No batch results yet</h3>
          <p className="text-gray-600">Start a batch backtest to see results here.</p>
        </div>
      )}
    </div>
  );
};
