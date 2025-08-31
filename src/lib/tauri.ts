// src/lib/tauri.ts
import { invoke } from "@tauri-apps/api/core";
export { invoke };

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_IPC__" in window;

/* ---------- Shared types ---------- */
export type Bar = { date: string; o: number; h: number; l: number; c: number; v: number };

export type BacktestPoint = { t: string; equity: number; drawdown: number };
export type BacktestSummary = {
  strategy: "PMCC" | "Wheel" | "CoveredCall" | "iron_condor" | "bull_put_spread" | string;
  symbol: string;
  start: string; end: string;
  capital: number;
  cagr: number; trades: number; win_rate: number; max_dd: number;
  equity_curve: BacktestPoint[];
};

/* ---------- Provider commands ---------- */
export async function saveApiKey(key: string) {
  return invoke<void>("save_api_key", { key });
}
export async function fetchHistory(symbol: string, start: string, end: string, interval = "1day") {
  return invoke<Bar[]>("fetch_history", { symbol, start, end, interval });
}
export async function fetchHistoryYahoo(symbol: string, start: string, end: string) {
  return invoke<Bar[]>("fetch_history_yahoo", { symbol, start, end });
}
export async function fetchNews(symbol: string, days = 3) {
  return invoke<[number, any[]]>("fetch_news", { symbol, days });
}

/* Auto: try Polygon, then Yahoo */
export async function fetchBarsAuto(symbol: string, start: string, end: string): Promise<Bar[]> {
  try {
    const bars = await fetchHistory(symbol, start, end, "1day");
    if (bars?.length) return bars;
    throw new Error("Empty bars");
  } catch {
    return fetchHistoryYahoo(symbol, start, end);
  }
}

/* ---------- Backtest command (Rust side) ---------- */
export async function runBacktest(params: {
  ticker: string; start_date: string; end_date: string;
  strategy: "PMCC" | "Wheel" | "CoveredCall" | "iron_condor" | "bull_put_spread" | string;
  initial_capital: number; seed?: number;
}) {
  return invoke<BacktestSummary>("run_backtest", { params });
}

/* ---------- Compatibility shim for existing imports ---------- */
type PingResult = { ok: boolean; ts: number };

export const TauriAPI = {
  invoke,
  runBacktest,
  ping: () => invoke<PingResult>("ping"),
  getSampleBacktestResult: <T = any>(delay_ms?: number) =>
    invoke<T>('get_sample_backtest_result', { delay_ms }),
  fetchPolygonBars: <T = any>(args: any) => invoke<T>('fetch_polygon_bars', args),
  fetchNewsSentiment: <T = any>(args: any) => invoke<T>('fetch_news_sentiment', args),
  suggestAndAnalyze: <T = any>(args: any) => invoke<T>('suggest_and_analyze', args),
};

export const TauriUtils = {
  isTauri,
  debounce<T extends (...args: any[]) => any>(fn: T, ms = 300) {
    let t: any;
    return (...args: Parameters<T>) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  },
  generateSeed() {
    // simple deterministic-ish seed
    return Math.floor(Math.random() * 2 ** 31);
  },
};
