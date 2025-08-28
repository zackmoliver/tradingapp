"""
Test Suite for Core Backtest Engine - Options Trading Backtest Engine

Comprehensive tests for the BacktestEngine class focusing on the core
engine functionality, StrategyContext implementation, and event loop.
"""

import pytest
import pytest_asyncio
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional, Dict, Any
import uuid

# Add path for imports
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Import the implementation to test
from src.engine.backtest_engine import (
    BacktestEngine, BacktestConfig, BacktestState, BacktestStrategyContext,
    create_backtest_engine
)

# Import required contracts and types
from engine.strategy import (
    Strategy, StrategyContext, StrategyState, MarketEvent, MarketEventType,
    OrderRequest, OrderType, OrderSide, Position, Portfolio, PerformanceMetrics
)
from data.provider import OHLCVBar, OptionContract, OptionsChain
from data.repository import BacktestRun, SignalRecord, PerformanceMetric

# Import repository implementations
from src.data.repository import (
    SQLiteBacktestRepository, SQLiteSignalRepository, SQLiteMarketDataRepository
)


class TestFixtures:
    """Test data fixtures for backtest engine testing"""
    
    @staticmethod
    def create_sample_config(
        start_date: datetime = None,
        end_date: datetime = None,
        symbols: List[str] = None
    ) -> BacktestConfig:
        """Create sample backtest configuration"""
        start = start_date or datetime(2024, 1, 1)
        end = end_date or datetime(2024, 1, 15)
        syms = symbols or ["AAPL", "MSFT"]
        
        return BacktestConfig(
            start_date=start,
            end_date=end,
            initial_capital=Decimal('100000.00'),
            symbols=syms,
            benchmark_symbol="SPY",
            commission_per_trade=Decimal('1.00'),
            slippage_bps=5,
            max_positions=10,
            risk_free_rate=Decimal('0.02'),
            data_frequency="1D",
            enable_options=True,
            enable_signals=True,
            performance_update_frequency=5
        )
    
    @staticmethod
    def create_sample_ohlcv_bars(
        symbol: str,
        start_date: datetime,
        num_days: int = 15
    ) -> List[OHLCVBar]:
        """Create sample OHLCV bars for testing"""
        bars = []
        base_price = Decimal('150.00') if symbol == "AAPL" else Decimal('300.00')
        
        for i in range(num_days):
            date = start_date + timedelta(days=i)
            
            # Simple price simulation with trend
            trend = Decimal(str(i * 0.2))  # Slight upward trend
            noise = Decimal(str((i % 5 - 2) * 0.5))  # Random noise
            
            open_price = base_price + trend + noise
            high_price = open_price + Decimal('2.00')
            low_price = open_price - Decimal('1.50')
            close_price = open_price + Decimal(str((i % 3 - 1) * 0.75))
            volume = 1000000 + (i * 50000)
            
            bar = OHLCVBar(
                symbol=symbol,
                timestamp=date,
                open=open_price,
                high=high_price,
                low=low_price,
                close=close_price,
                volume=volume,
                adjusted_close=close_price
            )
            bars.append(bar)
        
        return bars


class MockStrategy:
    """Mock strategy for testing engine functionality"""
    
    def __init__(self, strategy_id: str):
        self.strategy_id = strategy_id
        self.state = StrategyState.CREATED
        self.initialization_called = False
        self.market_data_calls = 0
        self.cleanup_called = False
        self.orders_submitted = []
        self.signals_executed = []
        self.last_market_event = None
    
    async def initialize(self, context: StrategyContext) -> bool:
        """Initialize the strategy"""
        self.initialization_called = True
        self.state = StrategyState.RUNNING
        context.log_info(f"Mock strategy {self.strategy_id} initialized")
        return True
    
    async def on_market_data(self, context: StrategyContext, event: MarketEvent) -> None:
        """Handle market data event"""
        self.market_data_calls += 1
        self.last_market_event = event
        
        context.log_info(f"Processing market data event #{self.market_data_calls}")
        
        # Test context methods every few calls
        if self.market_data_calls % 3 == 0:
            try:
                # Test get_current_price
                for symbol in ["AAPL", "MSFT"]:
                    price = await context.get_current_price(symbol)
                    if price:
                        context.log_info(f"{symbol} current price: ${price}")
                
                # Test get_historical_data
                if self.market_data_calls == 3:
                    start_date = datetime(2024, 1, 1)
                    end_date = datetime(2024, 1, 5)
                    historical_data = await context.get_historical_data("AAPL", start_date, end_date)
                    context.log_info(f"Retrieved {len(historical_data)} historical bars")
                
                # Test order submission
                if self.market_data_calls == 6:
                    order_request = OrderRequest(
                        symbol="AAPL",
                        order_type=OrderType.MARKET,
                        side=OrderSide.BUY,
                        quantity=Decimal('100'),
                        price=None,
                        time_in_force="DAY",
                        metadata={"strategy_id": self.strategy_id}
                    )
                    
                    order_id = await context.submit_order(order_request)
                    self.orders_submitted.append(order_id)
                    context.log_info(f"Submitted order: {order_id}")
                    
            except Exception as e:
                context.log_error(f"Error in market data processing: {e}")
    
    async def cleanup(self, context: StrategyContext) -> None:
        """Cleanup strategy resources"""
        self.cleanup_called = True
        self.state = StrategyState.STOPPED
        context.log_info(f"Mock strategy {self.strategy_id} cleaned up")


@pytest.fixture
def sample_config():
    """Provide sample backtest configuration"""
    return TestFixtures.create_sample_config()


@pytest_asyncio.fixture
async def populated_market_data_repo():
    """Create market data repository with sample data"""
    repo = SQLiteMarketDataRepository(":memory:")
    
    # Add sample data for AAPL and MSFT
    start_date = datetime(2024, 1, 1)
    
    for symbol in ["AAPL", "MSFT"]:
        bars = TestFixtures.create_sample_ohlcv_bars(symbol, start_date, 15)
        await repo.store_ohlcv(symbol, bars, "test_source")
    
    return repo


@pytest_asyncio.fixture
async def backtest_engine(sample_config, populated_market_data_repo):
    """Create backtest engine with sample data"""
    backtest_repo = SQLiteBacktestRepository(":memory:")
    signal_repo = SQLiteSignalRepository(":memory:")
    
    engine = BacktestEngine(
        sample_config,
        backtest_repo,
        signal_repo,
        populated_market_data_repo
    )
    
    return engine


class TestBacktestConfig:
    """Test suite for BacktestConfig"""
    
    def test_config_creation(self):
        """Test backtest configuration creation"""
        config = TestFixtures.create_sample_config()
        
        assert config.start_date == datetime(2024, 1, 1)
        assert config.end_date == datetime(2024, 1, 15)
        assert config.initial_capital == Decimal('100000.00')
        assert config.symbols == ["AAPL", "MSFT"]
        assert config.enable_signals is True
        assert config.enable_options is True
        assert config.performance_update_frequency == 5
        
        print("✅ Successfully created backtest configuration")
    
    def test_config_customization(self):
        """Test backtest configuration with custom parameters"""
        custom_config = BacktestConfig(
            start_date=datetime(2023, 6, 1),
            end_date=datetime(2023, 6, 30),
            initial_capital=Decimal('250000.00'),
            symbols=["TSLA", "NVDA", "GOOGL"],
            commission_per_trade=Decimal('0.50'),
            slippage_bps=3,
            max_positions=15,
            enable_options=False,
            enable_signals=False
        )
        
        assert len(custom_config.symbols) == 3
        assert custom_config.commission_per_trade == Decimal('0.50')
        assert custom_config.enable_options is False
        assert custom_config.enable_signals is False
        
        print("✅ Successfully created custom backtest configuration")


class TestBacktestStrategyContext:
    """Test suite for BacktestStrategyContext"""
    
    @pytest.mark.asyncio
    async def test_context_creation(self, backtest_engine):
        """Test strategy context creation"""
        context = BacktestStrategyContext(backtest_engine, "test_strategy", "test_run")
        
        assert context.strategy_id == "test_strategy"
        assert context.run_id == "test_run"
        assert context.engine == backtest_engine
        
        print("✅ Successfully created strategy context")
    
    @pytest.mark.asyncio
    async def test_get_historical_data(self, backtest_engine):
        """Test historical data retrieval through context"""
        await backtest_engine._load_market_data()
        
        context = BacktestStrategyContext(backtest_engine, "test_strategy", "test_run")
        
        start_date = datetime(2024, 1, 1)
        end_date = datetime(2024, 1, 10)
        
        data = await context.get_historical_data("AAPL", start_date, end_date)
        
        assert isinstance(data, list)
        assert len(data) > 0
        assert all(hasattr(bar, 'symbol') and bar.symbol == "AAPL" for bar in data)
        assert all(hasattr(bar, 'timestamp') and hasattr(bar, 'close') for bar in data)
        
        print(f"✅ Successfully retrieved {len(data)} historical bars")
    
    @pytest.mark.asyncio
    async def test_get_current_price(self, backtest_engine):
        """Test current price retrieval through context"""
        await backtest_engine._load_market_data()
        backtest_engine._update_current_bars()
        
        context = BacktestStrategyContext(backtest_engine, "test_strategy", "test_run")
        
        price = await context.get_current_price("AAPL")
        
        assert price is not None
        assert isinstance(price, Decimal)
        assert price > 0
        
        print(f"✅ Successfully retrieved current price: ${price}")
    
    @pytest.mark.asyncio
    async def test_get_options_chain(self, backtest_engine):
        """Test options chain retrieval through context"""
        context = BacktestStrategyContext(backtest_engine, "test_strategy", "test_run")
        
        # This will return None since we don't have options data in our test setup
        options_chain = await context.get_options_chain("AAPL")
        
        # Should return None gracefully without errors
        assert options_chain is None
        
        print("✅ Successfully handled options chain request")
    
    @pytest.mark.asyncio
    async def test_submit_order(self, backtest_engine):
        """Test order submission through context"""
        context = BacktestStrategyContext(backtest_engine, "test_strategy", "test_run")
        
        order_request = OrderRequest(
            symbol="AAPL",
            order_type=OrderType.MARKET,
            side=OrderSide.BUY,
            quantity=Decimal('100'),
            price=None,
            time_in_force="DAY",
            metadata={"test": True}
        )
        
        order_id = await context.submit_order(order_request)
        
        assert order_id is not None
        assert isinstance(order_id, str)
        assert len(order_id) > 0
        
        print(f"✅ Successfully submitted order: {order_id}")


class TestBacktestEngine:
    """Test suite for BacktestEngine core functionality"""
    
    @pytest.mark.asyncio
    async def test_engine_creation(self, sample_config):
        """Test backtest engine creation"""
        engine = create_backtest_engine(sample_config)
        
        assert engine.config == sample_config
        assert isinstance(engine.backtest_repo, SQLiteBacktestRepository)
        assert isinstance(engine.signal_repo, SQLiteSignalRepository)
        assert isinstance(engine.market_data_repo, SQLiteMarketDataRepository)
        assert engine.state.current_time == sample_config.start_date
        assert engine.state.is_running is False
        assert len(engine.strategies) == 0
        
        print("✅ Successfully created backtest engine")
    
    @pytest.mark.asyncio
    async def test_add_strategy(self, backtest_engine):
        """Test adding strategy to engine"""
        strategy = MockStrategy("test_strategy_1")
        
        result = await backtest_engine.add_strategy(strategy, "test_strategy_1")
        
        assert result is True
        assert "test_strategy_1" in backtest_engine.strategies
        assert "test_strategy_1" in backtest_engine.strategy_contexts
        assert "test_strategy_1" in backtest_engine.strategy_portfolios
        
        # Verify portfolio initialization
        portfolio = backtest_engine.strategy_portfolios["test_strategy_1"]
        assert portfolio.cash == backtest_engine.config.initial_capital
        assert portfolio.total_value == backtest_engine.config.initial_capital
        assert portfolio.unrealized_pnl == Decimal('0')
        assert portfolio.realized_pnl == Decimal('0')
        
        # Verify context creation
        context = backtest_engine.strategy_contexts["test_strategy_1"]
        assert isinstance(context, BacktestStrategyContext)
        assert context.strategy_id == "test_strategy_1"
        assert context.run_id == backtest_engine.run_id
        
        print("✅ Successfully added strategy to engine")
    
    @pytest.mark.asyncio
    async def test_duplicate_strategy_prevention(self, backtest_engine):
        """Test that adding duplicate strategy fails"""
        strategy1 = MockStrategy("duplicate_test")
        strategy2 = MockStrategy("duplicate_test")
        
        result1 = await backtest_engine.add_strategy(strategy1, "duplicate_test")
        assert result1 is True
        
        result2 = await backtest_engine.add_strategy(strategy2, "duplicate_test")
        assert result2 is False
        
        # Verify only first strategy exists
        assert len(backtest_engine.strategies) == 1
        assert backtest_engine.strategies["duplicate_test"] == strategy1
        
        print("✅ Successfully prevented duplicate strategy addition")
    
    @pytest.mark.asyncio
    async def test_market_data_loading(self, backtest_engine):
        """Test market data loading"""
        await backtest_engine._load_market_data()
        
        assert len(backtest_engine._market_data_cache) == 2  # AAPL and MSFT
        assert backtest_engine.state.total_bars == 15  # 15 days of data
        
        for symbol in ["AAPL", "MSFT"]:
            assert symbol in backtest_engine._market_data_cache
            bars = backtest_engine._market_data_cache[symbol]
            assert len(bars) == 15
            assert all(hasattr(bar, 'symbol') and bar.symbol == symbol for bar in bars)
            assert all(hasattr(bar, 'timestamp') and hasattr(bar, 'close') for bar in bars)
        
        print(f"✅ Successfully loaded market data for {len(backtest_engine._market_data_cache)} symbols")
    
    @pytest.mark.asyncio
    async def test_backtest_run_creation(self, backtest_engine):
        """Test backtest run record creation"""
        await backtest_engine._create_backtest_run()
        
        # Verify run was created in repository
        runs = await backtest_engine.backtest_repo.get_backtest_runs()
        assert len(runs) == 1
        
        created_run = runs[0]
        assert created_run.run_id == backtest_engine.run_id
        assert created_run.status == "running"
        assert created_run.initial_capital == backtest_engine.config.initial_capital
        assert created_run.start_date == backtest_engine.config.start_date
        assert created_run.end_date == backtest_engine.config.end_date
        assert "symbols" in created_run.parameters
        assert "engine_version" in created_run.metadata
        
        print(f"✅ Successfully created backtest run: {created_run.run_id}")
    
    @pytest.mark.asyncio
    async def test_strategy_initialization(self, backtest_engine):
        """Test strategy initialization process"""
        # Add strategies
        strategy1 = MockStrategy("init_test_1")
        strategy2 = MockStrategy("init_test_2")
        
        await backtest_engine.add_strategy(strategy1, "init_test_1")
        await backtest_engine.add_strategy(strategy2, "init_test_2")
        
        # Load market data first
        await backtest_engine._load_market_data()
        
        # Initialize strategies
        await backtest_engine._initialize_strategies()
        
        # Verify both strategies were initialized
        assert strategy1.initialization_called is True
        assert strategy1.state == StrategyState.RUNNING
        assert strategy2.initialization_called is True
        assert strategy2.state == StrategyState.RUNNING
        
        print("✅ Successfully initialized strategies")
    
    @pytest.mark.asyncio
    async def test_time_step_processing(self, backtest_engine):
        """Test single time step processing"""
        # Setup
        strategy = MockStrategy("timestep_test")
        await backtest_engine.add_strategy(strategy, "timestep_test")
        await backtest_engine._load_market_data()
        await backtest_engine._initialize_strategies()
        
        initial_calls = strategy.market_data_calls
        
        # Process one time step
        await backtest_engine._process_time_step()
        
        # Verify strategy was called
        assert strategy.market_data_calls == initial_calls + 1
        
        # Verify current bars were updated
        assert len(backtest_engine._current_bars) > 0
        assert "AAPL" in backtest_engine._current_bars
        assert "MSFT" in backtest_engine._current_bars
        
        # Verify market event was passed correctly
        assert strategy.last_market_event is not None
        assert strategy.last_market_event.event_type == MarketEventType.BAR_UPDATE
        assert strategy.last_market_event.timestamp == backtest_engine.state.current_time
        
        print("✅ Successfully processed time step")
    
    @pytest.mark.asyncio
    async def test_full_initialization_process(self, backtest_engine):
        """Test complete engine initialization"""
        # Add a strategy
        strategy = MockStrategy("full_init_test")
        await backtest_engine.add_strategy(strategy, "full_init_test")
        
        # Initialize engine
        result = await backtest_engine.initialize()
        
        assert result is True
        assert backtest_engine.state.strategies_initialized is True
        assert strategy.initialization_called is True
        assert strategy.state == StrategyState.RUNNING
        
        # Verify market data was loaded
        assert len(backtest_engine._market_data_cache) > 0
        assert backtest_engine.state.total_bars > 0
        
        # Verify backtest run was created
        runs = await backtest_engine.backtest_repo.get_backtest_runs()
        assert len(runs) == 1
        assert runs[0].status == "running"
        
        print("✅ Successfully completed full initialization process")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
