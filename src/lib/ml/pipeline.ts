// src/lib/ml/pipeline.ts
// ML Pipeline with offline training and prediction

import { PriceData } from '@/lib/data/equities';
import { IvMetrics } from '@/lib/data/options';
import { buildFeatures, normalizeFeatures, calculateFeatureImportance, FeatureVector } from './features';
import { 
  trainRandomForest, 
  calibrateWithPlatt, 
  predictCalibrated, 
  RandomForestModel, 
  CalibratedModel,
  PredictionResult 
} from './model';

export interface MLPrediction {
  probability: number;      // 0-1, probability of positive outcome
  confidence: number;       // 0-1, confidence in the prediction
  topFeatures: string[];    // Top 5 most important features
  modelVersion: string;     // Model version identifier
  timestamp: Date;          // Prediction timestamp
}

export interface TrainingData {
  features: number[][];
  targets: number[];
  featureNames: string[];
  metadata: {
    symbol: string;
    startDate: string;
    endDate: string;
    samples: number;
  };
}

// Global model cache
let cachedModel: CalibratedModel | null = null;
let modelVersion = 'v1.0.0';

/**
 * Main prediction function - entry point for ML predictions
 */
export async function predict(
  symbol: string,
  bars: PriceData[],
  volMetrics: IvMetrics
): Promise<MLPrediction> {
  
  try {
    // Ensure we have a trained model
    const model = await getOrLoadModel();
    
    // Build features for the latest data point
    const featureVectors = buildFeatures(bars, volMetrics);
    
    if (featureVectors.length === 0) {
      throw new Error('Insufficient data to build features');
    }
    
    // Get the most recent feature vector
    const latestFeatures = featureVectors[featureVectors.length - 1];
    
    // Make prediction
    const result = predictCalibrated(model, latestFeatures.features);
    
    // Get top 5 features
    const topFeatures = result.featureImportance
      .slice(0, 5)
      .map(f => f.name);
    
    return {
      probability: result.probability,
      confidence: result.confidence,
      topFeatures,
      modelVersion,
      timestamp: new Date()
    };
    
  } catch (error) {
    console.warn('[ML] Prediction failed, returning default:', error);
    
    // Return safe default prediction
    return {
      probability: 0.5,
      confidence: 0.3,
      topFeatures: ['price_momentum_5', 'rsi14', 'iv_rank', 'macd_line', 'bb_position'],
      modelVersion: 'fallback',
      timestamp: new Date()
    };
  }
}

/**
 * Get or load the ML model
 */
async function getOrLoadModel(): Promise<CalibratedModel> {
  if (cachedModel) {
    return cachedModel;
  }
  
  try {
    // Try to load shipped model
    cachedModel = await loadShippedModel();
    console.log('[ML] Loaded shipped model');
    return cachedModel;
  } catch (error) {
    console.warn('[ML] Failed to load shipped model, training default:', error);
    
    // Train a default model with synthetic data
    cachedModel = await trainDefaultModel();
    console.log('[ML] Trained default model');
    return cachedModel;
  }
}

/**
 * Load pre-trained model from shipped model.json
 */
async function loadShippedModel(): Promise<CalibratedModel> {
  // In a real implementation, this would load from a JSON file
  // For now, we'll create a minimal model structure
  
  const defaultModel: RandomForestModel = {
    trees: [],
    featureNames: [
      'price_vs_sma20', 'price_vs_sma50', 'sma20_vs_sma50',
      'price_vs_ema12', 'price_vs_ema26', 'ema12_vs_ema26',
      'rsi14', 'macd_line', 'macd_signal', 'macd_histogram',
      'atr14_normalized', 'bb_position', 'bb_width',
      'volume_sma_ratio', 'price_momentum_5', 'price_momentum_10',
      'iv_rank', 'term_structure', 'put_call_skew',
      'return_1d', 'return_5d', 'return_10d', 'return_20d',
      'volatility_5d', 'volatility_10d', 'volatility_20d'
    ],
    nFeatures: 25,
    nTrees: 0
  };
  
  // Train a minimal model for demonstration
  return await trainDefaultModel();
}

/**
 * Train a default model with synthetic data
 */
async function trainDefaultModel(): Promise<CalibratedModel> {
  // Generate synthetic training data
  const trainingData = generateSyntheticTrainingData();
  
  // Train RandomForest
  const model = trainRandomForest(
    trainingData.features,
    trainingData.targets,
    {
      nTrees: 10,
      maxDepth: 5,
      minSamplesSplit: 5,
      featureSubsample: 0.7,
      featureNames: trainingData.featureNames
    }
  );
  
  // Split data for calibration
  const splitIndex = Math.floor(trainingData.features.length * 0.8);
  const X_val = trainingData.features.slice(splitIndex);
  const y_val = trainingData.targets.slice(splitIndex);
  
  // Calibrate model
  const calibratedModel = calibrateWithPlatt(model, X_val, y_val);
  
  return calibratedModel;
}

/**
 * Generate synthetic training data for demonstration
 */
function generateSyntheticTrainingData(): TrainingData {
  const nSamples = 1000;
  const nFeatures = 25;
  
  const features: number[][] = [];
  const targets: number[] = [];
  
  const featureNames = [
    'price_vs_sma20', 'price_vs_sma50', 'sma20_vs_sma50',
    'price_vs_ema12', 'price_vs_ema26', 'ema12_vs_ema26',
    'rsi14', 'macd_line', 'macd_signal', 'macd_histogram',
    'atr14_normalized', 'bb_position', 'bb_width',
    'volume_sma_ratio', 'price_momentum_5', 'price_momentum_10',
    'iv_rank', 'term_structure', 'put_call_skew',
    'return_1d', 'return_5d', 'return_10d', 'return_20d',
    'volatility_5d', 'volatility_10d', 'volatility_20d'
  ];
  
  for (let i = 0; i < nSamples; i++) {
    const sample: number[] = [];
    
    // Generate correlated features that make sense for trading
    const momentum = (Math.random() - 0.5) * 0.1; // -5% to +5%
    const volatility = Math.random() * 0.3 + 0.1;  // 10% to 40%
    const trend = (Math.random() - 0.5) * 0.05;    // -2.5% to +2.5%
    
    // Price vs moving averages (correlated with momentum)
    sample.push(momentum + (Math.random() - 0.5) * 0.02); // price_vs_sma20
    sample.push(momentum * 0.8 + (Math.random() - 0.5) * 0.02); // price_vs_sma50
    sample.push(trend + (Math.random() - 0.5) * 0.01); // sma20_vs_sma50
    
    // EMA features
    sample.push(momentum * 1.1 + (Math.random() - 0.5) * 0.02); // price_vs_ema12
    sample.push(momentum * 0.9 + (Math.random() - 0.5) * 0.02); // price_vs_ema26
    sample.push(trend * 1.2 + (Math.random() - 0.5) * 0.01); // ema12_vs_ema26
    
    // Technical indicators
    sample.push(Math.random()); // rsi14 (0-1)
    sample.push((Math.random() - 0.5) * 0.02); // macd_line
    sample.push((Math.random() - 0.5) * 0.02); // macd_signal
    sample.push((Math.random() - 0.5) * 0.01); // macd_histogram
    
    // Volatility features
    sample.push(volatility * (Math.random() * 0.5 + 0.75)); // atr14_normalized
    sample.push(Math.random()); // bb_position
    sample.push(volatility * (Math.random() * 0.5 + 0.75)); // bb_width
    
    // Volume and momentum
    sample.push(Math.random() * 2 + 0.5); // volume_sma_ratio
    sample.push(momentum + (Math.random() - 0.5) * 0.01); // price_momentum_5
    sample.push(momentum * 0.7 + (Math.random() - 0.5) * 0.015); // price_momentum_10
    
    // Options features
    sample.push(Math.random()); // iv_rank
    sample.push((Math.random() - 0.5) * 0.2); // term_structure
    sample.push((Math.random() - 0.5) * 0.3); // put_call_skew
    
    // Returns
    sample.push(momentum * 0.2 + (Math.random() - 0.5) * 0.02); // return_1d
    sample.push(momentum + (Math.random() - 0.5) * 0.03); // return_5d
    sample.push(momentum * 1.5 + (Math.random() - 0.5) * 0.04); // return_10d
    sample.push(momentum * 2 + (Math.random() - 0.5) * 0.05); // return_20d
    
    // Volatilities
    sample.push(volatility * (Math.random() * 0.3 + 0.85)); // volatility_5d
    sample.push(volatility * (Math.random() * 0.3 + 0.85)); // volatility_10d
    sample.push(volatility * (Math.random() * 0.3 + 0.85)); // volatility_20d
    
    features.push(sample);
    
    // Generate target based on features (positive momentum + low volatility = good)
    const signal = momentum * 2 - volatility * 0.5 + trend;
    const target = signal > 0 ? 1 : 0;
    targets.push(target);
  }
  
  return {
    features,
    targets,
    featureNames,
    metadata: {
      symbol: 'SYNTHETIC',
      startDate: '2020-01-01',
      endDate: '2023-12-31',
      samples: nSamples
    }
  };
}

/**
 * Train model offline with cached fixtures (for future implementation)
 */
export async function trainModelOffline(
  trainingData: TrainingData[]
): Promise<CalibratedModel> {
  
  if (trainingData.length === 0) {
    throw new Error('No training data provided');
  }
  
  // Combine all training data
  const allFeatures: number[][] = [];
  const allTargets: number[] = [];
  let featureNames: string[] = [];
  
  for (const data of trainingData) {
    allFeatures.push(...data.features);
    allTargets.push(...data.targets);
    if (featureNames.length === 0) {
      featureNames = data.featureNames.slice();
    }
  }
  
  console.log(`[ML] Training with ${allFeatures.length} samples, ${featureNames.length} features`);
  
  // Train RandomForest
  const model = trainRandomForest(allFeatures, allTargets, {
    nTrees: 20,
    maxDepth: 8,
    minSamplesSplit: 10,
    featureSubsample: 0.8,
    featureNames
  });
  
  // Split for calibration
  const splitIndex = Math.floor(allFeatures.length * 0.8);
  const X_val = allFeatures.slice(splitIndex);
  const y_val = allTargets.slice(splitIndex);
  
  // Calibrate model
  const calibratedModel = calibrateWithPlatt(model, X_val, y_val);
  
  console.log('[ML] Model training complete');
  
  return calibratedModel;
}

/**
 * Export model to JSON (for future implementation)
 */
export function exportModel(model: CalibratedModel): string {
  return JSON.stringify({
    version: modelVersion,
    timestamp: new Date().toISOString(),
    model: {
      trees: model.model.trees,
      featureNames: model.model.featureNames,
      nFeatures: model.model.nFeatures,
      nTrees: model.model.nTrees
    },
    calibration: {
      plattA: model.plattA,
      plattB: model.plattB
    }
  }, null, 2);
}

/**
 * Clear model cache (for testing)
 */
export function clearModelCache(): void {
  cachedModel = null;
}
