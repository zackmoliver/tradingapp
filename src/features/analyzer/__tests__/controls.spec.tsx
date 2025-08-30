import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { IndicatorToggle } from '../controls/IndicatorToggle';
import { ParamSlider } from '../controls/ParamSlider';
import { AVAILABLE_INDICATORS } from '../types';

describe('IndicatorToggle', () => {
  const mockIndicator = AVAILABLE_INDICATORS.find(i => i.id === 'rsi');
  const mockOnToggle = jest.fn();

  beforeEach(() => {
    mockOnToggle.mockClear();
  });

  it('renders indicator information correctly', () => {
    if (!mockIndicator) return;

    render(
      <IndicatorToggle
        indicator={mockIndicator}
        enabled={false}
        onToggle={mockOnToggle}
      />
    );

    expect(screen.getByText('RSI')).toBeInTheDocument();
    expect(screen.getByText('Relative Strength Index')).toBeInTheDocument();
  });

  it('shows active state when enabled', () => {
    if (!mockIndicator) return;

    render(
      <IndicatorToggle
        indicator={mockIndicator}
        enabled={true}
        onToggle={mockOnToggle}
      />
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('does not show active state when disabled', () => {
    if (!mockIndicator) return;

    render(
      <IndicatorToggle
        indicator={mockIndicator}
        enabled={false}
        onToggle={mockOnToggle}
      />
    );

    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('calls onToggle when checkbox is clicked', () => {
    if (!mockIndicator) return;

    render(
      <IndicatorToggle
        indicator={mockIndicator}
        enabled={false}
        onToggle={mockOnToggle}
      />
    );

    fireEvent.click(screen.getByRole('checkbox'));
    expect(mockOnToggle).toHaveBeenCalledWith('rsi', true);
  });

  it('calls onToggle when label is clicked', () => {
    if (!mockIndicator) return;

    render(
      <IndicatorToggle
        indicator={mockIndicator}
        enabled={false}
        onToggle={mockOnToggle}
      />
    );

    fireEvent.click(screen.getByText('RSI'));
    expect(mockOnToggle).toHaveBeenCalledWith('rsi', true);
  });
});

describe('ParamSlider', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  describe('number type slider', () => {
    it('renders number slider correctly', () => {
      render(
        <ParamSlider
          paramKey="rsi_length"
          label="RSI Period"
          type="number"
          value={14}
          min={5}
          max={50}
          step={1}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('RSI Period')).toBeInTheDocument();
      expect(screen.getByRole('spinbutton')).toHaveValue(14);
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('calls onChange when slider is moved', () => {
      render(
        <ParamSlider
          paramKey="rsi_length"
          label="RSI Period"
          type="number"
          value={14}
          min={5}
          max={50}
          step={1}
          onChange={mockOnChange}
        />
      );

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '20' } });
      expect(mockOnChange).toHaveBeenCalledWith('rsi_length', 20);
    });

    it('calls onChange when input is changed', () => {
      render(
        <ParamSlider
          paramKey="rsi_length"
          label="RSI Period"
          type="number"
          value={14}
          min={5}
          max={50}
          step={1}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '25' } });
      expect(mockOnChange).toHaveBeenCalledWith('rsi_length', 25);
    });

    it('shows min and max values', () => {
      render(
        <ParamSlider
          paramKey="rsi_length"
          label="RSI Period"
          type="number"
          value={14}
          min={5}
          max={50}
          step={1}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('handles disabled state', () => {
      render(
        <ParamSlider
          paramKey="rsi_length"
          label="RSI Period"
          type="number"
          value={14}
          min={5}
          max={50}
          step={1}
          onChange={mockOnChange}
          disabled={true}
        />
      );

      const slider = screen.getByRole('slider');
      const input = screen.getByRole('spinbutton');

      expect(slider).toBeDisabled();
      expect(input).toBeDisabled();
    });
  });

  describe('select type slider', () => {
    const options = [
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'monthly', label: 'Monthly' }
    ];

    it('renders select correctly', () => {
      render(
        <ParamSlider
          paramKey="vwap_session_reset"
          label="Session Reset"
          type="select"
          value="daily"
          options={options}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('Session Reset')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Daily')).toBeInTheDocument();
    });

    it('shows all options', () => {
      render(
        <ParamSlider
          paramKey="vwap_session_reset"
          label="Session Reset"
          type="select"
          value="daily"
          options={options}
          onChange={mockOnChange}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      
      // Check that options exist in the DOM
      options.forEach(option => {
        expect(screen.getByText(option.label)).toBeInTheDocument();
      });
    });

    it('calls onChange when selection changes', () => {
      render(
        <ParamSlider
          paramKey="vwap_session_reset"
          label="Session Reset"
          type="select"
          value="daily"
          options={options}
          onChange={mockOnChange}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'weekly' } });
      expect(mockOnChange).toHaveBeenCalledWith('vwap_session_reset', 'weekly');
    });

    it('handles disabled state', () => {
      render(
        <ParamSlider
          paramKey="vwap_session_reset"
          label="Session Reset"
          type="select"
          value="daily"
          options={options}
          onChange={mockOnChange}
          disabled={true}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });
  });

  describe('edge cases', () => {
    it('handles invalid number input gracefully', () => {
      render(
        <ParamSlider
          paramKey="rsi_length"
          label="RSI Period"
          type="number"
          value={14}
          min={5}
          max={50}
          step={1}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: 'invalid' } });

      // Should not call onChange for invalid input
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('handles decimal values correctly', () => {
      render(
        <ParamSlider
          paramKey="bb_stddev"
          label="Standard Deviation"
          type="number"
          value={2.0}
          min={1}
          max={3}
          step={0.1}
          onChange={mockOnChange}
        />
      );

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '2.5' } });
      expect(mockOnChange).toHaveBeenCalledWith('bb_stddev', 2.5);
    });
  });
});
