// src/lib/indicators.ts
// Pure TypeScript technical indicators

// Import unified PriceData type
import type { PriceData } from '@/lib/data/equities';
export type { PriceData };

export interface OHLCV {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// Simple Moving Average
export function sma(prices: number[], period: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  
  return result;
}

// Exponential Moving Average
export function ema(prices: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      result.push(prices[0]);
    } else {
      const emaValue = (prices[i] * multiplier) + (result[i - 1] * (1 - multiplier));
      result.push(emaValue);
    }
  }
  
  return result;
}

// Relative Strength Index
export function rsi(prices: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate RSI
  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        const rsiValue = 100 - (100 / (1 + rs));
        result.push(rsiValue);
      }
    }
  }
  
  // Add NaN for first price (no change calculated)
  return [NaN, ...result];
}

// MACD (Moving Average Convergence Divergence)
export function macd(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) {
  const fastEMA = ema(prices, fastPeriod);
  const slowEMA = ema(prices, slowPeriod);
  
  const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
  const signalLine = ema(macdLine.filter(v => !isNaN(v)), signalPeriod);
  
  // Pad signal line with NaNs to match length
  const paddedSignal = [...Array(macdLine.length - signalLine.length).fill(NaN), ...signalLine];
  
  const histogram = macdLine.map((macd, i) => macd - (paddedSignal[i] || 0));
  
  return {
    macd: macdLine,
    signal: paddedSignal,
    histogram
  };
}

// Average True Range
export function atr(data: PriceData[], period: number = 14): number[] {
  const trueRanges: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const high = data[i].ohlc.h;
    const low = data[i].ohlc.l;
    const prevClose = data[i - 1].ohlc.c;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    
    trueRanges.push(tr);
  }
  
  const atrValues = sma(trueRanges, period);
  return [NaN, ...atrValues]; // Add NaN for first data point
}

// Bollinger Bands
export function bollingerBands(prices: number[], period: number = 20, stdDev: number = 2) {
  const smaValues = sma(prices, period);
  const upperBand: number[] = [];
  const lowerBand: number[] = [];
  const bandwidth: number[] = [];
  const position: number[] = []; // Position within bands (0-1)
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      upperBand.push(NaN);
      lowerBand.push(NaN);
      bandwidth.push(NaN);
      position.push(NaN);
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = smaValues[i];
      const variance = slice.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);
      
      const upper = mean + (stdDev * standardDeviation);
      const lower = mean - (stdDev * standardDeviation);
      
      upperBand.push(upper);
      lowerBand.push(lower);
      bandwidth.push((upper - lower) / mean);
      
      // Calculate position within bands (0 = lower band, 1 = upper band)
      const pos = (prices[i] - lower) / (upper - lower);
      position.push(Math.max(0, Math.min(1, pos)));
    }
  }
  
  return {
    upper: upperBand,
    middle: smaValues,
    lower: lowerBand,
    bandwidth,
    position
  };
}

// Realized Volatility (rolling standard deviation of returns)
export function realizedVolatility(prices: number[], period: number = 20): number[] {
  const returns: number[] = [];
  
  // Calculate returns
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  
  const result: number[] = [NaN]; // First price has no return
  
  for (let i = 0; i < returns.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = returns.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / period;
      const volatility = Math.sqrt(variance * 252); // Annualized
      result.push(volatility);
    }
  }
  
  return result;
}

// Z-Score (standardized value)
export function zscore(values: number[], period: number = 20): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || isNaN(values[i])) {
      result.push(NaN);
    } else {
      const slice = values.slice(i - period + 1, i + 1).filter(v => !isNaN(v));
      if (slice.length === 0) {
        result.push(NaN);
        continue;
      }
      
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / slice.length;
      const stdDev = Math.sqrt(variance);
      
      if (stdDev === 0) {
        result.push(0);
      } else {
        result.push((values[i] - mean) / stdDev);
      }
    }
  }
  
  return result;
}

// Helper function to extract closing prices from OHLCV data
export function extractClosePrices(data: PriceData[]): number[] {
  return data.map(d => d.ohlc.c);
}

// Helper function to calculate percentage change
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return (current - previous) / previous;
}

// Helper function to normalize values to 0-1 range
export function normalize(values: number[]): number[] {
  const validValues = values.filter(v => !isNaN(v));
  if (validValues.length === 0) return values;
  
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min;
  
  if (range === 0) return values.map(() => 0.5);
  
  return values.map(v => isNaN(v) ? NaN : (v - min) / range);
}
