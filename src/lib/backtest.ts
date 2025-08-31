// src/lib/backtest.ts
import { fetchBarsAuto, type Bar, type BacktestPoint, type BacktestSummary } from "./tauri";

/* Keep a simple PriceData alias so older code compiles */
export type PriceData = { date: string; c: number; o?: number; h?: number; l?: number; v?: number };

/* Convenience: fetch real bars → PriceData[] */
export async function fetchPriceData(symbol: string, start: string, end: string): Promise<PriceData[]> {
  const bars = await fetchBarsAuto(symbol, start, end);
  return bars.map(b => ({ date: b.date, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
}

/* A tiny Engine wrapper so existing imports keep working */
export class BacktestEngine {
  static async loadPriceHistory(symbol: string, start: string, end: string): Promise<PriceData[]> {
    return fetchPriceData(symbol, start, end);
  }
}

/* Optional local buy&hold (kept for tests) */
export function backtestFromBars(
  symbol: string,
  start: string,
  end: string,
  initialCapital: number,
  bars: Bar[]
): BacktestSummary {
  if (!bars.length) throw new Error("No bars");

  const sorted = [...bars].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const firstClose = Math.max(1e-9, sorted[0].c);
  const eqs: number[] = [];
  const curve: BacktestPoint[] = [];

  for (const b of sorted) {
    const equity = initialCapital * (b.c / firstClose);
    eqs.push(equity);
    curve.push({ t: b.date, equity, drawdown: 0 });
  }

  let maxRun = eqs[0];
  let minDD = 0;
  for (let i = 0; i < eqs.length; i++) {
    maxRun = Math.max(maxRun, eqs[i]);
    const dd = maxRun > 0 ? (eqs[i] - maxRun) / maxRun : 0;
    curve[i].drawdown = dd;
    minDD = Math.min(minDD, dd);
  }

  let wins = 0;
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i].c / sorted[i - 1].c - 1;
    if (r > 0) wins++;
  }
  const trades = sorted.length - 1;
  const win_rate = trades > 0 ? wins / trades : 0;

  const years = sorted.length / 365.25;
  const cagr =
    years > 0
      ? Math.pow(curve[curve.length - 1].equity / curve[0].equity, 1 / years) - 1
      : 0;

  return {
    strategy: "BuyHold",
    symbol,
    start,
    end,
    capital: initialCapital,
    cagr,
    trades,
    win_rate,
    max_dd: minDD,
    equity_curve: curve,
  };
}
