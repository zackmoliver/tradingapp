"""
Core Types for Adaptive Intelligence System

This module defines the fundamental data structures used throughout the adaptive
intelligence system, including market state representation, strategy parameters,
and allocation models. All types include version tracking for reproducibility
and system evolution tracking.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Union
from datetime import datetime
from enum import Enum
import uuid


class MarketRegime(Enum):
    """Market regime classification"""
    BULL = "bull"
    BEAR = "bear"
    SIDEWAYS = "sideways"
    HIGH_VOLATILITY = "high_volatility"
    LOW_VOLATILITY = "low_volatility"
    TRENDING = "trending"
    MEAN_REVERTING = "mean_reverting"


class VolatilityEnvironment(Enum):
    """Volatility environment classification"""
    LOW = "low"           # VIX < 15
    NORMAL = "normal"     # VIX 15-25
    ELEVATED = "elevated" # VIX 25-35
    HIGH = "high"         # VIX > 35


@dataclass
class AdaptiveVersion:
    """Version tracking for adaptive intelligence components"""
    code_version: str = "1.0.0"
    data_snapshot: str = field(default_factory=lambda: datetime.now().isoformat())
    model_version: Optional[str] = None
    training_epoch: Optional[int] = None
    git_commit: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "code_version": self.code_version,
            "data_snapshot": self.data_snapshot,
            "model_version": self.model_version,
            "training_epoch": self.training_epoch,
            "git_commit": self.git_commit,
            "created_at": self.created_at.isoformat()
        }


@dataclass
class MarketState:
    """
    Comprehensive market state representation for adaptive decision making.
    
    This class captures the current market environment across multiple dimensions
    to enable intelligent strategy selection and parameter optimization.
    """
    
    # Version tracking
    version: AdaptiveVersion = field(default_factory=AdaptiveVersion)
    
    # Unique identifier
    state_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    
    # Temporal information
    timestamp: datetime = field(default_factory=datetime.now)
    market_session: str = "regular"  # regular, pre_market, after_hours
    
    # Market regime classification
    regime: MarketRegime = MarketRegime.SIDEWAYS
    volatility_environment: VolatilityEnvironment = VolatilityEnvironment.NORMAL
    
    # Price and volatility metrics
    underlying_price: float = 0.0
    price_change_1d: float = 0.0
    price_change_5d: float = 0.0
    price_change_20d: float = 0.0
    
    # Volatility metrics
    implied_volatility: float = 0.0  # ATM IV
    historical_volatility_10d: float = 0.0
    historical_volatility_30d: float = 0.0
    vix_level: float = 0.0
    vix_change: float = 0.0
    
    # Options market metrics
    put_call_ratio: float = 1.0
    options_volume: int = 0
    max_pain: float = 0.0
    gamma_exposure: float = 0.0
    
    # Technical indicators
    rsi_14: float = 50.0
    macd_signal: float = 0.0
    bollinger_position: float = 0.5  # 0 = lower band, 1 = upper band
    
    # Market breadth
    advance_decline_ratio: float = 1.0
    new_highs_lows_ratio: float = 1.0
    
    # Economic indicators
    interest_rate_10y: float = 0.0
    dollar_index: float = 100.0
    
    # Sentiment indicators
    fear_greed_index: float = 50.0
    analyst_sentiment: float = 0.0  # -1 to 1
    
    # Market structure
    bid_ask_spread: float = 0.0
    market_depth: float = 1.0
    
    # Additional context
    earnings_days_until: Optional[int] = None
    dividend_days_until: Optional[int] = None
    fomc_days_until: Optional[int] = None
    
    # Custom features for ML models
    custom_features: Dict[str, float] = field(default_factory=dict)
    
    def to_feature_vector(self) -> Dict[str, float]:
        """Convert market state to feature vector for ML models"""
        features = {
            "underlying_price": self.underlying_price,
            "price_change_1d": self.price_change_1d,
            "price_change_5d": self.price_change_5d,
            "price_change_20d": self.price_change_20d,
            "implied_volatility": self.implied_volatility,
            "historical_volatility_10d": self.historical_volatility_10d,
            "historical_volatility_30d": self.historical_volatility_30d,
            "vix_level": self.vix_level,
            "vix_change": self.vix_change,
            "put_call_ratio": self.put_call_ratio,
            "rsi_14": self.rsi_14,
            "macd_signal": self.macd_signal,
            "bollinger_position": self.bollinger_position,
            "advance_decline_ratio": self.advance_decline_ratio,
            "fear_greed_index": self.fear_greed_index,
            "bid_ask_spread": self.bid_ask_spread,
            "market_depth": self.market_depth,
        }
        
        # Add regime as one-hot encoding
        for regime in MarketRegime:
            features[f"regime_{regime.value}"] = 1.0 if self.regime == regime else 0.0
            
        # Add volatility environment as one-hot encoding
        for vol_env in VolatilityEnvironment:
            features[f"vol_env_{vol_env.value}"] = 1.0 if self.volatility_environment == vol_env else 0.0
            
        # Add custom features
        features.update(self.custom_features)
        
        return features


@dataclass
class OptimizedStrategyParameters:
    """
    Optimized parameters for a specific options trading strategy.
    
    This class holds the results of parameter optimization for a given strategy
    in a specific market environment, including confidence metrics and
    performance expectations.
    """
    
    # Version tracking
    version: AdaptiveVersion = field(default_factory=AdaptiveVersion)
    
    # Identification
    strategy_name: str = ""
    optimization_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    
    # Market context
    market_state_id: str = ""
    optimized_for_regime: MarketRegime = MarketRegime.SIDEWAYS
    
    # Core strategy parameters
    parameters: Dict[str, Any] = field(default_factory=dict)
    
    # Optimization results
    expected_return: float = 0.0
    expected_volatility: float = 0.0
    sharpe_ratio: float = 0.0
    max_drawdown: float = 0.0
    win_rate: float = 0.0
    
    # Confidence and robustness metrics
    optimization_score: float = 0.0  # 0-1, higher is better
    parameter_stability: float = 0.0  # 0-1, stability across different optimizations
    out_of_sample_performance: float = 0.0  # Performance on validation data
    
    # Risk metrics
    var_95: float = 0.0  # Value at Risk (95%)
    expected_shortfall: float = 0.0  # Expected loss beyond VaR
    maximum_loss: float = 0.0  # Maximum single trade loss
    
    # Optimization metadata
    optimization_method: str = "bayesian"  # bayesian, genetic, grid_search, etc.
    optimization_iterations: int = 0
    optimization_duration_seconds: float = 0.0
    
    # Validation results
    backtest_start_date: Optional[str] = None
    backtest_end_date: Optional[str] = None
    backtest_trades: int = 0
    backtest_pnl: float = 0.0
    
    # Parameter bounds and constraints
    parameter_bounds: Dict[str, tuple] = field(default_factory=dict)
    constraints: List[str] = field(default_factory=list)
    
    # Sensitivity analysis
    parameter_sensitivity: Dict[str, float] = field(default_factory=dict)
    
    def get_parameter(self, name: str, default: Any = None) -> Any:
        """Get a specific parameter value"""
        return self.parameters.get(name, default)
    
    def set_parameter(self, name: str, value: Any) -> None:
        """Set a specific parameter value"""
        self.parameters[name] = value
    
    def is_valid_for_market(self, market_state: MarketState) -> bool:
        """Check if these parameters are valid for the given market state"""
        # Simple regime matching - can be enhanced with more sophisticated logic
        return self.optimized_for_regime == market_state.regime
    
    def get_confidence_score(self) -> float:
        """Calculate overall confidence in these parameters"""
        scores = [
            self.optimization_score,
            self.parameter_stability,
            self.out_of_sample_performance
        ]
        return sum(s for s in scores if s > 0) / len([s for s in scores if s > 0])


@dataclass
class StrategyAllocation:
    """
    Portfolio allocation across multiple options strategies.
    
    This class represents the optimal allocation of capital across different
    options strategies based on current market conditions and risk preferences.
    """
    
    # Version tracking
    version: AdaptiveVersion = field(default_factory=AdaptiveVersion)
    
    # Identification
    allocation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    portfolio_name: str = "default"
    
    # Market context
    market_state_id: str = ""
    allocation_timestamp: datetime = field(default_factory=datetime.now)
    
    # Strategy allocations (strategy_name -> allocation_weight)
    allocations: Dict[str, float] = field(default_factory=dict)
    
    # Strategy parameters for each allocated strategy
    strategy_parameters: Dict[str, OptimizedStrategyParameters] = field(default_factory=dict)
    
    # Portfolio metrics
    total_capital: float = 100000.0
    expected_portfolio_return: float = 0.0
    expected_portfolio_volatility: float = 0.0
    portfolio_sharpe_ratio: float = 0.0
    portfolio_max_drawdown: float = 0.0
    
    # Risk metrics
    portfolio_var_95: float = 0.0
    portfolio_expected_shortfall: float = 0.0
    correlation_matrix: Dict[str, Dict[str, float]] = field(default_factory=dict)
    
    # Allocation constraints
    max_single_strategy_weight: float = 0.5
    min_strategy_weight: float = 0.05
    max_total_risk: float = 0.2
    
    # Rebalancing information
    rebalance_frequency: str = "weekly"  # daily, weekly, monthly
    last_rebalance: Optional[datetime] = None
    next_rebalance: Optional[datetime] = None
    
    # Performance tracking
    inception_date: datetime = field(default_factory=datetime.now)
    total_return: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0
    
    def add_strategy(self, strategy_name: str, weight: float, 
                    parameters: OptimizedStrategyParameters) -> None:
        """Add a strategy to the allocation"""
        if weight < 0 or weight > 1:
            raise ValueError("Weight must be between 0 and 1")
            
        self.allocations[strategy_name] = weight
        self.strategy_parameters[strategy_name] = parameters
        
        # Normalize weights to sum to 1
        total_weight = sum(self.allocations.values())
        if total_weight > 1.0:
            for name in self.allocations:
                self.allocations[name] /= total_weight
    
    def remove_strategy(self, strategy_name: str) -> None:
        """Remove a strategy from the allocation"""
        if strategy_name in self.allocations:
            del self.allocations[strategy_name]
        if strategy_name in self.strategy_parameters:
            del self.strategy_parameters[strategy_name]
    
    def get_strategy_capital(self, strategy_name: str) -> float:
        """Get allocated capital for a specific strategy"""
        weight = self.allocations.get(strategy_name, 0.0)
        return self.total_capital * weight
    
    def is_balanced(self, tolerance: float = 0.01) -> bool:
        """Check if allocation weights sum to approximately 1"""
        total_weight = sum(self.allocations.values())
        return abs(total_weight - 1.0) <= tolerance
    
    def get_diversification_ratio(self) -> float:
        """Calculate portfolio diversification ratio"""
        if len(self.allocations) <= 1:
            return 1.0
        
        # Simple diversification measure based on weight distribution
        weights = list(self.allocations.values())
        if not weights:
            return 1.0
            
        # Herfindahl-Hirschman Index (inverted for diversification)
        hhi = sum(w**2 for w in weights)
        return 1.0 / hhi if hhi > 0 else 1.0
    
    def validate_constraints(self) -> List[str]:
        """Validate allocation against constraints"""
        violations = []
        
        for strategy_name, weight in self.allocations.items():
            if weight > self.max_single_strategy_weight:
                violations.append(f"{strategy_name} weight {weight:.2%} exceeds maximum {self.max_single_strategy_weight:.2%}")
            
            if weight < self.min_strategy_weight and weight > 0:
                violations.append(f"{strategy_name} weight {weight:.2%} below minimum {self.min_strategy_weight:.2%}")
        
        if not self.is_balanced():
            total = sum(self.allocations.values())
            violations.append(f"Total allocation {total:.2%} does not sum to 100%")
        
        return violations
