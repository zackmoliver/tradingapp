// src/components/StrategyLoop.tsx
// Strategy Loop Management Component

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface StrategyLoopConfig {
  enabled: boolean;
  cadence_minutes: number;
  max_concurrent_signals: number;
  cooldown_seconds: number;
  log_level: 'Debug' | 'Info' | 'Warning' | 'Error';
  dry_run: boolean;
}

interface LoopState {
  running: boolean;
  last_execution: number;
  processed_bars: string[];
  signal_cooldowns: Record<string, number>;
  execution_count: number;
  error_count: number;
  last_error?: string;
}

interface SignalEvaluation {
  symbol: string;
  timestamp: number;
  bar_timestamp: number;
  signals: Array<{
    name: string;
    direction: 'Long' | 'Short' | 'Neutral';
    confidence: number;
    metadata: Record<string, any>;
  }>;
  decision: {
    action: 'Buy' | 'Sell' | 'Hold' | 'Close' | 'Skip';
    reason: string;
    orders: any[];
    risk_assessment: {
      position_size: number;
      risk_per_trade: number;
      portfolio_heat: number;
      max_drawdown_risk: number;
      approved: boolean;
      warnings: string[];
    };
  };
  execution_time_ms: number;
}

interface StrategyLog {
  timestamp: number;
  level: 'Debug' | 'Info' | 'Warning' | 'Error';
  category: string;
  message: string;
  data?: any;
  symbol?: string;
  bar_timestamp?: number;
}

export const StrategyLoop: React.FC = () => {
  const [config, setConfig] = useState<StrategyLoopConfig>({
    enabled: false,
    cadence_minutes: 5,
    max_concurrent_signals: 10,
    cooldown_seconds: 300,
    log_level: 'Info',
    dry_run: true,
  });
  
  const [state, setState] = useState<LoopState>({
    running: false,
    last_execution: 0,
    processed_bars: [],
    signal_cooldowns: {},
    execution_count: 0,
    error_count: 0,
  });

  const [logs, setLogs] = useState<StrategyLog[]>([]);
  const [evaluations, setEvaluations] = useState<SignalEvaluation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadConfig();
    loadState();
    setupEventListeners();
  }, []);

  const loadConfig = async () => {
    try {
      const result = await invoke<StrategyLoopConfig>('get_strategy_loop_config');
      setConfig(result);
    } catch (error) {
      console.error('Failed to load strategy loop config:', error);
    }
  };

  const loadState = async () => {
    try {
      const result = await invoke<LoopState>('get_strategy_loop_state');
      setState(result);
    } catch (error) {
      console.error('Failed to load strategy loop state:', error);
    }
  };

  const setupEventListeners = async () => {
    // Listen for strategy logs
    await listen('strategy_log', (event) => {
      const log = event.payload as StrategyLog;
      setLogs(prev => [log, ...prev].slice(0, 100)); // Keep last 100 logs
    });

    // Listen for signal evaluations
    await listen('signal_evaluation', (event) => {
      const evaluation = event.payload as SignalEvaluation;
      setEvaluations(prev => [evaluation, ...prev].slice(0, 50)); // Keep last 50 evaluations
    });

    // Listen for loop execution events
    await listen('strategy_loop_execution', (event) => {
      console.log('Strategy loop execution:', event.payload);
      loadState(); // Refresh state
    });

    // Listen for strategy errors
    await listen('strategy_error', (event) => {
      console.error('Strategy error:', event.payload);
      loadState(); // Refresh state
    });

    // Listen for order events
    await listen('strategy_order_placed', (event) => {
      console.log('Strategy order placed:', event.payload);
    });

    await listen('strategy_order_failed', (event) => {
      console.error('Strategy order failed:', event.payload);
    });
  };

  const startLoop = async () => {
    setIsLoading(true);
    try {
      await invoke('start_strategy_loop');
      await loadState();
    } catch (error) {
      console.error('Failed to start strategy loop:', error);
      alert(`Failed to start strategy loop: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const stopLoop = async () => {
    setIsLoading(true);
    try {
      await invoke('stop_strategy_loop');
      await loadState();
    } catch (error) {
      console.error('Failed to stop strategy loop:', error);
      alert(`Failed to stop strategy loop: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const updateConfig = async () => {
    setIsLoading(true);
    try {
      await invoke('update_strategy_loop_config', { config });
      await loadConfig();
      alert('Configuration updated successfully');
    } catch (error) {
      console.error('Failed to update config:', error);
      alert(`Failed to update config: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const resetState = async () => {
    if (!confirm('Are you sure you want to reset the strategy loop state?')) {
      return;
    }
    
    setIsLoading(true);
    try {
      await invoke('reset_strategy_loop_state');
      await loadState();
      setLogs([]);
      setEvaluations([]);
      alert('State reset successfully');
    } catch (error) {
      console.error('Failed to reset state:', error);
      alert(`Failed to reset state: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'Debug': return 'text-gray-500';
      case 'Info': return 'text-blue-600';
      case 'Warning': return 'text-yellow-600';
      case 'Error': return 'text-red-600';
      default: return 'text-gray-700';
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'Buy': return 'text-green-600';
      case 'Sell': return 'text-red-600';
      case 'Hold': return 'text-blue-600';
      case 'Close': return 'text-orange-600';
      case 'Skip': return 'text-gray-600';
      default: return 'text-gray-700';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Strategy Loop</h1>
        <p className="text-gray-600">
          Deterministic strategy execution with 5-minute cadence and structured logging
        </p>
      </div>

      {/* Status Panel */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Status</h2>
          <div className="flex space-x-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              state.running 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {state.running ? 'Running' : 'Stopped'}
            </span>
            {config.dry_run && (
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                Dry Run
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{state.execution_count}</div>
            <div className="text-sm text-gray-500">Executions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{state.error_count}</div>
            <div className="text-sm text-gray-500">Errors</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{Object.keys(state.signal_cooldowns).length}</div>
            <div className="text-sm text-gray-500">Active Symbols</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{evaluations.length}</div>
            <div className="text-sm text-gray-500">Evaluations</div>
          </div>
        </div>

        {state.last_execution > 0 && (
          <div className="text-sm text-gray-600">
            Last execution: {formatTimestamp(state.last_execution)}
          </div>
        )}

        {state.last_error && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="text-sm text-red-800">
              <strong>Last Error:</strong> {state.last_error}
            </div>
          </div>
        )}

        <div className="flex space-x-3 mt-4">
          <button
            onClick={state.running ? stopLoop : startLoop}
            disabled={isLoading}
            className={`px-4 py-2 rounded-md font-medium ${
              state.running
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            } disabled:opacity-50`}
          >
            {isLoading ? 'Loading...' : (state.running ? 'Stop Loop' : 'Start Loop')}
          </button>
          <button
            onClick={resetState}
            disabled={isLoading || state.running}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md font-medium disabled:opacity-50"
          >
            Reset State
          </button>
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Configuration</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Enabled
            </label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
              disabled={state.running}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cadence (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="60"
              value={config.cadence_minutes}
              onChange={(e) => setConfig(prev => ({ ...prev, cadence_minutes: parseInt(e.target.value) || 5 }))}
              disabled={state.running}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Concurrent Signals
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={config.max_concurrent_signals}
              onChange={(e) => setConfig(prev => ({ ...prev, max_concurrent_signals: parseInt(e.target.value) || 10 }))}
              disabled={state.running}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cooldown (seconds)
            </label>
            <input
              type="number"
              min="0"
              max="3600"
              value={config.cooldown_seconds}
              onChange={(e) => setConfig(prev => ({ ...prev, cooldown_seconds: parseInt(e.target.value) || 300 }))}
              disabled={state.running}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Log Level
            </label>
            <select
              value={config.log_level}
              onChange={(e) => setConfig(prev => ({ ...prev, log_level: e.target.value as any }))}
              disabled={state.running}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Debug">Debug</option>
              <option value="Info">Info</option>
              <option value="Warning">Warning</option>
              <option value="Error">Error</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dry Run
            </label>
            <input
              type="checkbox"
              checked={config.dry_run}
              onChange={(e) => setConfig(prev => ({ ...prev, dry_run: e.target.checked }))}
              disabled={state.running}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>
        </div>

        <button
          onClick={updateConfig}
          disabled={isLoading || state.running}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50"
        >
          Update Configuration
        </button>
      </div>

      {/* Recent Evaluations */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Recent Signal Evaluations</h2>

        {evaluations.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No evaluations yet</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {evaluations.map((evaluation, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <span className="font-medium text-gray-900">{evaluation.symbol}</span>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${getActionColor(evaluation.decision.action)}`}>
                      {evaluation.decision.action}
                    </span>
                    <span className="text-sm text-gray-500">
                      {evaluation.signals.length} signals
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatTimestamp(evaluation.timestamp)}
                  </div>
                </div>

                <div className="text-sm text-gray-700 mb-2">
                  <strong>Reason:</strong> {evaluation.decision.reason}
                </div>

                {evaluation.signals.length > 0 && (
                  <div className="text-sm">
                    <strong>Signals:</strong>
                    <div className="ml-4 mt-1">
                      {evaluation.signals.map((signal, signalIndex) => (
                        <div key={signalIndex} className="flex items-center space-x-2">
                          <span className="font-medium">{signal.name}</span>
                          <span className={`px-1 py-0.5 rounded text-xs ${
                            signal.direction === 'Long' ? 'bg-green-100 text-green-800' :
                            signal.direction === 'Short' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {signal.direction}
                          </span>
                          <span className="text-gray-600">
                            {(signal.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500 mt-2">
                  Execution time: {evaluation.execution_time_ms}ms |
                  Bar: {formatTimestamp(evaluation.bar_timestamp)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Strategy Logs */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Strategy Logs</h2>

        {logs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No logs yet</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index} className="flex items-start space-x-3 py-2 border-b border-gray-100 last:border-b-0">
                <div className="text-xs text-gray-500 w-20 flex-shrink-0">
                  {formatTimestamp(log.timestamp).split(' ')[1]}
                </div>
                <div className={`text-xs px-2 py-1 rounded font-medium w-16 text-center flex-shrink-0 ${
                  log.level === 'Debug' ? 'bg-gray-100 text-gray-700' :
                  log.level === 'Info' ? 'bg-blue-100 text-blue-700' :
                  log.level === 'Warning' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {log.level}
                </div>
                <div className="text-xs text-gray-600 w-20 flex-shrink-0">
                  {log.category}
                </div>
                <div className="text-sm text-gray-900 flex-1">
                  {log.message}
                </div>
                {log.symbol && (
                  <div className="text-xs text-gray-500 w-16 flex-shrink-0">
                    {log.symbol}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
