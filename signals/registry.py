"""
Signal Registry Specifications - Options Trading Backtest Engine

This module defines the contracts and specifications for signal function
registration, discovery, and execution. All signal implementations must
conform to these contracts for consistent behavior and type safety.

NO BUSINESS LOGIC - SPECIFICATIONS ONLY
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, date
from decimal import Decimal
from typing import (
    Protocol, Optional, List, Dict, Any, Callable, TypeVar, Generic, 
    Union, Tuple, runtime_checkable, Type, ParamSpec, Concatenate
)
from enum import Enum
import inspect

# Import data types from other modules
from data.provider import OHLCVBar, OptionContract, OptionsChain
from engine.strategy import StrategyContext, MarketEvent


# Core Signal Data Types
class SignalType(Enum):
    """Types of trading signals"""
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"
    CLOSE = "close"
    BUY_TO_OPEN = "buy_to_open"
    SELL_TO_OPEN = "sell_to_open"
    BUY_TO_CLOSE = "buy_to_close"
    SELL_TO_CLOSE = "sell_to_close"


class SignalStrength(Enum):
    """Signal strength indicators"""
    WEAK = "weak"
    MODERATE = "moderate"
    STRONG = "strong"


class SignalCategory(Enum):
    """Signal categorization for organization"""
    TECHNICAL = "technical"
    FUNDAMENTAL = "fundamental"
    SENTIMENT = "sentiment"
    VOLATILITY = "volatility"
    MOMENTUM = "momentum"
    MEAN_REVERSION = "mean_reversion"
    BREAKOUT = "breakout"
    OPTIONS_FLOW = "options_flow"
    CUSTOM = "custom"


@dataclass(frozen=True)
class SignalMetadata:
    """Metadata for signal function registration"""
    name: str
    description: str
    category: SignalCategory
    version: str
    author: str
    created_at: datetime
    parameters_schema: Dict[str, Any]  # JSON schema for parameters
    required_data: List[str]  # Required data types: 'ohlcv', 'options', 'volume'
    lookback_periods: int  # Number of historical periods needed
    output_type: str  # Type of signal output
    tags: List[str]
    documentation_url: Optional[str]
    is_deprecated: bool
    deprecation_message: Optional[str]


@dataclass(frozen=True)
class SignalInput:
    """Input data structure for signal functions"""
    symbol: str
    timestamp: datetime
    current_price: Decimal
    historical_data: List[OHLCVBar]
    options_chain: Optional[OptionsChain]
    market_event: Optional[MarketEvent]
    context: StrategyContext
    parameters: Dict[str, Any]
    metadata: Dict[str, Any]


@dataclass(frozen=True)
class SignalOutput:
    """Output structure from signal functions"""
    signal_id: str
    signal_type: SignalType
    strength: SignalStrength
    confidence: Decimal  # 0.0 to 1.0
    target_price: Optional[Decimal]
    target_quantity: Optional[Decimal]
    stop_loss: Optional[Decimal]
    take_profit: Optional[Decimal]
    expiry: Optional[datetime]
    reasoning: str
    supporting_data: Dict[str, Any]
    metadata: Dict[str, Any]


@dataclass(frozen=True)
class SignalValidationResult:
    """Result of signal validation"""
    is_valid: bool
    errors: List[str]
    warnings: List[str]
    normalized_output: Optional[SignalOutput]


# Type definitions for signal functions
P = ParamSpec('P')
SignalFunction = Callable[[SignalInput], SignalOutput]
AsyncSignalFunction = Callable[[SignalInput], Tuple[SignalOutput, ...]]  # Can return multiple signals
SignalValidator = Callable[[SignalOutput], SignalValidationResult]
SignalFilter = Callable[[SignalOutput], bool]


@runtime_checkable
class SignalFunctionProtocol(Protocol):
    """
    Protocol that all signal functions must implement.
    
    Signal functions must be callable with SignalInput and return SignalOutput.
    They should be pure functions without side effects for testability.
    """
    
    def __call__(self, input_data: SignalInput) -> SignalOutput:
        """
        Process input data and generate trading signal.
        
        Args:
            input_data: Complete input data structure
            
        Returns:
            Generated trading signal
            
        Raises:
            SignalError: When signal generation fails
            ValidationError: When input validation fails
        """
        ...


@runtime_checkable
class AsyncSignalFunctionProtocol(Protocol):
    """
    Protocol for async signal functions that may return multiple signals.
    """
    
    async def __call__(self, input_data: SignalInput) -> Tuple[SignalOutput, ...]:
        """
        Asynchronously process input data and generate trading signals.
        
        Args:
            input_data: Complete input data structure
            
        Returns:
            Tuple of generated trading signals (can be empty)
            
        Raises:
            SignalError: When signal generation fails
            ValidationError: When input validation fails
        """
        ...


@dataclass(frozen=True)
class RegisteredSignal:
    """Complete registered signal information"""
    function: Union[SignalFunction, AsyncSignalFunction]
    metadata: SignalMetadata
    validator: Optional[SignalValidator]
    filters: List[SignalFilter]
    is_active: bool
    registration_time: datetime
    last_used: Optional[datetime]
    usage_count: int
    performance_metrics: Dict[str, Any]


class SignalRegistry(Protocol):
    """
    Protocol for signal function registry.
    
    Manages registration, discovery, and execution of signal functions
    with type safety and metadata tracking.
    """

    @abstractmethod
    def register(
        self,
        name: str,
        function: Union[SignalFunction, AsyncSignalFunction],
        metadata: SignalMetadata,
        validator: Optional[SignalValidator] = None,
        filters: Optional[List[SignalFilter]] = None,
        overwrite: bool = False
    ) -> bool:
        """
        Register a signal function with metadata.
        
        Args:
            name: Unique signal name
            function: Signal function implementation
            metadata: Signal metadata and documentation
            validator: Optional output validator
            filters: Optional output filters
            overwrite: Whether to overwrite existing registration
            
        Returns:
            True if registration successful
            
        Raises:
            RegistrationError: When registration fails
            DuplicateSignalError: When signal already exists and overwrite=False
        """
        ...

    @abstractmethod
    def unregister(self, name: str) -> bool:
        """
        Unregister a signal function.
        
        Args:
            name: Signal name to unregister
            
        Returns:
            True if signal was found and removed
        """
        ...

    @abstractmethod
    def get_signal(self, name: str) -> Optional[RegisteredSignal]:
        """
        Get registered signal by name.
        
        Args:
            name: Signal name to retrieve
            
        Returns:
            Registered signal if found
        """
        ...

    @abstractmethod
    def list_signals(
        self,
        category: Optional[SignalCategory] = None,
        tags: Optional[List[str]] = None,
        active_only: bool = True
    ) -> List[str]:
        """
        List available signal names with optional filtering.
        
        Args:
            category: Filter by signal category
            tags: Filter by tags (must have all tags)
            active_only: Only return active signals
            
        Returns:
            List of matching signal names
        """
        ...

    @abstractmethod
    def get_metadata(self, name: str) -> Optional[SignalMetadata]:
        """
        Get signal metadata by name.
        
        Args:
            name: Signal name
            
        Returns:
            Signal metadata if found
        """
        ...

    @abstractmethod
    def validate_signal_function(
        self,
        function: Union[SignalFunction, AsyncSignalFunction]
    ) -> List[str]:
        """
        Validate signal function signature and requirements.
        
        Args:
            function: Function to validate
            
        Returns:
            List of validation errors (empty if valid)
        """
        ...

    @abstractmethod
    def execute_signal(
        self,
        name: str,
        input_data: SignalInput
    ) -> Optional[SignalOutput]:
        """
        Execute registered signal function.
        
        Args:
            name: Signal name to execute
            input_data: Input data for signal
            
        Returns:
            Signal output if execution successful
            
        Raises:
            SignalNotFoundError: When signal doesn't exist
            SignalExecutionError: When execution fails
        """
        ...

    @abstractmethod
    async def execute_signal_async(
        self,
        name: str,
        input_data: SignalInput
    ) -> Tuple[SignalOutput, ...]:
        """
        Execute registered async signal function.
        
        Args:
            name: Signal name to execute
            input_data: Input data for signal
            
        Returns:
            Tuple of signal outputs
            
        Raises:
            SignalNotFoundError: When signal doesn't exist
            SignalExecutionError: When execution fails
        """
        ...

    @abstractmethod
    def get_registry_stats(self) -> Dict[str, Any]:
        """
        Get registry statistics and performance metrics.
        
        Returns:
            Dictionary with registry statistics
        """
        ...


class SignalDecorator(Protocol):
    """
    Protocol for signal registration decorator.
    
    Provides decorator interface for registering signal functions
    with metadata and validation.
    """

    def __call__(
        self,
        name: Optional[str] = None,
        description: Optional[str] = None,
        category: SignalCategory = SignalCategory.CUSTOM,
        version: str = "1.0.0",
        author: str = "unknown",
        parameters_schema: Optional[Dict[str, Any]] = None,
        required_data: Optional[List[str]] = None,
        lookback_periods: int = 1,
        tags: Optional[List[str]] = None,
        validator: Optional[SignalValidator] = None,
        filters: Optional[List[SignalFilter]] = None
    ) -> Callable[[Union[SignalFunction, AsyncSignalFunction]], Union[SignalFunction, AsyncSignalFunction]]:
        """
        Decorator for registering signal functions.
        
        Args:
            name: Signal name (defaults to function name)
            description: Signal description
            category: Signal category
            version: Signal version
            author: Signal author
            parameters_schema: JSON schema for parameters
            required_data: Required data types
            lookback_periods: Historical periods needed
            tags: Signal tags
            validator: Output validator
            filters: Output filters
            
        Returns:
            Decorated function
        """
        ...


# Global registry type specification
SIGNAL_REGISTRY: Dict[str, RegisteredSignal] = {}


# Utility type definitions
SignalExecutor = Callable[[str, SignalInput], Optional[SignalOutput]]
AsyncSignalExecutor = Callable[[str, SignalInput], Tuple[SignalOutput, ...]]
SignalDiscovery = Callable[[Optional[SignalCategory], Optional[List[str]]], List[str]]


# Signal composition types
class SignalComposer(Protocol):
    """
    Protocol for composing multiple signals into combined signals.
    """

    @abstractmethod
    def combine_signals(
        self,
        signals: List[SignalOutput],
        combination_method: str,
        weights: Optional[List[Decimal]] = None
    ) -> SignalOutput:
        """
        Combine multiple signals into a single signal.
        
        Args:
            signals: List of signals to combine
            combination_method: Method for combination ('weighted', 'majority', 'consensus')
            weights: Optional weights for signals
            
        Returns:
            Combined signal
        """
        ...

    @abstractmethod
    def filter_signals(
        self,
        signals: List[SignalOutput],
        filters: List[SignalFilter]
    ) -> List[SignalOutput]:
        """
        Apply filters to signal list.
        
        Args:
            signals: Signals to filter
            filters: List of filter functions
            
        Returns:
            Filtered signals
        """
        ...


# Exception Types
class SignalError(Exception):
    """Base exception for signal-related errors"""
    pass


class RegistrationError(SignalError):
    """Exception for signal registration errors"""
    pass


class DuplicateSignalError(RegistrationError):
    """Exception for duplicate signal registration"""
    pass


class SignalNotFoundError(SignalError):
    """Exception for signal not found errors"""
    pass


class SignalExecutionError(SignalError):
    """Exception for signal execution errors"""
    pass


class ValidationError(SignalError):
    """Exception for signal validation errors"""
    pass


class InvalidSignatureError(RegistrationError):
    """Exception for invalid signal function signature"""
    pass


# Type aliases for common patterns
SignalMap = Dict[str, RegisteredSignal]
SignalNameList = List[str]
SignalOutputList = List[SignalOutput]
SignalMetadataMap = Dict[str, SignalMetadata]

# --- Batch 9 placeholders: import stubs ---
try:
from .stock_patterns import head_and_shoulders, triangle_breakout, price_breakout
from .vwap import vwap as vwap_indicator
except Exception: # pragma: no cover
head_and_shoulders = triangle_breakout = price_breakout = lambda *a, **k: None
vwap_indicator = lambda *a, **k: None


# --- Registry entries (schemas/params are conservative defaults) ---
INDICATORS.update({
"head_shoulders": {
"name": "head_shoulders",
"inputs": ["ohlcv"],
"params": {"lookback": {"min": 50, "max": 200, "default": 100},
"tolerance": {"min": 0.0, "max": 0.1, "default": 0.02}},
"output_schema": {"dtype": "bool", "column": "head_shoulders"}
},
"triangle_breakout": {
"name": "triangle_breakout",
"inputs": ["ohlcv"],
"params": {"lookback": {"min": 30, "max": 120, "default": 60},
"breakout_pct": {"min": 0.005, "max": 0.05, "default": 0.01}},
"output_schema": {"dtype": "bool", "column": "triangle_breakout"}
},
"price_breakout": {
"name": "price_breakout",
"inputs": ["ohlcv"],
"params": {"lookback": {"min": 10, "max": 60, "default": 20},
"k": {"min": 1.0, "max": 3.0, "default": 2.0}},
"output_schema": {"dtype": "bool", "column": "price_breakout"}
},
"vwap": {
"name": "vwap",
"inputs": ["ohlcv"],
"params": {},
"output_schema": {"dtype": "float", "column": "vwap"}
}
})