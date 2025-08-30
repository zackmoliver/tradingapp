import React, { useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { ABTestResult, BacktestResult, AnalyzerState } from './types';
import { ANALYZER_PROFILES, getProfileByName } from './presets';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface ABRunnerProps {
  currentState: AnalyzerState;
  onRunAB: (profileA: string | null, profileB: string | null, customA?: AnalyzerState, customB?: AnalyzerState) => Promise<ABTestResult>;
}

export const ABRunner: React.FC<ABRunnerProps> = ({
  currentState,
  onRunAB
}) => {
  const [profileA, setProfileA] = useState<string>('Momentum');
  const [profileB, setProfileB] = useState<string>('Mean Reversion');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<ABTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunAB = async () => {
    setIsRunning(true);
    setError(null);
    
    try {
      // Determine if we're using custom profiles
      const customA = profileA === 'Custom' ? currentState : undefined;
      const customB = profileB === 'Custom' ? currentState : undefined;
      
      const result = await onRunAB(
        profileA === 'Custom' ? null : profileA,
        profileB === 'Custom' ? null : profileB,
        customA,
        customB
      );
      
      setResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run A/B test');
    } finally {
      setIsRunning(false);
    }
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const getChartData = () => {
    if (!results) return null;

    const { profileA: resultA, profileB: resultB } = results;
    
    // Sanitize data to remove NaNs
    const sanitizeData = (data: Array<{ date: string; value: number }>) => {
      return data.filter(point => !isNaN(point.value) && isFinite(point.value));
    };

    const dataA = sanitizeData(resultA.result.equity_curve);
    const dataB = sanitizeData(resultB.result.equity_curve);

    // Ensure we have data points
    if (dataA.length === 0 || dataB.length === 0) {
      return null;
    }

    const labels = dataA.map(point => point.date);

    return {
      labels,
      datasets: [
        {
          label: resultA.name,
          data: dataA.map(point => point.value),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.1,
        },
        {
          label: resultB.name,
          data: dataB.map(point => point.value),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.1,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Equity Curve Comparison',
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        title: {
          display: true,
          text: 'Portfolio Value ($)',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Date',
        },
      },
    },
  };

  const profileOptions = [
    { value: 'Custom', label: 'Custom (Current Settings)' },
    ...ANALYZER_PROFILES.map(profile => ({
      value: profile.name,
      label: profile.name
    }))
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">A/B Test Runner</h2>
        <p className="text-sm text-gray-600 mt-1">
          Compare two indicator profiles over the same time period and symbol
        </p>
      </div>

      {/* Profile Selection */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Profile A
          </label>
          <select
            value={profileA}
            onChange={(e) => setProfileA(e.target.value)}
            disabled={isRunning}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
          >
            {profileOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {profileA !== 'Custom' && (
            <p className="text-xs text-gray-500">
              {getProfileByName(profileA)?.description}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Profile B
          </label>
          <select
            value={profileB}
            onChange={(e) => setProfileB(e.target.value)}
            disabled={isRunning}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
          >
            {profileOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {profileB !== 'Custom' && (
            <p className="text-xs text-gray-500">
              {getProfileByName(profileB)?.description}
            </p>
          )}
        </div>
      </div>

      {/* Run Button */}
      <button
        onClick={handleRunAB}
        disabled={isRunning || profileA === profileB}
        className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRunning ? 'Running A/B Test...' : 'Run A/B Test'}
      </button>

      {profileA === profileB && (
        <p className="text-sm text-amber-600">
          Please select different profiles for A and B
        </p>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {/* Metrics Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
              <h3 className="font-medium text-blue-900 mb-3">{results.profileA.name}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>CAGR:</span>
                  <span className="font-medium">{formatPercentage(results.profileA.result.cagr)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sharpe:</span>
                  <span className="font-medium">{results.profileA.result.sharpe_ratio.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max DD:</span>
                  <span className="font-medium">{formatPercentage(results.profileA.result.max_drawdown)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Win Rate:</span>
                  <span className="font-medium">{formatPercentage(results.profileA.result.win_rate)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Trades:</span>
                  <span className="font-medium">{results.profileA.result.total_trades}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
              <h3 className="font-medium text-red-900 mb-3">{results.profileB.name}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>CAGR:</span>
                  <span className="font-medium">{formatPercentage(results.profileB.result.cagr)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sharpe:</span>
                  <span className="font-medium">{results.profileB.result.sharpe_ratio.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max DD:</span>
                  <span className="font-medium">{formatPercentage(results.profileB.result.max_drawdown)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Win Rate:</span>
                  <span className="font-medium">{formatPercentage(results.profileB.result.win_rate)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Trades:</span>
                  <span className="font-medium">{results.profileB.result.total_trades}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Difference Table */}
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-3">Difference (A - B)</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span>CAGR Diff:</span>
                <span className={`font-medium ${results.comparison.cagr_diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {results.comparison.cagr_diff >= 0 ? '+' : ''}{formatPercentage(results.comparison.cagr_diff)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Sharpe Diff:</span>
                <span className={`font-medium ${results.comparison.sharpe_diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {results.comparison.sharpe_diff >= 0 ? '+' : ''}{results.comparison.sharpe_diff.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Max DD Diff:</span>
                <span className={`font-medium ${results.comparison.max_dd_diff <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {results.comparison.max_dd_diff >= 0 ? '+' : ''}{formatPercentage(results.comparison.max_dd_diff)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Win Rate Diff:</span>
                <span className={`font-medium ${results.comparison.win_rate_diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {results.comparison.win_rate_diff >= 0 ? '+' : ''}{formatPercentage(results.comparison.win_rate_diff)}
                </span>
              </div>
            </div>
          </div>

          {/* Equity Curve Chart */}
          {getChartData() && (
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="h-80">
                <Line data={getChartData()!} options={chartOptions} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
