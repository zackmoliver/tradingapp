export type AnalyzerState = {
  name?: string;
  enabledIndicators: string[];
  params: Record<string, number>;
  profile?: string | null;
};

export type BacktestResult = {
  cagr: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
};

export type ABTestResult = {
  profileA: { name: string; result: BacktestResult };
  profileB: { name: string; result: BacktestResult };
  comparison: {
    cagr_diff: number;
    sharpe_diff: number;
    max_dd_diff: number;
    win_rate_diff: number
  };
};

// Additional exports for test compatibility
export type IndicatorId = 'sma' | 'rsi' | 'macd' | 'bollinger' | 'stochastic' | 'adx' | 'bbands' | 'vwap' | 'sma_50' | 'sma_200' | 'ichimoku';

export interface IndicatorParams {
  [key: string]: number | boolean | string;
}

export interface IndicatorConfig {
  id: IndicatorId;
  name: string;
  description?: string;
  params: IndicatorParams;
}

export interface AnalyzerProfile {
  name: string;
  description: string;
  enabledIndicators: string[];
  defaults: Record<IndicatorId, IndicatorParams>;
  params: Record<string, any>;
}

export const AVAILABLE_INDICATORS: IndicatorConfig[] = [
  {
    id: 'sma',
    name: 'Simple Moving Average',
    description: 'A trend-following indicator that smooths price data',
    params: { period: 50 }
  },
  {
    id: 'rsi',
    name: 'Relative Strength Index',
    description: 'Momentum oscillator measuring speed and change of price movements',
    params: { period: 14, overbought: 70, oversold: 30 }
  },
  {
    id: 'macd',
    name: 'MACD',
    description: 'Moving Average Convergence Divergence - trend and momentum indicator',
    params: { fast: 12, slow: 26, signal: 9 }
  },
  {
    id: 'bollinger',
    name: 'Bollinger Bands',
    description: 'Volatility indicator with upper and lower bands',
    params: { period: 20, stdDev: 2 }
  },
  {
    id: 'stochastic',
    name: 'Stochastic Oscillator',
    description: 'Momentum indicator comparing closing price to price range',
    params: { kPeriod: 14, dPeriod: 3, overbought: 80, oversold: 20 }
  }
];


