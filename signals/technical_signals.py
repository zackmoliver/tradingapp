"""
Technical Analysis Signals - Options Trading Backtest Engine

Core technical analysis signals using pandas_ta for indicator calculations.
Each signal follows the registry protocol and returns standardized signal objects.

BUSINESS LOGIC IMPLEMENTATION
"""

import pandas as pd
import pandas_ta as ta
import numpy as np
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, List, Optional
import uuid
import logging

# Import signal registry components
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from src.signals.registry import (
    signal, SignalInput, SignalOutput, SignalType, SignalStrength, SignalCategory
)

logger = logging.getLogger(__name__)


def _convert_ohlcv_to_dataframe(historical_data: List) -> pd.DataFrame:
    """
    Convert OHLCV bar data to pandas DataFrame for technical analysis.
    
    Args:
        historical_data: List of OHLCVBar objects
        
    Returns:
        DataFrame with OHLCV data indexed by timestamp
    """
    if not historical_data:
        return pd.DataFrame()
    
    data = []
    for bar in historical_data:
        data.append({
            'timestamp': bar.timestamp,
            'open': float(bar.open),
            'high': float(bar.high),
            'low': float(bar.low),
            'close': float(bar.close),
            'volume': int(bar.volume)
        })
    
    df = pd.DataFrame(data)
    df.set_index('timestamp', inplace=True)
    df.sort_index(inplace=True)
    
    return df


def _calculate_signal_strength(confidence: float) -> SignalStrength:
    """
    Convert confidence score to signal strength enum.
    
    Args:
        confidence: Confidence score (0.0 to 1.0)
        
    Returns:
        SignalStrength enum value
    """
    if confidence >= 0.7:
        return SignalStrength.STRONG
    elif confidence >= 0.4:
        return SignalStrength.MODERATE
    else:
        return SignalStrength.WEAK


@signal(
    name="rsi_signal",
    description="RSI-based trading signal detecting overbought/oversold conditions",
    category=SignalCategory.MOMENTUM,
    version="1.0.0",
    author="TradingEngine",
    parameters_schema={
        "type": "object",
        "properties": {
            "rsi_period": {"type": "integer", "default": 14, "minimum": 2, "maximum": 100},
            "oversold_threshold": {"type": "number", "default": 30, "minimum": 10, "maximum": 40},
            "overbought_threshold": {"type": "number", "default": 70, "minimum": 60, "maximum": 90},
            "min_confidence": {"type": "number", "default": 0.6, "minimum": 0.1, "maximum": 1.0}
        }
    },
    required_data=["ohlcv"],
    lookback_periods=20,
    tags=["rsi", "momentum", "overbought", "oversold", "technical"]
)
def rsi_signal(input_data: SignalInput) -> SignalOutput:
    """
    Generate trading signals based on RSI (Relative Strength Index).
    
    RSI is a momentum oscillator that measures the speed and change of price movements.
    - RSI < oversold_threshold (default 30): Potential BUY signal (oversold)
    - RSI > overbought_threshold (default 70): Potential SELL signal (overbought)
    - Otherwise: HOLD signal
    
    Args:
        input_data: SignalInput containing market data and parameters
        
    Returns:
        SignalOutput with RSI-based trading signal
    """
    try:
        # Extract parameters with defaults
        params = input_data.parameters
        rsi_period = params.get('rsi_period', 14)
        oversold_threshold = params.get('oversold_threshold', 30)
        overbought_threshold = params.get('overbought_threshold', 70)
        min_confidence = params.get('min_confidence', 0.6)
        
        # Convert historical data to DataFrame
        df = _convert_ohlcv_to_dataframe(input_data.historical_data)
        
        if len(df) < rsi_period + 1:
            # Insufficient data for RSI calculation
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.HOLD,
                strength=SignalStrength.WEAK,
                confidence=Decimal('0.1'),
                target_price=input_data.current_price,
                target_quantity=None,
                stop_loss=None,
                take_profit=None,
                expiry=None,
                reasoning=f"Insufficient data for RSI calculation (need {rsi_period + 1}, have {len(df)})",
                supporting_data={"data_points": len(df), "required": rsi_period + 1},
                metadata={"signal_name": "rsi_signal", "timestamp": input_data.timestamp.isoformat()}
            )
        
        # Calculate RSI using pandas_ta
        rsi_series = ta.rsi(df['close'], length=rsi_period)
        current_rsi = rsi_series.iloc[-1]
        
        # Determine signal type and confidence
        if pd.isna(current_rsi):
            signal_type = SignalType.HOLD
            confidence = 0.1
            reasoning = "RSI calculation returned NaN"
        elif current_rsi <= oversold_threshold:
            # Oversold condition - potential buy signal
            signal_type = SignalType.BUY
            # Confidence increases as RSI gets more oversold
            confidence = min(1.0, (oversold_threshold - current_rsi) / oversold_threshold + min_confidence)
            reasoning = f"RSI oversold condition: {current_rsi:.2f} <= {oversold_threshold}"
        elif current_rsi >= overbought_threshold:
            # Overbought condition - potential sell signal
            signal_type = SignalType.SELL
            # Confidence increases as RSI gets more overbought
            confidence = min(1.0, (current_rsi - overbought_threshold) / (100 - overbought_threshold) + min_confidence)
            reasoning = f"RSI overbought condition: {current_rsi:.2f} >= {overbought_threshold}"
        else:
            # Neutral zone - hold
            signal_type = SignalType.HOLD
            confidence = 0.3
            reasoning = f"RSI in neutral zone: {current_rsi:.2f} (between {oversold_threshold} and {overbought_threshold})"
        
        # Calculate target prices based on signal type
        current_price = input_data.current_price
        if signal_type == SignalType.BUY:
            target_price = current_price * Decimal('1.02')  # 2% upside target
            stop_loss = current_price * Decimal('0.98')     # 2% downside protection
            take_profit = current_price * Decimal('1.05')   # 5% profit target
        elif signal_type == SignalType.SELL:
            target_price = current_price * Decimal('0.98')  # 2% downside target
            stop_loss = current_price * Decimal('1.02')     # 2% upside protection
            take_profit = current_price * Decimal('0.95')   # 5% profit target
        else:
            target_price = current_price
            stop_loss = None
            take_profit = None
        
        # Calculate RSI trend for additional context
        rsi_trend = "neutral"
        if len(rsi_series) >= 3:
            recent_rsi = rsi_series.iloc[-3:].values
            if recent_rsi[-1] > recent_rsi[-2] > recent_rsi[-3]:
                rsi_trend = "rising"
            elif recent_rsi[-1] < recent_rsi[-2] < recent_rsi[-3]:
                rsi_trend = "falling"
        
        return SignalOutput(
            signal_id=str(uuid.uuid4()),
            signal_type=signal_type,
            strength=_calculate_signal_strength(confidence),
            confidence=Decimal(str(round(confidence, 3))),
            target_price=target_price,
            target_quantity=Decimal('100'),  # Default position size
            stop_loss=stop_loss,
            take_profit=take_profit,
            expiry=None,
            reasoning=reasoning,
            supporting_data={
                "current_rsi": round(current_rsi, 2),
                "rsi_period": rsi_period,
                "oversold_threshold": oversold_threshold,
                "overbought_threshold": overbought_threshold,
                "rsi_trend": rsi_trend,
                "data_points_used": len(df)
            },
            metadata={
                "signal_name": "rsi_signal",
                "timestamp": input_data.timestamp.isoformat(),
                "symbol": input_data.symbol,
                "current_price": float(input_data.current_price)
            }
        )
        
    except Exception as e:
        logger.error(f"RSI signal calculation failed: {e}")
        return SignalOutput(
            signal_id=str(uuid.uuid4()),
            signal_type=SignalType.HOLD,
            strength=SignalStrength.WEAK,
            confidence=Decimal('0.1'),
            target_price=input_data.current_price,
            target_quantity=None,
            stop_loss=None,
            take_profit=None,
            expiry=None,
            reasoning=f"RSI signal calculation error: {str(e)}",
            supporting_data={"error": str(e)},
            metadata={"signal_name": "rsi_signal", "timestamp": input_data.timestamp.isoformat()}
        )


@signal(
    name="macd_signal",
    description="MACD-based trading signal detecting momentum changes and crossovers",
    category=SignalCategory.MOMENTUM,
    version="1.0.0",
    author="TradingEngine",
    parameters_schema={
        "type": "object",
        "properties": {
            "fast_period": {"type": "integer", "default": 12, "minimum": 5, "maximum": 50},
            "slow_period": {"type": "integer", "default": 26, "minimum": 10, "maximum": 100},
            "signal_period": {"type": "integer", "default": 9, "minimum": 3, "maximum": 30},
            "min_confidence": {"type": "number", "default": 0.6, "minimum": 0.1, "maximum": 1.0}
        }
    },
    required_data=["ohlcv"],
    lookback_periods=35,
    tags=["macd", "momentum", "crossover", "technical"]
)
def macd_signal(input_data: SignalInput) -> SignalOutput:
    """
    Generate trading signals based on MACD (Moving Average Convergence Divergence).
    
    MACD is a trend-following momentum indicator that shows the relationship
    between two moving averages of a security's price.
    - MACD line crosses above signal line: Potential BUY signal
    - MACD line crosses below signal line: Potential SELL signal
    - MACD histogram provides additional momentum confirmation
    
    Args:
        input_data: SignalInput containing market data and parameters
        
    Returns:
        SignalOutput with MACD-based trading signal
    """
    try:
        # Extract parameters with defaults
        params = input_data.parameters
        fast_period = params.get('fast_period', 12)
        slow_period = params.get('slow_period', 26)
        signal_period = params.get('signal_period', 9)
        min_confidence = params.get('min_confidence', 0.6)
        
        # Convert historical data to DataFrame
        df = _convert_ohlcv_to_dataframe(input_data.historical_data)
        
        min_required = slow_period + signal_period + 2
        if len(df) < min_required:
            # Insufficient data for MACD calculation
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.HOLD,
                strength=SignalStrength.WEAK,
                confidence=Decimal('0.1'),
                target_price=input_data.current_price,
                target_quantity=None,
                stop_loss=None,
                take_profit=None,
                expiry=None,
                reasoning=f"Insufficient data for MACD calculation (need {min_required}, have {len(df)})",
                supporting_data={"data_points": len(df), "required": min_required},
                metadata={"signal_name": "macd_signal", "timestamp": input_data.timestamp.isoformat()}
            )
        
        # Calculate MACD using pandas_ta
        macd_data = ta.macd(df['close'], fast=fast_period, slow=slow_period, signal=signal_period)
        
        if macd_data is None or macd_data.empty:
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.HOLD,
                strength=SignalStrength.WEAK,
                confidence=Decimal('0.1'),
                target_price=input_data.current_price,
                target_quantity=None,
                stop_loss=None,
                take_profit=None,
                expiry=None,
                reasoning="MACD calculation returned empty result",
                supporting_data={},
                metadata={"signal_name": "macd_signal", "timestamp": input_data.timestamp.isoformat()}
            )
        
        # Extract MACD components
        macd_line = macd_data.iloc[:, 0]  # MACD line
        signal_line = macd_data.iloc[:, 1]  # Signal line
        histogram = macd_data.iloc[:, 2]  # MACD histogram
        
        # Get current and previous values
        current_macd = macd_line.iloc[-1]
        current_signal = signal_line.iloc[-1]
        current_histogram = histogram.iloc[-1]
        
        if len(macd_line) >= 2:
            prev_macd = macd_line.iloc[-2]
            prev_signal = signal_line.iloc[-2]
            prev_histogram = histogram.iloc[-2]
        else:
            prev_macd = current_macd
            prev_signal = current_signal
            prev_histogram = current_histogram
        
        # Check for any NaN values
        if pd.isna(current_macd) or pd.isna(current_signal) or pd.isna(current_histogram):
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.HOLD,
                strength=SignalStrength.WEAK,
                confidence=Decimal('0.1'),
                target_price=input_data.current_price,
                target_quantity=None,
                stop_loss=None,
                take_profit=None,
                expiry=None,
                reasoning="MACD calculation contains NaN values",
                supporting_data={},
                metadata={"signal_name": "macd_signal", "timestamp": input_data.timestamp.isoformat()}
            )
        
        # Determine signal based on crossovers
        signal_type = SignalType.HOLD
        confidence = 0.3
        reasoning = "No clear MACD signal"
        
        # Check for bullish crossover (MACD crosses above signal line)
        if prev_macd <= prev_signal and current_macd > current_signal:
            signal_type = SignalType.BUY
            # Confidence based on histogram strength and crossover magnitude
            crossover_strength = abs(current_macd - current_signal)
            histogram_strength = abs(current_histogram)
            confidence = min(1.0, min_confidence + (crossover_strength + histogram_strength) * 0.1)
            reasoning = f"MACD bullish crossover: MACD ({current_macd:.4f}) crossed above signal ({current_signal:.4f})"
            
        # Check for bearish crossover (MACD crosses below signal line)
        elif prev_macd >= prev_signal and current_macd < current_signal:
            signal_type = SignalType.SELL
            # Confidence based on histogram strength and crossover magnitude
            crossover_strength = abs(current_macd - current_signal)
            histogram_strength = abs(current_histogram)
            confidence = min(1.0, min_confidence + (crossover_strength + histogram_strength) * 0.1)
            reasoning = f"MACD bearish crossover: MACD ({current_macd:.4f}) crossed below signal ({current_signal:.4f})"
            
        # Check for histogram momentum confirmation
        elif current_histogram > 0 and prev_histogram <= 0:
            signal_type = SignalType.BUY
            confidence = min_confidence
            reasoning = f"MACD histogram turned positive: {current_histogram:.4f}"
            
        elif current_histogram < 0 and prev_histogram >= 0:
            signal_type = SignalType.SELL
            confidence = min_confidence
            reasoning = f"MACD histogram turned negative: {current_histogram:.4f}"
            
        # Calculate target prices
        current_price = input_data.current_price
        if signal_type == SignalType.BUY:
            target_price = current_price * Decimal('1.025')  # 2.5% upside target
            stop_loss = current_price * Decimal('0.985')     # 1.5% downside protection
            take_profit = current_price * Decimal('1.06')    # 6% profit target
        elif signal_type == SignalType.SELL:
            target_price = current_price * Decimal('0.975')  # 2.5% downside target
            stop_loss = current_price * Decimal('1.015')     # 1.5% upside protection
            take_profit = current_price * Decimal('0.94')    # 6% profit target
        else:
            target_price = current_price
            stop_loss = None
            take_profit = None
        
        return SignalOutput(
            signal_id=str(uuid.uuid4()),
            signal_type=signal_type,
            strength=_calculate_signal_strength(confidence),
            confidence=Decimal(str(round(confidence, 3))),
            target_price=target_price,
            target_quantity=Decimal('100'),  # Default position size
            stop_loss=stop_loss,
            take_profit=take_profit,
            expiry=None,
            reasoning=reasoning,
            supporting_data={
                "current_macd": round(current_macd, 4),
                "current_signal": round(current_signal, 4),
                "current_histogram": round(current_histogram, 4),
                "fast_period": fast_period,
                "slow_period": slow_period,
                "signal_period": signal_period,
                "data_points_used": len(df)
            },
            metadata={
                "signal_name": "macd_signal",
                "timestamp": input_data.timestamp.isoformat(),
                "symbol": input_data.symbol,
                "current_price": float(input_data.current_price)
            }
        )
        
    except Exception as e:
        logger.error(f"MACD signal calculation failed: {e}")
        return SignalOutput(
            signal_id=str(uuid.uuid4()),
            signal_type=SignalType.HOLD,
            strength=SignalStrength.WEAK,
            confidence=Decimal('0.1'),
            target_price=input_data.current_price,
            target_quantity=None,
            stop_loss=None,
            take_profit=None,
            expiry=None,
            reasoning=f"MACD signal calculation error: {str(e)}",
            supporting_data={"error": str(e)},
            metadata={"signal_name": "macd_signal", "timestamp": input_data.timestamp.isoformat()}
        )


@signal(
    name="sma_crossover_signal",
    description="SMA crossover trading signal detecting trend changes",
    category=SignalCategory.TECHNICAL,
    version="1.0.0",
    author="TradingEngine",
    parameters_schema={
        "type": "object",
        "properties": {
            "fast_period": {"type": "integer", "default": 10, "minimum": 3, "maximum": 50},
            "slow_period": {"type": "integer", "default": 20, "minimum": 10, "maximum": 200},
            "min_confidence": {"type": "number", "default": 0.6, "minimum": 0.1, "maximum": 1.0},
            "volume_confirmation": {"type": "boolean", "default": True}
        }
    },
    required_data=["ohlcv"],
    lookback_periods=25,
    tags=["sma", "crossover", "trend", "moving_average", "technical"]
)
def sma_crossover_signal(input_data: SignalInput) -> SignalOutput:
    """
    Generate trading signals based on SMA (Simple Moving Average) crossovers.

    SMA crossover is a classic trend-following strategy:
    - Fast SMA crosses above slow SMA: Potential BUY signal (golden cross)
    - Fast SMA crosses below slow SMA: Potential SELL signal (death cross)
    - Optional volume confirmation for stronger signals

    Args:
        input_data: SignalInput containing market data and parameters

    Returns:
        SignalOutput with SMA crossover-based trading signal
    """
    try:
        # Extract parameters with defaults
        params = input_data.parameters
        fast_period = params.get('fast_period', 10)
        slow_period = params.get('slow_period', 20)
        min_confidence = params.get('min_confidence', 0.6)
        volume_confirmation = params.get('volume_confirmation', True)

        # Validate parameters
        if fast_period >= slow_period:
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.HOLD,
                strength=SignalStrength.WEAK,
                confidence=Decimal('0.1'),
                target_price=input_data.current_price,
                target_quantity=None,
                stop_loss=None,
                take_profit=None,
                expiry=None,
                reasoning=f"Invalid parameters: fast_period ({fast_period}) must be less than slow_period ({slow_period})",
                supporting_data={"fast_period": fast_period, "slow_period": slow_period},
                metadata={"signal_name": "sma_crossover_signal", "timestamp": input_data.timestamp.isoformat()}
            )

        # Convert historical data to DataFrame
        df = _convert_ohlcv_to_dataframe(input_data.historical_data)

        min_required = slow_period + 2
        if len(df) < min_required:
            # Insufficient data for SMA calculation
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.HOLD,
                strength=SignalStrength.WEAK,
                confidence=Decimal('0.1'),
                target_price=input_data.current_price,
                target_quantity=None,
                stop_loss=None,
                take_profit=None,
                expiry=None,
                reasoning=f"Insufficient data for SMA calculation (need {min_required}, have {len(df)})",
                supporting_data={"data_points": len(df), "required": min_required},
                metadata={"signal_name": "sma_crossover_signal", "timestamp": input_data.timestamp.isoformat()}
            )

        # Calculate SMAs using pandas_ta
        fast_sma = ta.sma(df['close'], length=fast_period)
        slow_sma = ta.sma(df['close'], length=slow_period)

        # Get current and previous values
        current_fast = fast_sma.iloc[-1]
        current_slow = slow_sma.iloc[-1]

        if len(fast_sma) >= 2 and len(slow_sma) >= 2:
            prev_fast = fast_sma.iloc[-2]
            prev_slow = slow_sma.iloc[-2]
        else:
            prev_fast = current_fast
            prev_slow = current_slow

        # Check for NaN values
        if pd.isna(current_fast) or pd.isna(current_slow) or pd.isna(prev_fast) or pd.isna(prev_slow):
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.HOLD,
                strength=SignalStrength.WEAK,
                confidence=Decimal('0.1'),
                target_price=input_data.current_price,
                target_quantity=None,
                stop_loss=None,
                take_profit=None,
                expiry=None,
                reasoning="SMA calculation contains NaN values",
                supporting_data={},
                metadata={"signal_name": "sma_crossover_signal", "timestamp": input_data.timestamp.isoformat()}
            )

        # Calculate volume confirmation if enabled
        volume_factor = 1.0
        volume_reasoning = ""
        if volume_confirmation and len(df) >= 5:
            # Compare recent volume to average volume
            recent_volume = df['volume'].iloc[-3:].mean()
            avg_volume = df['volume'].mean()
            if recent_volume > avg_volume * 1.2:
                volume_factor = 1.2
                volume_reasoning = " with above-average volume confirmation"
            elif recent_volume < avg_volume * 0.8:
                volume_factor = 0.8
                volume_reasoning = " with below-average volume (weaker signal)"

        # Determine signal based on crossovers
        signal_type = SignalType.HOLD
        confidence = 0.3
        reasoning = "No SMA crossover detected"

        # Check for golden cross (fast SMA crosses above slow SMA)
        if prev_fast <= prev_slow and current_fast > current_slow:
            signal_type = SignalType.BUY
            # Confidence based on crossover magnitude and volume
            crossover_strength = (current_fast - current_slow) / current_slow
            confidence = min(1.0, min_confidence + crossover_strength * 10) * volume_factor
            reasoning = f"Golden cross: Fast SMA ({current_fast:.2f}) crossed above slow SMA ({current_slow:.2f}){volume_reasoning}"

        # Check for death cross (fast SMA crosses below slow SMA)
        elif prev_fast >= prev_slow and current_fast < current_slow:
            signal_type = SignalType.SELL
            # Confidence based on crossover magnitude and volume
            crossover_strength = (current_slow - current_fast) / current_slow
            confidence = min(1.0, min_confidence + crossover_strength * 10) * volume_factor
            reasoning = f"Death cross: Fast SMA ({current_fast:.2f}) crossed below slow SMA ({current_slow:.2f}){volume_reasoning}"

        # Check for trend continuation signals
        elif current_fast > current_slow and (current_fast - prev_fast) > 0:
            # Fast SMA above slow SMA and rising - weak buy signal
            if (current_fast - current_slow) / current_slow > 0.02:  # 2% separation
                signal_type = SignalType.BUY
                confidence = min_confidence * 0.7 * volume_factor
                reasoning = f"Uptrend continuation: Fast SMA ({current_fast:.2f}) well above slow SMA ({current_slow:.2f}){volume_reasoning}"

        elif current_fast < current_slow and (current_fast - prev_fast) < 0:
            # Fast SMA below slow SMA and falling - weak sell signal
            if (current_slow - current_fast) / current_slow > 0.02:  # 2% separation
                signal_type = SignalType.SELL
                confidence = min_confidence * 0.7 * volume_factor
                reasoning = f"Downtrend continuation: Fast SMA ({current_fast:.2f}) well below slow SMA ({current_slow:.2f}){volume_reasoning}"

        # Calculate target prices
        current_price = input_data.current_price
        if signal_type == SignalType.BUY:
            target_price = current_price * Decimal('1.03')   # 3% upside target
            stop_loss = current_price * Decimal('0.97')      # 3% downside protection
            take_profit = current_price * Decimal('1.08')    # 8% profit target
        elif signal_type == SignalType.SELL:
            target_price = current_price * Decimal('0.97')   # 3% downside target
            stop_loss = current_price * Decimal('1.03')      # 3% upside protection
            take_profit = current_price * Decimal('0.92')    # 8% profit target
        else:
            target_price = current_price
            stop_loss = None
            take_profit = None

        # Calculate SMA trend strength
        sma_spread = abs(current_fast - current_slow) / current_slow * 100
        trend_direction = "bullish" if current_fast > current_slow else "bearish"

        return SignalOutput(
            signal_id=str(uuid.uuid4()),
            signal_type=signal_type,
            strength=_calculate_signal_strength(confidence),
            confidence=Decimal(str(round(confidence, 3))),
            target_price=target_price,
            target_quantity=Decimal('100'),  # Default position size
            stop_loss=stop_loss,
            take_profit=take_profit,
            expiry=None,
            reasoning=reasoning,
            supporting_data={
                "current_fast_sma": round(current_fast, 2),
                "current_slow_sma": round(current_slow, 2),
                "sma_spread_percent": round(sma_spread, 2),
                "trend_direction": trend_direction,
                "fast_period": fast_period,
                "slow_period": slow_period,
                "volume_factor": round(volume_factor, 2),
                "data_points_used": len(df)
            },
            metadata={
                "signal_name": "sma_crossover_signal",
                "timestamp": input_data.timestamp.isoformat(),
                "symbol": input_data.symbol,
                "current_price": float(input_data.current_price)
            }
        )

    except Exception as e:
        logger.error(f"SMA crossover signal calculation failed: {e}")
        return SignalOutput(
            signal_id=str(uuid.uuid4()),
            signal_type=SignalType.HOLD,
            strength=SignalStrength.WEAK,
            confidence=Decimal('0.1'),
            target_price=input_data.current_price,
            target_quantity=None,
            stop_loss=None,
            take_profit=None,
            expiry=None,
            reasoning=f"SMA crossover signal calculation error: {str(e)}",
            supporting_data={"error": str(e)},
            metadata={"signal_name": "sma_crossover_signal", "timestamp": input_data.timestamp.isoformat()}
        )


# Signal validation and utility functions
def validate_technical_signal_input(input_data: SignalInput) -> List[str]:
    """
    Validate input data for technical signals.

    Args:
        input_data: SignalInput to validate

    Returns:
        List of validation error messages (empty if valid)
    """
    errors = []

    if not input_data.historical_data:
        errors.append("No historical data provided")

    if len(input_data.historical_data) < 2:
        errors.append("Insufficient historical data (minimum 2 bars required)")

    if input_data.current_price <= 0:
        errors.append("Invalid current price (must be positive)")

    return errors


def get_technical_signals_info() -> Dict[str, Any]:
    """
    Get information about available technical signals.

    Returns:
        Dictionary with signal information
    """
    return {
        "available_signals": [
            {
                "name": "rsi_signal",
                "description": "RSI-based momentum signal",
                "category": "momentum",
                "lookback_periods": 20,
                "parameters": ["rsi_period", "oversold_threshold", "overbought_threshold"]
            },
            {
                "name": "macd_signal",
                "description": "MACD crossover momentum signal",
                "category": "momentum",
                "lookback_periods": 35,
                "parameters": ["fast_period", "slow_period", "signal_period"]
            },
            {
                "name": "sma_crossover_signal",
                "description": "Simple moving average crossover signal",
                "category": "technical",
                "lookback_periods": 25,
                "parameters": ["fast_period", "slow_period", "volume_confirmation"]
            }
        ],
        "total_signals": 3,
        "categories": ["momentum", "technical"],
        "version": "1.0.0"
    }
