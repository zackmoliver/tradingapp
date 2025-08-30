import { AnalyzerProfile } from './types';

export const ANALYZER_PROFILES: AnalyzerProfile[] = [
  {
    name: 'Momentum',
    description: 'Focus on momentum indicators for trend-following strategies',
    enabledIndicators: ['rsi', 'macd', 'adx', 'sma_50'],
    params: {
      rsi_length: 14,
      macd_fast: 12,
      macd_slow: 26,
      macd_signal: 9,
      adx_length: 14,
      sma_50: 50
    }
  },
  {
    name: 'Mean Reversion',
    description: 'Indicators for mean reversion and oversold/overbought conditions',
    enabledIndicators: ['rsi', 'bbands', 'vwap'],
    params: {
      rsi_length: 21,
      bb_length: 20,
      bb_stddev: 2.0,
      vwap_session_reset: 'daily'
    }
  },
  {
    name: 'Trend',
    description: 'Long-term trend identification with moving averages',
    enabledIndicators: ['sma_50', 'sma_200', 'macd', 'ichimoku'],
    params: {
      sma_50: 50,
      sma_200: 200,
      macd_fast: 12,
      macd_slow: 26,
      macd_signal: 9,
      ichimoku_conversion: 9,
      ichimoku_base: 26,
      ichimoku_span_b: 52,
      ichimoku_displacement: 26
    }
  },
  {
    name: 'Volatility Sell',
    description: 'Indicators for volatility-based selling strategies',
    enabledIndicators: ['bbands', 'adx', 'vwap', 'rsi'],
    params: {
      bb_length: 20,
      bb_stddev: 2.5,
      adx_length: 14,
      vwap_session_reset: 'daily',
      rsi_length: 14
    }
  }
];

export const getProfileByName = (name: string): AnalyzerProfile | undefined => {
  return ANALYZER_PROFILES.find(profile => profile.name === name);
};

export const getDefaultAnalyzerState = () => {
  const momentum = getProfileByName('Momentum');
  return {
    enabledIndicators: momentum?.enabledIndicators || ['rsi', 'macd'],
    params: momentum?.params || {
      rsi_length: 14,
      macd_fast: 12,
      macd_slow: 26,
      macd_signal: 9
    },
    profile: 'Momentum'
  };
};
