"""
Market Pattern Recognition Module

This module provides advanced pattern recognition capabilities for options
trading, including technical patterns, market regime detection, and
anomaly identification using machine learning techniques.

Components:
- technical: Technical analysis pattern recognition
- regime: Market regime detection and classification
- anomaly: Anomaly detection in market behavior
- features: Feature extraction and engineering
- models: ML models for pattern recognition
"""

from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd
from datetime import datetime
from ..types import MarketState, MarketRegime, VolatilityEnvironment, AdaptiveVersion

__version__ = "1.0.0"

class PatternRecognizer:
    """Base class for market pattern recognition"""
    
    def __init__(self, version: Optional[AdaptiveVersion] = None):
        self.version = version or AdaptiveVersion()
        self.is_trained = False
        self.confidence_threshold = 0.7
    
    def detect_patterns(self, 
                       market_data: pd.DataFrame,
                       market_state: MarketState) -> Dict[str, Any]:
        """
        Detect patterns in market data.
        
        Args:
            market_data: Historical market data
            market_state: Current market state
            
        Returns:
            Dictionary of detected patterns with confidence scores
        """
        raise NotImplementedError("Subclasses must implement detect_patterns method")
    
    def train(self, training_data: pd.DataFrame) -> None:
        """Train the pattern recognition model"""
        raise NotImplementedError("Subclasses must implement train method")
    
    def get_pattern_strength(self, pattern_name: str, data: pd.DataFrame) -> float:
        """Get strength/confidence of a specific pattern"""
        raise NotImplementedError("Subclasses must implement get_pattern_strength method")

class RegimeDetector:
    """Market regime detection and classification"""
    
    def __init__(self, 
                 lookback_window: int = 20,
                 volatility_threshold: float = 0.02,
                 trend_threshold: float = 0.01,
                 version: Optional[AdaptiveVersion] = None):
        self.lookback_window = lookback_window
        self.volatility_threshold = volatility_threshold
        self.trend_threshold = trend_threshold
        self.version = version or AdaptiveVersion()
    
    def detect_regime(self, 
                     price_data: pd.Series,
                     volume_data: Optional[pd.Series] = None) -> MarketRegime:
        """
        Detect current market regime based on price and volume data.
        
        Args:
            price_data: Historical price series
            volume_data: Optional volume series
            
        Returns:
            Detected market regime
        """
        if len(price_data) < self.lookback_window:
            return MarketRegime.SIDEWAYS
        
        # Calculate recent returns
        returns = price_data.pct_change().dropna()
        recent_returns = returns.tail(self.lookback_window)
        
        # Calculate volatility
        volatility = recent_returns.std()
        
        # Calculate trend strength
        trend = recent_returns.mean()
        
        # Classify regime
        if volatility > self.volatility_threshold:
            return MarketRegime.HIGH_VOLATILITY
        elif abs(trend) > self.trend_threshold:
            if trend > 0:
                return MarketRegime.BULL
            else:
                return MarketRegime.BEAR
        else:
            return MarketRegime.SIDEWAYS
    
    def detect_volatility_environment(self, vix_level: float) -> VolatilityEnvironment:
        """Detect volatility environment based on VIX level"""
        if vix_level < 15:
            return VolatilityEnvironment.LOW
        elif vix_level < 25:
            return VolatilityEnvironment.NORMAL
        elif vix_level < 35:
            return VolatilityEnvironment.ELEVATED
        else:
            return VolatilityEnvironment.HIGH
    
    def get_regime_probability(self, 
                              price_data: pd.Series) -> Dict[MarketRegime, float]:
        """Get probability distribution over market regimes"""
        # Simplified implementation - can be enhanced with ML models
        regime = self.detect_regime(price_data)
        
        # Return high confidence for detected regime, low for others
        probabilities = {r: 0.1 for r in MarketRegime}
        probabilities[regime] = 0.7
        
        return probabilities

class TechnicalPatternDetector(PatternRecognizer):
    """Technical analysis pattern detection"""
    
    def __init__(self, version: Optional[AdaptiveVersion] = None):
        super().__init__(version)
        self.supported_patterns = [
            "head_and_shoulders",
            "double_top",
            "double_bottom", 
            "triangle",
            "flag",
            "pennant",
            "cup_and_handle",
            "wedge"
        ]
    
    def detect_patterns(self, 
                       market_data: pd.DataFrame,
                       market_state: MarketState) -> Dict[str, Any]:
        """Detect technical patterns in price data"""
        patterns = {}
        
        if 'close' not in market_data.columns:
            return patterns
        
        price_series = market_data['close']
        
        # Detect each supported pattern
        for pattern_name in self.supported_patterns:
            strength = self._detect_pattern(pattern_name, price_series)
            if strength > self.confidence_threshold:
                patterns[pattern_name] = {
                    'strength': strength,
                    'detected_at': datetime.now(),
                    'price_level': price_series.iloc[-1]
                }
        
        return patterns
    
    def _detect_pattern(self, pattern_name: str, price_series: pd.Series) -> float:
        """Detect specific technical pattern"""
        # Simplified pattern detection - can be enhanced with sophisticated algorithms
        
        if pattern_name == "head_and_shoulders":
            return self._detect_head_and_shoulders(price_series)
        elif pattern_name == "double_top":
            return self._detect_double_top(price_series)
        elif pattern_name == "triangle":
            return self._detect_triangle(price_series)
        else:
            return 0.0
    
    def _detect_head_and_shoulders(self, price_series: pd.Series) -> float:
        """Detect head and shoulders pattern"""
        if len(price_series) < 20:
            return 0.0
        
        # Simplified detection based on local maxima
        recent_prices = price_series.tail(20)
        
        # Find local maxima
        maxima = []
        for i in range(1, len(recent_prices) - 1):
            if (recent_prices.iloc[i] > recent_prices.iloc[i-1] and 
                recent_prices.iloc[i] > recent_prices.iloc[i+1]):
                maxima.append((i, recent_prices.iloc[i]))
        
        # Need at least 3 maxima for head and shoulders
        if len(maxima) < 3:
            return 0.0
        
        # Check if middle maximum is highest (head)
        if len(maxima) >= 3:
            left_shoulder = maxima[-3][1]
            head = maxima[-2][1]
            right_shoulder = maxima[-1][1]
            
            if head > left_shoulder and head > right_shoulder:
                # Calculate pattern strength based on symmetry
                shoulder_diff = abs(left_shoulder - right_shoulder) / head
                return max(0.0, 1.0 - shoulder_diff * 2)
        
        return 0.0
    
    def _detect_double_top(self, price_series: pd.Series) -> float:
        """Detect double top pattern"""
        if len(price_series) < 10:
            return 0.0
        
        recent_prices = price_series.tail(10)
        max_price = recent_prices.max()
        
        # Find peaks near the maximum
        peaks = []
        for i in range(1, len(recent_prices) - 1):
            if (recent_prices.iloc[i] > recent_prices.iloc[i-1] and 
                recent_prices.iloc[i] > recent_prices.iloc[i+1] and
                recent_prices.iloc[i] > max_price * 0.95):
                peaks.append(recent_prices.iloc[i])
        
        if len(peaks) >= 2:
            # Check if two highest peaks are similar
            peaks.sort(reverse=True)
            top1, top2 = peaks[0], peaks[1]
            similarity = 1.0 - abs(top1 - top2) / max(top1, top2)
            return similarity if similarity > 0.8 else 0.0
        
        return 0.0
    
    def _detect_triangle(self, price_series: pd.Series) -> float:
        """Detect triangle pattern"""
        if len(price_series) < 15:
            return 0.0
        
        recent_prices = price_series.tail(15)
        
        # Calculate trend lines for highs and lows
        highs = []
        lows = []
        
        for i in range(1, len(recent_prices) - 1):
            if (recent_prices.iloc[i] > recent_prices.iloc[i-1] and 
                recent_prices.iloc[i] > recent_prices.iloc[i+1]):
                highs.append((i, recent_prices.iloc[i]))
            elif (recent_prices.iloc[i] < recent_prices.iloc[i-1] and 
                  recent_prices.iloc[i] < recent_prices.iloc[i+1]):
                lows.append((i, recent_prices.iloc[i]))
        
        # Need at least 2 highs and 2 lows
        if len(highs) >= 2 and len(lows) >= 2:
            # Check if highs are descending and lows are ascending (converging)
            high_trend = (highs[-1][1] - highs[0][1]) / len(highs)
            low_trend = (lows[-1][1] - lows[0][1]) / len(lows)
            
            if high_trend < 0 and low_trend > 0:  # Converging triangle
                convergence_strength = abs(high_trend) + abs(low_trend)
                return min(1.0, convergence_strength * 10)
        
        return 0.0
    
    def train(self, training_data: pd.DataFrame) -> None:
        """Train pattern recognition models"""
        # TODO: Implement ML-based pattern recognition training
        self.is_trained = True
    
    def get_pattern_strength(self, pattern_name: str, data: pd.DataFrame) -> float:
        """Get strength of specific pattern"""
        if 'close' not in data.columns:
            return 0.0
        
        return self._detect_pattern(pattern_name, data['close'])

__all__ = [
    "PatternRecognizer",
    "RegimeDetector", 
    "TechnicalPatternDetector"
]
