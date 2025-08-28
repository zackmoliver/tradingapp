"""
Simple Signal Registry Test - Options Trading Backtest Engine

Basic test to validate the signal registry implementation without complex imports.
"""

import pytest
import sys
import os
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional, Callable, Union, Tuple, Any
from enum import Enum
from dataclasses import dataclass
import uuid

# Add path for imports
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Define minimal types for testing
class SignalType(Enum):
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"
    CLOSE = "close"

class SignalStrength(Enum):
    WEAK = "weak"
    MODERATE = "moderate"
    STRONG = "strong"

class SignalCategory(Enum):
    TECHNICAL = "technical"
    FUNDAMENTAL = "fundamental"
    SENTIMENT = "sentiment"
    MOMENTUM = "momentum"
    VOLATILITY = "volatility"
    CUSTOM = "custom"

@dataclass
class SignalInput:
    symbol: str
    timestamp: datetime
    current_price: Decimal
    parameters: Dict[str, Any]
    metadata: Dict[str, Any]

@dataclass
class SignalOutput:
    signal_id: str
    signal_type: SignalType
    strength: SignalStrength
    confidence: Decimal
    target_price: Decimal
    reasoning: str
    metadata: Dict[str, Any]

@dataclass
class SignalMetadata:
    name: str
    description: str
    category: SignalCategory
    version: str
    author: str
    created_at: datetime
    parameters_schema: Dict[str, Any]
    required_data: List[str]
    lookback_periods: int
    output_type: str
    tags: List[str]
    documentation_url: Optional[str]
    is_deprecated: bool
    deprecation_message: Optional[str]

@dataclass
class RegisteredSignal:
    function: Callable
    metadata: SignalMetadata
    validator: Optional[Callable] = None
    filters: List[Callable] = None
    is_active: bool = True
    registration_time: datetime = None
    last_used: Optional[datetime] = None
    usage_count: int = 0
    performance_metrics: Dict[str, Any] = None

# Custom exceptions
class SignalError(Exception):
    pass

class DuplicateSignalError(SignalError):
    pass

class SignalNotFoundError(SignalError):
    pass

# Simple registry implementation for testing
class SimpleSignalRegistry:
    def __init__(self):
        self._registry: Dict[str, RegisteredSignal] = {}
    
    def register(self, name: str, function: Callable, metadata: SignalMetadata, overwrite: bool = False) -> bool:
        if name in self._registry and not overwrite:
            raise DuplicateSignalError(f"Signal '{name}' already exists")
        
        registered_signal = RegisteredSignal(
            function=function,
            metadata=metadata,
            filters=[],
            registration_time=datetime.now(),
            usage_count=0,
            performance_metrics={}
        )
        
        self._registry[name] = registered_signal
        return True
    
    def get_signal(self, name: str) -> Optional[RegisteredSignal]:
        return self._registry.get(name)
    
    def list_signals(self, category: Optional[SignalCategory] = None) -> List[str]:
        signals = []
        for name, registered_signal in self._registry.items():
            if category is None or registered_signal.metadata.category == category:
                signals.append(name)
        return sorted(signals)
    
    def execute_signal(self, name: str, input_data: SignalInput) -> Optional[SignalOutput]:
        registered_signal = self._registry.get(name)
        if not registered_signal:
            raise SignalNotFoundError(f"Signal '{name}' not found")
        
        result = registered_signal.function(input_data)
        
        # Update usage count
        registered_signal.usage_count += 1
        registered_signal.last_used = datetime.now()
        
        return result
    
    def clear(self):
        self._registry.clear()

# Global registry for testing
_test_registry = SimpleSignalRegistry()

def signal_decorator(name: str = None, category: SignalCategory = SignalCategory.CUSTOM, description: str = ""):
    def decorator(func):
        signal_name = name or func.__name__
        metadata = SignalMetadata(
            name=signal_name,
            description=description or func.__doc__ or f"Signal: {signal_name}",
            category=category,
            version="1.0.0",
            author="test",
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
        
        _test_registry.register(signal_name, func, metadata)
        return func
    return decorator

# Test fixtures
class TestFixtures:
    @staticmethod
    def create_sample_input(symbol: str = "AAPL") -> SignalInput:
        return SignalInput(
            symbol=symbol,
            timestamp=datetime.now(),
            current_price=Decimal('150.50'),
            parameters={"lookback": 20},
            metadata={"source": "test"}
        )
    
    @staticmethod
    def create_sample_output(signal_type: SignalType = SignalType.BUY) -> SignalOutput:
        return SignalOutput(
            signal_id=str(uuid.uuid4()),
            signal_type=signal_type,
            strength=SignalStrength.STRONG,
            confidence=Decimal('0.85'),
            target_price=Decimal('155.00'),
            reasoning="Test signal",
            metadata={"test": True}
        )

@pytest.fixture(autouse=True)
def clear_registry():
    _test_registry.clear()
    yield
    _test_registry.clear()

class TestSimpleSignalRegistry:
    """Test the basic signal registry functionality"""
    
    def test_register_signal(self):
        """Test basic signal registration"""
        def test_signal(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_output()
        
        metadata = SignalMetadata(
            name="test_signal",
            description="Test signal",
            category=SignalCategory.TECHNICAL,
            version="1.0.0",
            author="test",
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
        
        result = _test_registry.register("test_signal", test_signal, metadata)
        assert result is True
        
        registered = _test_registry.get_signal("test_signal")
        assert registered is not None
        assert registered.metadata.name == "test_signal"
        
        print("✅ Successfully registered signal")
    
    def test_duplicate_registration_fails(self):
        """Test that duplicate registration fails"""
        def test_signal(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_output()
        
        metadata = SignalMetadata(
            name="duplicate_test",
            description="Test signal",
            category=SignalCategory.TECHNICAL,
            version="1.0.0",
            author="test",
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
        
        _test_registry.register("duplicate_test", test_signal, metadata)
        
        with pytest.raises(DuplicateSignalError):
            _test_registry.register("duplicate_test", test_signal, metadata)
        
        print("✅ Successfully prevented duplicate registration")
    
    def test_list_signals(self):
        """Test signal listing"""
        def signal1(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_output()
        
        def signal2(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_output()
        
        metadata1 = SignalMetadata(
            name="signal1", description="Signal 1", category=SignalCategory.TECHNICAL,
            version="1.0.0", author="test", created_at=datetime.now(),
            parameters_schema={}, required_data=[], lookback_periods=1,
            output_type="SignalOutput", tags=[], documentation_url=None,
            is_deprecated=False, deprecation_message=None
        )
        
        metadata2 = SignalMetadata(
            name="signal2", description="Signal 2", category=SignalCategory.MOMENTUM,
            version="1.0.0", author="test", created_at=datetime.now(),
            parameters_schema={}, required_data=[], lookback_periods=1,
            output_type="SignalOutput", tags=[], documentation_url=None,
            is_deprecated=False, deprecation_message=None
        )
        
        _test_registry.register("signal1", signal1, metadata1)
        _test_registry.register("signal2", signal2, metadata2)
        
        all_signals = _test_registry.list_signals()
        assert len(all_signals) == 2
        assert "signal1" in all_signals
        assert "signal2" in all_signals
        
        technical_signals = _test_registry.list_signals(category=SignalCategory.TECHNICAL)
        assert len(technical_signals) == 1
        assert "signal1" in technical_signals
        
        print("✅ Successfully listed signals with filtering")
    
    def test_execute_signal(self):
        """Test signal execution"""
        expected_output = TestFixtures.create_sample_output(SignalType.BUY)
        
        def test_signal(input_data: SignalInput) -> SignalOutput:
            assert input_data.symbol == "AAPL"
            return expected_output
        
        metadata = SignalMetadata(
            name="execution_test", description="Test execution", category=SignalCategory.TECHNICAL,
            version="1.0.0", author="test", created_at=datetime.now(),
            parameters_schema={}, required_data=[], lookback_periods=1,
            output_type="SignalOutput", tags=[], documentation_url=None,
            is_deprecated=False, deprecation_message=None
        )
        
        _test_registry.register("execution_test", test_signal, metadata)
        
        input_data = TestFixtures.create_sample_input("AAPL")
        result = _test_registry.execute_signal("execution_test", input_data)
        
        assert result is not None
        assert result.signal_type == SignalType.BUY
        assert result.confidence == expected_output.confidence
        
        # Check usage count was updated
        registered = _test_registry.get_signal("execution_test")
        assert registered.usage_count == 1
        assert registered.last_used is not None
        
        print("✅ Successfully executed signal")
    
    def test_signal_decorator(self):
        """Test the signal decorator"""
        @signal_decorator(name="decorated_signal", category=SignalCategory.MOMENTUM)
        def my_decorated_signal(input_data: SignalInput) -> SignalOutput:
            return TestFixtures.create_sample_output()
        
        registered = _test_registry.get_signal("decorated_signal")
        assert registered is not None
        assert registered.metadata.category == SignalCategory.MOMENTUM
        
        # Test execution
        input_data = TestFixtures.create_sample_input()
        result = my_decorated_signal(input_data)
        assert isinstance(result, SignalOutput)
        
        print("✅ Successfully tested signal decorator")
    
    def test_nonexistent_signal_execution(self):
        """Test execution of non-existent signal"""
        input_data = TestFixtures.create_sample_input()
        
        with pytest.raises(SignalNotFoundError):
            _test_registry.execute_signal("nonexistent", input_data)
        
        print("✅ Successfully handled non-existent signal")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
