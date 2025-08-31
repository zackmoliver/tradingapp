// src/lib/backtest/engine.ts
// Strategy-neutral PnL simulator with advanced metrics

import { PriceData } from '@/lib/data/equities';
import { priceOption, calculateGreeks, estimateIVFromHistory, calculateTimeToExpiry, getRiskFreeRate } from '@/lib/options/pricing';

export interface BacktestParams {
  symbol: string;
  startDate: string;
  endDate: string;
  strategy: string;
  initialCapital: number;
  commissionPerContract?: number;
  slippagePercent?: number;
  [key: string]: any; // Strategy-specific parameters
}

export interface Trade {
  entryDate: string;
  exitDate?: string;
  strategy: string;
  legs: TradeLeg[];
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  maxDrawdown: number;
  daysHeld: number;
  status: 'OPEN' | 'CLOSED' | 'EXPIRED';
}

export interface TradeLeg {
  type: 'CALL' | 'PUT' | 'STOCK';
  action: 'BUY' | 'SELL';
  quantity: number;
  strike?: number;
  expiry?: string;
  entryPrice: number;
  exitPrice?: number;
  delta?: number;
  theta?: number;
  vega?: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
  trades: number;
}

export interface BacktestResult {
  // Basic metrics
  totalReturn: number;
  cagr: number;
  volatility: number;
  maxDrawdown: number;
  
  // Advanced metrics
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  winRate: number;
  
  // Trade statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  
  // Time series
  equityCurve: EquityPoint[];
  trades: Trade[];
  
  // Risk metrics
  var95: number;        // Value at Risk (95%)
  expectedShortfall: number; // Conditional VaR
  calmarRatio: number;  // CAGR / Max Drawdown
  
  // Statistical significance
  statisticalPower: number; // 0-1, confidence in results
  warnings: string[];
}

/**
 * Run backtest scenario with advanced metrics calculation
 */
export function runScenario(params: BacktestParams, priceData: PriceData[]): BacktestResult {
  if (priceData.length === 0) {
    throw new Error('No price data provided for backtest');
  }
  
  const {
    initialCapital,
    commissionPerContract = 1.0,
    slippagePercent = 0.01
  } = params;
  
  // Initialize tracking variables
  let currentCapital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdown = 0;
  const equityCurve: EquityPoint[] = [];
  const trades: Trade[] = [];
  const dailyReturns: number[] = [];
  
  // Generate synthetic trades based on strategy
  const generatedTrades = generateStrategyTrades(params, priceData);
  
  // Process each trade and calculate PnL timeline
  for (let i = 0; i < priceData.length; i++) {
    const currentBar = priceData[i];
    const currentDate = currentBar.ts.toISOString().split('T')[0];
    
    // Check for trade entries/exits on this date
    const dayTrades = generatedTrades.filter(trade => 
      trade.entryDate === currentDate || trade.exitDate === currentDate
    );
    
    // Calculate current portfolio value
    let portfolioValue = currentCapital;
    
    // Add value of open positions
    const openTrades = trades.filter(t => t.status === 'OPEN');
    for (const trade of openTrades) {
      const currentValue = calculateTradeValue(trade, currentBar, priceData.slice(0, i + 1));
      portfolioValue += currentValue - trade.entryPrice;
    }
    
    // Process new trades
    for (const trade of dayTrades) {
      if (trade.entryDate === currentDate) {
        // Enter trade
        const tradeCost = trade.entryPrice + (commissionPerContract * trade.legs.length);
        const slippageCost = trade.entryPrice * slippagePercent;
        const totalCost = tradeCost + slippageCost;
        
        if (currentCapital >= totalCost) {
          currentCapital -= totalCost;
          trade.status = 'OPEN';
          trades.push(trade);
        }
      } else if (trade.exitDate === currentDate) {
        // Exit trade
        const openTrade = trades.find(t => t.entryDate === trade.entryDate && t.status === 'OPEN');
        if (openTrade) {
          const exitValue = trade.exitPrice! - (commissionPerContract * trade.legs.length);
          const slippageCost = trade.exitPrice! * slippagePercent;
          const netExitValue = exitValue - slippageCost;
          
          openTrade.exitPrice = netExitValue;
          openTrade.pnl = netExitValue - openTrade.entryPrice;
          openTrade.status = 'CLOSED';
          openTrade.exitDate = currentDate;
          
          currentCapital += netExitValue;
        }
      }
    }
    
    // Update equity curve
    const totalEquity = portfolioValue;
    peakCapital = Math.max(peakCapital, totalEquity);
    const currentDrawdown = (peakCapital - totalEquity) / peakCapital;
    maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
    
    equityCurve.push({
      date: currentDate,
      equity: totalEquity,
      drawdown: currentDrawdown,
      trades: trades.filter(t => t.status === 'CLOSED').length
    });
    
    // Calculate daily return
    if (i > 0) {
      const prevEquity = equityCurve[i - 1].equity;
      const dailyReturn = (totalEquity - prevEquity) / prevEquity;
      dailyReturns.push(dailyReturn);
    }
  }
  
  // Calculate advanced metrics
  const finalEquity = equityCurve[equityCurve.length - 1]?.equity || initialCapital;
  const totalReturn = (finalEquity - initialCapital) / initialCapital;
  const tradingDays = equityCurve.length;
  const yearsTraded = tradingDays / 252;
  
  const cagr = yearsTraded > 0 ? Math.pow(1 + totalReturn, 1 / yearsTraded) - 1 : 0;
  const volatility = calculateVolatility(dailyReturns);
  
  // Risk-adjusted metrics
  const riskFreeRate = getRiskFreeRate();
  const excessReturns = dailyReturns.map(r => r - riskFreeRate / 252);
  const sharpeRatio = volatility > 0 ? (cagr - riskFreeRate) / volatility : 0;
  
  const downside = dailyReturns.filter(r => r < 0);
  const downsideVolatility = calculateVolatility(downside);
  const sortinoRatio = downsideVolatility > 0 ? (cagr - riskFreeRate) / downsideVolatility : 0;
  
  // Trade statistics
  const closedTrades = trades.filter(t => t.status === 'CLOSED');
  const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
  const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0);
  
  const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
  
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 1;
  const winRate = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0;
  
  const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
  
  // Risk metrics
  const var95 = calculateVaR(dailyReturns, 0.95);
  const expectedShortfall = calculateExpectedShortfall(dailyReturns, 0.95);
  const calmarRatio = maxDrawdown > 0 ? cagr / maxDrawdown : cagr > 0 ? 999 : 0;
  
  // Statistical significance
  const statisticalPower = calculateStatisticalPower(closedTrades.length, yearsTraded);
  const warnings = generateWarnings(closedTrades.length, yearsTraded, volatility);
  
  return {
    totalReturn,
    cagr,
    volatility,
    maxDrawdown,
    sharpeRatio,
    sortinoRatio,
    profitFactor,
    winRate,
    totalTrades: closedTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    avgWin,
    avgLoss,
    equityCurve,
    trades: closedTrades,
    var95,
    expectedShortfall,
    calmarRatio,
    statisticalPower,
    warnings
  };
}

/**
 * Generate synthetic trades based on strategy type
 */
function generateStrategyTrades(params: BacktestParams, priceData: PriceData[]): Trade[] {
  const trades: Trade[] = [];
  const { strategy } = params;
  
  // Simple strategy simulation - in practice this would be much more sophisticated
  const tradingFrequency = strategy === 'iron_condor' ? 30 : 45; // Days between trades
  
  for (let i = tradingFrequency; i < priceData.length; i += tradingFrequency) {
    const entryBar = priceData[i];
    const exitIndex = Math.min(i + 30, priceData.length - 1); // 30-day holding period
    const exitBar = priceData[exitIndex];
    
    const entryDate = entryBar.ts.toISOString().split('T')[0];
    const exitDate = exitBar.ts.toISOString().split('T')[0];
    
    // Simulate trade outcome based on price movement
    const priceChange = (exitBar.ohlc.c - entryBar.ohlc.c) / entryBar.ohlc.c;
    const baseReturn = strategy.includes('put') ? -priceChange * 0.5 : priceChange * 0.3;
    const randomFactor = (Math.random() - 0.5) * 0.1; // Add some randomness
    
    const entryPrice = 100; // Simplified entry cost
    const exitPrice = entryPrice * (1 + baseReturn + randomFactor);
    
    trades.push({
      entryDate,
      exitDate,
      strategy,
      legs: [], // Simplified - would contain actual option legs
      entryPrice,
      exitPrice,
      pnl: exitPrice - entryPrice,
      maxDrawdown: Math.max(0, entryPrice - exitPrice) / entryPrice,
      daysHeld: 30,
      status: 'CLOSED'
    });
  }
  
  return trades;
}

/**
 * Calculate current value of an open trade
 */
function calculateTradeValue(trade: Trade, currentBar: PriceData, historicalData: PriceData[]): number {
  // Simplified - would use actual options pricing
  const daysHeld = Math.floor((currentBar.ts.getTime() - new Date(trade.entryDate).getTime()) / (1000 * 60 * 60 * 24));
  const timeDecay = Math.exp(-daysHeld / 30) * 0.1; // Simplified theta decay
  
  return trade.entryPrice * (1 - timeDecay);
}

// Utility functions for metrics calculation
function calculateVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  
  return Math.sqrt(variance * 252); // Annualized
}

function calculateVaR(returns: number[], confidence: number): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sorted.length);
  
  return sorted[index] || 0;
}

function calculateExpectedShortfall(returns: number[], confidence: number): number {
  if (returns.length === 0) return 0;
  
  const var95 = calculateVaR(returns, confidence);
  const tailReturns = returns.filter(r => r <= var95);
  
  return tailReturns.length > 0 ? tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length : 0;
}

function calculateStatisticalPower(numTrades: number, yearsTraded: number): number {
  // Simple heuristic for statistical significance
  const minTrades = 30;
  const minYears = 1;
  
  const tradePower = Math.min(1, numTrades / minTrades);
  const timePower = Math.min(1, yearsTraded / minYears);
  
  return (tradePower + timePower) / 2;
}

function generateWarnings(numTrades: number, yearsTraded: number, volatility: number): string[] {
  const warnings: string[] = [];
  
  if (numTrades < 30) {
    warnings.push(`Low sample size: Only ${numTrades} trades. Results may not be statistically significant.`);
  }
  
  if (yearsTraded < 1) {
    warnings.push(`Short time period: Only ${yearsTraded.toFixed(1)} years of data. Consider longer backtests.`);
  }
  
  if (volatility > 0.5) {
    warnings.push(`High volatility: ${(volatility * 100).toFixed(1)}% annual volatility indicates high risk.`);
  }
  
  return warnings;
}
