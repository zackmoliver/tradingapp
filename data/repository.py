"""
Data Repository Interfaces - Options Trading Backtest Engine

This module defines the abstract interfaces for data persistence and retrieval.
All repository implementations must conform to these contracts for consistent
data access patterns across different storage backends.

NO BUSINESS LOGIC - INTERFACES ONLY
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, date
from decimal import Decimal
from typing import Protocol, Optional, List, Dict, Any, Generic, TypeVar, Union
from enum import Enum
import uuid

# Import data types from provider module
from .provider import OHLCVBar, OptionContract, OptionsChain, DataQualityReport

# Generic type variables
T = TypeVar('T')
K = TypeVar('K')
V = TypeVar('V')


# Core Repository Data Types
@dataclass(frozen=True)
class BacktestRun:
    """Immutable backtest execution record"""
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
    status: str  # 'running', 'completed', 'failed'
    parameters: Dict[str, Any]
    metadata: Dict[str, Any]


@dataclass(frozen=True)
class StrategyConfiguration:
    """Strategy configuration and parameters"""
    config_id: str
    strategy_name: str
    version: str
    parameters: Dict[str, Any]
    risk_parameters: Dict[str, Any]
    created_at: datetime
    created_by: str
    is_active: bool
    description: Optional[str]
    tags: List[str]


@dataclass(frozen=True)
class SignalRecord:
    """Persisted trading signal"""
    signal_id: str
    strategy_id: str
    run_id: Optional[str]
    symbol: str
    signal_type: str  # 'buy', 'sell', 'hold', 'close'
    strength: str  # 'weak', 'moderate', 'strong'
    confidence: Decimal
    timestamp: datetime
    price: Optional[Decimal]
    quantity: Optional[Decimal]
    metadata: Dict[str, Any]
    processed: bool


@dataclass(frozen=True)
class PerformanceMetrics:
    """Performance metrics snapshot"""
    metrics_id: str
    run_id: str
    timestamp: datetime
    portfolio_value: Decimal
    cash: Decimal
    positions_value: Decimal
    unrealized_pnl: Decimal
    realized_pnl: Decimal
    drawdown: Decimal
    metrics: Dict[str, Decimal]


class QueryOperator(Enum):
    """Query operators for filtering"""
    EQUALS = "eq"
    NOT_EQUALS = "ne"
    GREATER_THAN = "gt"
    GREATER_EQUAL = "gte"
    LESS_THAN = "lt"
    LESS_EQUAL = "lte"
    IN = "in"
    NOT_IN = "not_in"
    LIKE = "like"
    BETWEEN = "between"


@dataclass(frozen=True)
class QueryFilter:
    """Query filter specification"""
    field: str
    operator: QueryOperator
    value: Any
    case_sensitive: bool = True


@dataclass(frozen=True)
class QueryOptions:
    """Query execution options"""
    filters: List[QueryFilter]
    order_by: Optional[str] = None
    order_desc: bool = False
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass(frozen=True)
class QueryResult(Generic[T]):
    """Generic query result container"""
    data: List[T]
    total_count: int
    has_more: bool
    query_time_ms: int


class DataRepository(Protocol, Generic[T]):
    """
    Generic repository interface for data persistence.
    
    Provides CRUD operations and querying capabilities for any data type.
    Implementations handle the specific storage backend details.
    """

    @abstractmethod
    async def create(self, entity: T) -> str:
        """
        Create a new entity in the repository.
        
        Args:
            entity: Entity to create
            
        Returns:
            Unique identifier for the created entity
            
        Raises:
            RepositoryError: When creation fails
            ValidationError: When entity validation fails
        """
        ...

    @abstractmethod
    async def get_by_id(self, entity_id: str) -> Optional[T]:
        """
        Retrieve entity by unique identifier.
        
        Args:
            entity_id: Unique identifier
            
        Returns:
            Entity if found, None otherwise
            
        Raises:
            RepositoryError: When retrieval fails
        """
        ...

    @abstractmethod
    async def update(self, entity_id: str, entity: T) -> bool:
        """
        Update existing entity.
        
        Args:
            entity_id: Unique identifier
            entity: Updated entity data
            
        Returns:
            True if update successful, False if entity not found
            
        Raises:
            RepositoryError: When update fails
            ValidationError: When entity validation fails
        """
        ...

    @abstractmethod
    async def delete(self, entity_id: str) -> bool:
        """
        Delete entity by identifier.
        
        Args:
            entity_id: Unique identifier
            
        Returns:
            True if deletion successful, False if entity not found
            
        Raises:
            RepositoryError: When deletion fails
        """
        ...

    @abstractmethod
    async def query(self, options: QueryOptions) -> QueryResult[T]:
        """
        Query entities with filtering and pagination.
        
        Args:
            options: Query options including filters and pagination
            
        Returns:
            Query result with matching entities
            
        Raises:
            RepositoryError: When query fails
            ValidationError: When query options are invalid
        """
        ...

    @abstractmethod
    async def count(self, filters: List[QueryFilter]) -> int:
        """
        Count entities matching filters.
        
        Args:
            filters: List of query filters
            
        Returns:
            Number of matching entities
            
        Raises:
            RepositoryError: When count fails
        """
        ...

    @abstractmethod
    async def exists(self, entity_id: str) -> bool:
        """
        Check if entity exists.
        
        Args:
            entity_id: Unique identifier
            
        Returns:
            True if entity exists
            
        Raises:
            RepositoryError: When check fails
        """
        ...


class MarketDataRepository(Protocol):
    """
    Repository interface for market data persistence.
    
    Handles storage and retrieval of OHLCV data, options chains,
    and related market data with time-series optimizations.
    """

    @abstractmethod
    async def store_ohlcv(
        self,
        symbol: str,
        data: List[OHLCVBar],
        source: str
    ) -> int:
        """
        Store OHLCV data for a symbol.
        
        Args:
            symbol: Stock/ETF symbol
            data: List of OHLCV bars
            source: Data provider identifier
            
        Returns:
            Number of records stored
            
        Raises:
            RepositoryError: When storage fails
        """
        ...

    @abstractmethod
    async def get_ohlcv(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[OHLCVBar]:
        """
        Retrieve OHLCV data for date range.
        
        Args:
            symbol: Stock/ETF symbol
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            
        Returns:
            List of OHLCV bars sorted by timestamp
            
        Raises:
            RepositoryError: When retrieval fails
        """
        ...

    @abstractmethod
    async def store_options_chain(
        self,
        chain: OptionsChain,
        source: str
    ) -> int:
        """
        Store complete options chain.
        
        Args:
            chain: Options chain data
            source: Data provider identifier
            
        Returns:
            Number of contracts stored
            
        Raises:
            RepositoryError: When storage fails
        """
        ...

    @abstractmethod
    async def get_options_chain(
        self,
        underlying: str,
        timestamp: datetime,
        expiration_date: Optional[datetime] = None
    ) -> Optional[OptionsChain]:
        """
        Retrieve options chain for specific timestamp.
        
        Args:
            underlying: Underlying symbol
            timestamp: Data timestamp
            expiration_date: Specific expiration (None for all)
            
        Returns:
            Options chain if found
            
        Raises:
            RepositoryError: When retrieval fails
        """
        ...

    @abstractmethod
    async def get_available_symbols(self) -> List[str]:
        """
        Get all symbols with stored data.
        
        Returns:
            List of available symbols
        """
        ...

    @abstractmethod
    async def get_data_range(
        self,
        symbol: str
    ) -> Optional[tuple[datetime, datetime]]:
        """
        Get date range of available data for symbol.
        
        Args:
            symbol: Symbol to check
            
        Returns:
            Tuple of (start_date, end_date) if data exists
        """
        ...


class BacktestRepository(Protocol):
    """
    Repository interface for backtest data persistence.
    
    Handles storage of backtest runs, results, performance metrics,
    and related analytical data.
    """

    @abstractmethod
    async def create_backtest_run(
        self,
        run: BacktestRun
    ) -> str:
        """
        Create new backtest run record.
        
        Args:
            run: Backtest run data
            
        Returns:
            Run identifier
            
        Raises:
            RepositoryError: When creation fails
        """
        ...

    @abstractmethod
    async def update_backtest_status(
        self,
        run_id: str,
        status: str,
        completed_at: Optional[datetime] = None
    ) -> bool:
        """
        Update backtest run status.
        
        Args:
            run_id: Run identifier
            status: New status
            completed_at: Completion timestamp
            
        Returns:
            True if update successful
            
        Raises:
            RepositoryError: When update fails
        """
        ...

    @abstractmethod
    async def store_performance_metrics(
        self,
        run_id: str,
        metrics: List[PerformanceMetrics]
    ) -> int:
        """
        Store performance metrics for a run.
        
        Args:
            run_id: Backtest run identifier
            metrics: List of performance snapshots
            
        Returns:
            Number of metrics stored
            
        Raises:
            RepositoryError: When storage fails
        """
        ...

    @abstractmethod
    async def get_backtest_runs(
        self,
        strategy_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[BacktestRun]:
        """
        Retrieve backtest runs with optional filtering.
        
        Args:
            strategy_id: Filter by strategy
            start_date: Filter by run start date
            end_date: Filter by run end date
            
        Returns:
            List of matching backtest runs
            
        Raises:
            RepositoryError: When retrieval fails
        """
        ...

    @abstractmethod
    async def get_performance_history(
        self,
        run_id: str
    ) -> List[PerformanceMetrics]:
        """
        Get performance metrics history for a run.
        
        Args:
            run_id: Backtest run identifier
            
        Returns:
            List of performance metrics sorted by timestamp
            
        Raises:
            RepositoryError: When retrieval fails
        """
        ...


class SignalRepository(Protocol):
    """
    Repository interface for trading signals persistence.
    
    Handles storage and retrieval of generated trading signals
    with efficient querying capabilities.
    """

    @abstractmethod
    async def store_signals(
        self,
        signals: List[SignalRecord]
    ) -> int:
        """
        Store multiple trading signals.
        
        Args:
            signals: List of signal records
            
        Returns:
            Number of signals stored
            
        Raises:
            RepositoryError: When storage fails
        """
        ...

    @abstractmethod
    async def get_signals(
        self,
        strategy_id: Optional[str] = None,
        symbol: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        signal_type: Optional[str] = None,
        run_id: Optional[str] = None
    ) -> List[SignalRecord]:
        """
        Retrieve signals with optional filtering.
        
        Args:
            strategy_id: Filter by strategy
            symbol: Filter by symbol
            start_date: Filter by signal date
            end_date: Filter by signal date
            signal_type: Filter by signal type
            
        Returns:
            List of matching signals
            
        Raises:
            RepositoryError: When retrieval fails
        """
        ...

    @abstractmethod
    async def mark_signals_processed(
        self,
        signal_ids: List[str]
    ) -> int:
        """
        Mark signals as processed.
        
        Args:
            signal_ids: List of signal identifiers
            
        Returns:
            Number of signals updated
            
        Raises:
            RepositoryError: When update fails
        """
        ...


class CacheManager(Protocol):
    """
    Interface for caching layer management.
    
    Provides high-performance caching for frequently accessed data
    with configurable expiration and eviction policies.
    """

    @abstractmethod
    async def get(self, key: str) -> Optional[Any]:
        """
        Retrieve value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value if exists and not expired
        """
        ...

    @abstractmethod
    async def set(
        self,
        key: str,
        value: Any,
        ttl_seconds: Optional[int] = None
    ) -> bool:
        """
        Store value in cache.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl_seconds: Time to live in seconds
            
        Returns:
            True if stored successfully
        """
        ...

    @abstractmethod
    async def delete(self, key: str) -> bool:
        """
        Remove value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if key existed and was deleted
        """
        ...

    @abstractmethod
    async def clear(self, pattern: Optional[str] = None) -> int:
        """
        Clear cache entries.
        
        Args:
            pattern: Optional key pattern to match
            
        Returns:
            Number of entries cleared
        """
        ...

    @abstractmethod
    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache performance statistics.
        
        Returns:
            Dictionary with cache metrics
        """
        ...


# Exception Types
class RepositoryError(Exception):
    """Base exception for repository errors"""
    pass


class ValidationError(RepositoryError):
    """Exception for data validation errors"""
    pass


class ConnectionError(RepositoryError):
    """Exception for connection/infrastructure errors"""
    pass


class DataIntegrityError(RepositoryError):
    """Exception for data integrity violations"""
    pass


class QueryError(RepositoryError):
    """Exception for query execution errors"""
    pass
