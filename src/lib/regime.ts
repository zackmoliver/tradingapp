// src/lib/regime.ts
// Market regime detection and classification

import { PriceData } from './data/equities';
import { IvMetrics } from './data/options';
import { sma, rsi, atr, extractClosePrices } from './indicators';

export type MarketRegime = 
  | 'BULL_TREND' 
  | 'BEAR_TREND' 
  | 'SIDEWAYS_LOW_VOL' 
  | 'SIDEWAYS_HIGH_VOL' 
  | 'EVENT_RISK';

export interface RegimeFeatures {
  // Price trend features
  sma50: number;
  sma200: number;
  priceVsSma50: number;    // (price - sma50) / sma50
  priceVsSma200: number;   // (price - sma200) / sma200
  smaSlope50: number;      // 20-day slope of SMA50
  smaSlope200: number;     // 20-day slope of SMA200
  
  // Momentum features
  rsi: number;             // 14-period RSI
  adx: number;             // Average Directional Index (trend strength)
  
  // Volatility features
  realizedVol: number;     // 20-day realized volatility
  atr: number;             // 14-day Average True Range
  bbWidth: number;         // Bollinger Band width
  
  // Options/volatility features
  vix: number;             // VIX or VIX-like measure
  ivRank: number;          // IV percentile rank
  termStructure: number;   // Term structure slope
  skew: number;            // Put/call skew
}

export interface RegimeClassification {
  regime: MarketRegime;
  confidence: number;      // 0-1, confidence in classification
  features: RegimeFeatures;
  rationale: string[];     // Top reasons for classification
}

/**
 * Classify market regime based on technical and volatility features
 */
export function classifyRegime(
  priceData: PriceData[],
  ivMetrics: IvMetrics,
  vix: number = 20
): RegimeClassification {
  
  if (priceData.length < 200) {
    throw new Error('Insufficient data for regime classification (need at least 200 bars)');
  }

  // Calculate technical features
  const features = calculateRegimeFeatures(priceData, ivMetrics, vix);
  
  // Apply regime classification rules
  const classification = applyRegimeRules(features);
  
  return {
    regime: classification.regime,
    confidence: classification.confidence,
    features,
    rationale: classification.rationale
  };
}

/**
 * Calculate all regime features from price data and volatility metrics
 */
function calculateRegimeFeatures(
  priceData: PriceData[],
  ivMetrics: IvMetrics,
  vix: number
): RegimeFeatures {
  
  const closes = extractClosePrices(priceData);
  const highs = priceData.map(d => d.ohlc.h);
  const lows = priceData.map(d => d.ohlc.l);
  
  // Moving averages
  const sma50Values = sma(closes, 50);
  const sma200Values = sma(closes, 200);
  const currentPrice = closes[closes.length - 1];
  const currentSma50 = sma50Values[sma50Values.length - 1];
  const currentSma200 = sma200Values[sma200Values.length - 1];
  
  // SMA slopes (20-day rate of change)
  const smaSlope50 = calculateSlope(sma50Values.slice(-20));
  const smaSlope200 = calculateSlope(sma200Values.slice(-20));
  
  // Momentum indicators
  const rsiValues = rsi(closes, 14);
  const currentRsi = rsiValues[rsiValues.length - 1];
  const adxValue = calculateADX(priceData.slice(-50)); // Use last 50 bars for ADX
  
  // Volatility measures
  const realizedVol = calculateRealizedVolatility(closes.slice(-20));
  const atrValues = atr(priceData, 14);
  const currentAtr = atrValues[atrValues.length - 1];
  const bbWidth = calculateBollingerBandWidth(closes.slice(-20));
  
  return {
    sma50: currentSma50,
    sma200: currentSma200,
    priceVsSma50: (currentPrice - currentSma50) / currentSma50,
    priceVsSma200: (currentPrice - currentSma200) / currentSma200,
    smaSlope50,
    smaSlope200,
    rsi: currentRsi,
    adx: adxValue,
    realizedVol,
    atr: currentAtr,
    bbWidth,
    vix,
    ivRank: ivMetrics.ivRank,
    termStructure: ivMetrics.term,
    skew: ivMetrics.skew
  };
}

/**
 * Apply regime classification rules
 */
function applyRegimeRules(features: RegimeFeatures): {
  regime: MarketRegime;
  confidence: number;
  rationale: string[];
} {
  
  const rationale: string[] = [];
  let regime: MarketRegime;
  let confidence = 0.5;
  
  // Event Risk Detection (highest priority)
  if (features.vix > 30 || features.ivRank > 80) {
    regime = 'EVENT_RISK';
    confidence = 0.9;
    rationale.push(`High volatility: VIX ${features.vix.toFixed(1)}, IV Rank ${features.ivRank}%`);
    rationale.push('Elevated implied volatility suggests event risk or market stress');
    if (features.skew < -0.15) {
      rationale.push('Pronounced put skew indicates fear/hedging demand');
    }
    return { regime, confidence, rationale };
  }
  
  // Trend Detection
  const isBullishTrend = features.priceVsSma50 > 0.02 && 
                        features.priceVsSma200 > 0.05 && 
                        features.smaSlope50 > 0.001 &&
                        features.smaSlope200 > 0.0005;
                        
  const isBearishTrend = features.priceVsSma50 < -0.02 && 
                        features.priceVsSma200 < -0.05 && 
                        features.smaSlope50 < -0.001 &&
                        features.smaSlope200 < -0.0005;
  
  // Strong trend with momentum
  if (isBullishTrend && features.adx > 25 && features.rsi > 55) {
    regime = 'BULL_TREND';
    confidence = Math.min(0.9, 0.6 + (features.adx - 25) * 0.01);
    rationale.push(`Strong uptrend: Price ${(features.priceVsSma50 * 100).toFixed(1)}% above SMA50`);
    rationale.push(`Trend strength: ADX ${features.adx.toFixed(1)} indicates strong directional movement`);
    rationale.push(`Momentum: RSI ${features.rsi.toFixed(1)} shows bullish momentum`);
    return { regime, confidence, rationale };
  }
  
  if (isBearishTrend && features.adx > 25 && features.rsi < 45) {
    regime = 'BEAR_TREND';
    confidence = Math.min(0.9, 0.6 + (features.adx - 25) * 0.01);
    rationale.push(`Strong downtrend: Price ${(features.priceVsSma50 * 100).toFixed(1)}% below SMA50`);
    rationale.push(`Trend strength: ADX ${features.adx.toFixed(1)} indicates strong directional movement`);
    rationale.push(`Momentum: RSI ${features.rsi.toFixed(1)} shows bearish momentum`);
    return { regime, confidence, rationale };
  }
  
  // Sideways markets (low trend strength)
  if (features.adx < 20 && Math.abs(features.priceVsSma50) < 0.03) {
    if (features.realizedVol < 0.15 && features.vix < 20 && features.bbWidth < 0.05) {
      regime = 'SIDEWAYS_LOW_VOL';
      confidence = 0.8;
      rationale.push(`Low volatility: Realized vol ${(features.realizedVol * 100).toFixed(1)}%, VIX ${features.vix.toFixed(1)}`);
      rationale.push(`Range-bound: Price within 3% of SMA50, ADX ${features.adx.toFixed(1)} shows weak trend`);
      rationale.push(`Tight range: Bollinger Band width ${(features.bbWidth * 100).toFixed(1)}% indicates compression`);
    } else {
      regime = 'SIDEWAYS_HIGH_VOL';
      confidence = 0.7;
      rationale.push(`High volatility: Realized vol ${(features.realizedVol * 100).toFixed(1)}%, VIX ${features.vix.toFixed(1)}`);
      rationale.push(`Range-bound: Price near SMA50 but with elevated volatility`);
      rationale.push(`Choppy conditions: High vol with weak trend suggests whipsaw environment`);
    }
    return { regime, confidence, rationale };
  }
  
  // Default: Weak trend conditions
  if (features.priceVsSma50 > 0 && features.smaSlope50 > 0) {
    regime = 'BULL_TREND';
    confidence = 0.5;
    rationale.push(`Weak uptrend: Price above SMA50 with modest positive slope`);
    rationale.push(`Low conviction: ADX ${features.adx.toFixed(1)} suggests weak trend strength`);
    rationale.push('Mixed signals: Consider range-bound strategies');
  } else {
    regime = 'BEAR_TREND';
    confidence = 0.5;
    rationale.push(`Weak downtrend: Price below SMA50 with negative slope`);
    rationale.push(`Low conviction: ADX ${features.adx.toFixed(1)} suggests weak trend strength`);
    rationale.push('Mixed signals: Consider range-bound strategies');
  }
  
  return { regime, confidence, rationale };
}

/**
 * Calculate slope of a data series (rate of change)
 */
function calculateSlope(values: number[]): number {
  if (values.length < 2) return 0;
  
  const n = values.length;
  const sumX = (n * (n - 1)) / 2; // Sum of indices 0,1,2,...,n-1
  const sumY = values.reduce((sum, val) => sum + val, 0);
  const sumXY = values.reduce((sum, val, i) => sum + i * val, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squares of indices
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope / values[values.length - 1]; // Normalize by current value
}

/**
 * Calculate Average Directional Index (ADX) for trend strength
 */
function calculateADX(data: PriceData[], period: number = 14): number {
  if (data.length < period + 1) return 0;
  
  // Simplified ADX calculation
  let sumDX = 0;
  let count = 0;
  
  for (let i = 1; i < data.length; i++) {
    const high = data[i].ohlc.h;
    const low = data[i].ohlc.l;
    const prevHigh = data[i - 1].ohlc.h;
    const prevLow = data[i - 1].ohlc.l;
    
    const plusDM = Math.max(high - prevHigh, 0);
    const minusDM = Math.max(prevLow - low, 0);
    const tr = Math.max(high - low, Math.abs(high - data[i - 1].ohlc.c), Math.abs(low - data[i - 1].ohlc.c));
    
    if (tr > 0) {
      const plusDI = (plusDM / tr) * 100;
      const minusDI = (minusDM / tr) * 100;
      const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
      
      if (!isNaN(dx)) {
        sumDX += dx;
        count++;
      }
    }
  }
  
  return count > 0 ? sumDX / count : 0;
}

/**
 * Calculate realized volatility from price series
 */
function calculateRealizedVolatility(closes: number[], period: number = 20): number {
  if (closes.length < period + 1) return 0;
  
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  
  const recentReturns = returns.slice(-period);
  const mean = recentReturns.reduce((sum, r) => sum + r, 0) / recentReturns.length;
  const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (recentReturns.length - 1);
  
  return Math.sqrt(variance * 252); // Annualized
}

/**
 * Calculate Bollinger Band width
 */
function calculateBollingerBandWidth(closes: number[], period: number = 20): number {
  if (closes.length < period) return 0;
  
  const recentCloses = closes.slice(-period);
  const mean = recentCloses.reduce((sum, c) => sum + c, 0) / recentCloses.length;
  const variance = recentCloses.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / recentCloses.length;
  const stdDev = Math.sqrt(variance);
  
  return (4 * stdDev) / mean; // Width as percentage of price
}
