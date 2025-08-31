// src/types/presets.ts
// Preset type definitions

export interface BacktestPreset {
  id: string;
  name: string;
  description?: string;
  created: string; // ISO date string
  updated: string; // ISO date string
  parameters: {
    ticker: string;
    start_date: string; // MM/DD/YYYY
    end_date: string;   // MM/DD/YYYY
    strategy: string;
    initial_capital: number;
    seed?: number;
    // Strategy-specific parameters
    [key: string]: any;
  };
}

export interface PresetCollection {
  version: string;
  presets: BacktestPreset[];
  lastUpdated: string; // ISO date string
}

export interface SavePresetRequest {
  name: string;
  description?: string;
  parameters: BacktestPreset['parameters'];
}

export interface LoadPresetResponse {
  success: boolean;
  preset?: BacktestPreset;
  error?: string;
}
