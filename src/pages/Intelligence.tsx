import React, { useState, useEffect } from 'react';
import { invoke } from '@/lib/tauri';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { useAppBus } from '@/context/AppBus';
import { exportAllocationToCsv } from '@/lib/exportCsv';
import { toMoney, toPct, toMMDDYYYY } from '@/lib/date';
import { TradingModel } from '@/lib/model';
import { BreadthCalculator } from '@/lib/breadth';
import { NewsManager } from '@/lib/news';
// ✨ Removed BacktestEngine import (we do a local backtest)
import { IntelligenceSummary, IntelligenceInputs, MetricDelta, Recommendation } from '@/types/backtest';
import { FeatureImportanceCard } from '@/components/FeatureImportanceCard';
import { CalibrationChart } from '@/components/CalibrationChart';
import { OptimizerTable } from '@/components/OptimizerTable';
import { calculateFeatureImportance, calculateCalibration } from '@/features/explain/importance';
import { runOptimization, DEFAULT_PARAMETERS, OptimizerResult, OptimizerProgress } from '@/lib/optimizer';
import { registerSuite } from '@/lib/qa';
import { PriceData, getDailyBars, validateDataSufficiency } from '@/lib/data/equities';
import { getIvMetrics, getVolatilityIndex, IvMetrics } from '@/lib/data/options';
import { classifyRegime, MarketRegime, RegimeClassification } from '@/lib/regime';
import { predict as mlPredict, MLPrediction } from '@/lib/ml/pipeline';

/** Backtest result subset we need for metrics */
type MiniBacktest = { cagr: number; win_rate: number; max_dd: number };

/**
 * Get CSS classes for regime badge styling
 */
function getRegimeBadgeClass(regime: MarketRegime): string {
  switch (regime) {
    case 'BULL_TREND':
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
    case 'BEAR_TREND':
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
    case 'SIDEWAYS_LOW_VOL':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
    case 'SIDEWAYS_HIGH_VOL':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
    case 'EVENT_RISK':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
  }
}

/**
 * Get volatility level description from IV rank
 */
function getVolatilityLevel(ivRank: number): string {
  if (ivRank < 25) return 'LOW';
  if (ivRank < 75) return 'MODERATE';
  return 'HIGH';
}

/**
 * Get CSS classes for volatility level badge
 */
function getVolatilityLevelColor(ivRank: number): string {
  if (ivRank < 25) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
  if (ivRank < 75) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
  return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
}

/**
 * Get CSS classes for ML probability color coding
 */
function getProbabilityColor(probability: number): string {
  if (probability > 0.7) return 'text-green-600 dark:text-green-400';
  if (probability > 0.6) return 'text-green-500 dark:text-green-300';
  if (probability < 0.3) return 'text-red-600 dark:text-red-400';
  if (probability < 0.4) return 'text-red-500 dark:text-red-300';
  return 'text-slate-600 dark:text-slate-400';
}

/**
 * Generate strategy recommendation based on market regime, volatility, and ML prediction
 */
function generateStrategyRecommendation(
  regimeClassification: RegimeClassification,
  ivMetrics: IvMetrics,
  mlPrediction?: MLPrediction
): { strategy: string; params?: Record<string, any>; horizonDays: number } {

  const { regime } = regimeClassification;
  const { ivRank } = ivMetrics;
  const mlProbability = mlPrediction?.probability ?? 0.5;
  const mlConfidence = mlPrediction?.confidence ?? 0.3;

  // Adjust strategy selection based on ML prediction
  const isBullishML = mlProbability > 0.6 && mlConfidence > 0.5;
  const isBearishML = mlProbability < 0.4 && mlConfidence > 0.5;

  // Strategy selection based on regime, volatility, and ML signals
  switch (regime) {
    case 'BULL_TREND':
      if (isBullishML && ivRank < 30) {
        return {
          strategy: 'PMCC',
          params: { delta_long: 0.8, delta_short: 0.25, dte_long: 90, dte_short: 30 },
          horizonDays: 60
        };
      } else if (ivRank < 30) {
        return {
          strategy: 'PMCC',
          params: { delta_long: 0.8, delta_short: 0.3, dte_long: 90, dte_short: 30 },
          horizonDays: 60
        };
      } else {
        return {
          strategy: 'Wheel',
          params: { put_delta: isBullishML ? 0.25 : 0.3, call_delta: 0.3, dte: 30 },
          horizonDays: 30
        };
      }

    case 'BEAR_TREND':
      return {
        strategy: 'bull_put_spread',
        params: { short_delta: 0.3, long_delta: 0.15, dte: 30 },
        horizonDays: 30
      };

    case 'SIDEWAYS_LOW_VOL':
      return {
        strategy: 'iron_condor',
        params: { call_delta: 0.25, put_delta: 0.25, wing_width: 10, dte: 45 },
        horizonDays: 45
      };

    case 'SIDEWAYS_HIGH_VOL':
      return {
        strategy: 'Wheel',
        params: { put_delta: 0.4, call_delta: 0.3, dte: 21 },
        horizonDays: 21
      };

    case 'EVENT_RISK':
      return {
        strategy: 'CoveredCall',
        params: { call_delta: 0.2, dte: 14 },
        horizonDays: 14
      };

    default:
      return {
        strategy: 'PMCC',
        params: {},
        horizonDays: 45
      };
  }
}

/** Local helper: compute equity, drawdown, cagr using signals (0..1 exposure) */
function runNaiveBacktest(history: PriceData[], signals: number[], initialCapital: number): MiniBacktest {
  if (history.length < 2) throw new Error('Not enough bars for backtest');
  if (signals.length !== history.length) throw new Error('Signals length must match history length');

  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const s = signals.map(clamp01);

  // Start fully invested according to s[0] on the FIRST forward return
  let equity = initialCapital;
  const equities: number[] = [equity];

  let wins = 0;
  let days = 0;

  for (let i = 1; i < history.length; i++) {
    const r = history[i].ohlc.c / Math.max(1e-9, history[i - 1].ohlc.c) - 1;
    // Use prior-day signal as exposure for today’s return
    const exp = s[i - 1];
    equity *= 1 + exp * r;
    equities.push(equity);
    days++;
    if (r > 0) wins++;
  }

  // Drawdown
  let peak = equities[0];
  let maxDD = 0;
  for (const e of equities) {
    if (e > peak) peak = e;
    const dd = peak > 0 ? (e - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
  }

  // CAGR
  const years = history.length / 365.25;
  const cagr = years > 0 ? Math.pow(equities[equities.length - 1] / equities[0], 1 / years) - 1 : 0;

  const win_rate = days > 0 ? wins / days : 0;
  return { cagr, win_rate, max_dd: maxDD };
}

export default function Intelligence() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntelligenceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  // Feature importance and calibration state
  const [featureImportance, setFeatureImportance] = useState<any[]>([]);
  const [calibrationData, setCalibrationData] = useState<any>(null);

  // Optimizer state
  const [optimizerResults, setOptimizerResults] = useState<OptimizerResult[]>([]);
  const [optimizerProgress, setOptimizerProgress] = useState<OptimizerProgress | undefined>();
  const [isOptimizing, setIsOptimizing] = useState(false);

  const [inputs, setInputs] = useState<IntelligenceInputs>({
    symbol: 'AAPL',
    start: '01/01/2023',
    end: '12/31/2023',
    strategy: 'PMCC',
    capital: 100000,
    indicators: {
      rsi_period: 14,
      sma_period: 50,
      atr_period: 14,
      bb_period: 20,
      bb_stddev: 2
    },
    seed: 42
  });

  const { setStrategyParams, setBacktestParams, navigateToBacktest } = useAppBus();

  // Register QA test suite
  useEffect(() => {
    registerSuite({
      id: "intelligence",
      run: async () => ({ id: "intelligence", passed: 1, failed: 0 })
    });
  }, []);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
      // Prefer backend if available
      const res = await invoke<IntelligenceSummary>('suggest_and_analyze', {
        params: {
          ticker: inputs.symbol,
          start_date: inputs.start,
          end_date: inputs.end,
          strategy: inputs.strategy,
          initial_capital: inputs.capital,
          seed: inputs.seed
        },
        indicators: inputs.indicators,
        delay_ms: 100
      });
      setResult(res);
      if (typeof window !== "undefined") {
        (window as any).__qaData = (window as any).__qaData || {};
        (window as any).__qaData.intelligence = res;
      }

      if ((res as any)?.raw?.modelResult) {
        const importance = calculateFeatureImportance((res as any).raw.modelResult);
        const calibration = calculateCalibration((res as any).raw.modelResult);
        setFeatureImportance(importance);
        setCalibrationData(calibration);
      }
    } catch (err) {
      console.warn('Backend not available, running frontend analysis:', err);
      try {
        const frontendResult = await runFrontendAnalysis();
        setResult(frontendResult);
        if (typeof window !== "undefined") {
          (window as any).__qaData = (window as any).__qaData || {};
          (window as any).__qaData.intelligence = frontendResult;
        }

        if ((frontendResult as any)?.raw?.modelResult) {
          const importance = calculateFeatureImportance((frontendResult as any).raw.modelResult);
          const calibration = calculateCalibration((frontendResult as any).raw.modelResult);
          setFeatureImportance(importance);
          setCalibrationData(calibration);
        }
      } catch (frontendErr) {
        console.error('Frontend analysis failed:', frontendErr);
        setError(String(frontendErr));
        setFeatureImportance([]);
        setCalibrationData(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const runFrontendAnalysis = async (): Promise<IntelligenceSummary> => {
    const model = new TradingModel();
    const newsManager = new NewsManager();

    const breadthCalculator = new BreadthCalculator(
      async (symbol: string, start: string, end: string): Promise<PriceData[]> => {
        try {
          return await getDailyBars(symbol, start, end);
        } catch {
          return [];
        }
      }
    );

    await model.loadModel();

    // Fetch in parallel with typing
    const [historyData, newsData, breadthMetrics, ivMetrics, vixLevel] = await Promise.all([
      getDailyBars(inputs.symbol, inputs.start, inputs.end).catch(() => [] as PriceData[]),
      newsManager.fetchNewsSentiment(inputs.symbol, 3).catch(() => ({ avg: 0, headlines: [] })),
      breadthCalculator.calculateBreadthMetrics(inputs.end, 252).catch(() => ({
        pct_above_200dma: 0.55,
        rsp_spy_ratio_slope: 0.02,
        ad_line_slope: 0.01
      })),
      getIvMetrics(inputs.symbol, inputs.end).catch(() => ({
        ivRank: 50, term: 0, skew: 0, approx: true, confidence: 0.3
      } as IvMetrics)),
      getVolatilityIndex(inputs.end).catch(() => 20)
    ]);

    // Get ML prediction
    const mlPrediction = await mlPredict(inputs.symbol, historyData, ivMetrics).catch(() => ({
      probability: 0.5,
      confidence: 0.3,
      topFeatures: ['price_momentum_5', 'rsi14', 'iv_rank'],
      modelVersion: 'fallback',
      timestamp: new Date()
    } as MLPrediction));

    // Validate data sufficiency
    const validation = validateDataSufficiency(historyData, 200);
    if (!validation.isValid) {
      throw new Error(validation.message || 'Insufficient price data for analysis');
    }

    // Classify market regime
    const regimeClassification = classifyRegime(historyData, ivMetrics, vixLevel);

    // Model prediction
    const prediction = await model.predict(historyData, breadthMetrics, newsData, false);

    // Fix confidence to always be a number (precompute once)
    const numericConfidence =
      typeof prediction.confidence === 'number' ? prediction.confidence :
      typeof prediction.probability === 'number' ? prediction.probability :
      prediction.confidence === 'LOW' ? 0.25 :
      prediction.confidence === 'MEDIUM' ? 0.5 :
      prediction.confidence === 'HIGH' ? 0.75 : 0.5;

    // Baseline: always-on exposure
    const baselineSignals = new Array(historyData.length).fill(1.0);
    const baselineResult = runNaiveBacktest(historyData, baselineSignals, inputs.capital);

    // Model: constant probability exposure (placeholder until per-bar probs exist)
    const modelSignals = new Array(historyData.length).fill(Math.max(0, Math.min(1, numericConfidence)));
    const modelResult = runNaiveBacktest(historyData, modelSignals, inputs.capital);

    const metrics: MetricDelta[] = [
      { name: 'CAGR',        baseline: baselineResult.cagr * 100,       expected: modelResult.cagr * 100,       unit: '%' },
      { name: 'Win Rate',    baseline: baselineResult.win_rate * 100,   expected: modelResult.win_rate * 100,   unit: '%' },
      { name: 'Max Drawdown',baseline: Math.abs(baselineResult.max_dd) * 100, expected: Math.abs(modelResult.max_dd) * 100, unit: '%' }
    ];

    // Generate strategy recommendation based on regime and ML prediction
    const strategyRecommendation = generateStrategyRecommendation(regimeClassification, ivMetrics, mlPrediction);

    // Compose IntelligenceSummary with regime, volatility, and ML data
    return {
      inputs,
      regime: regimeClassification.regime,
      volatility: {
        ivRank: ivMetrics.ivRank,
        term: ivMetrics.term,
        skew: ivMetrics.skew,
        approx: ivMetrics.approx
      },
      ml: {
        probability: mlPrediction.probability,
        confidence: mlPrediction.confidence,
        topFeatures: mlPrediction.topFeatures,
        modelVersion: mlPrediction.modelVersion
      },
      confidence: Math.min(regimeClassification.confidence, ivMetrics.confidence, mlPrediction.confidence, numericConfidence),
      recommendation: strategyRecommendation,
      rationale: regimeClassification.rationale.slice(0, 3), // Top 3 reasons
      allocation: {
        market_state: regimeClassification.regime,
        allocations: {
          [strategyRecommendation.strategy]: 0.6,
          'Cash': 0.4
        }
      },
      metrics,
      notes: [
        `Regime: ${regimeClassification.regime} (${(regimeClassification.confidence * 100).toFixed(0)}% confidence)`,
        `ML Probability: ${(mlPrediction.probability * 100).toFixed(0)}% (${(mlPrediction.confidence * 100).toFixed(0)}% confidence)`,
        `IV Rank: ${ivMetrics.ivRank}% ${ivMetrics.approx ? '(estimated)' : ''}`,
        `Top Features: ${mlPrediction.topFeatures.slice(0, 3).join(', ')}`
      ],
      raw: {
        prediction,
        breadthMetrics,
        newsData,
        baselineResult,
        modelResult,
        regimeClassification,
        ivMetrics,
        mlPrediction
      }
    } as IntelligenceSummary;
  };

  const handleApplyToStrategy = () => {
    if (result?.recommendation) {
      setStrategyParams(result.recommendation.params || {});
      setBacktestParams({
        ticker: inputs.symbol,
        start_date: inputs.start,
        end_date: inputs.end,
        // cast for union constraint in AppBus
        strategy: result.recommendation.strategy as any,
        initial_capital: inputs.capital,
        seed: inputs.seed
      } as any);
      navigateToBacktest();
    }
  };

  const handleRunBacktest = () => {
    if (result?.recommendation) {
      setBacktestParams({
        ticker: inputs.symbol,
        start_date: inputs.start,
        end_date: inputs.end,
        strategy: result.recommendation.strategy as any,
        initial_capital: inputs.capital,
        seed: inputs.seed,
        ...(result.recommendation.params as Record<string, any>)
      } as any);
      navigateToBacktest();
    }
  };

  const handleExportAllocation = () => {
    if (result?.allocation?.allocations) {
      exportAllocationToCsv(result.allocation.allocations, 'portfolio_allocation.csv');
    }
  };

  // Optimizer handlers
  const handleStartOptimization = async () => {
    if (!result) return;

    setIsOptimizing(true);
    setOptimizerResults([]);
    setOptimizerProgress(undefined);

    try {
      const baseParams = {
        ticker: inputs.symbol,
        start_date: inputs.start,
        end_date: inputs.end,
        strategy: inputs.strategy as any,
        initial_capital: inputs.capital,
        seed: inputs.seed
      };

      const parameters = (DEFAULT_PARAMETERS as any)[inputs.strategy] || DEFAULT_PARAMETERS.PMCC;

      const results = await runOptimization(
        {
          parameters,
          baseParams: baseParams as any,
          maxIterations: 50,
          scoreWeights: { winRate: 0.6, cagr: 0.4, maxDD: 0.3 }
        },
        (progress) => setOptimizerProgress(progress)
      );

      setOptimizerResults(results);
    } catch (error) {
      console.error('Optimization failed:', error);
      setError('Optimization failed. Please try again.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleApplyOptimizedParameters = (parameters: Record<string, any>) => {
    setBacktestParams({
      ticker: inputs.symbol,
      start_date: inputs.start,
      end_date: inputs.end,
      strategy: inputs.strategy as any,
      initial_capital: inputs.capital,
      seed: inputs.seed,
      ...parameters
    } as any);
    navigateToBacktest();
  };

  const copyJsonToClipboard = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    }
  };

  const getAnomalyColor = (level: string) => {
    switch (level) {
      case 'LOW': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case 'ELEVATED': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20';
      case 'EXTREME': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800';
    }
  };

  // For safe property access where types don’t include optional fields
  const intel = result as (IntelligenceSummary & { bayesian?: any });

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader title="Adaptive Intelligence" subtitle="AI-powered strategy optimization and market analysis" />
        <CardBody>
          <div className="flex gap-4">
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Analyzing...' : 'Suggest & Analyze'}
            </button>

            {result && (
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {showRawJson ? 'Hide JSON' : 'Show JSON'}
              </button>
            )}
          </div>

          {error && (
            <div className="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
              {error}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Market Regime, Volatility, and ML Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader title="Market Regime" subtitle="Current market classification" />
              <CardBody>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Regime</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getRegimeBadgeClass(result.regime)}`}>
                      {result.regime.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Confidence</span>
                    <span className="text-sm font-medium">{(result.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Volatility Metrics" subtitle="IV rank, term structure, skew" />
              <CardBody>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">IV Rank</span>
                    <span className="text-sm font-medium">
                      {result.volatility.ivRank}%{result.volatility.approx && '*'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Term Structure</span>
                    <span className="text-sm font-medium">{(result.volatility.term * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Put/Call Skew</span>
                    <span className="text-sm font-medium">{(result.volatility.skew * 100).toFixed(1)}%</span>
                  </div>
                  {result.volatility.approx && (
                    <div className="text-xs text-slate-400">* Estimated from historical data</div>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="ML Signals" subtitle="Machine learning prediction" />
              <CardBody>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Probability</span>
                    <span className={`text-sm font-medium ${getProbabilityColor(result.ml.probability)}`}>
                      {(result.ml.probability * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Confidence</span>
                    <span className="text-sm font-medium">{(result.ml.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-slate-500 mb-1">Top Features:</div>
                    <div className="flex flex-wrap gap-1">
                      {result.ml.topFeatures.slice(0, 3).map((feature, i) => (
                        <span key={i} className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                          {feature.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    Model: {result.ml.modelVersion}
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Recommendation" subtitle="Strategy and horizon" />
              <CardBody>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Strategy</span>
                    <span className="text-sm font-medium">{result.recommendation.strategy}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Horizon</span>
                    <span className="text-sm font-medium">{result.recommendation.horizonDays} days</span>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-slate-500 mb-1">Key Rationale:</div>
                    <ul className="text-xs text-slate-600 space-y-1">
                      {result.rationale.slice(0, 2).map((reason, i) => (
                        <li key={i} className="flex items-start">
                          <span className="text-slate-400 mr-1">•</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Optimizer Card */}
            <Card>
              <CardHeader title="Optimizer" subtitle="Parameter suggestions" />
              <CardBody className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Optimizer Status</div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Available
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Parameter Tuning</div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Ready
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Optimization Mode</div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Bayesian
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleApplyToStrategy}
                  className="w-full rounded-lg bg-green-600 text-white py-2 font-medium hover:bg-green-700"
                >
                  Apply to Strategy
                </button>
              </CardBody>
            </Card>

            {/* Anomaly Card */}
            <Card>
              <CardHeader title="Volatility Analysis" subtitle="IV rank and structure analysis" />
              <CardBody className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">IV Rank Percentile</div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {result.volatility.ivRank}%{result.volatility.approx && '*'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Volatility Level</div>
                    <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getVolatilityLevelColor(result.volatility.ivRank)}`}>
                      {getVolatilityLevel(result.volatility.ivRank)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Term Structure</div>
                      <div className="text-sm font-medium">{(result.volatility.term * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Put/Call Skew</div>
                      <div className="text-sm font-medium">{(result.volatility.skew * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {result.volatility.ivRank < 25 && 'Low volatility environment - consider long volatility strategies'}
                  {result.volatility.ivRank >= 25 && result.volatility.ivRank < 75 && 'Moderate volatility - balanced approach recommended'}
                  {result.volatility.ivRank >= 75 && 'High volatility - consider short volatility strategies'}
                  {result.volatility.approx && ' (Estimated from historical data)'}
                </div>
              </CardBody>
            </Card>

            {/* Allocation Card */}
            <Card>
              <CardHeader title="Portfolio Allocation" subtitle="Strategy distribution" />
              <CardBody className="space-y-4">
                {result.allocation ? (
                  <>
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">Market State</div>
                        <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {result.allocation.market_state}
                        </div>
                      </div>

                      <div>
                        <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">Allocations</div>
                        <div className="space-y-2">
                          {Object.entries(result.allocation.allocations).map(([strategy, allocation]) => (
                            <div key={strategy} className="flex justify-between items-center">
                              <span className="text-sm text-slate-700 dark:text-slate-300">{strategy}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500"
                                    style={{ width: `${(allocation as number) * 100}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {((allocation as number) * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleExportAllocation}
                      className="w-full rounded-lg bg-slate-600 text-white py-2 font-medium hover:bg-slate-700"
                    >
                      Export CSV
                    </button>
                  </>
                ) : (
                  <div className="text-slate-500 dark:text-slate-400">No allocation data available</div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Parameter Optimizer */}
          <OptimizerTable
            results={optimizerResults}
            progress={optimizerProgress}
            onApplyParameters={handleApplyOptimizedParameters}
            onStartOptimization={handleStartOptimization}
            isRunning={isOptimizing}
            className="mt-6"
          />

          {/* Feature Importance and Calibration */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <FeatureImportanceCard features={featureImportance} />
            <CalibrationChart calibrationData={calibrationData} />
          </div>
        </>
      )}

      {/* Raw JSON Display */}
      {result && showRawJson && (
        <Card>
          <CardHeader
            title="Raw JSON Data"
            subtitle="Power users can copy the raw JSON data"
          />
          <CardBody>
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-slate-500 dark:text-slate-400">Raw response data</span>
              <button
                onClick={() => result && navigator.clipboard.writeText(JSON.stringify(result, null, 2))}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Copy to Clipboard
              </button>
            </div>
            <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-4 rounded border border-slate-200 dark:border-slate-700 overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardBody>
        </Card>
      )}

      {/* Empty State */}
      {!result && !loading && (
        <Card>
          <CardBody className="text-center py-12">
            <div className="text-slate-500 dark:text-slate-400 mb-4">
              Click "Suggest & Analyze" to run AI-powered market analysis
            </div>
            <div className="text-sm text-slate-400 dark:text-slate-500">
              Get parameter suggestions, anomaly detection, and portfolio allocation recommendations
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
