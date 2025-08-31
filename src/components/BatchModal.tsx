// src/components/BatchModal.tsx
// Modal for configuring batch backtest operations

import React, { useState, useCallback } from 'react';
import { X, Plus, Trash2, Play, AlertCircle } from 'lucide-react';
import { StrategyType } from '@/types/backtest';
import { BatchBacktestConfig, generateBatchItems } from '@/types/batch';
import { toMMDDYYYY, parseMMDDYYYY } from '@/lib/date';

interface BatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (config: BatchBacktestConfig) => void;
  defaultConfig?: Partial<BatchBacktestConfig>;
}

const STRATEGY_OPTIONS: { value: StrategyType; label: string }[] = [
  { value: 'PMCC', label: 'Poor Man\'s Covered Call' },
  { value: 'Wheel', label: 'The Wheel' },
  { value: 'CoveredCall', label: 'Covered Call' },
  { value: 'iron_condor', label: 'Iron Condor' },
  { value: 'bull_put_spread', label: 'Bull Put Spread' },
];

export const BatchModal: React.FC<BatchModalProps> = ({
  isOpen,
  onClose,
  onStart,
  defaultConfig = {},
}) => {
  const [config, setConfig] = useState<BatchBacktestConfig>({
    tickers: defaultConfig.tickers || ['AAPL'],
    strategies: defaultConfig.strategies || ['PMCC'],
    start_date: defaultConfig.start_date || '01/01/2023',
    end_date: defaultConfig.end_date || '12/31/2023',
    initial_capital: defaultConfig.initial_capital || 100000,
    seed: defaultConfig.seed,
    generateCombinations: defaultConfig.generateCombinations ?? true,
  });

  const [tickerInput, setTickerInput] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  // Validation
  const validateConfig = useCallback((): string[] => {
    const newErrors: string[] = [];

    if (config.tickers.length === 0) {
      newErrors.push('At least one ticker is required');
    }

    if (config.strategies.length === 0) {
      newErrors.push('At least one strategy is required');
    }

    if (config.initial_capital <= 0) {
      newErrors.push('Initial capital must be positive');
    }

    // Validate date format and range
    try {
      const startDate = parseMMDDYYYY(config.start_date);
      const endDate = parseMMDDYYYY(config.end_date);
      
      if (startDate >= endDate) {
        newErrors.push('End date must be after start date');
      }
    } catch (error) {
      newErrors.push('Invalid date format. Use MM/DD/YYYY');
    }

    // Check total combinations
    const totalRuns = config.generateCombinations 
      ? config.tickers.length * config.strategies.length
      : Math.max(config.tickers.length, config.strategies.length);

    if (totalRuns > 20) {
      newErrors.push(`Too many combinations (${totalRuns}). Maximum is 20.`);
    }

    return newErrors;
  }, [config]);

  const handleAddTicker = useCallback(() => {
    const ticker = tickerInput.trim().toUpperCase();
    if (ticker && !config.tickers.includes(ticker)) {
      setConfig(prev => ({
        ...prev,
        tickers: [...prev.tickers, ticker],
      }));
      setTickerInput('');
    }
  }, [tickerInput, config.tickers]);

  const handleRemoveTicker = useCallback((ticker: string) => {
    setConfig(prev => ({
      ...prev,
      tickers: prev.tickers.filter(t => t !== ticker),
    }));
  }, []);

  const handleStrategyChange = useCallback((strategy: StrategyType, checked: boolean) => {
    setConfig(prev => ({
      ...prev,
      strategies: checked
        ? [...prev.strategies, strategy]
        : prev.strategies.filter(s => s !== strategy),
    }));
  }, []);

  const handleStart = useCallback(() => {
    const validationErrors = validateConfig();
    setErrors(validationErrors);

    if (validationErrors.length === 0) {
      onStart(config);
      onClose();
    }
  }, [config, validateConfig, onStart, onClose]);

  const previewItems = generateBatchItems(config);
  const totalRuns = previewItems.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Batch Backtest Configuration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Tickers Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tickers ({config.tickers.length})
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTicker()}
                placeholder="Enter ticker symbol"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={10}
              />
              <button
                onClick={handleAddTicker}
                disabled={!tickerInput.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.tickers.map((ticker) => (
                <span
                  key={ticker}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm"
                >
                  {ticker}
                  <button
                    onClick={() => handleRemoveTicker(ticker)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Strategies Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Strategies ({config.strategies.length})
            </label>
            <div className="grid grid-cols-1 gap-2">
              {STRATEGY_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.strategies.includes(option.value)}
                    onChange={(e) => handleStrategyChange(option.value, e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="text"
                value={config.start_date}
                onChange={(e) => setConfig(prev => ({ ...prev, start_date: e.target.value }))}
                placeholder="MM/DD/YYYY"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="text"
                value={config.end_date}
                onChange={(e) => setConfig(prev => ({ ...prev, end_date: e.target.value }))}
                placeholder="MM/DD/YYYY"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Initial Capital */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial Capital
            </label>
            <input
              type="number"
              value={config.initial_capital}
              onChange={(e) => setConfig(prev => ({ ...prev, initial_capital: Number(e.target.value) }))}
              min="1000"
              step="1000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Combination Mode */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.generateCombinations}
                onChange={(e) => setConfig(prev => ({ ...prev, generateCombinations: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-sm font-medium text-gray-700">
                Generate all combinations (Tickers × Strategies)
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              {config.generateCombinations 
                ? `Will generate ${config.tickers.length} × ${config.strategies.length} = ${totalRuns} runs`
                : `Will generate ${Math.max(config.tickers.length, config.strategies.length)} runs by pairing in order`
              }
            </p>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <div className="flex items-center gap-2 text-red-800 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="font-medium">Configuration Errors:</span>
              </div>
              <ul className="text-sm text-red-700 space-y-1">
                {errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <h4 className="font-medium text-gray-900 mb-2">Preview ({totalRuns} runs)</h4>
            <div className="text-sm text-gray-600 space-y-1 max-h-32 overflow-y-auto">
              {previewItems.slice(0, 10).map((item, index) => (
                <div key={item.id}>
                  {index + 1}. {item.ticker} - {item.strategy}
                </div>
              ))}
              {totalRuns > 10 && (
                <div className="text-gray-500">... and {totalRuns - 10} more</div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={errors.length > 0 || totalRuns === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            Start Batch ({totalRuns} runs)
          </button>
        </div>
      </div>
    </div>
  );
};
