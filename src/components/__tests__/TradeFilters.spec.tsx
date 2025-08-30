import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TradeFiltersComponent } from '../TradeFilters';
import { TradeFilters } from '../../types/backtest';

describe('TradeFiltersComponent', () => {
  const mockOnFiltersChange = jest.fn();
  const mockOnFindTrades = jest.fn();
  const mockOnValidationChange = jest.fn();

  const defaultProps = {
    filters: {} as TradeFilters,
    onFiltersChange: mockOnFiltersChange,
    onFindTrades: mockOnFindTrades,
    isLoading: false,
    isValid: true,
    onValidationChange: mockOnValidationChange,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all filter inputs', () => {
    render(<TradeFiltersComponent {...defaultProps} />);

    expect(screen.getByLabelText('Symbol')).toBeInTheDocument();
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Strategy')).toBeInTheDocument();
    expect(screen.getByLabelText('Min Win Rate (%)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Drawdown (%)')).toBeInTheDocument();
  });

  it('shows Find Trades button', () => {
    render(<TradeFiltersComponent {...defaultProps} />);
    expect(screen.getByText('Find Trades')).toBeInTheDocument();
  });

  it('disables Find Trades button when invalid', () => {
    render(<TradeFiltersComponent {...defaultProps} isValid={false} />);
    const button = screen.getByText('Find Trades');
    expect(button).toBeDisabled();
  });

  it('disables Find Trades button when loading', () => {
    render(<TradeFiltersComponent {...defaultProps} isLoading={true} />);
    const button = screen.getByText('Finding Trades...');
    expect(button).toBeDisabled();
  });

  it('validates symbol input', async () => {
    render(<TradeFiltersComponent {...defaultProps} />);
    
    const symbolInput = screen.getByLabelText('Symbol');
    fireEvent.change(symbolInput, { target: { value: 'invalid123' } });

    await waitFor(() => {
      expect(mockOnValidationChange).toHaveBeenCalledWith(false);
    });
  });

  it('accepts valid symbol input', async () => {
    render(<TradeFiltersComponent {...defaultProps} />);
    
    const symbolInput = screen.getByLabelText('Symbol');
    fireEvent.change(symbolInput, { target: { value: 'SPY' } });

    await waitFor(() => {
      expect(mockOnValidationChange).toHaveBeenCalledWith(true);
    });
  });

  it('validates date format', async () => {
    render(<TradeFiltersComponent {...defaultProps} />);
    
    const startDateInput = screen.getByLabelText('Start Date');
    fireEvent.change(startDateInput, { target: { value: '2023-01-01' } });

    await waitFor(() => {
      expect(mockOnValidationChange).toHaveBeenCalledWith(false);
    });
  });

  it('accepts valid date format', async () => {
    render(<TradeFiltersComponent {...defaultProps} />);
    
    const startDateInput = screen.getByLabelText('Start Date');
    fireEvent.change(startDateInput, { target: { value: '01/01/2023' } });

    await waitFor(() => {
      expect(mockOnValidationChange).toHaveBeenCalledWith(true);
    });
  });

  it('calls onFindTrades when form is submitted', () => {
    render(<TradeFiltersComponent {...defaultProps} />);
    
    const form = screen.getByRole('button', { name: 'Find Trades' }).closest('form');
    fireEvent.submit(form!);

    expect(mockOnFindTrades).toHaveBeenCalled();
  });
});
