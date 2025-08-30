"""
Bayesian Optimizer for Strategy Parameters

This module implements Gaussian Process-based Bayesian optimization for
options trading strategy parameter tuning using Expected Improvement
acquisition function.

Features:
- Gaussian Process regression for parameter-performance mapping
- Expected Improvement acquisition for exploration/exploitation balance
- Safe-mode fallback to strategy presets when insufficient data
- Comprehensive logging and explainability
- Version tracking for reproducibility
"""

import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Union
import logging
from dataclasses import asdict
import warnings

# Suppress sklearn warnings for cleaner output
warnings.filterwarnings('ignore', category=UserWarning)

try:
    from sklearn.gaussian_process import GaussianProcessRegressor
    from sklearn.gaussian_process.kernels import RBF, ConstantKernel, Matern
    from sklearn.preprocessing import StandardScaler
    from scipy.optimize import minimize
    from scipy.stats import norm
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

from ..types import OptimizedStrategyParameters, AdaptiveVersion, MarketState
from . import BaseOptimizer


class BayesianOptimizer(BaseOptimizer):
    """
    Bayesian Optimizer using Gaussian Process and Expected Improvement.
    
    This optimizer learns from historical backtest results to suggest
    optimal parameters for trading strategies in different market conditions.
    """
    
    def __init__(self, 
                 version: Optional[AdaptiveVersion] = None,
                 min_samples_for_optimization: int = 5,
                 acquisition_samples: int = 1000,
                 exploration_weight: float = 0.01,
                 safe_mode_enabled: bool = True):
        """
        Initialize Bayesian Optimizer.
        
        Args:
            version: Version tracking information
            min_samples_for_optimization: Minimum samples needed for GP optimization
            acquisition_samples: Number of samples for acquisition optimization
            exploration_weight: Weight for exploration vs exploitation
            safe_mode_enabled: Enable fallback to strategy presets
        """
        super().__init__(version)
        
        if not SKLEARN_AVAILABLE:
            raise ImportError(
                "scikit-learn is required for BayesianOptimizer. "
                "Install with: pip install scikit-learn scipy"
            )
        
        self.min_samples_for_optimization = min_samples_for_optimization
        self.acquisition_samples = acquisition_samples
        self.exploration_weight = exploration_weight
        self.safe_mode_enabled = safe_mode_enabled
        
        # Initialize components
        self.gp_model = None
        self.scaler = StandardScaler()
        self.parameter_names = []
        self.parameter_bounds = {}
        self.historical_data = []
        
        # Logging setup
        self.logger = logging.getLogger(__name__)
        self.explainability_logs = []
        
        # Create output directory
        self.output_dir = Path("adaptive/output/params")
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def suggest_parameters(self, 
                          strategy_id: str,
                          parameter_bounds: Optional[Dict[str, Tuple[float, float]]] = None,
                          market_state: Optional[MarketState] = None) -> OptimizedStrategyParameters:
        """
        Suggest optimal parameters for a strategy.
        
        Args:
            strategy_id: Strategy identifier
            parameter_bounds: Parameter bounds for optimization
            market_state: Current market state (optional)
            
        Returns:
            OptimizedStrategyParameters with suggested parameters
        """
        self.logger.info(f"Suggesting parameters for strategy: {strategy_id}")
        
        # Load historical data
        historical_results = self._load_historical_data(strategy_id)
        
        # Check if we have enough data for optimization
        if len(historical_results) < self.min_samples_for_optimization:
            self.logger.warning(
                f"Insufficient data for {strategy_id} "
                f"({len(historical_results)} < {self.min_samples_for_optimization}). "
                "Using safe-mode fallback."
            )
            return self._safe_mode_fallback(strategy_id, parameter_bounds, market_state)
        
        # Set parameter bounds
        if parameter_bounds:
            self.parameter_bounds = parameter_bounds
        else:
            self.parameter_bounds = self._infer_parameter_bounds(historical_results)
        
        # Prepare data for GP
        X, y = self._prepare_training_data(historical_results)
        
        if len(X) == 0:
            self.logger.warning("No valid training data found. Using safe-mode fallback.")
            return self._safe_mode_fallback(strategy_id, parameter_bounds, market_state)
        
        # Train Gaussian Process
        self._train_gaussian_process(X, y)
        
        # Find optimal parameters using Expected Improvement
        optimal_params, acquisition_scores = self._optimize_acquisition(X, y)
        
        # Log explainability information
        self._log_explainability(strategy_id, optimal_params, acquisition_scores, X, y)
        
        # Create optimized parameters object
        result = self._create_optimized_parameters(
            strategy_id, optimal_params, acquisition_scores, market_state
        )
        
        # Save results
        self._save_optimization_result(result)
        
        return result
    
    def update(self, new_result: Dict[str, Any]) -> None:
        """
        Update optimizer with new backtest result.
        
        Args:
            new_result: New backtest result data
        """
        self.logger.info(f"Updating optimizer with new result for {new_result.get('strategy_id', 'unknown')}")
        
        # Add to historical data
        self.historical_data.append(new_result)
        
        # Optionally retrain model if we have enough new data
        if len(self.historical_data) % 5 == 0:  # Retrain every 5 new results
            self.logger.info("Retraining GP model with updated data")
            # Model will be retrained on next suggest_parameters call
            self.gp_model = None
    
    def _load_historical_data(self, strategy_id: str) -> List[Dict[str, Any]]:
        """Load historical backtest results for strategy"""
        results = []
        runs_dir = Path("runs")
        
        if not runs_dir.exists():
            self.logger.warning("Runs directory not found")
            return results
        
        # Search for summary.json files
        for run_dir in runs_dir.iterdir():
            if not run_dir.is_dir():
                continue
                
            summary_file = run_dir / "summary.json"
            if not summary_file.exists():
                continue
            
            try:
                with open(summary_file, 'r') as f:
                    data = json.load(f)
                
                # Filter by strategy_id
                if data.get('strategy_id') == strategy_id:
                    results.append(data)
                    
            except (json.JSONDecodeError, KeyError) as e:
                self.logger.warning(f"Error loading {summary_file}: {e}")
                continue
        
        self.logger.info(f"Loaded {len(results)} historical results for {strategy_id}")
        return results
    
    def _infer_parameter_bounds(self, historical_results: List[Dict[str, Any]]) -> Dict[str, Tuple[float, float]]:
        """Infer parameter bounds from historical data"""
        bounds = {}
        
        for result in historical_results:
            params = result.get('parameters', {})
            for param_name, value in params.items():
                if isinstance(value, (int, float)):
                    if param_name not in bounds:
                        bounds[param_name] = [value, value]
                    else:
                        bounds[param_name][0] = min(bounds[param_name][0], value)
                        bounds[param_name][1] = max(bounds[param_name][1], value)
        
        # Convert to tuples and add some padding
        for param_name in bounds:
            min_val, max_val = bounds[param_name]
            if min_val == max_val:
                # Add default padding if all values are the same
                padding = abs(min_val * 0.2) if min_val != 0 else 0.1
                bounds[param_name] = (min_val - padding, max_val + padding)
            else:
                # Add 10% padding
                range_val = max_val - min_val
                padding = range_val * 0.1
                bounds[param_name] = (min_val - padding, max_val + padding)
        
        return bounds
    
    def _prepare_training_data(self, historical_results: List[Dict[str, Any]]) -> Tuple[np.ndarray, np.ndarray]:
        """Prepare training data for Gaussian Process"""
        X_list = []
        y_list = []
        
        # Get parameter names from first result
        if historical_results:
            self.parameter_names = list(historical_results[0].get('parameters', {}).keys())
            self.parameter_names = [name for name in self.parameter_names 
                                  if name in self.parameter_bounds]
        
        for result in historical_results:
            params = result.get('parameters', {})
            
            # Extract parameter values
            param_values = []
            for param_name in self.parameter_names:
                if param_name in params and isinstance(params[param_name], (int, float)):
                    param_values.append(float(params[param_name]))
                else:
                    # Skip this result if missing parameters
                    param_values = None
                    break
            
            if param_values is None:
                continue
            
            # Extract objective value (default to Sharpe ratio)
            objective = result.get('sharpe_ratio', 0.0)
            if not isinstance(objective, (int, float)) or np.isnan(objective):
                continue
            
            X_list.append(param_values)
            y_list.append(objective)
        
        if not X_list:
            return np.array([]), np.array([])
        
        X = np.array(X_list)
        y = np.array(y_list)
        
        # Normalize features
        if len(X) > 1:
            X = self.scaler.fit_transform(X)
        
        return X, y
    
    def _train_gaussian_process(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train Gaussian Process model"""
        # Define kernel
        kernel = ConstantKernel(1.0) * RBF(length_scale=1.0) + \
                ConstantKernel(0.1) * Matern(length_scale=1.0, nu=2.5)
        
        # Create and train GP
        self.gp_model = GaussianProcessRegressor(
            kernel=kernel,
            alpha=1e-6,
            normalize_y=True,
            n_restarts_optimizer=5,
            random_state=42
        )
        
        self.gp_model.fit(X, y)
        self.logger.info(f"Trained GP model with {len(X)} samples")
    
    def _expected_improvement(self, X: np.ndarray, X_sample: np.ndarray, y_sample: np.ndarray) -> np.ndarray:
        """Calculate Expected Improvement acquisition function"""
        mu, sigma = self.gp_model.predict(X, return_std=True)
        
        # Current best value
        f_best = np.max(y_sample)
        
        # Calculate improvement
        improvement = mu - f_best - self.exploration_weight
        
        # Calculate Expected Improvement
        with np.errstate(divide='warn'):
            Z = improvement / sigma
            ei = improvement * norm.cdf(Z) + sigma * norm.pdf(Z)
            ei[sigma == 0.0] = 0.0
        
        return ei

    def _optimize_acquisition(self, X_sample: np.ndarray, y_sample: np.ndarray) -> Tuple[Dict[str, float], Dict[str, Any]]:
        """Optimize acquisition function to find best parameters"""
        best_ei = -np.inf
        best_params = None
        acquisition_scores = {}

        # Generate candidate points
        candidates = self._generate_candidates()

        # Evaluate Expected Improvement for all candidates
        ei_values = self._expected_improvement(candidates, X_sample, y_sample)

        # Find best candidate
        best_idx = np.argmax(ei_values)
        best_candidate = candidates[best_idx]
        best_ei = ei_values[best_idx]

        # Convert back to original parameter space
        if len(X_sample) > 1:
            best_candidate_original = self.scaler.inverse_transform([best_candidate])[0]
        else:
            best_candidate_original = best_candidate

        # Create parameter dictionary
        best_params = {}
        for i, param_name in enumerate(self.parameter_names):
            best_params[param_name] = float(best_candidate_original[i])

            # Ensure within bounds
            min_bound, max_bound = self.parameter_bounds[param_name]
            best_params[param_name] = np.clip(best_params[param_name], min_bound, max_bound)

        # Store acquisition scores for explainability
        acquisition_scores = {
            'best_expected_improvement': float(best_ei),
            'candidate_scores': ei_values.tolist()[:100],  # Store top 100 for logging
            'total_candidates_evaluated': len(candidates),
            'acquisition_function': 'expected_improvement',
            'exploration_weight': self.exploration_weight
        }

        return best_params, acquisition_scores

    def _generate_candidates(self) -> np.ndarray:
        """Generate candidate parameter combinations"""
        candidates = []

        # Random sampling within bounds
        for _ in range(self.acquisition_samples):
            candidate = []
            for param_name in self.parameter_names:
                min_bound, max_bound = self.parameter_bounds[param_name]
                value = np.random.uniform(min_bound, max_bound)
                candidate.append(value)
            candidates.append(candidate)

        candidates = np.array(candidates)

        # Normalize candidates if we have training data
        if hasattr(self.scaler, 'scale_') and self.scaler.scale_ is not None:
            candidates = self.scaler.transform(candidates)

        return candidates

    def _safe_mode_fallback(self,
                           strategy_id: str,
                           parameter_bounds: Optional[Dict[str, Tuple[float, float]]],
                           market_state: Optional[MarketState]) -> OptimizedStrategyParameters:
        """Fallback to strategy presets when insufficient data"""
        self.logger.info(f"Using safe-mode fallback for {strategy_id}")

        # Default parameters based on strategy type
        default_params = self._get_default_parameters(strategy_id)

        # If bounds provided, ensure defaults are within bounds
        if parameter_bounds:
            for param_name, value in default_params.items():
                if param_name in parameter_bounds:
                    min_bound, max_bound = parameter_bounds[param_name]
                    default_params[param_name] = np.clip(value, min_bound, max_bound)

        # Create result with safe-mode indicators
        result = OptimizedStrategyParameters(
            version=self.version,
            strategy_name=strategy_id,
            market_state_id=market_state.state_id if market_state else "",
            parameters=default_params,
            expected_return=0.0,  # Unknown in safe mode
            expected_volatility=0.0,
            sharpe_ratio=0.0,
            optimization_score=0.0,  # Low confidence in safe mode
            parameter_stability=1.0,  # Defaults are stable
            out_of_sample_performance=0.0,
            optimization_method="safe_mode_fallback",
            optimization_iterations=0,
            optimization_duration_seconds=0.0,
            parameter_bounds=parameter_bounds or {}
        )

        # Log safe mode usage
        self._log_safe_mode_usage(strategy_id, default_params)

        return result

    def _get_default_parameters(self, strategy_id: str) -> Dict[str, float]:
        """Get default parameters for strategy"""
        defaults = {
            'iron_condor': {
                'strike_delta': 0.25,
                'days_to_expiry': 45,
                'profit_target': 0.5,
                'stop_loss': 2.0,
                'min_credit': 1.0
            },
            'wheel': {
                'strike_delta': 0.30,
                'days_to_expiry': 30,
                'assignment_threshold': 0.9
            },
            'pmcc': {
                'long_delta': 0.80,
                'short_delta': 0.30,
                'days_to_expiry': 30,
                'profit_target': 0.25
            },
            'bull_put_spread': {
                'strike_delta': 0.20,
                'days_to_expiry': 45,
                'profit_target': 0.5,
                'max_loss_ratio': 2.0
            }
        }

        return defaults.get(strategy_id, {
            'strike_delta': 0.25,
            'days_to_expiry': 45,
            'profit_target': 0.5
        })

    def _create_optimized_parameters(self,
                                   strategy_id: str,
                                   optimal_params: Dict[str, float],
                                   acquisition_scores: Dict[str, Any],
                                   market_state: Optional[MarketState]) -> OptimizedStrategyParameters:
        """Create OptimizedStrategyParameters object"""

        # Estimate performance based on GP prediction
        if self.gp_model and optimal_params:
            # Convert to normalized space for prediction
            param_array = np.array([[optimal_params[name] for name in self.parameter_names]])
            if hasattr(self.scaler, 'scale_') and self.scaler.scale_ is not None:
                param_array = self.scaler.transform(param_array)

            predicted_performance, std = self.gp_model.predict(param_array, return_std=True)
            expected_sharpe = float(predicted_performance[0])
            confidence = float(1.0 / (1.0 + std[0]))  # Convert std to confidence
        else:
            expected_sharpe = 0.0
            confidence = 0.0

        return OptimizedStrategyParameters(
            version=self.version,
            strategy_name=strategy_id,
            market_state_id=market_state.state_id if market_state else "",
            parameters=optimal_params,
            expected_return=max(0.0, expected_sharpe * 0.1),  # Rough conversion
            expected_volatility=0.15,  # Default assumption
            sharpe_ratio=expected_sharpe,
            max_drawdown=0.1,  # Conservative estimate
            win_rate=0.65,  # Default assumption
            optimization_score=confidence,
            parameter_stability=0.8,  # Assume good stability
            out_of_sample_performance=confidence * 0.9,  # Slightly lower than in-sample
            optimization_method="bayesian_gaussian_process",
            optimization_iterations=self.acquisition_samples,
            optimization_duration_seconds=0.0,  # Will be set by caller
            parameter_bounds=self.parameter_bounds
        )

    def _log_explainability(self,
                          strategy_id: str,
                          optimal_params: Dict[str, float],
                          acquisition_scores: Dict[str, Any],
                          X: np.ndarray,
                          y: np.ndarray) -> None:
        """Log explainability information"""
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'strategy_id': strategy_id,
            'optimization_method': 'bayesian_gaussian_process',
            'training_samples': len(X),
            'parameter_bounds': self.parameter_bounds,
            'optimal_parameters': optimal_params,
            'acquisition_scores': acquisition_scores,
            'historical_performance_stats': {
                'mean_objective': float(np.mean(y)) if len(y) > 0 else 0.0,
                'std_objective': float(np.std(y)) if len(y) > 0 else 0.0,
                'min_objective': float(np.min(y)) if len(y) > 0 else 0.0,
                'max_objective': float(np.max(y)) if len(y) > 0 else 0.0
            },
            'model_info': {
                'kernel': str(self.gp_model.kernel_) if self.gp_model else None,
                'log_marginal_likelihood': float(self.gp_model.log_marginal_likelihood()) if self.gp_model else None
            }
        }

        self.explainability_logs.append(log_entry)
        self.logger.info(f"Optimization explainability logged for {strategy_id}")

    def _log_safe_mode_usage(self, strategy_id: str, default_params: Dict[str, float]) -> None:
        """Log safe mode fallback usage"""
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'strategy_id': strategy_id,
            'optimization_method': 'safe_mode_fallback',
            'reason': 'insufficient_historical_data',
            'min_samples_required': self.min_samples_for_optimization,
            'default_parameters': default_params,
            'fallback_rationale': f"Less than {self.min_samples_for_optimization} historical results available"
        }

        self.explainability_logs.append(log_entry)
        self.logger.warning(f"Safe mode fallback used for {strategy_id}")

    def _save_optimization_result(self, result: OptimizedStrategyParameters) -> None:
        """Save optimization result to file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{result.strategy_name}_{timestamp}.json"
        filepath = self.output_dir / result.strategy_name
        filepath.mkdir(exist_ok=True)

        output_file = filepath / filename

        # Convert to dictionary and add metadata
        result_dict = asdict(result)
        result_dict['generated_by'] = 'bayesian_optimizer'
        result_dict['code_version'] = self.version.code_version
        result_dict['data_snapshot'] = self.version.data_snapshot
        result_dict['valid_until'] = (datetime.now() + timedelta(days=30)).isoformat()

        # Add explainability logs
        if self.explainability_logs:
            result_dict['explainability_logs'] = self.explainability_logs[-1]  # Latest log

        with open(output_file, 'w') as f:
            json.dump(result_dict, f, indent=2, default=str)

        self.logger.info(f"Optimization result saved to {output_file}")

    def get_explainability_logs(self) -> List[Dict[str, Any]]:
        """Get explainability logs for analysis"""
        return self.explainability_logs.copy()

    def clear_explainability_logs(self) -> None:
        """Clear explainability logs"""
        self.explainability_logs.clear()
