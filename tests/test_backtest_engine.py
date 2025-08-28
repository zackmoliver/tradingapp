"""
Comprehensive Test Suite for BacktestEngine - Options Trading Backtest Engine

Production-grade tests for the BacktestEngine class covering all core capabilities:
- Engine initialization and configuration
- Strategy lifecycle management
- Market data flow and processing
- Order management and portfolio updates
- Error handling and resilience
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

# Import repository implementations
from src.data.repository import (
    SQLiteBacktestRepository, SQLiteSignalRepository, SQLiteMarketDataRepository
)

# Import data types
from data.provider import OHLCVBar


class TestFixtures:
    """Test data fixtures and utilities"""

    @staticmethod
    def create_test_config(
        start_date: datetime = None,
        end_date: datetime = None,
        symbols: List[str] = None,
        **kwargs
    ) -> BacktestConfig:
        """Create test backtest configuration"""
        start = start_date or datetime(2024, 1, 1)
        end = end_date or datetime(2024, 1, 10)
        syms = symbols or ["AAPL", "MSFT"]

        defaults = {
            'initial_capital': Decimal('100000.00'),
            'commission_per_trade': Decimal('1.00'),
            'slippage_bps': 5,
            'max_positions': 10,
            'enable_options': True,
            'enable_signals': True,
            'performance_update_frequency': 5
        }
        defaults.update(kwargs)

        return BacktestConfig(
            start_date=start,
            end_date=end,
            symbols=syms,
            **defaults
        )

    @staticmethod
    def create_test_bars(symbol: str, num_days: int = 10, start_date: datetime = None) -> List[OHLCVBar]:
        """Create test OHLCV bars"""
        start = start_date or datetime(2024, 1, 1)
        base_price = Decimal('150.00') if symbol == "AAPL" else Decimal('300.00')
        bars = []

        for i in range(num_days):
            date = start + timedelta(days=i)
            price_change = Decimal(str((i % 5 - 2) * 0.5))  # -1.0 to +1.5

            open_price = base_price + price_change
            high_price = open_price + Decimal('2.00')
            low_price = open_price - Decimal('1.50')
            close_price = open_price + Decimal(str((i % 3 - 1) * 0.25))

            bar = OHLCVBar(
                symbol=symbol,
                timestamp=date,
                open=open_price,
                high=high_price,
                low=low_price,
                close=close_price,
                volume=1000000 + (i * 50000),
                adjusted_close=close_price
            )
            bars.append(bar)

        return bars


class MockStrategy:
    """Mock strategy for testing engine functionality"""

    def __init__(self, strategy_id: str, should_fail: bool = False):
        self.strategy_id = strategy_id
        self.should_fail = should_fail

        # Tracking attributes
        self.initialization_called = False
        self.initialization_success = True
        self.market_data_calls = 0
        self.cleanup_called = False
        self.orders_submitted = []
        self.context_calls = {}
        self.last_event = None

        # Behavior control
        self.fail_on_init = False
        self.fail_on_market_data = False
        self.fail_on_cleanup = False

    async def initialize(self, context) -> bool:
        """Initialize strategy with optional failure simulation"""
        self.initialization_called = True

        if self.fail_on_init or self.should_fail:
            self.initialization_success = False
            raise Exception(f"Mock strategy {self.strategy_id} initialization failed")

        context.log_info(f"Strategy {self.strategy_id} initialized successfully")
        return True

    async def on_market_data(self, context, event) -> None:
        """Process market data with comprehensive testing"""
        self.market_data_calls += 1
        self.last_event = event

        if self.fail_on_market_data:
            raise Exception(f"Mock strategy {self.strategy_id} market data processing failed")

        # Test context methods
        try:
            # Test get_current_price
            for symbol in ["AAPL", "MSFT"]:
                price = await context.get_current_price(symbol)
                self.context_calls[f"get_current_price_{symbol}"] = price

            # Test get_historical_data every few calls
            if self.market_data_calls % 3 == 0:
                start_date = datetime(2024, 1, 1)
                end_date = datetime(2024, 1, 5)
                historical_data = await context.get_historical_data("AAPL", start_date, end_date)
                self.context_calls["get_historical_data"] = len(historical_data)

            # Test order submission
            if self.market_data_calls == 5:
                # Create a simple order request without complex imports
                order_id = await context.submit_order(None)  # Simplified for testing
                self.orders_submitted.append(order_id)

            # Test portfolio access
            portfolio = await context.get_portfolio()
            self.context_calls["portfolio_value"] = portfolio.total_value

        except Exception as e:
            context.log_error(f"Error in context method testing: {e}")

    async def cleanup(self, context) -> None:
        """Cleanup with optional failure simulation"""
        self.cleanup_called = True

        if self.fail_on_cleanup:
            raise Exception(f"Mock strategy {self.strategy_id} cleanup failed")

        context.log_info(f"Strategy {self.strategy_id} cleaned up")


@pytest.fixture
def test_config():
    """Standard test configuration"""
    return TestFixtures.create_test_config()


@pytest_asyncio.fixture
async def market_data_repo():
    """Market data repository with test data"""
    repo = SQLiteMarketDataRepository(":memory:")

    # Load test data
    start_date = datetime(2024, 1, 1)
    for symbol in ["AAPL", "MSFT"]:
        bars = TestFixtures.create_test_bars(symbol, 10, start_date)
        await repo.store_ohlcv(symbol, bars, "test_source")

    return repo


@pytest_asyncio.fixture
async def backtest_engine(test_config, market_data_repo):
    """Backtest engine with test data"""
    backtest_repo = SQLiteBacktestRepository(":memory:")
    signal_repo = SQLiteSignalRepository(":memory:")

    return BacktestEngine(test_config, backtest_repo, signal_repo, market_data_repo)


class TestBacktestEngineInitialization:
    """Test engine initialization and configuration"""

    @pytest.mark.asyncio
    async def test_engine_creation_with_default_config(self, test_config):
        """Test engine creation with standard configuration"""
        engine = create_backtest_engine(test_config)

        assert engine.config == test_config
        assert engine.state.current_time == test_config.start_date
        assert engine.state.is_running is False
        assert engine.state.strategies_initialized is False
        assert len(engine.strategies) == 0
        assert len(engine.strategy_contexts) == 0
        assert len(engine.strategy_portfolios) == 0

        print("✅ Engine created successfully with default configuration")

    @pytest.mark.asyncio
    async def test_engine_creation_with_custom_config(self):
        """Test engine creation with custom configuration"""
        custom_config = TestFixtures.create_test_config(
            symbols=["TSLA", "NVDA", "GOOGL"],
            initial_capital=Decimal('250000.00'),
            commission_per_trade=Decimal('0.50'),
            enable_options=False,
            enable_signals=False
        )

        engine = create_backtest_engine(custom_config)

        assert len(engine.config.symbols) == 3
        assert engine.config.initial_capital == Decimal('250000.00')
        assert engine.config.commission_per_trade == Decimal('0.50')
        assert engine.config.enable_options is False
        assert engine.config.enable_signals is False

        print("✅ Engine created successfully with custom configuration")

    @pytest.mark.asyncio
    async def test_market_data_loading(self, backtest_engine):
        """Test market data loading process"""
        await backtest_engine._load_market_data()

        assert len(backtest_engine._market_data_cache) == 2
        assert "AAPL" in backtest_engine._market_data_cache
        assert "MSFT" in backtest_engine._market_data_cache
        assert backtest_engine.state.total_bars == 10

        # Verify data integrity
        aapl_bars = backtest_engine._market_data_cache["AAPL"]
        assert len(aapl_bars) == 10
        assert all(bar.symbol == "AAPL" for bar in aapl_bars)
        assert all(hasattr(bar, 'close') and bar.close > 0 for bar in aapl_bars)

        print("✅ Market data loaded and validated successfully")

    @pytest.mark.asyncio
    async def test_backtest_run_creation(self, backtest_engine):
        """Test backtest run record creation"""
        await backtest_engine._create_backtest_run()

        runs = await backtest_engine.backtest_repo.get_backtest_runs()
        assert len(runs) == 1

        run = runs[0]
        assert run.run_id == backtest_engine.run_id
        assert run.status == "running"
        assert run.initial_capital == backtest_engine.config.initial_capital
        assert run.start_date == backtest_engine.config.start_date
        assert run.end_date == backtest_engine.config.end_date
        assert "symbols" in run.parameters
        assert "engine_version" in run.metadata

        print("✅ Backtest run record created successfully")


class TestStrategyLifecycle:
    """Test strategy lifecycle management"""

    @pytest.mark.asyncio
    async def test_add_single_strategy(self, backtest_engine):
        """Test adding a single strategy"""
        strategy = MockStrategy("test_strategy")

        result = await backtest_engine.add_strategy(strategy, "test_strategy")

        assert result is True
        assert "test_strategy" in backtest_engine.strategies
        assert "test_strategy" in backtest_engine.strategy_contexts
        assert "test_strategy" in backtest_engine.strategy_portfolios

        # Verify context creation
        context = backtest_engine.strategy_contexts["test_strategy"]
        assert context.strategy_id == "test_strategy"
        assert context.run_id == backtest_engine.run_id

        # Verify portfolio initialization
        portfolio = backtest_engine.strategy_portfolios["test_strategy"]
        assert portfolio.cash == backtest_engine.config.initial_capital
        assert portfolio.total_value == backtest_engine.config.initial_capital

        print("✅ Single strategy added successfully")

    @pytest.mark.asyncio
    async def test_add_multiple_strategies(self, backtest_engine):
        """Test adding multiple strategies"""
        strategies = [
            MockStrategy("strategy_1"),
            MockStrategy("strategy_2"),
            MockStrategy("strategy_3")
        ]

        for i, strategy in enumerate(strategies):
            result = await backtest_engine.add_strategy(strategy, f"strategy_{i+1}")
            assert result is True

        assert len(backtest_engine.strategies) == 3
        assert len(backtest_engine.strategy_contexts) == 3
        assert len(backtest_engine.strategy_portfolios) == 3

        # Verify each strategy has independent portfolio
        for i in range(1, 4):
            portfolio = backtest_engine.strategy_portfolios[f"strategy_{i}"]
            assert portfolio.cash == backtest_engine.config.initial_capital

        print("✅ Multiple strategies added successfully")

    @pytest.mark.asyncio
    async def test_duplicate_strategy_prevention(self, backtest_engine):
        """Test prevention of duplicate strategy IDs"""
        strategy1 = MockStrategy("duplicate_test")
        strategy2 = MockStrategy("duplicate_test")

        result1 = await backtest_engine.add_strategy(strategy1, "duplicate_test")
        result2 = await backtest_engine.add_strategy(strategy2, "duplicate_test")

        assert result1 is True
        assert result2 is False
        assert len(backtest_engine.strategies) == 1
        assert backtest_engine.strategies["duplicate_test"] == strategy1

        print("✅ Duplicate strategy prevention working correctly")

    @pytest.mark.asyncio
    async def test_strategy_initialization_success(self, backtest_engine):
        """Test successful strategy initialization"""
        strategy = MockStrategy("init_success_test")
        await backtest_engine.add_strategy(strategy, "init_success_test")
        await backtest_engine._load_market_data()

        await backtest_engine._initialize_strategies()

        assert strategy.initialization_called is True
        assert strategy.initialization_success is True
        assert backtest_engine.state.strategies_initialized is True

        print("✅ Strategy initialization completed successfully")

    @pytest.mark.asyncio
    async def test_strategy_initialization_failure(self, backtest_engine):
        """Test handling of strategy initialization failure"""
        strategy = MockStrategy("init_fail_test")
        strategy.fail_on_init = True

        await backtest_engine.add_strategy(strategy, "init_fail_test")
        await backtest_engine._load_market_data()

        with pytest.raises(Exception) as exc_info:
            await backtest_engine._initialize_strategies()

        assert "initialization failed" in str(exc_info.value)
        assert strategy.initialization_called is True
        assert strategy.initialization_success is False

        print("✅ Strategy initialization failure handled correctly")


class TestMarketDataFlow:
    """Test market data processing and flow"""

    @pytest.mark.asyncio
    async def test_current_bar_updates(self, backtest_engine):
        """Test current bar updates during time steps"""
        await backtest_engine._load_market_data()

        # Initially no current bars
        assert len(backtest_engine._current_bars) == 0

        # Update current bars
        backtest_engine._update_current_bars()

        assert len(backtest_engine._current_bars) == 2
        assert "AAPL" in backtest_engine._current_bars
        assert "MSFT" in backtest_engine._current_bars

        # Verify bar data
        aapl_bar = backtest_engine._current_bars["AAPL"]
        assert aapl_bar.symbol == "AAPL"
        assert aapl_bar.timestamp == datetime(2024, 1, 1)

        print("✅ Current bar updates working correctly")

    @pytest.mark.asyncio
    async def test_time_advancement(self, backtest_engine):
        """Test time advancement through market data"""
        await backtest_engine._load_market_data()

        initial_time = backtest_engine.state.current_time
        initial_index = backtest_engine.state.current_bar_index

        backtest_engine._advance_time()

        assert backtest_engine.state.current_bar_index == initial_index + 1
        assert backtest_engine.state.current_time > initial_time

        print("✅ Time advancement working correctly")

    @pytest.mark.asyncio
    async def test_market_event_distribution(self, backtest_engine):
        """Test market event distribution to strategies"""
        strategy1 = MockStrategy("event_test_1")
        strategy2 = MockStrategy("event_test_2")

        await backtest_engine.add_strategy(strategy1, "event_test_1")
        await backtest_engine.add_strategy(strategy2, "event_test_2")
        await backtest_engine._load_market_data()
        await backtest_engine._initialize_strategies()

        # Process one time step
        await backtest_engine._process_time_step()

        # Verify both strategies received the event
        assert strategy1.market_data_calls == 1
        assert strategy2.market_data_calls == 1
        assert strategy1.last_event is not None
        assert strategy2.last_event is not None

        # Verify event data
        event = strategy1.last_event
        assert hasattr(event, 'event_type')
        assert hasattr(event, 'timestamp')
        assert hasattr(event, 'data')

        print("✅ Market event distribution working correctly")

    @pytest.mark.asyncio
    async def test_strategy_context_data_access(self, backtest_engine):
        """Test strategy context data access methods"""
        strategy = MockStrategy("context_test")
        await backtest_engine.add_strategy(strategy, "context_test")
        await backtest_engine._load_market_data()
        await backtest_engine._initialize_strategies()

        # Process several time steps to trigger context method calls
        for _ in range(6):
            await backtest_engine._process_time_step()
            backtest_engine._advance_time()

        # Verify context methods were called and returned data
        assert "get_current_price_AAPL" in strategy.context_calls
        assert "get_current_price_MSFT" in strategy.context_calls
        assert "get_historical_data" in strategy.context_calls
        assert "portfolio_value" in strategy.context_calls

        # Verify data validity
        assert strategy.context_calls["get_current_price_AAPL"] > 0
        assert strategy.context_calls["get_current_price_MSFT"] > 0
        assert strategy.context_calls["get_historical_data"] > 0
        assert strategy.context_calls["portfolio_value"] == backtest_engine.config.initial_capital

        print("✅ Strategy context data access working correctly")


class TestOrderManagement:
    """Test order management and portfolio updates"""

    @pytest.mark.asyncio
    async def test_order_submission(self, backtest_engine):
        """Test order submission through strategy context"""
        strategy = MockStrategy("order_test")
        await backtest_engine.add_strategy(strategy, "order_test")
        await backtest_engine._load_market_data()
        await backtest_engine._initialize_strategies()

        # Process enough time steps to trigger order submission
        for _ in range(6):
            await backtest_engine._process_time_step()
            backtest_engine._advance_time()

        # Verify order was submitted
        assert len(strategy.orders_submitted) == 1
        assert isinstance(strategy.orders_submitted[0], str)
        assert len(strategy.orders_submitted[0]) > 0

        print("✅ Order submission working correctly")

    @pytest.mark.asyncio
    async def test_portfolio_state_tracking(self, backtest_engine):
        """Test portfolio state tracking"""
        strategy = MockStrategy("portfolio_test")
        await backtest_engine.add_strategy(strategy, "portfolio_test")

        # Get initial portfolio
        portfolio = backtest_engine._get_strategy_portfolio("portfolio_test")

        assert portfolio.cash == backtest_engine.config.initial_capital
        assert portfolio.total_value == backtest_engine.config.initial_capital
        assert portfolio.unrealized_pnl == Decimal('0')
        assert portfolio.realized_pnl == Decimal('0')
        assert len(portfolio.positions) == 0

        print("✅ Portfolio state tracking working correctly")


class TestErrorHandling:
    """Test error handling and resilience"""

    @pytest.mark.asyncio
    async def test_strategy_market_data_error_isolation(self, backtest_engine):
        """Test that strategy errors don't crash the engine"""
        good_strategy = MockStrategy("good_strategy")
        bad_strategy = MockStrategy("bad_strategy")
        bad_strategy.fail_on_market_data = True

        await backtest_engine.add_strategy(good_strategy, "good_strategy")
        await backtest_engine.add_strategy(bad_strategy, "bad_strategy")
        await backtest_engine._load_market_data()
        await backtest_engine._initialize_strategies()

        # Process time step - bad strategy should fail but engine should continue
        await backtest_engine._process_time_step()

        # Good strategy should still work
        assert good_strategy.market_data_calls == 1
        # Bad strategy should have been called but failed
        assert bad_strategy.market_data_calls == 1

        print("✅ Strategy error isolation working correctly")

    @pytest.mark.asyncio
    async def test_missing_market_data_handling(self, test_config):
        """Test handling of missing market data"""
        # Create engine with empty market data repo
        empty_repo = SQLiteMarketDataRepository(":memory:")
        backtest_repo = SQLiteBacktestRepository(":memory:")
        signal_repo = SQLiteSignalRepository(":memory:")

        engine = BacktestEngine(test_config, backtest_repo, signal_repo, empty_repo)

        # Load market data should complete without error
        await engine._load_market_data()

        assert len(engine._market_data_cache) == 0
        assert engine.state.total_bars == 0

        print("✅ Missing market data handled gracefully")

    @pytest.mark.asyncio
    async def test_cleanup_with_strategy_errors(self, backtest_engine):
        """Test cleanup continues even if strategies fail"""
        good_strategy = MockStrategy("good_cleanup")
        bad_strategy = MockStrategy("bad_cleanup")
        bad_strategy.fail_on_cleanup = True

        await backtest_engine.add_strategy(good_strategy, "good_cleanup")
        await backtest_engine.add_strategy(bad_strategy, "bad_cleanup")
        await backtest_engine._load_market_data()
        await backtest_engine._initialize_strategies()

        # Finalize should complete despite bad strategy cleanup failure
        await backtest_engine._finalize_backtest()

        assert good_strategy.cleanup_called is True
        assert bad_strategy.cleanup_called is True

        print("✅ Cleanup error handling working correctly")


class TestFullBacktestExecution:
    """Test complete backtest execution"""

    @pytest.mark.asyncio
    async def test_complete_backtest_run(self, backtest_engine):
        """Test complete backtest execution from start to finish"""
        strategy = MockStrategy("full_test")
        await backtest_engine.add_strategy(strategy, "full_test")

        # Run complete backtest
        result = await backtest_engine.run()

        assert result is True
        assert strategy.initialization_called is True
        assert strategy.market_data_calls > 0
        assert strategy.cleanup_called is True
        assert backtest_engine.state.is_running is False

        # Verify backtest run was completed
        runs = await backtest_engine.backtest_repo.get_backtest_runs()
        assert len(runs) == 1
        assert runs[0].status == "completed"
        assert runs[0].completed_at is not None

        print("✅ Complete backtest execution successful")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
