// src/lib/ml/features.ts
// Feature engineering for ML signals

import { PriceData } from '@/lib/data/equities';
import { IvMetrics } from '@/lib/data/options';
import { sma, ema, rsi, macd, atr, extractClosePrices } from '@/lib/indicators';

export interface FeatureVector {
  features: number[];
  featureNames: string[];
  timestamp: Date;
}

export interface FeatureConfig {
  includeTechnical: boolean;
  includeVolatility: boolean;
  includeReturns: boolean;
  lookbackPeriod: number;
}

export const DEFAULT_FEATURE_CONFIG: FeatureConfig = {
  includeTechnical: true,
  includeVolatility: true,
  includeReturns: true,
  lookbackPeriod: 50
};

/**
 * Build feature vectors from price data and volatility metrics
 */
export function buildFeatures(
  bars: PriceData[], 
  volMetrics: IvMetrics,
  config: FeatureConfig = DEFAULT_FEATURE_CONFIG
): FeatureVector[] {
  
  if (bars.length < config.lookbackPeriod) {
    throw new Error(`Insufficient data: need at least ${config.lookbackPeriod} bars, got ${bars.length}`);
  }

  const closes = extractClosePrices(bars);
  const highs = bars.map(b => b.ohlc.h);
  const lows = bars.map(b => b.ohlc.l);
  const volumes = bars.map(b => b.ohlc.v);
  
  // Calculate technical indicators
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const rsi14 = rsi(closes, 14);
  const macdData = macd(closes, 12, 26, 9);
  const atr14 = atr(bars, 14);
  
  const features: FeatureVector[] = [];
  const featureNames: string[] = [];
  
  // Build feature names
  if (config.includeTechnical) {
    featureNames.push(
      'price_vs_sma20', 'price_vs_sma50', 'sma20_vs_sma50',
      'price_vs_ema12', 'price_vs_ema26', 'ema12_vs_ema26',
      'rsi14', 'macd_line', 'macd_signal', 'macd_histogram',
      'atr14_normalized', 'bb_position', 'bb_width',
      'volume_sma_ratio', 'price_momentum_5', 'price_momentum_10'
    );
  }
  
  if (config.includeVolatility) {
    featureNames.push('iv_rank', 'term_structure', 'put_call_skew');
  }
  
  if (config.includeReturns) {
    featureNames.push(
      'return_1d', 'return_5d', 'return_10d', 'return_20d',
      'volatility_5d', 'volatility_10d', 'volatility_20d'
    );
  }

  // Calculate features for each bar (starting from lookback period)
  for (let i = config.lookbackPeriod; i < bars.length; i++) {
    const currentFeatures: number[] = [];
    
    if (config.includeTechnical) {
      const price = closes[i];
      const sma20Val = sma20[i] || price;
      const sma50Val = sma50[i] || price;
      const ema12Val = ema12[i] || price;
      const ema26Val = ema26[i] || price;
      
      // Price relative to moving averages
      currentFeatures.push(
        (price - sma20Val) / sma20Val,  // price_vs_sma20
        (price - sma50Val) / sma50Val,  // price_vs_sma50
        (sma20Val - sma50Val) / sma50Val, // sma20_vs_sma50
        (price - ema12Val) / ema12Val,  // price_vs_ema12
        (price - ema26Val) / ema26Val,  // price_vs_ema26
        (ema12Val - ema26Val) / ema26Val // ema12_vs_ema26
      );
      
      // Momentum indicators
      currentFeatures.push(
        (rsi14[i] || 50) / 100,  // rsi14 (normalized)
        macdData.macd[i] || 0,   // macd_line
        macdData.signal[i] || 0, // macd_signal
        macdData.histogram[i] || 0 // macd_histogram
      );
      
      // Volatility and range indicators
      const atrVal = atr14[i] || 0;
      currentFeatures.push(atrVal / price); // atr14_normalized
      
      // Bollinger Band position and width
      const bbData = calculateBollingerBands(closes.slice(Math.max(0, i - 19), i + 1), 20, 2);
      currentFeatures.push(
        bbData.position,  // bb_position
        bbData.width      // bb_width
      );
      
      // Volume analysis
      const volumeSma = sma(volumes.slice(Math.max(0, i - 19), i + 1), 20);
      const currentVolSma = volumeSma[volumeSma.length - 1] || volumes[i];
      currentFeatures.push(volumes[i] / currentVolSma); // volume_sma_ratio
      
      // Price momentum
      currentFeatures.push(
        i >= 5 ? (closes[i] - closes[i - 5]) / closes[i - 5] : 0,   // price_momentum_5
        i >= 10 ? (closes[i] - closes[i - 10]) / closes[i - 10] : 0 // price_momentum_10
      );
    }
    
    if (config.includeVolatility) {
      currentFeatures.push(
        volMetrics.ivRank / 100,     // iv_rank (normalized)
        volMetrics.term,             // term_structure
        volMetrics.skew              // put_call_skew
      );
    }
    
    if (config.includeReturns) {
      // Returns over different periods
      currentFeatures.push(
        i >= 1 ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0,   // return_1d
        i >= 5 ? (closes[i] - closes[i - 5]) / closes[i - 5] : 0,   // return_5d
        i >= 10 ? (closes[i] - closes[i - 10]) / closes[i - 10] : 0, // return_10d
        i >= 20 ? (closes[i] - closes[i - 20]) / closes[i - 20] : 0  // return_20d
      );
      
      // Rolling volatilities
      currentFeatures.push(
        calculateRollingVolatility(closes.slice(Math.max(0, i - 4), i + 1)),   // volatility_5d
        calculateRollingVolatility(closes.slice(Math.max(0, i - 9), i + 1)),   // volatility_10d
        calculateRollingVolatility(closes.slice(Math.max(0, i - 19), i + 1))   // volatility_20d
      );
    }
    
    // Ensure all features are finite numbers
    const cleanFeatures = currentFeatures.map(f => 
      isFinite(f) ? f : 0
    );
    
    features.push({
      features: cleanFeatures,
      featureNames: featureNames.slice(), // copy
      timestamp: bars[i].ts
    });
  }
  
  return features;
}

/**
 * Calculate Bollinger Band position and width
 */
function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2) {
  if (prices.length < period) {
    return { position: 0.5, width: 0.02 };
  }
  
  const recentPrices = prices.slice(-period);
  const mean = recentPrices.reduce((sum, p) => sum + p, 0) / recentPrices.length;
  const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / recentPrices.length;
  const std = Math.sqrt(variance);
  
  const upperBand = mean + (stdDev * std);
  const lowerBand = mean - (stdDev * std);
  const currentPrice = prices[prices.length - 1];
  
  // Position within bands (0 = lower band, 1 = upper band)
  const position = (currentPrice - lowerBand) / (upperBand - lowerBand);
  
  // Band width as percentage of price
  const width = (upperBand - lowerBand) / mean;
  
  return {
    position: Math.max(0, Math.min(1, position)),
    width: Math.max(0, width)
  };
}

/**
 * Calculate rolling volatility (annualized)
 */
function calculateRollingVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  
  return Math.sqrt(variance * 252); // Annualized
}

/**
 * Normalize features using z-score normalization
 */
export function normalizeFeatures(features: FeatureVector[]): FeatureVector[] {
  if (features.length === 0) return features;
  
  const numFeatures = features[0].features.length;
  const means = new Array(numFeatures).fill(0);
  const stds = new Array(numFeatures).fill(1);
  
  // Calculate means
  for (let i = 0; i < numFeatures; i++) {
    let sum = 0;
    for (const fv of features) {
      sum += fv.features[i];
    }
    means[i] = sum / features.length;
  }
  
  // Calculate standard deviations
  for (let i = 0; i < numFeatures; i++) {
    let sumSquares = 0;
    for (const fv of features) {
      sumSquares += Math.pow(fv.features[i] - means[i], 2);
    }
    stds[i] = Math.sqrt(sumSquares / (features.length - 1));
    if (stds[i] === 0) stds[i] = 1; // Avoid division by zero
  }
  
  // Normalize features
  return features.map(fv => ({
    ...fv,
    features: fv.features.map((f, i) => (f - means[i]) / stds[i])
  }));
}

/**
 * Get feature importance based on variance and correlation with target
 */
export function calculateFeatureImportance(
  features: FeatureVector[], 
  targets: number[]
): { name: string; importance: number }[] {
  
  if (features.length === 0 || features.length !== targets.length) {
    return [];
  }
  
  const numFeatures = features[0].features.length;
  const featureNames = features[0].featureNames;
  const importances: { name: string; importance: number }[] = [];
  
  for (let i = 0; i < numFeatures; i++) {
    const featureValues = features.map(fv => fv.features[i]);
    
    // Calculate correlation with target
    const correlation = Math.abs(calculateCorrelation(featureValues, targets));
    
    // Calculate variance (higher variance = more informative)
    const variance = calculateVariance(featureValues);
    
    // Combined importance score
    const importance = correlation * Math.sqrt(variance);
    
    importances.push({
      name: featureNames[i] || `feature_${i}`,
      importance: isFinite(importance) ? importance : 0
    });
  }
  
  return importances.sort((a, b) => b.importance - a.importance);
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  
  const n = x.length;
  const sumX = x.reduce((sum, val) => sum + val, 0);
  const sumY = y.reduce((sum, val) => sum + val, 0);
  const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
  const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
  const sumY2 = y.reduce((sum, val) => sum + val * val, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculate variance
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  
  return variance;
}
