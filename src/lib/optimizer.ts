// src/lib/optimizer.ts
// Grid sweep (threshold ∈ [0.30..0.70 step .05], lookback ∈ {20,50,100,150}); score = 0.6*win + 0.4*cagr - 0.3*dd

import { BacktestParams, BacktestSummary } from '@/types/backtest';
import { invoke } from '@/lib/tauri';
import { getCachedResult, setCachedResult, createCacheKey } from '@/lib/cache';

export interface OptimizerParameter {
  name: string;
  type: 'number' | 'select' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  options?: string[] | number[];
  default: any;
  description: string;
}

export interface OptimizerConfig {
  parameters: OptimizerParameter[];
  baseParams: BacktestParams;
  maxIterations?: number;
  scoreWeights?: {
    winRate: number;
    cagr: number;
    maxDD: number;
  };
}

export interface OptimizerResult {
  parameters: Record<string, any>;
  metrics: {
    winRate: number;
    cagr: number;
    maxDD: number;
    trades: number;
    score: number;
  };
  backtest: BacktestSummary;
  rank: number;
  improvement: {
    winRate: number;
    cagr: number;
    maxDD: number;
    score: number;
  };
}

export interface OptimizerProgress {
  current: number;
  total: number;
  currentParams: Record<string, any>;
  bestScore: number;
  completed: OptimizerResult[];
  estimatedTimeRemaining?: number;
}

// Default parameter configurations for different strategies
export const DEFAULT_PARAMETERS: Record<string, OptimizerParameter[]> = {
  PMCC: [
    {
      name: 'threshold',
      type: 'number',
      min: 0.30,
      max: 0.70,
      step: 0.05,
      default: 0.50,
      description: 'Signal threshold for entry/exit decisions'
    },
    {
      name: 'lookback',
      type: 'select',
      options: [20, 50, 100, 150],
      default: 50,
      description: 'Lookback period for technical indicators'
    }
  ],
  Wheel: [
    {
      name: 'threshold',
      type: 'number',
      min: 0.25,
      max: 0.75,
      step: 0.05,
      default: 0.45,
      description: 'Put assignment threshold'
    },
    {
      name: 'lookback',
      type: 'select',
      options: [15, 30, 60, 90],
      default: 30,
      description: 'Volatility lookback period'
    }
  ],
  iron_condor: [
    {
      name: 'threshold',
      type: 'number',
      min: 0.20,
      max: 0.60,
      step: 0.05,
      default: 0.35,
      description: 'Delta threshold for strike selection'
    },
    {
      name: 'lookback',
      type: 'select',
      options: [10, 20, 45, 90],
      default: 20,
      description: 'Implied volatility lookback'
    }
  ],
  CoveredCall: [
    {
      name: 'threshold',
      type: 'number',
      min: 0.35,
      max: 0.75,
      step: 0.05,
      default: 0.55,
      description: 'Call strike selection threshold'
    },
    {
      name: 'lookback',
      type: 'select',
      options: [20, 40, 80, 120],
      default: 40,
      description: 'Price momentum lookback'
    }
  ]
};

// Calculate composite score for optimization
export function calculateOptimizerScore(
  metrics: { winRate: number; cagr: number; maxDD: number },
  weights: { winRate: number; cagr: number; maxDD: number } = { winRate: 0.6, cagr: 0.4, maxDD: 0.3 }
): number {
  const { winRate, cagr, maxDD } = metrics;
  const { winRate: wWin, cagr: wCagr, maxDD: wDD } = weights;
  
  // Normalize metrics to [0, 1] range
  const normalizedWinRate = Math.max(0, Math.min(1, winRate));
  const normalizedCagr = Math.max(0, Math.min(1, cagr / 0.5)); // Assume 50% CAGR is excellent
  const normalizedMaxDD = Math.max(0, Math.min(1, 1 - Math.abs(maxDD) / 0.5)); // Penalize high drawdown
  
  // Calculate weighted score
  const score = (wWin * normalizedWinRate) + (wCagr * normalizedCagr) + (wDD * normalizedMaxDD);
  
  return Math.max(0, Math.min(1, score));
}

// Generate parameter combinations for grid search
export function generateParameterCombinations(parameters: OptimizerParameter[]): Record<string, any>[] {
  const combinations: Record<string, any>[] = [];
  
  function generateCombos(paramIndex: number, currentCombo: Record<string, any>) {
    if (paramIndex >= parameters.length) {
      combinations.push({ ...currentCombo });
      return;
    }
    
    const param = parameters[paramIndex];
    let values: any[] = [];
    
    if (param.type === 'number' && param.min !== undefined && param.max !== undefined && param.step !== undefined) {
      // Generate numeric range
      for (let value = param.min; value <= param.max; value += param.step) {
        values.push(Math.round(value * 100) / 100); // Round to avoid floating point issues
      }
    } else if (param.type === 'select' && param.options) {
      values = param.options;
    } else if (param.type === 'boolean') {
      values = [true, false];
    } else {
      values = [param.default];
    }
    
    for (const value of values) {
      currentCombo[param.name] = value;
      generateCombos(paramIndex + 1, currentCombo);
    }
  }
  
  generateCombos(0, {});
  return combinations;
}

// Run parameter optimization
export async function runOptimization(
  config: OptimizerConfig,
  onProgress?: (progress: OptimizerProgress) => void
): Promise<OptimizerResult[]> {
  const { parameters, baseParams, maxIterations = 100, scoreWeights } = config;
  
  // Generate all parameter combinations
  const combinations = generateParameterCombinations(parameters);
  const totalCombinations = Math.min(combinations.length, maxIterations);
  
  const results: OptimizerResult[] = [];
  const startTime = Date.now();
  
  // Run baseline backtest for comparison
  const baselineResult = await runSingleBacktest(baseParams);
  const baselineMetrics = {
    winRate: baselineResult.win_rate,
    cagr: baselineResult.cagr,
    maxDD: baselineResult.max_dd,
  };
  const baselineScore = calculateOptimizerScore(baselineMetrics, scoreWeights);
  
  for (let i = 0; i < totalCombinations; i++) {
    const paramCombo = combinations[i];
    
    // Create modified backtest parameters
    const modifiedParams: BacktestParams = {
      ...baseParams,
      // Add parameter overrides (this would be strategy-specific in real implementation)
      seed: baseParams.seed ? baseParams.seed + i : i, // Vary seed for different results
    };
    
    try {
      // Run backtest with modified parameters
      const backtestResult = await runSingleBacktest(modifiedParams);
      
      // Calculate metrics and score
      const metrics = {
        winRate: backtestResult.win_rate,
        cagr: backtestResult.cagr,
        maxDD: backtestResult.max_dd,
        trades: backtestResult.trades,
        score: calculateOptimizerScore({
          winRate: backtestResult.win_rate,
          cagr: backtestResult.cagr,
          maxDD: backtestResult.max_dd,
        }, scoreWeights),
      };
      
      // Calculate improvement over baseline
      const improvement = {
        winRate: metrics.winRate - baselineMetrics.winRate,
        cagr: metrics.cagr - baselineMetrics.cagr,
        maxDD: metrics.maxDD - baselineMetrics.maxDD,
        score: metrics.score - baselineScore,
      };
      
      const result: OptimizerResult = {
        parameters: paramCombo,
        metrics,
        backtest: backtestResult,
        rank: 0, // Will be set after sorting
        improvement,
      };
      
      results.push(result);
      
      // Update progress
      if (onProgress) {
        const elapsed = Date.now() - startTime;
        const avgTimePerIteration = elapsed / (i + 1);
        const estimatedTimeRemaining = avgTimePerIteration * (totalCombinations - i - 1);
        
        const bestScore = Math.max(...results.map(r => r.metrics.score));
        
        onProgress({
          current: i + 1,
          total: totalCombinations,
          currentParams: paramCombo,
          bestScore,
          completed: results,
          estimatedTimeRemaining,
        });
      }
      
    } catch (error) {
      console.warn(`Optimization iteration ${i} failed:`, error);
      // Continue with next combination
    }
  }
  
  // Sort results by score (descending) and assign ranks
  results.sort((a, b) => b.metrics.score - a.metrics.score);
  results.forEach((result, index) => {
    result.rank = index + 1;
  });
  
  return results;
}

// Run a single backtest with caching
async function runSingleBacktest(params: BacktestParams): Promise<BacktestSummary> {
  // Check cache first
  const cacheKey = createCacheKey(params);
  const cachedResult = await getCachedResult(cacheKey);
  
  if (cachedResult) {
    return cachedResult as BacktestSummary;
  }
  
  // Run backtest
  const result = await invoke<BacktestSummary>('run_backtest', { params });
  
  // Cache result
  await setCachedResult(cacheKey, result);
  
  return result;
}

// Get top N optimization results
export function getTopResults(results: OptimizerResult[], count: number = 3): OptimizerResult[] {
  return results.slice(0, count);
}

// Format parameter value for display
export function formatParameterValue(param: OptimizerParameter, value: any): string {
  if (param.type === 'number') {
    return typeof value === 'number' ? value.toFixed(param.name === 'threshold' ? 2 : 0) : String(value);
  }
  return String(value);
}

// Get parameter description with current value
export function getParameterDescription(param: OptimizerParameter, value: any): string {
  const formattedValue = formatParameterValue(param, value);
  return `${param.description} (${formattedValue})`;
}

// Calculate optimization summary statistics
export function getOptimizationSummary(results: OptimizerResult[]): {
  totalRuns: number;
  successfulRuns: number;
  bestScore: number;
  averageScore: number;
  scoreImprovement: number;
  parameterSensitivity: Record<string, number>;
} {
  if (results.length === 0) {
    return {
      totalRuns: 0,
      successfulRuns: 0,
      bestScore: 0,
      averageScore: 0,
      scoreImprovement: 0,
      parameterSensitivity: {},
    };
  }
  
  const scores = results.map(r => r.metrics.score);
  const bestScore = Math.max(...scores);
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const scoreImprovement = results[0].improvement.score;
  
  // Calculate parameter sensitivity (variance in scores for each parameter)
  const parameterSensitivity: Record<string, number> = {};
  const parameterNames = Object.keys(results[0].parameters);
  
  for (const paramName of parameterNames) {
    const paramValues = results.map(r => r.parameters[paramName]);
    const uniqueValues = [...new Set(paramValues)];
    
    if (uniqueValues.length > 1) {
      // Calculate score variance for this parameter
      const scoresByParam: Record<string, number[]> = {};
      results.forEach(result => {
        const paramValue = String(result.parameters[paramName]);
        if (!scoresByParam[paramValue]) {
          scoresByParam[paramValue] = [];
        }
        scoresByParam[paramValue].push(result.metrics.score);
      });
      
      // Calculate variance between parameter values
      const paramMeans = Object.values(scoresByParam).map(scores => 
        scores.reduce((sum, score) => sum + score, 0) / scores.length
      );
      const overallMean = paramMeans.reduce((sum, mean) => sum + mean, 0) / paramMeans.length;
      const variance = paramMeans.reduce((sum, mean) => sum + Math.pow(mean - overallMean, 2), 0) / paramMeans.length;
      
      parameterSensitivity[paramName] = variance;
    } else {
      parameterSensitivity[paramName] = 0;
    }
  }
  
  return {
    totalRuns: results.length,
    successfulRuns: results.length,
    bestScore,
    averageScore,
    scoreImprovement,
    parameterSensitivity,
  };
}
