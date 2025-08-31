/**
 * TypeScript types for Backtest Results
 *
 * These types match our Rust Tauri backend structure,
 * ensuring type safety across the entire application stack.
 * Updated for Tauri v2.4.0 compatibility.
 */

// Simple structure matching Rust backend
export interface BacktestPoint {
  t: string;           // Date in MM/DD/YYYY format
  equity: number;      // Portfolio value
  drawdown: number;    // Drawdown percentage
}

export interface Trade {
  date: string; // MM/DD/YYYY
  side: 'BUY' | 'SELL' | 'COVER' | 'ASSIGN';
  qty: number;
  price: number;
  pnl: number;
  cum_pnl: number;
  note?: string;
}

export interface BacktestSummary {
  strategy: string;
  symbol: string;      // Added to match Rust struct
  start: string;       // MM/DD/YYYY format
  end: string;         // MM/DD/YYYY format
  capital: number;     // Added to match Rust struct
  trades: number;
  win_rate: number;    // 0.0 to 1.0
  cagr: number;        // Compound Annual Growth Rate
  max_dd: number;      // Maximum drawdown (negative value)

  // Enhanced metrics from new backtest engine
  sharpe?: number;     // Sharpe ratio (legacy)
  sortino?: number;    // Sortino ratio (legacy)
  profit_factor?: number; // Profit factor (legacy)

  // New enhanced metrics
  sharpeRatio?: number;        // Enhanced Sharpe ratio
  sortinoRatio?: number;       // Enhanced Sortino ratio
  profitFactor?: number;       // Enhanced profit factor
  calmarRatio?: number;        // CAGR / Max Drawdown
  var95?: number;              // Value at Risk (95%)
  expectedShortfall?: number;  // Conditional VaR
  statisticalPower?: number;   // Statistical significance (0-1)
  volatility?: number;         // Annualized volatility

  // Trade statistics
  totalTrades?: number;        // Total number of trades
  winningTrades?: number;      // Number of winning trades
  losingTrades?: number;       // Number of losing trades
  avgWin?: number;             // Average winning trade
  avgLoss?: number;            // Average losing trade

  equity_curve: BacktestPoint[];
  trade_log?: Trade[]; // Individual trades
  warning?: string;    // Optional warning message for data issues
  warnings?: string[]; // Multiple statistical warnings
}

export interface IntelligenceInputs {
  symbol: string;
  start: string; // MM/DD/YYYY
  end: string;   // MM/DD/YYYY
  strategy: string;
  capital: number;
  indicators: Record<string, number | boolean>;
  seed: number;
}

export interface MetricDelta {
  name: 'Win Rate' | 'CAGR' | 'Max Drawdown';
  baseline: number;
  expected: number;
  unit: '%';
}

export interface Recommendation {
  parameters: Record<string, number | string | boolean>;
  rationale: string[];
  confidence: number; // 0-1
  estimated: {
    win_rate: number;
    cagr: number;
    max_dd: number;
  };
}

export interface IntelligenceSummary {
  inputs: IntelligenceInputs;
  regime: 'BULL_TREND' | 'BEAR_TREND' | 'SIDEWAYS_LOW_VOL' | 'SIDEWAYS_HIGH_VOL' | 'EVENT_RISK';
  volatility: {
    ivRank: number;      // 0-100 percentile
    term: number;        // Term structure slope
    skew: number;        // Put/call skew
    approx: boolean;     // True if estimated
  };
  ml: {
    probability: number;   // 0-1 ML probability
    confidence: number;    // 0-1 ML confidence
    topFeatures: string[]; // Top 5 features
    modelVersion: string;  // Model version
  };
  confidence: number;    // 0-1 overall confidence in analysis
  recommendation: {
    strategy: string;
    params?: Record<string, any>;
    horizonDays: number;
  };
  rationale: string[];   // Top 3 reasons for recommendation
  allocation?: {
    market_state: string;
    allocations: Record<string, number>;
  };
  metrics?: MetricDelta[];
  notes?: string[];
  raw?: any;
}

// For compatibility with existing components
export interface BacktestResult extends Omit<BacktestSummary, 'equity_curve'> {
  run_id: string;
  strategy_id: string;
  execution_info: ExecutionInfo;
  performance_summary: PerformanceSummary;
  equity_curve: EquityCurve;
  trade_summary: TradeSummary;
  attribution: Attribution;
  risk_metrics: RiskMetrics;
  drawdown_analysis?: DrawdownAnalysis;
  monthly_returns?: MonthlyReturns;
  metadata: Record<string, any>;
}

export interface ExecutionInfo {
  start_date: string;
  end_date: string;
  duration_days: number;
  total_bars: number;
  execution_time_seconds: number;
  initial_capital: number;
  final_capital: number;
  currency: string;
}

export interface PerformanceSummary {
  total_return: number;
  annualized_return: number;
  volatility: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  max_drawdown: number;
  max_drawdown_duration_days: number;
}

export interface EquityCurve {
  data_points: EquityPoint[];
}

export interface EquityPoint {
  date: string;
  portfolio_value: number;
  cumulative_return: number;
}

export interface TradeSummary {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_factor: number;
  average_win: number;
  average_loss: number;
  largest_win: number;
  largest_loss: number;
}

export interface Attribution {
  by_symbol: Record<string, AttributionItem>;
  by_strategy: Record<string, AttributionItem>;
  by_sector: Record<string, AttributionItem>;
}

export interface AttributionItem {
  total_return: number;
  contribution: number;
}

export interface RiskMetrics {
  value_at_risk_95: number;
  conditional_var_95: number;
  beta: number;
  correlation_to_benchmark: number;
  tracking_error: number;
  information_ratio: number;
}

export interface DrawdownAnalysis {
  max_drawdown: number;
  max_drawdown_duration_days: number;
  recovery_time_days: number;
  drawdown_periods: DrawdownPeriod[];
}

export interface DrawdownPeriod {
  start_date: string;
  end_date: string;
  duration_days: number;
  max_drawdown: number;
}

export interface MonthlyReturns {
  returns: Record<string, number>;
  statistics: MonthlyReturnStats;
}

export interface MonthlyReturnStats {
  best_month: number;
  worst_month: number;
  positive_months: number;
  negative_months: number;
}

// UI-specific types
export interface PerformanceMetricTile {
  title: string;
  value: string | number;
  format: 'percentage' | 'currency' | 'number' | 'ratio';
  trend?: 'up' | 'down' | 'neutral';
  description?: string;
  color?: 'success' | 'danger' | 'warning' | 'neutral';
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

// Backtest parameters for run_backtest command
export interface BacktestParams {
  ticker: string;
  start_date: string;    // MM/DD/YYYY format
  end_date: string;      // MM/DD/YYYY format
  strategy: 'PMCC' | 'Wheel' | 'CoveredCall' | 'iron_condor' | 'bull_put_spread';
  seed?: number;         // For deterministic results
  initial_capital: number;
}

// Strategy options for the UI
export const STRATEGY_OPTIONS = [
  { value: 'PMCC' as const,        label: "Poor Man's Covered Call" },
  { value: 'Wheel' as const,       label: "The Wheel Strategy" },
  { value: 'CoveredCall' as const, label: "Covered Call" },
  { value: 'iron_condor' as const, label: "Iron Condor" },
  { value: 'bull_put_spread' as const, label: "Bull Put Spread" },
];

export type StrategyType = typeof STRATEGY_OPTIONS[number]['value'];

// Strategy configuration types
export interface StrategyConfig {
  strategy_id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  risk_parameters: Record<string, any>;
}

// Backtest configuration types
export interface BacktestConfig {
  start_date: string;
  end_date: string;
  initial_capital: number;
  symbols: string[];
  benchmark_symbol?: string;
  commission_per_trade?: number;
  slippage_bps?: number;
  max_positions?: number;
  risk_free_rate?: number;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Loading states
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  data: T | null;
  loading: LoadingState;
  error: string | null;
}

// Trade Finder types
export interface TradeResult {
  date: string;
  symbol: string;
  strategy: string;
  entry: number;
  exit: number;
  pl: number;
  win: boolean;
}

export interface TradeFilters {
  symbol?: string;
  startDate?: string;
  endDate?: string;
  strategy?: string;
  minWinRate?: number;
  maxDrawdown?: number;
}
