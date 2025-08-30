"""
Adaptive Intelligence Module for Options Trading

This module provides adaptive intelligence capabilities for the options trading system,
including market state analysis, strategy optimization, reinforcement learning,
and pattern recognition.

Components:
- types: Core data structures and type definitions
- optimizer: Strategy parameter optimization
- rl: Reinforcement learning agents and environments
- pattern: Market pattern recognition and analysis
"""

from .types import (
    MarketState,
    OptimizedStrategyParameters,
    StrategyAllocation,
    AdaptiveVersion
)

__version__ = "1.0.0"
__all__ = [
    "MarketState",
    "OptimizedStrategyParameters", 
    "StrategyAllocation",
    "AdaptiveVersion"
]
