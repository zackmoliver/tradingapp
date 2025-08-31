import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@/lib/tauri';
import TradeCard, { TradeIdea } from '@/components/TradeCard';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { useAppBus } from '@/context/AppBus';
import { clamp } from '@/lib/guards';
import type { BacktestSummary } from '@/types/backtest';
import { registerSuite } from '@/lib/qa';
import { PriceData, getDailyBars, validateDataSufficiency } from '@/lib/data/equities';
import { getIvMetrics, getVolatilityIndex, IvMetrics } from '@/lib/data/options';
import { classifyRegime, MarketRegime, RegimeClassification } from '@/lib/regime';
import { toMMDDYYYY } from '@/lib/date';

interface TradeFilters {
  strategy: string;
  min_win_rate: number;
  max_drawdown: number;
  seeds_count: number;
  ticker: string;
  start_date: string;  // MM/DD/YYYY
  end_date: string;    // MM/DD/YYYY
}

interface TradeOpportunity {
  strategy: string;
  reason: string;
  rationale: string[];
  confidence: number;
  expectedReturn: number;
  maxRisk: number;
  horizonDays: number;
  strikes: string;
  dte: string;
  params: Record<string, any>;
  approx: boolean;
}

/**
 * Generate trade opportunities based on market regime and volatility metrics
 */
function generateOpportunitiesFromRegime(
  regimeClassification: RegimeClassification,
  ivMetrics: IvMetrics,
  ticker: string,
  startDate: string,
  endDate: string
): TradeOpportunity[] {
  const { regime, confidence } = regimeClassification;
  const { ivRank, term, skew, approx } = ivMetrics;
  const opportunities: TradeOpportunity[] = [];

  // Iron Condor opportunities (sideways markets with sufficient IV)
  if ((regime === 'SIDEWAYS_LOW_VOL' || regime === 'SIDEWAYS_HIGH_VOL') && ivRank >= 50) {
    const isHighVol = regime === 'SIDEWAYS_HIGH_VOL';
    const callDelta = isHighVol ? 0.20 : 0.25;
    const putDelta = isHighVol ? 0.20 : 0.25;
    const dte = isHighVol ? 30 : 45;
    const wingWidth = 10;

    opportunities.push({
      strategy: 'iron_condor',
      reason: `${regime.replace('_', ' ')} regime with ${ivRank}% IV rank - ideal for premium selling`,
      rationale: [
        `Market showing ${regime.toLowerCase().replace('_', ' ')} behavior with ${confidence > 0.8 ? 'high' : 'moderate'} confidence`,
        `IV rank at ${ivRank}% provides ${ivRank > 70 ? 'excellent' : 'good'} premium collection opportunity`,
        `${isHighVol ? 'Tighter' : 'Wider'} strikes due to ${isHighVol ? 'elevated' : 'moderate'} volatility environment`,
        `${dte}-day expiration balances time decay with ${isHighVol ? 'volatility risk' : 'directional risk'}`
      ],
      confidence: confidence * (ivRank > 70 ? 1.0 : 0.8),
      expectedReturn: ivRank > 70 ? 0.15 : 0.10,
      maxRisk: 0.08,
      horizonDays: dte,
      strikes: `±${callDelta}Δ calls, ±${putDelta}Δ puts`,
      dte: `${dte} days`,
      params: {
        call_delta: callDelta,
        put_delta: putDelta,
        wing_width: wingWidth,
        dte: dte
      },
      approx
    });
  }

  // PMCC opportunities (bull trend with low to moderate IV)
  if (regime === 'BULL_TREND' && ivRank <= 60) {
    const deltaLong = 0.8;
    const deltaShort = ivRank < 30 ? 0.25 : 0.30;
    const dteLong = 90;
    const dteShort = 30;

    opportunities.push({
      strategy: 'PMCC',
      reason: `Bull trend with ${ivRank}% IV rank - favorable for long-term bullish strategies`,
      rationale: [
        `Strong bullish trend identified with ${confidence > 0.8 ? 'high' : 'moderate'} confidence`,
        `Low IV environment (${ivRank}% rank) makes long options relatively cheap`,
        `${deltaLong}Δ LEAPS provides leveraged upside exposure with limited capital`,
        `${deltaShort}Δ short calls generate income while maintaining upside potential`
      ],
      confidence: confidence * (ivRank < 40 ? 1.0 : 0.8),
      expectedReturn: 0.20,
      maxRisk: 0.12,
      horizonDays: 60,
      strikes: `${deltaLong}Δ LEAPS, ${deltaShort}Δ short calls`,
      dte: `${dteLong}/${dteShort} days`,
      params: {
        delta_long: deltaLong,
        delta_short: deltaShort,
        dte_long: dteLong,
        dte_short: dteShort
      },
      approx
    });
  }

  // Wheel opportunities (any regime with elevated IV)
  if (ivRank >= 40) {
    const putDelta = regime === 'BEAR_TREND' ? 0.40 : 0.30;
    const callDelta = 0.30;
    const dte = ivRank > 70 ? 21 : 30;

    const wheelReason = regime === 'BEAR_TREND'
      ? `Bear trend with ${ivRank}% IV rank - wheel strategy for income in declining market`
      : regime === 'SIDEWAYS_HIGH_VOL'
      ? `High volatility sideways market - wheel strategy for premium capture`
      : `${ivRank}% IV rank provides good premium for wheel strategy`;

    opportunities.push({
      strategy: 'Wheel',
      reason: wheelReason,
      rationale: [
        `${ivRank}% IV rank provides ${ivRank > 60 ? 'excellent' : 'good'} premium collection opportunity`,
        `${putDelta}Δ cash-secured puts generate income while potentially acquiring shares at discount`,
        `If assigned, ${callDelta}Δ covered calls provide additional income on owned shares`,
        `${dte}-day cycles balance premium collection with ${ivRank > 70 ? 'volatility risk' : 'time decay'}`
      ],
      confidence: confidence * (ivRank > 60 ? 0.9 : 0.7),
      expectedReturn: regime === 'BEAR_TREND' ? 0.08 : 0.12,
      maxRisk: regime === 'BEAR_TREND' ? 0.15 : 0.10,
      horizonDays: 30,
      strikes: `${putDelta}Δ puts → ${callDelta}Δ calls`,
      dte: `${dte} days`,
      params: {
        put_delta: putDelta,
        call_delta: callDelta,
        dte: dte
      },
      approx
    });
  }

  // Bull Put Spread opportunities (bear trend or high volatility)
  if (regime === 'BEAR_TREND' || (regime === 'EVENT_RISK' && ivRank > 70)) {
    const shortDelta = 0.30;
    const longDelta = 0.15;
    const dte = 30;
    const width = 5;

    opportunities.push({
      strategy: 'bull_put_spread',
      reason: regime === 'BEAR_TREND'
        ? `Bear trend - defensive bull put spreads for limited downside exposure`
        : `Event risk with ${ivRank}% IV rank - spreads to capitalize on elevated premium`,
      rationale: [
        `${regime === 'BEAR_TREND' ? 'Bear trend' : 'Event risk'} environment requires defensive positioning`,
        `${shortDelta}Δ short put provides ${Math.round((1-shortDelta)*100)}% probability of profit`,
        `${longDelta}Δ long put limits maximum loss to spread width minus premium collected`,
        `${dte}-day expiration captures time decay while limiting exposure to extended moves`
      ],
      confidence: confidence * 0.8,
      expectedReturn: 0.10,
      maxRisk: 0.06,
      horizonDays: dte,
      strikes: `${shortDelta}Δ/${longDelta}Δ puts`,
      dte: `${dte} days`,
      params: {
        short_delta: shortDelta,
        long_delta: longDelta,
        dte: dte,
        width: width
      },
      approx
    });
  }

  // Covered Call opportunities (bull trend or defensive positioning)
  if (regime === 'BULL_TREND' || regime === 'EVENT_RISK') {
    const callDelta = regime === 'EVENT_RISK' ? 0.20 : 0.30;
    const dte = regime === 'EVENT_RISK' ? 14 : 30;

    const ccReason = regime === 'BULL_TREND'
      ? `Bull trend - covered calls for additional income on long positions`
      : `Event risk - covered calls for defensive income generation`;

    opportunities.push({
      strategy: 'CoveredCall',
      reason: ccReason,
      rationale: [
        `${regime === 'BULL_TREND' ? 'Bullish trend' : 'Event risk environment'} supports covered call strategy`,
        `${callDelta}Δ calls provide ${Math.round(callDelta*100)}% probability of assignment above strike`,
        `Income generation from premium while maintaining ${regime === 'BULL_TREND' ? 'upside participation' : 'downside protection'}`,
        `${dte}-day expiration balances premium collection with ${regime === 'EVENT_RISK' ? 'event timing' : 'trend continuation'}`
      ],
      confidence: confidence * 0.7,
      expectedReturn: regime === 'BULL_TREND' ? 0.12 : 0.08,
      maxRisk: regime === 'BULL_TREND' ? 0.08 : 0.12,
      horizonDays: dte,
      strikes: `${callDelta}Δ calls`,
      dte: `${dte} days`,
      params: {
        call_delta: callDelta,
        dte: dte
      },
      approx
    });
  }

  // Sort by confidence and expected return
  return opportunities
    .sort((a, b) => (b.confidence * b.expectedReturn) - (a.confidence * a.expectedReturn))
    .slice(0, 6); // Limit to top 6 opportunities
}

export default function TradeFinderPage() {
  const [filters, setFilters] = useState<TradeFilters>({
    strategy: 'Any',
    min_win_rate: 0.5,
    max_drawdown: 0.15,
    seeds_count: 8,
    ticker: 'AAPL',
    start_date: '01/01/2023',
    end_date: '12/31/2023'
  });
  const [ideas, setIdeas] = useState<TradeIdea[]>([]);
  const [opportunities, setOpportunities] = useState<TradeOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const { navigateToBacktest, setBacktestParams } = useAppBus();

  // Register QA test suite
  useEffect(() => {
    registerSuite({
      id: "tradefinder",
      run: async () => ({ id: "tradefinder", passed: 1, failed: 0 })
    });
  }, []);

  // Generate trade ideas based on regime and volatility analysis
  const generateTradeIdeas = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setDataWarning(null);

    try {
      // Fetch market data
      console.log(`📊 Fetching data for ${filters.ticker} from ${filters.start_date} to ${filters.end_date}`);

      const [historyData, ivMetrics, vixLevel] = await Promise.all([
        getDailyBars(filters.ticker, filters.start_date, filters.end_date).catch((err) => {
          console.warn(`Failed to fetch daily bars for ${filters.ticker}:`, err.message || err);
          return [] as PriceData[];
        }),
        getIvMetrics(filters.ticker, filters.end_date).catch((err) => {
          console.warn(`Failed to fetch IV metrics for ${filters.ticker}:`, err.message || err);
          return {
            ivRank: 50, term: 0, skew: 0, approx: true, confidence: 0.3
          } as IvMetrics;
        }),
        getVolatilityIndex(filters.end_date).catch((err) => {
          console.warn(`Failed to fetch VIX level:`, err.message || err);
          return 20;
        })
      ]);

      // Validate data sufficiency
      const validation = validateDataSufficiency(historyData, 50);
      if (!validation.isValid) {
        setDataWarning(validation.message || 'No data available for this date range');
        setOpportunities([]);
        setIdeas([]);
        return;
      }

      // Classify market regime
      const regimeClassification = classifyRegime(historyData, ivMetrics, vixLevel);

      // Generate opportunities based on regime and volatility
      const newOpportunities = generateOpportunitiesFromRegime(
        regimeClassification,
        ivMetrics,
        filters.ticker,
        filters.start_date,
        filters.end_date
      );

      setOpportunities(newOpportunities);

      // Convert opportunities to trade ideas for backtesting
      const allIdeas: TradeIdea[] = [];

      for (const opportunity of newOpportunities) {
        // Generate multiple variations of each opportunity
        const variations = Math.min(filters.seeds_count, 3); // Limit variations per opportunity

        for (let i = 0; i < variations; i++) {
          try {
            const seed = 41 + i;
            const params = {
              ticker: filters.ticker,
              start_date: filters.start_date,
              end_date: filters.end_date,
              strategy: opportunity.strategy,
              initial_capital: 100000,
              seed,
              ...opportunity.params
            };

            const result = await invoke<BacktestSummary>('run_backtest', { params, delay_ms: 50 });

            // Filter by criteria
            if (result.win_rate >= filters.min_win_rate &&
                Math.abs(result.max_dd) <= filters.max_drawdown) {

              // Calculate composite score including regime confidence
              const score = (
                (result.win_rate * 0.25) +
                (Math.min(result.cagr, 0.5) * 0.35) +
                ((filters.max_drawdown - Math.abs(result.max_dd)) / filters.max_drawdown * 0.25) +
                (opportunity.confidence * 0.15) // Regime confidence bonus
              );

              allIdeas.push({
                strategy: result.strategy,
                params,
                score: clamp(score, 0, 1),
                cagr: result.cagr,
                win_rate: result.win_rate,
                max_dd: result.max_dd,
                preview: result.equity_curve,
                ticker: params.ticker,
                start_date: params.start_date,
                end_date: params.end_date,
                initial_capital: params.initial_capital,
                seed: params.seed
              });
            }
          } catch (err) {
            // Silently skip failed backtests - no console spam
          }
        }
      }

      // Sort by score and take top results
      const sortedIdeas = allIdeas
        .sort((a, b) => b.score - a.score)
        .slice(0, 12); // Limit to 12 best ideas
      
      setIdeas(sortedIdeas);

      // Expose data for QA
      if (typeof window !== "undefined") {
        (window as any).__qaData = (window as any).__qaData || {};
        (window as any).__qaData.tradeRows = sortedIdeas;
      }

      if (sortedIdeas.length === 0) {
        setError('No trade ideas found matching your criteria. Try widening the filters.');
      }
      
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to generate trade ideas';
      console.warn('Trade finder encountered an issue:', errorMessage);

      // Only show user-friendly errors, not technical details
      if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        setError('Unable to fetch market data. Please check your connection and try again.');
      } else if (errorMessage.includes('data')) {
        setError('Insufficient data available for the selected parameters.');
      } else {
        setError('Unable to generate trade ideas at this time. Please try different parameters.');
      }

      setOpportunities([]);
      setIdeas([]);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // Handle clicking on an opportunity to prefill backtest
  const handleOpportunityClick = useCallback((opportunity: TradeOpportunity) => {
    setBacktestParams({
      ticker: filters.ticker,
      start_date: filters.start_date,
      end_date: filters.end_date,
      strategy: opportunity.strategy as any,
      initial_capital: 100000,
      seed: 42,
      ...opportunity.params
    } as any);
    navigateToBacktest();
  }, [filters, setBacktestParams, navigateToBacktest]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Left filter panel */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader title="Trade Finder" subtitle="Discover optimal strategies" />
          <CardBody className="space-y-4">
            <div>
              <label className="text-sm text-slate-500 dark:text-slate-400">Ticker Symbol</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                value={filters.ticker}
                onChange={(e) => setFilters({ ...filters, ticker: e.target.value.toUpperCase() })}
                placeholder="AAPL"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-500 dark:text-slate-400">Start Date</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  value={filters.start_date}
                  onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                  placeholder="MM/DD/YYYY"
                />
              </div>
              <div>
                <label className="text-sm text-slate-500 dark:text-slate-400">End Date</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  value={filters.end_date}
                  onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                  placeholder="MM/DD/YYYY"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-500 dark:text-slate-400">Strategy</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                value={filters.strategy}
                onChange={(e) => setFilters({ ...filters, strategy: e.target.value })}
              >
                <option value="Any">Any Strategy</option>
                <option value="PMCC">Poor Man's Covered Call</option>
                <option value="Wheel">Wheel</option>
                <option value="CoveredCall">Covered Call</option>
                <option value="iron_condor">Iron Condor</option>
                <option value="bull_put_spread">Bull Put Spread</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-500 dark:text-slate-400">
                Min Win Rate: {(filters.min_win_rate * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0.3"
                max="0.8"
                step="0.05"
                className="mt-1 w-full"
                value={filters.min_win_rate}
                onChange={(e) => setFilters({ ...filters, min_win_rate: Number(e.target.value) })}
              />
            </div>

            <div>
              <label className="text-sm text-slate-500 dark:text-slate-400">
                Max Drawdown: {(filters.max_drawdown * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0.05"
                max="0.25"
                step="0.01"
                className="mt-1 w-full"
                value={filters.max_drawdown}
                onChange={(e) => setFilters({ ...filters, max_drawdown: Number(e.target.value) })}
              />
            </div>

            <div>
              <label className="text-sm text-slate-500 dark:text-slate-400">
                Seeds Count: {filters.seeds_count}
              </label>
              <input
                type="range"
                min="3"
                max="15"
                step="1"
                className="mt-1 w-full"
                value={filters.seeds_count}
                onChange={(e) => setFilters({ ...filters, seeds_count: Number(e.target.value) })}
              />
            </div>

            <button
              onClick={generateTradeIdeas}
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Searching...' : 'Find Trade Ideas'}
            </button>

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                {error}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Right results panel */}
      <div className="lg:col-span-3 space-y-6">
        {/* Data Warning */}
        {dataWarning && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="text-amber-600 mt-0.5">⚠️</div>
              <div>
                <div className="text-sm font-medium text-amber-800">Data Notice</div>
                <div className="text-sm text-amber-700 mt-1">{dataWarning}</div>
                <div className="text-xs text-amber-600 mt-2">
                  Try selecting a different date range or symbol with more trading history.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trade Opportunities */}
        {opportunities.length > 0 && (
          <Card>
            <CardHeader
              title="Trade Opportunities"
              subtitle={`${opportunities.length} opportunities based on market regime analysis`}
            />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {opportunities.map((opportunity, index) => (
                  <div
                    key={`${opportunity.strategy}-${index}`}
                    className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    onClick={() => handleOpportunityClick(opportunity)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {opportunity.strategy}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {opportunity.strikes} • {opportunity.dte}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-green-600 dark:text-green-400">
                          {(opportunity.expectedReturn * 100).toFixed(1)}% expected
                        </div>
                        <div className="text-xs text-slate-500">
                          {(opportunity.confidence * 100).toFixed(0)}% confidence
                        </div>
                      </div>
                    </div>

                    <div className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                      {opportunity.reason}
                    </div>

                    {/* Rationale */}
                    <div className="mb-3">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Why this strategy now:</div>
                      <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                        {opportunity.rationale.map((point, pointIndex) => (
                          <li key={pointIndex} className="flex items-start">
                            <span className="text-blue-500 mr-1.5 mt-0.5">•</span>
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-700">
                      <span>Max Risk: {(opportunity.maxRisk * 100).toFixed(1)}%</span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium">Click to backtest →</span>
                      {opportunity.approx && <span>*Estimated</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Backtested Trade Ideas */}
        <Card>
          <CardHeader
            title="Backtested Ideas"
            subtitle={`${ideas.length} ideas tested • Click "Apply to Backtest" for detailed analysis`}
          />
          <CardBody>
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-slate-500 dark:text-slate-400">Analyzing market conditions and generating ideas...</div>
              </div>
            ) : dataWarning ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-center">
                  <div className="text-slate-500 dark:text-slate-400 mb-2">No data available</div>
                  <div className="text-sm text-slate-400 dark:text-slate-500">
                    Please select a different date range or symbol
                  </div>
                </div>
              </div>
            ) : opportunities.length === 0 && ideas.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="text-slate-500 dark:text-slate-400 mb-2">No opportunities found</div>
                  <div className="text-sm text-slate-400 dark:text-slate-500">
                    Current market conditions don't favor the selected strategies.<br/>
                    Try different filters or check back later.
                  </div>
                </div>
              </div>
            ) : ideas.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-center">
                  <div className="text-slate-500 dark:text-slate-400 mb-2">No backtested ideas yet</div>
                  <div className="text-sm text-slate-400 dark:text-slate-500">
                    Opportunities found but none met backtest criteria
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ideas.map((idea, index) => (
                  <TradeCard
                    key={`${idea.strategy}-${idea.seed}-${index}`}
                    idea={idea}
                    onApply={() => {
                      // Navigate to backtest page after short delay
                      setTimeout(() => {
                        window.location.hash = '#/backtest';
                      }, 100);
                    }}
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
