import { AnalyzerState, AnalyzerProfile } from "./types";

export const PROFILES: Record<string, AnalyzerState> = {
  Conservative: { enabledIndicators: ['SMA','RSI'], params: { rsi: 35, sma: 50 }, profile: 'Conservative' },
  Balanced:     { enabledIndicators: ['SMA','MACD','RSI'], params: { rsi: 45, sma: 50 }, profile: 'Balanced' },
  Aggressive:   { enabledIndicators: ['MACD','BBANDS'], params: { macd_fast: 8, macd_slow: 17 }, profile: 'Aggressive' },
};

// Additional exports for test compatibility
export const ANALYZER_PROFILES: AnalyzerProfile[] = [
  {
    name: 'Momentum',
    description: 'Focus on momentum indicators for trend detection',
    enabledIndicators: ['rsi', 'macd'],
    defaults: {
      sma: { period: 20 },
      rsi: { period: 14, overbought: 70, oversold: 30 },
      macd: { fast: 12, slow: 26, signal: 9 },
      bollinger: { period: 20, stdDev: 2 },
      stochastic: { kPeriod: 14, dPeriod: 3, overbought: 80, oversold: 20 },
      adx: { period: 14 },
      bbands: { period: 20, stdDev: 2 },
      vwap: { sessionReset: true },
      sma_50: { period: 50 },
      sma_200: { period: 200 },
      ichimoku: { conversion: 9, base: 26, spanB: 52, displacement: 26 }
    },
    params: {
      rsi_length: 14,
      macd_fast: 12,
      macd_slow: 26,
      macd_signal: 9,
      adx_length: 14,
      bb_length: 20,
      bb_stddev: 2,
      vwap_session_reset: true,
      sma_50: 50,
      sma_200: 200,
      ichimoku_conversion: 9,
      ichimoku_base: 26,
      ichimoku_span_b: 52,
      ichimoku_displacement: 26
    }
  },
  {
    name: 'Balanced',
    description: 'Balanced approach using trend and volatility indicators',
    enabledIndicators: ['sma', 'rsi', 'bollinger'],
    defaults: {
      sma: { period: 50 },
      rsi: { period: 14, overbought: 70, oversold: 30 },
      macd: { fast: 12, slow: 26, signal: 9 },
      bollinger: { period: 20, stdDev: 2 },
      stochastic: { kPeriod: 14, dPeriod: 3, overbought: 80, oversold: 20 },
      adx: { period: 14 },
      bbands: { period: 20, stdDev: 2 },
      vwap: { sessionReset: true },
      sma_50: { period: 50 },
      sma_200: { period: 200 },
      ichimoku: { conversion: 9, base: 26, spanB: 52, displacement: 26 }
    },
    params: {
      rsi_length: 14,
      macd_fast: 12,
      macd_slow: 26,
      macd_signal: 9,
      bb_length: 20,
      bb_stddev: 2,
      adx_length: 14,
      vwap_session_reset: true,
      sma_50: 50,
      sma_200: 200,
      ichimoku_conversion: 9,
      ichimoku_base: 26,
      ichimoku_span_b: 52,
      ichimoku_displacement: 26
    }
  },
  {
    name: 'Trend Following',
    description: 'Long-term trend following strategy',
    enabledIndicators: ['sma', 'macd'],
    defaults: {
      sma: { period: 200 },
      rsi: { period: 14, overbought: 70, oversold: 30 },
      macd: { fast: 12, slow: 26, signal: 9 },
      bollinger: { period: 20, stdDev: 2 },
      stochastic: { kPeriod: 14, dPeriod: 3, overbought: 80, oversold: 20 },
      adx: { period: 14 },
      bbands: { period: 20, stdDev: 2 },
      vwap: { sessionReset: true },
      sma_50: { period: 50 },
      sma_200: { period: 200 },
      ichimoku: { conversion: 9, base: 26, spanB: 52, displacement: 26 }
    },
    params: {
      sma_200: 200,
      macd_fast: 12,
      macd_slow: 26,
      macd_signal: 9,
      rsi_length: 14,
      adx_length: 14,
      bb_length: 20,
      bb_stddev: 2,
      vwap_session_reset: true,
      sma_50: 50,
      ichimoku_conversion: 9,
      ichimoku_base: 26,
      ichimoku_span_b: 52,
      ichimoku_displacement: 26
    }
  }
];

export function getDefaultAnalyzerState(): AnalyzerState {
  return PROFILES.Balanced;
}

export function getProfileByName(name: string): AnalyzerState | undefined {
  return PROFILES[name];
}
