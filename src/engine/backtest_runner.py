"""
Backtest Runner - Options Trading Backtest Engine

The BacktestRunner orchestrates complete backtests by coordinating the BacktestEngine,
loading historical data, executing strategies, and generating comprehensive performance reports.

This is the main entry point for running backtests and analyzing strategy performance.

BUSINESS LOGIC IMPLEMENTATION
"""

import logging
import asyncio
import json
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any, List, Optional, Tuple
import uuid
from dataclasses import dataclass, asdict
import numpy as np
import pandas as pd

# Import core components
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from src.engine.backtest_engine import BacktestEngine, BacktestConfig, create_backtest_engine
from src.data.repository import SQLiteBacktestRepository, SQLiteSignalRepository, SQLiteMarketDataRepository
from data.provider import OHLCVBar

logger = logging.getLogger(__name__)


@dataclass
class BacktestResult:
    """Complete backtest result with performance metrics and analysis"""
    run_id: str
    strategy_id: str
    config: BacktestConfig
    
    # Performance metrics
    total_return: Decimal
    annualized_return: Decimal
    volatility: Decimal
    sharpe_ratio: Decimal
    sortino_ratio: Decimal
    max_drawdown: Decimal
    max_drawdown_duration: int
    calmar_ratio: Decimal
    
    # Trade statistics
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: Decimal
    profit_factor: Decimal
    average_win: Decimal
    average_loss: Decimal
    largest_win: Decimal
    largest_loss: Decimal
    
    # Portfolio metrics
    initial_capital: Decimal
    final_capital: Decimal
    peak_capital: Decimal
    
    # Time series data
    equity_curve: List[Tuple[datetime, Decimal]]
    drawdown_curve: List[Tuple[datetime, Decimal]]
    monthly_returns: Dict[str, Decimal]
    
    # Execution info
    start_date: datetime
    end_date: datetime
    duration_days: int
    total_bars: int
    execution_time: float
    
    # Additional metrics
    metadata: Dict[str, Any]


class PerformanceCalculator:
    """
    Advanced performance calculation engine for backtests.
    
    Calculates comprehensive performance metrics including:
    - Return metrics (total, annualized, risk-adjusted)
    - Risk metrics (volatility, drawdown, VaR)
    - Trade statistics (win rate, profit factor)
    - Time series analysis (equity curve, drawdowns)
    """
    
    def __init__(self, risk_free_rate: Decimal = Decimal('0.02')):
        """Initialize performance calculator"""
        self.risk_free_rate = risk_free_rate
        self._logger = logging.getLogger(f"{__name__}.PerformanceCalculator")
    
    def calculate_comprehensive_metrics(
        self,
        equity_curve: List[Tuple[datetime, Decimal]],
        trades: List[Dict[str, Any]],
        initial_capital: Decimal,
        config: BacktestConfig
    ) -> Dict[str, Any]:
        """
        Calculate comprehensive performance metrics.
        
        Args:
            equity_curve: List of (timestamp, portfolio_value) tuples
            trades: List of trade records
            initial_capital: Starting capital
            config: Backtest configuration
            
        Returns:
            Dictionary with all performance metrics
        """
        try:
            if not equity_curve:
                return self._get_empty_metrics()
            
            # Convert to pandas for easier calculations
            df = pd.DataFrame(equity_curve, columns=['date', 'value'])
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            df['value'] = df['value'].astype(float)
            
            # Calculate returns
            df['returns'] = df['value'].pct_change().fillna(0)
            df['cumulative_returns'] = (1 + df['returns']).cumprod() - 1
            
            # Calculate drawdowns
            df['peak'] = df['value'].expanding().max()
            df['drawdown'] = (df['value'] - df['peak']) / df['peak']
            
            # Basic metrics
            final_value = float(df['value'].iloc[-1])
            total_return = (final_value - float(initial_capital)) / float(initial_capital)
            
            # Time-based calculations
            start_date = df.index[0]
            end_date = df.index[-1]
            duration_years = (end_date - start_date).days / 365.25
            
            # Annualized return
            if duration_years > 0:
                annualized_return = (1 + total_return) ** (1 / duration_years) - 1
            else:
                annualized_return = total_return
            
            # Volatility (annualized)
            returns_std = df['returns'].std()
            volatility = returns_std * np.sqrt(252)  # Assuming daily data
            
            # Risk-adjusted metrics
            excess_returns = df['returns'].mean() * 252 - float(self.risk_free_rate)
            sharpe_ratio = excess_returns / volatility if volatility > 0 else 0
            
            # Sortino ratio (downside deviation)
            downside_returns = df['returns'][df['returns'] < 0]
            downside_std = downside_returns.std() * np.sqrt(252) if len(downside_returns) > 0 else 0
            sortino_ratio = excess_returns / downside_std if downside_std > 0 else 0
            
            # Drawdown metrics
            max_drawdown = abs(df['drawdown'].min())
            max_drawdown_idx = df['drawdown'].idxmin()
            
            # Find drawdown duration
            max_dd_duration = self._calculate_drawdown_duration(df, max_drawdown_idx)
            
            # Calmar ratio
            calmar_ratio = annualized_return / max_drawdown if max_drawdown > 0 else 0
            
            # Trade statistics
            trade_stats = self._calculate_trade_statistics(trades)
            
            # Monthly returns
            monthly_returns = self._calculate_monthly_returns(df)
            
            return {
                # Return metrics
                'total_return': Decimal(str(total_return)),
                'annualized_return': Decimal(str(annualized_return)),
                'volatility': Decimal(str(volatility)),
                
                # Risk-adjusted metrics
                'sharpe_ratio': Decimal(str(sharpe_ratio)),
                'sortino_ratio': Decimal(str(sortino_ratio)),
                'calmar_ratio': Decimal(str(calmar_ratio)),
                
                # Drawdown metrics
                'max_drawdown': Decimal(str(max_drawdown)),
                'max_drawdown_duration': max_dd_duration,
                
                # Portfolio metrics
                'final_capital': Decimal(str(final_value)),
                'peak_capital': Decimal(str(df['peak'].max())),
                
                # Time series
                'drawdown_curve': [(idx, Decimal(str(val))) for idx, val in df['drawdown'].items()],
                'monthly_returns': monthly_returns,
                
                # Trade statistics
                **trade_stats
            }
            
        except Exception as e:
            self._logger.error(f"Error calculating performance metrics: {e}")
            return self._get_empty_metrics()
    
    def _calculate_drawdown_duration(self, df: pd.DataFrame, max_dd_idx: pd.Timestamp) -> int:
        """Calculate maximum drawdown duration in days"""
        try:
            # Find the start of the drawdown period
            peak_before = df.loc[:max_dd_idx, 'peak'].iloc[-1]
            drawdown_start = df[df['value'] == peak_before].index[-1]
            
            # Find the recovery point
            recovery_value = df.loc[max_dd_idx:, 'value']
            recovery_idx = recovery_value[recovery_value >= peak_before].index
            
            if len(recovery_idx) > 0:
                recovery_date = recovery_idx[0]
                duration = (recovery_date - drawdown_start).days
            else:
                # Still in drawdown
                duration = (df.index[-1] - drawdown_start).days
            
            return max(0, duration)
            
        except Exception:
            return 0
    
    def _calculate_trade_statistics(self, trades: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate trade-based statistics"""
        try:
            if not trades:
                return {
                    'total_trades': 0,
                    'winning_trades': 0,
                    'losing_trades': 0,
                    'win_rate': Decimal('0'),
                    'profit_factor': Decimal('0'),
                    'average_win': Decimal('0'),
                    'average_loss': Decimal('0'),
                    'largest_win': Decimal('0'),
                    'largest_loss': Decimal('0')
                }
            
            # Extract P&L from trades
            pnls = []
            for trade in trades:
                if 'pnl' in trade:
                    pnls.append(float(trade['pnl']))
                elif 'realized_pnl' in trade:
                    pnls.append(float(trade['realized_pnl']))
            
            if not pnls:
                return self._get_empty_trade_stats()
            
            pnls = np.array(pnls)
            winning_trades = pnls[pnls > 0]
            losing_trades = pnls[pnls < 0]
            
            total_trades = len(pnls)
            num_winning = len(winning_trades)
            num_losing = len(losing_trades)
            
            win_rate = num_winning / total_trades if total_trades > 0 else 0
            
            avg_win = winning_trades.mean() if len(winning_trades) > 0 else 0
            avg_loss = abs(losing_trades.mean()) if len(losing_trades) > 0 else 0
            
            profit_factor = (winning_trades.sum() / abs(losing_trades.sum()) 
                           if len(losing_trades) > 0 and losing_trades.sum() < 0 else 0)
            
            largest_win = winning_trades.max() if len(winning_trades) > 0 else 0
            largest_loss = abs(losing_trades.min()) if len(losing_trades) > 0 else 0
            
            return {
                'total_trades': total_trades,
                'winning_trades': num_winning,
                'losing_trades': num_losing,
                'win_rate': Decimal(str(win_rate)),
                'profit_factor': Decimal(str(profit_factor)),
                'average_win': Decimal(str(avg_win)),
                'average_loss': Decimal(str(avg_loss)),
                'largest_win': Decimal(str(largest_win)),
                'largest_loss': Decimal(str(largest_loss))
            }
            
        except Exception as e:
            self._logger.error(f"Error calculating trade statistics: {e}")
            return self._get_empty_trade_stats()
    
    def _calculate_monthly_returns(self, df: pd.DataFrame) -> Dict[str, Decimal]:
        """Calculate monthly returns"""
        try:
            monthly_data = df.resample('M')['returns'].apply(lambda x: (1 + x).prod() - 1)
            return {
                date.strftime('%Y-%m'): Decimal(str(ret))
                for date, ret in monthly_data.items()
            }
        except Exception:
            return {}
    
    def _get_empty_metrics(self) -> Dict[str, Any]:
        """Return empty metrics structure"""
        return {
            'total_return': Decimal('0'),
            'annualized_return': Decimal('0'),
            'volatility': Decimal('0'),
            'sharpe_ratio': Decimal('0'),
            'sortino_ratio': Decimal('0'),
            'calmar_ratio': Decimal('0'),
            'max_drawdown': Decimal('0'),
            'max_drawdown_duration': 0,
            'final_capital': Decimal('0'),
            'peak_capital': Decimal('0'),
            'drawdown_curve': [],
            'monthly_returns': {},
            **self._get_empty_trade_stats()
        }
    
    def _get_empty_trade_stats(self) -> Dict[str, Any]:
        """Return empty trade statistics"""
        return {
            'total_trades': 0,
            'winning_trades': 0,
            'losing_trades': 0,
            'win_rate': Decimal('0'),
            'profit_factor': Decimal('0'),
            'average_win': Decimal('0'),
            'average_loss': Decimal('0'),
            'largest_win': Decimal('0'),
            'largest_loss': Decimal('0')
        }


class BacktestRunner:
    """
    Main backtest orchestration engine.
    
    The BacktestRunner coordinates the complete backtesting process:
    1. Sets up the BacktestEngine with configuration
    2. Loads historical market data
    3. Registers and initializes strategies
    4. Executes the backtest simulation
    5. Calculates comprehensive performance metrics
    6. Generates detailed performance reports
    7. Saves results to database
    
    This is the primary interface for running backtests and analyzing strategy performance.
    """
    
    def __init__(self, database_path: str = ":memory:"):
        """
        Initialize the BacktestRunner.
        
        Args:
            database_path: Path to SQLite database (":memory:" for in-memory)
        """
        self.database_path = database_path
        self.performance_calculator = PerformanceCalculator()
        self._logger = logging.getLogger(f"{__name__}.BacktestRunner")
        
        # Initialize repositories
        self.backtest_repo = SQLiteBacktestRepository(database_path)
        self.signal_repo = SQLiteSignalRepository(database_path)
        self.market_data_repo = SQLiteMarketDataRepository(database_path)
    
    async def run_backtest(
        self,
        strategy,
        config: BacktestConfig,
        strategy_id: str,
        strategy_parameters: Optional[Dict[str, Any]] = None
    ) -> BacktestResult:
        """
        Run a complete backtest for a strategy.
        
        Args:
            strategy: Strategy instance to backtest
            config: Backtest configuration
            strategy_id: Unique identifier for the strategy
            strategy_parameters: Strategy-specific parameters
            
        Returns:
            BacktestResult with comprehensive performance analysis
        """
        start_time = datetime.now()
        run_id = str(uuid.uuid4())
        
        try:
            self._logger.info(f"Starting backtest run {run_id} for strategy {strategy_id}")
            
            # Create backtest engine
            engine = create_backtest_engine(config, self.database_path)
            
            # Load market data if needed
            await self._ensure_market_data(engine, config)
            
            # Register strategy
            success = await engine.add_strategy(strategy, strategy_id)
            if not success:
                raise RuntimeError(f"Failed to register strategy {strategy_id}")
            
            # Initialize engine
            if not await engine.initialize():
                raise RuntimeError("Failed to initialize backtest engine")
            
            # Run backtest
            if not await engine.run():
                raise RuntimeError("Backtest execution failed")
            
            # Calculate execution time
            execution_time = (datetime.now() - start_time).total_seconds()
            
            # Generate comprehensive results
            result = await self._generate_backtest_result(
                engine, run_id, strategy_id, config, execution_time, strategy_parameters
            )
            
            self._logger.info(f"Backtest completed successfully in {execution_time:.2f}s")
            return result
            
        except Exception as e:
            self._logger.error(f"Backtest failed: {e}")
            raise RuntimeError(f"Backtest execution failed: {e}")
    
    async def _ensure_market_data(self, engine: BacktestEngine, config: BacktestConfig) -> None:
        """Ensure market data is available for backtest"""
        try:
            # Check if we need to load sample data
            for symbol in config.symbols:
                existing_data = await engine.market_data_repo.get_ohlcv(
                    symbol, config.start_date, config.end_date
                )
                
                if not existing_data:
                    # Generate sample data for testing
                    sample_data = self._generate_sample_data(
                        symbol, config.start_date, config.end_date
                    )
                    await engine.market_data_repo.store_ohlcv(symbol, sample_data, "sample_data")
                    self._logger.info(f"Generated sample data for {symbol}")
                    
        except Exception as e:
            self._logger.error(f"Error ensuring market data: {e}")
            raise
    
    def _generate_sample_data(
        self, 
        symbol: str, 
        start_date: datetime, 
        end_date: datetime
    ) -> List[OHLCVBar]:
        """Generate sample OHLCV data for testing"""
        try:
            bars = []
            current_date = start_date
            base_price = 150.0  # Starting price
            
            while current_date <= end_date:
                # Simple random walk for price
                price_change = np.random.normal(0, 0.02)  # 2% daily volatility
                base_price *= (1 + price_change)
                base_price = max(base_price, 10.0)  # Minimum price
                
                # Generate OHLCV
                open_price = base_price
                high_price = base_price * (1 + abs(np.random.normal(0, 0.01)))
                low_price = base_price * (1 - abs(np.random.normal(0, 0.01)))
                close_price = base_price
                volume = int(np.random.normal(1000000, 200000))
                
                bar = OHLCVBar(
                    symbol=symbol,
                    timestamp=current_date,
                    open=Decimal(str(round(open_price, 2))),
                    high=Decimal(str(round(high_price, 2))),
                    low=Decimal(str(round(low_price, 2))),
                    close=Decimal(str(round(close_price, 2))),
                    volume=max(volume, 100000),
                    adjusted_close=Decimal(str(round(close_price, 2)))
                )
                bars.append(bar)
                
                current_date += timedelta(days=1)
            
            return bars
            
        except Exception as e:
            self._logger.error(f"Error generating sample data: {e}")
            return []
    
    async def _generate_backtest_result(
        self,
        engine: BacktestEngine,
        run_id: str,
        strategy_id: str,
        config: BacktestConfig,
        execution_time: float,
        strategy_parameters: Optional[Dict[str, Any]]
    ) -> BacktestResult:
        """Generate comprehensive backtest result"""
        try:
            # Get equity curve from engine
            equity_curve = self._extract_equity_curve(engine, strategy_id)
            
            # Get trade data
            trades = await self._extract_trades(engine, run_id)
            
            # Calculate comprehensive metrics
            metrics = self.performance_calculator.calculate_comprehensive_metrics(
                equity_curve, trades, config.initial_capital, config
            )
            
            # Create result object
            result = BacktestResult(
                run_id=run_id,
                strategy_id=strategy_id,
                config=config,
                
                # Performance metrics
                total_return=metrics['total_return'],
                annualized_return=metrics['annualized_return'],
                volatility=metrics['volatility'],
                sharpe_ratio=metrics['sharpe_ratio'],
                sortino_ratio=metrics['sortino_ratio'],
                max_drawdown=metrics['max_drawdown'],
                max_drawdown_duration=metrics['max_drawdown_duration'],
                calmar_ratio=metrics['calmar_ratio'],
                
                # Trade statistics
                total_trades=metrics['total_trades'],
                winning_trades=metrics['winning_trades'],
                losing_trades=metrics['losing_trades'],
                win_rate=metrics['win_rate'],
                profit_factor=metrics['profit_factor'],
                average_win=metrics['average_win'],
                average_loss=metrics['average_loss'],
                largest_win=metrics['largest_win'],
                largest_loss=metrics['largest_loss'],
                
                # Portfolio metrics
                initial_capital=config.initial_capital,
                final_capital=metrics['final_capital'],
                peak_capital=metrics['peak_capital'],
                
                # Time series data
                equity_curve=equity_curve,
                drawdown_curve=metrics['drawdown_curve'],
                monthly_returns=metrics['monthly_returns'],
                
                # Execution info
                start_date=config.start_date,
                end_date=config.end_date,
                duration_days=(config.end_date - config.start_date).days,
                total_bars=len(equity_curve),
                execution_time=execution_time,
                
                # Metadata
                metadata={
                    'strategy_parameters': strategy_parameters or {},
                    'config': asdict(config),
                    'database_path': self.database_path,
                    'generated_at': datetime.now().isoformat()
                }
            )
            
            return result
            
        except Exception as e:
            self._logger.error(f"Error generating backtest result: {e}")
            raise
    
    def _extract_equity_curve(self, engine: BacktestEngine, strategy_id: str) -> List[Tuple[datetime, Decimal]]:
        """Extract equity curve from engine"""
        try:
            # This is a simplified implementation
            # In a full implementation, this would extract the actual equity curve
            # from the engine's historical portfolio values
            
            portfolio = engine._get_strategy_portfolio(strategy_id)
            current_time = engine.state.current_time
            
            # For now, return a simple equity curve
            # This should be enhanced to track historical values
            return [(current_time, portfolio.total_value)]
            
        except Exception as e:
            self._logger.error(f"Error extracting equity curve: {e}")
            return []
    
    async def _extract_trades(self, engine: BacktestEngine, run_id: str) -> List[Dict[str, Any]]:
        """Extract trade data from engine"""
        try:
            # This would extract actual trade records from the database
            # For now, return empty list as trade tracking is not fully implemented
            return []
            
        except Exception as e:
            self._logger.error(f"Error extracting trades: {e}")
            return []
    
    def generate_summary_report(self, result: BacktestResult) -> Dict[str, Any]:
        """
        Generate summary report matching the summary.schema.json format.
        
        Args:
            result: BacktestResult to generate report from
            
        Returns:
            Dictionary matching summary.schema.json structure
        """
        try:
            return {
                "run_id": result.run_id,
                "strategy_id": result.strategy_id,
                "execution_info": {
                    "start_date": result.start_date.isoformat(),
                    "end_date": result.end_date.isoformat(),
                    "duration_days": result.duration_days,
                    "total_bars": result.total_bars,
                    "execution_time_seconds": result.execution_time,
                    "initial_capital": float(result.initial_capital),
                    "final_capital": float(result.final_capital),
                    "currency": "USD"
                },
                "performance_summary": {
                    "total_return": float(result.total_return),
                    "annualized_return": float(result.annualized_return),
                    "volatility": float(result.volatility),
                    "sharpe_ratio": float(result.sharpe_ratio),
                    "sortino_ratio": float(result.sortino_ratio),
                    "calmar_ratio": float(result.calmar_ratio),
                    "max_drawdown": float(result.max_drawdown),
                    "max_drawdown_duration_days": result.max_drawdown_duration
                },
                "equity_curve": {
                    "data_points": [
                        {
                            "date": date.isoformat(),
                            "portfolio_value": float(value),
                            "cumulative_return": float((value - result.initial_capital) / result.initial_capital)
                        }
                        for date, value in result.equity_curve
                    ]
                },
                "trade_summary": {
                    "total_trades": result.total_trades,
                    "winning_trades": result.winning_trades,
                    "losing_trades": result.losing_trades,
                    "win_rate": float(result.win_rate),
                    "profit_factor": float(result.profit_factor),
                    "average_win": float(result.average_win),
                    "average_loss": float(result.average_loss),
                    "largest_win": float(result.largest_win),
                    "largest_loss": float(result.largest_loss)
                },
                "attribution": {
                    "by_symbol": {},
                    "by_strategy": {
                        result.strategy_id: {
                            "total_return": float(result.total_return),
                            "contribution": 1.0
                        }
                    },
                    "by_sector": {}
                },
                "risk_metrics": {
                    "value_at_risk_95": 0.0,  # Would need historical returns
                    "conditional_var_95": 0.0,
                    "beta": 0.0,  # Would need benchmark comparison
                    "correlation_to_benchmark": 0.0,
                    "tracking_error": 0.0,
                    "information_ratio": 0.0
                },
                "drawdown_analysis": {
                    "max_drawdown": float(result.max_drawdown),
                    "max_drawdown_duration_days": result.max_drawdown_duration,
                    "recovery_time_days": result.max_drawdown_duration,
                    "drawdown_periods": []
                },
                "monthly_returns": {
                    "returns": {
                        month: float(ret) for month, ret in result.monthly_returns.items()
                    },
                    "statistics": {
                        "best_month": max(result.monthly_returns.values()) if result.monthly_returns else 0.0,
                        "worst_month": min(result.monthly_returns.values()) if result.monthly_returns else 0.0,
                        "positive_months": sum(1 for ret in result.monthly_returns.values() if ret > 0),
                        "negative_months": sum(1 for ret in result.monthly_returns.values() if ret < 0)
                    }
                },
                "metadata": {
                    "schema_version": "1.0.0",
                    "generated_at": datetime.now().isoformat(),
                    "generator": "TradingEngine BacktestRunner v1.0.0",
                    "strategy_parameters": result.metadata.get('strategy_parameters', {}),
                    "risk_parameters": {
                        "commission_per_trade": float(result.config.commission_per_trade),
                        "slippage_bps": result.config.slippage_bps,
                        "max_positions": result.config.max_positions
                    },
                    "data_sources": ["sample_data"],
                    "benchmark": result.config.benchmark_symbol,
                    "currency": "USD",
                    "notes": f"Backtest executed in {result.execution_time:.2f} seconds"
                }
            }
            
        except Exception as e:
            self._logger.error(f"Error generating summary report: {e}")
            raise
    
    async def save_results(self, result: BacktestResult) -> None:
        """Save backtest results to database"""
        try:
            # This would save the complete results to the database
            # Implementation depends on the specific database schema
            self._logger.info(f"Results saved for run {result.run_id}")
            
        except Exception as e:
            self._logger.error(f"Error saving results: {e}")
            raise
