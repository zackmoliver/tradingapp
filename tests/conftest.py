"""
Pytest Configuration and Shared Fixtures - Options Trading Backtest Engine

This module provides shared pytest configuration, fixtures, and utilities
for testing the repository implementations and other components.
"""

import pytest
import pytest_asyncio
import asyncio
import tempfile
import os
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import AsyncGenerator, Generator
import uuid

# Configure logging for tests
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Disable SQLite repository logging during tests to reduce noise
logging.getLogger('src.data.repository').setLevel(logging.WARNING)


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def temp_directory():
    """Create a temporary directory for test files"""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield temp_dir


@pytest.fixture
def sample_datetime():
    """Provide a consistent datetime for testing"""
    return datetime(2024, 1, 15, 10, 30, 0)


@pytest.fixture
def sample_date_range():
    """Provide a consistent date range for testing"""
    start_date = datetime(2024, 1, 1)
    end_date = datetime(2024, 1, 31)
    return start_date, end_date


class MockDataProvider:
    """Mock data provider for testing"""
    
    @staticmethod
    def generate_price_series(
        symbol: str,
        start_date: datetime,
        days: int,
        base_price: Decimal = Decimal('100.00'),
        volatility: float = 0.02
    ):
        """Generate a realistic price series for testing"""
        import random
        
        prices = []
        current_price = base_price
        
        for i in range(days):
            # Simple random walk with drift
            change = random.gauss(0.001, volatility)  # Small positive drift
            current_price *= (1 + Decimal(str(change)))
            
            # Ensure price doesn't go negative
            current_price = max(current_price, Decimal('0.01'))
            
            date = start_date + timedelta(days=i)
            
            # Generate OHLC from close price
            high = current_price * Decimal('1.02')
            low = current_price * Decimal('0.98')
            open_price = current_price * Decimal('0.999')
            
            prices.append({
                'date': date,
                'open': open_price,
                'high': high,
                'low': low,
                'close': current_price,
                'volume': random.randint(500000, 2000000)
            })
        
        return prices
    
    @staticmethod
    def generate_options_data(
        underlying: str,
        underlying_price: Decimal,
        expiration_date: datetime,
        strikes: list = None
    ):
        """Generate realistic options data for testing"""
        if strikes is None:
            # Generate strikes around current price
            base_strike = float(underlying_price)
            strikes = [base_strike + i * 5 for i in range(-5, 6)]
        
        contracts = []
        
        for strike in strikes:
            strike_decimal = Decimal(str(strike))
            
            # Simple Black-Scholes approximation for testing
            moneyness = float(underlying_price / strike_decimal)
            
            # Call option
            call_delta = max(0.05, min(0.95, 0.5 + (moneyness - 1) * 2))
            call_price = max(0.01, float(underlying_price - strike_decimal) * call_delta)
            
            contracts.append({
                'symbol': f"{underlying}{expiration_date.strftime('%y%m%d')}C{int(strike*1000):08d}",
                'underlying': underlying,
                'expiration': expiration_date,
                'strike': strike_decimal,
                'option_type': 'call',
                'bid': Decimal(str(call_price * 0.98)),
                'ask': Decimal(str(call_price * 1.02)),
                'last': Decimal(str(call_price)),
                'volume': random.randint(0, 1000),
                'open_interest': random.randint(0, 5000),
                'implied_volatility': Decimal(str(random.uniform(0.15, 0.35))),
                'delta': Decimal(str(call_delta)),
                'gamma': Decimal(str(random.uniform(0.01, 0.05))),
                'theta': Decimal(str(random.uniform(-0.1, -0.01))),
                'vega': Decimal(str(random.uniform(0.05, 0.15))),
                'rho': Decimal(str(random.uniform(0.01, 0.08)))
            })
            
            # Put option
            put_delta = call_delta - 1
            put_price = max(0.01, float(strike_decimal - underlying_price) * abs(put_delta))
            
            contracts.append({
                'symbol': f"{underlying}{expiration_date.strftime('%y%m%d')}P{int(strike*1000):08d}",
                'underlying': underlying,
                'expiration': expiration_date,
                'strike': strike_decimal,
                'option_type': 'put',
                'bid': Decimal(str(put_price * 0.98)),
                'ask': Decimal(str(put_price * 1.02)),
                'last': Decimal(str(put_price)),
                'volume': random.randint(0, 800),
                'open_interest': random.randint(0, 4000),
                'implied_volatility': Decimal(str(random.uniform(0.15, 0.35))),
                'delta': Decimal(str(put_delta)),
                'gamma': Decimal(str(random.uniform(0.01, 0.05))),
                'theta': Decimal(str(random.uniform(-0.1, -0.01))),
                'vega': Decimal(str(random.uniform(0.05, 0.15))),
                'rho': Decimal(str(random.uniform(-0.08, -0.01)))
            })
        
        return contracts


@pytest.fixture
def mock_data_provider():
    """Provide mock data provider for tests"""
    return MockDataProvider()


class TestDatabaseManager:
    """Utility class for managing test databases"""
    
    def __init__(self):
        self.temp_databases = []
    
    def create_temp_database(self) -> str:
        """Create a temporary database file"""
        temp_file = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        db_path = temp_file.name
        temp_file.close()
        
        self.temp_databases.append(db_path)
        return db_path
    
    def cleanup(self):
        """Clean up all temporary databases"""
        for db_path in self.temp_databases:
            if os.path.exists(db_path):
                try:
                    os.unlink(db_path)
                except OSError:
                    pass  # Ignore cleanup errors
        self.temp_databases.clear()


@pytest.fixture
def test_db_manager():
    """Provide database manager for tests"""
    manager = TestDatabaseManager()
    yield manager
    manager.cleanup()


class PerformanceTimer:
    """Utility for measuring test performance"""
    
    def __init__(self):
        self.start_time = None
        self.end_time = None
    
    def start(self):
        """Start timing"""
        self.start_time = datetime.now()
    
    def stop(self):
        """Stop timing"""
        self.end_time = datetime.now()
    
    @property
    def elapsed_seconds(self) -> float:
        """Get elapsed time in seconds"""
        if self.start_time and self.end_time:
            return (self.end_time - self.start_time).total_seconds()
        return 0.0
    
    @property
    def elapsed_ms(self) -> float:
        """Get elapsed time in milliseconds"""
        return self.elapsed_seconds * 1000


@pytest.fixture
def performance_timer():
    """Provide performance timer for tests"""
    return PerformanceTimer()


# Custom pytest markers
def pytest_configure(config):
    """Configure custom pytest markers"""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )
    config.addinivalue_line(
        "markers", "unit: marks tests as unit tests"
    )
    config.addinivalue_line(
        "markers", "performance: marks tests as performance tests"
    )


# Test data validation utilities
class TestDataValidator:
    """Utilities for validating test data"""
    
    @staticmethod
    def validate_backtest_run(run):
        """Validate backtest run data structure"""
        required_fields = [
            'run_id', 'strategy_id', 'start_date', 'end_date',
            'initial_capital', 'final_capital', 'total_return',
            'max_drawdown', 'sharpe_ratio', 'created_at', 'status'
        ]
        
        for field in required_fields:
            assert hasattr(run, field), f"Missing required field: {field}"
            assert getattr(run, field) is not None, f"Field {field} is None"
        
        # Validate data types
        assert isinstance(run.initial_capital, Decimal)
        assert isinstance(run.final_capital, Decimal)
        assert isinstance(run.total_return, Decimal)
        assert isinstance(run.created_at, datetime)
        
        # Validate business logic
        assert run.initial_capital > 0, "Initial capital must be positive"
        assert run.final_capital >= 0, "Final capital cannot be negative"
        assert run.start_date <= run.end_date, "Start date must be before end date"
    
    @staticmethod
    def validate_signal_record(signal):
        """Validate signal record data structure"""
        required_fields = [
            'signal_id', 'strategy_id', 'symbol', 'signal_type',
            'strength', 'confidence', 'timestamp'
        ]
        
        for field in required_fields:
            assert hasattr(signal, field), f"Missing required field: {field}"
            assert getattr(signal, field) is not None, f"Field {field} is None"
        
        # Validate confidence range
        assert 0 <= signal.confidence <= 1, "Confidence must be between 0 and 1"
        
        # Validate signal type
        valid_types = ['buy', 'sell', 'hold', 'close']
        assert signal.signal_type in valid_types, f"Invalid signal type: {signal.signal_type}"
        
        # Validate strength
        valid_strengths = ['weak', 'moderate', 'strong']
        assert signal.strength in valid_strengths, f"Invalid strength: {signal.strength}"


@pytest.fixture
def test_data_validator():
    """Provide test data validator"""
    return TestDataValidator()


# Async test utilities
class AsyncTestUtils:
    """Utilities for async testing"""
    
    @staticmethod
    async def wait_for_condition(condition_func, timeout_seconds=5.0, check_interval=0.1):
        """Wait for a condition to become true"""
        start_time = datetime.now()
        
        while (datetime.now() - start_time).total_seconds() < timeout_seconds:
            if await condition_func():
                return True
            await asyncio.sleep(check_interval)
        
        return False
    
    @staticmethod
    async def run_with_timeout(coro, timeout_seconds=10.0):
        """Run coroutine with timeout"""
        try:
            return await asyncio.wait_for(coro, timeout=timeout_seconds)
        except asyncio.TimeoutError:
            pytest.fail(f"Operation timed out after {timeout_seconds} seconds")


@pytest.fixture
def async_test_utils():
    """Provide async test utilities"""
    return AsyncTestUtils()


# Random data generation utilities
import random

@pytest.fixture(autouse=True)
def set_random_seed():
    """Set random seed for reproducible tests"""
    random.seed(42)
    # If using numpy: np.random.seed(42)
