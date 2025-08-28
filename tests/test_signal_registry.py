"""
Test Suite for Signal Registry Implementation - Options Trading Backtest Engine

Comprehensive tests for the signal registry system including registration,
discovery, validation, and execution of signal functions.
"""

import pytest
import pytest_asyncio
import asyncio
from datetime import datetime
from decimal import Decimal
from typing import Tuple
import uuid

# Add path for imports
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Import the implementation to test
from src.signals.registry import (
    SignalRegistryImpl, SignalDecoratorImpl, signal, get_signal, list_signals,
    execute_signal, execute_signal_async, get_registry_stats, clear_registry,
    SIGNAL_REGISTRY
)

# Import contracts and data types
from signals.registry import (
    SignalInput, SignalOutput, SignalMetadata, SignalCategory, SignalType,
    SignalStrength, SignalValidationResult, DuplicateSignalError,
    SignalNotFoundError, SignalExecutionError, InvalidSignatureError
)


class TestFixtures:
    """Test data fixtures for signal registry testing"""
    
    @staticmethod
    def create_sample_signal_input(symbol: str = "AAPL") -> SignalInput:
        """Create sample signal input for testing"""
        return SignalInput(
            symbol=symbol,
            timestamp=datetime.now(),
            current_price=Decimal('150.50'),
            historical_data=[],  # Would contain OHLCVBar objects
            options_chain=None,
            market_event=None,
            context=None,  # Would contain StrategyContext
            parameters={"lookback": 20, "threshold": 0.7},
            metadata={"source": "test", "version": "1.0"}
        )
    
    @staticmethod
    def create_sample_signal_output(signal_type: SignalType = SignalType.BUY) -> SignalOutput:
        """Create sample signal output for testing"""
        return SignalOutput(
            signal_id=str(uuid.uuid4()),
            signal_type=signal_type,
            strength=SignalStrength.STRONG,
            confidence=Decimal('0.85'),
            target_price=Decimal('155.00'),
            target_quantity=Decimal('100'),
            stop_loss=Decimal('145.00'),
            take_profit=Decimal('160.00'),
            expiry=None,
            reasoning="Test signal generated for unit testing",
            supporting_data={"rsi": 25.5, "volume_spike": True},
            metadata={"generated_by": "test_fixture"}
        )


@pytest.fixture(autouse=True)
def clear_registry_before_test():
    """Clear registry before each test to ensure isolation"""
    clear_registry()
    yield
    clear_registry()


@pytest.fixture
def registry():
    """Create a fresh registry instance for testing"""
    return SignalRegistryImpl()


@pytest.fixture
def sample_signal_input():
    """Provide sample signal input for tests"""
    return TestFixtures.create_sample_signal_input()


@pytest.fixture
def sample_signal_output():
    """Provide sample signal output for tests"""
    return TestFixtures.create_sample_signal_output()


class TestSignalRegistryImpl:
    """Test suite for SignalRegistryImpl"""
    
    def test_register_signal_success(self, registry):
        """Test successful signal registration"""
        # Arrange - Create a simple signal function
        def test_signal(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_signal_output()
        
        metadata = SignalMetadata(
            name="test_signal",
            description="Test signal for unit testing",
            category=SignalCategory.TECHNICAL,
            version="1.0.0",
            author="test_author",
            created_at=datetime.now(),
            parameters_schema={"threshold": "float"},
            required_data=["ohlcv"],
            lookback_periods=20,
            output_type="SignalOutput",
            tags=["test", "technical"],
            documentation_url=None,
            is_deprecated=False,
            deprecation_message=None
        )
        
        # Act - Register the signal
        result = registry.register("test_signal", test_signal, metadata)
        
        # Assert - Verify registration
        assert result is True, "Registration should succeed"
        
        # Verify signal is in registry
        registered_signal = registry.get_signal("test_signal")
        assert registered_signal is not None, "Signal should be found in registry"
        assert registered_signal.function == test_signal
        assert registered_signal.metadata.name == "test_signal"
        assert registered_signal.metadata.category == SignalCategory.TECHNICAL
        assert registered_signal.is_active is True
        assert registered_signal.usage_count == 0
        
        print("✅ Successfully registered signal: test_signal")
    
    def test_register_duplicate_signal_fails(self, registry):
        """Test that duplicate signal registration fails without overwrite"""
        # Arrange - Create and register first signal
        def test_signal_1(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_signal_output()
        
        metadata = SignalMetadata(
            name="duplicate_test",
            description="First signal",
            category=SignalCategory.TECHNICAL,
            version="1.0.0",
            author="test_author",
            created_at=datetime.now(),
            parameters_schema={},
            required_data=[],
            lookback_periods=1,
            output_type="SignalOutput",
            tags=[],
            documentation_url=None,
            is_deprecated=False,
            deprecation_message=None
        )
        
        registry.register("duplicate_test", test_signal_1, metadata)
        
        # Arrange - Create second signal with same name
        def test_signal_2(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_signal_output(SignalType.SELL)
        
        # Act & Assert - Attempt duplicate registration should fail
        with pytest.raises(DuplicateSignalError) as exc_info:
            registry.register("duplicate_test", test_signal_2, metadata, overwrite=False)
        
        assert "already exists" in str(exc_info.value)
        
        # Verify original signal is unchanged
        registered_signal = registry.get_signal("duplicate_test")
        assert registered_signal.function == test_signal_1
        
        print("✅ Successfully prevented duplicate signal registration")
    
    def test_register_with_overwrite(self, registry):
        """Test signal registration with overwrite=True"""
        # Arrange - Register first signal
        def test_signal_1(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_signal_output(SignalType.BUY)
        
        metadata_1 = SignalMetadata(
            name="overwrite_test",
            description="First version",
            category=SignalCategory.TECHNICAL,
            version="1.0.0",
            author="test_author",
            created_at=datetime.now(),
            parameters_schema={},
            required_data=[],
            lookback_periods=1,
            output_type="SignalOutput",
            tags=["v1"],
            documentation_url=None,
            is_deprecated=False,
            deprecation_message=None
        )
        
        registry.register("overwrite_test", test_signal_1, metadata_1)
        
        # Arrange - Create second signal
        def test_signal_2(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_signal_output(SignalType.SELL)
        
        metadata_2 = SignalMetadata(
            name="overwrite_test",
            description="Second version",
            category=SignalCategory.MOMENTUM,
            version="2.0.0",
            author="test_author",
            created_at=datetime.now(),
            parameters_schema={},
            required_data=[],
            lookback_periods=1,
            output_type="SignalOutput",
            tags=["v2"],
            documentation_url=None,
            is_deprecated=False,
            deprecation_message=None
        )
        
        # Act - Register with overwrite
        result = registry.register("overwrite_test", test_signal_2, metadata_2, overwrite=True)
        
        # Assert - Verify overwrite succeeded
        assert result is True
        
        registered_signal = registry.get_signal("overwrite_test")
        assert registered_signal.function == test_signal_2
        assert registered_signal.metadata.description == "Second version"
        assert registered_signal.metadata.category == SignalCategory.MOMENTUM
        assert registered_signal.metadata.version == "2.0.0"
        
        print("✅ Successfully overwrote existing signal")
    
    def test_unregister_signal(self, registry):
        """Test signal unregistration"""
        # Arrange - Register a signal
        def test_signal(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_signal_output()
        
        metadata = SignalMetadata(
            name="unregister_test",
            description="Signal to be unregistered",
            category=SignalCategory.TECHNICAL,
            version="1.0.0",
            author="test_author",
            created_at=datetime.now(),
            parameters_schema={},
            required_data=[],
            lookback_periods=1,
            output_type="SignalOutput",
            tags=[],
            documentation_url=None,
            is_deprecated=False,
            deprecation_message=None
        )
        
        registry.register("unregister_test", test_signal, metadata)
        
        # Verify signal exists
        assert registry.get_signal("unregister_test") is not None
        
        # Act - Unregister the signal
        result = registry.unregister("unregister_test")
        
        # Assert - Verify unregistration
        assert result is True, "Unregistration should succeed"
        assert registry.get_signal("unregister_test") is None, "Signal should be removed"
        
        # Test unregistering non-existent signal
        result_nonexistent = registry.unregister("nonexistent_signal")
        assert result_nonexistent is False, "Unregistering non-existent signal should return False"
        
        print("✅ Successfully unregistered signal")
    
    def test_list_signals_with_filters(self, registry):
        """Test signal listing with various filters"""
        # Arrange - Register multiple signals with different properties
        signals_data = [
            ("technical_signal_1", SignalCategory.TECHNICAL, ["momentum", "rsi"]),
            ("technical_signal_2", SignalCategory.TECHNICAL, ["volume", "breakout"]),
            ("fundamental_signal", SignalCategory.FUNDAMENTAL, ["earnings", "growth"]),
            ("sentiment_signal", SignalCategory.SENTIMENT, ["news", "social"]),
            ("volatility_signal", SignalCategory.VOLATILITY, ["vix", "options"]),
        ]
        
        for name, category, tags in signals_data:
            def dummy_signal(input_data: SignalInput) -> SignalOutput:
                return TestFixtures.create_sample_signal_output()
            
            metadata = SignalMetadata(
                name=name,
                description=f"Test {category.value} signal",
                category=category,
                version="1.0.0",
                author="test_author",
                created_at=datetime.now(),
                parameters_schema={},
                required_data=[],
                lookback_periods=1,
                output_type="SignalOutput",
                tags=tags,
                documentation_url=None,
                is_deprecated=False,
                deprecation_message=None
            )
            
            registry.register(name, dummy_signal, metadata)
        
        # Test - List all signals
        all_signals = registry.list_signals()
        assert len(all_signals) == 5, "Should list all 5 signals"
        assert all(isinstance(name, str) for name in all_signals), "All items should be strings"
        
        # Test - Filter by category
        technical_signals = registry.list_signals(category=SignalCategory.TECHNICAL)
        assert len(technical_signals) == 2, "Should find 2 technical signals"
        assert "technical_signal_1" in technical_signals
        assert "technical_signal_2" in technical_signals
        
        # Test - Filter by tags
        momentum_signals = registry.list_signals(tags=["momentum"])
        assert len(momentum_signals) == 1, "Should find 1 signal with momentum tag"
        assert "technical_signal_1" in momentum_signals
        
        # Test - Combined filters
        technical_momentum = registry.list_signals(
            category=SignalCategory.TECHNICAL,
            tags=["momentum"]
        )
        assert len(technical_momentum) == 1, "Should find 1 technical momentum signal"
        assert "technical_signal_1" in technical_momentum
        
        # Test - No matches
        no_matches = registry.list_signals(tags=["nonexistent_tag"])
        assert len(no_matches) == 0, "Should find no signals with non-existent tag"
        
        print(f"✅ Successfully tested signal listing with {len(signals_data)} signals")
    
    def test_execute_signal(self, registry, sample_signal_input):
        """Test signal execution"""
        # Arrange - Register a signal that returns specific output
        expected_output = TestFixtures.create_sample_signal_output(SignalType.BUY)
        
        def test_signal(input_data: SignalInput) -> SignalOutput:
            # Verify input data is passed correctly
            assert input_data.symbol == sample_signal_input.symbol
            assert input_data.current_price == sample_signal_input.current_price
            return expected_output
        
        metadata = SignalMetadata(
            name="execution_test",
            description="Signal for execution testing",
            category=SignalCategory.TECHNICAL,
            version="1.0.0",
            author="test_author",
            created_at=datetime.now(),
            parameters_schema={},
            required_data=[],
            lookback_periods=1,
            output_type="SignalOutput",
            tags=[],
            documentation_url=None,
            is_deprecated=False,
            deprecation_message=None
        )
        
        registry.register("execution_test", test_signal, metadata)
        
        # Act - Execute the signal
        result = registry.execute_signal("execution_test", sample_signal_input)
        
        # Assert - Verify execution result
        assert result is not None, "Signal should return output"
        assert result.signal_type == SignalType.BUY
        assert result.confidence == expected_output.confidence
        assert result.reasoning == expected_output.reasoning
        
        # Verify usage statistics were updated
        registered_signal = registry.get_signal("execution_test")
        assert registered_signal.usage_count == 1, "Usage count should be incremented"
        assert registered_signal.last_used is not None, "Last used time should be set"
        
        print("✅ Successfully executed signal")
    
    def test_execute_nonexistent_signal(self, registry, sample_signal_input):
        """Test execution of non-existent signal"""
        # Act & Assert - Execute non-existent signal should raise error
        with pytest.raises(SignalNotFoundError) as exc_info:
            registry.execute_signal("nonexistent_signal", sample_signal_input)
        
        assert "not found in registry" in str(exc_info.value)
        
        print("✅ Successfully handled non-existent signal execution")
    
    @pytest.mark.asyncio
    async def test_execute_async_signal(self, registry, sample_signal_input):
        """Test async signal execution"""
        # Arrange - Register an async signal
        expected_outputs = (
            TestFixtures.create_sample_signal_output(SignalType.BUY),
            TestFixtures.create_sample_signal_output(SignalType.SELL)
        )
        
        async def async_test_signal(input_data: SignalInput) -> Tuple[SignalOutput, ...]:
            # Simulate async processing
            await asyncio.sleep(0.01)
            return expected_outputs
        
        metadata = SignalMetadata(
            name="async_execution_test",
            description="Async signal for execution testing",
            category=SignalCategory.TECHNICAL,
            version="1.0.0",
            author="test_author",
            created_at=datetime.now(),
            parameters_schema={},
            required_data=[],
            lookback_periods=1,
            output_type="Tuple[SignalOutput, ...]",
            tags=[],
            documentation_url=None,
            is_deprecated=False,
            deprecation_message=None
        )
        
        registry.register("async_execution_test", async_test_signal, metadata)
        
        # Act - Execute the async signal
        result = await registry.execute_signal_async("async_execution_test", sample_signal_input)
        
        # Assert - Verify execution result
        assert isinstance(result, tuple), "Result should be a tuple"
        assert len(result) == 2, "Should return 2 signals"
        assert result[0].signal_type == SignalType.BUY
        assert result[1].signal_type == SignalType.SELL
        
        print("✅ Successfully executed async signal")


class TestSignalDecorator:
    """Test suite for the @signal decorator"""
    
    def test_signal_decorator_basic(self):
        """Test basic signal decorator functionality"""
        # Act - Use decorator to register a signal
        @signal(
            name="decorated_signal",
            description="Signal registered via decorator",
            category=SignalCategory.MOMENTUM,
            tags=["decorator", "test"]
        )
        def my_signal(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_signal_output()
        
        # Assert - Verify signal was registered
        registered_signal = get_signal("decorated_signal")
        assert registered_signal is not None, "Decorated signal should be registered"
        assert registered_signal.metadata.name == "decorated_signal"
        assert registered_signal.metadata.category == SignalCategory.MOMENTUM
        assert "decorator" in registered_signal.metadata.tags
        
        # Verify function is still callable
        sample_input = TestFixtures.create_sample_signal_input()
        result = my_signal(sample_input)
        assert isinstance(result, SignalOutput)
        
        print("✅ Successfully tested signal decorator")
    
    def test_signal_decorator_auto_name(self):
        """Test decorator with automatic name detection"""
        # Act - Use decorator without explicit name
        @signal(description="Auto-named signal", category=SignalCategory.TECHNICAL)
        def auto_named_signal(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_signal_output()
        
        # Assert - Verify signal uses function name
        registered_signal = get_signal("auto_named_signal")
        assert registered_signal is not None, "Auto-named signal should be registered"
        assert registered_signal.metadata.name == "auto_named_signal"
        
        print("✅ Successfully tested auto-naming decorator")


class TestGlobalRegistryFunctions:
    """Test suite for global registry convenience functions"""
    
    def test_global_registry_functions(self):
        """Test global registry convenience functions"""
        # Arrange - Register a signal using decorator
        @signal(name="global_test", category=SignalCategory.TECHNICAL)
        def global_test_signal(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_signal_output()
        
        # Test get_signal
        signal_info = get_signal("global_test")
        assert signal_info is not None, "Should find registered signal"
        
        # Test list_signals
        all_signals = list_signals()
        assert "global_test" in all_signals, "Should list registered signal"
        
        # Test execute_signal
        sample_input = TestFixtures.create_sample_signal_input()
        result = execute_signal("global_test", sample_input)
        assert result is not None, "Should execute signal successfully"
        
        # Test get_registry_stats
        stats = get_registry_stats()
        assert stats['total_signals'] >= 1, "Should show at least 1 signal"
        assert stats['active_signals'] >= 1, "Should show at least 1 active signal"
        
        print("✅ Successfully tested global registry functions")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
