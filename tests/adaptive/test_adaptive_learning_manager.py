"""
Unit Tests for Adaptive Learning Manager

This module contains comprehensive unit tests for the AdaptiveLearningManager
orchestrator that integrates all three phases of Batch 8.

All tests use deterministic fixtures and mocked components.
"""

import pytest
import numpy as np
import pandas as pd
from datetime import datetime
from unittest.mock import Mock, patch, AsyncMock

from adaptive.manager import AdaptiveLearningManager
from adaptive.types import AdaptiveVersion, MarketState, MarketRegime, OptimizedStrategyParameters, StrategyAllocation


@pytest.mark.unit
@pytest.mark.adaptive
class TestAdaptiveLearningManager:
    """Test suite for AdaptiveLearningManager orchestrator"""
    
    @pytest.fixture
    def mock_repo(self):
        """Create mock repository"""
        repo = Mock()
        repo.get_backtest_results = AsyncMock(return_value=[])
        repo.save_parameters = AsyncMock()
        repo.save_allocation = AsyncMock()
        return repo
    
    @pytest.fixture
    def sample_backtest_result(self, sample_market_state):
        """Create sample backtest result"""
        return {
            'strategy_id': 'iron_condor',
            'parameters': {
                'strike_delta': 0.25,
                'days_to_expiry': 45,
                'profit_target': 0.5
            },
            'sharpe_ratio': 1.35,
            'total_pnl': 15000.0,
            'max_drawdown': 0.08,
            'win_rate': 0.72,
            'total_return': 0.15,
            'market_state': sample_market_state,
            'market_data': [
                {'close': 450.0, 'volume': 1000000, 'rsi': 55.0, 'vix': 18.0},
                {'close': 452.0, 'volume': 1100000, 'rsi': 58.0, 'vix': 17.5},
                {'close': 448.0, 'volume': 950000, 'rsi': 52.0, 'vix': 19.0}
            ]
        }
    
    def test_manager_initialization(self, mock_repo):
        """Test AdaptiveLearningManager initialization"""
        manager = AdaptiveLearningManager(mock_repo, "abc123def")
        
        assert manager.repo == mock_repo
        assert manager.code_version == "abc123def"
        assert manager.version.code_version == "abc123def"
        assert manager.version.git_commit == "abc123de"  # Truncated to 8 chars
        assert manager.optimizers == {}
        assert hasattr(manager, 'adaptive_manager')
        assert len(manager.orchestration_logs) == 0
    
    def test_component_initialization_status(self, mock_repo):
        """Test component initialization and status reporting"""
        manager = AdaptiveLearningManager(mock_repo, "test123")
        
        status = manager.get_orchestration_status()
        
        assert 'components' in status
        assert 'bayesian_optimizer' in status['components']
        assert 'anomaly_detector' in status['components']
        assert 'rl_agent' in status['components']
        assert 'adaptive_manager' in status['components']
        
        # Adaptive manager should always be available
        assert status['components']['adaptive_manager']['available'] is True
        
        # Other components depend on dependencies
        assert isinstance(status['components']['bayesian_optimizer']['available'], bool)
        assert isinstance(status['components']['anomaly_detector']['available'], bool)
        assert isinstance(status['components']['rl_agent']['available'], bool)
    
    @pytest.mark.asyncio
    async def test_on_backtest_complete(self, mock_repo, sample_backtest_result):
        """Test backtest completion processing"""
        manager = AdaptiveLearningManager(mock_repo, "test123")
        
        # Mock components
        manager.bayesian_optimizer = Mock()
        manager.bayesian_optimizer.update = Mock()
        
        manager.anomaly_detector = Mock()
        manager.anomaly_detector.detect = Mock(return_value={
            'anomalies_detected': True,
            'num_anomalies': 2,
            'max_anomaly_score': 2.5
        })
        
        # Process backtest completion
        result = await manager.on_backtest_complete(sample_backtest_result)
        
        assert 'timestamp' in result
        assert result['strategy_id'] == 'iron_condor'
        assert 'component_updates' in result
        assert 'version' in result
        
        # Check that components were updated
        if manager.bayesian_optimizer:
            manager.bayesian_optimizer.update.assert_called_once()
        
        if manager.anomaly_detector:
            manager.anomaly_detector.detect.assert_called_once()
        
        # Check logging
        logs = manager.get_orchestration_logs()
        assert len(logs) > 0
        assert logs[-1]['event_type'] == 'backtest_complete'
    
    @pytest.mark.asyncio
    async def test_get_parameters_with_optimizer(self, mock_repo, sample_market_state):
        """Test parameter retrieval with Bayesian optimizer"""
        manager = AdaptiveLearningManager(mock_repo, "test123")
        
        # Mock Bayesian optimizer
        mock_result = Mock()
        mock_result.parameters = {'strike_delta': 0.26, 'days_to_expiry': 44}
        mock_result.expected_return = 0.16
        mock_result.sharpe_ratio = 1.4
        mock_result.optimization_method = "bayesian_gaussian_process"
        mock_result.optimization_score = 0.85
        mock_result.optimization_id = "opt_123"
        
        manager.bayesian_optimizer = Mock()
        manager.bayesian_optimizer.suggest_parameters = Mock(return_value=mock_result)
        
        # Get parameters
        params = await manager.get_parameters('iron_condor', sample_market_state)
        
        assert isinstance(params, OptimizedStrategyParameters)
        assert params.strategy_name == 'iron_condor'
        assert params.parameters['strike_delta'] == 0.26
        assert params.optimization_method == "bayesian_gaussian_process"
        assert params.confidence_score == 0.85
        
        manager.bayesian_optimizer.suggest_parameters.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_parameters_safe_mode(self, mock_repo, sample_market_state):
        """Test parameter retrieval with safe-mode fallback"""
        manager = AdaptiveLearningManager(mock_repo, "test123")
        
        # No optimizer available
        manager.bayesian_optimizer = None
        
        # Get parameters
        params = await manager.get_parameters('wheel', sample_market_state)
        
        assert isinstance(params, OptimizedStrategyParameters)
        assert params.strategy_name == 'wheel'
        assert params.optimization_method == "safe_mode_default"
        assert params.confidence_score == 0.3
        assert 'strike_delta' in params.parameters
        assert 'days_to_expiry' in params.parameters
    
    @pytest.mark.asyncio
    async def test_get_strategy_allocation_with_rl(self, mock_repo, sample_market_state):
        """Test strategy allocation with RL agent"""
        manager = AdaptiveLearningManager(mock_repo, "test123")
        
        # Mock RL agent
        mock_allocation = StrategyAllocation(
            version=manager.version,
            portfolio_name="rl_test",
            total_capital=100000.0,
            market_state_id=sample_market_state.state_id
        )
        mock_allocation.allocation_method = "dqn_reinforcement_learning"
        mock_allocation.confidence_score = 0.75
        
        manager.rl_agent = Mock()
        manager.rl_agent.get_strategy_allocation = Mock(return_value=mock_allocation)
        
        # Get allocation
        allocation = await manager.get_strategy_allocation(sample_market_state, 100000.0)
        
        assert isinstance(allocation, StrategyAllocation)
        assert allocation.total_capital == 100000.0
        assert allocation.allocation_method == "dqn_reinforcement_learning"
        assert hasattr(allocation, 'anomaly_adjustment')
        
        manager.rl_agent.get_strategy_allocation.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_strategy_allocation_safe_mode(self, mock_repo, sample_market_state):
        """Test strategy allocation with safe-mode fallback"""
        manager = AdaptiveLearningManager(mock_repo, "test123")
        
        # No RL agent available
        manager.rl_agent = None
        
        # Get allocation
        allocation = await manager.get_strategy_allocation(sample_market_state, 75000.0)
        
        assert isinstance(allocation, StrategyAllocation)
        assert allocation.total_capital == 75000.0
        assert allocation.allocation_method == "safe_mode_orchestrator"
        assert allocation.confidence_score == 0.2
        assert len(allocation.allocations) > 0
        assert allocation.is_balanced()
    
    @pytest.mark.asyncio
    async def test_anomaly_integration(self, mock_repo, sample_market_state):
        """Test anomaly detection integration with position sizing"""
        manager = AdaptiveLearningManager(mock_repo, "test123")
        
        # Set up anomaly state
        manager.adaptive_manager.current_anomaly_state = {
            'is_anomalous': True,
            'anomaly_score': 2.5,
            'detected_at': datetime.now(),
            'severity': 'high',
            'rationale': {}
        }
        
        # Mock RL agent
        mock_allocation = StrategyAllocation(
            version=manager.version,
            portfolio_name="rl_test",
            total_capital=50000.0,  # Should be reduced due to anomaly
            market_state_id=sample_market_state.state_id
        )
        
        manager.rl_agent = Mock()
        manager.rl_agent.get_strategy_allocation = Mock(return_value=mock_allocation)
        
        # Get allocation with anomaly adjustment
        allocation = await manager.get_strategy_allocation(sample_market_state, 100000.0)
        
        # Should be reduced due to anomaly (50% reduction)
        assert allocation.total_capital == 50000.0
        assert allocation.anomaly_adjustment == 0.5
        assert allocation.original_capital == 100000.0
    
    def test_rl_reward_calculation(self, mock_repo, sample_backtest_result):
        """Test RL reward calculation from backtest results"""
        manager = AdaptiveLearningManager(mock_repo, "test123")
        
        reward = manager._calculate_rl_reward(sample_backtest_result)
        
        # Should be positive for good performance
        assert isinstance(reward, float)
        assert -10.0 <= reward <= 10.0  # Within expected range
        
        # Test with poor performance
        poor_result = sample_backtest_result.copy()
        poor_result.update({
            'sharpe_ratio': -0.5,
            'win_rate': 0.3,
            'max_drawdown': 0.25,
            'total_return': -0.1
        })
        
        poor_reward = manager._calculate_rl_reward(poor_result)
        assert poor_reward < reward  # Should be lower
    
    def test_strategy_parameter_bounds(self, mock_repo):
        """Test strategy parameter bounds retrieval"""
        manager = AdaptiveLearningManager(mock_repo, "test123")
        
        # Test known strategy
        bounds = manager._get_strategy_parameter_bounds('iron_condor')
        assert bounds is not None
        assert 'strike_delta' in bounds
        assert 'days_to_expiry' in bounds
        assert isinstance(bounds['strike_delta'], tuple)
        assert len(bounds['strike_delta']) == 2
        
        # Test unknown strategy
        unknown_bounds = manager._get_strategy_parameter_bounds('unknown_strategy')
        assert unknown_bounds is None
    
    @pytest.mark.asyncio
    async def test_market_conditions_evaluation(self, mock_repo, sample_market_state, seeded_random):
        """Test comprehensive market conditions evaluation"""
        manager = AdaptiveLearningManager(mock_repo, "test123")
        
        # Create sample market data
        market_data = pd.DataFrame({
            'close': [450, 452, 448, 455, 453],
            'volume': [1000000, 1100000, 950000, 1200000, 1050000],
            'rsi': [55, 58, 52, 62, 59],
            'vix': [18, 17.5, 19, 16.5, 17.8]
        })
        
        # Mock components
        manager.anomaly_detector = Mock()
        manager.anomaly_detector.is_trained = True
        manager.anomaly_detector.detect = Mock(return_value={
            'anomalies_detected': False,
            'num_anomalies': 0,
            'max_anomaly_score': 0.3
        })
        
        manager.rl_agent = Mock()
        manager.rl_agent.get_action_probabilities = Mock(return_value={
            'iron_condor': 0.4,
            'wheel': 0.3,
            'pmcc': 0.2,
            'bull_put_spread': 0.1
        })
        
        # Evaluate market conditions
        evaluation = await manager.evaluate_market_conditions(market_data, sample_market_state)
        
        assert 'timestamp' in evaluation
        assert 'market_state_id' in evaluation
        assert 'evaluations' in evaluation
        
        if manager.anomaly_detector:
            assert 'anomaly_detection' in evaluation['evaluations']
        
        if manager.rl_agent:
            assert 'rl_strategy_preferences' in evaluation['evaluations']
    
    def test_orchestration_logging(self, mock_repo):
        """Test orchestration event logging"""
        manager = AdaptiveLearningManager(mock_repo, "test123")
        
        # Log an event
        test_data = {'test': 'data', 'value': 123}
        manager._log_orchestration_event('test_event', test_data)
        
        # Check logs
        logs = manager.get_orchestration_logs()
        assert len(logs) == 1
        
        log = logs[0]
        assert log['event_type'] == 'test_event'
        assert log['data'] == test_data
        assert 'timestamp' in log
        assert 'version' in log
        assert 'components_status' in log
        
        # Test log clearing
        manager.clear_orchestration_logs()
        assert len(manager.get_orchestration_logs()) == 0


@pytest.mark.integration
@pytest.mark.adaptive
class TestAdaptiveLearningManagerIntegration:
    """Integration tests for AdaptiveLearningManager"""
    
    @pytest.mark.asyncio
    async def test_end_to_end_orchestration_workflow(self, seeded_random):
        """Test complete orchestration workflow"""
        
        # Create mock repo
        repo = Mock()
        repo.get_backtest_results = AsyncMock(return_value=[])
        
        # Initialize manager
        manager = AdaptiveLearningManager(repo, "integration_test_123")
        
        # Create market state
        version = AdaptiveVersion(code_version="integration_test_123")
        market_state = MarketState(
            version=version,
            underlying_price=450.0,
            implied_volatility=0.22,
            vix_level=18.5,
            regime=MarketRegime.SIDEWAYS
        )
        
        # Test parameter retrieval
        params = await manager.get_parameters('iron_condor', market_state)
        assert isinstance(params, OptimizedStrategyParameters)
        assert params.strategy_name == 'iron_condor'
        
        # Test strategy allocation
        allocation = await manager.get_strategy_allocation(market_state, 100000.0)
        assert isinstance(allocation, StrategyAllocation)
        assert allocation.total_capital == 100000.0
        assert allocation.is_balanced()
        
        # Test backtest processing
        backtest_result = {
            'strategy_id': 'iron_condor',
            'parameters': params.parameters,
            'sharpe_ratio': 1.25,
            'total_pnl': 12500.0,
            'market_state': market_state
        }
        
        processing_result = await manager.on_backtest_complete(backtest_result)
        assert 'component_updates' in processing_result
        assert processing_result['strategy_id'] == 'iron_condor'
        
        # Check orchestration status
        status = manager.get_orchestration_status()
        assert status['orchestration_logs'] > 0
        assert 'components' in status
        
        # Verify logging
        logs = manager.get_orchestration_logs()
        assert len(logs) > 0
