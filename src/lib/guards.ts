// src/lib/guards.ts
// Simple data validators and sanitizers

export const finite = (...nums: number[]) => nums.every(n => Number.isFinite(n));

export const coerceCurve = (curve: {t:string;equity:number;drawdown:number}[]) =>
  curve.filter(p => finite(p.equity, p.drawdown) && !!p.t);

export const validateBacktestSummary = (summary: any): boolean => {
  if (!summary || typeof summary !== 'object') return false;
  
  const required = ['strategy', 'symbol', 'start', 'end', 'capital', 'cagr', 'trades', 'win_rate', 'max_dd'];
  if (!required.every(field => field in summary)) return false;
  
  if (!finite(summary.capital, summary.cagr, summary.trades, summary.win_rate, summary.max_dd)) return false;
  
  if (!Array.isArray(summary.equity_curve)) return false;
  
  return true;
};

export const sanitizeNumber = (value: any, fallback: number = 0): number => {
  const num = Number(value);
  return finite(num) ? num : fallback;
};

export const sanitizeString = (value: any, fallback: string = ''): string => {
  return typeof value === 'string' ? value : fallback;
};

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};
