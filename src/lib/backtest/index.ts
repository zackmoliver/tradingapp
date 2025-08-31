// src/lib/backtest/index.ts
// Main backtest interface

import { runScenario, BacktestParams, BacktestResult } from './engine';
import { getDailyBars } from '@/lib/data/equities';

/**
 * Main backtest function - entry point for all backtesting
 */
export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  try {
    // Fetch price data
    const priceData = await getDailyBars(params.symbol, params.startDate, params.endDate);
    
    if (priceData.length === 0) {
      throw new Error(`No price data available for ${params.symbol} from ${params.startDate} to ${params.endDate}`);
    }
    
    // Run the backtest scenario
    const result = runScenario(params, priceData);
    
    return result;
    
  } catch (error) {
    console.error('[Backtest] Error running backtest:', error);
    
    // Return a safe default result
    return {
      totalReturn: 0,
      cagr: 0,
      volatility: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      profitFactor: 1,
      winRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      avgWin: 0,
      avgLoss: 0,
      equityCurve: [],
      trades: [],
      var95: 0,
      expectedShortfall: 0,
      calmarRatio: 0,
      statisticalPower: 0,
      warnings: [`Backtest failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

// Re-export types and functions from engine
export type { BacktestParams, BacktestResult, Trade, TradeLeg, EquityPoint } from './engine';
export { runScenario } from './engine';
