// src/lib/prefs.ts
import { invoke, isTauri } from './tauri';
import { z } from 'zod';
import { appConfigDir } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, exists, mkdir as createDir } from '@tauri-apps/plugin-fs';
import type { BacktestParams } from '@/types/backtest';
import { BacktestPreset, PresetCollection, SavePresetRequest, LoadPresetResponse } from '@/types/presets';

export type Preferences = Partial<BacktestParams> & {
  analyzer?: {
    enabledIndicators?: string[];
    params?: Record<string, any>;
    profile?: string | null;
  };
};

const DEFAULTS: Preferences = {
  ticker: 'SPY',
  start_date: '01/01/2023',
  end_date: '12/31/2023',
  strategy: 'PMCC',
  initial_capital: 100000,
  analyzer: { enabledIndicators: [], params: {}, profile: null }
};

export async function loadPreferencesSafe(): Promise<Preferences> {
  try {
    const raw = await invoke<Preferences | null>('load_preferences');
    if (!raw) return { ...DEFAULTS };
    return {
      ...DEFAULTS,
      ...raw,
      analyzer: { ...DEFAULTS.analyzer, ...(raw as any).analyzer }
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function savePreferencesSafe(p: Preferences): Promise<void> {
  try {
    await invoke('save_preferences', { preferences: p });
  } catch {
    // noop (caller can show a toast if desired)
  }
}

/** Backwards-compatible manager expected by BacktestControls */
export const preferencesManager = {
  async load() {
    return loadPreferencesSafe();
  },
  async save(p: Preferences) {
    return savePreferencesSafe(p);
  },
  async reset() {
    return { ...DEFAULTS };
  },
};

// ===== PRESET MANAGEMENT =====

// Zod schemas for validation
const BacktestParametersSchema = z.object({
  ticker: z.string().min(1, 'Ticker is required'),
  start_date: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Start date must be MM/DD/YYYY format'),
  end_date: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'End date must be MM/DD/YYYY format'),
  strategy: z.string().min(1, 'Strategy is required'),
  initial_capital: z.number().positive('Initial capital must be positive'),
  seed: z.number().optional(),
}).catchall(z.any()); // Allow additional strategy-specific parameters

const BacktestPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Preset name is required'),
  description: z.string().optional(),
  created: z.string(),
  updated: z.string(),
  parameters: BacktestParametersSchema,
});

const PresetCollectionSchema = z.object({
  version: z.string(),
  presets: z.array(BacktestPresetSchema),
  lastUpdated: z.string(),
});

const PRESETS_FILE = 'presets.json';
const CURRENT_VERSION = '1.0.0';

/**
 * Get the full path to the presets file
 */
async function getPresetsPath(): Promise<string> {
  const configDir = await appConfigDir();
  return `${configDir}/trading-app/${PRESETS_FILE}`;
}

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  try {
    const configDir = await appConfigDir();
    const tradingAppDir = `${configDir}/trading-app`;

    const dirExists = await exists(tradingAppDir);
    if (!dirExists) {
      await createDir(tradingAppDir, { recursive: true, baseDir: undefined });
    }
  } catch (error) {
    console.warn('Failed to create config directory:', error);
    throw new Error('Failed to create config directory');
  }
}

/**
 * Load presets from disk
 */
export async function loadPresets(): Promise<BacktestPreset[]> {
  if (!isTauri()) {
    // In web context, return empty array (no FS access)
    return [];
  }

  try {
    await ensureConfigDir();
    const presetsPath = await getPresetsPath();

    const fileExists = await exists(presetsPath);
    if (!fileExists) {
      // Return empty array if file doesn't exist
      return [];
    }

    const fileContent = await readTextFile(presetsPath);
    const rawData = JSON.parse(fileContent);

    // Validate the data structure
    const validatedData = PresetCollectionSchema.parse(rawData);

    return validatedData.presets;
  } catch (error) {
    console.warn('Failed to load presets:', error);
    // Return empty array on any error
    return [];
  }
}

/**
 * Save presets to disk
 */
export async function savePresets(presets: BacktestPreset[]): Promise<void> {
  if (!isTauri()) {
    // In web context, silently ignore save (no FS access)
    return;
  }

  try {
    await ensureConfigDir();
    const presetsPath = await getPresetsPath();

    // Validate all presets before saving
    const validatedPresets = presets.map(preset => BacktestPresetSchema.parse(preset));

    const collection: PresetCollection = {
      version: CURRENT_VERSION,
      presets: validatedPresets,
      lastUpdated: new Date().toISOString(),
    };

    const fileContent = JSON.stringify(collection, null, 2);
    await writeTextFile(presetsPath, fileContent);
  } catch (error) {
    console.error('Failed to save presets:', error);
    throw new Error('Failed to save presets to disk');
  }
}

/**
 * Save a new preset
 */
export async function savePreset(request: SavePresetRequest): Promise<BacktestPreset> {
  if (!isTauri()) {
    // In web context, return a mock preset (no FS access)
    return {
      id: generatePresetId(),
      name: request.name.trim(),
      description: request.description?.trim(),
      parameters: request.parameters,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
  }

  try {
    // Validate the parameters
    const validatedParams = BacktestParametersSchema.parse(request.parameters);

    const existingPresets = await loadPresets();

    // Check for duplicate names
    const existingNames = existingPresets.map(p => p.name.toLowerCase());
    if (existingNames.includes(request.name.toLowerCase())) {
      throw new Error(`A preset named "${request.name}" already exists`);
    }

    // Create new preset
    const newPreset: BacktestPreset = {
      id: generatePresetId(),
      name: request.name.trim(),
      description: request.description?.trim(),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      parameters: validatedParams,
    };

    // Add to existing presets and save
    const updatedPresets = [...existingPresets, newPreset];
    await savePresets(updatedPresets);

    return newPreset;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      throw new Error(`Validation error: ${firstError.message}`);
    }
    throw error;
  }
}

/**
 * Load a specific preset by ID
 */
export async function loadPreset(id: string): Promise<LoadPresetResponse> {
  try {
    const presets = await loadPresets();
    const preset = presets.find(p => p.id === id);

    if (!preset) {
      return {
        success: false,
        error: 'Preset not found',
      };
    }

    return {
      success: true,
      preset,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load preset',
    };
  }
}

/**
 * Delete a preset by ID
 */
export async function deletePreset(id: string): Promise<boolean> {
  if (!isTauri()) {
    // In web context, return false (no FS access)
    return false;
  }

  try {
    const presets = await loadPresets();
    const filteredPresets = presets.filter(p => p.id !== id);

    if (filteredPresets.length === presets.length) {
      // No preset was removed
      return false;
    }

    await savePresets(filteredPresets);
    return true;
  } catch (error) {
    console.error('Failed to delete preset:', error);
    return false;
  }
}

/**
 * Generate a unique preset ID
 */
function generatePresetId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `preset_${timestamp}_${randomPart}`;
}

/**
 * Validate preset parameters
 */
export function validatePresetParameters(parameters: any): { valid: boolean; errors: string[] } {
  try {
    BacktestParametersSchema.parse(parameters);
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`),
      };
    }
    return {
      valid: false,
      errors: ['Unknown validation error'],
    };
  }
}
