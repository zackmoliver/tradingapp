"""
Adaptive Intelligence Manager

This module provides the central manager for adaptive intelligence components,
including anomaly detection integration with risk management and position sizing.

Features:
- Anomaly detection integration with position sizing
- Risk management hooks for engine/risk PositionSizer
- Centralized adaptive intelligence coordination
- Version tracking and logging
- Real-time market monitoring
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable, Union, Tuple
import logging
from pathlib import Path

from .types import AdaptiveVersion, MarketState, StrategyAllocation, OptimizedStrategyParameters, MarketRegime
# Import with graceful fallback
AutoencoderAnomalyDetector = None
TORCH_AVAILABLE = False

try:
    from .pattern.autoencoder import AutoencoderAnomalyDetector, TORCH_AVAILABLE
except ImportError:
    pass  # Keep defaults


class AdaptiveManager:
    """
    Central manager for adaptive intelligence components.

    This manager coordinates anomaly detection, pattern recognition,
    and integration with risk management systems for dynamic position sizing.
    """

    def __init__(self,
                 version: Optional[AdaptiveVersion] = None,
                 anomaly_detector: Optional[AutoencoderAnomalyDetector] = None,
                 position_sizing_reduction_factor: float = 0.5,
                 anomaly_cooldown_minutes: int = 30):
        """
        Initialize Adaptive Manager.

        Args:
            version: Version tracking information
            anomaly_detector: Anomaly detector instance
            position_sizing_reduction_factor: Factor to reduce position sizes during anomalies
            anomaly_cooldown_minutes: Minutes to wait before resetting anomaly state
        """
        self.version = version or AdaptiveVersion()
        self.anomaly_detector = anomaly_detector
        self.position_sizing_reduction_factor = position_sizing_reduction_factor
        self.anomaly_cooldown_minutes = anomaly_cooldown_minutes

        # State tracking
        self.current_anomaly_state = {
            'is_anomalous': False,
            'anomaly_score': 0.0,
            'detected_at': None,
            'severity': 'none',
            'rationale': {}
        }

        # Position sizing hooks
        self.position_sizing_hooks = []

        # Logging setup
        self.logger = logging.getLogger(__name__)
        self.manager_logs = []

        # Create output directory
        self.output_dir = Path("adaptive/output/manager")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def register_position_sizing_hook(self, hook_function: Callable[[float, Dict[str, Any]], float]) -> None:
        """
        Register a position sizing hook function.

        Args:
            hook_function: Function that takes (base_size, context) and returns adjusted_size
        """
        self.position_sizing_hooks.append(hook_function)
        self.logger.info(f"Registered position sizing hook: {hook_function.__name__}")

    def analyze_market_conditions(self,
                                 market_data: pd.DataFrame,
                                 market_state: Optional[MarketState] = None) -> Dict[str, Any]:
        """
        Analyze current market conditions for anomalies and patterns.

        Args:
            market_data: Recent market data for analysis
            market_state: Current market state

        Returns:
            Analysis results including anomaly detection and recommendations
        """
        self.logger.info("Analyzing market conditions for anomalies")

        analysis_results = {
            'timestamp': datetime.now().isoformat(),
            'market_state_id': market_state.state_id if market_state else None,
            'anomaly_detection': {},
            'position_sizing_recommendation': 1.0,  # Default: no adjustment
            'risk_level': 'normal',
            'recommendations': []
        }

        # Run anomaly detection if available
        if self.anomaly_detector and self.anomaly_detector.is_trained:
            try:
                anomaly_results = self.anomaly_detector.detect(market_data, market_state)
                analysis_results['anomaly_detection'] = anomaly_results

                # Update anomaly state
                self._update_anomaly_state(anomaly_results)

                # Determine position sizing adjustment
                if self.current_anomaly_state['is_anomalous']:
                    analysis_results['position_sizing_recommendation'] = self.position_sizing_reduction_factor
                    analysis_results['risk_level'] = 'elevated'
                    analysis_results['recommendations'].append(
                        f"Reduce position sizes by {(1-self.position_sizing_reduction_factor)*100:.0f}% due to anomaly detection"
                    )

            except Exception as e:
                self.logger.error(f"Anomaly detection failed: {e}")
                analysis_results['anomaly_detection'] = {'error': str(e)}

        else:
            analysis_results['anomaly_detection'] = {
                'status': 'unavailable',
                'reason': 'Anomaly detector not available or not trained'
            }

        # Check for anomaly cooldown
        self._check_anomaly_cooldown()

        # Add current anomaly state to results
        analysis_results['current_anomaly_state'] = self.current_anomaly_state.copy()

        # Log analysis
        self._log_market_analysis(analysis_results)

        return analysis_results

    def get_position_sizing_multiplier(self,
                                     base_context: Optional[Dict[str, Any]] = None) -> float:
        """
        Get position sizing multiplier based on current market conditions.

        Args:
            base_context: Additional context for position sizing decision

        Returns:
            Multiplier for position sizing (1.0 = normal, <1.0 = reduced)
        """
        context = base_context or {}
        context.update({
            'anomaly_state': self.current_anomaly_state,
            'manager_version': self.version.to_dict()
        })

        # Start with base multiplier
        if self.current_anomaly_state['is_anomalous']:
            multiplier = self.position_sizing_reduction_factor
            self.logger.info(f"Reducing position sizing to {multiplier:.2f} due to anomaly detection")
        else:
            multiplier = 1.0

        # Apply registered hooks
        for hook in self.position_sizing_hooks:
            try:
                multiplier = hook(multiplier, context)
            except Exception as e:
                self.logger.error(f"Position sizing hook {hook.__name__} failed: {e}")

        # Ensure multiplier is within reasonable bounds
        multiplier = max(0.1, min(2.0, multiplier))

        return multiplier

    def create_position_sizer_hook(self) -> Callable:
        """
        Create a hook function for engine/risk PositionSizer integration.

        Returns:
            Hook function that can be registered with PositionSizer
        """
        def position_sizer_hook(base_size: float, context: Dict[str, Any]) -> float:
            """
            Hook function for PositionSizer to adjust sizes based on anomaly detection.

            Args:
                base_size: Base position size calculated by PositionSizer
                context: Context information from PositionSizer

            Returns:
                Adjusted position size
            """
            multiplier = self.get_position_sizing_multiplier(context)
            adjusted_size = base_size * multiplier

            if multiplier < 1.0:
                self.logger.info(
                    f"PositionSizer hook: Adjusted size from {base_size:.2f} to {adjusted_size:.2f} "
                    f"(multiplier: {multiplier:.2f})"
                )

            return adjusted_size

        return position_sizer_hook

    def _update_anomaly_state(self, anomaly_results: Dict[str, Any]) -> None:
        """Update internal anomaly state based on detection results"""

        if anomaly_results.get('anomalies_detected', False):
            # New anomaly detected
            if not self.current_anomaly_state['is_anomalous']:
                self.logger.warning("Anomaly state activated")

            self.current_anomaly_state.update({
                'is_anomalous': True,
                'anomaly_score': anomaly_results.get('max_anomaly_score', 0.0),
                'detected_at': datetime.now(),
                'severity': anomaly_results.get('rationale', {}).get('severity_assessment', 'unknown'),
                'rationale': anomaly_results.get('rationale', {})
            })

        elif self.current_anomaly_state['is_anomalous']:
            # Check if we should maintain anomaly state or clear it
            # For now, we maintain state until cooldown expires
            pass

    def _check_anomaly_cooldown(self) -> None:
        """Check if anomaly cooldown period has expired"""

        if (self.current_anomaly_state['is_anomalous'] and
            self.current_anomaly_state['detected_at']):

            time_since_detection = datetime.now() - self.current_anomaly_state['detected_at']
            cooldown_period = timedelta(minutes=self.anomaly_cooldown_minutes)

            if time_since_detection > cooldown_period:
                self.logger.info("Anomaly cooldown period expired, resetting state")
                self.current_anomaly_state = {
                    'is_anomalous': False,
                    'anomaly_score': 0.0,
                    'detected_at': None,
                    'severity': 'none',
                    'rationale': {}
                }

    def _log_market_analysis(self, analysis_results: Dict[str, Any]) -> None:
        """Log market analysis results"""

        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'analysis_results': analysis_results,
            'manager_config': {
                'position_sizing_reduction_factor': self.position_sizing_reduction_factor,
                'anomaly_cooldown_minutes': self.anomaly_cooldown_minutes,
                'hooks_registered': len(self.position_sizing_hooks)
            },
            'version': self.version.to_dict()
        }

        self.manager_logs.append(log_entry)

        # Log summary
        if analysis_results['anomaly_detection'].get('anomalies_detected', False):
            self.logger.warning(
                f"Market analysis: Anomalies detected, "
                f"position sizing reduced to {analysis_results['position_sizing_recommendation']:.2f}"
            )
        else:
            self.logger.info("Market analysis: Normal conditions, no position sizing adjustment")

    def get_manager_logs(self) -> List[Dict[str, Any]]:
        """Get manager logs"""
        return self.manager_logs.copy()

    def clear_manager_logs(self) -> None:
        """Clear manager logs"""
        self.manager_logs.clear()

    def get_status(self) -> Dict[str, Any]:
        """Get current manager status"""
        return {
            'version': self.version.to_dict(),
            'anomaly_detector_available': self.anomaly_detector is not None,
            'anomaly_detector_trained': (
                self.anomaly_detector.is_trained if self.anomaly_detector else False
            ),
            'current_anomaly_state': self.current_anomaly_state.copy(),
            'position_sizing_hooks': len(self.position_sizing_hooks),
            'torch_available': TORCH_AVAILABLE,
            'last_analysis': (
                self.manager_logs[-1]['timestamp'] if self.manager_logs else None
            )
        }

    def reset_anomaly_state(self) -> None:
        """Manually reset anomaly state (for testing or emergency use)"""
        self.logger.info("Manually resetting anomaly state")
        self.current_anomaly_state = {
            'is_anomalous': False,
            'anomaly_score': 0.0,
            'detected_at': None,
            'severity': 'none',
            'rationale': {}
        }


# Convenience function for creating position sizer hook
def create_adaptive_position_sizer_hook(
    anomaly_detector: Optional[AutoencoderAnomalyDetector] = None,
    reduction_factor: float = 0.5,
    version: Optional[AdaptiveVersion] = None
) -> Callable:
    """
    Create a position sizer hook for engine/risk integration.

    Args:
        anomaly_detector: Anomaly detector instance
        reduction_factor: Factor to reduce position sizes during anomalies
        version: Version tracking information

    Returns:
        Hook function for PositionSizer
    """
    manager = AdaptiveManager(
        version=version,
        anomaly_detector=anomaly_detector,
        position_sizing_reduction_factor=reduction_factor
    )

    return manager.create_position_sizer_hook()


class AdaptiveLearningManager:
    """
    Comprehensive orchestrator for adaptive intelligence components.

    This manager integrates all three phases of Batch 8:
    - Phase 1: Bayesian parameter optimization
    - Phase 2: Anomaly detection with position sizing
    - Phase 3: RL strategy allocation

    Provides unified interface with safe-mode fallbacks and version tracking.
    """

    def __init__(self, repo, code_version: str):
        """
        Initialize Adaptive Learning Manager.

        Args:
            repo: Repository interface for data access
            code_version: Current code version (git commit hash)
        """
        self.repo = repo
        self.code_version = code_version

        # Create version tracking
        self.version = AdaptiveVersion(
            code_version=code_version,
            data_snapshot=datetime.now().isoformat(),
            git_commit=code_version[:8] if len(code_version) > 8 else code_version
        )

        # Initialize components
        self.optimizers = {}  # strategy_id -> BayesianOptimizer
        self.rl_agent = None
        self.anomaly_detector = None

        # Initialize core manager for anomaly detection
        self.adaptive_manager = AdaptiveManager(
            version=self.version,
            position_sizing_reduction_factor=0.5,
            anomaly_cooldown_minutes=30
        )

        # Logging setup
        self.logger = logging.getLogger(__name__)
        self.orchestration_logs = []

        # Create output directory
        self.output_dir = Path("adaptive/output/orchestration")
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Initialize components
        self._initialize_components()

    def _initialize_components(self):
        """Initialize all adaptive components"""
        try:
            # Initialize Bayesian Optimizer (Phase 1)
            from .optimizer.bayesian_optimizer import BayesianOptimizer
            self.bayesian_optimizer = BayesianOptimizer(
                version=self.version,
                min_samples_for_optimization=5,
                acquisition_samples=100
            )
            self.logger.info("Bayesian optimizer initialized")
        except ImportError as e:
            self.logger.warning(f"Bayesian optimizer not available: {e}")
            self.bayesian_optimizer = None

        try:
            # Initialize Anomaly Detector (Phase 2)
            from .pattern.autoencoder import AutoencoderAnomalyDetector, TORCH_AVAILABLE
            if TORCH_AVAILABLE:
                self.anomaly_detector = AutoencoderAnomalyDetector(
                    version=self.version,
                    window_size=20,
                    encoding_dim=8,
                    epochs=50,
                    anomaly_threshold_percentile=99.0
                )
                # Integrate with adaptive manager
                self.adaptive_manager.anomaly_detector = self.anomaly_detector
                self.logger.info("Anomaly detector initialized")
            else:
                self.logger.warning("PyTorch not available, anomaly detection disabled")
        except ImportError as e:
            self.logger.warning(f"Anomaly detector not available: {e}")

        try:
            # Initialize RL Agent (Phase 3)
            from .rl.agent import DQNAgent, TORCH_AVAILABLE as RL_TORCH_AVAILABLE
            if RL_TORCH_AVAILABLE:
                self.rl_agent = DQNAgent(
                    version=self.version,
                    state_dim=25,
                    action_dim=4,
                    learning_rate=0.001,
                    epsilon_start=0.1,  # Lower exploration for production
                    safe_mode_enabled=True,
                    strategy_names=['iron_condor', 'wheel', 'pmcc', 'bull_put_spread']
                )
                self.logger.info("RL agent initialized")
            else:
                self.logger.warning("PyTorch not available, RL agent disabled")
        except ImportError as e:
            self.logger.warning(f"RL agent not available: {e}")
            self.rl_agent = None

    async def on_backtest_complete(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process backtest completion and update all adaptive components.

        Args:
            result: Backtest result dictionary with strategy performance

        Returns:
            Processing results and component updates
        """
        self.logger.info(f"Processing backtest completion for strategy: {result.get('strategy_id', 'unknown')}")

        processing_results = {
            'timestamp': datetime.now().isoformat(),
            'strategy_id': result.get('strategy_id'),
            'backtest_result': result,
            'component_updates': {},
            'version': self.version.to_dict()
        }

        try:
            # Update Bayesian Optimizer (Phase 1)
            if self.bayesian_optimizer and 'parameters' in result:
                optimizer_result = {
                    'strategy_id': result['strategy_id'],
                    'parameters': result['parameters'],
                    'sharpe_ratio': result.get('sharpe_ratio', 0.0),
                    'total_pnl': result.get('total_pnl', 0.0),
                    'max_drawdown': result.get('max_drawdown', 0.0),
                    'win_rate': result.get('win_rate', 0.0)
                }

                self.bayesian_optimizer.update(optimizer_result)
                processing_results['component_updates']['bayesian_optimizer'] = 'updated'
                self.logger.info("Updated Bayesian optimizer with backtest results")

            # Feed RL Agent (Phase 3)
            if self.rl_agent and 'market_state' in result:
                # Convert backtest result to RL experience
                reward = self._calculate_rl_reward(result)

                # Store experience for RL training
                if hasattr(self.rl_agent, 'current_episode_data'):
                    episode_data = self.rl_agent.current_episode_data
                    if 'state' in episode_data and 'action' in episode_data:
                        # Create next state from result
                        next_state = self._market_state_to_features(result['market_state'])

                        # Train RL agent
                        metrics = self.rl_agent.train_step(
                            episode_data['state'],
                            episode_data['action'],
                            reward,
                            next_state,
                            done=True  # Backtest episode complete
                        )

                        processing_results['component_updates']['rl_agent'] = {
                            'reward': reward,
                            'training_metrics': metrics
                        }
                        self.logger.info(f"Fed RL agent with reward: {reward:.3f}")

            # Evaluate Anomalies (Phase 2)
            if self.anomaly_detector and 'market_data' in result:
                market_data = pd.DataFrame(result['market_data'])
                anomaly_results = self.anomaly_detector.detect(market_data)

                processing_results['component_updates']['anomaly_detector'] = {
                    'anomalies_detected': anomaly_results.get('anomalies_detected', False),
                    'anomaly_count': anomaly_results.get('num_anomalies', 0),
                    'max_anomaly_score': anomaly_results.get('max_anomaly_score', 0.0)
                }

                # Update adaptive manager state
                if anomaly_results.get('anomalies_detected', False):
                    self.adaptive_manager._update_anomaly_state(anomaly_results)

                self.logger.info(f"Evaluated anomalies: {anomaly_results.get('num_anomalies', 0)} detected")

            # Log orchestration results
            self._log_orchestration_event('backtest_complete', processing_results)

            # Save orchestration artifact
            self._save_orchestration_artifact('backtest_processing', processing_results)

        except Exception as e:
            self.logger.error(f"Error processing backtest completion: {e}")
            processing_results['error'] = str(e)

        return processing_results

    async def get_parameters(self, strategy_id: str, market_state: Optional[MarketState] = None) -> OptimizedStrategyParameters:
        """
        Get optimized parameters for strategy with safe-mode fallback.

        Args:
            strategy_id: Strategy identifier
            market_state: Current market state (optional)

        Returns:
            OptimizedStrategyParameters with safe-mode fallback
        """
        self.logger.info(f"Getting optimized parameters for strategy: {strategy_id}")

        try:
            # Try Bayesian Optimizer first (Phase 1)
            if self.bayesian_optimizer:
                # Define parameter bounds for strategy
                parameter_bounds = self._get_strategy_parameter_bounds(strategy_id)

                if parameter_bounds and market_state:
                    result = self.bayesian_optimizer.suggest_parameters(
                        strategy_id, parameter_bounds, market_state
                    )

                    # Convert to OptimizedStrategyParameters
                    params = OptimizedStrategyParameters(
                        version=self.version,
                        strategy_name=strategy_id,
                        market_state_id=market_state.state_id,
                        parameters=result.parameters,
                        expected_return=result.expected_return,
                        sharpe_ratio=result.sharpe_ratio,
                        optimization_method=result.optimization_method,
                        optimization_score=result.optimization_score
                    )

                    self.logger.info(f"Retrieved optimized parameters via Bayesian optimization")
                    return params

            # Safe-mode fallback
            return self._get_safe_mode_parameters(strategy_id, market_state)

        except Exception as e:
            self.logger.error(f"Error getting parameters for {strategy_id}: {e}")
            return self._get_safe_mode_parameters(strategy_id, market_state)

    async def get_strategy_allocation(self, market_state: MarketState, total_capital: float = 100000.0) -> StrategyAllocation:
        """
        Get strategy allocation with safe-mode fallback.

        Args:
            market_state: Current market state
            total_capital: Total capital to allocate

        Returns:
            StrategyAllocation with safe-mode fallback
        """
        self.logger.info("Getting strategy allocation from RL agent")

        try:
            # Check for anomalies first (Phase 2)
            anomaly_adjustment = 1.0
            if self.adaptive_manager.current_anomaly_state['is_anomalous']:
                anomaly_adjustment = self.adaptive_manager.position_sizing_reduction_factor
                self.logger.warning(f"Anomalies detected, reducing allocation by {(1-anomaly_adjustment)*100:.0f}%")

            # Adjust capital based on anomaly detection
            adjusted_capital = total_capital * anomaly_adjustment

            # Try RL Agent first (Phase 3)
            if self.rl_agent:
                allocation = self.rl_agent.get_strategy_allocation(market_state, adjusted_capital)

                # Enhance allocation with optimized parameters (Phase 1)
                await self._enhance_allocation_with_optimized_parameters(allocation, market_state)

                # Add anomaly context
                allocation.anomaly_adjustment = anomaly_adjustment
                allocation.original_capital = total_capital

                self.logger.info(f"Retrieved strategy allocation via RL agent")
                return allocation

            # Safe-mode fallback
            return await self._get_safe_mode_allocation(market_state, adjusted_capital, total_capital)

        except Exception as e:
            self.logger.error(f"Error getting strategy allocation: {e}")
            return await self._get_safe_mode_allocation(market_state, total_capital, total_capital)

    def _calculate_rl_reward(self, backtest_result: Dict[str, Any]) -> float:
        """Calculate RL reward from backtest result"""

        # Base reward from Sharpe ratio
        sharpe_ratio = backtest_result.get('sharpe_ratio', 0.0)
        base_reward = sharpe_ratio

        # Adjust for win rate
        win_rate = backtest_result.get('win_rate', 0.5)
        win_rate_bonus = (win_rate - 0.5) * 2.0  # Bonus/penalty for win rate above/below 50%

        # Adjust for max drawdown (penalty for high drawdown)
        max_drawdown = backtest_result.get('max_drawdown', 0.0)
        drawdown_penalty = max_drawdown * 5.0  # Penalty for drawdown

        # Total return component
        total_return = backtest_result.get('total_return', 0.0)
        return_component = total_return * 10.0

        # Combine components
        total_reward = base_reward + win_rate_bonus - drawdown_penalty + return_component

        return max(-10.0, min(10.0, total_reward))  # Clip to reasonable range

    def _market_state_to_features(self, market_state: MarketState) -> np.ndarray:
        """Convert market state to feature vector for RL"""
        if self.rl_agent:
            return self.rl_agent._market_state_to_features(market_state)

        # Fallback feature extraction
        features = market_state.to_feature_vector()
        feature_list = list(features.values())[:25]  # Take first 25 features

        # Pad or truncate to expected size
        while len(feature_list) < 25:
            feature_list.append(0.0)

        return np.array(feature_list[:25], dtype=np.float32)

    def _get_strategy_parameter_bounds(self, strategy_id: str) -> Optional[Dict[str, Tuple[float, float]]]:
        """Get parameter bounds for strategy"""

        bounds_map = {
            'iron_condor': {
                'strike_delta': (0.15, 0.35),
                'days_to_expiry': (30, 60),
                'profit_target': (0.25, 0.75),
                'stop_loss': (1.5, 3.0),
                'min_credit': (0.5, 2.0)
            },
            'wheel': {
                'strike_delta': (0.20, 0.40),
                'days_to_expiry': (20, 45),
                'assignment_threshold': (0.8, 1.0)
            },
            'pmcc': {
                'long_delta': (0.70, 0.90),
                'short_delta': (0.20, 0.40),
                'days_to_expiry': (20, 60),
                'profit_target': (0.25, 0.75)
            },
            'bull_put_spread': {
                'strike_delta': (0.15, 0.30),
                'days_to_expiry': (30, 60),
                'profit_target': (0.30, 0.70),
                'max_loss': (1.5, 3.0)
            }
        }

        return bounds_map.get(strategy_id)

    def _get_safe_mode_parameters(self, strategy_id: str, market_state: Optional[MarketState] = None) -> OptimizedStrategyParameters:
        """Get safe-mode default parameters for strategy"""

        default_params = {
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
                'days_to_expiry': 45,
                'profit_target': 0.5
            },
            'bull_put_spread': {
                'strike_delta': 0.20,
                'days_to_expiry': 45,
                'profit_target': 0.5,
                'max_loss': 2.0
            }
        }

        params = default_params.get(strategy_id, {'strike_delta': 0.25, 'days_to_expiry': 45})

        return OptimizedStrategyParameters(
            version=self.version,
            strategy_name=strategy_id,
            market_state_id=market_state.state_id if market_state else "",
            parameters=params,
            expected_return=0.12,  # Conservative estimate
            sharpe_ratio=1.0,      # Conservative estimate
            optimization_method="safe_mode_default",
            optimization_score=0.3   # Low confidence for defaults
        )

    async def _enhance_allocation_with_optimized_parameters(self, allocation: StrategyAllocation, market_state: MarketState):
        """Enhance allocation with optimized parameters from Phase 1"""

        for strategy_name in allocation.allocations.keys():
            try:
                # Get optimized parameters for each strategy
                optimized_params = await self.get_parameters(strategy_name, market_state)
                allocation.strategy_parameters[strategy_name] = optimized_params

            except Exception as e:
                self.logger.warning(f"Could not get optimized parameters for {strategy_name}: {e}")
                # Keep existing parameters or use defaults

    async def _get_safe_mode_allocation(self, market_state: MarketState, adjusted_capital: float, original_capital: float) -> StrategyAllocation:
        """Get safe-mode strategy allocation"""

        self.logger.warning("Using safe-mode strategy allocation")

        allocation = StrategyAllocation(
            version=self.version,
            portfolio_name=f"safe_mode_allocation_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            total_capital=adjusted_capital,
            market_state_id=market_state.state_id
        )

        # Add metadata
        allocation.allocation_method = "safe_mode_orchestrator"
        allocation.confidence_score = 0.2
        allocation.anomaly_adjustment = adjusted_capital / original_capital
        allocation.original_capital = original_capital

        # Conservative allocation based on market regime
        if market_state.regime == MarketRegime.BULL:
            weights = {'wheel': 0.4, 'pmcc': 0.35, 'iron_condor': 0.25}
        elif market_state.regime == MarketRegime.BEAR:
            weights = {'iron_condor': 0.6, 'bull_put_spread': 0.4}
        else:  # SIDEWAYS
            weights = {'iron_condor': 0.5, 'wheel': 0.3, 'bull_put_spread': 0.2}

        # Add strategies with safe-mode parameters
        for strategy_name, weight in weights.items():
            params = self._get_safe_mode_parameters(strategy_name, market_state)
            allocation.add_strategy(strategy_name, weight, params)

        return allocation

    def _log_orchestration_event(self, event_type: str, data: Dict[str, Any]):
        """Log orchestration events"""

        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'event_type': event_type,
            'data': data,
            'version': self.version.to_dict(),
            'components_status': {
                'bayesian_optimizer': self.bayesian_optimizer is not None,
                'anomaly_detector': self.anomaly_detector is not None,
                'rl_agent': self.rl_agent is not None
            }
        }

        self.orchestration_logs.append(log_entry)
        self.logger.info(f"Orchestration event logged: {event_type}")

    def _save_orchestration_artifact(self, artifact_type: str, data: Dict[str, Any]):
        """Save orchestration artifacts"""

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{artifact_type}_{timestamp}.json"
        filepath = self.output_dir / filename

        artifact = {
            'artifact_type': artifact_type,
            'timestamp': datetime.now().isoformat(),
            'data': data,
            'generated_by': 'adaptive_learning_manager',
            'code_version': self.code_version,
            'version': self.version.to_dict()
        }

        with open(filepath, 'w') as f:
            json.dump(artifact, f, indent=2, default=str)

        self.logger.info(f"Orchestration artifact saved: {filepath}")

    def get_orchestration_status(self) -> Dict[str, Any]:
        """Get comprehensive status of all components"""

        status = {
            'timestamp': datetime.now().isoformat(),
            'version': self.version.to_dict(),
            'code_version': self.code_version,
            'components': {
                'bayesian_optimizer': {
                    'available': self.bayesian_optimizer is not None,
                    'status': 'active' if self.bayesian_optimizer else 'unavailable'
                },
                'anomaly_detector': {
                    'available': self.anomaly_detector is not None,
                    'trained': self.anomaly_detector.is_trained if self.anomaly_detector else False,
                    'status': 'active' if self.anomaly_detector and self.anomaly_detector.is_trained else 'inactive'
                },
                'rl_agent': {
                    'available': self.rl_agent is not None,
                    'training_step': self.rl_agent.training_step if self.rl_agent else 0,
                    'epsilon': self.rl_agent.epsilon if self.rl_agent else 0.0,
                    'status': 'active' if self.rl_agent else 'unavailable'
                },
                'adaptive_manager': {
                    'available': True,
                    'anomaly_state': self.adaptive_manager.current_anomaly_state['is_anomalous'],
                    'position_sizing_hooks': len(self.adaptive_manager.position_sizing_hooks),
                    'status': 'active'
                }
            },
            'orchestration_logs': len(self.orchestration_logs),
            'last_activity': self.orchestration_logs[-1]['timestamp'] if self.orchestration_logs else None
        }

        return status

    def get_orchestration_logs(self) -> List[Dict[str, Any]]:
        """Get orchestration logs"""
        return self.orchestration_logs.copy()

    def clear_orchestration_logs(self):
        """Clear orchestration logs"""
        self.orchestration_logs.clear()

    async def train_anomaly_detector(self, training_data: pd.DataFrame) -> Dict[str, Any]:
        """Train anomaly detector with market data"""

        if not self.anomaly_detector:
            return {'error': 'Anomaly detector not available'}

        try:
            feature_columns = ['close', 'volume', 'rsi', 'vix', 'implied_volatility']
            available_columns = [col for col in feature_columns if col in training_data.columns]

            if not available_columns:
                return {'error': 'No suitable columns found for training'}

            training_results = self.anomaly_detector.fit(training_data, available_columns)

            self.logger.info("Anomaly detector training completed")
            return {
                'success': True,
                'training_results': training_results,
                'threshold': self.anomaly_detector.anomaly_threshold
            }

        except Exception as e:
            self.logger.error(f"Error training anomaly detector: {e}")
            return {'error': str(e)}

    async def evaluate_market_conditions(self, market_data: pd.DataFrame, market_state: MarketState) -> Dict[str, Any]:
        """Evaluate current market conditions across all components"""

        evaluation = {
            'timestamp': datetime.now().isoformat(),
            'market_state_id': market_state.state_id,
            'evaluations': {}
        }

        # Anomaly evaluation (Phase 2)
        if self.anomaly_detector and self.anomaly_detector.is_trained:
            try:
                anomaly_results = self.anomaly_detector.detect(market_data, market_state)
                evaluation['evaluations']['anomaly_detection'] = anomaly_results

                # Update adaptive manager
                analysis = self.adaptive_manager.analyze_market_conditions(market_data, market_state)
                evaluation['evaluations']['position_sizing'] = analysis

            except Exception as e:
                evaluation['evaluations']['anomaly_detection'] = {'error': str(e)}

        # RL evaluation (Phase 3)
        if self.rl_agent:
            try:
                state_features = self._market_state_to_features(market_state)
                action_probs = self.rl_agent.get_action_probabilities(state_features)
                evaluation['evaluations']['rl_strategy_preferences'] = action_probs

            except Exception as e:
                evaluation['evaluations']['rl_strategy_preferences'] = {'error': str(e)}

        return evaluation