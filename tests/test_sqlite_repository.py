"""
Test Suite for SQLite Repository Implementation - Options Trading Backtest Engine

Comprehensive tests for all repository implementations including error conditions,
data integrity, and performance validation.
"""

import pytest
import pytest_asyncio
import tempfile
import os
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List
from dataclasses import replace
import uuid

# Import the implementations to test
from src.data.repository import (
    SQLiteBacktestRepository, SQLiteSignalRepository, SQLiteMarketDataRepository,
    InMemoryCacheManager, create_sqlite_repositories
)

# Import data types and exceptions from the contracts
from data.repository import (
    BacktestRun, StrategyConfiguration, SignalRecord, PerformanceMetrics,
    RepositoryError, ValidationError, ConnectionError, DataIntegrityError
)
from data.provider import OHLCVBar, OptionContract, OptionsChain


class TestFixtures:
    """Test data fixtures for repository testing"""
    
    @staticmethod
    def create_sample_backtest_run(run_id: str = None) -> BacktestRun:
        """Create a sample backtest run for testing"""
        return BacktestRun(
            run_id=run_id or str(uuid.uuid4()),
            strategy_id="test_strategy_001",
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 12, 31),
            initial_capital=Decimal('100000.00'),
            final_capital=Decimal('125000.00'),
            total_return=Decimal('0.25'),
            max_drawdown=Decimal('0.08'),
            sharpe_ratio=Decimal('1.45'),
            created_at=datetime.now(),
            completed_at=datetime.now(),
            status="completed",
            parameters={
                "lookback_period": 20,
                "risk_threshold": 0.02,
                "position_size": 0.05
            },
            metadata={
                "data_source": "yahoo_finance",
                "universe": ["AAPL", "MSFT", "GOOGL"],
                "benchmark": "SPY"
            }
        )
    
    @staticmethod
    def create_sample_signal_record(signal_id: str = None) -> SignalRecord:
        """Create a sample signal record for testing"""
        return SignalRecord(
            signal_id=signal_id or str(uuid.uuid4()),
            strategy_id="test_strategy_001",
            run_id="test_run_001",
            symbol="AAPL",
            signal_type="buy",
            strength="strong",
            confidence=Decimal('0.85'),
            timestamp=datetime.now(),
            price=Decimal('150.50'),
            quantity=Decimal('100'),
            metadata={
                "indicator": "rsi_oversold",
                "rsi_value": 25.5,
                "volume_spike": True
            },
            processed=False
        )
    
    @staticmethod
    def create_sample_performance_metrics(metrics_id: str = None) -> PerformanceMetrics:
        """Create sample performance metrics for testing"""
        return PerformanceMetrics(
            metrics_id=metrics_id or str(uuid.uuid4()),
            run_id="test_run_001",
            timestamp=datetime.now(),
            portfolio_value=Decimal('105000.00'),
            cash=Decimal('25000.00'),
            positions_value=Decimal('80000.00'),
            unrealized_pnl=Decimal('5000.00'),
            realized_pnl=Decimal('2500.00'),
            drawdown=Decimal('0.03'),
            metrics={
                "sharpe_ratio": 1.25,
                "volatility": 0.18,
                "beta": 1.05
            }
        )
    
    @staticmethod
    def create_sample_ohlcv_bars(symbol: str = "AAPL", count: int = 5) -> List[OHLCVBar]:
        """Create sample OHLCV bars for testing"""
        bars = []
        base_date = datetime(2024, 1, 1)
        base_price = Decimal('150.00')
        
        for i in range(count):
            bars.append(OHLCVBar(
                symbol=symbol,
                timestamp=base_date + timedelta(days=i),
                open=base_price + Decimal(str(i * 0.5)),
                high=base_price + Decimal(str(i * 0.5 + 2.0)),
                low=base_price + Decimal(str(i * 0.5 - 1.0)),
                close=base_price + Decimal(str(i * 0.5 + 1.0)),
                volume=1000000 + i * 50000,
                adjusted_close=base_price + Decimal(str(i * 0.5 + 0.95))
            ))
        
        return bars
    
    @staticmethod
    def create_sample_options_chain(underlying: str = "AAPL") -> OptionsChain:
        """Create sample options chain for testing"""
        contracts = [
            OptionContract(
                symbol=f"{underlying}240315C00150000",
                underlying=underlying,
                expiration=datetime(2024, 3, 15),
                strike=Decimal('150.00'),
                option_type="call",
                bid=Decimal('5.20'),
                ask=Decimal('5.40'),
                last=Decimal('5.30'),
                volume=1250,
                open_interest=5000,
                implied_volatility=Decimal('0.25'),
                delta=Decimal('0.55'),
                gamma=Decimal('0.03'),
                theta=Decimal('-0.08'),
                vega=Decimal('0.12'),
                rho=Decimal('0.05')
            ),
            OptionContract(
                symbol=f"{underlying}240315P00150000",
                underlying=underlying,
                expiration=datetime(2024, 3, 15),
                strike=Decimal('150.00'),
                option_type="put",
                bid=Decimal('4.80'),
                ask=Decimal('5.00'),
                last=Decimal('4.90'),
                volume=800,
                open_interest=3200,
                implied_volatility=Decimal('0.28'),
                delta=Decimal('-0.45'),
                gamma=Decimal('0.03'),
                theta=Decimal('-0.07'),
                vega=Decimal('0.12'),
                rho=Decimal('-0.04')
            )
        ]
        
        return OptionsChain(
            underlying=underlying,
            timestamp=datetime.now(),
            underlying_price=Decimal('151.25'),
            contracts=contracts
        )


@pytest.fixture
def temp_db_path():
    """Create temporary database file for testing"""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp_file:
        db_path = tmp_file.name

    yield db_path

    # Cleanup
    if os.path.exists(db_path):
        os.unlink(db_path)


@pytest.fixture
def memory_db_path():
    """Use in-memory database for faster tests"""
    return ":memory:"


@pytest.fixture
def backtest_repository(memory_db_path):
    """Create backtest repository instance for testing"""
    return SQLiteBacktestRepository(memory_db_path)


@pytest.fixture
def signal_repository(memory_db_path):
    """Create signal repository instance for testing"""
    return SQLiteSignalRepository(memory_db_path)


@pytest.fixture
def market_data_repository(memory_db_path):
    """Create market data repository instance for testing"""
    return SQLiteMarketDataRepository(memory_db_path)


@pytest.fixture
def cache_manager():
    """Create cache manager instance for testing"""
    return InMemoryCacheManager(default_ttl_seconds=60)











@pytest.fixture
def all_repositories(memory_db_path):
    """Create all repository instances for integration testing"""
    return create_sqlite_repositories(memory_db_path)


class TestSQLiteBacktestRepository:
    """Test suite for SQLiteBacktestRepository"""

    @pytest.mark.asyncio
    async def test_create_backtest_run(self, backtest_repository):
        """Test that a backtest run can be created and retrieved correctly"""
        # Arrange - Create a sample backtest run
        run_id = "test_run_12345"
        original_run = TestFixtures.create_sample_backtest_run(run_id)

        # Act - Create the backtest run
        result_id = await backtest_repository.create_backtest_run(original_run)

        # Assert - Verify creation was successful
        assert result_id == run_id, "Returned run ID should match the input run ID"

        # Act - Retrieve the created run to verify it was stored correctly
        retrieved_runs = await backtest_repository.get_backtest_runs()

        # Assert - Verify the run was stored with correct data
        assert len(retrieved_runs) == 1, "Should have exactly one backtest run"

        retrieved_run = retrieved_runs[0]
        assert retrieved_run.run_id == original_run.run_id
        assert retrieved_run.strategy_id == original_run.strategy_id
        assert retrieved_run.initial_capital == original_run.initial_capital
        assert retrieved_run.final_capital == original_run.final_capital
        assert retrieved_run.total_return == original_run.total_return
        assert retrieved_run.max_drawdown == original_run.max_drawdown
        assert retrieved_run.sharpe_ratio == original_run.sharpe_ratio
        assert retrieved_run.status == original_run.status

        # Verify datetime fields are preserved correctly
        assert retrieved_run.start_date == original_run.start_date
        assert retrieved_run.end_date == original_run.end_date
        assert retrieved_run.created_at == original_run.created_at
        assert retrieved_run.completed_at == original_run.completed_at

        # Verify complex fields (JSON serialized) are preserved
        assert retrieved_run.parameters == original_run.parameters
        assert retrieved_run.metadata == original_run.metadata

        print(f"✅ Successfully created and retrieved backtest run: {run_id}")

    @pytest.mark.asyncio
    async def test_create_backtest_run_duplicate(self, backtest_repository):
        """Test error handling for duplicate run IDs"""
        # Arrange - Create a backtest run with a specific ID
        run_id = "duplicate_test_run"
        original_run = TestFixtures.create_sample_backtest_run(run_id)

        # Act - Create the first run (should succeed)
        first_result = await backtest_repository.create_backtest_run(original_run)
        assert first_result == run_id, "First creation should succeed"

        # Arrange - Create a different run with the same ID
        duplicate_run = TestFixtures.create_sample_backtest_run(run_id)
        # Modify some fields to ensure it's actually different data
        duplicate_run = replace(duplicate_run,
            strategy_id="different_strategy",
            initial_capital=Decimal('200000.00'),
            final_capital=Decimal('250000.00')
        )

        # Act & Assert - Attempt to create duplicate should fail
        with pytest.raises(ValidationError) as exc_info:
            await backtest_repository.create_backtest_run(duplicate_run)

        # Verify the error message contains expected information
        error_message = str(exc_info.value)
        assert "already exists" in error_message.lower(), f"Error message should mention 'already exists': {error_message}"
        assert run_id in error_message, f"Error message should contain the run ID: {error_message}"

        # Verify that the original run is still intact and unchanged
        retrieved_runs = await backtest_repository.get_backtest_runs()
        assert len(retrieved_runs) == 1, "Should still have exactly one run after failed duplicate creation"

        retrieved_run = retrieved_runs[0]
        assert retrieved_run.strategy_id == original_run.strategy_id, "Original run should be unchanged"
        assert retrieved_run.initial_capital == original_run.initial_capital, "Original run should be unchanged"

        print(f"✅ Successfully prevented duplicate backtest run creation for ID: {run_id}")

    @pytest.mark.asyncio
    async def test_update_backtest_status(self, backtest_repository):
        """Test that the status of a backtest run can be updated and persisted"""
        # Arrange - Create a backtest run with initial status
        run_id = "status_update_test"
        original_run = TestFixtures.create_sample_backtest_run(run_id)
        # Set initial status to "running"
        original_run = replace(original_run,
            status="running",
            completed_at=None  # Not completed yet
        )

        await backtest_repository.create_backtest_run(original_run)

        # Verify initial state
        initial_runs = await backtest_repository.get_backtest_runs()
        assert len(initial_runs) == 1
        assert initial_runs[0].status == "running"
        assert initial_runs[0].completed_at is None

        # Act - Update status to completed with completion time
        completion_time = datetime(2024, 1, 15, 14, 30, 0)  # Fixed time for reproducible tests
        update_result = await backtest_repository.update_backtest_status(
            run_id, "completed", completion_time
        )

        # Assert - Verify update was successful
        assert update_result is True, "Status update should return True for success"

        # Act - Retrieve the updated run to verify persistence
        updated_runs = await backtest_repository.get_backtest_runs()

        # Assert - Verify the status and completion time were updated
        assert len(updated_runs) == 1, "Should still have exactly one run"

        updated_run = updated_runs[0]
        assert updated_run.run_id == run_id, "Run ID should be unchanged"
        assert updated_run.status == "completed", "Status should be updated to 'completed'"
        assert updated_run.completed_at == completion_time, "Completion time should be set correctly"

        # Verify other fields remain unchanged
        assert updated_run.strategy_id == original_run.strategy_id
        assert updated_run.initial_capital == original_run.initial_capital
        assert updated_run.final_capital == original_run.final_capital
        assert updated_run.start_date == original_run.start_date
        assert updated_run.end_date == original_run.end_date

        # Test updating status without completion time
        second_update_result = await backtest_repository.update_backtest_status(
            run_id, "failed", None
        )

        assert second_update_result is True, "Second status update should succeed"

        # Verify second update
        final_runs = await backtest_repository.get_backtest_runs()
        final_run = final_runs[0]
        assert final_run.status == "failed", "Status should be updated to 'failed'"
        # completed_at should remain the same since we passed None
        assert final_run.completed_at == completion_time, "Completion time should remain unchanged when None is passed"

        print(f"✅ Successfully updated backtest run status: {run_id}")

    @pytest.mark.asyncio
    async def test_update_nonexistent_backtest_status(self, backtest_repository):
        """Test updating status of non-existent backtest returns False"""
        # Act - Try to update a non-existent backtest run
        nonexistent_id = "this_run_does_not_exist"
        result = await backtest_repository.update_backtest_status(
            nonexistent_id, "completed", datetime.now()
        )

        # Assert - Should return False for non-existent run
        assert result is False, "Updating non-existent run should return False"

        # Verify no runs exist in the database
        all_runs = await backtest_repository.get_backtest_runs()
        assert len(all_runs) == 0, "Database should be empty"

        print(f"✅ Correctly handled update attempt for non-existent run: {nonexistent_id}")

    @pytest.mark.asyncio
    async def test_store_and_retrieve_performance_metrics(self, backtest_repository):
        """Test storing and retrieving performance metrics"""
        # Arrange - Create a backtest run first
        run_id = "metrics_test_run"
        run = TestFixtures.create_sample_backtest_run(run_id)
        await backtest_repository.create_backtest_run(run)

        # Create sample performance metrics with different timestamps
        base_time = datetime(2024, 1, 1, 9, 30, 0)
        metrics = []
        for i in range(3):
            metric = TestFixtures.create_sample_performance_metrics(f"metrics_{i}")
            # Override run_id and timestamp to ensure consistency
            metric = replace(metric,
                run_id=run_id,
                timestamp=base_time + timedelta(hours=i),
                portfolio_value=Decimal(f"{100000 + i * 5000}.00"),  # Increasing values
                cash=Decimal(f"{20000 + i * 1000}.00"),
                unrealized_pnl=Decimal(f"{i * 2500}.00")
            )
            metrics.append(metric)

        # Act - Store performance metrics
        stored_count = await backtest_repository.store_performance_metrics(run_id, metrics)

        # Assert - Verify storage was successful
        assert stored_count == 3, "Should have stored 3 performance metrics"

        # Act - Retrieve performance metrics
        retrieved_metrics = await backtest_repository.get_performance_history(run_id)

        # Assert - Verify retrieval and data integrity
        assert len(retrieved_metrics) == 3, "Should retrieve 3 performance metrics"

        # Verify metrics are sorted by timestamp (ascending)
        for i in range(len(retrieved_metrics) - 1):
            assert retrieved_metrics[i].timestamp <= retrieved_metrics[i + 1].timestamp, \
                "Metrics should be sorted by timestamp"

        # Verify data integrity for each metric
        for i, retrieved_metric in enumerate(retrieved_metrics):
            original_metric = metrics[i]

            assert retrieved_metric.metrics_id == original_metric.metrics_id
            assert retrieved_metric.run_id == run_id
            assert retrieved_metric.timestamp == original_metric.timestamp
            assert retrieved_metric.portfolio_value == original_metric.portfolio_value
            assert retrieved_metric.cash == original_metric.cash
            assert retrieved_metric.positions_value == original_metric.positions_value
            assert retrieved_metric.unrealized_pnl == original_metric.unrealized_pnl
            assert retrieved_metric.realized_pnl == original_metric.realized_pnl
            assert retrieved_metric.drawdown == original_metric.drawdown
            assert retrieved_metric.metrics == original_metric.metrics

        print(f"✅ Successfully stored and retrieved {len(metrics)} performance metrics")

    @pytest.mark.asyncio
    async def test_get_backtest_runs_with_filters(self, backtest_repository):
        """Test retrieving backtest runs with various filters"""
        # Arrange - Create multiple backtest runs with different properties
        runs_data = [
            ("run_1", "strategy_alpha", datetime(2024, 1, 1), datetime(2024, 1, 31)),
            ("run_2", "strategy_alpha", datetime(2024, 2, 1), datetime(2024, 2, 28)),
            ("run_3", "strategy_beta", datetime(2024, 1, 15), datetime(2024, 2, 15)),
            ("run_4", "strategy_gamma", datetime(2024, 3, 1), datetime(2024, 3, 31)),
        ]

        created_runs = []
        for run_id, strategy_id, start_date, end_date in runs_data:
            run = TestFixtures.create_sample_backtest_run(run_id)
            run = replace(run,
                strategy_id=strategy_id,
                start_date=start_date,
                end_date=end_date
            )
            created_runs.append(run)
            await backtest_repository.create_backtest_run(run)

        # Act & Assert - Test retrieving all runs
        all_runs = await backtest_repository.get_backtest_runs()
        assert len(all_runs) == 4, "Should retrieve all 4 backtest runs"

        # Verify runs are sorted by created_at DESC (most recent first)
        for i in range(len(all_runs) - 1):
            assert all_runs[i].created_at >= all_runs[i + 1].created_at, \
                "Runs should be sorted by created_at in descending order"

        # Act & Assert - Test filtering by strategy_id
        alpha_runs = await backtest_repository.get_backtest_runs(strategy_id="strategy_alpha")
        assert len(alpha_runs) == 2, "Should retrieve 2 runs for strategy_alpha"
        assert all(run.strategy_id == "strategy_alpha" for run in alpha_runs), \
            "All retrieved runs should have strategy_alpha"

        beta_runs = await backtest_repository.get_backtest_runs(strategy_id="strategy_beta")
        assert len(beta_runs) == 1, "Should retrieve 1 run for strategy_beta"
        assert beta_runs[0].strategy_id == "strategy_beta"

        # Act & Assert - Test filtering by date range
        january_runs = await backtest_repository.get_backtest_runs(
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 31)
        )
        # Should include runs that start within the date range
        assert len(january_runs) >= 1, "Should find runs starting in January"

        # Act & Assert - Test combined filters
        alpha_january_runs = await backtest_repository.get_backtest_runs(
            strategy_id="strategy_alpha",
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 31)
        )
        assert len(alpha_january_runs) == 1, "Should find 1 strategy_alpha run starting in January"
        assert alpha_january_runs[0].run_id == "run_1"

        # Act & Assert - Test filter with no matches
        nonexistent_runs = await backtest_repository.get_backtest_runs(
            strategy_id="nonexistent_strategy"
        )
        assert len(nonexistent_runs) == 0, "Should return empty list for non-existent strategy"

        print(f"✅ Successfully tested backtest run filtering with {len(created_runs)} runs")


class TestSQLiteSignalRepository:
    """Test suite for SQLiteSignalRepository"""

    @pytest.mark.asyncio
    async def test_store_and_retrieve_signals(self, signal_repository):
        """Test storing and retrieving signals with various symbols"""
        # Arrange - Create signals with different symbols
        signals = [
            TestFixtures.create_sample_signal_record(f"signal_{i}")
            for i in range(5)
        ]

        # Modify some signals to have different symbols
        signals[1] = replace(signals[1], symbol="MSFT", signal_type="sell")
        signals[2] = replace(signals[2], symbol="GOOGL", strength="moderate")
        signals[3] = replace(signals[3], symbol="AAPL", signal_type="hold")
        signals[4] = replace(signals[4], symbol="MSFT", strength="weak")

        # Act - Store signals
        stored_count = await signal_repository.store_signals(signals)

        # Assert - Verify storage count
        assert stored_count == 5, "Should have stored 5 signals"

        # Act - Retrieve all signals
        all_signals = await signal_repository.get_signals()

        # Assert - Verify all signals retrieved
        assert len(all_signals) == 5, "Should retrieve all 5 signals"

        # Verify signals are sorted by timestamp DESC (most recent first)
        for i in range(len(all_signals) - 1):
            assert all_signals[i].timestamp >= all_signals[i + 1].timestamp, \
                "Signals should be sorted by timestamp DESC"

        # Act - Retrieve signals by symbol
        aapl_signals = await signal_repository.get_signals(symbol="AAPL")
        msft_signals = await signal_repository.get_signals(symbol="MSFT")
        googl_signals = await signal_repository.get_signals(symbol="GOOGL")

        # Assert - Verify symbol filtering
        assert len(aapl_signals) == 2, "Should have 2 AAPL signals"
        assert len(msft_signals) == 2, "Should have 2 MSFT signals"
        assert len(googl_signals) == 1, "Should have 1 GOOGL signal"

        assert all(signal.symbol == "AAPL" for signal in aapl_signals)
        assert all(signal.symbol == "MSFT" for signal in msft_signals)
        assert all(signal.symbol == "GOOGL" for signal in googl_signals)

        # Verify data integrity for retrieved signals
        for original_signal in signals:
            matching_signals = [s for s in all_signals if s.signal_id == original_signal.signal_id]
            assert len(matching_signals) == 1, f"Should find exactly one signal with ID {original_signal.signal_id}"

            retrieved_signal = matching_signals[0]
            assert retrieved_signal.strategy_id == original_signal.strategy_id
            assert retrieved_signal.symbol == original_signal.symbol
            assert retrieved_signal.signal_type == original_signal.signal_type
            assert retrieved_signal.strength == original_signal.strength
            assert retrieved_signal.confidence == original_signal.confidence
            assert retrieved_signal.metadata == original_signal.metadata

        print(f"✅ Successfully stored and retrieved {len(signals)} signals with symbol filtering")

    @pytest.mark.asyncio
    async def test_mark_signals_processed(self, signal_repository):
        """Test marking signals as processed"""
        # Arrange - Create signals (all initially unprocessed)
        signals = [
            TestFixtures.create_sample_signal_record(f"signal_{i}")
            for i in range(4)
        ]

        # Ensure all signals start as unprocessed
        signals = [replace(signal, processed=False) for signal in signals]

        await signal_repository.store_signals(signals)

        # Verify initial state - all unprocessed
        initial_signals = await signal_repository.get_signals()
        assert all(not signal.processed for signal in initial_signals), \
            "All signals should initially be unprocessed"

        # Act - Mark first 2 signals as processed
        signal_ids_to_process = [signals[0].signal_id, signals[1].signal_id]
        updated_count = await signal_repository.mark_signals_processed(signal_ids_to_process)

        # Assert - Verify update count
        assert updated_count == 2, "Should have updated 2 signals"

        # Act - Retrieve all signals to verify processing status
        all_signals = await signal_repository.get_signals()
        processed_signals = [s for s in all_signals if s.processed]
        unprocessed_signals = [s for s in all_signals if not s.processed]

        # Assert - Verify processing status
        assert len(processed_signals) == 2, "Should have 2 processed signals"
        assert len(unprocessed_signals) == 2, "Should have 2 unprocessed signals"

        # Verify the correct signals were marked as processed
        processed_ids = {signal.signal_id for signal in processed_signals}
        expected_processed_ids = set(signal_ids_to_process)
        assert processed_ids == expected_processed_ids, \
            "The correct signals should be marked as processed"

        # Test marking non-existent signals (should return 0)
        non_existent_ids = ["fake_id_1", "fake_id_2"]
        zero_updated = await signal_repository.mark_signals_processed(non_existent_ids)
        assert zero_updated == 0, "Should return 0 for non-existent signal IDs"

        print(f"✅ Successfully tested signal processing status management")

    @pytest.mark.asyncio
    async def test_get_signals_with_filters(self, signal_repository):
        """Test retrieving signals with various filters"""
        # Arrange - Create signals with different properties
        base_time = datetime(2024, 1, 1, 9, 30, 0)
        signals_data = [
            ("signal_1", "strategy_alpha", "AAPL", "buy", base_time),
            ("signal_2", "strategy_alpha", "MSFT", "sell", base_time + timedelta(hours=1)),
            ("signal_3", "strategy_beta", "AAPL", "hold", base_time + timedelta(days=1)),
            ("signal_4", "strategy_beta", "GOOGL", "buy", base_time + timedelta(days=2)),
            ("signal_5", "strategy_gamma", "AAPL", "close", base_time + timedelta(days=3)),
        ]

        signals = []
        for signal_id, strategy_id, symbol, signal_type, timestamp in signals_data:
            signal = TestFixtures.create_sample_signal_record(signal_id)
            signal = replace(signal,
                strategy_id=strategy_id,
                symbol=symbol,
                signal_type=signal_type,
                timestamp=timestamp
            )
            signals.append(signal)

        await signal_repository.store_signals(signals)

        # Test 1: Filter by strategy_id
        alpha_signals = await signal_repository.get_signals(strategy_id="strategy_alpha")
        assert len(alpha_signals) == 2, "Should find 2 strategy_alpha signals"
        assert all(s.strategy_id == "strategy_alpha" for s in alpha_signals)

        # Test 2: Filter by symbol
        aapl_signals = await signal_repository.get_signals(symbol="AAPL")
        assert len(aapl_signals) == 3, "Should find 3 AAPL signals"
        assert all(s.symbol == "AAPL" for s in aapl_signals)

        # Test 3: Filter by signal_type
        buy_signals = await signal_repository.get_signals(signal_type="buy")
        assert len(buy_signals) == 2, "Should find 2 buy signals"
        assert all(s.signal_type == "buy" for s in buy_signals)

        # Test 4: Filter by date range
        day_1_signals = await signal_repository.get_signals(
            start_date=base_time,
            end_date=base_time + timedelta(hours=23, minutes=59)
        )
        assert len(day_1_signals) == 2, "Should find 2 signals from day 1"

        # Test 5: Combined filters
        alpha_aapl_signals = await signal_repository.get_signals(
            strategy_id="strategy_alpha",
            symbol="AAPL"
        )
        assert len(alpha_aapl_signals) == 1, "Should find 1 strategy_alpha AAPL signal"
        assert alpha_aapl_signals[0].signal_id == "signal_1"

        # Test 6: Date range filter
        middle_range_signals = await signal_repository.get_signals(
            start_date=base_time + timedelta(hours=12),
            end_date=base_time + timedelta(days=2, hours=12)
        )
        assert len(middle_range_signals) == 2, "Should find 2 signals in middle date range"

        # Test 7: No matches
        no_match_signals = await signal_repository.get_signals(
            strategy_id="nonexistent_strategy"
        )
        assert len(no_match_signals) == 0, "Should return empty list for non-existent strategy"

        print(f"✅ Successfully tested signal filtering with {len(signals)} signals")


class TestSQLiteMarketDataRepository:
    """Test suite for SQLiteMarketDataRepository"""

    @pytest.mark.asyncio
    async def test_store_and_retrieve_ohlcv(self, market_data_repository):
        """Test storing and retrieving OHLCV data"""
        # Arrange - Create OHLCV bars with realistic data
        symbol = "AAPL"
        bars = TestFixtures.create_sample_ohlcv_bars(symbol, 10)
        source = "test_source"

        # Act - Store OHLCV data
        stored_count = await market_data_repository.store_ohlcv(symbol, bars, source)

        # Assert - Verify storage count
        assert stored_count == 10, "Should have stored 10 OHLCV bars"

        # Act - Retrieve data for exact date range
        start_date = bars[0].timestamp
        end_date = bars[-1].timestamp
        retrieved_bars = await market_data_repository.get_ohlcv(symbol, start_date, end_date)

        # Assert - Verify retrieval and data integrity
        assert len(retrieved_bars) == 10, "Should retrieve all 10 bars"

        # Verify bars are sorted by timestamp (ascending)
        for i in range(len(retrieved_bars) - 1):
            assert retrieved_bars[i].timestamp <= retrieved_bars[i + 1].timestamp, \
                "Bars should be sorted by timestamp ASC"

        # Verify data integrity for each bar
        for i, retrieved_bar in enumerate(retrieved_bars):
            original_bar = bars[i]

            assert retrieved_bar.symbol == original_bar.symbol
            assert retrieved_bar.timestamp == original_bar.timestamp
            assert retrieved_bar.open == original_bar.open
            assert retrieved_bar.high == original_bar.high
            assert retrieved_bar.low == original_bar.low
            assert retrieved_bar.close == original_bar.close
            assert retrieved_bar.volume == original_bar.volume
            assert retrieved_bar.adjusted_close == original_bar.adjusted_close

        # Test partial date range retrieval
        mid_start = bars[2].timestamp
        mid_end = bars[7].timestamp
        partial_bars = await market_data_repository.get_ohlcv(symbol, mid_start, mid_end)
        assert len(partial_bars) == 6, "Should retrieve 6 bars for partial range"

        # Test empty result for non-existent symbol
        empty_bars = await market_data_repository.get_ohlcv("NONEXISTENT", start_date, end_date)
        assert len(empty_bars) == 0, "Should return empty list for non-existent symbol"

        print(f"✅ Successfully stored and retrieved {len(bars)} OHLCV bars for {symbol}")

    @pytest.mark.asyncio
    async def test_store_and_retrieve_options_chain(self, market_data_repository):
        """Test storing and retrieving options chain data"""
        # Arrange - Create options chain
        underlying = "AAPL"
        chain = TestFixtures.create_sample_options_chain(underlying)
        source = "test_source"

        # Verify test data setup
        assert len(chain.contracts) == 2, "Test chain should have 2 contracts"
        assert any(c.option_type == "call" for c in chain.contracts), "Should have call option"
        assert any(c.option_type == "put" for c in chain.contracts), "Should have put option"

        # Act - Store options chain
        stored_count = await market_data_repository.store_options_chain(chain, source)

        # Assert - Verify storage count
        assert stored_count == 2, "Should have stored 2 option contracts"

        # Act - Retrieve complete options chain
        retrieved_chain = await market_data_repository.get_options_chain(
            underlying, chain.timestamp
        )

        # Assert - Verify retrieval
        assert retrieved_chain is not None, "Should retrieve the options chain"
        assert retrieved_chain.underlying == underlying
        assert retrieved_chain.timestamp == chain.timestamp
        assert len(retrieved_chain.contracts) == 2, "Should retrieve 2 contracts"

        # Verify contract data integrity
        original_contracts = {c.symbol: c for c in chain.contracts}
        retrieved_contracts = {c.symbol: c for c in retrieved_chain.contracts}

        for symbol, original_contract in original_contracts.items():
            assert symbol in retrieved_contracts, f"Should find contract {symbol}"
            retrieved_contract = retrieved_contracts[symbol]

            assert retrieved_contract.underlying == original_contract.underlying
            assert retrieved_contract.expiration == original_contract.expiration
            assert retrieved_contract.strike == original_contract.strike
            assert retrieved_contract.option_type == original_contract.option_type
            assert retrieved_contract.bid == original_contract.bid
            assert retrieved_contract.ask == original_contract.ask
            assert retrieved_contract.volume == original_contract.volume
            assert retrieved_contract.open_interest == original_contract.open_interest
            assert retrieved_contract.implied_volatility == original_contract.implied_volatility
            assert retrieved_contract.delta == original_contract.delta

        # Test filtering by expiration date
        expiration_date = chain.contracts[0].expiration
        filtered_chain = await market_data_repository.get_options_chain(
            underlying, chain.timestamp, expiration_date
        )
        assert filtered_chain is not None, "Should retrieve filtered chain"
        assert len(filtered_chain.contracts) == 2, "Both contracts have same expiration"

        # Test non-existent chain
        future_timestamp = datetime(2025, 12, 31)
        non_existent_chain = await market_data_repository.get_options_chain(
            underlying, future_timestamp
        )
        assert non_existent_chain is None, "Should return None for non-existent chain"

        print(f"✅ Successfully stored and retrieved options chain for {underlying}")

    @pytest.mark.asyncio
    async def test_get_available_symbols(self, market_data_repository):
        """Test retrieving available symbols"""
        # Arrange - Store data for multiple symbols
        symbols = ["AAPL", "MSFT", "GOOGL", "TSLA"]

        for symbol in symbols:
            bars = TestFixtures.create_sample_ohlcv_bars(symbol, 2)  # 2 bars each
            await market_data_repository.store_ohlcv(symbol, bars, "test_source")

        # Act - Get available symbols
        available_symbols = await market_data_repository.get_available_symbols()

        # Assert - Verify all symbols are available
        assert len(available_symbols) == 4, "Should have 4 available symbols"
        assert set(available_symbols) == set(symbols), "Should match stored symbols"

        # Verify symbols are sorted
        assert available_symbols == sorted(available_symbols), "Symbols should be sorted"

        # Test empty database
        # Create new repository instance for clean test
        empty_repo = SQLiteMarketDataRepository(":memory:")
        empty_symbols = await empty_repo.get_available_symbols()
        assert len(empty_symbols) == 0, "Empty database should return no symbols"

        print(f"✅ Successfully retrieved {len(available_symbols)} available symbols")

    @pytest.mark.asyncio
    async def test_get_data_range(self, market_data_repository):
        """Test retrieving data range for symbol"""
        # Arrange - Create bars with specific date range
        symbol = "AAPL"
        start_date = datetime(2024, 1, 1)
        bars = []

        # Create 5 bars over 5 days
        for i in range(5):
            bar_date = start_date + timedelta(days=i)
            bar = TestFixtures.create_sample_ohlcv_bars(symbol, 1)[0]
            # Replace timestamp with our specific date
            bar = OHLCVBar(
                symbol=bar.symbol,
                timestamp=bar_date,
                open=bar.open,
                high=bar.high,
                low=bar.low,
                close=bar.close,
                volume=bar.volume,
                adjusted_close=bar.adjusted_close
            )
            bars.append(bar)

        await market_data_repository.store_ohlcv(symbol, bars, "test_source")

        # Act - Get data range
        data_range = await market_data_repository.get_data_range(symbol)

        # Assert - Verify data range
        assert data_range is not None, "Should return data range for existing symbol"

        range_start, range_end = data_range
        expected_start = bars[0].timestamp
        expected_end = bars[-1].timestamp

        assert range_start == expected_start, f"Start date should be {expected_start}"
        assert range_end == expected_end, f"End date should be {expected_end}"

        # Test non-existent symbol
        no_data_range = await market_data_repository.get_data_range("NONEXISTENT")
        assert no_data_range is None, "Should return None for non-existent symbol"

        # Test multiple symbols - verify each has correct range
        msft_bars = TestFixtures.create_sample_ohlcv_bars("MSFT", 3)
        await market_data_repository.store_ohlcv("MSFT", msft_bars, "test_source")

        msft_range = await market_data_repository.get_data_range("MSFT")
        assert msft_range is not None, "Should return range for MSFT"

        msft_start, msft_end = msft_range
        assert msft_start == msft_bars[0].timestamp
        assert msft_end == msft_bars[-1].timestamp

        print(f"✅ Successfully tested data range retrieval for {symbol}")


class TestInMemoryCacheManager:
    """Test suite for InMemoryCacheManager"""

    @pytest.mark.asyncio
    async def test_cache_set_and_get(self, cache_manager):
        """Test basic cache set and get operations"""
        # Arrange - Test data with various types
        test_data = {
            "string_key": "test_value",
            "dict_key": {"nested": "data", "number": 42},
            "list_key": [1, 2, 3, "mixed", {"nested": True}],
            "number_key": 12345,
            "decimal_key": Decimal('123.45')
        }

        # Act & Assert - Test each data type
        for key, value in test_data.items():
            # Set value
            set_result = await cache_manager.set(key, value)
            assert set_result is True, f"Setting {key} should succeed"

            # Get value
            get_result = await cache_manager.get(key)
            assert get_result == value, f"Retrieved value for {key} should match original"

        # Test overwriting existing key
        overwrite_result = await cache_manager.set("string_key", "new_value")
        assert overwrite_result is True, "Overwriting should succeed"

        new_value = await cache_manager.get("string_key")
        assert new_value == "new_value", "Should retrieve updated value"

        print(f"✅ Successfully tested cache set/get operations with {len(test_data)} data types")

    @pytest.mark.asyncio
    async def test_cache_miss(self, cache_manager):
        """Test cache miss for non-existent key"""
        # Test various non-existent keys
        non_existent_keys = [
            "nonexistent_key",
            "another_missing_key",
            "",  # Empty string key
            "key_with_special_chars!@#$%"
        ]

        for key in non_existent_keys:
            result = await cache_manager.get(key)
            assert result is None, f"Non-existent key '{key}' should return None"

        # Verify cache stats reflect misses
        stats = cache_manager.get_stats()
        assert stats['misses'] >= len(non_existent_keys), "Should track cache misses"

        print(f"✅ Successfully tested cache misses for {len(non_existent_keys)} keys")

    @pytest.mark.asyncio
    async def test_cache_ttl_expiration(self, cache_manager):
        """Test cache TTL expiration"""
        # Test immediate expiration (TTL = 0 means no expiration in our implementation)
        await cache_manager.set("no_expire_zero", "test_value", ttl_seconds=0)
        result = await cache_manager.get("no_expire_zero")
        assert result == "test_value", "Key with TTL=0 should not expire (means no TTL)"

        # Test negative TTL (should not expire)
        await cache_manager.set("no_expire", "persistent_value", ttl_seconds=-1)
        result = await cache_manager.get("no_expire")
        assert result == "persistent_value", "Key with negative TTL should not expire"

        # Test very short TTL with sleep simulation
        # Note: In real tests, you might use time mocking, but for simplicity we test the logic
        import time

        # Set with 1 second TTL
        await cache_manager.set("short_expire", "temp_value", ttl_seconds=1)

        # Should be available immediately
        immediate_result = await cache_manager.get("short_expire")
        assert immediate_result == "temp_value", "Should be available immediately"

        # Manually expire by manipulating the cache (simulating time passage)
        # This tests the expiration logic without waiting
        if hasattr(cache_manager, '_cache'):
            # Manually set expiration time to past
            cache_manager._cache["short_expire"]["expires_at"] = time.time() - 1

        expired_result = await cache_manager.get("short_expire")
        assert expired_result is None, "Expired key should return None"

        # Verify expired key is cleaned up
        stats = cache_manager.get_stats()
        # The expired key should not count toward cache size

        print("✅ Successfully tested TTL expiration behavior")

    @pytest.mark.asyncio
    async def test_cache_delete(self, cache_manager):
        """Test cache deletion"""
        # Arrange - Set multiple keys
        test_keys = {
            "delete_key_1": "value1",
            "delete_key_2": {"complex": "data"},
            "keep_key": "should_remain"
        }

        for key, value in test_keys.items():
            await cache_manager.set(key, value)

        # Verify all keys are set
        for key, value in test_keys.items():
            result = await cache_manager.get(key)
            assert result == value, f"Key {key} should be set initially"

        # Act - Delete specific keys
        delete_result_1 = await cache_manager.delete("delete_key_1")
        delete_result_2 = await cache_manager.delete("delete_key_2")

        # Assert - Verify deletions
        assert delete_result_1 is True, "Deleting existing key should return True"
        assert delete_result_2 is True, "Deleting existing key should return True"

        # Verify deleted keys return None
        assert await cache_manager.get("delete_key_1") is None
        assert await cache_manager.get("delete_key_2") is None

        # Verify non-deleted key remains
        assert await cache_manager.get("keep_key") == "should_remain"

        # Test deleting non-existent key
        delete_nonexistent = await cache_manager.delete("never_existed")
        assert delete_nonexistent is False, "Deleting non-existent key should return False"

        # Test deleting already deleted key
        delete_again = await cache_manager.delete("delete_key_1")
        assert delete_again is False, "Deleting already deleted key should return False"

        print("✅ Successfully tested cache deletion operations")

    @pytest.mark.asyncio
    async def test_cache_clear(self, cache_manager):
        """Test cache clearing with pattern support"""
        # Arrange - Set keys with different patterns
        test_data = {
            "user:123": "user_data_123",
            "user:456": "user_data_456",
            "session:abc": "session_data_abc",
            "session:def": "session_data_def",
            "config:app": "app_config",
            "temp:data": "temporary"
        }

        for key, value in test_data.items():
            await cache_manager.set(key, value)

        # Verify all keys are set
        initial_stats = cache_manager.get_stats()
        assert initial_stats['cache_size'] == 6, "Should have 6 keys initially"

        # Test pattern-based clearing (if supported)
        user_cleared = await cache_manager.clear("user:")
        assert user_cleared == 2, "Should clear 2 user keys"

        # Verify user keys are gone, others remain
        assert await cache_manager.get("user:123") is None
        assert await cache_manager.get("user:456") is None
        assert await cache_manager.get("session:abc") == "session_data_abc"
        assert await cache_manager.get("config:app") == "app_config"

        # Test clearing all remaining keys
        remaining_cleared = await cache_manager.clear()
        assert remaining_cleared == 4, "Should clear remaining 4 keys"

        # Verify cache is empty
        final_stats = cache_manager.get_stats()
        assert final_stats['cache_size'] == 0, "Cache should be empty after clear all"

        # Test clearing empty cache
        empty_cleared = await cache_manager.clear()
        assert empty_cleared == 0, "Clearing empty cache should return 0"

        print("✅ Successfully tested cache clearing operations")

    @pytest.mark.asyncio
    async def test_cache_stats(self, cache_manager):
        """Test cache statistics tracking"""
        # Get initial stats
        initial_stats = cache_manager.get_stats()
        assert 'hits' in initial_stats
        assert 'misses' in initial_stats
        assert 'sets' in initial_stats
        assert 'deletes' in initial_stats
        assert 'cache_size' in initial_stats
        assert 'hit_rate' in initial_stats

        # Generate cache activity
        await cache_manager.set("stats_key_1", "value1")  # +1 set
        await cache_manager.set("stats_key_2", "value2")  # +1 set

        await cache_manager.get("stats_key_1")  # +1 hit
        await cache_manager.get("stats_key_1")  # +1 hit
        await cache_manager.get("nonexistent_1")  # +1 miss
        await cache_manager.get("nonexistent_2")  # +1 miss
        await cache_manager.get("nonexistent_3")  # +1 miss

        await cache_manager.delete("stats_key_2")  # +1 delete

        # Get final stats
        final_stats = cache_manager.get_stats()

        # Verify stats tracking
        expected_sets = initial_stats['sets'] + 2
        expected_hits = initial_stats['hits'] + 2
        expected_misses = initial_stats['misses'] + 3
        expected_deletes = initial_stats['deletes'] + 1
        expected_cache_size = 1  # Only stats_key_1 remains

        assert final_stats['sets'] == expected_sets, f"Expected {expected_sets} sets"
        assert final_stats['hits'] == expected_hits, f"Expected {expected_hits} hits"
        assert final_stats['misses'] == expected_misses, f"Expected {expected_misses} misses"
        assert final_stats['deletes'] == expected_deletes, f"Expected {expected_deletes} deletes"
        assert final_stats['cache_size'] == expected_cache_size, f"Expected cache size {expected_cache_size}"

        # Verify hit rate calculation
        total_requests = final_stats['hits'] + final_stats['misses']
        expected_hit_rate = final_stats['hits'] / total_requests if total_requests > 0 else 0
        assert abs(final_stats['hit_rate'] - expected_hit_rate) < 0.001, "Hit rate should be calculated correctly"

        # Verify hit rate is between 0 and 1
        assert 0 <= final_stats['hit_rate'] <= 1, "Hit rate should be between 0 and 1"

        # Test memory usage estimate (if available)
        if 'memory_usage_estimate' in final_stats:
            assert final_stats['memory_usage_estimate'] >= 0, "Memory usage should be non-negative"

        print("✅ Successfully tested cache statistics tracking")

    @pytest.mark.asyncio
    async def test_cache_performance_and_edge_cases(self, cache_manager):
        """Test cache performance and edge cases"""
        # Test large number of keys
        large_data = {f"key_{i}": f"value_{i}" for i in range(100)}

        # Bulk set operations
        for key, value in large_data.items():
            result = await cache_manager.set(key, value)
            assert result is True, f"Setting {key} should succeed"

        # Verify all keys are retrievable
        for key, expected_value in large_data.items():
            result = await cache_manager.get(key)
            assert result == expected_value, f"Key {key} should return correct value"

        # Test cache size
        stats = cache_manager.get_stats()
        assert stats['cache_size'] == 100, "Should have 100 keys in cache"

        # Test edge case values
        edge_cases = {
            "none_value": None,
            "empty_string": "",
            "empty_dict": {},
            "empty_list": [],
            "zero": 0,
            "false": False,
            "large_string": "x" * 10000  # Large string
        }

        for key, value in edge_cases.items():
            await cache_manager.set(key, value)
            result = await cache_manager.get(key)
            assert result == value, f"Edge case {key} should handle value {value}"

        print("✅ Successfully tested cache performance and edge cases")


class TestRepositoryIntegration:
    """Integration tests for repository components"""
    
    @pytest.mark.asyncio
    async def test_repository_factory(self, memory_db_path):
        """Test repository factory function"""
        # Act
        backtest_repo, signal_repo, market_data_repo, cache = create_sqlite_repositories(memory_db_path)
        
        # Assert
        assert isinstance(backtest_repo, SQLiteBacktestRepository)
        assert isinstance(signal_repo, SQLiteSignalRepository)
        assert isinstance(market_data_repo, SQLiteMarketDataRepository)
        assert isinstance(cache, InMemoryCacheManager)
    
    @pytest.mark.asyncio
    async def test_cross_repository_data_consistency(self, all_repositories):
        """Test data consistency across repositories"""
        backtest_repo, signal_repo, market_data_repo, cache = all_repositories
        
        # Arrange - Create related data
        run = TestFixtures.create_sample_backtest_run("integration_test")
        signals = [
            replace(TestFixtures.create_sample_signal_record(f"signal_{i}"), run_id=run.run_id)
            for i in range(3)
        ]
        
        # Act - Store data across repositories
        await backtest_repo.create_backtest_run(run)
        await signal_repo.store_signals(signals)
        
        # Retrieve and verify
        retrieved_runs = await backtest_repo.get_backtest_runs(strategy_id=run.strategy_id)
        retrieved_signals = await signal_repo.get_signals(run_id=run.run_id)
        
        # Assert
        assert len(retrieved_runs) == 1
        assert retrieved_runs[0].run_id == run.run_id
        assert len(retrieved_signals) == 3
        assert all(signal.run_id == run.run_id for signal in retrieved_signals)


# Error condition tests
class TestRepositoryErrorHandling:
    """Test error handling and edge cases"""
    
    @pytest.mark.asyncio
    async def test_invalid_database_path(self):
        """Test handling of invalid database path"""
        # Use a path that cannot be created (invalid characters on Windows)
        invalid_path = "C:\\invalid<>path|with*illegal?chars\\database.db"
        repo = SQLiteBacktestRepository(invalid_path)

        # The error should occur when we try to actually use the database
        with pytest.raises((ConnectionError, RepositoryError, OSError)):
            await repo.create_backtest_run(TestFixtures.create_sample_backtest_run())
    
    @pytest.mark.asyncio
    async def test_malformed_data_handling(self, backtest_repository):
        """Test handling of malformed data"""
        # This would test various edge cases like None values, 
        # invalid dates, etc. depending on validation logic
        pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
