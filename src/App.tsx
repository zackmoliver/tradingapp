/**
 * Main Application Component
 * 
 * Entry point for the Trading Engine frontend application.
 * Demonstrates integration between Tauri backend and React frontend
 * with professional-grade performance visualization.
 */

import React, { useState, useEffect } from 'react';
import PerformanceDashboard from './components/PerformanceDashboard';
import BacktestControls from './components/BacktestControls';
import { BacktestResult, LoadingState, BacktestSummary } from './types/backtest';
import { Loader2, AlertCircle, RefreshCw, Play, Clock, Wifi, WifiOff, X } from 'lucide-react';
import {
  TauriAPI,
  TauriError,
  handleTauriError,
  ProgressTracker,
  TauriUtils,
  connectionMonitor
} from './lib/tauri';
import './App.css';
import BootGate from './BootGate';

const App: React.FC = () => {
  const [backtestResult, setBacktestResult] = useState<BacktestSummary | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState<TauriError | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [isRunningBacktest, setIsRunningBacktest] = useState<boolean>(false);
  const [currentOperation, setCurrentOperation] = useState<string>('');
  const [progressTracker, setProgressTracker] = useState<ProgressTracker | null>(null);

  // Load sample backtest result on component mount
  useEffect(() => {
    loadSampleData();

    // Set up connection monitoring
    const unsubscribe = connectionMonitor.onConnectionChange(setIsConnected);
    setIsConnected(connectionMonitor.getConnectionStatus());

    return unsubscribe;
  }, []);

  const loadSampleData = async () => {
    if (loadingState === 'loading') return; // Prevent multiple simultaneous loads

    setLoadingState('loading');
    setError(null);
    setLoadingProgress(0);
    setCurrentOperation('Loading sample data');
    setIsRunningBacktest(false);

    // Clean up any existing progress tracker
    if (progressTracker) {
      progressTracker.stop();
    }

    try {
      // Create new progress tracker
      const tracker = new ProgressTracker(setLoadingProgress, 85, [5, 15]);
      setProgressTracker(tracker);
      tracker.start();

      // Call backend using centralized API
      const result = await TauriAPI.getSampleBacktestResult(12000);

      tracker.complete();

      // Small delay to show 100% completion
      await new Promise(resolve => setTimeout(resolve, 300));

      setBacktestResult(result);
      setLoadingState('success');
      setIsConnected(true);
      setCurrentOperation('');

    } catch (err) {
      const tauriError = handleTauriError(err, 'Sample data loading');
      setError(tauriError);
      setLoadingState('error');
      setIsConnected(false);
      setLoadingProgress(0);
      setCurrentOperation('');
    } finally {
      if (progressTracker) {
        progressTracker.stop();
        setProgressTracker(null);
      }
    }
  };

  const runNewBacktest = TauriUtils.debounce(async () => {
    // Prevent multiple simultaneous operations
    if (isRunningBacktest || loadingState === 'loading') {
      return;
    }

    setIsRunningBacktest(true);
    setLoadingState('loading');
    setError(null);
    setLoadingProgress(0);
    setCurrentOperation('Running backtest');

    // Clean up any existing progress tracker
    if (progressTracker) {
      progressTracker.stop();
    }

    try {
      // Create new progress tracker for backtest (slower progress)
      const tracker = new ProgressTracker(setLoadingProgress, 80, [2, 8]);
      setProgressTracker(tracker);
      tracker.start();

      // Generate realistic backtest parameters using utilities
      const backtestParams = TauriUtils.createDefaultBacktestParams();

      console.log('Starting backtest with parameters:', backtestParams);

      // Call the run_backtest command using centralized API
      const result = await TauriAPI.runBacktest(backtestParams, 25000);

      tracker.complete();

      // Small delay to show completion
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update with fresh backtest results
      setBacktestResult(result);
      setLoadingState('success');
      setIsConnected(true);
      setCurrentOperation('');

      console.log('Backtest completed successfully:', result.strategy);

    } catch (err) {
      const tauriError = handleTauriError(err, 'Backtest execution');
      setError(tauriError);
      setLoadingState('error');
      setIsConnected(false);
      setLoadingProgress(0);
      setCurrentOperation('');
    } finally {
      setIsRunningBacktest(false);
      if (progressTracker) {
        progressTracker.stop();
        setProgressTracker(null);
      }
    }
  }, 1000); // 1 second debounce

  // Handlers for BacktestControls
  const handleBacktestStart = () => {
    setIsRunningBacktest(true);
    setLoadingState('loading');
    setError(null);
    setLoadingProgress(0);
    setCurrentOperation('Running custom backtest');
  };

  const handleBacktestComplete = (result: BacktestSummary) => {
    setBacktestResult(result);
    setLoadingState('success');
    setIsConnected(true);
    setIsRunningBacktest(false);
    setCurrentOperation('');
    setLoadingProgress(100);
  };

  const handleBacktestError = (errorMessage: string) => {
    const tauriError: TauriError = {
      message: 'Custom backtest failed',
      type: 'backend',
      details: errorMessage,
      timestamp: new Date(),
      operation: 'Custom backtest execution'
    };
    setError(tauriError);
    setLoadingState('error');
    setIsConnected(false);
    setIsRunningBacktest(false);
    setCurrentOperation('');
    setLoadingProgress(0);
  };

  return (
    <BootGate>
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

            {loadingState === 'error' && error && (
              <div className="error-state bg-danger-50 border border-danger-200 rounded-lg p-6 animate-slide-up">
                <div className="flex items-start">
                  <AlertCircle className="w-6 h-6 text-danger-600 mr-3 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-medium text-danger-900">
                        {error.message}
                      </h3>
                      <button
                        onClick={() => {
                          setError(null);
                          setLoadingState('idle');
                        }}
                        className="text-danger-400 hover:text-danger-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <p className="text-danger-700 mb-3 text-sm">
                      {error.details}
                    </p>

                    <div className="bg-danger-100 rounded-md p-3 mb-4">
                      <h4 className="text-sm font-medium text-danger-800 mb-2">
                        Error Type: {error.type.charAt(0).toUpperCase() + error.type.slice(1)}
                      </h4>
                      <div className="text-xs text-danger-700 space-y-1">
                        {error.type === 'timeout' && (
                          <>
                            <p>• The operation exceeded the maximum allowed time</p>
                            <p>• This may indicate backend performance issues</p>
                            <p>• Try again or check system resources</p>
                          </>
                        )}
                        {error.type === 'backend' && (
                          <>
                            <p>• Unable to communicate with the Tauri backend</p>
                            <p>• Ensure the application is running properly</p>
                            <p>• Check for any error messages in the console</p>
                          </>
                        )}
                        {error.type === 'network' && (
                          <>
                            <p>• Network connectivity issues detected</p>
                            <p>• Check your internet connection</p>
                            <p>• Verify firewall settings</p>
                          </>
                        )}
                        {error.type === 'unknown' && (
                          <>
                            <p>• An unexpected error occurred</p>
                            <p>• Try refreshing the application</p>
                            <p>• Contact support if the issue persists</p>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-danger-600 mt-2">
                        Occurred at: {error.timestamp.toLocaleTimeString()}
                      </p>
                    </div>

                    <div className="flex space-x-3">
                      <button
                        onClick={isRunningBacktest ? runNewBacktest : loadSampleData}
                        disabled={loadingState === 'loading'}
                        className="inline-flex items-center px-4 py-2 border border-danger-300 shadow-sm text-sm font-medium rounded-md text-danger-700 bg-white hover:bg-danger-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-danger-500 disabled:opacity-50 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {isRunningBacktest ? 'Retry Backtest' : 'Try Again'}
                      </button>

                      <button
                        onClick={() => {
                          setError(null);
                          setLoadingState('idle');
                          setIsRunningBacktest(false);
                        }}
                        className="inline-flex items-center px-3 py-2 border border-neutral-300 shadow-sm text-sm font-medium rounded-md text-neutral-700 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500 transition-colors"
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
                {/* Layout with Controls and Dashboard */}
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                  {/* Backtest Controls Panel */}
                  <div className="xl:col-span-1">
                    <BacktestControls
                      onBacktestStart={handleBacktestStart}
                      onBacktestComplete={handleBacktestComplete}
                      onBacktestError={handleBacktestError}
                      isRunning={isRunningBacktest}
                      className="sticky top-6"
                    />
                  </div>

                  {/* Performance Dashboard */}
                  <div className="xl:col-span-3">
                    <PerformanceDashboard
                      backtestResult={backtestResult}
                      className="animate-slide-up"
                    />
                  </div>
                </div>
              </div>
            )}

            {loadingState === 'idle' && (
              <div className="idle-state py-12">
                {/* Welcome Section */}
                <div className="text-center mb-12">
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Play className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-lg font-medium text-neutral-900 mb-2">
                    Welcome to Trading Engine
                  </h3>
                  <p className="text-neutral-600 mb-6">
                    Professional options trading analytics and backtesting platform.
                    Configure your backtest parameters below or load sample data to get started.
                  </p>
                  <button
                    onClick={loadSampleData}
                    className="inline-flex items-center px-4 py-2 border border-neutral-300 shadow-sm text-sm font-medium rounded-md text-neutral-700 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Load Sample Data
                  </button>
                </div>

                {/* Backtest Controls for Initial Setup */}
                <div className="max-w-2xl mx-auto">
                  <BacktestControls
                    onBacktestStart={handleBacktestStart}
                    onBacktestComplete={handleBacktestComplete}
                    onBacktestError={handleBacktestError}
                    isRunning={isRunningBacktest}
                  />
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
    </BootGate>
  );
};

export default App;