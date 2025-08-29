/**
 * Backtest Controls Component
 * 
 * Professional-grade form component for backtest parameters with:
 * - Zod validation for all fields
 * - Real-time validation feedback
 * - Debounced onChange handlers
 * - Disabled state management
 * - Integration with Tauri backend
 */

import React, { useState, useCallback, useEffect } from 'react';
import { z } from 'zod';
import { 
  Play, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  Loader2,
  Settings
} from 'lucide-react';
import { BacktestParams, BacktestSummary, STRATEGY_OPTIONS, StrategyType } from '../types/backtest';
import { TauriAPI, TauriUtils } from '../lib/tauri';

// Zod validation schema
const backtestSchema = z.object({
  ticker: z.string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker must be 10 characters or less')
    .regex(/^[A-Z]+$/, 'Ticker must contain only uppercase letters'),
  
  start_date: z.string()
    .regex(/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/, 'Date must be in MM/DD/YYYY format')
    .refine((date) => {
      const parsed = new Date(date);
      return !isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000 && parsed.getFullYear() <= 2030;
    }, 'Invalid date or year must be between 2000-2030'),
  
  end_date: z.string()
    .regex(/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/, 'Date must be in MM/DD/YYYY format')
    .refine((date) => {
      const parsed = new Date(date);
      return !isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000 && parsed.getFullYear() <= 2030;
    }, 'Invalid date or year must be between 2000-2030'),
  
  initial_capital: z.number()
    .min(1000, 'Initial capital must be at least $1,000')
    .max(10000000, 'Initial capital must be less than $10,000,000'),
  
  strategy: z.enum(['PMCC', 'Wheel', 'CoveredCall', 'iron_condor', 'bull_put_spread'])
}).refine((data) => {
  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);
  return endDate > startDate;
}, {
  message: 'End date must be after start date',
  path: ['end_date']
});

type BacktestFormData = z.infer<typeof backtestSchema>;

interface BacktestControlsProps {
  onBacktestStart?: () => void;
  onBacktestComplete?: (result: BacktestSummary) => void;
  onBacktestError?: (error: string) => void;
  isRunning?: boolean;
  className?: string;
}

const BacktestControls: React.FC<BacktestControlsProps> = ({
  onBacktestStart,
  onBacktestComplete,
  onBacktestError,
  isRunning = false,
  className = ''
}) => {
  // Form state
  const [formData, setFormData] = useState<BacktestFormData>({
    ticker: 'AAPL',
    start_date: '01/01/2023',
    end_date: '12/31/2023',
    initial_capital: 100000,
    strategy: 'PMCC'
  });

  // Validation state
  const [errors, setErrors] = useState<Partial<Record<keyof BacktestFormData, string>>>({});
  const [isValid, setIsValid] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof BacktestFormData, boolean>>>({});

  // Debounced validation
  const validateForm = useCallback(
    TauriUtils.debounce((data: BacktestFormData) => {
      try {
        backtestSchema.parse(data);
        setErrors({});
        setIsValid(true);
      } catch (error) {
        if (error instanceof z.ZodError) {
          const newErrors: Partial<Record<keyof BacktestFormData, string>> = {};
          error.errors.forEach((err) => {
            const field = err.path[0] as keyof BacktestFormData;
            newErrors[field] = err.message;
          });
          setErrors(newErrors);
          setIsValid(false);
        }
      }
    }, 300),
    []
  );

  // Validate on form data change
  useEffect(() => {
    validateForm(formData);
  }, [formData, validateForm]);

  // Handle field changes
  const handleFieldChange = useCallback((field: keyof BacktestFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValid || isRunning) return;

    try {
      onBacktestStart?.();

      const params: BacktestParams = {
        ...formData,
        seed: TauriUtils.generateSeed()
      };

      const result = await TauriAPI.runBacktest(params);
      onBacktestComplete?.(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Backtest execution failed';
      onBacktestError?.(errorMessage);
    }
  }, [formData, isValid, isRunning, onBacktestStart, onBacktestComplete, onBacktestError]);

  return (
    <div className={`backtest-controls bg-white rounded-lg shadow-sm border border-neutral-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center space-x-2 mb-6">
        <Settings className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold text-neutral-900">Backtest Controls</h2>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Ticker Input */}
        <div className="form-group">
          <label htmlFor="ticker" className="block text-sm font-medium text-neutral-700 mb-1">
            <TrendingUp className="w-4 h-4 inline mr-1" />
            Ticker Symbol
          </label>
          <input
            id="ticker"
            type="text"
            value={formData.ticker}
            onChange={(e) => handleFieldChange('ticker', e.target.value.toUpperCase())}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.ticker && touched.ticker ? 'border-danger-300' : 'border-neutral-300'
            }`}
            placeholder="AAPL"
            disabled={isRunning}
          />
          {errors.ticker && touched.ticker && (
            <p className="mt-1 text-sm text-danger-600 flex items-center">
              <AlertCircle className="w-4 h-4 mr-1" />
              {errors.ticker}
            </p>
          )}
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Start Date */}
          <div className="form-group">
            <label htmlFor="start_date" className="block text-sm font-medium text-neutral-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Start Date
            </label>
            <input
              id="start_date"
              type="text"
              value={formData.start_date}
              onChange={(e) => handleFieldChange('start_date', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                errors.start_date && touched.start_date ? 'border-danger-300' : 'border-neutral-300'
              }`}
              placeholder="MM/DD/YYYY"
              disabled={isRunning}
            />
            {errors.start_date && touched.start_date && (
              <p className="mt-1 text-sm text-danger-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.start_date}
              </p>
            )}
          </div>

          {/* End Date */}
          <div className="form-group">
            <label htmlFor="end_date" className="block text-sm font-medium text-neutral-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              End Date
            </label>
            <input
              id="end_date"
              type="text"
              value={formData.end_date}
              onChange={(e) => handleFieldChange('end_date', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                errors.end_date && touched.end_date ? 'border-danger-300' : 'border-neutral-300'
              }`}
              placeholder="MM/DD/YYYY"
              disabled={isRunning}
            />
            {errors.end_date && touched.end_date && (
              <p className="mt-1 text-sm text-danger-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.end_date}
              </p>
            )}
          </div>
        </div>

        {/* Initial Capital */}
        <div className="form-group">
          <label htmlFor="initial_capital" className="block text-sm font-medium text-neutral-700 mb-1">
            <DollarSign className="w-4 h-4 inline mr-1" />
            Initial Capital
          </label>
          <input
            id="initial_capital"
            type="number"
            value={formData.initial_capital}
            onChange={(e) => handleFieldChange('initial_capital', parseFloat(e.target.value) || 0)}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.initial_capital && touched.initial_capital ? 'border-danger-300' : 'border-neutral-300'
            }`}
            placeholder="100000"
            min="1000"
            max="10000000"
            step="1000"
            disabled={isRunning}
          />
          {errors.initial_capital && touched.initial_capital && (
            <p className="mt-1 text-sm text-danger-600 flex items-center">
              <AlertCircle className="w-4 h-4 mr-1" />
              {errors.initial_capital}
            </p>
          )}
        </div>

        {/* Strategy Selection */}
        <div className="form-group">
          <label htmlFor="strategy" className="block text-sm font-medium text-neutral-700 mb-1">
            <TrendingUp className="w-4 h-4 inline mr-1" />
            Strategy
          </label>
          <select
            id="strategy"
            value={formData.strategy}
            onChange={(e) => handleFieldChange('strategy', e.target.value as StrategyType)}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.strategy && touched.strategy ? 'border-danger-300' : 'border-neutral-300'
            }`}
            disabled={isRunning}
          >
            {STRATEGY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.strategy && touched.strategy && (
            <p className="mt-1 text-sm text-danger-600 flex items-center">
              <AlertCircle className="w-4 h-4 mr-1" />
              {errors.strategy}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isValid || isRunning}
          className={`w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md shadow-sm text-white transition-colors ${
            !isValid || isRunning
              ? 'bg-neutral-400 cursor-not-allowed'
              : 'bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
          }`}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Running Backtest...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run Backtest
            </>
          )}
        </button>

        {/* Form Status */}
        {!isValid && Object.keys(touched).length > 0 && (
          <div className="mt-4 p-3 bg-warning-50 border border-warning-200 rounded-md">
            <p className="text-sm text-warning-800 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              Please fix the validation errors above before running the backtest.
            </p>
          </div>
        )}
      </form>
    </div>
  );
};

export default BacktestControls;
