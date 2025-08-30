"""
Deep Q-Network (DQN) Agent for Strategy Allocation

This module implements a DQN agent for reinforcement learning-based
strategy allocation with epsilon-greedy exploration and experience replay.

Features:
- DQN with experience replay buffer
- Epsilon-greedy policy with decaying exploration
- Strategy allocation based on market regime features
- Safe-mode fallback to rule-based allocation
- Comprehensive logging and explainability
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Union
import logging
import json
from dataclasses import asdict
import random
from collections import deque, namedtuple
import warnings

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore', category=UserWarning)

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    # Create dummy classes for when PyTorch is not available
    torch = None
    nn = None
    optim = None
    F = None
    TORCH_AVAILABLE = False

from ..types import AdaptiveVersion, MarketState, StrategyAllocation, OptimizedStrategyParameters, MarketRegime
from . import BaseAgent, TradingEnvironment, RewardFunction

# Experience tuple for replay buffer
Experience = namedtuple('Experience', ['state', 'action', 'reward', 'next_state', 'done'])


class DQNAgent(BaseAgent):
    """
    Deep Q-Network agent for strategy allocation.
    
    This agent learns to allocate capital across different trading strategies
    based on market regime features using deep reinforcement learning.
    """
    
    def __init__(self,
                 version: Optional[AdaptiveVersion] = None,
                 state_dim: int = 20,
                 action_dim: int = 4,  # Number of strategies
                 hidden_dims: List[int] = None,
                 learning_rate: float = 0.001,
                 epsilon_start: float = 1.0,
                 epsilon_end: float = 0.01,
                 epsilon_decay: float = 0.995,
                 replay_buffer_size: int = 10000,
                 batch_size: int = 32,
                 target_update_freq: int = 100,
                 gamma: float = 0.99,
                 safe_mode_enabled: bool = True,
                 strategy_names: Optional[List[str]] = None,
                 random_seed: int = 42):
        """
        Initialize DQN Agent.
        
        Args:
            version: Version tracking information
            state_dim: Dimension of state space (market features)
            action_dim: Dimension of action space (number of strategies)
            hidden_dims: Hidden layer dimensions (default: [64, 32])
            learning_rate: Learning rate for neural network
            epsilon_start: Initial exploration rate
            epsilon_end: Final exploration rate
            epsilon_decay: Epsilon decay rate
            replay_buffer_size: Size of experience replay buffer
            batch_size: Batch size for training
            target_update_freq: Frequency of target network updates
            gamma: Discount factor for future rewards
            safe_mode_enabled: Enable fallback to rule-based allocation
            strategy_names: Names of available strategies
            random_seed: Random seed for reproducibility
        """
        super().__init__(version)
        
        if not TORCH_AVAILABLE:
            if not safe_mode_enabled:
                raise ImportError(
                    "PyTorch is required for DQNAgent. "
                    "Install with: pip install torch or enable safe_mode"
                )
        
        self.state_dim = state_dim
        self.action_dim = action_dim
        self.hidden_dims = hidden_dims or [64, 32]
        self.learning_rate = learning_rate
        self.epsilon = epsilon_start
        self.epsilon_start = epsilon_start
        self.epsilon_end = epsilon_end
        self.epsilon_decay = epsilon_decay
        self.replay_buffer_size = replay_buffer_size
        self.batch_size = batch_size
        self.target_update_freq = target_update_freq
        self.gamma = gamma
        self.safe_mode_enabled = safe_mode_enabled
        self.random_seed = random_seed
        
        # Strategy configuration
        self.strategy_names = strategy_names or ['iron_condor', 'wheel', 'pmcc', 'bull_put_spread']
        if len(self.strategy_names) != action_dim:
            self.action_dim = len(self.strategy_names)
        
        # Set random seeds for reproducibility
        if TORCH_AVAILABLE:
            torch.manual_seed(random_seed)
        np.random.seed(random_seed)
        random.seed(random_seed)
        
        # Initialize components
        self.q_network = None
        self.target_network = None
        self.optimizer = None
        self.replay_buffer = deque(maxlen=replay_buffer_size)
        
        # Training state
        self.training_step = 0
        self.episode_rewards = []
        self.losses = []
        
        # Logging setup
        self.logger = logging.getLogger(__name__)
        self.allocation_logs = []
        
        # Create output directory
        self.output_dir = Path("adaptive/output/rl_allocations")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize networks if PyTorch is available
        if TORCH_AVAILABLE:
            self._initialize_networks()
    
    def _initialize_networks(self):
        """Initialize Q-network and target network"""
        self.q_network = self._create_network()
        self.target_network = self._create_network()
        
        # Copy weights to target network
        self.target_network.load_state_dict(self.q_network.state_dict())
        self.target_network.eval()
        
        # Initialize optimizer
        self.optimizer = optim.Adam(self.q_network.parameters(), lr=self.learning_rate)
        
        self.logger.info("DQN networks initialized")
    
    def _create_network(self):
        """Create Q-network architecture"""
        
        class DQN(nn.Module):
            def __init__(self, state_dim, action_dim, hidden_dims):
                super(DQN, self).__init__()
                
                layers = []
                prev_dim = state_dim
                
                # Hidden layers
                for hidden_dim in hidden_dims:
                    layers.extend([
                        nn.Linear(prev_dim, hidden_dim),
                        nn.ReLU(),
                        nn.Dropout(0.1)
                    ])
                    prev_dim = hidden_dim
                
                # Output layer
                layers.append(nn.Linear(prev_dim, action_dim))
                
                self.network = nn.Sequential(*layers)
            
            def forward(self, x):
                return self.network(x)
        
        return DQN(self.state_dim, self.action_dim, self.hidden_dims)
    
    def select_action(self, state: np.ndarray, training: bool = True) -> int:
        """
        Select action using epsilon-greedy policy.
        
        Args:
            state: Current market state features
            training: Whether in training mode (affects exploration)
            
        Returns:
            Selected action index
        """
        if not TORCH_AVAILABLE:
            return self._safe_mode_action_selection(state)
        
        # Epsilon-greedy exploration
        if training and random.random() < self.epsilon:
            action = random.randint(0, self.action_dim - 1)
            self.logger.debug(f"Exploration: selected random action {action}")
        else:
            # Exploitation: select best action according to Q-network
            with torch.no_grad():
                state_tensor = torch.FloatTensor(state).unsqueeze(0)
                q_values = self.q_network(state_tensor)
                action = q_values.argmax().item()
                self.logger.debug(f"Exploitation: selected action {action} with Q-value {q_values[0][action]:.3f}")
        
        return action
    
    def get_strategy_allocation(self, 
                              market_state: MarketState,
                              total_capital: float = 100000.0) -> StrategyAllocation:
        """
        Get strategy allocation based on current market state.
        
        Args:
            market_state: Current market state
            total_capital: Total capital to allocate
            
        Returns:
            StrategyAllocation with recommended allocations
        """
        self.logger.info("Generating strategy allocation using DQN agent")
        
        try:
            # Convert market state to feature vector
            state_features = self._market_state_to_features(market_state)
            
            # Select action (strategy allocation)
            if TORCH_AVAILABLE and self.q_network is not None:
                action = self.select_action(state_features, training=False)
                allocation_method = "dqn_reinforcement_learning"
                confidence = self._calculate_action_confidence(state_features, action)
            else:
                action = self._safe_mode_action_selection(state_features)
                allocation_method = "safe_mode_rule_based"
                confidence = 0.5  # Moderate confidence for rule-based
            
            # Convert action to strategy allocation
            allocation = self._action_to_allocation(
                action, market_state, total_capital, allocation_method, confidence
            )
            
            # Log allocation decision
            self._log_allocation_decision(allocation, state_features, action)
            
            # Save allocation artifact
            self._save_allocation_artifact(allocation)
            
            return allocation
            
        except Exception as e:
            self.logger.error(f"Error in strategy allocation: {e}")
            
            # Fallback to safe mode
            return self._safe_mode_fallback(market_state, total_capital)
    
    def _market_state_to_features(self, market_state: MarketState) -> np.ndarray:
        """Convert market state to feature vector for DQN input"""
        
        # Get base feature vector from market state
        features_dict = market_state.to_feature_vector()
        
        # Select key features for RL state representation
        key_features = [
            'underlying_price', 'implied_volatility', 'vix_level',
            'rsi_14', 'fear_greed_index', 'put_call_ratio',
            'price_change_1d', 'price_change_5d', 'price_change_20d',
            'historical_volatility_10d', 'historical_volatility_30d'
        ]
        
        # Add regime one-hot encoding
        regime_features = [f'regime_{regime.value}' for regime in MarketRegime]
        key_features.extend(regime_features)
        
        # Add volatility environment one-hot encoding
        vol_features = [k for k in features_dict.keys() if k.startswith('vol_env_')]
        key_features.extend(vol_features)
        
        # Extract feature values
        feature_vector = []
        for feature in key_features:
            if feature in features_dict:
                feature_vector.append(features_dict[feature])
            else:
                feature_vector.append(0.0)  # Default value for missing features
        
        # Pad or truncate to match expected state dimension
        if len(feature_vector) < self.state_dim:
            feature_vector.extend([0.0] * (self.state_dim - len(feature_vector)))
        elif len(feature_vector) > self.state_dim:
            feature_vector = feature_vector[:self.state_dim]
        
        return np.array(feature_vector, dtype=np.float32)
    
    def _action_to_allocation(self, 
                            action: int, 
                            market_state: MarketState,
                            total_capital: float,
                            allocation_method: str,
                            confidence: float) -> StrategyAllocation:
        """Convert action index to strategy allocation"""
        
        # Create allocation object
        allocation = StrategyAllocation(
            version=self.version,
            portfolio_name=f"rl_allocation_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            total_capital=total_capital,
            market_state_id=market_state.state_id
        )

        # Store additional metadata (not in constructor)
        allocation.allocation_method = allocation_method
        allocation.confidence_score = confidence
        
        # Define allocation strategies based on action
        if action == 0:  # Conservative allocation
            weights = {'iron_condor': 0.6, 'bull_put_spread': 0.4}
        elif action == 1:  # Aggressive allocation
            weights = {'pmcc': 0.5, 'wheel': 0.5}
        elif action == 2:  # Balanced allocation
            weights = {'iron_condor': 0.4, 'wheel': 0.3, 'pmcc': 0.3}
        else:  # Defensive allocation
            weights = {'iron_condor': 0.8, 'bull_put_spread': 0.2}
        
        # Add strategies to allocation
        for strategy_name, weight in weights.items():
            if strategy_name in self.strategy_names:
                # Create mock optimized parameters (in practice, these would come from optimizer)
                params = OptimizedStrategyParameters(
                    version=self.version,
                    strategy_name=strategy_name,
                    market_state_id=market_state.state_id,
                    parameters=self._get_default_strategy_parameters(strategy_name),
                    expected_return=0.15,
                    sharpe_ratio=1.2,
                    optimization_method="rl_integrated"
                )
                
                allocation.add_strategy(strategy_name, weight, params)
        
        return allocation
    
    def _get_default_strategy_parameters(self, strategy_name: str) -> Dict[str, float]:
        """Get default parameters for strategy"""
        defaults = {
            'iron_condor': {
                'strike_delta': 0.25,
                'days_to_expiry': 45,
                'profit_target': 0.5
            },
            'wheel': {
                'strike_delta': 0.30,
                'days_to_expiry': 30
            },
            'pmcc': {
                'long_delta': 0.80,
                'short_delta': 0.30,
                'days_to_expiry': 30
            },
            'bull_put_spread': {
                'strike_delta': 0.20,
                'days_to_expiry': 45,
                'profit_target': 0.5
            }
        }
        
        return defaults.get(strategy_name, {'strike_delta': 0.25, 'days_to_expiry': 45})
    
    def _calculate_action_confidence(self, state_features: np.ndarray, action: int) -> float:
        """Calculate confidence in selected action"""
        if not TORCH_AVAILABLE or self.q_network is None:
            return 0.5
        
        with torch.no_grad():
            state_tensor = torch.FloatTensor(state_features).unsqueeze(0)
            q_values = self.q_network(state_tensor)
            
            # Confidence based on Q-value spread
            max_q = q_values.max().item()
            min_q = q_values.min().item()
            selected_q = q_values[0][action].item()
            
            if max_q == min_q:
                return 0.5
            
            # Normalize confidence between 0.1 and 1.0
            confidence = (selected_q - min_q) / (max_q - min_q)
            return max(0.1, min(1.0, confidence))
    
    def _safe_mode_action_selection(self, state_features: np.ndarray) -> int:
        """Rule-based action selection for safe mode"""
        
        # Simple rule-based strategy selection based on market conditions
        # In practice, this would use more sophisticated rules
        
        # Extract key features (assuming they're in known positions)
        if len(state_features) >= 3:
            vix_level = state_features[2] if len(state_features) > 2 else 20.0
            price_change = state_features[6] if len(state_features) > 6 else 0.0
        else:
            vix_level = 20.0
            price_change = 0.0
        
        # Rule-based allocation logic
        if vix_level > 30:  # High volatility
            return 3  # Defensive allocation
        elif vix_level < 15:  # Low volatility
            return 1  # Aggressive allocation
        elif price_change > 0.02:  # Strong uptrend
            return 1  # Aggressive allocation
        else:
            return 2  # Balanced allocation
    
    def _safe_mode_fallback(self, market_state: MarketState, total_capital: float) -> StrategyAllocation:
        """Safe mode fallback allocation"""
        self.logger.warning("Using safe mode fallback for strategy allocation")
        
        allocation = StrategyAllocation(
            version=self.version,
            portfolio_name=f"safe_mode_allocation_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            total_capital=total_capital,
            market_state_id=market_state.state_id
        )

        # Store additional metadata
        allocation.allocation_method = "safe_mode_fallback"
        allocation.confidence_score = 0.3
        
        # Conservative default allocation
        default_weights = {'iron_condor': 0.7, 'bull_put_spread': 0.3}
        
        for strategy_name, weight in default_weights.items():
            params = OptimizedStrategyParameters(
                version=self.version,
                strategy_name=strategy_name,
                parameters=self._get_default_strategy_parameters(strategy_name),
                optimization_method="safe_mode_default"
            )
            
            allocation.add_strategy(strategy_name, weight, params)
        
        return allocation

    def train_step(self,
                   state: np.ndarray,
                   action: int,
                   reward: float,
                   next_state: np.ndarray,
                   done: bool) -> Dict[str, float]:
        """
        Perform one training step with experience replay.

        Args:
            state: Current state
            action: Action taken
            reward: Reward received
            next_state: Next state
            done: Whether episode is done

        Returns:
            Training metrics
        """
        if not TORCH_AVAILABLE:
            return {'loss': 0.0, 'epsilon': self.epsilon}

        # Store experience in replay buffer
        experience = Experience(state, action, reward, next_state, done)
        self.replay_buffer.append(experience)

        # Train if we have enough experiences
        if len(self.replay_buffer) >= self.batch_size:
            loss = self._replay_experience()
            self.losses.append(loss)
        else:
            loss = 0.0

        # Update target network
        if self.training_step % self.target_update_freq == 0:
            self.target_network.load_state_dict(self.q_network.state_dict())
            self.logger.debug(f"Updated target network at step {self.training_step}")

        # Decay epsilon
        if self.epsilon > self.epsilon_end:
            self.epsilon *= self.epsilon_decay
            self.epsilon = max(self.epsilon_end, self.epsilon)

        self.training_step += 1

        return {
            'loss': loss,
            'epsilon': self.epsilon,
            'replay_buffer_size': len(self.replay_buffer),
            'training_step': self.training_step
        }

    def _replay_experience(self) -> float:
        """Sample and learn from experience replay buffer"""

        # Sample batch from replay buffer
        batch = random.sample(self.replay_buffer, self.batch_size)

        # Unpack batch
        states = torch.FloatTensor([e.state for e in batch])
        actions = torch.LongTensor([e.action for e in batch])
        rewards = torch.FloatTensor([e.reward for e in batch])
        next_states = torch.FloatTensor([e.next_state for e in batch])
        dones = torch.BoolTensor([e.done for e in batch])

        # Current Q values
        current_q_values = self.q_network(states).gather(1, actions.unsqueeze(1))

        # Next Q values from target network
        with torch.no_grad():
            next_q_values = self.target_network(next_states).max(1)[0]
            target_q_values = rewards + (self.gamma * next_q_values * ~dones)

        # Compute loss
        loss = F.mse_loss(current_q_values.squeeze(), target_q_values)

        # Optimize
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()

        return loss.item()

    def update_reward(self, reward: float) -> None:
        """Update episode reward tracking"""
        if not hasattr(self, 'current_episode_reward'):
            self.current_episode_reward = 0.0

        self.current_episode_reward += reward

    def end_episode(self) -> float:
        """End current episode and return total reward"""
        if hasattr(self, 'current_episode_reward'):
            episode_reward = self.current_episode_reward
            self.episode_rewards.append(episode_reward)
            self.current_episode_reward = 0.0
            return episode_reward
        return 0.0

    def _log_allocation_decision(self,
                               allocation: StrategyAllocation,
                               state_features: np.ndarray,
                               action: int) -> None:
        """Log allocation decision for explainability"""

        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'allocation_id': allocation.allocation_id,
            'market_state_id': allocation.market_state_id,
            'action_selected': action,
            'strategy_names': list(allocation.allocations.keys()),
            'allocation_weights': allocation.allocations,
            'total_capital': allocation.total_capital,
            'allocation_method': allocation.allocation_method,
            'confidence_score': allocation.confidence_score,
            'state_features': state_features.tolist(),
            'agent_state': {
                'epsilon': self.epsilon,
                'training_step': self.training_step,
                'replay_buffer_size': len(self.replay_buffer)
            },
            'version': self.version.to_dict() if self.version else None
        }

        # Add Q-values if available
        if TORCH_AVAILABLE and self.q_network is not None:
            with torch.no_grad():
                state_tensor = torch.FloatTensor(state_features).unsqueeze(0)
                q_values = self.q_network(state_tensor)
                log_entry['q_values'] = q_values.squeeze().tolist()

        self.allocation_logs.append(log_entry)

        self.logger.info(
            f"Strategy allocation: {allocation.allocation_method}, "
            f"Action: {action}, Confidence: {allocation.confidence_score:.3f}"
        )

    def _save_allocation_artifact(self, allocation: StrategyAllocation) -> None:
        """Save allocation artifact with explainability"""

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"allocation_{timestamp}.json"
        filepath = self.output_dir / filename

        # Convert allocation to dictionary
        allocation_dict = asdict(allocation)

        # Add metadata
        allocation_dict.update({
            'generated_by': 'dqn_rl_agent',
            'code_version': self.version.code_version if self.version else None,
            'data_snapshot': self.version.data_snapshot if self.version else None,
            'agent_config': {
                'state_dim': self.state_dim,
                'action_dim': self.action_dim,
                'epsilon': self.epsilon,
                'training_step': self.training_step
            },
            'explainability': self.allocation_logs[-1] if self.allocation_logs else None
        })

        # Save to file
        with open(filepath, 'w') as f:
            json.dump(allocation_dict, f, indent=2, default=str)

        self.logger.info(f"Allocation artifact saved to {filepath}")

    def get_allocation_logs(self) -> List[Dict[str, Any]]:
        """Get allocation decision logs"""
        return self.allocation_logs.copy()

    def clear_allocation_logs(self) -> None:
        """Clear allocation decision logs"""
        self.allocation_logs.clear()

    def get_training_metrics(self) -> Dict[str, Any]:
        """Get training metrics and statistics"""
        return {
            'training_step': self.training_step,
            'epsilon': self.epsilon,
            'replay_buffer_size': len(self.replay_buffer),
            'episode_rewards': self.episode_rewards.copy(),
            'recent_losses': self.losses[-100:] if self.losses else [],
            'average_episode_reward': np.mean(self.episode_rewards) if self.episode_rewards else 0.0,
            'total_episodes': len(self.episode_rewards)
        }

    def get_action_probabilities(self, state: np.ndarray) -> Dict[str, float]:
        """Get action probabilities for explainability"""
        if not TORCH_AVAILABLE or self.q_network is None:
            # Return uniform probabilities for safe mode
            prob = 1.0 / self.action_dim
            return {strategy: prob for strategy in self.strategy_names}

        with torch.no_grad():
            state_tensor = torch.FloatTensor(state).unsqueeze(0)
            q_values = self.q_network(state_tensor)

            # Convert Q-values to probabilities using softmax
            probabilities = F.softmax(q_values, dim=1).squeeze()

            # Map to strategy names
            prob_dict = {}
            for i, strategy in enumerate(self.strategy_names):
                if i < len(probabilities):
                    prob_dict[strategy] = probabilities[i].item()
                else:
                    prob_dict[strategy] = 0.0

            return prob_dict
