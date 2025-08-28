"""
Backtest Engine Implementation - Options Trading Backtest Engine

This module provides the core BacktestEngine class that orchestrates the entire
backtesting process, managing strategy execution, market data processing,
and serving as the primary StrategyContext implementation.

BUSINESS LOGIC IMPLEMENTATION
"""

import logging
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Any, Set, Tuple
from dataclasses import dataclass, field
import uuid

# Import contracts
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from engine.strategy import (
    Strategy, StrategyContext, StrategyState, StrategyError,
    MarketEvent, MarketEventType, OrderRequest, OrderType, OrderSide,
    Position, Portfolio, PerformanceMetrics
)
from data.provider import OHLCVBar, OptionContract, OptionsChain
from data.repository import (
    BacktestRepository, SignalRepository, MarketDataRepository,
    BacktestRun, SignalRecord, PerformanceMetric
)

logger = logging.getLogger(__name__)


@dataclass
class BacktestConfig:
    """Configuration for backtest execution"""
    start_date: datetime
    end_date: datetime
    initial_capital: Decimal
    symbols: List[str]
    benchmark_symbol: str = "SPY"
    commission_per_trade: Decimal = Decimal('1.00')
    slippage_bps: int = 5  # basis points
    max_positions: int = 10
    risk_free_rate: Decimal = Decimal('0.02')  # 2% annual
    data_frequency: str = "1D"  # Daily data
    enable_options: bool = True
    enable_signals: bool = True
    performance_update_frequency: int = 100  # Update metrics every N bars


@dataclass
class BacktestState:
    """Current state of the backtest execution"""
    current_time: datetime
    current_bar_index: int = 0
    total_bars: int = 0
    is_running: bool = False
    is_paused: bool = False
    strategies_initialized: bool = False
    last_performance_update: datetime = field(default_factory=datetime.now)


class BacktestStrategyContext(StrategyContext):
    """
    Implementation of StrategyContext that provides strategies with
    access to market data, signal execution, and order management.
    
    This is the primary interface that strategies use to interact with
    the backtesting environment.
    """
    
    def __init__(
        self,
        engine: 'BacktestEngine',
        strategy_id: str,
        run_id: str
    ):
        self.engine = engine
        self.strategy_id = strategy_id
        self.run_id = run_id
        self._logger = logging.getLogger(f"strategy.{strategy_id}")
    
    async def get_historical_data(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        frequency: str = "1D"
    ) -> List[OHLCVBar]:
        """
        Get historical OHLCV data for a symbol.
        
        This method provides strategies with access to historical market data
        for technical analysis, indicator calculation, and signal generation.
        """
        try:
            self._logger.debug(f"Fetching historical data for {symbol}: {start_date} to {end_date}")
            
            # Use the market data repository to fetch historical data
            historical_data = await self.engine.market_data_repo.get_ohlcv(
                symbol, start_date, end_date
            )
            
            self._logger.debug(f"Retrieved {len(historical_data)} bars for {symbol}")
            return historical_data
            
        except Exception as e:
            self._logger.error(f"Failed to get historical data for {symbol}: {e}")
            return []
    
    async def get_current_price(self, symbol: str) -> Optional[Decimal]:
        """
        Get the current price for a symbol.
        
        Returns the close price of the current bar being processed
        in the backtest simulation.
        """
        try:
            current_bar = self.engine._get_current_bar(symbol)
            if current_bar:
                price = current_bar.close
                self._logger.debug(f"Current price for {symbol}: ${price}")
                return price
            else:
                self._logger.warning(f"No current bar available for {symbol}")
                return None
                
        except Exception as e:
            self._logger.error(f"Failed to get current price for {symbol}: {e}")
            return None
    
    async def get_options_chain(
        self,
        underlying: str,
        expiration: Optional[datetime] = None
    ) -> Optional[OptionsChain]:
        """
        Get options chain for an underlying symbol.
        
        Provides access to options data for derivatives trading strategies.
        """
        try:
            if not self.engine.config.enable_options:
                self._logger.debug("Options trading disabled in backtest config")
                return None
            
            current_time = self.engine.state.current_time
            self._logger.debug(f"Fetching options chain for {underlying} at {current_time}")
            
            options_chain = await self.engine.market_data_repo.get_options_chain(
                underlying, current_time, expiration
            )
            
            if options_chain:
                self._logger.debug(f"Retrieved options chain with {len(options_chain.contracts)} contracts")
            else:
                self._logger.debug(f"No options chain found for {underlying}")
            
            return options_chain
            
        except Exception as e:
            self._logger.error(f"Failed to get options chain for {underlying}: {e}")
            return None
    
    async def execute_signal(
        self,
        signal_name: str,
        symbol: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> Optional['SignalOutput']:
        """
        Execute a registered signal function.
        
        This method integrates with the SignalRegistry to execute trading signals
        and automatically stores the results for analysis.
        """
        try:
            if not self.engine.config.enable_signals:
                self._logger.debug("Signal execution disabled in backtest config")
                return None
            
            self._logger.debug(f"Executing signal '{signal_name}' for {symbol}")
            
            # Import signal registry functions
            from src.signals.registry import execute_signal, SignalInput
            
            # Prepare signal input data
            signal_input = await self._prepare_signal_input(symbol, parameters)
            if not signal_input:
                return None
            
            # Execute the signal
            result = execute_signal(signal_name, signal_input)
            
            # Store signal record if result exists
            if result:
                await self._store_signal_record(signal_name, signal_input, result)
                self._logger.info(f"Signal '{signal_name}' executed: {result.signal_type.value} with confidence {result.confidence}")
            else:
                self._logger.debug(f"Signal '{signal_name}' returned no result")
            
            return result
            
        except Exception as e:
            self._logger.error(f"Failed to execute signal {signal_name}: {e}")
            return None
    
    async def submit_order(self, order_request: OrderRequest) -> str:
        """
        Submit an order for execution.
        
        This is a placeholder implementation that will be expanded
        in the next phase to include full order management.
        """
        try:
            # Generate unique order ID
            order_id = str(uuid.uuid4())
            
            self._logger.info(
                f"Order submitted: {order_id} - {order_request.side.value} "
                f"{order_request.quantity} {order_request.symbol} @ "
                f"{order_request.order_type.value}"
            )
            
            # TODO: Implement full order processing in next phase
            # This will include:
            # - Order validation
            # - Portfolio impact calculation
            # - Fill simulation with slippage
            # - Position updates
            # - Commission calculation
            
            return order_id
            
        except Exception as e:
            self._logger.error(f"Failed to submit order: {e}")
            raise StrategyError(f"Order submission failed: {e}")
    
    async def get_portfolio(self) -> Portfolio:
        """
        Get current portfolio state for this strategy.
        
        Returns the portfolio associated with this strategy context.
        """
        return self.engine._get_strategy_portfolio(self.strategy_id)
    
    async def get_positions(self) -> List[Position]:
        """Get current positions for this strategy"""
        portfolio = await self.get_portfolio()
        return list(portfolio.positions.values())
    
    async def get_performance_metrics(self) -> PerformanceMetrics:
        """Get current performance metrics for this strategy"""
        return self.engine._calculate_strategy_performance(self.strategy_id)
    
    def log_info(self, message: str, **kwargs):
        """Log info message with strategy context"""
        self._logger.info(f"[{self.strategy_id}] {message}", extra=kwargs)
    
    def log_warning(self, message: str, **kwargs):
        """Log warning message with strategy context"""
        self._logger.warning(f"[{self.strategy_id}] {message}", extra=kwargs)
    
    def log_error(self, message: str, **kwargs):
        """Log error message with strategy context"""
        self._logger.error(f"[{self.strategy_id}] {message}", extra=kwargs)
    
    async def _prepare_signal_input(
        self,
        symbol: str,
        parameters: Optional[Dict[str, Any]]
    ) -> Optional['SignalInput']:
        """Prepare input data for signal execution"""
        try:
            from src.signals.registry import SignalInput
            
            # Get current price
            current_price = await self.get_current_price(symbol)
            if not current_price:
                self._logger.warning(f"No current price available for {symbol}")
                return None
            
            # Get historical data for signal analysis
            lookback_days = parameters.get('lookback_days', 30) if parameters else 30
            start_date = self.engine.state.current_time - timedelta(days=lookback_days)
            historical_data = await self.get_historical_data(
                symbol, start_date, self.engine.state.current_time
            )
            
            # Get options chain if needed
            options_chain = await self.get_options_chain(symbol)
            
            # Create signal input
            signal_input = SignalInput(
                symbol=symbol,
                timestamp=self.engine.state.current_time,
                current_price=current_price,
                historical_data=historical_data,
                options_chain=options_chain,
                market_event=None,  # Could be enhanced to pass current market event
                context=self,
                parameters=parameters or {},
                metadata={
                    "strategy_id": self.strategy_id,
                    "run_id": self.run_id,
                    "backtest_time": self.engine.state.current_time.isoformat()
                }
            )
            
            return signal_input
            
        except Exception as e:
            self._logger.error(f"Failed to prepare signal input: {e}")
            return None
    
    async def _store_signal_record(
        self,
        signal_name: str,
        signal_input: 'SignalInput',
        signal_output: 'SignalOutput'
    ):
        """Store signal execution record in the database"""
        try:
            signal_record = SignalRecord(
                signal_id=signal_output.signal_id,
                strategy_id=self.strategy_id,
                run_id=self.run_id,
                symbol=signal_input.symbol,
                signal_type=signal_output.signal_type.value,
                strength=signal_output.strength.value,
                confidence=signal_output.confidence,
                timestamp=signal_input.timestamp,
                price=signal_input.current_price,
                quantity=signal_output.target_quantity or Decimal('0'),
                metadata={
                    "signal_name": signal_name,
                    "reasoning": signal_output.reasoning,
                    "supporting_data": signal_output.supporting_data,
                    "target_price": float(signal_output.target_price),
                    "stop_loss": float(signal_output.stop_loss) if signal_output.stop_loss else None,
                    "take_profit": float(signal_output.take_profit) if signal_output.take_profit else None
                },
                processed=False
            )
            
            await self.engine.signal_repo.store_signals([signal_record])
            self._logger.debug(f"Stored signal record: {signal_output.signal_id}")
            
        except Exception as e:
            self._logger.error(f"Failed to store signal record: {e}")


class BacktestEngine:
    """
    Core backtest engine that orchestrates strategy execution and market data processing.
    
    This is the heart of the backtesting system, responsible for:
    - Managing the backtest lifecycle (initialize, run, finalize)
    - Processing market data in time-step simulation
    - Coordinating strategy execution
    - Providing StrategyContext implementation
    - Managing portfolios and performance tracking
    """
    
    def __init__(
        self,
        config: BacktestConfig,
        backtest_repo: BacktestRepository,
        signal_repo: SignalRepository,
        market_data_repo: MarketDataRepository
    ):
        self.config = config
        self.backtest_repo = backtest_repo
        self.signal_repo = signal_repo
        self.market_data_repo = market_data_repo
        
        # Engine state
        self.state = BacktestState(current_time=config.start_date)
        self.run_id = str(uuid.uuid4())
        
        # Strategy management
        self.strategies: Dict[str, Strategy] = {}
        self.strategy_contexts: Dict[str, BacktestStrategyContext] = {}
        self.strategy_portfolios: Dict[str, Portfolio] = {}
        
        # Market data cache for efficient access
        self._market_data_cache: Dict[str, List[OHLCVBar]] = {}
        self._current_bars: Dict[str, OHLCVBar] = {}
        
        # Performance tracking
        self._performance_history: List[PerformanceMetric] = []
        
        self._logger = logging.getLogger(__name__)
    
    async def add_strategy(self, strategy: Strategy, strategy_id: str) -> bool:
        """
        Add a strategy to the backtest.
        
        Creates the strategy context and initializes the portfolio.
        """
        try:
            if strategy_id in self.strategies:
                raise StrategyError(f"Strategy {strategy_id} already exists")
            
            # Register the strategy
            self.strategies[strategy_id] = strategy
            
            # Create strategy context
            context = BacktestStrategyContext(self, strategy_id, self.run_id)
            self.strategy_contexts[strategy_id] = context
            
            # Initialize strategy portfolio
            self.strategy_portfolios[strategy_id] = Portfolio(
                cash=self.config.initial_capital,
                positions={},
                total_value=self.config.initial_capital,
                unrealized_pnl=Decimal('0'),
                realized_pnl=Decimal('0')
            )
            
            self._logger.info(f"Added strategy: {strategy_id}")
            return True
            
        except Exception as e:
            self._logger.error(f"Failed to add strategy {strategy_id}: {e}")
            return False

    async def initialize(self) -> bool:
        """
        Initialize the backtest engine.

        This method prepares the engine for execution by:
        - Loading market data for all symbols
        - Creating the backtest run record
        - Initializing all registered strategies
        """
        try:
            self._logger.info("Initializing backtest engine...")

            # Load market data for all symbols
            await self._load_market_data()

            # Create backtest run record in database
            await self._create_backtest_run()

            # Initialize all strategies
            await self._initialize_strategies()

            self.state.strategies_initialized = True
            self._logger.info("Backtest engine initialized successfully")
            return True

        except Exception as e:
            self._logger.error(f"Failed to initialize backtest engine: {e}")
            return False

    async def run(self) -> bool:
        """
        Execute the complete backtest.

        This is the main event loop that processes market data chronologically
        and feeds it to all registered strategies.
        """
        try:
            if not await self.initialize():
                return False

            self._logger.info(
                f"Starting backtest from {self.config.start_date} to {self.config.end_date}"
            )
            self.state.is_running = True

            # Main backtest event loop
            while (self.state.current_time <= self.config.end_date and
                   self.state.current_bar_index < self.state.total_bars):

                # Check for pause state
                if self.state.is_paused:
                    await asyncio.sleep(0.1)
                    continue

                # Process current time step
                await self._process_time_step()

                # Move to next time step
                self._advance_time()

                # Update performance metrics periodically
                if (self.state.current_bar_index % self.config.performance_update_frequency == 0):
                    await self._update_performance_metrics()

            # Finalize backtest
            await self._finalize_backtest()

            self.state.is_running = False
            self._logger.info("Backtest completed successfully")
            return True

        except Exception as e:
            self.state.is_running = False
            self._logger.error(f"Backtest failed: {e}")
            return False

    def _get_current_bar(self, symbol: str) -> Optional[OHLCVBar]:
        """Get the current market data bar for a symbol"""
        return self._current_bars.get(symbol)

    def _get_strategy_portfolio(self, strategy_id: str) -> Portfolio:
        """Get portfolio for a specific strategy"""
        return self.strategy_portfolios.get(strategy_id, Portfolio(
            cash=Decimal('0'), positions={}, total_value=Decimal('0'),
            unrealized_pnl=Decimal('0'), realized_pnl=Decimal('0')
        ))

    def _calculate_strategy_performance(self, strategy_id: str) -> PerformanceMetrics:
        """
        Calculate performance metrics for a strategy.

        This is a basic implementation that will be enhanced in future phases.
        """
        portfolio = self._get_strategy_portfolio(strategy_id)

        # Basic performance calculation
        total_return = (portfolio.total_value - self.config.initial_capital) / self.config.initial_capital

        return PerformanceMetrics(
            total_return=total_return,
            annualized_return=total_return,  # Simplified for now
            volatility=Decimal('0'),  # Would need historical returns
            sharpe_ratio=Decimal('0'),  # Would need risk-free rate calculation
            max_drawdown=Decimal('0'),  # Would need drawdown tracking
            win_rate=Decimal('0'),  # Would need trade tracking
            profit_factor=Decimal('1'),  # Would need win/loss analysis
            total_trades=0,
            winning_trades=0,
            losing_trades=0
        )

    async def _load_market_data(self):
        """Load market data for all symbols in the backtest"""
        self._logger.info("Loading market data...")

        for symbol in self.config.symbols:
            try:
                bars = await self.market_data_repo.get_ohlcv(
                    symbol, self.config.start_date, self.config.end_date
                )

                if bars:
                    self._market_data_cache[symbol] = bars
                    self.state.total_bars = max(self.state.total_bars, len(bars))
                    self._logger.info(f"Loaded {len(bars)} bars for {symbol}")
                else:
                    self._logger.warning(f"No data found for {symbol}")

            except Exception as e:
                self._logger.error(f"Failed to load data for {symbol}: {e}")

        self._logger.info(f"Market data loaded. Total bars: {self.state.total_bars}")

    async def _create_backtest_run(self):
        """Create backtest run record in the database"""
        backtest_run = BacktestRun(
            run_id=self.run_id,
            strategy_id="multi_strategy",  # Will be enhanced for single strategy runs
            start_date=self.config.start_date,
            end_date=self.config.end_date,
            initial_capital=self.config.initial_capital,
            final_capital=self.config.initial_capital,  # Will be updated at completion
            total_return=Decimal('0'),
            max_drawdown=Decimal('0'),
            sharpe_ratio=Decimal('0'),
            created_at=datetime.now(),
            completed_at=None,
            status="running",
            parameters={
                "symbols": self.config.symbols,
                "commission_per_trade": float(self.config.commission_per_trade),
                "slippage_bps": self.config.slippage_bps,
                "max_positions": self.config.max_positions,
                "data_frequency": self.config.data_frequency
            },
            metadata={
                "engine_version": "1.0.0",
                "strategies": list(self.strategies.keys()),
                "enable_options": self.config.enable_options,
                "enable_signals": self.config.enable_signals
            }
        )

        await self.backtest_repo.create_backtest_run(backtest_run)
        self._logger.info(f"Created backtest run: {self.run_id}")

    async def _initialize_strategies(self):
        """Initialize all registered strategies"""
        self._logger.info("Initializing strategies...")

        for strategy_id, strategy in self.strategies.items():
            try:
                context = self.strategy_contexts[strategy_id]
                success = await strategy.initialize(context)

                if success:
                    self._logger.info(f"Initialized strategy: {strategy_id}")
                else:
                    self._logger.error(f"Strategy {strategy_id} initialization returned False")
                    raise StrategyError(f"Strategy {strategy_id} failed to initialize")

            except Exception as e:
                self._logger.error(f"Failed to initialize strategy {strategy_id}: {e}")
                raise StrategyError(f"Strategy initialization failed: {e}")

    async def _process_time_step(self):
        """
        Process a single time step in the backtest.

        This method:
        1. Updates current market data bars
        2. Creates market events
        3. Distributes events to all strategies
        """
        # Update current bars for all symbols
        self._update_current_bars()

        # Create market event for this time step
        market_event = MarketEvent(
            event_type=MarketEventType.BAR_UPDATE,
            timestamp=self.state.current_time,
            symbol="",  # Multi-symbol event
            data={
                "bar_index": self.state.current_bar_index,
                "symbols": list(self._current_bars.keys())
            }
        )

        # Process strategies in parallel for better performance
        strategy_tasks = []
        for strategy_id, strategy in self.strategies.items():
            context = self.strategy_contexts[strategy_id]
            task = self._process_strategy_market_data(strategy, context, market_event)
            strategy_tasks.append(task)

        # Wait for all strategies to complete processing
        if strategy_tasks:
            await asyncio.gather(*strategy_tasks, return_exceptions=True)

    async def _process_strategy_market_data(
        self,
        strategy: Strategy,
        context: BacktestStrategyContext,
        event: MarketEvent
    ):
        """Process market data for a single strategy"""
        try:
            await strategy.on_market_data(context, event)
        except Exception as e:
            self._logger.error(f"Strategy {context.strategy_id} failed on market data: {e}")
            # Continue processing other strategies even if one fails

    def _update_current_bars(self):
        """Update current market data bars for all symbols"""
        for symbol, bars in self._market_data_cache.items():
            if self.state.current_bar_index < len(bars):
                self._current_bars[symbol] = bars[self.state.current_bar_index]

    def _advance_time(self):
        """Advance to the next time step"""
        self.state.current_bar_index += 1

        # Update current time based on the first symbol's data
        if self.config.symbols and self._market_data_cache.get(self.config.symbols[0]):
            bars = self._market_data_cache[self.config.symbols[0]]
            if self.state.current_bar_index < len(bars):
                self.state.current_time = bars[self.state.current_bar_index].timestamp

    async def _update_performance_metrics(self):
        """Update performance metrics (placeholder for future implementation)"""
        # This will be enhanced with detailed performance calculations
        self.state.last_performance_update = datetime.now()

    async def _finalize_backtest(self):
        """Finalize backtest and cleanup"""
        try:
            # Update backtest run status
            await self.backtest_repo.update_backtest_status(
                self.run_id, "completed", datetime.now()
            )

            # Cleanup strategies
            for strategy_id, strategy in self.strategies.items():
                try:
                    context = self.strategy_contexts[strategy_id]
                    await strategy.cleanup(context)
                except Exception as e:
                    self._logger.error(f"Failed to cleanup strategy {strategy_id}: {e}")

            self._logger.info("Backtest finalized successfully")

        except Exception as e:
            self._logger.error(f"Failed to finalize backtest: {e}")


# Convenience function for creating backtest engine with SQLite repositories
def create_backtest_engine(
    config: BacktestConfig,
    db_path: str = ":memory:"
) -> BacktestEngine:
    """
    Create a backtest engine with SQLite repositories.

    This is a convenience function that sets up the engine with
    the standard SQLite repository implementations.
    """
    from src.data.repository import (
        SQLiteBacktestRepository,
        SQLiteSignalRepository,
        SQLiteMarketDataRepository
    )

    backtest_repo = SQLiteBacktestRepository(db_path)
    signal_repo = SQLiteSignalRepository(db_path)
    market_data_repo = SQLiteMarketDataRepository(db_path)

    return BacktestEngine(config, backtest_repo, signal_repo, market_data_repo)
