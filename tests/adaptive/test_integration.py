"""
Integration Tests for Adaptive Intelligence Module

This module contains integration tests that verify the interaction between
different adaptive intelligence components and their integration with
backtest summary data.

All tests use deterministic fixtures and prohibit external network calls.
"""

import pytest
import json
import pandas as pd
from pathlib import Path
from unittest.mock import Mock, patch

from adaptive.types import (
    MarketState,
    OptimizedStrategyParameters,
    StrategyAllocation,
    MarketRegime,
    VolatilityEnvironment
)
from adaptive.pattern import RegimeDetector, TechnicalPatternDetector
from adaptive.optimizer import BaseOptimizer


@pytest.mark.integration
@pytest.mark.adaptive
class TestBacktestIntegration:
    """Test integration with backtest summary data"""
    
    def test_load_backtest_summaries(self, mock_backtest_files):
        """Test loading and parsing backtest summary files"""
        # Find all summary.json files
        summary_files = list(mock_backtest_files.glob("*/summary.json"))
        
        assert len(summary_files) == 3  # iron_condor, wheel, pmcc
        
        summaries = {}
        for summary_file in summary_files:
            with open(summary_file, 'r') as f:
                data = json.load(f)
                summaries[data['strategy_id']] = data
        
        # Verify all expected strategies are present
        expected_strategies = ['iron_condor', 'wheel', 'pmcc']
        for strategy in expected_strategies:
            assert strategy in summaries
            
            # Verify required fields
            summary = summaries[strategy]
            assert 'total_pnl' in summary
            assert 'sharpe_ratio' in summary
            assert 'parameters' in summary
            assert 'win_rate' in summary
    
    def test_create_optimized_parameters_from_backtest(self, sample_backtest_summary, test_version):
        """Test creating OptimizedStrategyParameters from backtest summary"""
        # Create parameters from backtest summary
        params = OptimizedStrategyParameters(
            version=test_version,
            strategy_name=sample_backtest_summary['strategy_id'],
            parameters=sample_backtest_summary['parameters'],
            expected_return=sample_backtest_summary['performance_metrics']['total_return'],
            sharpe_ratio=sample_backtest_summary['sharpe_ratio'],
            max_drawdown=sample_backtest_summary['max_drawdown'],
            win_rate=sample_backtest_summary['win_rate'],
            backtest_trades=sample_backtest_summary['total_trades'],
            backtest_pnl=sample_backtest_summary['total_pnl']
        )
        
        assert params.strategy_name == "iron_condor_test"
        assert params.expected_return == 0.15
        assert params.sharpe_ratio == 1.25
        assert params.win_rate == 0.72
        assert params.backtest_trades == 25
        assert params.backtest_pnl == 15000.0
        
        # Verify parameters were copied correctly
        assert params.get_parameter('strike_delta') == 0.25
        assert params.get_parameter('days_to_expiry') == 45
    
    def test_create_portfolio_from_multiple_backtests(self, multiple_backtest_summaries, test_version):
        """Test creating portfolio allocation from multiple backtest results"""
        allocation = StrategyAllocation(
            version=test_version,
            portfolio_name="backtest_portfolio",
            total_capital=300000.0
        )
        
        # Add strategies based on backtest performance
        for strategy_name, summary in multiple_backtest_summaries.items():
            # Create parameters from summary
            params = OptimizedStrategyParameters(
                version=test_version,
                strategy_name=strategy_name,
                parameters=summary['parameters'],
                sharpe_ratio=summary['sharpe_ratio'],
                max_drawdown=summary['max_drawdown']
            )
            
            # Allocate based on Sharpe ratio (simple allocation rule)
            if summary['sharpe_ratio'] > 1.3:
                weight = 0.4
            elif summary['sharpe_ratio'] > 1.2:
                weight = 0.35
            else:
                weight = 0.25
            
            allocation.add_strategy(strategy_name, weight, params)
        
        # Verify allocation
        assert allocation.is_balanced()
        assert len(allocation.allocations) == 3
        
        # Verify capital allocation
        total_allocated = sum(
            allocation.get_strategy_capital(name) 
            for name in allocation.allocations.keys()
        )
        assert abs(total_allocated - 300000.0) < 1.0


@pytest.mark.integration
@pytest.mark.adaptive
class TestMarketAnalysisIntegration:
    """Test integration of market analysis components"""
    
    def test_regime_detection_with_price_data(self, sample_price_data):
        """Test regime detection with realistic price data"""
        detector = RegimeDetector(lookback_window=20)
        
        # Test with full price series
        regime = detector.detect_regime(sample_price_data['close'])
        assert regime in MarketRegime
        
        # Test regime probability distribution
        probabilities = detector.get_regime_probability(sample_price_data['close'])
        
        assert isinstance(probabilities, dict)
        assert len(probabilities) == len(MarketRegime)
        assert abs(sum(probabilities.values()) - 1.0) < 0.1  # Should sum to ~1
        
        # Verify detected regime has highest probability
        max_prob_regime = max(probabilities, key=probabilities.get)
        assert probabilities[max_prob_regime] > 0.5
    
    def test_pattern_detection_with_market_data(self, sample_price_data, sample_market_state):
        """Test pattern detection with market data"""
        detector = TechnicalPatternDetector()
        
        # Create market data DataFrame
        market_data = sample_price_data.copy()
        
        # Detect patterns
        patterns = detector.detect_patterns(market_data, sample_market_state)
        
        assert isinstance(patterns, dict)
        
        # Check that patterns have required structure
        for pattern_name, pattern_info in patterns.items():
            assert 'strength' in pattern_info
            assert 'detected_at' in pattern_info
            assert 'price_level' in pattern_info
            assert 0.0 <= pattern_info['strength'] <= 1.0
    
    def test_market_state_with_indicators(self, sample_market_indicators, test_version):
        """Test creating MarketState with indicator data"""
        # Use latest indicator values
        latest_indicators = sample_market_indicators.iloc[-1]
        
        market_state = MarketState(
            version=test_version,
            underlying_price=450.0,
            vix_level=latest_indicators['vix'],
            put_call_ratio=latest_indicators['put_call_ratio'],
            rsi_14=latest_indicators['rsi_14'],
            macd_signal=latest_indicators['macd_signal'],
            bollinger_position=latest_indicators['bollinger_position'],
            fear_greed_index=latest_indicators['fear_greed_index'],
            advance_decline_ratio=latest_indicators['advance_decline_ratio']
        )
        
        # Verify values were set correctly
        assert market_state.vix_level == latest_indicators['vix']
        assert market_state.rsi_14 == latest_indicators['rsi_14']
        assert market_state.fear_greed_index == latest_indicators['fear_greed_index']
        
        # Test feature vector includes all indicators
        features = market_state.to_feature_vector()
        assert 'vix_level' in features
        assert 'rsi_14' in features
        assert 'fear_greed_index' in features


@pytest.mark.integration
@pytest.mark.adaptive
class TestOptimizationIntegration:
    """Test integration of optimization components"""
    
    def test_optimizer_with_backtest_data(self, mock_backtest_files, sample_market_state):
        """Test optimizer integration with backtest data"""
        # Mock optimizer for testing
        class MockOptimizer(BaseOptimizer):
            def optimize(self, strategy_name, market_state, parameter_bounds, 
                        objective_function, constraints=None, max_iterations=100):
                # Simple mock optimization
                optimized_params = {
                    'strike_delta': 0.25,
                    'days_to_expiry': 45,
                    'profit_target': 0.5
                }
                
                return OptimizedStrategyParameters(
                    version=self.version,
                    strategy_name=strategy_name,
                    market_state_id=market_state.state_id,
                    parameters=optimized_params,
                    expected_return=0.15,
                    sharpe_ratio=1.25,
                    optimization_score=0.85,
                    optimization_method="mock",
                    optimization_iterations=max_iterations
                )
        
        optimizer = MockOptimizer()
        
        # Define parameter bounds
        parameter_bounds = {
            'strike_delta': (0.15, 0.35),
            'days_to_expiry': (30, 60),
            'profit_target': (0.25, 0.75)
        }
        
        # Mock objective function
        def mock_objective(params):
            return 1.25  # Mock Sharpe ratio
        
        # Run optimization
        result = optimizer.optimize(
            strategy_name="iron_condor",
            market_state=sample_market_state,
            parameter_bounds=parameter_bounds,
            objective_function=mock_objective,
            max_iterations=50
        )
        
        # Verify optimization result
        assert result.strategy_name == "iron_condor"
        assert result.market_state_id == sample_market_state.state_id
        assert result.optimization_iterations == 50
        assert result.optimization_method == "mock"
        assert result.get_parameter('strike_delta') == 0.25
    
    def test_parameter_validation_integration(self, sample_optimized_parameters):
        """Test parameter validation across components"""
        # Test parameter bounds validation
        parameter_bounds = {
            'strike_delta': (0.15, 0.35),
            'days_to_expiry': (30, 60),
            'profit_target': (0.25, 0.75)
        }
        
        optimizer = BaseOptimizer()
        
        # Valid parameters should pass
        valid_params = {
            'strike_delta': 0.25,
            'days_to_expiry': 45,
            'profit_target': 0.5
        }
        
        assert optimizer.validate_parameters(valid_params, parameter_bounds)
        
        # Invalid parameters should fail
        invalid_params = {
            'strike_delta': 0.45,  # Outside bounds
            'days_to_expiry': 45,
            'profit_target': 0.5
        }
        
        assert not optimizer.validate_parameters(invalid_params, parameter_bounds)


@pytest.mark.integration
@pytest.mark.adaptive
@pytest.mark.slow
class TestEndToEndWorkflow:
    """Test complete end-to-end adaptive intelligence workflow"""
    
    def test_complete_adaptive_workflow(self, mock_backtest_files, sample_price_data, 
                                      sample_market_indicators, test_version):
        """Test complete workflow from data to allocation"""
        
        # Step 1: Create market state from data
        latest_indicators = sample_market_indicators.iloc[-1]
        latest_price = sample_price_data['close'].iloc[-1]
        
        market_state = MarketState(
            version=test_version,
            underlying_price=latest_price,
            vix_level=latest_indicators['vix'],
            rsi_14=latest_indicators['rsi_14'],
            fear_greed_index=latest_indicators['fear_greed_index']
        )
        
        # Step 2: Detect market regime
        detector = RegimeDetector()
        regime = detector.detect_regime(sample_price_data['close'])
        market_state.regime = regime
        
        # Step 3: Load backtest results and create optimized parameters
        summary_files = list(mock_backtest_files.glob("*/summary.json"))
        strategy_params = {}
        
        for summary_file in summary_files:
            with open(summary_file, 'r') as f:
                summary = json.load(f)
            
            params = OptimizedStrategyParameters(
                version=test_version,
                strategy_name=summary['strategy_id'],
                parameters=summary['parameters'],
                expected_return=summary.get('performance_metrics', {}).get('total_return', 0.15),
                sharpe_ratio=summary['sharpe_ratio'],
                max_drawdown=summary['max_drawdown'],
                optimized_for_regime=regime
            )
            
            strategy_params[summary['strategy_id']] = params
        
        # Step 4: Create portfolio allocation
        allocation = StrategyAllocation(
            version=test_version,
            portfolio_name="adaptive_portfolio",
            total_capital=500000.0,
            market_state_id=market_state.state_id
        )
        
        # Add strategies with equal weights for simplicity
        weight_per_strategy = 1.0 / len(strategy_params)
        for strategy_name, params in strategy_params.items():
            allocation.add_strategy(strategy_name, weight_per_strategy, params)
        
        # Step 5: Validate complete workflow
        assert allocation.is_balanced()
        assert len(allocation.allocations) == len(strategy_params)
        assert allocation.market_state_id == market_state.state_id
        
        # Verify all strategies have valid parameters
        for strategy_name in allocation.allocations.keys():
            strategy_capital = allocation.get_strategy_capital(strategy_name)
            assert strategy_capital > 0
            
            params = allocation.strategy_parameters[strategy_name]
            assert params.optimized_for_regime == regime
            assert params.version == test_version
        
        # Verify constraint compliance
        violations = allocation.validate_constraints()
        assert len(violations) == 0
        
        print(f"✅ Complete adaptive workflow successful:")
        print(f"   Market regime: {regime.value}")
        print(f"   Strategies: {list(allocation.allocations.keys())}")
        print(f"   Total capital: ${allocation.total_capital:,.0f}")
        print(f"   Portfolio balanced: {allocation.is_balanced()}")


@pytest.mark.integration
@pytest.mark.adaptive
class TestErrorHandling:
    """Test error handling in integration scenarios"""
    
    def test_missing_backtest_data_handling(self, tmp_path, test_version):
        """Test handling of missing backtest data"""
        # Create empty runs directory
        empty_runs_dir = tmp_path / "empty_runs"
        empty_runs_dir.mkdir()
        
        # Should handle empty directory gracefully
        summary_files = list(empty_runs_dir.glob("*/summary.json"))
        assert len(summary_files) == 0
        
        # Create allocation with no strategies (should still work)
        allocation = StrategyAllocation(
            version=test_version,
            portfolio_name="empty_portfolio"
        )
        
        assert allocation.is_balanced(tolerance=0.1)  # Empty allocation is "balanced"
        assert len(allocation.allocations) == 0
    
    def test_invalid_market_data_handling(self, test_version):
        """Test handling of invalid market data"""
        # Create market state with extreme values
        extreme_market_state = MarketState(
            version=test_version,
            underlying_price=-100.0,  # Invalid negative price
            vix_level=1000.0,  # Extreme VIX
            rsi_14=150.0  # Invalid RSI
        )
        
        # Should still create feature vector (with invalid values)
        features = extreme_market_state.to_feature_vector()
        assert isinstance(features, dict)
        assert len(features) > 0
        
        # Values should be preserved as-is (validation is responsibility of caller)
        assert features['underlying_price'] == -100.0
        assert features['vix_level'] == 1000.0
        assert features['rsi_14'] == 150.0
