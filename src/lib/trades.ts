// src/lib/trades.ts
// Synthetic trade generation from equity curve

import { BacktestPoint, Trade } from '@/types/backtest';
import { parseMMDDYYYY, toMMDDYYYY } from '@/lib/date';

export interface TradeGenerationOptions {
  minTradeInterval: number; // Minimum days between trades
  volatilityThreshold: number; // Minimum price change to trigger trade
  maxPositionSize: number; // Maximum shares per trade
  initialCapital: number; // Starting capital
  strategy: 'momentum' | 'mean_reversion' | 'weekly' | 'threshold';
}

export interface SyntheticTrade extends Trade {
  id: string;
  entry_price?: number;
  exit_price?: number;
  hold_days?: number;
  reason?: string;
}

/**
 * Derive synthetic trades from equity curve
 * Generates realistic trading activity based on equity movements
 */
export function deriveTrades(
  equityCurve: BacktestPoint[],
  options: Partial<TradeGenerationOptions> = {}
): SyntheticTrade[] {
  const opts: TradeGenerationOptions = {
    minTradeInterval: 7, // Weekly trades
    volatilityThreshold: 0.02, // 2% price change
    maxPositionSize: 100,
    initialCapital: 100000,
    strategy: 'threshold',
    ...options
  };

  if (equityCurve.length < 2) return [];

  const trades: SyntheticTrade[] = [];
  let position: { qty: number; entry_price: number; entry_date: string; entry_index: number } | null = null;
  let cumPnL = 0;
  let lastTradeIndex = 0;
  let tradeId = 1;

  // Calculate price series from equity curve
  const prices = equityCurve.map(point => point.equity);
  const basePrice = prices[0];

  for (let i = 1; i < equityCurve.length; i++) {
    const currentDate = equityCurve[i].t;
    const currentPrice = prices[i];
    const prevPrice = prices[i - 1];
    const priceChange = (currentPrice - prevPrice) / prevPrice;
    const daysSinceLastTrade = i - lastTradeIndex;

    // Derive synthetic stock price from equity movements
    const syntheticPrice = basePrice * (currentPrice / equityCurve[0].equity);

    // Entry conditions
    if (!position && shouldEnterTrade(i, equityCurve, opts, daysSinceLastTrade, priceChange)) {
      const qty = calculatePositionSize(currentPrice, opts);
      const entryPrice = syntheticPrice;

      position = {
        qty,
        entry_price: entryPrice,
        entry_date: currentDate,
        entry_index: i
      };

      trades.push({
        id: `T${tradeId++}`,
        date: currentDate,
        side: 'BUY',
        qty,
        price: entryPrice,
        pnl: 0,
        cum_pnl: cumPnL,
        reason: getEntryReason(priceChange, opts.strategy),
        entry_price: entryPrice
      });

      lastTradeIndex = i;
    }

    // Exit conditions
    if (position && shouldExitTrade(i, position, equityCurve, opts, priceChange)) {
      const exitPrice = syntheticPrice;
      const pnl = (exitPrice - position.entry_price) * position.qty;
      const holdDays = i - position.entry_index;
      
      cumPnL += pnl;

      trades.push({
        id: `T${tradeId++}`,
        date: currentDate,
        side: 'SELL',
        qty: position.qty,
        price: exitPrice,
        pnl,
        cum_pnl: cumPnL,
        reason: getExitReason(priceChange, holdDays, opts.strategy),
        entry_price: position.entry_price,
        exit_price: exitPrice,
        hold_days: holdDays
      });

      position = null;
      lastTradeIndex = i;
    }
  }

  // Close any remaining position at the end
  if (position) {
    const lastPoint = equityCurve[equityCurve.length - 1];
    const exitPrice = basePrice * (lastPoint.equity / equityCurve[0].equity);
    const pnl = (exitPrice - position.entry_price) * position.qty;
    const holdDays = equityCurve.length - 1 - position.entry_index;
    
    cumPnL += pnl;

    trades.push({
      id: `T${tradeId++}`,
      date: lastPoint.t,
      side: 'SELL',
      qty: position.qty,
      price: exitPrice,
      pnl,
      cum_pnl: cumPnL,
      reason: 'End of period',
      entry_price: position.entry_price,
      exit_price: exitPrice,
      hold_days: holdDays
    });
  }

  return trades;
}

function shouldEnterTrade(
  index: number,
  equityCurve: BacktestPoint[],
  options: TradeGenerationOptions,
  daysSinceLastTrade: number,
  priceChange: number
): boolean {
  // Minimum interval check
  if (daysSinceLastTrade < options.minTradeInterval) return false;

  switch (options.strategy) {
    case 'weekly':
      return daysSinceLastTrade >= 7;
    
    case 'momentum':
      return priceChange > options.volatilityThreshold;
    
    case 'mean_reversion':
      return priceChange < -options.volatilityThreshold;
    
    case 'threshold':
    default:
      // Look for significant moves or regular intervals
      const significantMove = Math.abs(priceChange) > options.volatilityThreshold;
      const regularInterval = daysSinceLastTrade >= options.minTradeInterval * 2;
      return significantMove || regularInterval;
  }
}

function shouldExitTrade(
  index: number,
  position: { qty: number; entry_price: number; entry_date: string; entry_index: number },
  equityCurve: BacktestPoint[],
  options: TradeGenerationOptions,
  priceChange: number
): boolean {
  const holdDays = index - position.entry_index;
  const currentPrice = equityCurve[index].equity;
  const entryEquity = equityCurve[position.entry_index].equity;
  const unrealizedReturn = (currentPrice - entryEquity) / entryEquity;

  // Exit conditions based on strategy
  switch (options.strategy) {
    case 'weekly':
      return holdDays >= 7;
    
    case 'momentum':
      // Exit on reversal or after holding period
      return priceChange < -options.volatilityThreshold || holdDays >= 14;
    
    case 'mean_reversion':
      // Exit on mean reversion or stop loss
      return priceChange > options.volatilityThreshold || unrealizedReturn < -0.05;
    
    case 'threshold':
    default:
      // Exit on profit target, stop loss, or time limit
      return unrealizedReturn > 0.03 || unrealizedReturn < -0.02 || holdDays >= 21;
  }
}

function calculatePositionSize(currentPrice: number, options: TradeGenerationOptions): number {
  // Simple position sizing based on available capital
  const maxShares = Math.floor(options.initialCapital * 0.1 / currentPrice);
  return Math.min(maxShares, options.maxPositionSize);
}

function getEntryReason(priceChange: number, strategy: string): string {
  switch (strategy) {
    case 'momentum':
      return `Momentum entry (+${(priceChange * 100).toFixed(1)}%)`;
    case 'mean_reversion':
      return `Mean reversion entry (${(priceChange * 100).toFixed(1)}%)`;
    case 'weekly':
      return 'Weekly entry signal';
    default:
      return priceChange > 0 ? 'Breakout entry' : 'Dip buying entry';
  }
}

function getExitReason(priceChange: number, holdDays: number, strategy: string): string {
  switch (strategy) {
    case 'momentum':
      return holdDays >= 14 ? 'Time-based exit' : 'Momentum reversal';
    case 'mean_reversion':
      return priceChange > 0 ? 'Mean reversion complete' : 'Stop loss';
    case 'weekly':
      return 'Weekly exit signal';
    default:
      if (holdDays >= 21) return 'Max hold period';
      return priceChange > 0 ? 'Profit target' : 'Stop loss';
  }
}

/**
 * Generate enhanced trades with more realistic patterns
 * Ensures we get approximately 40 trades for typical backtest periods
 */
export function generateEnhancedTrades(equityCurve: BacktestPoint[]): SyntheticTrade[] {
  if (equityCurve.length < 10) return [];

  // Use multiple strategies to generate diverse trade patterns
  const strategies: Array<{ strategy: TradeGenerationOptions['strategy']; weight: number }> = [
    { strategy: 'threshold', weight: 0.4 },
    { strategy: 'weekly', weight: 0.3 },
    { strategy: 'momentum', weight: 0.2 },
    { strategy: 'mean_reversion', weight: 0.1 }
  ];

  const allTrades: SyntheticTrade[] = [];
  let tradeIdCounter = 1;

  for (const { strategy, weight } of strategies) {
    const strategyTrades = deriveTrades(equityCurve, {
      strategy,
      minTradeInterval: strategy === 'weekly' ? 7 : 5,
      volatilityThreshold: strategy === 'momentum' ? 0.015 : 0.025,
      maxPositionSize: 150,
      initialCapital: 100000
    });

    // Sample trades based on weight
    const sampleSize = Math.floor(strategyTrades.length * weight);
    const sampledTrades = strategyTrades
      .filter((_, index) => index % Math.ceil(strategyTrades.length / sampleSize) === 0)
      .map(trade => ({ ...trade, id: `T${tradeIdCounter++}` }));

    allTrades.push(...sampledTrades);
  }

  // Sort by date and ensure we have around 40 trades
  const sortedTrades = allTrades
    .sort((a, b) => parseMMDDYYYY(a.date).getTime() - parseMMDDYYYY(b.date).getTime())
    .slice(0, 45); // Cap at 45 to ensure we don't exceed

  // Recalculate cumulative P&L
  let cumPnL = 0;
  return sortedTrades.map(trade => {
    if (trade.side === 'SELL') {
      cumPnL += trade.pnl;
    }
    return { ...trade, cum_pnl: cumPnL };
  });
}

/**
 * Export trades to CSV format
 */
export function exportTradesToCsv(trades: SyntheticTrade[], filename: string = 'trades.csv'): void {
  const headers = ['Date', 'Action', 'Qty', 'Price', 'P&L', 'Cum P&L', 'Hold Days', 'Reason'];
  const csvContent = [
    headers.join(','),
    ...trades.map(trade => [
      trade.date,
      trade.side,
      trade.qty.toString(),
      trade.price.toFixed(2),
      trade.pnl.toFixed(2),
      trade.cum_pnl.toFixed(2),
      trade.hold_days?.toString() || '0',
      `"${trade.reason || ''}"`
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
