"""
Create Mock Backtest Data for Bayesian Optimizer Testing

This script creates deterministic mock backtest data for testing the
Bayesian Optimizer with realistic parameter-performance relationships.
"""

import json
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta


def create_mock_backtest_data(output_dir: Path, strategy_id: str, num_runs: int = 15, seed: int = 42):
    """
    Create mock backtest data with realistic parameter-performance relationships.
    
    Args:
        output_dir: Directory to create mock runs
        strategy_id: Strategy identifier
        num_runs: Number of backtest runs to create
        seed: Random seed for reproducibility
    """
    np.random.seed(seed)
    
    # Define parameter ranges and optimal values for realistic relationships
    param_configs = {
        'iron_condor': {
            'strike_delta': {'range': (0.15, 0.35), 'optimal': 0.25},
            'days_to_expiry': {'range': (30, 60), 'optimal': 45},
            'profit_target': {'range': (0.25, 0.75), 'optimal': 0.5},
            'stop_loss': {'range': (1.5, 3.0), 'optimal': 2.0},
            'min_credit': {'range': (0.5, 2.0), 'optimal': 1.0}
        },
        'wheel': {
            'strike_delta': {'range': (0.20, 0.40), 'optimal': 0.30},
            'days_to_expiry': {'range': (20, 45), 'optimal': 30},
            'assignment_threshold': {'range': (0.8, 1.0), 'optimal': 0.9}
        },
        'pmcc': {
            'long_delta': {'range': (0.70, 0.90), 'optimal': 0.80},
            'short_delta': {'range': (0.20, 0.40), 'optimal': 0.30},
            'days_to_expiry': {'range': (20, 45), 'optimal': 30},
            'profit_target': {'range': (0.15, 0.35), 'optimal': 0.25}
        }
    }
    
    config = param_configs.get(strategy_id, param_configs['iron_condor'])
    
    for i in range(num_runs):
        run_dir = output_dir / f"{strategy_id}_run_{i:03d}"
        run_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate parameters with some randomness
        parameters = {}
        performance_factor = 1.0
        
        for param_name, param_config in config.items():
            min_val, max_val = param_config['range']
            optimal_val = param_config['optimal']
            
            # Generate parameter value with bias toward optimal
            if np.random.random() < 0.3:  # 30% chance of random value
                value = np.random.uniform(min_val, max_val)
            else:  # 70% chance of value near optimal
                noise = np.random.normal(0, (max_val - min_val) * 0.1)
                value = np.clip(optimal_val + noise, min_val, max_val)
            
            parameters[param_name] = round(value, 3)
            
            # Calculate performance impact (closer to optimal = better performance)
            distance_from_optimal = abs(value - optimal_val) / (max_val - min_val)
            param_performance = 1.0 - (distance_from_optimal * 0.5)  # Max 50% penalty
            performance_factor *= param_performance
        
        # Base performance metrics with realistic relationships
        base_sharpe = 1.2
        base_return = 0.15
        base_volatility = 0.12
        base_drawdown = 0.08
        base_win_rate = 0.70
        
        # Apply performance factor and add noise
        noise_factor = 1.0 + np.random.normal(0, 0.1)  # 10% noise
        
        sharpe_ratio = (base_sharpe * performance_factor * noise_factor)
        total_return = max(0.0, base_return * performance_factor * noise_factor)
        volatility = base_volatility / (performance_factor * 0.5 + 0.5)  # Lower vol for better params
        max_drawdown = base_drawdown / (performance_factor * 0.3 + 0.7)  # Lower drawdown for better params
        win_rate = min(0.95, base_win_rate * (performance_factor * 0.2 + 0.8))
        
        # Calculate derived metrics
        total_trades = int(np.random.uniform(20, 40))
        winning_trades = int(total_trades * win_rate)
        losing_trades = total_trades - winning_trades
        total_pnl = total_return * 100000  # Assume $100k capital
        
        # Create realistic summary data
        start_date = datetime(2024, 1, 1)
        end_date = start_date + timedelta(days=90)
        
        summary = {
            "strategy_id": strategy_id,
            "run_id": f"run_{i:03d}",
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d"),
            "total_trades": total_trades,
            "winning_trades": winning_trades,
            "losing_trades": losing_trades,
            "win_rate": round(win_rate, 3),
            "total_pnl": round(total_pnl, 2),
            "max_drawdown": round(max_drawdown, 4),
            "sharpe_ratio": round(sharpe_ratio, 3),
            "sortino_ratio": round(sharpe_ratio * 1.2, 3),
            "calmar_ratio": round(total_return / max_drawdown if max_drawdown > 0 else 0, 2),
            "parameters": parameters,
            "performance_metrics": {
                "total_return": round(total_return, 4),
                "annualized_return": round(total_return * 4, 4),  # Quarterly to annual
                "volatility": round(volatility, 4),
                "max_consecutive_losses": max(1, int(np.random.poisson(2))),
                "average_trade_duration": round(np.random.uniform(25, 40), 1),
                "profit_factor": round(np.random.uniform(1.5, 2.5), 2)
            },
            "risk_metrics": {
                "var_95": round(volatility * 1.645, 4),  # Approximate VaR
                "expected_shortfall": round(volatility * 2.0, 4),
                "maximum_loss": round(max_drawdown * 1.5, 4),
                "beta": round(np.random.uniform(0.7, 1.2), 3),
                "alpha": round(total_return - 0.05, 4)  # Assume 5% risk-free rate
            },
            "trade_analysis": {
                "avg_winning_trade": round(total_pnl / winning_trades if winning_trades > 0 else 0, 2),
                "avg_losing_trade": round(-total_pnl * 0.3 / losing_trades if losing_trades > 0 else 0, 2),
                "largest_winning_trade": round(total_pnl * 0.15, 2),
                "largest_losing_trade": round(-total_pnl * 0.08, 2),
                "consecutive_wins": max(1, int(np.random.poisson(4))),
                "consecutive_losses": max(1, int(np.random.poisson(2)))
            },
            "metadata": {
                "created_at": datetime.now().isoformat(),
                "data_source": "mock_generator",
                "performance_factor": round(performance_factor, 3),
                "seed": seed + i
            }
        }
        
        # Save summary.json
        with open(run_dir / "summary.json", 'w') as f:
            json.dump(summary, f, indent=2)
        
        # Create minimal trades.json for completeness
        trades = []
        for j in range(total_trades):
            trade = {
                "trade_id": f"trade_{j+1:03d}",
                "entry_date": (start_date + timedelta(days=j*2)).strftime("%Y-%m-%d"),
                "exit_date": (start_date + timedelta(days=j*2+30)).strftime("%Y-%m-%d"),
                "strategy": strategy_id,
                "pnl": round(total_pnl / total_trades * (1 if j < winning_trades else -0.5), 2),
                "parameters": parameters
            }
            trades.append(trade)
        
        with open(run_dir / "trades.json", 'w') as f:
            json.dump(trades, f, indent=2)
    
    print(f"Created {num_runs} mock backtest runs for {strategy_id} in {output_dir}")


def main():
    """Create mock data for all strategies"""
    base_dir = Path("tests/adaptive/fixtures/mock_runs")
    base_dir.mkdir(parents=True, exist_ok=True)
    
    strategies = ['iron_condor', 'wheel', 'pmcc']
    
    for strategy in strategies:
        strategy_dir = base_dir / strategy
        create_mock_backtest_data(strategy_dir, strategy, num_runs=12, seed=42)
    
    print(f"Mock backtest data created in {base_dir}")
    print("Use this data for deterministic testing of BayesianOptimizer")


if __name__ == "__main__":
    main()
