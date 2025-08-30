/**
 * Centralized Tauri API Imports
 *
 * This module serves as the single source of truth for all Tauri API imports.
 * All components should import Tauri functionality from this module instead
 * of directly from @tauri-apps/api/* packages.
 *
 * This ensures:
 * - Consistent API usage across the application
 * - Easy migration between Tauri versions
 * - Centralized error handling and utilities
 * - Prevention of direct Tauri API usage (enforced by ESLint)
 */

// Core Tauri v2 imports - ONLY place in codebase that should import directly
import { invoke } from '@tauri-apps/api/core';

// Re-export core functionality for application use
export { invoke };

export type TauriErrorType = 'timeout' | 'backend' | 'network' | 'unknown';

export interface TauriError {
  message: string;
  type: TauriErrorType;
  details?: string;
  timestamp: Date;
  operation?: string;
}

const withTimeout = <T,>(p: Promise<T>, ms: number, op: string) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      const err: TauriError = {
        message: 'Operation timed out',
        type: 'timeout',
        details: `Timeout after ${ms}ms during ${op}`,
        timestamp: new Date(),
        operation: op
      };
      reject(err);
    }, ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); reject(e); });
  });

export function handleTauriError(e: unknown, op: string): TauriError {
  if (typeof e === 'object' && e && 'message' in e) {
    const msg = (e as any).message ?? String(e);
    const type: TauriErrorType =
      /timeout/i.test(msg) ? 'timeout' :
      /network|fetch|econn|dns/i.test(msg) ? 'network' :
      /tauri|invoke|command/i.test(msg) ? 'backend' : 'unknown';
    return { message: 'Request failed', type, details: `${op}: ${msg}`, timestamp: new Date(), operation: op };
  }
  return { message: 'Unknown error', type: 'unknown', details: `${op}: ${String(e)}`, timestamp: new Date(), operation: op };
}

export class ProgressTracker {
  private id: any;
  private val = 0;
  constructor(
    private set: (n: number) => void,
    private cap: number = 85,
    private stepRange: [number, number] = [3, 10],
    private intervalMs: number = 300
  ) {}
  start() {
    this.stop();
    this.id = setInterval(() => {
      const inc = Math.floor(Math.random() * (this.stepRange[1] - this.stepRange[0] + 1)) + this.stepRange[0];
      this.val = Math.min(this.cap, this.val + inc);
      this.set(this.val);
    }, this.intervalMs);
  }
  complete() { this.val = 100; this.set(100); this.stop(); }
  stop() { if (this.id) clearInterval(this.id); this.id = null; }
}

export const TauriUtils = {
  debounce<T extends (...args: any[]) => any>(fn: T, wait = 300) {
    let t: any;
    return (...args: Parameters<T>) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  },
  createDefaultBacktestParams() {
    return {
      symbol: 'SPY',
      start: '2022-01-01',
      end: '2024-12-31',
      strategy: 'PMCC',
      capital: 100000,
      riskPerTrade: 0.01
    };
  },
  generateSeed() {
    // simple random 32‑bit integer
    return Math.floor(Math.random() * 0xffffffff);
  }
};

import type { BacktestSummary } from '../types/backtest';

export const TauriAPI = {
  async ping(): Promise<{ ok: boolean; ts: number }> {
    const op = 'Backend ping';
    const promise = invoke<{ ok: boolean; ts: number }>('ping');
    return withTimeout(promise, 2000, op);
  },

  async getSampleBacktestResult(delayMs = 8000): Promise<BacktestSummary> {
    const op = 'Sample data loading';
    // NOTE: use delay_ms here to match the Rust fn signature
    const promise = invoke<BacktestSummary>('get_sample_backtest_result', { delay_ms: delayMs });
    return withTimeout(promise, Math.max(5000, delayMs + 1000), op);
  },

  async runBacktest(params: any, delayMs = 15000): Promise<BacktestSummary> {
    const op = 'Backtest execution';
    // NOTE: use delay_ms here
    const promise = invoke<BacktestSummary>('run_backtest', { params, delay_ms: delayMs });
    return withTimeout(promise, Math.max(8000, delayMs + 2000), op);
  }
};

// lightweight connection monitor
type Listener = (isUp: boolean) => void;
let listeners: Listener[] = [];
let status = false;
setInterval(async () => {
  try {
    const res = await invoke<string>('ping');
    const up = res === 'ok';
    if (up !== status) {
      status = up;
      listeners.forEach(fn => fn(status));
    }
  } catch {
    if (status !== false) {
      status = false;
      listeners.forEach(fn => fn(status));
    }
  }
}, 4000);

export const connectionMonitor = {
  getConnectionStatus: () => status,
  onConnectionChange(cb: Listener) {
    listeners.push(cb);
    return () => { listeners = listeners.filter(f => f !== cb); };
  }
};
