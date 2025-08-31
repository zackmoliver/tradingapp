// src/components/trade-finder/TradeFilters.tsx
import React, { useEffect } from 'react';

export interface TradeFilters {
  strategy?: string;
  minWinRate?: number;
  maxDrawdown?: number;
  symbol?: string;
  startDate?: string;
  endDate?: string;
}

export interface TradeFiltersProps {
  filters: TradeFilters;
  onFiltersChange: (filters: TradeFilters) => void;
  onFindTrades: () => void;
  isLoading: boolean;
  isValid: boolean;
  onValidationChange: (valid: boolean) => void;
}

export default function TradeFiltersComponent({
  filters,
  onFiltersChange,
  onFindTrades,
  isLoading,
  isValid,
  onValidationChange
}: TradeFiltersProps) {
  
  // Validate filters whenever they change
  useEffect(() => {
    const valid = Boolean(
      filters.symbol && 
      filters.symbol.length > 0 &&
      (filters.minWinRate === undefined || (filters.minWinRate >= 0 && filters.minWinRate <= 1)) &&
      (filters.maxDrawdown === undefined || (filters.maxDrawdown >= 0 && filters.maxDrawdown <= 1))
    );
    onValidationChange(valid);
  }, [filters, onValidationChange]);

  const handleFilterChange = (key: keyof TradeFilters, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  return (
    <div className="space-y-4 p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Trade Filters</h3>
      
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Symbol
        </label>
        <input
          type="text"
          value={filters.symbol || ''}
          onChange={(e) => handleFilterChange('symbol', e.target.value.toUpperCase())}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          placeholder="AAPL"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Strategy
        </label>
        <select
          value={filters.strategy || ''}
          onChange={(e) => handleFilterChange('strategy', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        >
          <option value="">Any Strategy</option>
          <option value="PMCC">Poor Man's Covered Call</option>
          <option value="Wheel">Wheel</option>
          <option value="CoveredCall">Covered Call</option>
          <option value="iron_condor">Iron Condor</option>
          <option value="bull_put_spread">Bull Put Spread</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Min Win Rate: {filters.minWinRate ? (filters.minWinRate * 100).toFixed(0) + '%' : 'Any'}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={filters.minWinRate || 0}
          onChange={(e) => handleFilterChange('minWinRate', Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Max Drawdown: {filters.maxDrawdown ? (filters.maxDrawdown * 100).toFixed(0) + '%' : 'Any'}
        </label>
        <input
          type="range"
          min="0"
          max="0.5"
          step="0.01"
          value={filters.maxDrawdown || 0.2}
          onChange={(e) => handleFilterChange('maxDrawdown', Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Start Date
        </label>
        <input
          type="text"
          value={filters.startDate || ''}
          onChange={(e) => handleFilterChange('startDate', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          placeholder="01/01/2023"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          End Date
        </label>
        <input
          type="text"
          value={filters.endDate || ''}
          onChange={(e) => handleFilterChange('endDate', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          placeholder="12/31/2023"
        />
      </div>

      <button
        onClick={onFindTrades}
        disabled={!isValid || isLoading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Searching...' : 'Find Trades'}
      </button>

      {!isValid && (
        <div className="text-sm text-red-600 dark:text-red-400">
          Please enter a valid symbol to search for trades.
        </div>
      )}
    </div>
  );
}
