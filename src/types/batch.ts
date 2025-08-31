// src/types/batch.ts
// Type definitions for batch backtest operations

import { BacktestParams, BacktestSummary, StrategyType } from './backtest';

export interface BatchBacktestItem {
  id: string;
  ticker: string;
  strategy: StrategyType;
  start_date: string; // MM/DD/YYYY
  end_date: string;   // MM/DD/YYYY
  initial_capital: number;
  seed?: number;
  status: BatchItemStatus;
  result?: BacktestSummary;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export type BatchItemStatus = 
  | 'pending'
  | 'running' 
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BatchBacktestConfig {
  tickers: string[];
  strategies: StrategyType[];
  start_date: string;
  end_date: string;
  initial_capital: number;
  seed?: number;
  // Generate all combinations of tickers x strategies
  generateCombinations: boolean;
}

export interface BatchBacktestProgress {
  total: number;
  completed: number;
  failed: number;
  running: boolean;
  currentItem?: BatchBacktestItem;
  startTime?: number;
  estimatedTimeRemaining?: number;
}

export interface BatchBacktestResults {
  items: BatchBacktestItem[];
  progress: BatchBacktestProgress;
  summary: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    totalDuration: number;
    averageDuration: number;
    bestPerformer?: {
      item: BatchBacktestItem;
      metric: 'cagr' | 'sharpe' | 'win_rate';
      value: number;
    };
    worstPerformer?: {
      item: BatchBacktestItem;
      metric: 'cagr' | 'sharpe' | 'win_rate';
      value: number;
    };
  };
}

export interface BatchCsvExportOptions {
  includeMetrics: boolean;
  includeTimestamps: boolean;
  includeErrors: boolean;
  sortBy?: 'ticker' | 'strategy' | 'cagr' | 'win_rate' | 'duration';
  sortOrder?: 'asc' | 'desc';
}

// Utility functions for batch operations
export const createBatchItem = (
  ticker: string,
  strategy: StrategyType,
  config: Omit<BatchBacktestConfig, 'tickers' | 'strategies' | 'generateCombinations'>
): BatchBacktestItem => ({
  id: `${ticker}_${strategy}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  ticker: ticker.toUpperCase(),
  strategy,
  start_date: config.start_date,
  end_date: config.end_date,
  initial_capital: config.initial_capital,
  seed: config.seed,
  status: 'pending',
});

export const generateBatchItems = (config: BatchBacktestConfig): BatchBacktestItem[] => {
  const items: BatchBacktestItem[] = [];
  
  if (config.generateCombinations) {
    // Generate all combinations of tickers x strategies
    for (const ticker of config.tickers) {
      for (const strategy of config.strategies) {
        items.push(createBatchItem(ticker, strategy, config));
      }
    }
  } else {
    // Generate items by pairing tickers and strategies in order
    const maxLength = Math.max(config.tickers.length, config.strategies.length);
    for (let i = 0; i < maxLength; i++) {
      const ticker = config.tickers[i % config.tickers.length];
      const strategy = config.strategies[i % config.strategies.length];
      items.push(createBatchItem(ticker, strategy, config));
    }
  }
  
  return items;
};

export const batchItemToBacktestParams = (item: BatchBacktestItem): BacktestParams => ({
  ticker: item.ticker,
  start_date: item.start_date,
  end_date: item.end_date,
  initial_capital: item.initial_capital,
  strategy: item.strategy,
  seed: item.seed,
});

export const calculateBatchProgress = (items: BatchBacktestItem[]): BatchBacktestProgress => {
  const total = items.length;
  const completed = items.filter(item => item.status === 'completed').length;
  const failed = items.filter(item => item.status === 'failed').length;
  const running = items.some(item => item.status === 'running');
  const currentItem = items.find(item => item.status === 'running');
  
  // Calculate estimated time remaining
  const completedItems = items.filter(item => 
    item.status === 'completed' && item.startTime && item.endTime
  );
  
  let estimatedTimeRemaining: number | undefined;
  if (completedItems.length > 0 && running) {
    const averageDuration = completedItems.reduce((sum, item) => 
      sum + (item.endTime! - item.startTime!), 0
    ) / completedItems.length;
    
    const remainingItems = total - completed - failed;
    estimatedTimeRemaining = averageDuration * remainingItems;
  }
  
  return {
    total,
    completed,
    failed,
    running,
    currentItem,
    estimatedTimeRemaining,
  };
};

export const getBatchSummary = (items: BatchBacktestItem[]) => {
  const completedItems = items.filter(item => 
    item.status === 'completed' && item.result
  );
  
  const totalRuns = items.length;
  const successfulRuns = completedItems.length;
  const failedRuns = items.filter(item => item.status === 'failed').length;
  
  const durations = items
    .filter(item => item.startTime && item.endTime)
    .map(item => item.endTime! - item.startTime!);
  
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
  const averageDuration = durations.length > 0 ? totalDuration / durations.length : 0;
  
  // Find best and worst performers
  let bestPerformer: any;
  let worstPerformer: any;
  
  if (completedItems.length > 0) {
    // Sort by CAGR for best/worst
    const sortedByCagr = [...completedItems].sort((a, b) => 
      (b.result?.cagr || 0) - (a.result?.cagr || 0)
    );
    
    if (sortedByCagr.length > 0) {
      bestPerformer = {
        item: sortedByCagr[0],
        metric: 'cagr' as const,
        value: sortedByCagr[0].result?.cagr || 0,
      };
      
      worstPerformer = {
        item: sortedByCagr[sortedByCagr.length - 1],
        metric: 'cagr' as const,
        value: sortedByCagr[sortedByCagr.length - 1].result?.cagr || 0,
      };
    }
  }
  
  return {
    totalRuns,
    successfulRuns,
    failedRuns,
    totalDuration,
    averageDuration,
    bestPerformer,
    worstPerformer,
  };
};
