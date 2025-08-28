"""
Backtest Engine Implementation - Options Trading Backtest Engine

This module provides the core BacktestEngine class that orchestrates the entire
backtesting process, managing strategy execution, market data processing,
and performance tracking.

BUSINESS LOGIC IMPLEMENTATION
"""

import logging
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Any, Set, Tuple
from dataclasses import dataclass, field
import uuid

# Import contracts - using absolute imports to avoid circular import issues
# For now, we'll define minimal types here to avoid import complexity
from typing import Protocol
from enum import Enum

# Minimal type definitions for testing (would normally import from contracts)
class StrategyState(Enum):
    CREATED = "created"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"

class MarketEventType(Enum):
    BAR_UPDATE = "bar_update"
    TRADE = "trade"
    ORDER_FILL = "order_fill"

class OrderType(Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"

class OrderSide(Enum):
    BUY = "buy"
    SELL = "sell"

@dataclass
class MarketEvent:
    event_type: MarketEventType
    timestamp: datetime
    symbol: str
    data: Dict[str, Any]

@dataclass
class OrderRequest:
    symbol: str
    order_type: OrderType
    side: OrderSide
    quantity: Decimal
    price: Optional[Decimal]
    time_in_force: str
    metadata: Dict[str, Any]

@dataclass
class Position:
    symbol: str
    quantity: Decimal
    average_price: Decimal
    market_value: Decimal
    unrealized_pnl: Decimal

@dataclass
class Portfolio:
    cash: Decimal
    positions: Dict[str, Position]
    total_value: Decimal
    unrealized_pnl: Decimal
    realized_pnl: Decimal

@dataclass
class PerformanceMetrics:
    total_return: Decimal
    annualized_return: Decimal
    volatility: Decimal
    sharpe_ratio: Decimal
    max_drawdown: Decimal
    win_rate: Decimal
    profit_factor: Decimal
    total_trades: int
    winning_trades: int
    losing_trades: int

class StrategyError(Exception):
    pass

# Protocol definitions
class StrategyContext(Protocol):
    async def get_historical_data(self, symbol: str, start_date: datetime, end_date: datetime, frequency: str = "1D") -> List['OHLCVBar']: ...
    async def get_current_price(self, symbol: str) -> Optional[Decimal]: ...
    async def get_options_chain(self, underlying: str, expiration: Optional[datetime] = None) -> Optional['OptionsChain']: ...
    async def execute_signal(self, signal_name: str, symbol: str, parameters: Optional[Dict[str, Any]] = None) -> Optional['SignalOutput']: ...
    async def submit_order(self, order_request: OrderRequest) -> str: ...
    async def get_portfolio(self) -> Portfolio: ...
    async def get_positions(self) -> List[Position]: ...
    async def get_performance_metrics(self) -> PerformanceMetrics: ...
    def log_info(self, message: str, **kwargs): ...
    def log_warning(self, message: str, **kwargs): ...
    def log_error(self, message: str, **kwargs): ...

class Strategy(Protocol):
    async def initialize(self, context: StrategyContext) -> bool: ...
    async def on_market_data(self, context: StrategyContext, event: MarketEvent) -> None: ...
    async def cleanup(self, context: StrategyContext) -> None: ...

# Import our implementations
from src.data.repository import (
    SQLiteBacktestRepository, SQLiteSignalRepository, SQLiteMarketDataRepository
)

# Import data types we need
@dataclass
class OHLCVBar:
    symbol: str
    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int
    adjusted_close: Decimal

@dataclass
class OptionContract:
    symbol: str
    underlying: str
    expiration: datetime
    strike: Decimal
    option_type: str
    bid: Decimal
    ask: Decimal
    volume: int
    open_interest: int
    implied_volatility: Decimal
    delta: Decimal

@dataclass
class OptionsChain:
    underlying: str
    timestamp: datetime
    underlying_price: Decimal
    contracts: List[OptionContract]

@dataclass
class BacktestRun:
    run_id: str
    strategy_id: str
    start_date: datetime
    end_date: datetime
    initial_capital: Decimal
    final_capital: Decimal
    total_return: Decimal
    max_drawdown: Decimal
    sharpe_ratio: Decimal
    created_at: datetime
    completed_at: Optional[datetime]
    status: str
    parameters: Dict[str, Any]
    metadata: Dict[str, Any]

@dataclass
class SignalRecord:
    signal_id: str
    strategy_id: str
    run_id: str
    symbol: str
    signal_type: str
    strength: str
    confidence: Decimal
    timestamp: datetime
    price: Decimal
    quantity: Decimal
    metadata: Dict[str, Any]
    processed: bool

@dataclass
class PerformanceMetric:
    run_id: str
    timestamp: datetime
    portfolio_value: Decimal
    cash: Decimal
    unrealized_pnl: Decimal
    realized_pnl: Decimal
    total_return: Decimal
    drawdown: Decimal
    metadata: Dict[str, Any]

# Import signal types
try:
    from src.signals.registry import get_signal, execute_signal, SignalInput, SignalOutput
except ImportError:
    # Fallback definitions for testing
    @dataclass
    class SignalInput:
        symbol: str
        timestamp: datetime
        current_price: Decimal
        historical_data: List[OHLCVBar]
        options_chain: Optional[OptionsChain]
        market_event: Optional[MarketEvent]
        context: Optional[StrategyContext]
        parameters: Dict[str, Any]
        metadata: Dict[str, Any]

    @dataclass
    class SignalOutput:
        signal_id: str
        signal_type: Any  # Would be SignalType enum
        strength: Any     # Would be SignalStrength enum
        confidence: Decimal
        target_price: Decimal
        target_quantity: Optional[Decimal]
        stop_loss: Optional[Decimal]
        take_profit: Optional[Decimal]
        expiry: Optional[datetime]
        reasoning: str
        supporting_data: Dict[str, Any]
        metadata: Dict[str, Any]

    def get_signal(name: str):
        return None

    def execute_signal(name: str, input_data: SignalInput) -> Optional[SignalOutput]:
        return None

# Repository protocol definitions
class BacktestRepository(Protocol):
    async def create_backtest_run(self, run: BacktestRun) -> str: ...
    async def update_backtest_status(self, run_id: str, status: str, completed_at: Optional[datetime] = None) -> bool: ...
    async def get_backtest_runs(self, strategy_id: Optional[str] = None, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> List[BacktestRun]: ...

class SignalRepository(Protocol):
    async def store_signals(self, signals: List[SignalRecord]) -> int: ...
    async def get_signals(self, strategy_id: Optional[str] = None, symbol: Optional[str] = None, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, signal_type: Optional[str] = None, run_id: Optional[str] = None) -> List[SignalRecord]: ...

class MarketDataRepository(Protocol):
    async def get_ohlcv(self, symbol: str, start_date: datetime, end_date: datetime) -> List[OHLCVBar]: ...
    async def get_options_chain(self, underlying: str, timestamp: datetime, expiration: Optional[datetime] = None) -> Optional[OptionsChain]: ...

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


class StrategyContextImpl(StrategyContext):
    """
    Implementation of StrategyContext that provides strategies with
    access to market data, signal execution, and order management.
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
        """Get historical OHLCV data for a symbol"""
        try:
            return await self.engine.market_data_repo.get_ohlcv(
                symbol, start_date, end_date
            )
        except Exception as e:
            self._logger.error(f"Failed to get historical data for {symbol}: {e}")
            return []
    
    async def get_current_price(self, symbol: str) -> Optional[Decimal]:
        """Get current price for a symbol"""
        try:
            current_bar = self.engine._get_current_bar(symbol)
            return current_bar.close if current_bar else None
        except Exception as e:
            self._logger.error(f"Failed to get current price for {symbol}: {e}")
            return None
    
    async def get_options_chain(
        self,
        underlying: str,
        expiration: Optional[datetime] = None
    ) -> Optional[OptionsChain]:
        """Get options chain for an underlying symbol"""
        try:
            current_time = self.engine.state.current_time
            return await self.engine.market_data_repo.get_options_chain(
                underlying, current_time, expiration
            )
        except Exception as e:
            self._logger.error(f"Failed to get options chain for {underlying}: {e}")
            return None
    
    async def execute_signal(
        self,
        signal_name: str,
        symbol: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> Optional[SignalOutput]:
        """Execute a registered signal"""
        try:
            if not self.engine.config.enable_signals:
                self._logger.warning("Signal execution disabled in backtest config")
                return None
            
            # Get historical data for signal input
            lookback_days = parameters.get('lookback_days', 30) if parameters else 30
            start_date = self.engine.state.current_time - timedelta(days=lookback_days)
            historical_data = await self.get_historical_data(
                symbol, start_date, self.engine.state.current_time
            )
            
            # Get current price
            current_price = await self.get_current_price(symbol)
            if not current_price:
                self._logger.warning(f"No current price available for {symbol}")
                return None
            
            # Create signal input
            signal_input = SignalInput(
                symbol=symbol,
                timestamp=self.engine.state.current_time,
                current_price=current_price,
                historical_data=historical_data,
                options_chain=await self.get_options_chain(symbol),
                market_event=None,  # Could be enhanced to pass current market event
                context=self,
                parameters=parameters or {},
                metadata={
                    "strategy_id": self.strategy_id,
                    "run_id": self.run_id,
                    "backtest_time": self.engine.state.current_time.isoformat()
                }
            )
            
            # Execute signal
            result = execute_signal(signal_name, signal_input)
            
            # Store signal record if result exists
            if result:
                await self._store_signal_record(signal_name, signal_input, result)
            
            return result
            
        except Exception as e:
            self._logger.error(f"Failed to execute signal {signal_name}: {e}")
            return None
    
    async def submit_order(self, order_request: OrderRequest) -> str:
        """Submit an order for execution"""
        try:
            return await self.engine._process_order(order_request, self.strategy_id)
        except Exception as e:
            self._logger.error(f"Failed to submit order: {e}")
            raise StrategyError(f"Order submission failed: {e}")
    
    async def get_portfolio(self) -> Portfolio:
        """Get current portfolio state"""
        return self.engine._get_strategy_portfolio(self.strategy_id)
    
    async def get_positions(self) -> List[Position]:
        """Get current positions"""
        portfolio = await self.get_portfolio()
        return list(portfolio.positions.values())
    
    async def get_performance_metrics(self) -> PerformanceMetrics:
        """Get current performance metrics"""
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
    
    async def _store_signal_record(
        self,
        signal_name: str,
        signal_input: SignalInput,
        signal_output: SignalOutput
    ):
        """Store signal execution record"""
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
            
        except Exception as e:
            self._logger.error(f"Failed to store signal record: {e}")


class BacktestEngine:
    """
    Core backtest engine that orchestrates strategy execution,
    market data processing, and performance tracking.
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
        self.strategy_contexts: Dict[str, StrategyContextImpl] = {}
        self.strategy_portfolios: Dict[str, Portfolio] = {}
        
        # Market data cache
        self._market_data_cache: Dict[str, List[OHLCVBar]] = {}
        self._current_bars: Dict[str, OHLCVBar] = {}
        
        # Performance tracking
        self._performance_history: List[PerformanceMetric] = []
        
        self._logger = logging.getLogger(__name__)
    
    async def add_strategy(self, strategy: Strategy, strategy_id: str) -> bool:
        """Add a strategy to the backtest"""
        try:
            if strategy_id in self.strategies:
                raise StrategyError(f"Strategy {strategy_id} already exists")
            
            self.strategies[strategy_id] = strategy
            
            # Create strategy context
            context = StrategyContextImpl(self, strategy_id, self.run_id)
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
        """Initialize the backtest engine"""
        try:
            self._logger.info("Initializing backtest engine...")
            
            # Load market data
            await self._load_market_data()
            
            # Create backtest run record
            await self._create_backtest_run()
            
            # Initialize strategies
            await self._initialize_strategies()
            
            self.state.strategies_initialized = True
            self._logger.info("Backtest engine initialized successfully")
            return True
            
        except Exception as e:
            self._logger.error(f"Failed to initialize backtest engine: {e}")
            return False
    
    async def run(self) -> bool:
        """Execute the complete backtest"""
        try:
            if not await self.initialize():
                return False
            
            self._logger.info(f"Starting backtest from {self.config.start_date} to {self.config.end_date}")
            self.state.is_running = True
            
            # Main backtest loop
            while (self.state.current_time <= self.config.end_date and 
                   self.state.current_bar_index < self.state.total_bars):
                
                if self.state.is_paused:
                    await asyncio.sleep(0.1)
                    continue
                
                # Process current time step
                await self._process_time_step()
                
                # Move to next time step
                self._advance_time()
            
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
        """Get current market data bar for a symbol"""
        return self._current_bars.get(symbol)
    
    def _get_strategy_portfolio(self, strategy_id: str) -> Portfolio:
        """Get portfolio for a specific strategy"""
        return self.strategy_portfolios.get(strategy_id, Portfolio(
            cash=Decimal('0'), positions={}, total_value=Decimal('0'),
            unrealized_pnl=Decimal('0'), realized_pnl=Decimal('0')
        ))
    
    def _calculate_strategy_performance(self, strategy_id: str) -> PerformanceMetrics:
        """Calculate performance metrics for a strategy"""
        portfolio = self._get_strategy_portfolio(strategy_id)
        
        # Basic performance calculation (can be enhanced)
        total_return = (portfolio.total_value - self.config.initial_capital) / self.config.initial_capital
        
        return PerformanceMetrics(
            total_return=total_return,
            annualized_return=total_return,  # Simplified
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
        """Load market data for all symbols"""
        self._logger.info("Loading market data...")
        
        for symbol in self.config.symbols:
            try:
                bars = await self.market_data_repo.get_ohlcv(
                    symbol, self.config.start_date, self.config.end_date
                )
                self._market_data_cache[symbol] = bars
                
                if bars:
                    self.state.total_bars = max(self.state.total_bars, len(bars))
                    self._logger.info(f"Loaded {len(bars)} bars for {symbol}")
                else:
                    self._logger.warning(f"No data found for {symbol}")
                    
            except Exception as e:
                self._logger.error(f"Failed to load data for {symbol}: {e}")
        
        self._logger.info(f"Market data loaded. Total bars: {self.state.total_bars}")
    
    async def _create_backtest_run(self):
        """Create backtest run record"""
        backtest_run = BacktestRun(
            run_id=self.run_id,
            strategy_id="multi_strategy",  # Could be enhanced for single strategy runs
            start_date=self.config.start_date,
            end_date=self.config.end_date,
            initial_capital=self.config.initial_capital,
            final_capital=self.config.initial_capital,  # Will be updated
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
        """Initialize all strategies"""
        self._logger.info("Initializing strategies...")
        
        for strategy_id, strategy in self.strategies.items():
            try:
                context = self.strategy_contexts[strategy_id]
                await strategy.initialize(context)
                self._logger.info(f"Initialized strategy: {strategy_id}")
                
            except Exception as e:
                self._logger.error(f"Failed to initialize strategy {strategy_id}: {e}")
                raise StrategyError(f"Strategy initialization failed: {e}")
    
    async def _process_time_step(self):
        """Process a single time step in the backtest"""
        # Update current bars for all symbols
        self._update_current_bars()
        
        # Create market event
        market_event = MarketEvent(
            event_type=MarketEventType.BAR_UPDATE,
            timestamp=self.state.current_time,
            symbol="",  # Multi-symbol event
            data={"bar_index": self.state.current_bar_index}
        )
        
        # Process strategies
        for strategy_id, strategy in self.strategies.items():
            try:
                context = self.strategy_contexts[strategy_id]
                await strategy.on_market_data(context, market_event)
                
            except Exception as e:
                self._logger.error(f"Strategy {strategy_id} failed on market data: {e}")
        
        # Update performance metrics periodically
        if (self.state.current_bar_index % self.config.performance_update_frequency == 0):
            await self._update_performance_metrics()
    
    def _update_current_bars(self):
        """Update current market data bars"""
        for symbol, bars in self._market_data_cache.items():
            if self.state.current_bar_index < len(bars):
                self._current_bars[symbol] = bars[self.state.current_bar_index]
    
    def _advance_time(self):
        """Advance to next time step"""
        self.state.current_bar_index += 1
        
        # Update current time based on first symbol's data
        if self.config.symbols and self._market_data_cache.get(self.config.symbols[0]):
            bars = self._market_data_cache[self.config.symbols[0]]
            if self.state.current_bar_index < len(bars):
                self.state.current_time = bars[self.state.current_bar_index].timestamp
    
    async def _process_order(self, order_request: OrderRequest, strategy_id: str) -> str:
        """Process an order request (placeholder for now)"""
        # This will be implemented in the next step with full order management
        order_id = str(uuid.uuid4())
        self._logger.info(f"Order processed: {order_id} for strategy {strategy_id}")
        return order_id
    
    async def _update_performance_metrics(self):
        """Update performance metrics"""
        # This will be enhanced with detailed performance calculations
        pass
    
    async def _finalize_backtest(self):
        """Finalize backtest and update records"""
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
    """Create a backtest engine with SQLite repositories"""
    backtest_repo = SQLiteBacktestRepository(db_path)
    signal_repo = SQLiteSignalRepository(db_path)
    market_data_repo = SQLiteMarketDataRepository(db_path)

    return BacktestEngine(config, backtest_repo, signal_repo, market_data_repo)
