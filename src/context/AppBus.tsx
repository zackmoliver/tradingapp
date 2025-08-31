// src/context/AppBus.tsx
// Tiny event bus for cross-component communication

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface BacktestParams {
  ticker: string;
  start_date: string;  // MM/DD/YYYY
  end_date: string;    // MM/DD/YYYY
  strategy: 'PMCC' | 'Wheel' | 'CoveredCall' | 'iron_condor' | 'bull_put_spread';
  initial_capital: number;
  seed?: number;
}

export interface StrategyParams {
  threshold?: number;
  lookback?: number;
  [key: string]: any;
}

interface AppBusContextType {
  // Backtest parameters sharing
  backtestParams: BacktestParams | null;
  setBacktestParams: (params: BacktestParams) => void;
  
  // Strategy parameters sharing
  strategyParams: StrategyParams | null;
  setStrategyParams: (params: StrategyParams) => void;
  
  // Navigation helper
  navigateToBacktest: () => void;
  onNavigateToBacktest: (callback: () => void) => void;
}

const AppBusContext = createContext<AppBusContextType | undefined>(undefined);

export function AppBusProvider({ children }: { children: ReactNode }) {
  const [backtestParams, setBacktestParams] = useState<BacktestParams | null>(null);
  const [strategyParams, setStrategyParams] = useState<StrategyParams | null>(null);
  const [navigationCallback, setNavigationCallback] = useState<(() => void) | null>(null);

  const navigateToBacktest = useCallback(() => {
    if (navigationCallback) {
      navigationCallback();
    }
  }, [navigationCallback]);

  const onNavigateToBacktest = useCallback((callback: () => void) => {
    setNavigationCallback(() => callback);
  }, []);

  return (
    <AppBusContext.Provider value={{
      backtestParams,
      setBacktestParams,
      strategyParams,
      setStrategyParams,
      navigateToBacktest,
      onNavigateToBacktest,
    }}>
      {children}
    </AppBusContext.Provider>
  );
}

export function useAppBus() {
  const context = useContext(AppBusContext);
  if (context === undefined) {
    throw new Error('useAppBus must be used within an AppBusProvider');
  }
  return context;
}
