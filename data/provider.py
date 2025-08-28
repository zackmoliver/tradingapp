"""
Data Provider Interfaces - Options Trading Backtest Engine

This module defines the abstract interfaces for market data providers.
All implementations must conform to these contracts for type safety and testability.

NO BUSINESS LOGIC - INTERFACES ONLY
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, date
from decimal import Decimal
from typing import Protocol, Optional, List, Dict, Any, AsyncIterator
from enum import Enum


# Core Data Types
@dataclass(frozen=True)
class OHLCVBar:
    """Immutable OHLCV bar data"""
    symbol: str
    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int
    adjusted_close: Optional[Decimal] = None


@dataclass(frozen=True)
class OptionContract:
    """Individual option contract data"""
    symbol: str
    underlying: str
    expiration: datetime
    strike: Decimal
    option_type: str  # 'call' or 'put'
    bid: Optional[Decimal]
    ask: Optional[Decimal]
    last: Optional[Decimal]
    volume: int
    open_interest: int
    implied_volatility: Optional[Decimal]
    delta: Optional[Decimal]
    gamma: Optional[Decimal]
    theta: Optional[Decimal]
    vega: Optional[Decimal]
    rho: Optional[Decimal]


@dataclass(frozen=True)
class OptionsChain:
    """Complete options chain for an underlying"""
    underlying: str
    timestamp: datetime
    underlying_price: Decimal
    contracts: List[OptionContract]


class DataQuality(Enum):
    """Data quality indicators"""
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class DataQualityReport:
    """Data quality assessment"""
    symbol: str
    timestamp: datetime
    quality: DataQuality
    missing_data_percentage: Decimal
    outlier_count: int
    gaps_detected: int
    issues: List[str]
    metadata: Dict[str, Any]


class TimeFrame(Enum):
    """Supported time frames for OHLCV data"""
    MINUTE_1 = "1m"
    MINUTE_5 = "5m"
    MINUTE_15 = "15m"
    MINUTE_30 = "30m"
    HOUR_1 = "1h"
    HOUR_4 = "4h"
    DAILY = "1d"
    WEEKLY = "1w"
    MONTHLY = "1M"


class MarketDataProvider(Protocol):
    """
    Abstract interface for market data providers.
    
    All market data providers must implement this protocol to ensure
    consistent behavior across different data sources.
    """

    @abstractmethod
    async def get_ohlcv(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        timeframe: TimeFrame = TimeFrame.DAILY
    ) -> List[OHLCVBar]:
        """
        Fetch OHLCV data for a symbol within date range.
        
        Args:
            symbol: Stock/ETF symbol (e.g., 'AAPL', 'SPY')
            start_date: Start of date range (inclusive)
            end_date: End of date range (inclusive)
            timeframe: Data granularity
            
        Returns:
            List of OHLCV bars sorted by timestamp
            
        Raises:
            ProviderError: When data cannot be retrieved
            ValidationError: When parameters are invalid
        """
        ...

    @abstractmethod
    async def get_current_price(self, symbol: str) -> Decimal:
        """
        Get current/latest price for a symbol.
        
        Args:
            symbol: Stock/ETF symbol
            
        Returns:
            Current price
            
        Raises:
            ProviderError: When price cannot be retrieved
        """
        ...

    @abstractmethod
    async def get_historical_prices(
        self,
        symbols: List[str],
        date: datetime
    ) -> Dict[str, Decimal]:
        """
        Get historical prices for multiple symbols on a specific date.
        
        Args:
            symbols: List of symbols to fetch
            date: Specific date for prices
            
        Returns:
            Dictionary mapping symbol to price
            
        Raises:
            ProviderError: When prices cannot be retrieved
        """
        ...

    @abstractmethod
    async def validate_symbol(self, symbol: str) -> bool:
        """
        Validate if a symbol exists and is tradeable.
        
        Args:
            symbol: Symbol to validate
            
        Returns:
            True if symbol is valid and tradeable
        """
        ...

    @abstractmethod
    def get_supported_symbols(self) -> List[str]:
        """
        Get list of all supported symbols.
        
        Returns:
            List of supported symbol strings
        """
        ...

    @abstractmethod
    def get_rate_limits(self) -> Dict[str, int]:
        """
        Get current rate limit information.
        
        Returns:
            Dictionary with rate limit details:
            - requests_per_minute: Max requests per minute
            - requests_per_day: Max requests per day
            - remaining_requests: Remaining requests in current period
        """
        ...


class OptionsDataProvider(Protocol):
    """
    Abstract interface for options data providers.
    
    Extends market data capabilities with options-specific functionality.
    """

    @abstractmethod
    async def get_options_chain(
        self,
        underlying: str,
        expiration_date: Optional[datetime] = None
    ) -> OptionsChain:
        """
        Fetch complete options chain for an underlying.
        
        Args:
            underlying: Underlying symbol (e.g., 'AAPL')
            expiration_date: Specific expiration (None for all)
            
        Returns:
            Complete options chain with all contracts
            
        Raises:
            ProviderError: When options data cannot be retrieved
        """
        ...

    @abstractmethod
    async def get_option_contract(
        self,
        symbol: str
    ) -> OptionContract:
        """
        Fetch specific option contract data.
        
        Args:
            symbol: Option symbol (e.g., 'AAPL240315C00150000')
            
        Returns:
            Option contract with current data
            
        Raises:
            ProviderError: When contract cannot be retrieved
        """
        ...

    @abstractmethod
    async def get_expiration_dates(
        self,
        underlying: str
    ) -> List[datetime]:
        """
        Get all available expiration dates for an underlying.
        
        Args:
            underlying: Underlying symbol
            
        Returns:
            List of expiration dates sorted chronologically
        """
        ...

    @abstractmethod
    async def get_strike_prices(
        self,
        underlying: str,
        expiration_date: datetime
    ) -> List[Decimal]:
        """
        Get all available strike prices for a specific expiration.
        
        Args:
            underlying: Underlying symbol
            expiration_date: Option expiration date
            
        Returns:
            List of strike prices sorted numerically
        """
        ...

    @abstractmethod
    async def get_implied_volatility_surface(
        self,
        underlying: str
    ) -> Dict[str, Dict[Decimal, Decimal]]:
        """
        Get implied volatility surface for an underlying.
        
        Args:
            underlying: Underlying symbol
            
        Returns:
            Dictionary mapping expiration_date -> strike -> IV
        """
        ...


class DataQualityValidator(Protocol):
    """
    Interface for data quality validation and assessment.
    """

    @abstractmethod
    async def validate_ohlcv(
        self,
        data: List[OHLCVBar]
    ) -> DataQualityReport:
        """
        Validate OHLCV data quality.
        
        Args:
            data: List of OHLCV bars to validate
            
        Returns:
            Data quality assessment report
        """
        ...

    @abstractmethod
    async def validate_options_chain(
        self,
        chain: OptionsChain
    ) -> DataQualityReport:
        """
        Validate options chain data quality.
        
        Args:
            chain: Options chain to validate
            
        Returns:
            Data quality assessment report
        """
        ...

    @abstractmethod
    def detect_outliers(
        self,
        data: List[OHLCVBar],
        threshold: Decimal = Decimal('3.0')
    ) -> List[int]:
        """
        Detect outliers in OHLCV data.
        
        Args:
            data: OHLCV data to analyze
            threshold: Standard deviation threshold for outliers
            
        Returns:
            List of indices where outliers were detected
        """
        ...

    @abstractmethod
    def detect_gaps(
        self,
        data: List[OHLCVBar],
        expected_timeframe: TimeFrame
    ) -> List[datetime]:
        """
        Detect missing data gaps.
        
        Args:
            data: OHLCV data to analyze
            expected_timeframe: Expected data frequency
            
        Returns:
            List of timestamps where gaps were detected
        """
        ...


# Exception Types
class ProviderError(Exception):
    """Base exception for data provider errors"""
    pass


class ValidationError(ProviderError):
    """Exception for data validation errors"""
    pass


class RateLimitError(ProviderError):
    """Exception for rate limit violations"""
    pass


class SymbolNotFoundError(ProviderError):
    """Exception for invalid/unknown symbols"""
    pass


class DataUnavailableError(ProviderError):
    """Exception for temporarily unavailable data"""
    pass
