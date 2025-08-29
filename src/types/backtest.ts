/**
 * TypeScript types for Backtest Results
 * 
 * These types match our Python BacktestRunner output and Rust Tauri backend,
 * ensuring type safety across the entire application stack.
 */

export interface BacktestResult {
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
