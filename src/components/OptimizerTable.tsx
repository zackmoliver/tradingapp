// src/components/OptimizerTable.tsx
// Sortable table; Apply buttons

import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Play, 
  RotateCcw, 
  Settings, 
  ChevronUp, 
  ChevronDown,
  Target,
  Zap
} from 'lucide-react';
import { OptimizerResult, OptimizerProgress, formatParameterValue } from '@/lib/optimizer';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { toPct, toMoney } from '@/lib/date';

interface OptimizerTableProps {
  results: OptimizerResult[];
  progress?: OptimizerProgress;
  onApplyParameters: (parameters: Record<string, any>) => void;
  onStartOptimization: () => void;
  onCancelOptimization?: () => void;
  isRunning?: boolean;
  className?: string;
}

type SortField = 'rank' | 'score' | 'winRate' | 'cagr' | 'maxDD' | 'trades';
type SortDirection = 'asc' | 'desc';

const formatMetricChange = (value: number, isPercentage: boolean = true): { 
  formatted: string; 
  color: string; 
  icon: React.ReactNode;
} => {
  const absValue = Math.abs(value);
  const formatted = isPercentage ? toPct(absValue) : absValue.toFixed(2);
  
  if (value > 0) {
    return {
      formatted: `+${formatted}`,
      color: 'text-green-600',
      icon: <TrendingUp className="w-3 h-3" />
    };
  } else if (value < 0) {
    return {
      formatted: `-${formatted}`,
      color: 'text-red-600',
      icon: <TrendingDown className="w-3 h-3" />
    };
  } else {
    return {
      formatted: '0%',
      color: 'text-gray-600',
      icon: null
    };
  }
};

export const OptimizerTable: React.FC<OptimizerTableProps> = ({
  results,
  progress,
  onApplyParameters,
  onStartOptimization,
  onCancelOptimization,
  isRunning = false,
  className = '',
}) => {
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Sort results
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      let aValue: number, bValue: number;
      
      switch (sortField) {
        case 'rank':
          aValue = a.rank;
          bValue = b.rank;
          break;
        case 'score':
          aValue = a.metrics.score;
          bValue = b.metrics.score;
          break;
        case 'winRate':
          aValue = a.metrics.winRate;
          bValue = b.metrics.winRate;
          break;
        case 'cagr':
          aValue = a.metrics.cagr;
          bValue = b.metrics.cagr;
          break;
        case 'maxDD':
          aValue = Math.abs(a.metrics.maxDD);
          bValue = Math.abs(b.metrics.maxDD);
          break;
        case 'trades':
          aValue = a.metrics.trades;
          bValue = b.metrics.trades;
          break;
        default:
          aValue = a.rank;
          bValue = b.rank;
      }
      
      const comparison = aValue - bValue;
      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [results, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'rank' ? 'asc' : 'desc');
    }
  };

  const SortableHeader: React.FC<{ field: SortField; children: React.ReactNode }> = ({ field, children }) => (
    <th 
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
      </div>
    </th>
  );

  const topResults = sortedResults.slice(0, 3);

  return (
    <Card className={className}>
      <CardHeader 
        title="Parameter Optimizer" 
        subtitle="Grid search results with top-3 candidates"
      />
      <CardBody>
        {/* Control buttons */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={onStartOptimization}
              disabled={isRunning}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Settings className="w-4 h-4" />
              {isRunning ? 'Optimizing...' : 'Start Optimization'}
            </button>
            
            {isRunning && onCancelOptimization && (
              <button
                onClick={onCancelOptimization}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
              >
                <RotateCcw className="w-4 h-4" />
                Cancel
              </button>
            )}
          </div>
          
          {results.length > 0 && (
            <div className="text-sm text-gray-600">
              {results.length} combinations tested
            </div>
          )}
        </div>

        {/* Progress indicator */}
        {progress && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900">
                Optimization Progress
              </span>
              <span className="text-sm text-blue-700">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-blue-600">
              <span>Best Score: {(progress.bestScore * 100).toFixed(1)}%</span>
              {progress.estimatedTimeRemaining && (
                <span>ETA: {Math.ceil(progress.estimatedTimeRemaining / 1000)}s</span>
              )}
            </div>
          </div>
        )}

        {/* Results table */}
        {results.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <SortableHeader field="rank">Rank</SortableHeader>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Parameters
                  </th>
                  <SortableHeader field="score">Score</SortableHeader>
                  <SortableHeader field="winRate">Win Rate</SortableHeader>
                  <SortableHeader field="cagr">CAGR</SortableHeader>
                  <SortableHeader field="maxDD">Max DD</SortableHeader>
                  <SortableHeader field="trades">Trades</SortableHeader>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {topResults.map((result, index) => {
                  const winRateChange = formatMetricChange(result.improvement.winRate);
                  const cagrChange = formatMetricChange(result.improvement.cagr);
                  const maxDDChange = formatMetricChange(result.improvement.maxDD);
                  
                  return (
                    <tr 
                      key={`${result.rank}-${index}`}
                      className={`
                        ${index === 0 ? 'bg-yellow-50 border-yellow-200' : ''}
                        hover:bg-gray-50
                      `}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {index === 0 && <Target className="w-4 h-4 text-yellow-600" />}
                          <span className={`text-sm font-medium ${index === 0 ? 'text-yellow-900' : 'text-gray-900'}`}>
                            #{result.rank}
                          </span>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="text-sm space-y-1">
                          {Object.entries(result.parameters).map(([key, value]) => (
                            <div key={key} className="flex items-center gap-2">
                              <span className="text-gray-600 capitalize">{key}:</span>
                              <span className="font-medium text-gray-900">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-semibold text-gray-900">
                            {(result.metrics.score * 100).toFixed(1)}%
                          </span>
                          {result.improvement.score > 0 && <Zap className="w-3 h-3 text-yellow-500" />}
                        </div>
                      </td>
                      
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">
                            {toPct(result.metrics.winRate)}
                          </div>
                          <div className={`flex items-center gap-1 text-xs ${winRateChange.color}`}>
                            {winRateChange.icon}
                            {winRateChange.formatted}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">
                            {toPct(result.metrics.cagr)}
                          </div>
                          <div className={`flex items-center gap-1 text-xs ${cagrChange.color}`}>
                            {cagrChange.icon}
                            {cagrChange.formatted}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-red-600">
                            {toPct(Math.abs(result.metrics.maxDD))}
                          </div>
                          <div className={`flex items-center gap-1 text-xs ${maxDDChange.color}`}>
                            {maxDDChange.icon}
                            {maxDDChange.formatted}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {result.metrics.trades}
                        </span>
                      </td>
                      
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => onApplyParameters(result.parameters)}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                        >
                          <Play className="w-3 h-3" />
                          Apply
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No optimization results yet</h3>
            <p className="text-gray-600 mb-4">Run parameter optimization to find the best settings for your strategy.</p>
            <button
              onClick={onStartOptimization}
              disabled={isRunning}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Settings className="w-4 h-4" />
              Start Optimization
            </button>
          </div>
        )}

        {/* Optimization tips */}
        {results.length === 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Optimization Tips</h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Grid search tests multiple parameter combinations</li>
              <li>• Score = 0.6×Win Rate + 0.4×CAGR - 0.3×Max Drawdown</li>
              <li>• Top 3 results are ranked by composite score</li>
              <li>• Apply button fills backtest form with optimized parameters</li>
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
};
