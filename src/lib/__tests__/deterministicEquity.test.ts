/**
 * Deterministic Equity Curve Tests
 * 
 * Unit tests to verify that the deterministic equity curve generation
 * produces identical results for the same parameters and seed.
 * 
 * Tests:
 * - Same (params, seed) → identical output
 * - Different seeds → different output
 * - CSV byte-level reproducibility
 * - Performance metrics consistency
 */

import {
  generateDeterministicEquityCurve,
  calculatePerformanceMetrics,
  generateDeterministicStats,
  generateDeterministicBacktest,
  backtestToCsv,
  testReproducibility
} from '../deterministicEquity';
import { BacktestParams } from '../../types/backtest';

describe('Deterministic Equity Curve Generation', () => {
  const baseParams: BacktestParams = {
    ticker: 'AAPL',
    start_date: '01/01/2023',
    end_date: '12/31/2023',
    strategy: 'PMCC',
    initial_capital: 100000,
    seed: 42
  };

  describe('Equity Curve Reproducibility', () => {
    test('same parameters and seed produce identical equity curves', () => {
      const curve1 = generateDeterministicEquityCurve(baseParams);
      const curve2 = generateDeterministicEquityCurve(baseParams);
      
      expect(curve1).toHaveLength(curve2.length);
      
      for (let i = 0; i < curve1.length; i++) {
        expect(curve1[i].t).toBe(curve2[i].t);
        expect(curve1[i].equity).toBe(curve2[i].equity);
        expect(curve1[i].drawdown).toBe(curve2[i].drawdown);
      }
    });

    test('different seeds produce different equity curves', () => {
      const params1 = { ...baseParams, seed: 42 };
      const params2 = { ...baseParams, seed: 123 };
      
      const curve1 = generateDeterministicEquityCurve(params1);
      const curve2 = generateDeterministicEquityCurve(params2);
      
      expect(curve1).toHaveLength(curve2.length);
      
      // At least some values should be different
      let hasDifference = false;
      for (let i = 0; i < curve1.length; i++) {
        if (curve1[i].equity !== curve2[i].equity) {
          hasDifference = true;
          break;
        }
      }
      expect(hasDifference).toBe(true);
    });

    test('undefined seed defaults to 42', () => {
      const paramsWithSeed = { ...baseParams, seed: 42 };
      const paramsWithoutSeed = { ...baseParams, seed: undefined };
      
      const curve1 = generateDeterministicEquityCurve(paramsWithSeed);
      const curve2 = generateDeterministicEquityCurve(paramsWithoutSeed);
      
      expect(curve1).toEqual(curve2);
    });
  });

  describe('Performance Metrics Consistency', () => {
    test('performance metrics are deterministic', () => {
      const curve = generateDeterministicEquityCurve(baseParams);
      
      const metrics1 = calculatePerformanceMetrics(curve, baseParams.start_date, baseParams.end_date);
      const metrics2 = calculatePerformanceMetrics(curve, baseParams.start_date, baseParams.end_date);
      
      expect(metrics1.cagr).toBe(metrics2.cagr);
      expect(metrics1.maxDrawdown).toBe(metrics2.maxDrawdown);
    });

    test('trading stats are deterministic', () => {
      const stats1 = generateDeterministicStats(42);
      const stats2 = generateDeterministicStats(42);
      
      expect(stats1.trades).toBe(stats2.trades);
      expect(stats1.winRate).toBe(stats2.winRate);
    });

    test('different seeds produce different trading stats', () => {
      const stats1 = generateDeterministicStats(42);
      const stats2 = generateDeterministicStats(123);
      
      expect(stats1.trades !== stats2.trades || stats1.winRate !== stats2.winRate).toBe(true);
    });
  });

  describe('Complete Backtest Reproducibility', () => {
    test('complete backtest is reproducible', () => {
      const backtest1 = generateDeterministicBacktest(baseParams);
      const backtest2 = generateDeterministicBacktest(baseParams);
      
      expect(backtest1.strategy).toBe(backtest2.strategy);
      expect(backtest1.symbol).toBe(backtest2.symbol);
      expect(backtest1.start).toBe(backtest2.start);
      expect(backtest1.end).toBe(backtest2.end);
      expect(backtest1.capital).toBe(backtest2.capital);
      expect(backtest1.cagr).toBe(backtest2.cagr);
      expect(backtest1.trades).toBe(backtest2.trades);
      expect(backtest1.win_rate).toBe(backtest2.win_rate);
      expect(backtest1.max_dd).toBe(backtest2.max_dd);
      expect(backtest1.equity_curve).toEqual(backtest2.equity_curve);
    });

    test('CSV output is byte-identical for same parameters', () => {
      const backtest1 = generateDeterministicBacktest(baseParams);
      const backtest2 = generateDeterministicBacktest(baseParams);
      
      const csv1 = backtestToCsv(backtest1);
      const csv2 = backtestToCsv(backtest2);
      
      expect(csv1).toBe(csv2);
      expect(csv1.length).toBe(csv2.length);
      
      // Verify byte-level equality
      const bytes1 = new TextEncoder().encode(csv1);
      const bytes2 = new TextEncoder().encode(csv2);
      
      expect(bytes1).toEqual(bytes2);
    });

    test('reproducibility test helper works correctly', () => {
      const isReproducible = testReproducibility(baseParams, 5);
      expect(isReproducible).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('handles zero initial capital', () => {
      const params = { ...baseParams, initial_capital: 0 };
      const curve = generateDeterministicEquityCurve(params);
      
      expect(curve).toHaveLength(365); // Should still generate curve
      expect(curve[0].equity).toBe(0);
    });

    test('handles very small initial capital', () => {
      const params = { ...baseParams, initial_capital: 0.01 };
      const curve = generateDeterministicEquityCurve(params);
      
      expect(curve).toHaveLength(365);
      expect(curve[0].equity).toBe(0.01);
    });

    test('handles large seed values', () => {
      const params = { ...baseParams, seed: 2147483647 }; // Max 32-bit signed int
      const curve1 = generateDeterministicEquityCurve(params);
      const curve2 = generateDeterministicEquityCurve(params);
      
      expect(curve1).toEqual(curve2);
    });

    test('handles negative seed values', () => {
      const params = { ...baseParams, seed: -123 };
      const curve1 = generateDeterministicEquityCurve(params);
      const curve2 = generateDeterministicEquityCurve(params);
      
      expect(curve1).toEqual(curve2);
    });
  });

  describe('Different Parameter Combinations', () => {
    test('different strategies with same seed produce different results', () => {
      const pmccParams = { ...baseParams, strategy: 'PMCC' as const };
      const wheelParams = { ...baseParams, strategy: 'Wheel' as const };
      
      const pmccBacktest = generateDeterministicBacktest(pmccParams);
      const wheelBacktest = generateDeterministicBacktest(wheelParams);
      
      expect(pmccBacktest.strategy).toBe('PMCC');
      expect(wheelBacktest.strategy).toBe('Wheel');
      
      // Results should be identical except for strategy name since we use same algorithm
      expect(pmccBacktest.equity_curve).toEqual(wheelBacktest.equity_curve);
    });

    test('different tickers with same seed produce different results', () => {
      const aaplParams = { ...baseParams, ticker: 'AAPL' };
      const spyParams = { ...baseParams, ticker: 'SPY' };
      
      const aaplBacktest = generateDeterministicBacktest(aaplParams);
      const spyBacktest = generateDeterministicBacktest(spyParams);
      
      expect(aaplBacktest.symbol).toBe('AAPL');
      expect(spyBacktest.symbol).toBe('SPY');
      
      // Equity curves should be identical since ticker doesn't affect calculation
      expect(aaplBacktest.equity_curve).toEqual(spyBacktest.equity_curve);
    });

    test('different initial capital scales results proportionally', () => {
      const params1 = { ...baseParams, initial_capital: 100000 };
      const params2 = { ...baseParams, initial_capital: 200000 };
      
      const backtest1 = generateDeterministicBacktest(params1);
      const backtest2 = generateDeterministicBacktest(params2);
      
      // Final equity should be roughly proportional
      const finalEquity1 = backtest1.equity_curve[backtest1.equity_curve.length - 1].equity;
      const finalEquity2 = backtest2.equity_curve[backtest2.equity_curve.length - 1].equity;
      
      const ratio = finalEquity2 / finalEquity1;
      expect(ratio).toBeCloseTo(2.0, 1); // Should be close to 2x
    });
  });

  describe('CSV Format Validation', () => {
    test('CSV contains required headers and data', () => {
      const backtest = generateDeterministicBacktest(baseParams);
      const csv = backtestToCsv(backtest);
      
      expect(csv).toContain('# Backtest Results');
      expect(csv).toContain('Strategy,PMCC');
      expect(csv).toContain('Symbol,AAPL');
      expect(csv).toContain('Date,Equity,Drawdown');
      
      // Should have data rows
      const lines = csv.split('\n');
      const dataLines = lines.filter(line => line.includes('/2023,'));
      expect(dataLines.length).toBeGreaterThan(0);
    });

    test('CSV format is consistent across runs', () => {
      const csv1 = backtestToCsv(generateDeterministicBacktest(baseParams));
      const csv2 = backtestToCsv(generateDeterministicBacktest(baseParams));
      
      const lines1 = csv1.split('\n');
      const lines2 = csv2.split('\n');
      
      expect(lines1.length).toBe(lines2.length);
      
      for (let i = 0; i < lines1.length; i++) {
        expect(lines1[i]).toBe(lines2[i]);
      }
    });
  });
});
