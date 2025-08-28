"""
Simple Backtest Engine Test - Options Trading Backtest Engine

Basic test to validate the backtest engine implementation without complex imports.
"""

import pytest
import pytest_asyncio
import asyncio
import sys
import os
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional, Dict, Any
import uuid

# Add path for imports
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Import the implementation to test
from src.engine.backtest import (
    BacktestEngine, BacktestConfig, BacktestState, StrategyContextImpl,
    create_backtest_engine, OHLCVBar, BacktestRun, SignalRecord,
    Strategy, StrategyContext, StrategyState, MarketEvent, MarketEventType,
    OrderRequest, OrderType, OrderSide, Position, Portfolio, PerformanceMetrics
)

# Import repository implementations
from src.data.repository import (
    SQLiteBacktestRepository, SQLiteSignalRepository, SQLiteMarketDataRepository
)


class TestFixtures:
    """Test data fixtures for backtest engine testing"""
    
    @staticmethod
    def create_sample_config() -> BacktestConfig:
        """Create sample backtest configuration"""
        return BacktestConfig(
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 10),
            initial_capital=Decimal('100000.00'),
            symbols=["AAPL", "MSFT"],
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
    def create_sample_ohlcv_bars(symbol: str, num_days: int = 10) -> List[OHLCVBar]:
        """Create sample OHLCV bars for testing"""
        bars = []
        base_price = Decimal('150.00')
        start_date = datetime(2024, 1, 1)
        
        for i in range(num_days):
            date = start_date + timedelta(days=i)
            
            # Simple price simulation
            price_change = Decimal(str((i % 5 - 2) * 0.5))  # -1.0 to +1.5
            open_price = base_price + price_change
            high_price = open_price + Decimal('1.50')
            low_price = open_price - Decimal('1.00')
            close_price = open_price + Decimal(str((i % 3 - 1) * 0.25))
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
    """Mock strategy for testing"""
    
    def __init__(self, strategy_id: str):
        self.strategy_id = strategy_id
        self.state = StrategyState.CREATED
        self.initialization_called = False
        self.market_data_calls = 0
        self.cleanup_called = False
        self.orders_submitted = []
    
    async def initialize(self, context: StrategyContext) -> bool:
        """Initialize the strategy"""
        self.initialization_called = True
        self.state = StrategyState.RUNNING
        context.log_info(f"Mock strategy {self.strategy_id} initialized")
        return True
    
    async def on_market_data(self, context: StrategyContext, event: MarketEvent) -> None:
        """Handle market data event"""
        self.market_data_calls += 1
        context.log_info(f"Processing market data event {self.market_data_calls}")
        
        # Simple test: submit an order every 3 calls
        if self.market_data_calls % 3 == 0:
            try:
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
                context.log_error(f"Error submitting order: {e}")
    
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
    for symbol in ["AAPL", "MSFT"]:
        bars = TestFixtures.create_sample_ohlcv_bars(symbol, 10)
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
        assert config.end_date == datetime(2024, 1, 10)
        assert config.initial_capital == Decimal('100000.00')
        assert config.symbols == ["AAPL", "MSFT"]
        assert config.enable_signals is True
        assert config.enable_options is True
        assert config.performance_update_frequency == 5
        
        print("✅ Successfully created backtest configuration")


class TestBacktestEngine:
    """Test suite for BacktestEngine"""
    
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
        
        print("✅ Successfully added strategy to engine")
    
    @pytest.mark.asyncio
    async def test_duplicate_strategy_fails(self, backtest_engine):
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
        assert backtest_engine.state.total_bars == 10  # 10 days of data
        
        for symbol in ["AAPL", "MSFT"]:
            assert symbol in backtest_engine._market_data_cache
            bars = backtest_engine._market_data_cache[symbol]
            assert len(bars) == 10
            assert all(hasattr(bar, 'symbol') and hasattr(bar, 'timestamp') and hasattr(bar, 'close') for bar in bars)
            assert all(bar.symbol == symbol for bar in bars)
        
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
        
        # Verify bars have correct data
        aapl_bar = backtest_engine._current_bars["AAPL"]
        assert hasattr(aapl_bar, 'symbol') and hasattr(aapl_bar, 'timestamp') and hasattr(aapl_bar, 'close')
        assert aapl_bar.symbol == "AAPL"
        
        print("✅ Successfully processed time step")
    
    @pytest.mark.asyncio
    async def test_strategy_context_functionality(self, backtest_engine):
        """Test strategy context methods"""
        # Setup
        await backtest_engine._load_market_data()
        backtest_engine._update_current_bars()
        
        context = StrategyContextImpl(backtest_engine, "test_strategy", "test_run")
        
        # Test get_current_price
        current_price = await context.get_current_price("AAPL")
        assert current_price is not None
        assert isinstance(current_price, Decimal)
        assert current_price > 0
        
        # Test get_historical_data
        start_date = datetime(2024, 1, 1)
        end_date = datetime(2024, 1, 5)
        historical_data = await context.get_historical_data("AAPL", start_date, end_date)
        
        assert isinstance(historical_data, list)
        assert len(historical_data) > 0
        assert all(hasattr(bar, 'symbol') and hasattr(bar, 'timestamp') and hasattr(bar, 'close') for bar in historical_data)
        assert all(bar.symbol == "AAPL" for bar in historical_data)
        
        # Test get_portfolio (need to add strategy first)
        await backtest_engine.add_strategy(MockStrategy("test_strategy"), "test_strategy")
        portfolio = await context.get_portfolio()
        assert isinstance(portfolio, Portfolio)
        # The context strategy doesn't exist in portfolios, so it returns default empty portfolio
        # This is expected behavior for this test setup
        
        print("✅ Successfully tested strategy context functionality")
    
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
