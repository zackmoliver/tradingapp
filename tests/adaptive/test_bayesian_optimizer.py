"""
Unit Tests for Bayesian Optimizer

This module contains comprehensive unit tests for the Bayesian Optimizer
with deterministic fixtures and fixed seeds for reproducible testing.

All tests use mocked data and prohibit external network calls.
"""

import pytest
import json
import numpy as np
import tempfile
import shutil
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from adaptive.optimizer.bayesian_optimizer import BayesianOptimizer, SKLEARN_AVAILABLE
from adaptive.types import OptimizedStrategyParameters, AdaptiveVersion, MarketState, MarketRegime


@pytest.mark.unit
@pytest.mark.adaptive
@pytest.mark.optimizer
class TestBayesianOptimizer:
    """Test suite for BayesianOptimizer class"""
    
    @pytest.fixture
    def temp_runs_dir(self, tmp_path):
        """Create temporary runs directory with mock backtest data"""
        runs_dir = tmp_path / "runs"
        runs_dir.mkdir()
        
        # Create mock backtest results for iron_condor
        for i in range(10):
            run_dir = runs_dir / f"iron_condor_run_{i:03d}"
            run_dir.mkdir()
            
            # Create deterministic summary.json
            summary = {
                "strategy_id": "iron_condor",
                "run_id": f"run_{i:03d}",
                "start_date": "2024-01-01",
                "end_date": "2024-03-31",
                "total_trades": 25 + i,
                "winning_trades": 18 + (i % 3),
                "win_rate": 0.72 + (i * 0.01),
                "total_pnl": 15000.0 + (i * 1000),
                "sharpe_ratio": 1.25 + (i * 0.05),
                "max_drawdown": 0.08 + (i * 0.005),
                "parameters": {
                    "strike_delta": 0.20 + (i * 0.01),
                    "days_to_expiry": 40 + i,
                    "profit_target": 0.4 + (i * 0.02),
                    "stop_loss": 1.8 + (i * 0.05),
                    "min_credit": 0.8 + (i * 0.05)
                }
            }
            
            with open(run_dir / "summary.json", 'w') as f:
                json.dump(summary, f, indent=2)
        
        return runs_dir
    
    @pytest.fixture
    def optimizer(self, test_version, temp_runs_dir, monkeypatch):
        """Create BayesianOptimizer with mocked runs directory"""
        # Mock the runs directory path
        monkeypatch.setattr('adaptive.optimizer.bayesian_optimizer.Path', 
                          lambda x: temp_runs_dir if x == "runs" else Path(x))
        
        return BayesianOptimizer(
            version=test_version,
            min_samples_for_optimization=3,
            acquisition_samples=100,  # Smaller for faster tests
            exploration_weight=0.01
        )
    
    @pytest.fixture
    def parameter_bounds(self):
        """Standard parameter bounds for testing"""
        return {
            'strike_delta': (0.15, 0.35),
            'days_to_expiry': (30, 60),
            'profit_target': (0.25, 0.75),
            'stop_loss': (1.5, 3.0),
            'min_credit': (0.5, 2.0)
        }
    
    def test_optimizer_initialization(self, test_version):
        """Test BayesianOptimizer initialization"""
        if not SKLEARN_AVAILABLE:
            with pytest.raises(ImportError, match="scikit-learn is required"):
                BayesianOptimizer(version=test_version)
            return
        
        optimizer = BayesianOptimizer(version=test_version)
        
        assert optimizer.version == test_version
        assert optimizer.min_samples_for_optimization == 5
        assert optimizer.acquisition_samples == 1000
        assert optimizer.exploration_weight == 0.01
        assert optimizer.safe_mode_enabled is True
        assert optimizer.gp_model is None
        assert optimizer.historical_data == []
        assert optimizer.explainability_logs == []
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_load_historical_data(self, optimizer, temp_runs_dir):
        """Test loading historical backtest data"""
        results = optimizer._load_historical_data("iron_condor")
        
        assert len(results) == 10
        assert all(r['strategy_id'] == 'iron_condor' for r in results)
        assert all('parameters' in r for r in results)
        assert all('sharpe_ratio' in r for r in results)
        
        # Test with non-existent strategy
        empty_results = optimizer._load_historical_data("non_existent")
        assert len(empty_results) == 0
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_infer_parameter_bounds(self, optimizer):
        """Test parameter bounds inference from historical data"""
        historical_results = [
            {'parameters': {'strike_delta': 0.20, 'days_to_expiry': 40}},
            {'parameters': {'strike_delta': 0.25, 'days_to_expiry': 45}},
            {'parameters': {'strike_delta': 0.30, 'days_to_expiry': 50}}
        ]
        
        bounds = optimizer._infer_parameter_bounds(historical_results)
        
        assert 'strike_delta' in bounds
        assert 'days_to_expiry' in bounds
        
        # Check bounds include data range with padding
        strike_bounds = bounds['strike_delta']
        assert strike_bounds[0] < 0.20  # Lower bound with padding
        assert strike_bounds[1] > 0.30  # Upper bound with padding
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_prepare_training_data(self, optimizer):
        """Test training data preparation"""
        historical_results = [
            {
                'parameters': {'strike_delta': 0.20, 'days_to_expiry': 40},
                'sharpe_ratio': 1.2
            },
            {
                'parameters': {'strike_delta': 0.25, 'days_to_expiry': 45},
                'sharpe_ratio': 1.5
            },
            {
                'parameters': {'strike_delta': 0.30, 'days_to_expiry': 50},
                'sharpe_ratio': 1.1
            }
        ]
        
        optimizer.parameter_bounds = {
            'strike_delta': (0.15, 0.35),
            'days_to_expiry': (30, 60)
        }
        
        X, y = optimizer._prepare_training_data(historical_results)
        
        assert X.shape == (3, 2)  # 3 samples, 2 parameters
        assert y.shape == (3,)    # 3 target values
        assert len(optimizer.parameter_names) == 2
        assert 'strike_delta' in optimizer.parameter_names
        assert 'days_to_expiry' in optimizer.parameter_names
        
        # Check target values
        expected_y = np.array([1.2, 1.5, 1.1])
        np.testing.assert_array_equal(y, expected_y)
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_safe_mode_fallback(self, optimizer, parameter_bounds, sample_market_state):
        """Test safe mode fallback when insufficient data"""
        result = optimizer._safe_mode_fallback("iron_condor", parameter_bounds, sample_market_state)
        
        assert isinstance(result, OptimizedStrategyParameters)
        assert result.strategy_name == "iron_condor"
        assert result.optimization_method == "safe_mode_fallback"
        assert result.optimization_score == 0.0  # Low confidence
        assert result.parameter_stability == 1.0  # Defaults are stable
        
        # Check parameters are within bounds
        for param_name, value in result.parameters.items():
            if param_name in parameter_bounds:
                min_bound, max_bound = parameter_bounds[param_name]
                assert min_bound <= value <= max_bound
        
        # Check explainability log was created
        assert len(optimizer.explainability_logs) == 1
        log = optimizer.explainability_logs[0]
        assert log['optimization_method'] == 'safe_mode_fallback'
        assert log['reason'] == 'insufficient_historical_data'
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_get_default_parameters(self, optimizer):
        """Test default parameter retrieval"""
        # Test known strategy
        iron_condor_defaults = optimizer._get_default_parameters("iron_condor")
        assert 'strike_delta' in iron_condor_defaults
        assert 'days_to_expiry' in iron_condor_defaults
        assert iron_condor_defaults['strike_delta'] == 0.25
        
        # Test unknown strategy (should get generic defaults)
        unknown_defaults = optimizer._get_default_parameters("unknown_strategy")
        assert 'strike_delta' in unknown_defaults
        assert unknown_defaults['strike_delta'] == 0.25
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_suggest_parameters_insufficient_data(self, optimizer, parameter_bounds, sample_market_state, monkeypatch):
        """Test parameter suggestion with insufficient historical data"""
        # Mock empty historical data
        monkeypatch.setattr(optimizer, '_load_historical_data', lambda x: [])
        
        result = optimizer.suggest_parameters("iron_condor", parameter_bounds, sample_market_state)
        
        assert isinstance(result, OptimizedStrategyParameters)
        assert result.optimization_method == "safe_mode_fallback"
        assert len(optimizer.explainability_logs) == 1
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_suggest_parameters_with_sufficient_data(self, optimizer, parameter_bounds, sample_market_state, seeded_random):
        """Test parameter suggestion with sufficient historical data"""
        # Set fixed seed for reproducible results
        np.random.seed(42)
        
        result = optimizer.suggest_parameters("iron_condor", parameter_bounds, sample_market_state)
        
        assert isinstance(result, OptimizedStrategyParameters)
        assert result.strategy_name == "iron_condor"
        assert result.optimization_method == "bayesian_gaussian_process"
        assert result.optimization_iterations == 100  # acquisition_samples
        
        # Check parameters are within bounds
        for param_name, value in result.parameters.items():
            if param_name in parameter_bounds:
                min_bound, max_bound = parameter_bounds[param_name]
                assert min_bound <= value <= max_bound
        
        # Check explainability log was created
        assert len(optimizer.explainability_logs) == 1
        log = optimizer.explainability_logs[0]
        assert log['optimization_method'] == 'bayesian_gaussian_process'
        assert 'acquisition_scores' in log
        assert 'optimal_parameters' in log
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_update_optimizer(self, optimizer):
        """Test updating optimizer with new results"""
        new_result = {
            'strategy_id': 'iron_condor',
            'parameters': {'strike_delta': 0.28, 'days_to_expiry': 42},
            'sharpe_ratio': 1.35,
            'total_pnl': 18000.0
        }
        
        initial_count = len(optimizer.historical_data)
        optimizer.update(new_result)
        
        assert len(optimizer.historical_data) == initial_count + 1
        assert optimizer.historical_data[-1] == new_result
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_expected_improvement_calculation(self, optimizer, seeded_random):
        """Test Expected Improvement acquisition function"""
        # Create mock GP model
        optimizer.gp_model = Mock()
        optimizer.gp_model.predict.return_value = (
            np.array([1.5, 1.2, 1.8]),  # mu
            np.array([0.1, 0.2, 0.05])  # sigma
        )
        
        X = np.array([[0.25, 45], [0.30, 50], [0.20, 40]])
        X_sample = np.array([[0.25, 45]])
        y_sample = np.array([1.4])
        
        ei_values = optimizer._expected_improvement(X, X_sample, y_sample)
        
        assert len(ei_values) == 3
        assert all(ei >= 0 for ei in ei_values)  # EI should be non-negative
        assert ei_values[2] > ei_values[1]  # Higher mu should give higher EI
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_generate_candidates(self, optimizer, parameter_bounds):
        """Test candidate generation for acquisition optimization"""
        optimizer.parameter_bounds = parameter_bounds
        optimizer.parameter_names = list(parameter_bounds.keys())
        optimizer.acquisition_samples = 50
        
        # Set fixed seed for reproducible results
        np.random.seed(42)
        
        candidates = optimizer._generate_candidates()
        
        assert candidates.shape == (50, len(parameter_bounds))
        
        # Check candidates are within bounds (before normalization)
        # Note: candidates are normalized, so we can't directly check bounds
        assert candidates.shape[1] == len(parameter_bounds)
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_save_optimization_result(self, optimizer, tmp_path, monkeypatch):
        """Test saving optimization results to file"""
        # Mock output directory
        output_dir = tmp_path / "adaptive" / "output" / "params"
        monkeypatch.setattr(optimizer, 'output_dir', output_dir)
        
        # Create test result
        result = OptimizedStrategyParameters(
            version=optimizer.version,
            strategy_name="iron_condor",
            parameters={'strike_delta': 0.25, 'days_to_expiry': 45},
            sharpe_ratio=1.25,
            optimization_method="bayesian_gaussian_process"
        )
        
        # Add explainability log
        optimizer.explainability_logs.append({
            'timestamp': datetime.now().isoformat(),
            'strategy_id': 'iron_condor',
            'optimization_method': 'bayesian_gaussian_process'
        })
        
        optimizer._save_optimization_result(result)
        
        # Check file was created
        strategy_dir = output_dir / "iron_condor"
        assert strategy_dir.exists()
        
        json_files = list(strategy_dir.glob("*.json"))
        assert len(json_files) == 1
        
        # Check file contents
        with open(json_files[0], 'r') as f:
            saved_data = json.load(f)
        
        assert saved_data['strategy_name'] == "iron_condor"
        assert saved_data['generated_by'] == 'bayesian_optimizer'
        assert saved_data['code_version'] == optimizer.version.code_version
        assert saved_data['data_snapshot'] == optimizer.version.data_snapshot
        assert 'valid_until' in saved_data
        assert 'explainability_logs' in saved_data
    
    @pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
    def test_explainability_logs(self, optimizer):
        """Test explainability logging functionality"""
        # Test initial state
        assert len(optimizer.get_explainability_logs()) == 0
        
        # Add some logs
        optimizer._log_safe_mode_usage("test_strategy", {"param1": 0.5})
        
        logs = optimizer.get_explainability_logs()
        assert len(logs) == 1
        assert logs[0]['strategy_id'] == 'test_strategy'
        assert logs[0]['optimization_method'] == 'safe_mode_fallback'
        
        # Test clearing logs
        optimizer.clear_explainability_logs()
        assert len(optimizer.get_explainability_logs()) == 0


@pytest.mark.integration
@pytest.mark.adaptive
@pytest.mark.optimizer
@pytest.mark.skipif(not SKLEARN_AVAILABLE, reason="scikit-learn not available")
class TestBayesianOptimizerIntegration:
    """Integration tests for BayesianOptimizer"""
    
    def test_end_to_end_optimization_workflow(self, test_version, tmp_path, seeded_random):
        """Test complete optimization workflow"""
        # Set up temporary environment
        runs_dir = tmp_path / "runs"
        runs_dir.mkdir()
        
        # Create realistic backtest data
        for i in range(8):  # Sufficient data for optimization
            run_dir = runs_dir / f"iron_condor_test_{i:03d}"
            run_dir.mkdir()
            
            summary = {
                "strategy_id": "iron_condor",
                "run_id": f"test_{i:03d}",
                "sharpe_ratio": 1.0 + (i * 0.1) + seeded_random.normal(0, 0.05),
                "parameters": {
                    "strike_delta": 0.20 + (i * 0.015),
                    "days_to_expiry": 35 + (i * 2),
                    "profit_target": 0.4 + (i * 0.03)
                }
            }
            
            with open(run_dir / "summary.json", 'w') as f:
                json.dump(summary, f)
        
        # Create optimizer with mocked paths
        with patch('adaptive.optimizer.bayesian_optimizer.Path') as mock_path:
            mock_path.side_effect = lambda x: runs_dir if x == "runs" else Path(x)
            
            optimizer = BayesianOptimizer(
                version=test_version,
                min_samples_for_optimization=5,
                acquisition_samples=50
            )
            
            # Set output directory
            optimizer.output_dir = tmp_path / "output"
            optimizer.output_dir.mkdir()
            
            # Run optimization
            parameter_bounds = {
                'strike_delta': (0.15, 0.35),
                'days_to_expiry': (30, 60),
                'profit_target': (0.25, 0.75)
            }
            
            market_state = MarketState(
                version=test_version,
                underlying_price=450.0,
                regime=MarketRegime.SIDEWAYS
            )
            
            # Set fixed seed for reproducible results
            np.random.seed(42)
            
            result = optimizer.suggest_parameters("iron_condor", parameter_bounds, market_state)
            
            # Verify result
            assert isinstance(result, OptimizedStrategyParameters)
            assert result.strategy_name == "iron_condor"
            assert result.optimization_method == "bayesian_gaussian_process"
            assert result.version.code_version == test_version.code_version
            
            # Verify parameters are within bounds
            for param_name, value in result.parameters.items():
                min_bound, max_bound = parameter_bounds[param_name]
                assert min_bound <= value <= max_bound
            
            # Verify explainability logs
            logs = optimizer.get_explainability_logs()
            assert len(logs) == 1
            assert 'acquisition_scores' in logs[0]
            assert 'optimal_parameters' in logs[0]
