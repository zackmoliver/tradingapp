/**
 * Deterministic Equity Curve Generation
 * 
 * Pure TypeScript implementation of deterministic equity curve generation
 * that mirrors the Rust backend logic. This allows for testing reproducibility
 * without requiring Tauri integration.
 * 
 * Features:
 * - Seed-based deterministic randomness using Linear Congruential Generator
 * - Identical algorithm to Rust backend for consistency
 * - Pure functions for easy testing
 * - Reproducible results for same (params, seed) combination
 */

import { BacktestParams, BacktestPoint } from '../types/backtest';

/**
 * Simple Linear Congruential Generator for deterministic randomness
 * Uses same parameters as Rust implementation for consistency
 */
class SimpleRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0; // Ensure unsigned 32-bit integer
  }

  /**
   * Generate next random float between 0 and 1
   */
  nextFloat(): number {
    // LCG parameters (from Numerical Recipes) - same as Rust
    this.state = Math.imul(this.state, 1664525) + 1013904223;
    this.state = this.state >>> 0; // Keep as unsigned 32-bit
    return this.state / 0x100000000; // Convert to 0-1 range
  }

  /**
   * Generate random float in specified range
   */
  nextRange(min: number, max: number): number {
    return min + (max - min) * this.nextFloat();
  }
}

/**
 * Generate deterministic equity curve based on parameters and seed
 */
export function generateDeterministicEquityCurve(
  params: BacktestParams
): BacktestPoint[] {
  const seed = params.seed || 42;
  const rng = new SimpleRng(seed);
  const equityCurve: BacktestPoint[] = [];
  
  // Calculate number of days between start and end dates
  const days = calculateDaysBetween(params.start_date, params.end_date);
  
  // Strategy-specific parameters (same as Rust implementation)
  const baseDrift = 0.0008; // Daily drift
  const volatility = 0.015;  // Daily volatility
  
  let equity = params.initial_capital;
  let maxEquity = equity;
  
  // Generate deterministic daily returns
  for (let i = 0; i < days; i++) {
    // Deterministic drift component (same formula as Rust)
    const driftComponent = baseDrift * (1.0 + 0.1 * Math.sin(seed * i));
    
    // Deterministic volatility component using seed-based randomness
    const volComponent = volatility * rng.nextRange(-1.0, 1.0);
    
    // Combine for daily return
    const dailyReturn = driftComponent + volComponent;
    
    // Update equity
    equity *= 1.0 + dailyReturn;
    
    // Track maximum for drawdown calculation
    if (equity > maxEquity) {
      maxEquity = equity;
    }
    
    // Calculate drawdown
    const drawdown = (equity - maxEquity) / maxEquity;
    
    // Format date
    const date = formatDateFromOffset(params.start_date, i);
    
    equityCurve.push({
      t: date,
      equity: equity,
      drawdown: drawdown
    });
  }
  
  return equityCurve;
}

/**
 * Calculate days between two MM/DD/YYYY dates (simplified)
 */
function calculateDaysBetween(startDate: string, endDate: string): number {
  // Simplified calculation - in real implementation would parse actual dates
  // For consistency with Rust backend, use same logic
  if (startDate.includes('2023') && endDate.includes('2023')) {
    return 365;
  }
  return 252; // Trading days in a year
}

/**
 * Format date from start date and day offset (simplified)
 */
function formatDateFromOffset(startDate: string, offset: number): string {
  // Simplified date formatting - matches Rust implementation
  if (startDate.startsWith('01/01/2023')) {
    const month = 1 + Math.floor(offset / 30);
    const day = 1 + (offset % 30);
    return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/2023`;
  }
  return `Day ${offset + 1}`;
}

/**
 * Calculate performance metrics from equity curve
 */
export function calculatePerformanceMetrics(
  equityCurve: BacktestPoint[],
  startDate: string,
  endDate: string
): { cagr: number; maxDrawdown: number } {
  if (equityCurve.length === 0) {
    return { cagr: 0, maxDrawdown: 0 };
  }
  
  const initialEquity = equityCurve[0].equity;
  const finalEquity = equityCurve[equityCurve.length - 1].equity;
  
  // Calculate CAGR
  const days = calculateDaysBetween(startDate, endDate);
  const years = days / 365.25;
  const cagr = years > 0 && initialEquity > 0 
    ? Math.pow(finalEquity / initialEquity, 1 / years) - 1 
    : 0;
  
  // Calculate maximum drawdown
  let maxEquity = initialEquity;
  let maxDrawdown = 0;
  
  for (const point of equityCurve) {
    if (point.equity > maxEquity) {
      maxEquity = point.equity;
    }
    const drawdown = (point.equity - maxEquity) / maxEquity;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  return { cagr, maxDrawdown };
}

/**
 * Generate deterministic trading statistics based on seed
 */
export function generateDeterministicStats(seed: number): { trades: number; winRate: number } {
  const rng = new SimpleRng(seed);
  
  // Generate trades between 15-35 based on seed
  const trades = 15 + Math.floor(rng.nextFloat() * 20);
  
  // Generate win rate between 0.45-0.75 based on seed
  const winRate = 0.45 + (rng.nextFloat() * 0.30);
  
  return { trades, winRate };
}

/**
 * Generate complete backtest summary using deterministic algorithms
 */
export function generateDeterministicBacktest(params: BacktestParams) {
  const seed = params.seed || 42;
  
  // Generate equity curve
  const equityCurve = generateDeterministicEquityCurve(params);
  
  // Calculate performance metrics
  const { cagr, maxDrawdown } = calculatePerformanceMetrics(
    equityCurve, 
    params.start_date, 
    params.end_date
  );
  
  // Generate trading stats
  const { trades, winRate } = generateDeterministicStats(seed);
  
  return {
    strategy: params.strategy,
    symbol: params.ticker,
    start: params.start_date,
    end: params.end_date,
    capital: params.initial_capital,
    cagr,
    trades,
    win_rate: winRate,
    max_dd: maxDrawdown,
    equity_curve: equityCurve
  };
}

/**
 * Convert backtest result to CSV format for comparison
 */
export function backtestToCsv(backtest: any): string {
  const lines: string[] = [];
  
  // Add metadata
  lines.push('# Backtest Results');
  lines.push(`Strategy,${backtest.strategy}`);
  lines.push(`Symbol,${backtest.symbol}`);
  lines.push(`Start,${backtest.start}`);
  lines.push(`End,${backtest.end}`);
  lines.push(`Initial Capital,${backtest.capital.toFixed(2)}`);
  lines.push(`CAGR,${(backtest.cagr * 100).toFixed(2)}%`);
  lines.push(`Trades,${backtest.trades}`);
  lines.push(`Win Rate,${(backtest.win_rate * 100).toFixed(2)}%`);
  lines.push(`Max Drawdown,${(Math.abs(backtest.max_dd) * 100).toFixed(2)}%`);
  lines.push('');
  
  // Add equity curve data
  lines.push('Date,Equity,Drawdown');
  for (const point of backtest.equity_curve) {
    lines.push(`${point.t},${point.equity.toFixed(2)},${(point.drawdown * 100).toFixed(2)}%`);
  }
  
  return lines.join('\n');
}

/**
 * Test helper to verify reproducibility
 */
export function testReproducibility(params: BacktestParams, iterations: number = 3): boolean {
  const results: string[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const backtest = generateDeterministicBacktest(params);
    const csv = backtestToCsv(backtest);
    results.push(csv);
  }
  
  // Check if all results are identical
  const firstResult = results[0];
  return results.every(result => result === firstResult);
}
