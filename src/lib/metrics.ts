// src/lib/metrics.ts
// Pure functions for financial metrics calculation

import { BacktestPoint, Trade } from '@/types/backtest';

export interface MetricsResult {
  sharpe: number;
  sortino: number;
  profitFactor: number;
  volatility: number;
  downsideVolatility: number;
  averageReturn: number;
}

/**
 * Calculate daily returns from equity curve
 */
export function calculateDailyReturns(equityCurve: BacktestPoint[]): number[] {
  if (equityCurve.length < 2) return [];
  
  const returns: number[] = [];
  
  for (let i = 1; i < equityCurve.length; i++) {
    const prevEquity = equityCurve[i - 1].equity;
    const currentEquity = equityCurve[i].equity;
    
    if (prevEquity > 0) {
      const dailyReturn = (currentEquity - prevEquity) / prevEquity;
      returns.push(dailyReturn);
    }
  }
  
  return returns;
}

/**
 * Calculate Sharpe ratio from daily returns
 * Sharpe = (Average Return - Risk Free Rate) / Standard Deviation
 * Assumes risk-free rate = 0 for simplicity
 */
export function calculateSharpe(dailyReturns: number[]): number {
  if (dailyReturns.length === 0) return 0;
  
  const avgReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  // Annualize: multiply by sqrt(252) for daily data
  const annualizedSharpe = (avgReturn * 252) / (stdDev * Math.sqrt(252));
  
  return isFinite(annualizedSharpe) ? annualizedSharpe : 0;
}

/**
 * Calculate Sortino ratio from daily returns
 * Sortino = (Average Return - Risk Free Rate) / Downside Deviation
 * Only considers negative returns for volatility calculation
 */
export function calculateSortino(dailyReturns: number[]): number {
  if (dailyReturns.length === 0) return 0;
  
  const avgReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
  const negativeReturns = dailyReturns.filter(ret => ret < 0);
  
  if (negativeReturns.length === 0) {
    // No negative returns - return a high but finite value
    return avgReturn > 0 ? 999 : 0;
  }
  
  const downsideVariance = negativeReturns.reduce((sum, ret) => sum + Math.pow(ret, 2), 0) / negativeReturns.length;
  const downsideStdDev = Math.sqrt(downsideVariance);
  
  if (downsideStdDev === 0) return 0;
  
  // Annualize: multiply by sqrt(252) for daily data
  const annualizedSortino = (avgReturn * 252) / (downsideStdDev * Math.sqrt(252));
  
  return isFinite(annualizedSortino) ? annualizedSortino : 0;
}

/**
 * Calculate Profit Factor from trades
 * Profit Factor = Gross Profit / Gross Loss
 * If no trades provided, simulate from return signs
 */
export function calculateProfitFactor(trades?: Trade[], dailyReturns?: number[]): number {
  // If we have actual trades, use them
  if (trades && trades.length > 0) {
    const exitTrades = trades.filter(trade => trade.side === 'SELL' || trade.side === 'COVER');
    
    if (exitTrades.length === 0) return 1;
    
    const grossProfit = exitTrades
      .filter(trade => trade.pnl > 0)
      .reduce((sum, trade) => sum + trade.pnl, 0);
    
    const grossLoss = Math.abs(exitTrades
      .filter(trade => trade.pnl < 0)
      .reduce((sum, trade) => sum + trade.pnl, 0));
    
    if (grossLoss === 0) {
      return grossProfit > 0 ? 999 : 1;
    }
    
    const profitFactor = grossProfit / grossLoss;
    return isFinite(profitFactor) ? profitFactor : 1;
  }
  
  // Fallback: simulate from daily returns
  if (dailyReturns && dailyReturns.length > 0) {
    const positiveReturns = dailyReturns.filter(ret => ret > 0);
    const negativeReturns = dailyReturns.filter(ret => ret < 0);
    
    const grossProfit = positiveReturns.reduce((sum, ret) => sum + ret, 0);
    const grossLoss = Math.abs(negativeReturns.reduce((sum, ret) => sum + ret, 0));
    
    if (grossLoss === 0) {
      return grossProfit > 0 ? 999 : 1;
    }
    
    const profitFactor = grossProfit / grossLoss;
    return isFinite(profitFactor) ? profitFactor : 1;
  }
  
  return 1; // Default neutral value
}

/**
 * Calculate all metrics from equity curve and optional trades
 */
export function calculateAllMetrics(
  equityCurve: BacktestPoint[], 
  trades?: Trade[]
): MetricsResult {
  const dailyReturns = calculateDailyReturns(equityCurve);
  
  if (dailyReturns.length === 0) {
    return {
      sharpe: 0,
      sortino: 0,
      profitFactor: 1,
      volatility: 0,
      downsideVolatility: 0,
      averageReturn: 0
    };
  }
  
  const avgReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / dailyReturns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized
  
  const negativeReturns = dailyReturns.filter(ret => ret < 0);
  const downsideVariance = negativeReturns.length > 0 
    ? negativeReturns.reduce((sum, ret) => sum + Math.pow(ret, 2), 0) / negativeReturns.length
    : 0;
  const downsideVolatility = Math.sqrt(downsideVariance) * Math.sqrt(252); // Annualized
  
  return {
    sharpe: calculateSharpe(dailyReturns),
    sortino: calculateSortino(dailyReturns),
    profitFactor: calculateProfitFactor(trades, dailyReturns),
    volatility,
    downsideVolatility,
    averageReturn: avgReturn * 252 // Annualized
  };
}

/**
 * Format metric value for display
 */
export function formatMetric(value: number, decimals: number = 2): string {
  if (!isFinite(value) || isNaN(value)) {
    return '—';
  }
  
  // Cap extremely high values for display
  if (value > 999) {
    return '999+';
  }
  
  if (value < -999) {
    return '-999';
  }
  
  return value.toFixed(decimals);
}

/**
 * Get color class for metric value
 */
export function getMetricColor(value: number, higherIsBetter: boolean = true): string {
  if (!isFinite(value) || isNaN(value)) {
    return 'text-slate-500 dark:text-slate-400';
  }
  
  const threshold = higherIsBetter ? 0 : 0;
  const isGood = higherIsBetter ? value > threshold : value < threshold;
  
  if (isGood) {
    return 'text-green-600 dark:text-green-400';
  } else {
    return 'text-red-600 dark:text-red-400';
  }
}

/**
 * Get metric descriptions for tooltips
 */
export const METRIC_DESCRIPTIONS = {
  sharpe: 'Sharpe Ratio measures risk-adjusted returns. Higher values indicate better risk-adjusted performance. Values above 1.0 are considered good, above 2.0 are excellent.',
  sortino: 'Sortino Ratio is similar to Sharpe but only considers downside volatility. It focuses on harmful volatility rather than total volatility. Higher values are better.',
  profitFactor: 'Profit Factor is the ratio of gross profits to gross losses. Values above 1.0 indicate profitability, above 1.5 are good, above 2.0 are excellent.',
  volatility: 'Volatility measures the standard deviation of returns, annualized. Lower values indicate more stable returns.',
  downsideVolatility: 'Downside Volatility measures only the volatility of negative returns. Lower values indicate less harmful volatility.',
  averageReturn: 'Average Return is the mean daily return, annualized. Higher values indicate better performance.'
} as const;
