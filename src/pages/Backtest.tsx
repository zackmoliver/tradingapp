/**
 * Backtest page
 * (This is your previous App.tsx content, moved here almost verbatim.)
 */
import { useState, useEffect } from "react";
import PerformanceDashboard from "../components/PerformanceDashboard";
import BacktestControls from "../components/BacktestControls";
import AppErrorBoundary from "../components/AppErrorBoundary";
import { ToastProvider } from "../lib/toast";
import { LoadingState, BacktestSummary } from "../types/backtest";
import { Loader2, AlertCircle, RefreshCw, Play, Clock, Wifi, WifiOff, X } from "lucide-react";
import {
  TauriAPI,
  TauriError,
  handleTauriError,
  ProgressTracker,
  TauriUtils,
  connectionMonitor
} from "../lib/tauri";
import BootGate from "../BootGate";

export default function Backtest() {
  const [backtestResult, setBacktestResult] = useState<BacktestSummary | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [error, setError] = useState<TauriError | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [isRunningBacktest, setIsRunningBacktest] = useState<boolean>(false);
  const [progressTracker, setProgressTracker] = useState<ProgressTracker | null>(null);

  useEffect(() => {
    loadSampleData();
    const unsubscribe = connectionMonitor.onConnectionChange(setIsConnected);
    setIsConnected(connectionMonitor.getConnectionStatus());
    return unsubscribe;
  }, []);

  const loadSampleData = async () => {
    if (loadingState === "loading") return;
    setLoadingState("loading");
    setError(null);
    setLoadingProgress(0);
    setIsRunningBacktest(false);
    if (progressTracker) progressTracker.stop();

    try {
      const tracker = new ProgressTracker(setLoadingProgress, 85, [5, 15]);
      setProgressTracker(tracker);
      tracker.start();

      const result = await TauriAPI.getSampleBacktestResult(12000);
      tracker.complete();
      await new Promise((r) => setTimeout(r, 300));

      setBacktestResult(result);
      setLoadingState("success");
      setIsConnected(true);
    } catch (err) {
      const tauriError = handleTauriError(err, "Sample data loading");
      setError(tauriError);
      setLoadingState("error");
      setIsConnected(false);
      setLoadingProgress(0);
    } finally {
      if (progressTracker) {
        progressTracker.stop();
        setProgressTracker(null);
      }
    }
  };

  const runNewBacktest = TauriUtils.debounce(async () => {
    if (isRunningBacktest || loadingState === "loading") return;

    setIsRunningBacktest(true);
    setLoadingState("loading");
    setError(null);
    setLoadingProgress(0);
    if (progressTracker) progressTracker.stop();

    try {
      const tracker = new ProgressTracker(setLoadingProgress, 80, [2, 8]);
      setProgressTracker(tracker);
      tracker.start();

      const backtestParams = TauriUtils.createDefaultBacktestParams();
      const result = await TauriAPI.runBacktest(backtestParams, 25000);

      tracker.complete();
      await new Promise((r) => setTimeout(r, 500));

      setBacktestResult(result);
      setLoadingState("success");
      setIsConnected(true);
    } catch (err) {
      const tauriError = handleTauriError(err, "Backtest execution");
      setError(tauriError);
      setLoadingState("error");
      setIsConnected(false);
      setLoadingProgress(0);
    } finally {
      setIsRunningBacktest(false);
      if (progressTracker) {
        progressTracker.stop();
        setProgressTracker(null);
      }
    }
  }, 1000);

  const handleBacktestStart = () => {
    setIsRunningBacktest(true);
    setLoadingState("loading");
    setError(null);
    setLoadingProgress(0);
  };

  const handleBacktestComplete = (result: BacktestSummary) => {
    setBacktestResult(result);
    setLoadingState("success");
    setIsConnected(true);
    setIsRunningBacktest(false);
    setLoadingProgress(100);
  };

  const handleBacktestError = (errorMessage: string) => {
    const tauriError: TauriError = {
      message: "Custom backtest failed",
      type: "backend",
      details: errorMessage,
      timestamp: new Date(),
      operation: "Custom backtest execution"
    };
    setError(tauriError);
    setLoadingState("error");
    setIsConnected(false);
    setIsRunningBacktest(false);
    setLoadingProgress(0);
  };

  return (
    <AppErrorBoundary>
      <ToastProvider>
        <BootGate>
          {/* Header actions (kept local to this page) */}
          <div className="flex items-center justify-end gap-3">
            <div className="flex items-center text-sm">
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
              disabled={loadingState === "loading" || isRunningBacktest}
              className="inline-flex items-center px-3 py-2 border border-neutral-300 shadow-sm text-sm leading-4 font-medium rounded-md text-neutral-700 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingState === "loading" && !isRunningBacktest ? "animate-spin" : ""}`} />
              {loadingState === "loading" && !isRunningBacktest ? "Loading..." : "Refresh"}
            </button>

            <button
              onClick={runNewBacktest}
              disabled={loadingState === "loading" || isRunningBacktest}
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

          <div className="py-6">
            {loadingState === "loading" && (
              <div className="loading-state flex items-center justify-center py-12">
                <div className="text-center max-w-md mx-auto">
                  <div className="relative mb-6">
                    <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
                    <Clock className="w-4 h-4 text-neutral-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <h3 className="text-lg font-medium text-neutral-900 mb-2">
                    {isRunningBacktest ? "Running Backtest" : "Loading Performance Data"}
                  </h3>
                  <p className="text-neutral-600 mb-4">
                    {isRunningBacktest
                      ? "Executing strategy and generating results..."
                      : "Fetching backtest results and calculating metrics..."}
                  </p>
                  <div className="w-full bg-neutral-200 rounded-full h-2 mb-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${loadingProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-neutral-500">{loadingProgress}% complete</p>
                </div>
              </div>
            )}

            {loadingState === "error" && error && (
              <div className="error-state bg-danger-50 border border-danger-200 rounded-lg p-6 animate-slide-up">
                <div className="flex items-start">
                  <AlertCircle className="w-6 h-6 text-danger-600 mr-3 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-medium text-danger-900">{error.message}</h3>
                      <button
                        onClick={() => {
                          setError(null);
                          setLoadingState("idle");
                        }}
                        className="text-danger-400 hover:text-danger-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <p className="text-danger-700 mb-3 text-sm">{error.details}</p>
                  </div>
                </div>
              </div>
            )}

            {loadingState === "success" && backtestResult && (
              <div className="performance-content animate-fade-in">
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                  <div className="xl:col-span-1">
                    <BacktestControls
                      onBacktestStart={handleBacktestStart}
                      onBacktestComplete={handleBacktestComplete}
                      onBacktestError={handleBacktestError}
                      isRunning={isRunningBacktest}
                      className="sticky top-6"
                    />
                  </div>

                  <div className="xl:col-span-3">
                    <PerformanceDashboard backtestResult={backtestResult} className="animate-slide-up" />
                  </div>
                </div>
              </div>
            )}

            {loadingState === "idle" && (
              <div className="idle-state py-12">
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
        </BootGate>
      </ToastProvider>
    </AppErrorBoundary>
  );
}
