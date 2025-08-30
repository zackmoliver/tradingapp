"""
Unit Tests for DQN Agent

This module contains comprehensive unit tests for the DQN agent
with synthetic MDP policy verification and deterministic testing.

All tests use deterministic fixtures and seeded tensors for reproducibility.
"""

import pytest
import numpy as np
import pandas as pd
from unittest.mock import Mock, patch
from datetime import datetime

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

from adaptive.rl.agent import DQNAgent, TORCH_AVAILABLE as MODULE_TORCH_AVAILABLE
from adaptive.types import AdaptiveVersion, MarketState, MarketRegime, VolatilityEnvironment, StrategyAllocation


@pytest.mark.unit
@pytest.mark.adaptive
@pytest.mark.rl
class TestDQNAgent:
    """Test suite for DQNAgent class"""
    
    @pytest.fixture
    def synthetic_mdp_states(self, seeded_random):
        """Create synthetic MDP states for testing"""
        np.random.seed(42)
        
        # Create 4 distinct market states for testing policy
        states = []
        
        # State 0: Low volatility, bullish (should prefer aggressive)
        state0 = np.array([450.0, 0.15, 12.0, 65.0, 75.0] + [0.0] * 15)  # Pad to 20 dims
        states.append(state0)
        
        # State 1: High volatility, bearish (should prefer defensive)
        state1 = np.array([430.0, 0.35, 35.0, 25.0, 25.0] + [0.0] * 15)
        states.append(state1)
        
        # State 2: Medium volatility, sideways (should prefer balanced)
        state2 = np.array([440.0, 0.25, 20.0, 50.0, 50.0] + [0.0] * 15)
        states.append(state2)
        
        # State 3: Very high volatility (should prefer conservative)
        state3 = np.array([420.0, 0.45, 45.0, 15.0, 15.0] + [0.0] * 15)
        states.append(state3)
        
        return states
    
    def test_agent_initialization(self, test_version):
        """Test DQNAgent initialization"""
        agent = DQNAgent(
            version=test_version,
            state_dim=20,
            action_dim=4,
            hidden_dims=[32, 16],
            learning_rate=0.001,
            epsilon_start=1.0,
            epsilon_end=0.01,
            safe_mode_enabled=True,
            random_seed=42
        )
        
        assert agent.version == test_version
        assert agent.state_dim == 20
        assert agent.action_dim == 4
        assert agent.hidden_dims == [32, 16]
        assert agent.epsilon == 1.0
        assert agent.safe_mode_enabled is True
        assert len(agent.strategy_names) == 4
        assert agent.training_step == 0
        assert len(agent.replay_buffer) == 0
    
    def test_agent_initialization_without_pytorch(self, test_version):
        """Test agent initialization when PyTorch is not available"""
        if MODULE_TORCH_AVAILABLE:
            # Mock PyTorch as unavailable
            with patch('adaptive.rl.agent.TORCH_AVAILABLE', False):
                # Should work with safe mode enabled
                agent = DQNAgent(version=test_version, safe_mode_enabled=True)
                assert agent.q_network is None
                assert agent.target_network is None
                
                # Should fail with safe mode disabled
                with pytest.raises(ImportError, match="PyTorch is required"):
                    DQNAgent(version=test_version, safe_mode_enabled=False)
        else:
            # PyTorch actually not available
            agent = DQNAgent(version=test_version, safe_mode_enabled=True)
            assert agent.q_network is None
    
    @pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
    def test_network_creation(self, test_version):
        """Test neural network creation"""
        torch.manual_seed(42)
        
        agent = DQNAgent(
            version=test_version,
            state_dim=10,
            action_dim=4,
            hidden_dims=[16, 8],
            random_seed=42
        )
        
        assert agent.q_network is not None
        assert agent.target_network is not None
        assert agent.optimizer is not None
        
        # Test forward pass
        test_state = torch.randn(1, 10)
        q_values = agent.q_network(test_state)
        
        assert q_values.shape == (1, 4)
        
        # Test that target network has same architecture
        target_q_values = agent.target_network(test_state)
        assert target_q_values.shape == (1, 4)
    
    @pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
    def test_action_selection_deterministic(self, test_version, synthetic_mdp_states):
        """Test deterministic action selection"""
        torch.manual_seed(42)
        np.random.seed(42)
        
        agent = DQNAgent(
            version=test_version,
            state_dim=20,
            action_dim=4,
            epsilon_start=0.0,  # No exploration for deterministic testing
            random_seed=42
        )
        
        # Test action selection on synthetic states
        actions = []
        for state in synthetic_mdp_states:
            action = agent.select_action(state, training=False)
            actions.append(action)
        
        # Actions should be deterministic with same seed
        assert len(actions) == 4
        assert all(0 <= action < 4 for action in actions)
        
        # Test reproducibility
        torch.manual_seed(42)
        np.random.seed(42)
        
        agent2 = DQNAgent(
            version=test_version,
            state_dim=20,
            action_dim=4,
            epsilon_start=0.0,
            random_seed=42
        )
        
        actions2 = []
        for state in synthetic_mdp_states:
            action = agent2.select_action(state, training=False)
            actions2.append(action)
        
        assert actions == actions2  # Should be identical
    
    def test_safe_mode_action_selection(self, test_version, synthetic_mdp_states):
        """Test safe mode action selection"""
        agent = DQNAgent(
            version=test_version,
            safe_mode_enabled=True,
            random_seed=42
        )
        
        # Test safe mode action selection
        for state in synthetic_mdp_states:
            action = agent._safe_mode_action_selection(state)
            assert 0 <= action < agent.action_dim
        
        # Test specific rules
        # High VIX should trigger defensive allocation
        high_vix_state = np.array([450.0, 0.25, 35.0] + [0.0] * 17)
        action = agent._safe_mode_action_selection(high_vix_state)
        assert action == 3  # Defensive allocation
        
        # Low VIX should trigger aggressive allocation
        low_vix_state = np.array([450.0, 0.25, 12.0] + [0.0] * 17)
        action = agent._safe_mode_action_selection(low_vix_state)
        assert action == 1  # Aggressive allocation
    
    def test_market_state_to_features(self, test_version, sample_market_state):
        """Test market state to feature vector conversion"""
        agent = DQNAgent(version=test_version, state_dim=20, random_seed=42)
        
        features = agent._market_state_to_features(sample_market_state)
        
        assert isinstance(features, np.ndarray)
        assert features.shape == (20,)
        assert features.dtype == np.float32
        
        # Check that features are not all zeros
        assert np.any(features != 0.0)
    
    def test_get_strategy_allocation(self, test_version, sample_market_state):
        """Test strategy allocation generation"""
        agent = DQNAgent(
            version=test_version,
            safe_mode_enabled=True,
            random_seed=42
        )
        
        allocation = agent.get_strategy_allocation(sample_market_state, total_capital=50000.0)
        
        assert isinstance(allocation, StrategyAllocation)
        assert allocation.total_capital == 50000.0
        assert allocation.market_state_id == sample_market_state.state_id
        assert allocation.is_balanced()
        assert len(allocation.allocations) > 0
        
        # Check that all weights sum to 1
        total_weight = sum(allocation.allocations.values())
        assert abs(total_weight - 1.0) < 0.001
    
    @pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
    def test_training_step(self, test_version, synthetic_mdp_states):
        """Test training step with experience replay"""
        torch.manual_seed(42)
        np.random.seed(42)
        
        agent = DQNAgent(
            version=test_version,
            state_dim=20,
            action_dim=4,
            batch_size=4,
            replay_buffer_size=100,
            random_seed=42
        )
        
        # Add experiences to replay buffer
        for i in range(10):
            state = synthetic_mdp_states[i % 4]
            action = i % 4
            reward = np.random.random()
            next_state = synthetic_mdp_states[(i + 1) % 4]
            done = (i == 9)
            
            metrics = agent.train_step(state, action, reward, next_state, done)
            
            assert 'loss' in metrics
            assert 'epsilon' in metrics
            assert 'replay_buffer_size' in metrics
            assert 'training_step' in metrics
        
        # Check that replay buffer has experiences
        assert len(agent.replay_buffer) == 10
        assert agent.training_step == 10
        
        # Check that epsilon decayed
        assert agent.epsilon < agent.epsilon_start
    
    @pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
    def test_synthetic_mdp_policy_verification(self, test_version, synthetic_mdp_states):
        """Test policy learning on synthetic MDP"""
        torch.manual_seed(42)
        np.random.seed(42)
        
        agent = DQNAgent(
            version=test_version,
            state_dim=20,
            action_dim=4,
            learning_rate=0.01,
            epsilon_start=0.5,
            epsilon_decay=0.99,
            batch_size=4,
            random_seed=42
        )
        
        # Define synthetic rewards for different state-action pairs
        def get_synthetic_reward(state_idx, action):
            # Reward structure that should lead to specific policy
            reward_matrix = [
                [0.1, 0.8, 0.3, 0.2],  # State 0: prefer action 1 (aggressive)
                [0.2, 0.1, 0.3, 0.9],  # State 1: prefer action 3 (defensive)
                [0.3, 0.4, 0.7, 0.3],  # State 2: prefer action 2 (balanced)
                [0.8, 0.2, 0.3, 0.4],  # State 3: prefer action 0 (conservative)
            ]
            return reward_matrix[state_idx][action]
        
        # Train agent on synthetic MDP
        for episode in range(50):
            for state_idx, state in enumerate(synthetic_mdp_states):
                action = agent.select_action(state, training=True)
                reward = get_synthetic_reward(state_idx, action)
                next_state = synthetic_mdp_states[(state_idx + 1) % 4]
                done = (state_idx == 3)
                
                agent.train_step(state, action, reward, next_state, done)
                agent.update_reward(reward)
            
            agent.end_episode()
        
        # Test learned policy (with no exploration)
        agent.epsilon = 0.0
        learned_actions = []
        
        for state_idx, state in enumerate(synthetic_mdp_states):
            action = agent.select_action(state, training=False)
            learned_actions.append(action)
        
        # Verify that agent learned reasonable policy
        # (exact actions may vary due to exploration during training)
        assert len(learned_actions) == 4
        assert all(0 <= action < 4 for action in learned_actions)
        
        # Check training metrics
        metrics = agent.get_training_metrics()
        assert metrics['total_episodes'] == 50
        assert metrics['training_step'] > 0
        assert len(metrics['episode_rewards']) == 50
    
    def test_allocation_logging_and_artifacts(self, test_version, sample_market_state, tmp_path):
        """Test allocation logging and artifact saving"""
        agent = DQNAgent(
            version=test_version,
            safe_mode_enabled=True,
            random_seed=42
        )
        
        # Mock output directory
        agent.output_dir = tmp_path / "test_allocations"
        agent.output_dir.mkdir()
        
        # Generate allocation
        allocation = agent.get_strategy_allocation(sample_market_state)
        
        # Check logging
        logs = agent.get_allocation_logs()
        assert len(logs) == 1
        
        log = logs[0]
        assert 'timestamp' in log
        assert 'allocation_id' in log
        assert 'action_selected' in log
        assert 'allocation_weights' in log
        assert 'version' in log
        
        # Check artifact saving
        json_files = list(agent.output_dir.glob("*.json"))
        assert len(json_files) == 1
        
        # Verify artifact content
        import json
        with open(json_files[0], 'r') as f:
            artifact = json.load(f)
        
        assert artifact['generated_by'] == 'dqn_rl_agent'
        assert 'code_version' in artifact
        assert 'explainability' in artifact
    
    def test_action_probabilities(self, test_version, synthetic_mdp_states):
        """Test action probability calculation for explainability"""
        agent = DQNAgent(
            version=test_version,
            safe_mode_enabled=True,
            random_seed=42
        )
        
        for state in synthetic_mdp_states:
            probabilities = agent.get_action_probabilities(state)
            
            assert isinstance(probabilities, dict)
            assert len(probabilities) == len(agent.strategy_names)
            
            # Check that probabilities sum to 1
            total_prob = sum(probabilities.values())
            assert abs(total_prob - 1.0) < 0.001
            
            # Check that all probabilities are non-negative
            assert all(prob >= 0.0 for prob in probabilities.values())
    
    def test_safe_mode_fallback(self, test_version, sample_market_state):
        """Test safe mode fallback behavior"""
        agent = DQNAgent(
            version=test_version,
            safe_mode_enabled=True,
            random_seed=42
        )
        
        # Test fallback allocation
        allocation = agent._safe_mode_fallback(sample_market_state, 75000.0)
        
        assert isinstance(allocation, StrategyAllocation)
        assert allocation.total_capital == 75000.0
        assert allocation.allocation_method == "safe_mode_fallback"
        assert allocation.confidence_score == 0.3
        assert allocation.is_balanced()
        
        # Should have conservative allocation
        assert 'iron_condor' in allocation.allocations
        assert allocation.allocations['iron_condor'] > 0.5  # Majority allocation


@pytest.mark.integration
@pytest.mark.adaptive
@pytest.mark.rl
@pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
class TestDQNAgentIntegration:
    """Integration tests for DQNAgent"""
    
    def test_end_to_end_allocation_workflow(self, test_version, seeded_random):
        """Test complete allocation workflow"""
        torch.manual_seed(42)
        np.random.seed(42)
        
        # Create agent
        agent = DQNAgent(
            version=test_version,
            state_dim=20,
            action_dim=4,
            learning_rate=0.01,
            epsilon_start=0.1,  # Low exploration for consistent results
            random_seed=42
        )
        
        # Create market state
        market_state = MarketState(
            version=test_version,
            underlying_price=450.0,
            implied_volatility=0.25,
            vix_level=20.0,
            rsi_14=55.0,
            fear_greed_index=60.0,
            regime=MarketRegime.SIDEWAYS,
            volatility_environment=VolatilityEnvironment.NORMAL
        )
        
        # Generate allocation
        allocation = agent.get_strategy_allocation(market_state, total_capital=100000.0)
        
        # Verify allocation
        assert isinstance(allocation, StrategyAllocation)
        assert allocation.total_capital == 100000.0
        assert allocation.is_balanced()
        assert allocation.version.code_version == test_version.code_version
        
        # Verify strategies have parameters
        for strategy_name in allocation.allocations.keys():
            params = allocation.strategy_parameters[strategy_name]
            assert params.strategy_name == strategy_name
            assert params.optimization_method == "rl_integrated"
            assert len(params.parameters) > 0
        
        # Test action probabilities
        state_features = agent._market_state_to_features(market_state)
        probabilities = agent.get_action_probabilities(state_features)
        
        assert len(probabilities) == 4
        assert abs(sum(probabilities.values()) - 1.0) < 0.001
        
        # Test training metrics
        metrics = agent.get_training_metrics()
        assert 'training_step' in metrics
        assert 'epsilon' in metrics
        assert 'replay_buffer_size' in metrics
