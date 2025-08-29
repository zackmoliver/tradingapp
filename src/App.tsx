/**
 * Main Application Component
 * 
 * Entry point for the Trading Engine frontend application.
 * Demonstrates integration between Tauri backend and React frontend
 * with professional-grade performance visualization.
 */

import React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import PerformanceDashboard from './components/PerformanceDashboard';
import { BacktestResult, LoadingState } from './types/backtest';
import { Loader2, AlertCircle, RefreshCw, Play, Clock, Wifi, WifiOff } from 'lucide-react';
import './App.css';

// Timeout helper for robust error handling
const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
};

const App: React.FC = () => {
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [isRunningBacktest, setIsRunningBacktest] = useState<boolean>(false);

  // Load sample backtest result on component mount
  useEffect(() => {
    loadSampleData();
  }, []);

  const loadSampleData = async () => {
    setLoadingState('loading');
    setError(null);
    setLoadingProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => Math.min(prev + 10, 90));
      }, 150);

      // Call backend with timeout
      const result = await withTimeout(
        invoke<BacktestResult>('get_sample_backtest_result'),
        10000 // 10 second timeout
      );

      clearInterval(progressInterval);
      setLoadingProgress(100);

      setBacktestResult(result);
      setLoadingState('success');
      setIsConnected(true);

    } catch (err) {
      console.error('Failed to load sample data:', err);

      let errorMessage = 'An unexpected error occurred';
      if (err instanceof Error) {
        if (err.message.includes('timed out')) {
          errorMessage = 'Request timed out. The backend may be slow or unavailable.';
        } else if (err.message.includes('invoke')) {
          errorMessage = 'Failed to communicate with backend. Please check if the application is running properly.';
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
      setLoadingState('error');
      setIsConnected(false);
      setLoadingProgress(0);
    }
  };

  const runNewBacktest = async () => {
    // Prevent multiple simultaneous backtests
    if (isRunningBacktest || loadingState === 'loading') {
      return;
    }

    setIsRunningBacktest(true);
    setLoadingState('loading');
    setError(null);
    setLoadingProgress(0);

    try {
      // Simulate progress for backtest execution
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => Math.min(prev + 3, 85));
      }, 150);

      // Generate backtest parameters
      const backtestParams = {
        ticker: 'AAPL',
        start_date: '01/01/2023',
        end_date: '12/31/2023',
        strategy: 'iron_condor',
        seed: Math.floor(Math.random() * 1000) + 1, // Random seed for variety
        initial_capital: 100000
      };

      console.log('Starting backtest with parameters:', backtestParams);

      // Call the new run_backtest command
      const result = await withTimeout(
        invoke<BacktestResult>('run_backtest', { params: backtestParams }),
        20000 // 20 second timeout for backtest execution
      );

      clearInterval(progressInterval);
      setLoadingProgress(100);

      // Update with fresh backtest results
      setBacktestResult(result);
      setLoadingState('success');
      setIsConnected(true);

      console.log('Backtest completed successfully:', result.run_id);

    } catch (err) {
      console.error('Failed to run backtest:', err);

      let errorMessage = 'Failed to execute backtest';
      if (err instanceof Error) {
        if (err.message.includes('timed out')) {
          errorMessage = 'Backtest execution timed out. Complex strategies may require more time.';
        } else if (err.message.includes('invoke')) {
          errorMessage = 'Failed to start backtest. Please check backend connectivity.';
        } else if (err.message.includes('Invalid')) {
          errorMessage = `Parameter error: ${err.message}`;
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
      setLoadingState('error');
      setIsConnected(false);
      setLoadingProgress(0);
    } finally {
      setIsRunningBacktest(false);
    }
  };

  return (
    <div className="app min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="app-header bg-white shadow-sm border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">TE</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-neutral-900">Trading Engine</h1>
                  <p className="text-xs text-neutral-500">Professional Options Analytics</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Connection Status Indicator */}
              <div className="flex items-center space-x-2 text-sm">
                {isConnected ? (
                  <div className="flex items-center text-success-600">
                    <Wifi className="w-4 h-4 mr-1" />
                    <span>Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center text-danger-600">
                    <WifiOff className="w-4 h-4 mr-1" />
                    <span>Disconnected</span>
                  </div>
                )}
              </div>

              <button
                onClick={loadSampleData}
                disabled={loadingState === 'loading' || isRunningBacktest}
                className="inline-flex items-center px-3 py-2 border border-neutral-300 shadow-sm text-sm leading-4 font-medium rounded-md text-neutral-700 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingState === 'loading' && !isRunningBacktest ? 'animate-spin' : ''}`} />
                {loadingState === 'loading' && !isRunningBacktest ? 'Loading...' : 'Refresh'}
              </button>

              <button
                onClick={runNewBacktest}
                disabled={loadingState === 'loading' || isRunningBacktest}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunningBacktest ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run Backtest
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loadingState === 'loading' && (
            <div className="loading-state flex items-center justify-center py-12">
              <div className="text-center max-w-md mx-auto">
                <div className="relative mb-6">
                  <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
                  <Clock className="w-4 h-4 text-neutral-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                </div>

                <h3 className="text-lg font-medium text-neutral-900 mb-2">
                  {isRunningBacktest ? 'Running Backtest' : 'Loading Performance Data'}
                </h3>
                <p className="text-neutral-600 mb-4">
                  {isRunningBacktest
                    ? 'Executing strategy and generating results...'
                    : 'Fetching backtest results and calculating metrics...'
                  }
                </p>

                {/* Progress Bar */}
                <div className="w-full bg-neutral-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                </div>
                <p className="text-xs text-neutral-500">
                  {loadingProgress}% complete
                </p>

                {loadingProgress > 50 && (
                  <p className="text-xs text-neutral-400 mt-2 animate-pulse">
                    {isRunningBacktest
                      ? 'Analyzing market data and executing trades...'
                      : 'Processing complex calculations...'
                    }
                  </p>
                )}

                {isRunningBacktest && loadingProgress > 70 && (
                  <p className="text-xs text-neutral-400 mt-1 animate-pulse">
                    Finalizing performance metrics...
                  </p>
                )}
              </div>
            </div>
          )}

          {loadingState === 'error' && (
            <div className="error-state bg-danger-50 border border-danger-200 rounded-lg p-6">
              <div className="flex items-start">
                <AlertCircle className="w-6 h-6 text-danger-600 mr-3 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-danger-900 mb-2">
                    Error Loading Data
                  </h3>
                  <p className="text-danger-700 mb-4">
                    {error || 'An unexpected error occurred while loading the backtest results.'}
                  </p>

                  {/* Error Details */}
                  <div className="bg-danger-100 rounded-md p-3 mb-4">
                    <h4 className="text-sm font-medium text-danger-800 mb-1">Troubleshooting Tips:</h4>
                    <ul className="text-xs text-danger-700 space-y-1">
                      <li>• Check if the Tauri backend is running properly</li>
                      <li>• Verify network connectivity and firewall settings</li>
                      <li>• Try refreshing the application</li>
                      {error?.includes('timed out') && (
                        <li>• The operation may require more time - try again</li>
                      )}
                    </ul>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={loadSampleData}
                      disabled={loadingState === 'loading'}
                      className="inline-flex items-center px-3 py-2 border border-danger-300 shadow-sm text-sm leading-4 font-medium rounded-md text-danger-700 bg-white hover:bg-danger-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-danger-500 disabled:opacity-50"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </button>

                    <button
                      onClick={() => {
                        setError(null);
                        setLoadingState('idle');
                      }}
                      className="inline-flex items-center px-3 py-2 border border-neutral-300 shadow-sm text-sm leading-4 font-medium rounded-md text-neutral-700 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {loadingState === 'success' && backtestResult && (
            <div className="performance-content animate-fade-in">
              <PerformanceDashboard 
                backtestResult={backtestResult}
                className="animate-slide-up"
              />
            </div>
          )}

          {loadingState === 'idle' && (
            <div className="idle-state text-center py-12">
              <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Play className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-lg font-medium text-neutral-900 mb-2">
                  Welcome to Trading Engine
                </h3>
                <p className="text-neutral-600 mb-6">
                  Professional options trading analytics and backtesting platform.
                  Load sample data or run a new backtest to get started.
                </p>
                <div className="flex justify-center space-x-3">
                  <button
                    onClick={loadSampleData}
                    className="inline-flex items-center px-4 py-2 border border-neutral-300 shadow-sm text-sm font-medium rounded-md text-neutral-700 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    Load Sample Data
                  </button>
                  <button
                    onClick={runNewBacktest}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Run Backtest
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer bg-white border-t border-neutral-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center text-sm text-neutral-500">
            <div>
              Trading Engine v1.0.0 - Professional Options Analytics
            </div>
            <div className="flex items-center space-x-4">
              <span>Powered by Tauri v2 + React 18 + TypeScript</span>
              {isConnected ? (
                <span className="text-success-600 flex items-center">
                  <Wifi className="w-3 h-3 mr-1" />
                  Backend Connected
                </span>
              ) : (
                <span className="text-danger-600 flex items-center">
                  <WifiOff className="w-3 h-3 mr-1" />
                  Backend Disconnected
                </span>
              )}
              {backtestResult && (
                <span className="text-neutral-500 text-xs">
                  Last updated: {new Date().toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
