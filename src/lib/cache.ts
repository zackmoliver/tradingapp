// src/lib/cache.ts
import { isTauri } from '@/lib/tauri';

const mem = new Map<string, any>();
const HAS_STORAGE = typeof window !== "undefined" && !!window.localStorage;

function key(k: string) { return `qa-cache:${k}`; }

export async function getCachedResult<T>(k: string): Promise<T | null> {
  try {
    if (mem.has(k)) return mem.get(k);
    if (HAS_STORAGE) {
      const raw = localStorage.getItem(key(k));
      if (raw) {
        const v = JSON.parse(raw);
        mem.set(k, v);
        return v as T;
      }
    }
    return null;
  } catch (error) {
    // Graceful cache miss on any error
    return null;
  }
}

export async function setCachedResult<T>(k: string, v: T): Promise<void> {
  try {
    mem.set(k, v);
    if (HAS_STORAGE) {
      localStorage.setItem(key(k), JSON.stringify(v));
    }
  } catch (error) {
    // Graceful failure - at least we have in-memory cache
    // Don't spam console with storage errors
  }
}

export async function getCacheStats() {
  try {
    const persistentCount = HAS_STORAGE ?
      Object.keys(localStorage).filter(k => k.startsWith("qa-cache:")).length : 0;

    return {
      inMemory: mem.size,
      persistent: persistentCount,
      totalFiles: mem.size,
      totalSize: 0,
      oldestEntry: null,
      newestEntry: null,
      expiredFiles: 0
    };
  } catch (error) {
    // Return safe defaults on any error
    return {
      inMemory: mem.size,
      persistent: 0,
      totalFiles: mem.size,
      totalSize: 0,
      oldestEntry: null,
      newestEntry: null,
      expiredFiles: 0
    };
  }
}

export async function clearCache() {
  try {
    mem.clear();
    if (HAS_STORAGE) {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("qa-cache:"));
      keys.forEach(k => localStorage.removeItem(k));
    }
  } catch (error) {
    // At least clear in-memory cache
    mem.clear();
  }
}

export function createCacheKey(params: any): string {
  // Create a deterministic key from backtest parameters
  const normalized = {
    ticker: params.ticker?.toUpperCase() || '',
    start_date: params.start_date || '',
    end_date: params.end_date || '',
    strategy: params.strategy || '',
    initial_capital: params.initial_capital || 0,
    seed: params.seed || 1,
  };

  return JSON.stringify(normalized);
}
