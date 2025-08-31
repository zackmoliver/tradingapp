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
  Settings,
  RotateCcw,
  Save,
  Download,
  Upload,
  X
} from 'lucide-react';
import { BacktestParams, BacktestSummary, StrategyType } from '../types/backtest';
import { TauriAPI, TauriUtils } from '../lib/tauri';
import { preferencesManager, loadPresets, savePreset, loadPreset, deletePreset } from '../lib/prefs';
import { BacktestPreset, SavePresetRequest } from '../types/presets';
import { showSuccessToast, showErrorToast, showInfoToast } from '../lib/toast';
import Tooltip from './ui/Tooltip';
import { parseMMDDYYYY, toMMDDYYYY } from '../lib/date';
import {
  StrategyId,
  getAllStrategies,
  getStrategy,
  StrategyDefinition
} from '../lib/strategies';
import { validateParams, getDetailedValidation, sanitizeParams } from '../lib/strategies/schemas';
import { getPresets, getDefaultPreset, StrategyPreset } from '../lib/strategies/presets';

// Generate strategy options from strategy library
const STRATEGY_OPTIONS = getAllStrategies().map(strategy => ({
  value: strategy.id,
  label: strategy.name,
  description: strategy.description,
  complexity: strategy.complexity,
  category: strategy.category
}));

// Zod validation schema
const backtestSchema = z.object({
  ticker: z.string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker must be 10 characters or less')
    .regex(/^[A-Z]+$/, 'Ticker must contain only uppercase letters'),
  
  start_date: z.string()
    .regex(/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/, 'Date must be in MM/DD/YYYY format')
    .refine((date) => {
      const parsed = parseMMDDYYYY(date);
      return parsed !== null && parsed.getFullYear() >= 2000 && parsed.getFullYear() <= 2030;
    }, 'Invalid date or year must be between 2000-2030'),
  
  end_date: z.string()
    .regex(/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/, 'Date must be in MM/DD/YYYY format')
    .refine((date) => {
      const parsed = parseMMDDYYYY(date);
      return parsed !== null && parsed.getFullYear() >= 2000 && parsed.getFullYear() <= 2030;
    }, 'Invalid date or year must be between 2000-2030'),
  
  initial_capital: z.number()
    .min(1000, 'Initial capital must be at least $1,000')
    .max(10000000, 'Initial capital must be less than $10,000,000'),
  
  strategy: z.enum(['PMCC', 'Wheel', 'CoveredCall', 'iron_condor', 'bull_put_spread'])
}).refine((data) => {
  const startDate = parseMMDDYYYY(data.start_date);
  const endDate = parseMMDDYYYY(data.end_date);
  return startDate && endDate && endDate > startDate;
}, {
  message: 'End date must be after start date',
  path: ['end_date']
});

type BacktestFormData = z.infer<typeof backtestSchema>;

// Quick range options
const QUICK_RANGES = [
  { label: '1Y', years: 1 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
];

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
  // Form state with default values (will be overridden by preferences)
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

  // Preferences state
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  // Preset state
  const [presets, setPresets] = useState<BacktestPreset[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');
  const [savePresetDescription, setSavePresetDescription] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);

  // Strategy library state
  const [strategyParams, setStrategyParams] = useState<Record<string, any>>({});
  const [strategyPresets, setStrategyPresets] = useState<StrategyPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [strategyValidation, setStrategyValidation] = useState<{ ok: boolean; errors?: string[]; warnings?: string[] }>({ ok: true });

  // Debounced validation with strategy library integration
  const validateForm = useCallback(
    TauriUtils.debounce((data: BacktestFormData, params: Record<string, any>) => {
      try {
        // Basic form validation
        backtestSchema.parse(data);

        // Strategy parameter validation
        const strategyValidationResult = validateParams(data.strategy as StrategyId, params);
        setStrategyValidation(strategyValidationResult);

        // Combined validation
        const isFormValid = strategyValidationResult.ok;
        setErrors({});
        setIsValid(isFormValid);

      } catch (error) {
        if (error instanceof z.ZodError) {
          const newErrors: Partial<Record<keyof BacktestFormData, string>> = {};
          error.issues.forEach((err: any) => {
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

  // Load preferences on component mount
  useEffect(() => {
    const loadInitialPrefs = async () => {
      try {
        setIsLoadingPrefs(true);
        const savedPrefs = await preferencesManager.load();

        // Update form data with loaded preferences, providing defaults for undefined values
        setFormData({
          ticker: savedPrefs.ticker ?? formData.ticker,
          start_date: savedPrefs.start_date ?? formData.start_date,
          end_date: savedPrefs.end_date ?? formData.end_date,
          initial_capital: savedPrefs.initial_capital ?? formData.initial_capital,
          strategy: savedPrefs.strategy ?? formData.strategy
        });

        console.log('Preferences loaded:', savedPrefs);
        showInfoToast('Settings loaded', 'Your saved preferences have been restored');
      } catch (error) {
        console.error('Failed to load preferences:', error);
        // Keep default values if loading fails
      } finally {
        setIsLoadingPrefs(false);
      }
    };

    loadInitialPrefs();
  }, []);

  // Validate on form data change
  useEffect(() => {
    if (!isLoadingPrefs) {
      validateForm(formData, strategyParams);
    }
  }, [formData, strategyParams, validateForm, isLoadingPrefs]);

  // Load presets on component mount
  useEffect(() => {
    const loadInitialPresets = async () => {
      try {
        const savedPresets = await loadPresets();
        setPresets(savedPresets);
      } catch (error) {
        console.error('Failed to load presets:', error);
        showErrorToast('Failed to load presets', 'Could not load saved presets');
      }
    };

    loadInitialPresets();
  }, []);

  // Handle field changes
  const handleFieldChange = useCallback((field: keyof BacktestFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  // Handle strategy change
  const handleStrategyChange = useCallback((strategyId: StrategyId) => {
    setFormData(prev => ({ ...prev, strategy: strategyId as StrategyType }));

    // Load presets for the new strategy
    const presets = getPresets(strategyId);
    setStrategyPresets(presets);

    // Load default preset if available
    const defaultPreset = getDefaultPreset(strategyId);
    if (defaultPreset) {
      setStrategyParams(defaultPreset.params);
      setSelectedPreset(defaultPreset.name);
    } else {
      // Initialize with default parameters from strategy definition
      const strategy = getStrategy(strategyId);
      const defaultParams: Record<string, any> = {};
      strategy.parameters.forEach(param => {
        defaultParams[param.name] = param.default;
      });
      setStrategyParams(defaultParams);
      setSelectedPreset('');
    }
  }, []);

  // Handle preset selection
  const handlePresetChange = useCallback((presetName: string) => {
    setSelectedPreset(presetName);

    if (presetName && formData.strategy) {
      const preset = strategyPresets.find(p => p.name === presetName);
      if (preset) {
        setStrategyParams(preset.params);
      }
    }
  }, [formData.strategy, strategyPresets]);

  // Handle strategy parameter change
  const handleStrategyParamChange = useCallback((paramName: string, value: any) => {
    setStrategyParams(prev => ({ ...prev, [paramName]: value }));
  }, []);

  // Handle quick range selection
  const handleQuickRange = useCallback((years: number) => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - years);

    const newFormData = {
      ...formData,
      start_date: toMMDDYYYY(startDate),
      end_date: toMMDDYYYY(endDate)
    };

    setFormData(newFormData);
    setTouched(prev => ({ ...prev, start_date: true, end_date: true }));
  }, [formData]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid || isRunning || isLoadingPrefs) return;

    try {
      onBacktestStart?.();

      const params: BacktestParams = {
        ...formData,
        seed: TauriUtils.generateSeed()
      };

      // Save preferences before running backtest
      try {
        setIsSavingPrefs(true);
        await preferencesManager.save(formData);
        console.log('Preferences saved before backtest execution');
        showSuccessToast('Settings saved', 'Your preferences have been saved');
      } catch (prefError) {
        console.warn('Failed to save preferences:', prefError);
        // Continue with backtest even if preferences save fails
      } finally {
        setIsSavingPrefs(false);
      }

      const result = await TauriAPI.runBacktest(params);
      onBacktestComplete?.(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Backtest execution failed';
      onBacktestError?.(errorMessage);
    }
  }, [formData, isValid, isRunning, isLoadingPrefs, onBacktestStart, onBacktestComplete, onBacktestError]);

  // Handle manual preferences save
  const handleSavePrefs = useCallback(async () => {
    if (isSavingPrefs || !isValid) return;

    try {
      setIsSavingPrefs(true);
      await preferencesManager.save(formData);
      console.log('Preferences saved manually');
      showSuccessToast('Settings saved', 'Your preferences have been saved successfully');
    } catch (error) {
      console.error('Failed to save preferences:', error);
      showErrorToast('Save failed', 'Failed to save preferences. Please try again.');
    } finally {
      setIsSavingPrefs(false);
    }
  }, [formData, isValid, isSavingPrefs]);

  // Handle reset to defaults
  const handleResetPrefs = useCallback(async () => {
    try {
      const defaults = await preferencesManager.reset();

      // Ensure all required fields are present with proper defaults
      setFormData({
        ticker: defaults.ticker ?? 'AAPL',
        start_date: defaults.start_date ?? '01/01/2023',
        end_date: defaults.end_date ?? '12/31/2023',
        initial_capital: defaults.initial_capital ?? 100000,
        strategy: defaults.strategy ?? 'PMCC'
      });

      setTouched({});
      console.log('Preferences reset to defaults');
      showInfoToast('Settings reset', 'Preferences have been reset to defaults');
    } catch (error) {
      console.error('Failed to reset preferences:', error);
      showErrorToast('Reset failed', 'Failed to reset preferences. Please try again.');
    }
  }, []);

  // Preset handlers
  const handleSavePreset = useCallback(async () => {
    if (!savePresetName.trim() || isSavingPreset || !isValid) return;

    try {
      setIsSavingPreset(true);
      const request: SavePresetRequest = {
        name: savePresetName.trim(),
        description: savePresetDescription.trim() || undefined,
        parameters: {
          ...formData,
          seed: TauriUtils.generateSeed()
        }
      };

      const newPreset = await savePreset(request);
      setPresets(prev => [...prev, newPreset]);

      // Reset modal state
      setShowSaveModal(false);
      setSavePresetName('');
      setSavePresetDescription('');

      showSuccessToast('Preset saved', `Preset "${newPreset.name}" has been saved successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save preset';
      showErrorToast('Save failed', errorMessage);
    } finally {
      setIsSavingPreset(false);
    }
  }, [savePresetName, savePresetDescription, formData, isValid, isSavingPreset]);

  const handleLoadPreset = useCallback(async (presetId: string) => {
    try {
      const response = await loadPreset(presetId);
      if (!response.success || !response.preset) {
        showErrorToast('Load failed', response.error || 'Preset not found');
        return;
      }

      const preset = response.preset;
      setFormData({
        ticker: preset.parameters.ticker,
        start_date: preset.parameters.start_date,
        end_date: preset.parameters.end_date,
        initial_capital: preset.parameters.initial_capital,
        strategy: preset.parameters.strategy as StrategyType
      });

      setTouched({});
      setShowLoadModal(false);

      showSuccessToast('Preset loaded', `Preset "${preset.name}" has been loaded successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load preset';
      showErrorToast('Load failed', errorMessage);
    }
  }, []);

  const handleDeletePreset = useCallback(async (presetId: string) => {
    try {
      const success = await deletePreset(presetId);
      if (success) {
        setPresets(prev => prev.filter(p => p.id !== presetId));
        showSuccessToast('Preset deleted', 'Preset has been deleted successfully');
      } else {
        showErrorToast('Delete failed', 'Preset not found or could not be deleted');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete preset';
      showErrorToast('Delete failed', errorMessage);
    }
  }, []);

  return (
    <div className={`backtest-controls bg-white rounded-lg shadow-sm border border-neutral-200 card-padding ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 card-header-height">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary-600" />
          <h2 className="subsection-title">Backtest Controls</h2>
        </div>

        {/* Preferences Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSavePrefs}
            disabled={isSavingPrefs || !isValid || isLoadingPrefs}
            className="inline-flex items-center px-2 py-1 text-xs font-medium text-neutral-600 bg-neutral-100 border border-neutral-200 rounded hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Save current settings as defaults"
          >
            {isSavingPrefs ? (
              <div className="w-3 h-3 border border-neutral-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-3 h-3" />
            )}
          </button>

          <button
            onClick={handleResetPrefs}
            disabled={isLoadingPrefs || isRunning}
            className="inline-flex items-center px-2 py-1 text-xs font-medium text-neutral-600 bg-neutral-100 border border-neutral-200 rounded hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Reset to default settings"
          >
            <RotateCcw className="w-3 h-3" />
          </button>

          {/* Preset Actions */}
          <div className="flex items-center space-x-1 ml-2 pl-2 border-l border-neutral-300">
            <button
              onClick={() => setShowSaveModal(true)}
              disabled={!isValid || isLoadingPrefs || isRunning}
              className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Save current settings as preset"
            >
              <Download className="w-3 h-3" />
            </button>

            <button
              onClick={() => setShowLoadModal(true)}
              disabled={presets.length === 0 || isLoadingPrefs || isRunning}
              className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Load saved preset"
            >
              <Upload className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoadingPrefs && (
        <div className="flex items-center justify-center py-4 mb-4 bg-neutral-50 rounded-lg border border-neutral-200">
          <div className="flex items-center space-x-2 text-sm text-neutral-600">
            <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
            <span>Loading saved preferences...</span>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Ticker Input */}
        <div className="form-group">
          <label htmlFor="ticker" className="block text-sm font-medium text-neutral-700 mb-2">
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
            <p className="mt-2 caption-text text-danger-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.ticker}
            </p>
          )}
        </div>

        {/* Date Range */}
        <div className="space-y-4">
          {/* Quick Range Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-700">Quick ranges:</span>
            {QUICK_RANGES.map((range) => (
              <button
                key={range.label}
                type="button"
                onClick={() => handleQuickRange(range.years)}
                disabled={isRunning}
                className="px-3 py-1 text-sm border border-neutral-300 rounded-md hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {range.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Start Date */}
            <div className="form-group">
              <label htmlFor="start_date" className="block text-sm font-medium text-neutral-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Start Date
              </label>
              <input
                id="start_date"
                type="date"
                value={formData.start_date ? (() => {
                  const parsed = parseMMDDYYYY(formData.start_date);
                  return parsed ? parsed.toISOString().split('T')[0] : '';
                })() : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    const date = new Date(e.target.value);
                    handleFieldChange('start_date', toMMDDYYYY(date));
                  }
                }}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                  errors.start_date && touched.start_date ? 'border-danger-300' : 'border-neutral-300'
                }`}
                disabled={isRunning}
              />
              <div className="mt-1 text-xs text-neutral-500">
                Selected: {formData.start_date || 'None'}
              </div>
              {errors.start_date && touched.start_date && (
                <p className="mt-2 caption-text text-danger-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.start_date}
                </p>
              )}
            </div>

            {/* End Date */}
            <div className="form-group">
              <label htmlFor="end_date" className="block text-sm font-medium text-neutral-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                End Date
              </label>
              <input
                id="end_date"
                type="date"
                value={formData.end_date ? (() => {
                  const parsed = parseMMDDYYYY(formData.end_date);
                  return parsed ? parsed.toISOString().split('T')[0] : '';
                })() : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    const date = new Date(e.target.value);
                    handleFieldChange('end_date', toMMDDYYYY(date));
                  }
                }}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                  errors.end_date && touched.end_date ? 'border-danger-300' : 'border-neutral-300'
                }`}
                disabled={isRunning}
              />
              <div className="mt-1 text-xs text-neutral-500">
                Selected: {formData.end_date || 'None'}
              </div>
              {errors.end_date && touched.end_date && (
                <p className="mt-2 caption-text text-danger-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.end_date}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Initial Capital */}
        <div className="form-group">
          <label htmlFor="initial_capital" className="block text-sm font-medium text-neutral-700 mb-2">
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
          <label htmlFor="strategy" className="block text-sm font-medium text-neutral-700 mb-1 flex items-center gap-1">
            <TrendingUp className="w-4 h-4 inline mr-1" />
            Strategy
            {formData.strategy === 'PMCC' && (
              <Tooltip content="Poor Man's Covered Call: long-dated in-the-money call + short nearer-dated call.">
                <span></span>
              </Tooltip>
            )}
          </label>
          <select
            id="strategy"
            value={formData.strategy}
            onChange={(e) => handleStrategyChange(e.target.value as StrategyId)}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.strategy && touched.strategy ? 'border-danger-300' : 'border-neutral-300'
            }`}
            disabled={isRunning}
          >
            <option value="">Select Strategy</option>
            {STRATEGY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} title={option.description}>
                {option.label} ({option.complexity})
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

        {/* Strategy Preset Selection */}
        {formData.strategy && strategyPresets.length > 0 && (
          <div>
            <label htmlFor="preset" className="block text-sm font-medium text-neutral-700 mb-1">
              Strategy Preset
              <Tooltip content="Pre-configured parameter sets for different risk levels">
                <span className="ml-1 text-neutral-400 cursor-help">ⓘ</span>
              </Tooltip>
            </label>
            <select
              id="preset"
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              disabled={isRunning}
            >
              <option value="">Custom Parameters</option>
              {strategyPresets.map((preset) => (
                <option key={preset.name} value={preset.name} title={preset.description}>
                  {preset.name} ({preset.riskLevel})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Strategy Parameters */}
        {formData.strategy && (
          <div className="space-y-4 p-4 bg-neutral-50 rounded-lg">
            <h3 className="text-sm font-medium text-neutral-700">Strategy Parameters</h3>
            {(() => {
              try {
                const strategy = getStrategy(formData.strategy as StrategyId);
                return strategy.parameters.map((param) => (
                  <div key={param.name}>
                    <label htmlFor={param.name} className="block text-sm font-medium text-neutral-700 mb-1">
                      {param.label}
                      {param.tooltip && (
                        <Tooltip content={param.tooltip}>
                          <span className="ml-1 text-neutral-400 cursor-help">ⓘ</span>
                        </Tooltip>
                      )}
                    </label>

                    {param.type === 'select' ? (
                      <select
                        id={param.name}
                        value={strategyParams[param.name] || param.default}
                        onChange={(e) => handleStrategyParamChange(param.name, e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        disabled={isRunning}
                      >
                        {param.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : param.type === 'boolean' ? (
                      <div className="flex items-center">
                        <input
                          id={param.name}
                          type="checkbox"
                          checked={strategyParams[param.name] || param.default}
                          onChange={(e) => handleStrategyParamChange(param.name, e.target.checked)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-neutral-300 rounded"
                          disabled={isRunning}
                        />
                        <span className="ml-2 text-sm text-neutral-600">{param.description}</span>
                      </div>
                    ) : (
                      <input
                        id={param.name}
                        type="number"
                        value={strategyParams[param.name] || param.default}
                        onChange={(e) => handleStrategyParamChange(param.name, param.type === 'integer' ? parseInt(e.target.value) || param.default : parseFloat(e.target.value) || param.default)}
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        disabled={isRunning}
                      />
                    )}

                    <p className="mt-1 text-xs text-neutral-500">{param.description}</p>
                  </div>
                ));
              } catch (error) {
                return <p className="text-sm text-danger-600">Error loading strategy parameters</p>;
              }
            })()}
          </div>
        )}

        {/* Strategy Validation Errors */}
        {!strategyValidation.ok && strategyValidation.errors && (
          <div className="p-3 bg-danger-50 border border-danger-200 rounded-md">
            <div className="flex items-start">
              <AlertCircle className="w-4 h-4 text-danger-600 mt-0.5 mr-2" />
              <div>
                <h4 className="text-sm font-medium text-danger-800">Parameter Validation Errors</h4>
                <ul className="mt-1 text-sm text-danger-700 space-y-1">
                  {strategyValidation.errors.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Strategy Validation Warnings */}
        {strategyValidation.warnings && strategyValidation.warnings.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
            <div className="flex items-start">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 mr-2" />
              <div>
                <h4 className="text-sm font-medium text-amber-800">Parameter Warnings</h4>
                <ul className="mt-1 text-sm text-amber-700 space-y-1">
                  {strategyValidation.warnings.map((warning, i) => (
                    <li key={i}>• {warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isValid || isRunning || isLoadingPrefs}
          className={`w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md shadow-sm text-white transition-colors ${
            !isValid || isRunning || isLoadingPrefs
              ? 'bg-neutral-400 cursor-not-allowed'
              : 'bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
          }`}
        >
          {isLoadingPrefs ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading Settings...
            </>
          ) : isRunning ? (
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
        {!isValid && Object.keys(touched).length > 0 && !isLoadingPrefs && (
          <div className="mt-4 p-3 bg-warning-50 border border-warning-200 rounded-md">
            <p className="text-sm text-warning-800 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              Please fix the validation errors above before running the backtest.
            </p>
          </div>
        )}

        {/* Preferences Status */}
        {isSavingPrefs && (
          <div className="mt-4 p-3 bg-primary-50 border border-primary-200 rounded-md">
            <p className="text-sm text-primary-800 flex items-center">
              <div className="w-4 h-4 mr-2 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
              Saving preferences...
            </p>
          </div>
        )}
      </form>

      {/* Save Preset Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Save Preset</h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preset Name *
                </label>
                <input
                  type="text"
                  value={savePresetName}
                  onChange={(e) => setSavePresetName(e.target.value)}
                  placeholder="Enter preset name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={50}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={savePresetDescription}
                  onChange={(e) => setSavePresetDescription(e.target.value)}
                  placeholder="Enter description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={200}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreset}
                disabled={!savePresetName.trim() || isSavingPreset}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingPreset ? 'Saving...' : 'Save Preset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Preset Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Load Preset</h3>
              <button
                onClick={() => setShowLoadModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {presets.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No presets saved yet</p>
              ) : (
                presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{preset.name}</h4>
                        {preset.description && (
                          <p className="text-sm text-gray-600 mt-1">{preset.description}</p>
                        )}
                        <div className="text-xs text-gray-500 mt-2 space-y-1">
                          <div>Strategy: {preset.parameters.strategy}</div>
                          <div>Symbol: {preset.parameters.ticker}</div>
                          <div>Period: {preset.parameters.start_date} - {preset.parameters.end_date}</div>
                          <div>Capital: ${preset.parameters.initial_capital.toLocaleString()}</div>
                          <div>Created: {new Date(preset.created).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => handleLoadPreset(preset.id)}
                          className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDeletePreset(preset.id)}
                          className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowLoadModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BacktestControls;
