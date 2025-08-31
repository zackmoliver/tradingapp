// src/lib/model.ts
// ML model inference engine

import { PriceData, sma, ema, rsi, macd, atr, bollingerBands, realizedVolatility, zscore, extractClosePrices } from './indicators';
import { BreadthMetrics } from './breadth';
import { NewsSentiment } from './news';

export interface ModelWeights {
  model_type: string;
  version: string;
  intercept: number;
  features: string[];
  coefficients: number[];
  feature_scaling: Record<string, { mean: number; std: number }>;
  recommendation_thresholds: {
    high_confidence: number;
    medium_confidence: number;
    low_confidence: number;
  };
  strategy_mappings: Record<string, any>;
}

export interface FeatureVector {
  price_vs_sma200: number;
  sma50_vs_sma200: number;
  ema12_minus_ema26: number;
  rsi14_z: number;
  macd_hist_z: number;
  atr14_pct: number;
  bb_pos: number;
  iv_rank: number;
  term_slope: number;
  skew_25d: number;
  rsp_spy_slope: number;
  pct_above_200dma: number;
  news_sentiment: number;
  earnings_window: number;
}

export interface ModelPrediction {
  probability: number; // 0-1
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  features: FeatureVector;
  recommendation: {
    strategy: string;
    parameters: Record<string, any>;
    rationale: string[];
  };
}

export class TradingModel {
  private weights: ModelWeights | null = null;

  async loadModel(): Promise<void> {
    try {
      // In a real app, this would fetch from the model file
      // For now, we'll use the embedded weights
      const response = await fetch('/model/model.json');
      this.weights = await response.json();
    } catch (error) {
      console.warn('Failed to load model weights, using defaults:', error);
      this.weights = this.getDefaultWeights();
    }
  }

  async predict(
    priceData: PriceData[],
    breadthMetrics: BreadthMetrics,
    newsSentiment: NewsSentiment,
    earningsInWindow: boolean = false
  ): Promise<ModelPrediction> {
    if (!this.weights) {
      await this.loadModel();
    }

    if (!this.weights) {
      throw new Error('Failed to load model weights');
    }

    // Extract features
    const features = this.extractFeatures(priceData, breadthMetrics, newsSentiment, earningsInWindow);
    
    // Scale features
    const scaledFeatures = this.scaleFeatures(features);
    
    // Calculate prediction
    const probability = this.calculateProbability(scaledFeatures);
    
    // Determine confidence level
    const confidence = this.getConfidenceLevel(probability);
    
    // Generate recommendation
    const recommendation = this.generateRecommendation(probability, features);

    return {
      probability,
      confidence,
      features,
      recommendation
    };
  }

  private extractFeatures(
    priceData: PriceData[],
    breadthMetrics: BreadthMetrics,
    newsSentiment: NewsSentiment,
    earningsInWindow: boolean
  ): FeatureVector {
    if (priceData.length < 200) {
      throw new Error('Insufficient price data (need at least 200 days)');
    }

    const prices = extractClosePrices(priceData);
    const currentPrice = prices[prices.length - 1];
    
    // Calculate indicators
    const sma50 = sma(prices, 50);
    const sma200 = sma(prices, 200);
    const ema12 = ema(prices, 12);
    const ema26 = ema(prices, 26);
    const rsi14 = rsi(prices, 14);
    const macdData = macd(prices, 12, 26, 9);
    const atr14 = atr(priceData, 14);
    const bb = bollingerBands(prices, 20, 2);
    
    // Get current values (last non-NaN values)
    const currentSMA50 = this.getLastValidValue(sma50);
    const currentSMA200 = this.getLastValidValue(sma200);
    const currentEMA12 = this.getLastValidValue(ema12);
    const currentEMA26 = this.getLastValidValue(ema26);
    const currentRSI = this.getLastValidValue(rsi14);
    const currentMACDHist = this.getLastValidValue(macdData.histogram);
    const currentATR = this.getLastValidValue(atr14);
    const currentBBPos = this.getLastValidValue(bb.position);

    // Calculate z-scores for momentum indicators
    const rsi14_z = zscore(rsi14, 20);
    const macdHist_z = zscore(macdData.histogram, 20);
    const currentRSIZ = this.getLastValidValue(rsi14_z);
    const currentMACDHistZ = this.getLastValidValue(macdHist_z);

    return {
      // Trend features
      price_vs_sma200: (currentPrice - currentSMA200) / currentSMA200,
      sma50_vs_sma200: (currentSMA50 - currentSMA200) / currentSMA200,
      ema12_minus_ema26: (currentEMA12 - currentEMA26) / currentPrice,
      
      // Momentum features
      rsi14_z: currentRSIZ,
      macd_hist_z: currentMACDHistZ,
      
      // Volatility features
      atr14_pct: currentATR / currentPrice,
      bb_pos: currentBBPos,
      
      // Options features (mock values - would need real options data)
      iv_rank: 0.45, // Mock IV rank
      term_slope: 0.02, // Mock term structure slope
      skew_25d: -0.1, // Mock 25-delta skew
      
      // Breadth features
      rsp_spy_slope: breadthMetrics.rsp_spy_ratio_slope,
      pct_above_200dma: breadthMetrics.pct_above_200dma,
      
      // News feature
      news_sentiment: newsSentiment.avg,
      
      // Earnings feature
      earnings_window: earningsInWindow ? 1 : 0
    };
  }

  private scaleFeatures(features: FeatureVector): number[] {
    if (!this.weights) throw new Error('Model weights not loaded');
    
    const scaledValues: number[] = [];
    
    for (const featureName of this.weights.features) {
      const value = features[featureName as keyof FeatureVector];
      const scaling = this.weights.feature_scaling[featureName];
      
      if (scaling) {
        const scaledValue = (value - scaling.mean) / scaling.std;
        scaledValues.push(scaledValue);
      } else {
        scaledValues.push(value); // No scaling info, use raw value
      }
    }
    
    return scaledValues;
  }

  private calculateProbability(scaledFeatures: number[]): number {
    if (!this.weights) throw new Error('Model weights not loaded');
    
    // Logistic regression: p = 1 / (1 + exp(-(intercept + sum(coef * feature))))
    let logit = this.weights.intercept;
    
    for (let i = 0; i < scaledFeatures.length && i < this.weights.coefficients.length; i++) {
      logit += this.weights.coefficients[i] * scaledFeatures[i];
    }
    
    const probability = 1 / (1 + Math.exp(-logit));
    
    // Clamp to reasonable range
    return Math.max(0.01, Math.min(0.99, probability));
  }

  private getConfidenceLevel(probability: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (!this.weights) return 'LOW';
    
    const thresholds = this.weights.recommendation_thresholds;
    
    if (probability >= thresholds.high_confidence || probability <= (1 - thresholds.high_confidence)) {
      return 'HIGH';
    } else if (probability >= thresholds.medium_confidence || probability <= (1 - thresholds.medium_confidence)) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  private generateRecommendation(probability: number, features: FeatureVector): {
    strategy: string;
    parameters: Record<string, any>;
    rationale: string[];
  } {
    if (!this.weights) {
      return {
        strategy: 'Cash',
        parameters: {},
        rationale: ['Model not loaded']
      };
    }

    const mappings = this.weights.strategy_mappings;
    let strategy: any;
    
    if (probability >= 0.70) {
      strategy = mappings.score_gte_0_70 || mappings['score_gte_0.70'];
    } else if (probability >= 0.55) {
      strategy = mappings.score_0_55_to_0_70 || mappings['score_0.55_to_0.70'];
    } else if (probability >= 0.45) {
      strategy = mappings.score_0_45_to_0_55 || mappings['score_0.45_to_0.55'];
    } else {
      strategy = mappings.score_lt_0_45 || mappings['score_lt_0.45'];
    }

    // Generate rationale based on features
    const rationale: string[] = [];
    
    if (features.price_vs_sma200 > 0.05) {
      rationale.push('Price is significantly above 200-day moving average (bullish trend)');
    } else if (features.price_vs_sma200 < -0.05) {
      rationale.push('Price is below 200-day moving average (bearish trend)');
    }
    
    if (features.sma50_vs_sma200 > 0.02) {
      rationale.push('50-day MA above 200-day MA indicates uptrend');
    }
    
    if (features.rsi14_z > 1) {
      rationale.push('RSI is elevated (potential overbought condition)');
    } else if (features.rsi14_z < -1) {
      rationale.push('RSI is depressed (potential oversold condition)');
    }
    
    if (features.pct_above_200dma > 0.6) {
      rationale.push('Strong market breadth (>60% of stocks above 200-day MA)');
    } else if (features.pct_above_200dma < 0.4) {
      rationale.push('Weak market breadth (<40% of stocks above 200-day MA)');
    }
    
    if (features.news_sentiment > 0.2) {
      rationale.push('Positive news sentiment supports bullish outlook');
    } else if (features.news_sentiment < -0.2) {
      rationale.push('Negative news sentiment suggests caution');
    }

    if (rationale.length === 0) {
      rationale.push('Mixed signals suggest neutral positioning');
    }

    return {
      strategy: strategy?.strategy || 'Cash',
      parameters: strategy?.parameters || {},
      rationale
    };
  }

  private getLastValidValue(values: number[]): number {
    for (let i = values.length - 1; i >= 0; i--) {
      if (!isNaN(values[i])) {
        return values[i];
      }
    }
    return 0; // Fallback
  }

  private getDefaultWeights(): ModelWeights {
    return {
      model_type: 'logistic_regression',
      version: '1.0.0',
      intercept: -0.2847,
      features: [
        'price_vs_sma200', 'sma50_vs_sma200', 'ema12_minus_ema26',
        'rsi14_z', 'macd_hist_z', 'atr14_pct', 'bb_pos',
        'iv_rank', 'term_slope', 'skew_25d', 'rsp_spy_slope',
        'pct_above_200dma', 'news_sentiment', 'earnings_window'
      ],
      coefficients: [
        0.4521, 0.3892, 0.2156, -0.1834, 0.2967, -0.0892, 0.1456,
        0.0734, 0.1289, -0.0567, 0.2134, 0.3456, 0.1823, -0.0923
      ],
      feature_scaling: {
        price_vs_sma200: { mean: 0.0234, std: 0.1456 },
        sma50_vs_sma200: { mean: 0.0123, std: 0.0892 },
        ema12_minus_ema26: { mean: 0.0045, std: 0.0234 },
        rsi14_z: { mean: 0.0, std: 1.0 },
        macd_hist_z: { mean: 0.0, std: 1.0 },
        atr14_pct: { mean: 0.0234, std: 0.0156 },
        bb_pos: { mean: 0.5, std: 0.289 },
        iv_rank: { mean: 0.45, std: 0.234 },
        term_slope: { mean: 0.0123, std: 0.0456 },
        skew_25d: { mean: -0.0234, std: 0.0789 },
        rsp_spy_slope: { mean: 0.0012, std: 0.0234 },
        pct_above_200dma: { mean: 0.567, std: 0.234 },
        news_sentiment: { mean: 0.0, std: 0.5 },
        earnings_window: { mean: 0.0, std: 1.0 }
      },
      recommendation_thresholds: {
        high_confidence: 0.70,
        medium_confidence: 0.55,
        low_confidence: 0.45
      },
      strategy_mappings: {
        'score_gte_0.70': {
          strategy: 'PMCC',
          parameters: {
            short_delta: 0.25,
            short_dte: 35,
            long_delta: 0.70,
            long_dte: 365,
            profit_target: 0.50,
            stop_loss: 2.0
          }
        },
        'score_0.55_to_0.70': {
          strategy: 'PMCC_Conservative',
          parameters: {
            short_delta: 0.20,
            short_dte: 30,
            long_delta: 0.75,
            long_dte: 300,
            profit_target: 0.40,
            stop_loss: 1.5
          }
        },
        'score_0.45_to_0.55': {
          strategy: 'Wheel',
          parameters: {
            put_delta: 0.20,
            put_dte: 30,
            cc_delta: 0.25,
            cc_dte: 30,
            profit_target: 0.50,
            assignment_ok: true
          }
        },
        'score_lt_0.45': {
          strategy: 'Cash',
          parameters: {
            reason: 'Low confidence signal',
            wait_for: 'Better setup'
          }
        }
      }
    };
  }
}
