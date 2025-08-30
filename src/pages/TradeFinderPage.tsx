import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TradeFiltersComponent } from '../components/TradeFilters';
import { TradeTable } from '../components/TradeTable';
import { TradeResult, TradeFilters } from '../types/backtest';

export const TradeFinderPage: React.FC = () => {
  const [filters, setFilters] = useState<TradeFilters>({});
  const [trades, setTrades] = useState<TradeResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleFiltersChange = useCallback((newFilters: TradeFilters) => {
    setFilters(newFilters);
    setError(null);
  }, []);

  const handleValidationChange = useCallback((valid: boolean) => {
    setIsValid(valid);
  }, []);

  const handleFindTrades = useCallback(async () => {
    if (!isValid || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      // Call the Tauri backend to find trades
      const result = await invoke<TradeResult[]>('find_trades', { filters });
      setTrades(result);
    } catch (err) {
      console.error('Error finding trades:', err);
      setError(err instanceof Error ? err.message : 'Failed to find trades');
      
      // For development, provide mock data if the backend call fails
      if (process.env.NODE_ENV === 'development') {
        console.warn('Using mock data for development');
        setTrades(generateMockTrades(filters));
      }
    } finally {
      setIsLoading(false);
    }
  }, [filters, isValid, isLoading]);

  // Generate mock trades for development
  const generateMockTrades = (filters: TradeFilters): TradeResult[] => {
    const mockTrades: TradeResult[] = [];
    const symbols = filters.symbol ? [filters.symbol] : ['SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT'];
    const strategies = filters.strategy ? [filters.strategy] : ['PMCC', 'Wheel', 'iron_condor'];
    
    // Generate 10-50 mock trades
    const numTrades = Math.floor(Math.random() * 40) + 10;
    
    for (let i = 0; i < numTrades; i++) {
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const strategy = strategies[Math.floor(Math.random() * strategies.length)];
      const entry = 100 + Math.random() * 400; // $100-$500
      const exitMultiplier = 0.8 + Math.random() * 0.4; // 0.8-1.2
      const exit = entry * exitMultiplier;
      const pl = exit - entry;
      const win = pl > 0;
      
      // Generate random date within the last year
      const startDate = filters.startDate ? new Date(filters.startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const endDate = filters.endDate ? new Date(filters.endDate) : new Date();
      const randomTime = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
      const date = new Date(randomTime);
      const dateString = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
      
      mockTrades.push({
        date: dateString,
        symbol,
        strategy,
        entry,
        exit,
        pl,
        win,
      });
    }
    
    // Sort by date (newest first)
    return mockTrades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Trade Finder</h1>
          <p className="mt-2 text-gray-600">
            Search and analyze historical trades with advanced filtering options.
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Filter Panel */}
          <div className="lg:col-span-1">
            <TradeFiltersComponent
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onFindTrades={handleFindTrades}
              isLoading={isLoading}
              isValid={isValid}
              onValidationChange={handleValidationChange}
            />
          </div>

          {/* Results Table */}
          <div className="lg:col-span-2">
            <TradeTable trades={trades} isLoading={isLoading} />
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-blue-900 mb-2">How to Use Trade Finder</h3>
          <div className="text-sm text-blue-800 space-y-2">
            <p>
              <strong>Symbol:</strong> Enter a stock symbol (e.g., SPY, QQQ) to filter trades for specific securities.
            </p>
            <p>
              <strong>Date Range:</strong> Use MM/DD/YYYY format to specify the time period for trade analysis.
            </p>
            <p>
              <strong>Strategy:</strong> Select a specific options strategy or leave blank to see all strategies.
            </p>
            <p>
              <strong>Performance Filters:</strong> Set minimum win rate and maximum drawdown thresholds to find high-quality trades.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
