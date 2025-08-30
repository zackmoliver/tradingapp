"""
Reinforcement Learning Module for Adaptive Trading

This module provides reinforcement learning components for adaptive trading
strategy allocation and portfolio management.

Features:
- Deep Q-Network (DQN) agents for strategy allocation
- Trading environments for RL training
- Reward functions for portfolio optimization
- Experience replay and exploration strategies
"""

import numpy as np
import pandas as pd
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime
import logging

from ..types import AdaptiveVersion, MarketState, StrategyAllocation

class BaseAgent(ABC):
    """
    Abstract base class for reinforcement learning agents.

    This class defines the interface that all RL agents must implement
    for strategy allocation and portfolio management.
    """

    def __init__(self, version: Optional[AdaptiveVersion] = None):
        """
        Initialize base agent.

        Args:
            version: Version tracking information
        """
        self.version = version or AdaptiveVersion()
        self.is_trained = False
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
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
        pass

    @abstractmethod
    def select_action(self, state: np.ndarray, training: bool = True) -> int:
        """
        Select action based on current state.

        Args:
            state: Current state representation
            training: Whether in training mode

        Returns:
            Selected action index
        """
        pass

    def train_step(self,
                   state: np.ndarray,
                   action: int,
                   reward: float,
                   next_state: np.ndarray,
                   done: bool) -> Dict[str, float]:
        """
        Perform one training step (optional for some agents).

        Args:
            state: Current state
            action: Action taken
            reward: Reward received
            next_state: Next state
            done: Whether episode is done

        Returns:
            Training metrics
        """
        return {}

    def update_reward(self, reward: float) -> None:
        """Update reward tracking (optional)"""
        pass

    def end_episode(self) -> float:
        """End current episode and return total reward (optional)"""
        return 0.0


class TradingEnvironment(ABC):
    """
    Abstract base class for trading environments.

    This class defines the interface for trading environments used
    to train reinforcement learning agents.
    """

    def __init__(self,
                 version: Optional[AdaptiveVersion] = None,
                 initial_capital: float = 100000.0):
        """
        Initialize trading environment.

        Args:
            version: Version tracking information
            initial_capital: Initial capital for trading
        """
        self.version = version or AdaptiveVersion()
        self.initial_capital = initial_capital
        self.current_capital = initial_capital
        self.current_step = 0
        self.done = False
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
    def reset(self) -> np.ndarray:
        """
        Reset environment to initial state.

        Returns:
            Initial state observation
        """
        pass

    @abstractmethod
    def step(self, action: int) -> Tuple[np.ndarray, float, bool, Dict[str, Any]]:
        """
        Execute one step in the environment.

        Args:
            action: Action to execute

        Returns:
            Tuple of (next_state, reward, done, info)
        """
        pass

    @abstractmethod
    def get_state(self) -> np.ndarray:
        """
        Get current state representation.

        Returns:
            Current state as numpy array
        """
        pass

    def get_info(self) -> Dict[str, Any]:
        """Get additional environment information"""
        return {
            'current_capital': self.current_capital,
            'current_step': self.current_step,
            'total_return': (self.current_capital - self.initial_capital) / self.initial_capital
        }


class RewardFunction(ABC):
    """
    Abstract base class for reward functions.

    This class defines the interface for reward functions used
    to evaluate agent performance in trading environments.
    """

    def __init__(self, version: Optional[AdaptiveVersion] = None):
        """
        Initialize reward function.

        Args:
            version: Version tracking information
        """
        self.version = version or AdaptiveVersion()
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
    def calculate_reward(self,
                        previous_portfolio_value: float,
                        current_portfolio_value: float,
                        action: int,
                        market_state: MarketState,
                        additional_info: Optional[Dict[str, Any]] = None) -> float:
        """
        Calculate reward for a trading action.

        Args:
            previous_portfolio_value: Portfolio value before action
            current_portfolio_value: Portfolio value after action
            action: Action taken
            market_state: Current market state
            additional_info: Additional information for reward calculation

        Returns:
            Calculated reward value
        """
        pass


# Import DQNAgent with graceful fallback
try:
    from .agent import DQNAgent
    __all__ = [
        "BaseAgent",
        "TradingEnvironment",
        "RewardFunction",
        "DQNAgent"
    ]
except ImportError:
    # DQNAgent requires PyTorch
    __all__ = [
        "BaseAgent",
        "TradingEnvironment",
        "RewardFunction"
    ]
