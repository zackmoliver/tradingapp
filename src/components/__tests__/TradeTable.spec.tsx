import React from 'react';
import { render, screen } from '@testing-library/react';
import { TradeTable } from '../TradeTable';
import { TradeResult } from '../../types/backtest';

describe('TradeTable', () => {
  const mockTrades: TradeResult[] = [
    {
      date: '01/15/2024',
      symbol: 'SPY',
      strategy: 'iron_condor',
      entry: 450.00,
      exit: 465.00,
      pl: 15.00,
      win: true,
    },
    {
      date: '01/10/2024',
      symbol: 'QQQ',
      strategy: 'PMCC',
      entry: 380.00,
      exit: 375.00,
      pl: -5.00,
      win: false,
    },
  ];

  it('renders loading state', () => {
    render(<TradeTable trades={[]} isLoading={true} />);
    expect(screen.getByText('Loading trades...')).toBeInTheDocument();
  });

  it('renders empty state when no trades', () => {
    render(<TradeTable trades={[]} isLoading={false} />);
    expect(screen.getByText('No trades found')).toBeInTheDocument();
  });

  it('renders trade data correctly', () => {
    render(<TradeTable trades={mockTrades} isLoading={false} />);
    
    expect(screen.getByText('SPY')).toBeInTheDocument();
    expect(screen.getByText('QQQ')).toBeInTheDocument();
    expect(screen.getByText('iron_condor')).toBeInTheDocument();
    expect(screen.getByText('PMCC')).toBeInTheDocument();
    expect(screen.getByText('Win')).toBeInTheDocument();
    expect(screen.getByText('Loss')).toBeInTheDocument();
  });

  it('shows correct trade count', () => {
    render(<TradeTable trades={mockTrades} isLoading={false} />);
    expect(screen.getByText('Trade Results (2 trades)')).toBeInTheDocument();
  });

  it('calculates summary statistics correctly', () => {
    render(<TradeTable trades={mockTrades} isLoading={false} />);
    
    expect(screen.getByText('Total Trades:')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Win Rate:')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });
});
