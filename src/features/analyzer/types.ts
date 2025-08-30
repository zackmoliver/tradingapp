export interface IndicatorParams {
  // RSI
  rsi_length?: number;
  
  // MACD
  macd_fast?: number;
  macd_slow?: number;
  macd_signal?: number;
  
  // ADX
  adx_length?: number;
  
  // Bollinger Bands
  bb_length?: number;
  bb_stddev?: number;
  
  // VWAP
  vwap_session_reset?: 'daily' | 'weekly' | 'monthly';
  
  // SMAs
  sma_50?: number;
  sma_200?: number;
  
  // Ichimoku
  ichimoku_conversion?: number;
  ichimoku_base?: number;
  ichimoku_span_b?: number;
  ichimoku_displacement?: number;
}

export interface AnalyzerProfile {
  name: string;
  description: string;
  enabledIndicators: string[];
  params: IndicatorParams;
}

export interface AnalyzerState {
  enabledIndicators: string[];
  params: IndicatorParams;
  profile: string | null;
}

export interface BacktestResult {
  strategy_id: string;
  symbol: string;
  start_date: string;
  end_date: string;
  total_return: number;
  cagr: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
  equity_curve: Array<{
    date: string;
    value: number;
  }>;
  trades: Array<{
    entry_date: string;
    exit_date: string;
    pnl: number;
    return_pct: number;
  }>;
}

export interface ABTestResult {
  profileA: {
    name: string;
    result: BacktestResult;
  };
  profileB: {
    name: string;
    result: BacktestResult;
  };
  comparison: {
    cagr_diff: number;
    sharpe_diff: number;
    max_dd_diff: number;
    win_rate_diff: number;
  };
}

export interface IndicatorConfig {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  params: Array<{
    key: keyof IndicatorParams;
    label: string;
    type: 'number' | 'select';
    min?: number;
    max?: number;
    step?: number;
    default: number | string;
    options?: Array<{ value: string | number; label: string }>;
  }>;
}

export const AVAILABLE_INDICATORS: IndicatorConfig[] = [
  {
    id: 'rsi',
    name: 'RSI',
    description: 'Relative Strength Index',
    defaultEnabled: true,
    params: [
      {
        key: 'rsi_length',
        label: 'Period',
        type: 'number',
        min: 5,
        max: 50,
        step: 1,
        default: 14
      }
    ]
  },
  {
    id: 'macd',
    name: 'MACD',
    description: 'Moving Average Convergence Divergence',
    defaultEnabled: true,
    params: [
      {
        key: 'macd_fast',
        label: 'Fast Period',
        type: 'number',
        min: 5,
        max: 30,
        step: 1,
        default: 12
      },
      {
        key: 'macd_slow',
        label: 'Slow Period',
        type: 'number',
        min: 15,
        max: 50,
        step: 1,
        default: 26
      },
      {
        key: 'macd_signal',
        label: 'Signal Period',
        type: 'number',
        min: 5,
        max: 20,
        step: 1,
        default: 9
      }
    ]
  },
  {
    id: 'adx',
    name: 'ADX',
    description: 'Average Directional Index',
    defaultEnabled: false,
    params: [
      {
        key: 'adx_length',
        label: 'Period',
        type: 'number',
        min: 10,
        max: 30,
        step: 1,
        default: 14
      }
    ]
  },
  {
    id: 'bbands',
    name: 'Bollinger Bands',
    description: 'Bollinger Bands',
    defaultEnabled: false,
    params: [
      {
        key: 'bb_length',
        label: 'Period',
        type: 'number',
        min: 10,
        max: 50,
        step: 1,
        default: 20
      },
      {
        key: 'bb_stddev',
        label: 'Standard Deviation',
        type: 'number',
        min: 1,
        max: 3,
        step: 0.1,
        default: 2
      }
    ]
  },
  {
    id: 'vwap',
    name: 'VWAP',
    description: 'Volume Weighted Average Price',
    defaultEnabled: false,
    params: [
      {
        key: 'vwap_session_reset',
        label: 'Session Reset',
        type: 'select',
        default: 'daily',
        options: [
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' }
        ]
      }
    ]
  },
  {
    id: 'sma_50',
    name: '50 SMA',
    description: '50-period Simple Moving Average',
    defaultEnabled: true,
    params: [
      {
        key: 'sma_50',
        label: 'Period',
        type: 'number',
        min: 20,
        max: 100,
        step: 1,
        default: 50
      }
    ]
  },
  {
    id: 'sma_200',
    name: '200 SMA',
    description: '200-period Simple Moving Average',
    defaultEnabled: true,
    params: [
      {
        key: 'sma_200',
        label: 'Period',
        type: 'number',
        min: 100,
        max: 300,
        step: 1,
        default: 200
      }
    ]
  },
  {
    id: 'ichimoku',
    name: 'Ichimoku',
    description: 'Ichimoku Cloud',
    defaultEnabled: false,
    params: [
      {
        key: 'ichimoku_conversion',
        label: 'Conversion Line',
        type: 'number',
        min: 5,
        max: 20,
        step: 1,
        default: 9
      },
      {
        key: 'ichimoku_base',
        label: 'Base Line',
        type: 'number',
        min: 15,
        max: 35,
        step: 1,
        default: 26
      },
      {
        key: 'ichimoku_span_b',
        label: 'Span B',
        type: 'number',
        min: 35,
        max: 70,
        step: 1,
        default: 52
      },
      {
        key: 'ichimoku_displacement',
        label: 'Displacement',
        type: 'number',
        min: 15,
        max: 35,
        step: 1,
        default: 26
      }
    ]
  }
];
