// src/lib/ml/model.ts
// Lightweight RandomForest implementation with Platt scaling for calibration

export interface DecisionTree {
  feature: number;
  threshold: number;
  left?: DecisionTree;
  right?: DecisionTree;
  prediction?: number;
  samples: number;
}

export interface RandomForestModel {
  trees: DecisionTree[];
  featureNames: string[];
  nFeatures: number;
  nTrees: number;
}

export interface CalibratedModel {
  model: RandomForestModel;
  plattA: number;
  plattB: number;
}

export interface PredictionResult {
  probability: number;
  confidence: number;
  featureImportance: { name: string; importance: number }[];
}

/**
 * Train a simple RandomForest classifier
 */
export function trainRandomForest(
  X: number[][],
  y: number[],
  options: {
    nTrees?: number;
    maxDepth?: number;
    minSamplesSplit?: number;
    featureSubsample?: number;
    featureNames?: string[];
  } = {}
): RandomForestModel {
  
  const {
    nTrees = 10,
    maxDepth = 5,
    minSamplesSplit = 5,
    featureSubsample = 0.7,
    featureNames = []
  } = options;
  
  if (X.length === 0 || X.length !== y.length) {
    throw new Error('Invalid training data');
  }
  
  const nFeatures = X[0].length;
  const trees: DecisionTree[] = [];
  
  // Train each tree with bootstrap sampling and feature subsampling
  for (let i = 0; i < nTrees; i++) {
    // Bootstrap sampling
    const { X_boot, y_boot } = bootstrapSample(X, y);
    
    // Feature subsampling
    const nFeaturesSubset = Math.max(1, Math.floor(nFeatures * featureSubsample));
    const featureIndices = randomSubset(nFeatures, nFeaturesSubset);
    
    // Train tree
    const tree = trainDecisionTree(X_boot, y_boot, featureIndices, maxDepth, minSamplesSplit);
    trees.push(tree);
  }
  
  return {
    trees,
    featureNames: featureNames.slice(),
    nFeatures,
    nTrees
  };
}

/**
 * Train a single decision tree
 */
function trainDecisionTree(
  X: number[][],
  y: number[],
  featureIndices: number[],
  maxDepth: number,
  minSamplesSplit: number,
  depth: number = 0
): DecisionTree {
  
  const samples = X.length;
  
  // Base cases
  if (depth >= maxDepth || samples < minSamplesSplit || isPure(y)) {
    return {
      feature: -1,
      threshold: 0,
      prediction: calculateMean(y),
      samples
    };
  }
  
  // Find best split
  const bestSplit = findBestSplit(X, y, featureIndices);
  
  if (!bestSplit) {
    return {
      feature: -1,
      threshold: 0,
      prediction: calculateMean(y),
      samples
    };
  }
  
  // Split data
  const { leftX, leftY, rightX, rightY } = splitData(X, y, bestSplit.feature, bestSplit.threshold);
  
  // Recursively build subtrees
  const leftTree = trainDecisionTree(leftX, leftY, featureIndices, maxDepth, minSamplesSplit, depth + 1);
  const rightTree = trainDecisionTree(rightX, rightY, featureIndices, maxDepth, minSamplesSplit, depth + 1);
  
  return {
    feature: bestSplit.feature,
    threshold: bestSplit.threshold,
    left: leftTree,
    right: rightTree,
    samples
  };
}

/**
 * Find the best split for a node
 */
function findBestSplit(X: number[][], y: number[], featureIndices: number[]) {
  let bestGain = -Infinity;
  let bestFeature = -1;
  let bestThreshold = 0;
  
  const currentVariance = calculateVariance(y);
  
  for (const featureIdx of featureIndices) {
    const values = X.map(row => row[featureIdx]);
    const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
    
    for (let i = 0; i < uniqueValues.length - 1; i++) {
      const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;
      
      const leftIndices: number[] = [];
      const rightIndices: number[] = [];
      
      for (let j = 0; j < X.length; j++) {
        if (X[j][featureIdx] <= threshold) {
          leftIndices.push(j);
        } else {
          rightIndices.push(j);
        }
      }
      
      if (leftIndices.length === 0 || rightIndices.length === 0) continue;
      
      const leftY = leftIndices.map(idx => y[idx]);
      const rightY = rightIndices.map(idx => y[idx]);
      
      const leftVariance = calculateVariance(leftY);
      const rightVariance = calculateVariance(rightY);
      
      const weightedVariance = 
        (leftY.length / y.length) * leftVariance + 
        (rightY.length / y.length) * rightVariance;
      
      const gain = currentVariance - weightedVariance;
      
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = featureIdx;
        bestThreshold = threshold;
      }
    }
  }
  
  return bestGain > 0 ? { feature: bestFeature, threshold: bestThreshold, gain: bestGain } : null;
}

/**
 * Predict with RandomForest
 */
export function predictRandomForest(model: RandomForestModel, x: number[]): number {
  const predictions = model.trees.map(tree => predictTree(tree, x));
  return calculateMean(predictions);
}

/**
 * Predict with a single decision tree
 */
function predictTree(tree: DecisionTree, x: number[]): number {
  if (tree.prediction !== undefined) {
    return tree.prediction;
  }
  
  if (x[tree.feature] <= tree.threshold) {
    return tree.left ? predictTree(tree.left, x) : 0;
  } else {
    return tree.right ? predictTree(tree.right, x) : 0;
  }
}

/**
 * Calibrate model using Platt scaling
 */
export function calibrateWithPlatt(
  model: RandomForestModel,
  X_val: number[][],
  y_val: number[]
): CalibratedModel {
  
  if (X_val.length === 0 || X_val.length !== y_val.length) {
    return { model, plattA: 1, plattB: 0 };
  }
  
  // Get raw predictions
  const rawPredictions = X_val.map(x => predictRandomForest(model, x));
  
  // Fit sigmoid: P(y=1|f) = 1 / (1 + exp(A*f + B))
  const { A, B } = fitPlattScaling(rawPredictions, y_val);
  
  return {
    model,
    plattA: A,
    plattB: B
  };
}

/**
 * Predict with calibrated model
 */
export function predictCalibrated(calibratedModel: CalibratedModel, x: number[]): PredictionResult {
  const rawPrediction = predictRandomForest(calibratedModel.model, x);
  
  // Apply Platt scaling
  const logOdds = calibratedModel.plattA * rawPrediction + calibratedModel.plattB;
  const probability = 1 / (1 + Math.exp(-logOdds));
  
  // Calculate confidence based on distance from 0.5
  const confidence = Math.abs(probability - 0.5) * 2;
  
  // Calculate feature importance (simplified)
  const featureImportance = calculateFeatureImportanceForPrediction(calibratedModel.model, x);
  
  return {
    probability: Math.max(0, Math.min(1, probability)),
    confidence: Math.max(0, Math.min(1, confidence)),
    featureImportance
  };
}

/**
 * Fit Platt scaling parameters
 */
function fitPlattScaling(predictions: number[], targets: number[]): { A: number; B: number } {
  // Simple implementation using gradient descent
  let A = 1;
  let B = 0;
  const learningRate = 0.01;
  const iterations = 100;
  
  for (let iter = 0; iter < iterations; iter++) {
    let gradA = 0;
    let gradB = 0;
    
    for (let i = 0; i < predictions.length; i++) {
      const f = predictions[i];
      const y = targets[i];
      const p = 1 / (1 + Math.exp(-(A * f + B)));
      
      const error = p - y;
      gradA += error * f;
      gradB += error;
    }
    
    A -= learningRate * gradA / predictions.length;
    B -= learningRate * gradB / predictions.length;
  }
  
  return { A, B };
}

/**
 * Calculate feature importance for a single prediction
 */
function calculateFeatureImportanceForPrediction(
  model: RandomForestModel, 
  x: number[]
): { name: string; importance: number }[] {
  
  const featureUsage = new Array(model.nFeatures).fill(0);
  
  // Count how often each feature is used in the prediction path
  for (const tree of model.trees) {
    const path = getDecisionPath(tree, x);
    for (const node of path) {
      if (node.feature >= 0) {
        featureUsage[node.feature]++;
      }
    }
  }
  
  // Normalize and create importance array
  const maxUsage = Math.max(...featureUsage, 1);
  return featureUsage.map((usage, i) => ({
    name: model.featureNames[i] || `feature_${i}`,
    importance: usage / maxUsage
  })).sort((a, b) => b.importance - a.importance);
}

/**
 * Get decision path for a prediction
 */
function getDecisionPath(tree: DecisionTree, x: number[]): DecisionTree[] {
  const path: DecisionTree[] = [tree];
  
  if (tree.prediction !== undefined) {
    return path;
  }
  
  if (x[tree.feature] <= tree.threshold && tree.left) {
    path.push(...getDecisionPath(tree.left, x));
  } else if (tree.right) {
    path.push(...getDecisionPath(tree.right, x));
  }
  
  return path;
}

// Utility functions
function bootstrapSample(X: number[][], y: number[]): { X_boot: number[][]; y_boot: number[] } {
  const n = X.length;
  const X_boot: number[][] = [];
  const y_boot: number[] = [];
  
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * n);
    X_boot.push(X[idx].slice());
    y_boot.push(y[idx]);
  }
  
  return { X_boot, y_boot };
}

function randomSubset(n: number, k: number): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  const result: number[] = [];
  
  for (let i = 0; i < k; i++) {
    const randomIndex = Math.floor(Math.random() * indices.length);
    result.push(indices.splice(randomIndex, 1)[0]);
  }
  
  return result.sort((a, b) => a - b);
}

function splitData(X: number[][], y: number[], feature: number, threshold: number) {
  const leftX: number[][] = [];
  const leftY: number[] = [];
  const rightX: number[][] = [];
  const rightY: number[] = [];
  
  for (let i = 0; i < X.length; i++) {
    if (X[i][feature] <= threshold) {
      leftX.push(X[i]);
      leftY.push(y[i]);
    } else {
      rightX.push(X[i]);
      rightY.push(y[i]);
    }
  }
  
  return { leftX, leftY, rightX, rightY };
}

function isPure(y: number[]): boolean {
  if (y.length === 0) return true;
  const first = y[0];
  return y.every(val => Math.abs(val - first) < 1e-6);
}

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = calculateMean(values);
  return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
}
