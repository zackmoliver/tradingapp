"""
Pytest Configuration for Adaptive Intelligence Module

This module provides comprehensive test fixtures and configuration for the
adaptive intelligence module, including mocked data, deterministic fixtures,
and network isolation to ensure reproducible testing.

Features:
- Deterministic market data fixtures
- Mocked backtest summary.json slices
- Network call prohibition
- Seeded random number generators
- Performance benchmarking utilities
"""

import pytest
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from unittest.mock import Mock, patch
import tempfile
import os
from pathlib import Path

# Import adaptive module components
from adaptive.types import (
    MarketState, 
    OptimizedStrategyParameters, 
    StrategyAllocation,
    AdaptiveVersion,
    MarketRegime,
    VolatilityEnvironment
)


# =============================================================================
# Network Isolation
# =============================================================================

@pytest.fixture(autouse=True)
def prohibit_network_calls(monkeypatch):
    """
    Automatically prohibit all external network calls in tests.
    
    This fixture runs automatically for all tests and ensures that no
    external network requests can be made, enforcing test isolation.
    """
    import socket
    import urllib3
    import requests
    
    def mock_socket(*args, **kwargs):
        raise RuntimeError(
            "Network calls are prohibited in tests. "
            "Use mocked data fixtures instead."
        )
    
    def mock_requests_get(*args, **kwargs):
        raise RuntimeError(
            "HTTP requests are prohibited in tests. "
            "Use mocked data fixtures instead."
        )
    
    def mock_requests_post(*args, **kwargs):
        raise RuntimeError(
            "HTTP requests are prohibited in tests. "
            "Use mocked data fixtures instead."
        )
    
    # Block socket creation
    monkeypatch.setattr(socket, "socket", mock_socket)
    
    # Block HTTP requests
    monkeypatch.setattr(requests, "get", mock_requests_get)
    monkeypatch.setattr(requests, "post", mock_requests_post)
    
    # Block urllib3 requests
    if hasattr(urllib3, "PoolManager"):
        monkeypatch.setattr(urllib3.PoolManager, "request", mock_requests_get)


# =============================================================================
# Deterministic Random Number Generation
# =============================================================================

@pytest.fixture
def fixed_seed():
    """Fixed seed for deterministic testing"""
    return 42


@pytest.fixture
def seeded_random(fixed_seed):
    """Seeded random number generator for reproducible tests"""
    np.random.seed(fixed_seed)
    return np.random.RandomState(fixed_seed)


# =============================================================================
# Version Tracking Fixtures
# =============================================================================

@pytest.fixture
def test_version():
    """Standard test version for all adaptive components"""
    return AdaptiveVersion(
        code_version="1.0.0-test",
        data_snapshot="2024-01-01T00:00:00.000000",
        model_version="test_model_v1",
        training_epoch=100,
        git_commit="test123abc"
    )


# =============================================================================
# Market Data Fixtures
# =============================================================================

@pytest.fixture
def sample_price_data(seeded_random):
    """Generate deterministic price data for testing"""
    dates = pd.date_range(start='2024-01-01', end='2024-12-31', freq='D')
    
    # Generate deterministic price series
    initial_price = 450.0
    returns = seeded_random.normal(0.0008, 0.015, len(dates))  # Daily returns
    
    prices = [initial_price]
    for ret in returns[1:]:
        prices.append(prices[-1] * (1 + ret))
    
    return pd.DataFrame({
        'date': dates,
        'open': prices,
        'high': [p * (1 + abs(seeded_random.normal(0, 0.01))) for p in prices],
        'low': [p * (1 - abs(seeded_random.normal(0, 0.01))) for p in prices],
        'close': prices,
        'volume': seeded_random.randint(1000000, 10000000, len(dates))
    })


@pytest.fixture
def sample_options_data(seeded_random):
    """Generate deterministic options data for testing"""
    strikes = np.arange(400, 501, 5)  # Strike prices from 400 to 500
    expiry_dates = ['2024-01-19', '2024-02-16', '2024-03-15']
    
    options_data = []
    for expiry in expiry_dates:
        for strike in strikes:
            # Call options
            options_data.append({
                'strike': strike,
                'expiry': expiry,
                'option_type': 'call',
                'bid': max(0.01, seeded_random.normal(5.0, 2.0)),
                'ask': max(0.02, seeded_random.normal(5.2, 2.0)),
                'implied_volatility': max(0.1, seeded_random.normal(0.25, 0.05)),
                'delta': max(0.01, min(0.99, seeded_random.normal(0.5, 0.2))),
                'gamma': max(0.001, seeded_random.normal(0.01, 0.005)),
                'theta': -abs(seeded_random.normal(0.05, 0.02)),
                'vega': max(0.01, seeded_random.normal(0.1, 0.03))
            })
            
            # Put options
            options_data.append({
                'strike': strike,
                'expiry': expiry,
                'option_type': 'put',
                'bid': max(0.01, seeded_random.normal(5.0, 2.0)),
                'ask': max(0.02, seeded_random.normal(5.2, 2.0)),
                'implied_volatility': max(0.1, seeded_random.normal(0.25, 0.05)),
                'delta': -max(0.01, min(0.99, seeded_random.normal(0.5, 0.2))),
                'gamma': max(0.001, seeded_random.normal(0.01, 0.005)),
                'theta': -abs(seeded_random.normal(0.05, 0.02)),
                'vega': max(0.01, seeded_random.normal(0.1, 0.03))
            })
    
    return pd.DataFrame(options_data)


@pytest.fixture
def sample_market_indicators(seeded_random):
    """Generate deterministic market indicators for testing"""
    dates = pd.date_range(start='2024-01-01', end='2024-12-31', freq='D')
    
    return pd.DataFrame({
        'date': dates,
        'vix': seeded_random.normal(20.0, 5.0, len(dates)).clip(10, 50),
        'put_call_ratio': seeded_random.normal(1.0, 0.2, len(dates)).clip(0.5, 2.0),
        'rsi_14': seeded_random.normal(50.0, 15.0, len(dates)).clip(0, 100),
        'macd_signal': seeded_random.normal(0.0, 2.0, len(dates)),
        'bollinger_position': seeded_random.uniform(0, 1, len(dates)),
        'fear_greed_index': seeded_random.normal(50.0, 20.0, len(dates)).clip(0, 100),
        'advance_decline_ratio': seeded_random.normal(1.0, 0.3, len(dates)).clip(0.3, 3.0)
    })


# =============================================================================
# Market State Fixtures
# =============================================================================

@pytest.fixture
def sample_market_state(test_version, seeded_random):
    """Create a sample market state for testing"""
    return MarketState(
        version=test_version,
        underlying_price=450.0,
        price_change_1d=seeded_random.normal(0.001, 0.02),
        price_change_5d=seeded_random.normal(0.005, 0.05),
        price_change_20d=seeded_random.normal(0.02, 0.1),
        implied_volatility=0.25,
        historical_volatility_10d=0.22,
        historical_volatility_30d=0.24,
        vix_level=18.5,
        vix_change=seeded_random.normal(0, 2.0),
        put_call_ratio=1.1,
        options_volume=int(seeded_random.normal(50000, 10000)),
        rsi_14=seeded_random.uniform(30, 70),
        macd_signal=seeded_random.normal(0, 1),
        bollinger_position=seeded_random.uniform(0.2, 0.8),
        advance_decline_ratio=seeded_random.normal(1.0, 0.2),
        fear_greed_index=seeded_random.uniform(20, 80),
        regime=MarketRegime.SIDEWAYS,
        volatility_environment=VolatilityEnvironment.NORMAL
    )


@pytest.fixture
def bull_market_state(test_version):
    """Market state representing bull market conditions"""
    return MarketState(
        version=test_version,
        underlying_price=480.0,
        price_change_1d=0.015,
        price_change_5d=0.08,
        price_change_20d=0.25,
        implied_volatility=0.18,
        vix_level=12.0,
        regime=MarketRegime.BULL,
        volatility_environment=VolatilityEnvironment.LOW,
        rsi_14=75.0,
        fear_greed_index=85.0
    )


@pytest.fixture
def bear_market_state(test_version):
    """Market state representing bear market conditions"""
    return MarketState(
        version=test_version,
        underlying_price=380.0,
        price_change_1d=-0.025,
        price_change_5d=-0.12,
        price_change_20d=-0.35,
        implied_volatility=0.45,
        vix_level=35.0,
        regime=MarketRegime.BEAR,
        volatility_environment=VolatilityEnvironment.HIGH,
        rsi_14=25.0,
        fear_greed_index=15.0
    )


@pytest.fixture
def high_volatility_market_state(test_version):
    """Market state representing high volatility conditions"""
    return MarketState(
        version=test_version,
        underlying_price=450.0,
        implied_volatility=0.55,
        vix_level=42.0,
        regime=MarketRegime.HIGH_VOLATILITY,
        volatility_environment=VolatilityEnvironment.HIGH,
        fear_greed_index=25.0
    )


# =============================================================================
# Strategy Parameter Fixtures
# =============================================================================

@pytest.fixture
def sample_optimized_parameters(test_version, seeded_random):
    """Create sample optimized strategy parameters"""
    return OptimizedStrategyParameters(
        version=test_version,
        strategy_name="iron_condor",
        optimized_for_regime=MarketRegime.SIDEWAYS,
        parameters={
            'strike_delta': 0.25,
            'days_to_expiry': 45,
            'profit_target': 0.5,
            'stop_loss': 2.0,
            'min_credit': 1.0
        },
        expected_return=0.15,
        expected_volatility=0.12,
        sharpe_ratio=1.25,
        max_drawdown=0.08,
        win_rate=0.72,
        optimization_score=0.85,
        parameter_stability=0.78,
        out_of_sample_performance=0.82,
        var_95=0.05,
        expected_shortfall=0.07,
        maximum_loss=0.15,
        optimization_method="bayesian",
        optimization_iterations=100,
        optimization_duration_seconds=45.2,
        backtest_trades=150,
        backtest_pnl=15000.0,
        parameter_bounds={
            'strike_delta': (0.15, 0.35),
            'days_to_expiry': (30, 60),
            'profit_target': (0.25, 0.75)
        }
    )


@pytest.fixture
def multiple_strategy_parameters(test_version):
    """Create multiple strategy parameters for portfolio testing"""
    strategies = {}
    
    # Iron Condor parameters
    strategies['iron_condor'] = OptimizedStrategyParameters(
        version=test_version,
        strategy_name="iron_condor",
        optimized_for_regime=MarketRegime.SIDEWAYS,
        parameters={'strike_delta': 0.25, 'days_to_expiry': 45},
        expected_return=0.15,
        sharpe_ratio=1.25,
        max_drawdown=0.08
    )
    
    # Wheel parameters
    strategies['wheel'] = OptimizedStrategyParameters(
        version=test_version,
        strategy_name="wheel",
        optimized_for_regime=MarketRegime.BULL,
        parameters={'strike_delta': 0.30, 'days_to_expiry': 30},
        expected_return=0.18,
        sharpe_ratio=1.10,
        max_drawdown=0.12
    )
    
    # PMCC parameters
    strategies['pmcc'] = OptimizedStrategyParameters(
        version=test_version,
        strategy_name="pmcc",
        optimized_for_regime=MarketRegime.BULL,
        parameters={'long_delta': 0.80, 'short_delta': 0.30},
        expected_return=0.22,
        sharpe_ratio=1.35,
        max_drawdown=0.15
    )
    
    return strategies


# =============================================================================
# Strategy Allocation Fixtures
# =============================================================================

@pytest.fixture
def sample_strategy_allocation(test_version, multiple_strategy_parameters):
    """Create sample strategy allocation for testing"""
    allocation = StrategyAllocation(
        version=test_version,
        portfolio_name="test_portfolio",
        total_capital=100000.0,
        max_single_strategy_weight=0.5,
        min_strategy_weight=0.1
    )
    
    # Add strategies
    allocation.add_strategy("iron_condor", 0.4, multiple_strategy_parameters['iron_condor'])
    allocation.add_strategy("wheel", 0.35, multiple_strategy_parameters['wheel'])
    allocation.add_strategy("pmcc", 0.25, multiple_strategy_parameters['pmcc'])
    
    return allocation


# =============================================================================
# Backtest Summary.json Fixtures
# =============================================================================

@pytest.fixture
def sample_backtest_summary():
    """Create deterministic backtest summary.json slice for testing"""
    return {
        "strategy_id": "iron_condor_test",
        "run_id": "test_run_001",
        "start_date": "2024-01-01",
        "end_date": "2024-03-31",
        "total_trades": 25,
        "winning_trades": 18,
        "losing_trades": 7,
        "win_rate": 0.72,
        "total_pnl": 15000.0,
        "max_drawdown": 0.08,
        "sharpe_ratio": 1.25,
        "sortino_ratio": 1.45,
        "calmar_ratio": 15.625,
        "parameters": {
            "strike_delta": 0.25,
            "days_to_expiry": 45,
            "profit_target": 0.5,
            "stop_loss": 2.0,
            "min_credit": 1.0
        },
        "performance_metrics": {
            "total_return": 0.15,
            "annualized_return": 0.60,
            "volatility": 0.12,
            "max_consecutive_losses": 3,
            "average_trade_duration": 32.5,
            "profit_factor": 2.14
        },
        "risk_metrics": {
            "var_95": 0.05,
            "expected_shortfall": 0.07,
            "maximum_loss": 0.15,
            "beta": 0.85,
            "alpha": 0.08
        },
        "trade_analysis": {
            "avg_winning_trade": 1250.0,
            "avg_losing_trade": -850.0,
            "largest_winning_trade": 2100.0,
            "largest_losing_trade": -1800.0,
            "consecutive_wins": 6,
            "consecutive_losses": 2
        }
    }


@pytest.fixture
def multiple_backtest_summaries(seeded_random):
    """Create multiple backtest summaries for different strategies"""
    base_summary = {
        "run_id": "test_run_001",
        "start_date": "2024-01-01",
        "end_date": "2024-03-31",
        "total_trades": 25,
    }

    summaries = {}

    # Iron Condor summary
    summaries["iron_condor"] = {
        **base_summary,
        "strategy_id": "iron_condor",
        "winning_trades": 18,
        "losing_trades": 7,
        "win_rate": 0.72,
        "total_pnl": 15000.0,
        "sharpe_ratio": 1.25,
        "max_drawdown": 0.08,
        "parameters": {
            "strike_delta": 0.25,
            "days_to_expiry": 45,
            "profit_target": 0.5
        }
    }

    # Wheel summary
    summaries["wheel"] = {
        **base_summary,
        "strategy_id": "wheel",
        "winning_trades": 20,
        "losing_trades": 5,
        "win_rate": 0.80,
        "total_pnl": 18000.0,
        "sharpe_ratio": 1.10,
        "max_drawdown": 0.12,
        "parameters": {
            "strike_delta": 0.30,
            "days_to_expiry": 30
        }
    }

    # PMCC summary
    summaries["pmcc"] = {
        **base_summary,
        "strategy_id": "pmcc",
        "winning_trades": 16,
        "losing_trades": 9,
        "win_rate": 0.64,
        "total_pnl": 22000.0,
        "sharpe_ratio": 1.35,
        "max_drawdown": 0.15,
        "parameters": {
            "long_delta": 0.80,
            "short_delta": 0.30
        }
    }

    return summaries


@pytest.fixture
def mock_backtest_files(tmp_path, multiple_backtest_summaries):
    """Create mock backtest files in temporary directory structure"""
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()

    for strategy_name, summary in multiple_backtest_summaries.items():
        strategy_dir = runs_dir / f"{strategy_name}_20240101_20240331"
        strategy_dir.mkdir()

        # Create summary.json
        summary_file = strategy_dir / "summary.json"
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2)

        # Create trades.json with sample trades
        trades = []
        for i in range(summary["total_trades"]):
            trade = {
                "trade_id": f"trade_{i+1:03d}",
                "entry_date": "2024-01-15",
                "exit_date": "2024-02-15",
                "strategy": strategy_name,
                "pnl": 600.0 if i < summary["winning_trades"] else -400.0,
                "parameters": summary["parameters"]
            }
            trades.append(trade)

        trades_file = strategy_dir / "trades.json"
        with open(trades_file, 'w') as f:
            json.dump(trades, f, indent=2)

    return runs_dir


# =============================================================================
# Performance Testing Fixtures
# =============================================================================

@pytest.fixture
def performance_timer():
    """Timer fixture for performance testing"""
    import time

    class Timer:
        def __init__(self):
            self.start_time = None
            self.end_time = None

        def start(self):
            self.start_time = time.perf_counter()

        def stop(self):
            self.end_time = time.perf_counter()
            return self.elapsed

        @property
        def elapsed(self):
            if self.start_time is None:
                return 0
            end = self.end_time or time.perf_counter()
            return end - self.start_time

    return Timer()


@pytest.fixture
def large_dataset(seeded_random):
    """Large dataset for performance testing"""
    n_samples = 10000
    n_features = 50

    return {
        'features': seeded_random.normal(0, 1, (n_samples, n_features)),
        'targets': seeded_random.normal(0, 1, n_samples),
        'dates': pd.date_range('2020-01-01', periods=n_samples, freq='H')
    }


# =============================================================================
# Mock External Dependencies
# =============================================================================

@pytest.fixture
def mock_external_apis(monkeypatch):
    """Mock external API calls for testing"""

    def mock_market_data_api(*args, **kwargs):
        return {
            'price': 450.0,
            'volume': 1000000,
            'timestamp': '2024-01-01T10:00:00Z'
        }

    def mock_options_data_api(*args, **kwargs):
        return {
            'strike': 450,
            'expiry': '2024-01-19',
            'bid': 5.0,
            'ask': 5.2,
            'implied_volatility': 0.25
        }

    # Mock any external API calls
    monkeypatch.setattr('adaptive.external_api.get_market_data', mock_market_data_api)
    monkeypatch.setattr('adaptive.external_api.get_options_data', mock_options_data_api)

    return {
        'market_data': mock_market_data_api,
        'options_data': mock_options_data_api
    }


# =============================================================================
# Bayesian Optimizer Fixtures
# =============================================================================

@pytest.fixture
def mock_runs_directory(tmp_path, seeded_random):
    """Create mock runs directory with realistic backtest data for optimizer testing"""
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()

    # Create iron_condor backtest results with parameter-performance relationships
    for i in range(10):
        run_dir = runs_dir / f"iron_condor_run_{i:03d}"
        run_dir.mkdir()

        # Generate parameters with realistic relationships
        strike_delta = 0.20 + (i * 0.01)  # 0.20 to 0.29
        days_to_expiry = 35 + i  # 35 to 44
        profit_target = 0.4 + (i * 0.02)  # 0.4 to 0.58

        # Performance based on distance from "optimal" parameters
        optimal_delta = 0.25
        optimal_dte = 40
        optimal_target = 0.5

        # Calculate performance factor (closer to optimal = better)
        delta_factor = 1.0 - abs(strike_delta - optimal_delta) * 2
        dte_factor = 1.0 - abs(days_to_expiry - optimal_dte) * 0.02
        target_factor = 1.0 - abs(profit_target - optimal_target) * 0.5

        performance_factor = (delta_factor + dte_factor + target_factor) / 3
        base_sharpe = 1.2
        sharpe_ratio = base_sharpe * performance_factor + seeded_random.normal(0, 0.1)

        summary = {
            "strategy_id": "iron_condor",
            "run_id": f"run_{i:03d}",
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
            "total_trades": 25 + i,
            "winning_trades": int((25 + i) * (0.65 + performance_factor * 0.1)),
            "win_rate": 0.65 + performance_factor * 0.1,
            "total_pnl": 10000 + (performance_factor * 8000) + seeded_random.normal(0, 1000),
            "sharpe_ratio": max(0.1, sharpe_ratio),
            "max_drawdown": 0.12 - (performance_factor * 0.04),
            "parameters": {
                "strike_delta": round(strike_delta, 3),
                "days_to_expiry": int(days_to_expiry),
                "profit_target": round(profit_target, 3),
                "stop_loss": 2.0,
                "min_credit": 1.0
            },
            "performance_metrics": {
                "total_return": max(0.0, performance_factor * 0.15),
                "volatility": 0.15 - (performance_factor * 0.03)
            },
            "risk_metrics": {
                "var_95": 0.05,
                "expected_shortfall": 0.07
            }
        }

        with open(run_dir / "summary.json", 'w') as f:
            json.dump(summary, f, indent=2)

    return runs_dir


@pytest.fixture
def bayesian_optimizer_with_data(test_version, mock_runs_directory, monkeypatch):
    """Create BayesianOptimizer with mocked data directory"""
    try:
        from adaptive.optimizer.bayesian_optimizer import BayesianOptimizer
    except ImportError:
        pytest.skip("BayesianOptimizer requires scikit-learn")

    # Mock the Path class to return our test directory
    def mock_path(path_str):
        if path_str == "runs":
            return mock_runs_directory
        return Path(path_str)

    monkeypatch.setattr('adaptive.optimizer.bayesian_optimizer.Path', mock_path)

    return BayesianOptimizer(
        version=test_version,
        min_samples_for_optimization=3,
        acquisition_samples=50,  # Smaller for faster tests
        exploration_weight=0.01
    )


@pytest.fixture
def optimizer_parameter_bounds():
    """Standard parameter bounds for optimizer testing"""
    return {
        'strike_delta': (0.15, 0.35),
        'days_to_expiry': (30, 60),
        'profit_target': (0.25, 0.75),
        'stop_loss': (1.5, 3.0),
        'min_credit': (0.5, 2.0)
    }


@pytest.fixture
def insufficient_backtest_data(tmp_path):
    """Create directory with insufficient backtest data for safe-mode testing"""
    runs_dir = tmp_path / "runs_insufficient"
    runs_dir.mkdir()

    # Create only 2 runs (below minimum threshold)
    for i in range(2):
        run_dir = runs_dir / f"iron_condor_run_{i:03d}"
        run_dir.mkdir()

        summary = {
            "strategy_id": "iron_condor",
            "run_id": f"run_{i:03d}",
            "sharpe_ratio": 1.0 + (i * 0.2),
            "parameters": {
                "strike_delta": 0.25,
                "days_to_expiry": 45
            }
        }

        with open(run_dir / "summary.json", 'w') as f:
            json.dump(summary, f, indent=2)

    return runs_dir
