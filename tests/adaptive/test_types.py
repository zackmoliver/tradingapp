"""
Unit Tests for Adaptive Intelligence Types

This module contains comprehensive unit tests for the core adaptive intelligence
types including MarketState, OptimizedStrategyParameters, and StrategyAllocation.

All tests use deterministic fixtures and prohibit external network calls.
"""

import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from adaptive.types import (
    MarketState,
    OptimizedStrategyParameters,
    StrategyAllocation,
    AdaptiveVersion,
    MarketRegime,
    VolatilityEnvironment
)


@pytest.mark.unit
@pytest.mark.adaptive
class TestAdaptiveVersion:
    """Test suite for AdaptiveVersion class"""
    
    def test_version_creation_with_defaults(self):
        """Test creating AdaptiveVersion with default values"""
        version = AdaptiveVersion()
        
        assert version.code_version == "1.0.0"
        assert version.data_snapshot is not None
        assert version.model_version is None
        assert version.training_epoch is None
        assert version.git_commit is None
        assert isinstance(version.created_at, datetime)
    
    def test_version_creation_with_custom_values(self):
        """Test creating AdaptiveVersion with custom values"""
        version = AdaptiveVersion(
            code_version="2.1.0",
            model_version="test_model_v2",
            training_epoch=500,
            git_commit="abc123def"
        )
        
        assert version.code_version == "2.1.0"
        assert version.model_version == "test_model_v2"
        assert version.training_epoch == 500
        assert version.git_commit == "abc123def"
    
    def test_version_to_dict(self, test_version):
        """Test converting AdaptiveVersion to dictionary"""
        version_dict = test_version.to_dict()
        
        required_keys = [
            'code_version', 'data_snapshot', 'model_version',
            'training_epoch', 'git_commit', 'created_at'
        ]
        
        for key in required_keys:
            assert key in version_dict
        
        assert version_dict['code_version'] == "1.0.0-test"
        assert version_dict['model_version'] == "test_model_v1"
        assert version_dict['training_epoch'] == 100


@pytest.mark.unit
@pytest.mark.adaptive
class TestMarketState:
    """Test suite for MarketState class"""
    
    def test_market_state_creation_with_defaults(self, test_version):
        """Test creating MarketState with default values"""
        market_state = MarketState(version=test_version)
        
        assert market_state.version == test_version
        assert market_state.underlying_price == 0.0
        assert market_state.regime == MarketRegime.SIDEWAYS
        assert market_state.volatility_environment == VolatilityEnvironment.NORMAL
        assert isinstance(market_state.timestamp, datetime)
        assert market_state.state_id is not None
    
    def test_market_state_creation_with_custom_values(self, test_version):
        """Test creating MarketState with custom values"""
        market_state = MarketState(
            version=test_version,
            underlying_price=450.0,
            implied_volatility=0.25,
            vix_level=18.5,
            regime=MarketRegime.BULL,
            volatility_environment=VolatilityEnvironment.LOW
        )
        
        assert market_state.underlying_price == 450.0
        assert market_state.implied_volatility == 0.25
        assert market_state.vix_level == 18.5
        assert market_state.regime == MarketRegime.BULL
        assert market_state.volatility_environment == VolatilityEnvironment.LOW
    
    def test_market_state_feature_vector(self, sample_market_state):
        """Test converting MarketState to feature vector"""
        features = sample_market_state.to_feature_vector()
        
        assert isinstance(features, dict)
        assert len(features) > 20  # Should have many features
        
        # Check for key features
        expected_features = [
            'underlying_price', 'implied_volatility', 'vix_level',
            'rsi_14', 'fear_greed_index'
        ]
        
        for feature in expected_features:
            assert feature in features
            assert isinstance(features[feature], (int, float))
        
        # Check regime one-hot encoding
        regime_features = [k for k in features.keys() if k.startswith('regime_')]
        assert len(regime_features) == len(MarketRegime)
        
        # Check volatility environment one-hot encoding
        vol_features = [k for k in features.keys() if k.startswith('vol_env_')]
        assert len(vol_features) == len(VolatilityEnvironment)
    
    def test_market_state_custom_features(self, test_version):
        """Test MarketState with custom features"""
        custom_features = {
            'custom_indicator_1': 0.75,
            'custom_indicator_2': -0.25,
            'custom_signal': 1.0
        }
        
        market_state = MarketState(
            version=test_version,
            custom_features=custom_features
        )
        
        features = market_state.to_feature_vector()
        
        for key, value in custom_features.items():
            assert key in features
            assert features[key] == value


@pytest.mark.unit
@pytest.mark.adaptive
class TestOptimizedStrategyParameters:
    """Test suite for OptimizedStrategyParameters class"""
    
    def test_parameters_creation_with_defaults(self, test_version):
        """Test creating OptimizedStrategyParameters with defaults"""
        params = OptimizedStrategyParameters(
            version=test_version,
            strategy_name="test_strategy"
        )
        
        assert params.version == test_version
        assert params.strategy_name == "test_strategy"
        assert params.optimization_id is not None
        assert params.parameters == {}
        assert params.expected_return == 0.0
        assert params.sharpe_ratio == 0.0
        assert params.optimization_method == "bayesian"
    
    def test_parameters_creation_with_custom_values(self, sample_optimized_parameters):
        """Test creating OptimizedStrategyParameters with custom values"""
        assert sample_optimized_parameters.strategy_name == "iron_condor"
        assert sample_optimized_parameters.expected_return == 0.15
        assert sample_optimized_parameters.sharpe_ratio == 1.25
        assert sample_optimized_parameters.win_rate == 0.72
        assert sample_optimized_parameters.optimization_score == 0.85
        
        # Check parameters dictionary
        assert 'strike_delta' in sample_optimized_parameters.parameters
        assert sample_optimized_parameters.parameters['strike_delta'] == 0.25
    
    def test_get_set_parameter(self, sample_optimized_parameters):
        """Test getting and setting individual parameters"""
        # Test getting existing parameter
        delta = sample_optimized_parameters.get_parameter('strike_delta')
        assert delta == 0.25
        
        # Test getting non-existent parameter with default
        missing = sample_optimized_parameters.get_parameter('missing_param', 'default')
        assert missing == 'default'
        
        # Test setting parameter
        sample_optimized_parameters.set_parameter('new_param', 42)
        assert sample_optimized_parameters.get_parameter('new_param') == 42
    
    def test_is_valid_for_market(self, sample_optimized_parameters, sample_market_state):
        """Test market validity check"""
        # Should be valid for sideways market (matching regime)
        sample_market_state.regime = MarketRegime.SIDEWAYS
        assert sample_optimized_parameters.is_valid_for_market(sample_market_state)
        
        # Should be invalid for bull market (different regime)
        sample_market_state.regime = MarketRegime.BULL
        assert not sample_optimized_parameters.is_valid_for_market(sample_market_state)
    
    def test_confidence_score_calculation(self, sample_optimized_parameters):
        """Test confidence score calculation"""
        confidence = sample_optimized_parameters.get_confidence_score()
        
        assert 0.0 <= confidence <= 1.0
        assert confidence > 0.5  # Should be reasonably confident with good scores


@pytest.mark.unit
@pytest.mark.adaptive
class TestStrategyAllocation:
    """Test suite for StrategyAllocation class"""
    
    def test_allocation_creation_with_defaults(self, test_version):
        """Test creating StrategyAllocation with defaults"""
        allocation = StrategyAllocation(version=test_version)
        
        assert allocation.version == test_version
        assert allocation.allocation_id is not None
        assert allocation.portfolio_name == "default"
        assert allocation.total_capital == 100000.0
        assert allocation.allocations == {}
        assert allocation.strategy_parameters == {}
    
    def test_add_strategy(self, test_version, sample_optimized_parameters):
        """Test adding strategies to allocation"""
        allocation = StrategyAllocation(version=test_version, total_capital=100000.0)
        
        # Add first strategy
        allocation.add_strategy("iron_condor", 0.6, sample_optimized_parameters)
        
        assert "iron_condor" in allocation.allocations
        assert allocation.allocations["iron_condor"] == 0.6
        assert "iron_condor" in allocation.strategy_parameters
        
        # Add second strategy (should normalize weights)
        allocation.add_strategy("wheel", 0.8, sample_optimized_parameters)
        
        # Weights should be normalized to sum to 1
        total_weight = sum(allocation.allocations.values())
        assert abs(total_weight - 1.0) < 0.001
    
    def test_remove_strategy(self, sample_strategy_allocation):
        """Test removing strategies from allocation"""
        initial_strategies = len(sample_strategy_allocation.allocations)
        
        sample_strategy_allocation.remove_strategy("wheel")
        
        assert "wheel" not in sample_strategy_allocation.allocations
        assert "wheel" not in sample_strategy_allocation.strategy_parameters
        assert len(sample_strategy_allocation.allocations) == initial_strategies - 1
    
    def test_get_strategy_capital(self, sample_strategy_allocation):
        """Test calculating strategy capital allocation"""
        iron_condor_capital = sample_strategy_allocation.get_strategy_capital("iron_condor")
        expected_capital = 100000.0 * 0.4  # 40% of total capital
        
        assert abs(iron_condor_capital - expected_capital) < 0.01
        
        # Test non-existent strategy
        missing_capital = sample_strategy_allocation.get_strategy_capital("missing")
        assert missing_capital == 0.0
    
    def test_is_balanced(self, sample_strategy_allocation):
        """Test allocation balance checking"""
        assert sample_strategy_allocation.is_balanced()
        
        # Create unbalanced allocation
        unbalanced = StrategyAllocation(total_capital=100000.0)
        unbalanced.allocations = {"strategy1": 0.7, "strategy2": 0.2}  # Sum = 0.9
        
        assert not unbalanced.is_balanced()
    
    def test_validate_constraints(self, sample_strategy_allocation):
        """Test constraint validation"""
        violations = sample_strategy_allocation.validate_constraints()
        
        # Should have no violations with default setup
        assert isinstance(violations, list)
        
        # Test constraint violation
        sample_strategy_allocation.allocations["iron_condor"] = 0.8  # Exceeds max
        violations = sample_strategy_allocation.validate_constraints()
        
        assert len(violations) > 0
        assert any("exceeds maximum" in v for v in violations)
    
    def test_diversification_ratio(self, sample_strategy_allocation):
        """Test diversification ratio calculation"""
        div_ratio = sample_strategy_allocation.get_diversification_ratio()
        
        assert div_ratio > 1.0  # Should be diversified
        assert div_ratio <= len(sample_strategy_allocation.allocations)
        
        # Test single strategy (no diversification)
        single_allocation = StrategyAllocation(total_capital=100000.0)
        single_allocation.allocations = {"single_strategy": 1.0}
        
        assert single_allocation.get_diversification_ratio() == 1.0


@pytest.mark.performance
@pytest.mark.adaptive
class TestPerformance:
    """Performance tests for adaptive types"""
    
    def test_market_state_feature_vector_performance(self, performance_timer, test_version):
        """Test performance of feature vector conversion"""
        market_state = MarketState(version=test_version, underlying_price=450.0)
        
        performance_timer.start()
        
        # Convert to feature vector multiple times
        for _ in range(1000):
            features = market_state.to_feature_vector()
        
        elapsed = performance_timer.stop()
        
        assert elapsed < 1.0  # Should complete within 1 second
        assert len(features) > 20  # Verify it actually worked
    
    def test_allocation_constraint_validation_performance(self, performance_timer, sample_strategy_allocation):
        """Test performance of constraint validation"""
        performance_timer.start()
        
        # Validate constraints multiple times
        for _ in range(1000):
            violations = sample_strategy_allocation.validate_constraints()
        
        elapsed = performance_timer.stop()
        
        assert elapsed < 0.5  # Should be very fast
        assert isinstance(violations, list)  # Verify it actually worked
