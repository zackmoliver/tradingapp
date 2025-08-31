// src/lib/benchmark.ts
// Benchmark generation and performance analytics

import { BacktestPoint } from '@/types/backtest';
import { parseMMDDYYYY, toMMDDYYYY } from '@/lib/date';

export interface BenchmarkPoint {
  t: string; // MM/DD/YYYY
  equity: number;
}

export interface BenchmarkMetrics {
  alpha: number; // Annualized alpha (excess return)
  beta: number; // Beta coefficient
  correlation: number; // Correlation coefficient
  tracking_error: number; // Annualized tracking error
  information_ratio: number; // Information ratio
  sharpe_benchmark: number; // Benchmark Sharpe ratio
  sharpe_portfolio: number; // Portfolio Sharpe ratio
}

/**
 * Generate deterministic benchmark series (SPY-like)
 * Uses a simple random walk with realistic market parameters
 */
export function generateBenchmark(
  startDate: string, 
  endDate: string, 
  initialValue: number = 100000,
  seed: number = 42
): BenchmarkPoint[] {
  const start = parseMMDDYYYY(startDate);
  const end = parseMMDDYYYY(endDate);
  
  if (start >= end) return [];

  // Simple seeded random number generator for deterministic results
  let seedValue = seed;
  const random = () => {
    seedValue = (seedValue * 9301 + 49297) % 233280;
    return seedValue / 233280;
  };

  const points: BenchmarkPoint[] = [];
  let currentDate = new Date(start);
  let currentValue = initialValue;

  // Market parameters (SPY-like characteristics)
  const annualReturn = 0.10; // 10% annual return
  const annualVolatility = 0.16; // 16% annual volatility
  const dailyReturn = annualReturn / 252;
  const dailyVolatility = annualVolatility / Math.sqrt(252);

  while (currentDate <= end) {
    // Skip weekends (simple approximation)
    if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
      // Generate daily return using Box-Muller transform for normal distribution
      const u1 = random();
      const u2 = random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      
      const dailyChange = dailyReturn + (dailyVolatility * z0);
      currentValue *= (1 + dailyChange);

      points.push({
        t: toMMDDYYYY(currentDate),
        equity: currentValue
      });
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return points;
}

/**
 * Calculate alpha and beta vs benchmark
 * Uses linear regression: portfolio_return = alpha + beta * benchmark_return + error
 */
export function calculateAlphaBeta(
  portfolioPoints: BacktestPoint[],
  benchmarkPoints: BenchmarkPoint[]
): BenchmarkMetrics {
  if (portfolioPoints.length < 2 || benchmarkPoints.length < 2) {
    return {
      alpha: 0,
      beta: 1,
      correlation: 0,
      tracking_error: 0,
      information_ratio: 0,
      sharpe_benchmark: 0,
      sharpe_portfolio: 0
    };
  }

  // Align dates and calculate returns
  const alignedData = alignDataPoints(portfolioPoints, benchmarkPoints);
  
  if (alignedData.length < 2) {
    return {
      alpha: 0,
      beta: 1,
      correlation: 0,
      tracking_error: 0,
      information_ratio: 0,
      sharpe_benchmark: 0,
      sharpe_portfolio: 0
    };
  }

  const portfolioReturns = calculateReturns(alignedData.map(d => d.portfolio));
  const benchmarkReturns = calculateReturns(alignedData.map(d => d.benchmark));

  if (portfolioReturns.length === 0 || benchmarkReturns.length === 0) {
    return {
      alpha: 0,
      beta: 1,
      correlation: 0,
      tracking_error: 0,
      information_ratio: 0,
      sharpe_benchmark: 0,
      sharpe_portfolio: 0
    };
  }

  // Calculate statistics
  const portfolioMean = mean(portfolioReturns);
  const benchmarkMean = mean(benchmarkReturns);
  const portfolioStd = standardDeviation(portfolioReturns);
  const benchmarkStd = standardDeviation(benchmarkReturns);
  
  // Calculate covariance and correlation
  const covariance = calculateCovariance(portfolioReturns, benchmarkReturns);
  const correlation = benchmarkStd > 0 ? covariance / (portfolioStd * benchmarkStd) : 0;
  
  // Calculate beta
  const benchmarkVariance = benchmarkStd * benchmarkStd;
  const beta = benchmarkVariance > 0 ? covariance / benchmarkVariance : 1;
  
  // Calculate alpha (annualized)
  const alpha = (portfolioMean - beta * benchmarkMean) * 252;
  
  // Calculate tracking error (annualized)
  const excessReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
  const trackingError = standardDeviation(excessReturns) * Math.sqrt(252);
  
  // Calculate information ratio
  const informationRatio = trackingError > 0 ? (mean(excessReturns) * 252) / trackingError : 0;
  
  // Calculate Sharpe ratios (assuming risk-free rate = 0)
  const sharpePortfolio = portfolioStd > 0 ? (portfolioMean * 252) / (portfolioStd * Math.sqrt(252)) : 0;
  const sharpeBenchmark = benchmarkStd > 0 ? (benchmarkMean * 252) / (benchmarkStd * Math.sqrt(252)) : 0;

  return {
    alpha,
    beta,
    correlation,
    tracking_error: trackingError,
    information_ratio: informationRatio,
    sharpe_benchmark: sharpeBenchmark,
    sharpe_portfolio: sharpePortfolio
  };
}

/**
 * Align portfolio and benchmark data points by date
 */
function alignDataPoints(
  portfolioPoints: BacktestPoint[],
  benchmarkPoints: BenchmarkPoint[]
): Array<{ date: string; portfolio: number; benchmark: number }> {
  const benchmarkMap = new Map<string, number>();
  benchmarkPoints.forEach(point => {
    benchmarkMap.set(point.t, point.equity);
  });

  const aligned: Array<{ date: string; portfolio: number; benchmark: number }> = [];
  
  for (const portfolioPoint of portfolioPoints) {
    const benchmarkValue = benchmarkMap.get(portfolioPoint.t);
    if (benchmarkValue !== undefined) {
      aligned.push({
        date: portfolioPoint.t,
        portfolio: portfolioPoint.equity,
        benchmark: benchmarkValue
      });
    }
  }

  return aligned;
}

/**
 * Calculate returns from price series
 */
function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  return returns;
}

/**
 * Calculate mean of array
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate covariance between two series
 */
function calculateCovariance(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  
  const meanX = mean(x);
  const meanY = mean(y);
  
  let covariance = 0;
  for (let i = 0; i < x.length; i++) {
    covariance += (x[i] - meanX) * (y[i] - meanY);
  }
  
  return covariance / x.length;
}

/**
 * Generate benchmark for a given portfolio to match its date range
 */
export function generateMatchingBenchmark(
  portfolioPoints: BacktestPoint[],
  initialValue?: number
): BenchmarkPoint[] {
  if (portfolioPoints.length === 0) return [];
  
  const startDate = portfolioPoints[0].t;
  const endDate = portfolioPoints[portfolioPoints.length - 1].t;
  const benchmarkInitial = initialValue || portfolioPoints[0].equity;
  
  return generateBenchmark(startDate, endDate, benchmarkInitial);
}

/**
 * Format benchmark metrics for display
 */
export function formatBenchmarkMetrics(metrics: BenchmarkMetrics): {
  alpha: string;
  beta: string;
  correlation: string;
  trackingError: string;
  informationRatio: string;
} {
  return {
    alpha: `${(metrics.alpha * 100).toFixed(2)}%`,
    beta: metrics.beta.toFixed(3),
    correlation: metrics.correlation.toFixed(3),
    trackingError: `${(metrics.tracking_error * 100).toFixed(2)}%`,
    informationRatio: metrics.information_ratio.toFixed(3)
  };
}

/**
 * Get color for alpha/beta values
 */
export function getMetricColor(value: number, metricType: 'alpha' | 'beta' | 'correlation' | 'ir'): string {
  switch (metricType) {
    case 'alpha':
      return value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
    case 'beta':
      // Beta close to 1 is neutral, higher is more volatile
      if (value >= 0.9 && value <= 1.1) return 'text-slate-600 dark:text-slate-400';
      return value > 1.1 ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400';
    case 'correlation':
      return Math.abs(value) > 0.7 ? 'text-green-600 dark:text-green-400' : 'text-slate-600 dark:text-slate-400';
    case 'ir':
      return value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
    default:
      return 'text-slate-600 dark:text-slate-400';
  }
}
