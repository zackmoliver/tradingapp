/**
 * Preferences Management System
 *
 * Professional preferences persistence using Tauri v2 filesystem API.
 * Stores BacktestParams to disk with schema validation using Zod.
 *
 * Features:
 * - Persistent storage in app config directory
 * - Schema validation with Zod
 * - Automatic directory creation
 * - Error handling and fallbacks
 * - Type-safe preferences management
 */

import { z } from 'zod';
import { invoke } from './tauri';
import { BacktestParams } from '../types/backtest';

/**
 * Zod schema for BacktestParams validation
 */
const BacktestParamsSchema = z.object({
  ticker: z.string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker must be 10 characters or less')
    .regex(/^[A-Z]+$/, 'Ticker must contain only uppercase letters'),

  start_date: z.string()
    .regex(/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/, 'Date must be in MM/DD/YYYY format'),

  end_date: z.string()
    .regex(/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/, 'Date must be in MM/DD/YYYY format'),

  strategy: z.enum(['PMCC', 'Wheel', 'CoveredCall', 'iron_condor', 'bull_put_spread']),

  initial_capital: z.number()
    .min(1000, 'Initial capital must be at least $1,000')
    .max(10000000, 'Initial capital must be less than $10,000,000'),

  seed: z.number().optional()
}).refine((data) => {
  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);
  return endDate > startDate;
}, {
  message: 'End date must be after start date',
  path: ['end_date']
});

/**
 * Default preferences
 */
const DEFAULT_PREFERENCES: BacktestParams = {
  ticker: 'AAPL',
  start_date: '01/01/2023',
  end_date: '12/31/2023',
  strategy: 'PMCC',
  initial_capital: 100000,
  seed: 42
};





/**
 * Load preferences from disk using Tauri command
 */
export async function loadPrefs(): Promise<BacktestParams> {
  try {
    console.log('Loading preferences...');

    // Use Tauri command to load preferences
    const savedPrefs = await invoke<BacktestParams | null>('load_preferences');

    if (!savedPrefs) {
      console.log('No saved preferences found, using defaults');
      return DEFAULT_PREFERENCES;
    }

    // Validate with Zod schema
    const validatedPrefs = BacktestParamsSchema.parse(savedPrefs);

    console.log('Preferences loaded successfully:', validatedPrefs);
    return validatedPrefs;

  } catch (error) {
    console.error('Failed to load preferences:', error);

    if (error instanceof z.ZodError) {
      console.warn('Invalid preferences format, using defaults');
      return DEFAULT_PREFERENCES;
    }

    // For other errors, still return defaults but log the issue
    console.warn('Unexpected error loading preferences, using defaults');
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save preferences to disk using Tauri command
 */
export async function savePrefs(prefs: BacktestParams): Promise<void> {
  try {
    console.log('Saving preferences:', prefs);

    // Validate preferences before saving
    const validatedPrefs = BacktestParamsSchema.parse(prefs);

    // Use Tauri command to save preferences
    await invoke('save_preferences', { preferences: validatedPrefs });

    console.log('Preferences saved successfully');

  } catch (error) {
    console.error('Failed to save preferences:', error);

    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e: any) => e.message).join(', ');
      throw new Error(`Invalid preferences data: ${errorMessages}`);
    }

    throw new Error('Unable to save preferences to disk');
  }
}

/**
 * Reset preferences to defaults
 */
export async function resetPrefs(): Promise<BacktestParams> {
  try {
    await savePrefs(DEFAULT_PREFERENCES);
    return DEFAULT_PREFERENCES;
  } catch (error) {
    console.error('Failed to reset preferences:', error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Simple preferences manager
 */
class PreferencesManager {
  private cachedPrefs: BacktestParams | null = null;
  
  async load(): Promise<BacktestParams> {
    if (this.cachedPrefs) {
      return this.cachedPrefs;
    }
    
    this.cachedPrefs = await loadPrefs();
    return this.cachedPrefs;
  }
  
  async save(prefs: BacktestParams): Promise<void> {
    await savePrefs(prefs);
    this.cachedPrefs = prefs;
  }
  
  async reset(): Promise<BacktestParams> {
    const defaults = await resetPrefs();
    this.cachedPrefs = defaults;
    return defaults;
  }
  
  clearCache(): void {
    this.cachedPrefs = null;
  }
}

// Export singleton instance
export const preferencesManager = new PreferencesManager();