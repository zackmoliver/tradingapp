// src/lib/prefs.ts
import { invoke } from '@tauri-apps/api/core';
import type { BacktestParams } from '@/types/backtest';
import { preferencesManager } from '@/lib/prefs';

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
};
