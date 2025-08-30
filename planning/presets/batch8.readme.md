# Batch 8: Adaptive Intelligence System Setup

This document provides comprehensive setup instructions for Batch 8 of the options trading system, focusing on the adaptive intelligence components including market state analysis, strategy optimization, reinforcement learning, and pattern recognition.

## Overview

Batch 8 introduces sophisticated adaptive intelligence capabilities that enable the trading system to:

- **Analyze market conditions** in real-time using comprehensive market state representation
- **Optimize strategy parameters** dynamically based on current market regime
- **Learn from market behavior** using reinforcement learning agents
- **Recognize patterns** in market data for predictive insights
- **Allocate capital** intelligently across multiple strategies

## Order & Independence

- **Phase 1 (Core Types)**: Can run alone for immediate value - establishes foundation types
- **Phase 2 (Pattern Recognition)**: Can follow Phase 1, provides market analysis capabilities
- **Phase 3 (RL & Optimization)**: Benefits from Phase 2 features but can run independently

## Shared Inputs

- **Backtest artifacts**: `runs/*/summary.json` (from Batch 4) and structured logs
- **Indicator profiles**: Market indicator data (from Batch 6)
- **Strategy presets**: Strategy configurations (from Batch 5)
- **Market data**: Historical price, volume, and options data

## Outputs

- **Versioned parameters**: Optimized strategy parameters under `adaptive/output/`
- **Market states**: Analyzed market conditions with regime classification
- **Allocations**: Portfolio allocation recommendations with risk metrics
- **Patterns**: Detected market patterns with confidence scores

## CI Requirements

- **Unit tests**: For each phase with deterministic fixtures
- **Integration tests**: End-to-end pipeline validation
- **Performance tests**: Pattern recognition and optimization speed
- **No live keys**: All tests use mock data and simulated environments

## Directory Structure

```
adaptive/
├── __init__.py                 # Main adaptive intelligence module
├── types.py                    # Core data structures with version tracking
├── optimizer/                  # Strategy parameter optimization
│   └── __init__.py            # Base optimizer classes
├── rl/                        # Reinforcement learning components
│   └── __init__.py            # RL agents and environments
└── pattern/                   # Pattern recognition and analysis
    └── __init__.py            # Pattern detection algorithms

planning/presets/
├── __init__.py                # Planning presets module
└── batch8.readme.md          # This setup guide
```

## Core Components

### 1. Adaptive Types (`adaptive/types.py`)

The foundation includes three main data structures with version tracking:

#### MarketState
- **Purpose**: Comprehensive market condition representation
- **Features**: Price/volatility metrics, technical indicators, options data
- **Version Tracking**: `AdaptiveVersion` for reproducibility

#### OptimizedStrategyParameters
- **Purpose**: Strategy parameter optimization results
- **Features**: Optimized parameters, performance metrics, risk analysis
- **Version Tracking**: Links to optimization runs and model versions

#### StrategyAllocation
- **Purpose**: Portfolio allocation across strategies
- **Features**: Capital weights, risk metrics, rebalancing rules
- **Version Tracking**: Allocation model evolution tracking

### 2. Optimizer Module (`adaptive/optimizer/`)

- **BaseOptimizer**: Abstract base for all optimizers
- **Bayesian/Genetic/Ensemble**: Advanced optimization algorithms (planned)
- **Objective Functions**: Strategy performance evaluation
- **Constraints**: Parameter bounds and validation

### 3. Reinforcement Learning (`adaptive/rl/`)

- **TradingEnvironment**: RL training environment base
- **BaseAgent**: Abstract RL agent class
- **RewardFunction**: Configurable reward calculation
- **Specific Agents**: DQN, PPO, A3C implementations (planned)

### 4. Pattern Recognition (`adaptive/pattern/`)

- **PatternRecognizer**: Base pattern detection class
- **RegimeDetector**: Market regime classification
- **TechnicalPatternDetector**: Technical analysis patterns
- **AnomalyDetector**: Market anomaly identification (planned)


---


## planning/presets/batch8.phase1.optimizer.json
```json
{
"title": "Batch 8 — Phase 1: Bayesian Optimizer for Strategy Params",
"depends_on": [
"Batch 4 — Backtest Runner, Metrics & Diagnostics",
"Batch 5 — GUI Wiring: Position Builder, Payoff, Trade Finder, Presets"
],
"instructions": [
"Implement adaptive/optimizer/bayesian_optimizer.py with Gaussian Process and Expected Improvement acquisition.",
"Read historical performance from runs/**/summary.json; map (params -> objective) where objective defaults to Sharpe but can be configured.",
"Expose API: suggest_parameters(strategy_id) and update(new_result).",
"Write outputs to adaptive/output/params/<strategy_id>/<timestamp>.json with fields: strategy_id, parameters, confidence, generated_by, code_version, data_snapshot, valid_until.",
"Add unit tests with deterministic fixtures; include explainability logs: acquisition scores per candidate.",
"Safe‑mode: if insufficient data, return the current strategy preset unchanged with rationale."
],
"acceptance": [
"pytest green with fixed seeds.",
"Artifacts written with code_version and data_snapshot tags.",
"Explainability logs produced; safe‑mode path covered by tests."
]
}
```

## Setup Instructions

### Prerequisites

1. **Python Environment**
   ```bash
   python >= 3.8
   pip install numpy pandas scikit-learn
   ```

2. **Optional Dependencies** (for advanced features)
   ```bash
   pip install torch tensorflow gym stable-baselines3
   pip install ta-lib plotly seaborn
   ```

### Installation Steps

1. **Verify Directory Structure**
   ```bash
   # Ensure all directories and files are present
   ls -la adaptive/
   ls -la adaptive/optimizer/
   ls -la adaptive/rl/
   ls -la adaptive/pattern/
   ```

2. **Import Core Types**
   ```python
   from adaptive.types import MarketState, OptimizedStrategyParameters, StrategyAllocation
   from adaptive.optimizer import BaseOptimizer
   from adaptive.rl import TradingEnvironment, BaseAgent
   from adaptive.pattern import RegimeDetector, TechnicalPatternDetector
   ```

## Usage Examples

### 1. Market State Analysis

```python
import pandas as pd
from adaptive.types import MarketState
from adaptive.pattern import RegimeDetector

# Create market state
market_state = MarketState(
    underlying_price=450.0,
    implied_volatility=0.25,
    vix_level=18.5
)

# Detect market regime
regime_detector = RegimeDetector()
regime = regime_detector.detect_regime(price_data['close'])
print(f"Current market regime: {regime}")
```

### 2. Strategy Parameter Optimization

```python
from adaptive.optimizer import BaseOptimizer

# Define parameter bounds
parameter_bounds = {
    'strike_delta': (0.15, 0.35),
    'days_to_expiry': (30, 60),
    'profit_target': (0.25, 0.75)
}

# Optimize parameters (implementation specific)
optimizer = YourOptimizer()
optimized_params = optimizer.optimize(
    strategy_name="iron_condor",
    market_state=market_state,
    parameter_bounds=parameter_bounds,
    objective_function=your_objective_function
)
```

### 3. Portfolio Allocation

```python
from adaptive.types import StrategyAllocation

# Create portfolio allocation
allocation = StrategyAllocation(
    total_capital=100000,
    portfolio_name="adaptive_portfolio"
)

# Add strategies with weights
allocation.add_strategy("iron_condor", 0.4, iron_condor_params)
allocation.add_strategy("wheel", 0.3, wheel_params)
allocation.add_strategy("pmcc", 0.3, pmcc_params)

# Validate allocation
violations = allocation.validate_constraints()
print(f"Allocation valid: {len(violations) == 0}")
```

## Testing Strategy

- **Unit Tests**: Each component with deterministic fixtures
- **Integration Tests**: End-to-end pipeline validation
- **Performance Tests**: Optimization speed and pattern recognition
- **Mock Data**: No live API keys required for CI/CD

## Next Steps

1. **Implement Bayesian Optimizer** (Phase 1)
2. **Add Pattern Recognition** (Phase 2)
3. **Develop RL Agents** (Phase 3)
4. **Integration Testing** across all phases