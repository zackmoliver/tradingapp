"""
SQLite Repository Implementation - Options Trading Backtest Engine

This module provides concrete implementations of the repository interfaces
defined in the contracts phase, using SQLite as the underlying database.

BUSINESS LOGIC IMPLEMENTATION
"""

import sqlite3
import json
import asyncio
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any, Generic, TypeVar, Union
from contextlib import asynccontextmanager
import logging
from pathlib import Path

# Import contracts from data layer
from data.provider import OHLCVBar, OptionContract, OptionsChain
from data.repository import (
    DataRepository, MarketDataRepository, BacktestRepository, SignalRepository,
    CacheManager, QueryFilter, QueryOptions, QueryResult, QueryOperator,
    BacktestRun, StrategyConfiguration, SignalRecord, PerformanceMetrics,
    RepositoryError, ValidationError, ConnectionError, DataIntegrityError, QueryError
)

# Generic type variable
T = TypeVar('T')

logger = logging.getLogger(__name__)


class SQLiteConnection:
    """SQLite connection manager with async support"""
    
    def __init__(self, database_path: str):
        self.database_path = database_path
        self._connection: Optional[sqlite3.Connection] = None
        
    async def connect(self) -> sqlite3.Connection:
        """Establish database connection"""
        try:
            if self._connection is None:
                # Ensure database directory exists
                Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
                
                # Create connection with optimizations
                self._connection = sqlite3.connect(
                    self.database_path,
                    check_same_thread=False,
                    timeout=30.0
                )
                self._connection.row_factory = sqlite3.Row
                
                # Enable WAL mode for better concurrency
                self._connection.execute("PRAGMA journal_mode=WAL")
                self._connection.execute("PRAGMA synchronous=NORMAL")
                self._connection.execute("PRAGMA cache_size=10000")
                self._connection.execute("PRAGMA temp_store=MEMORY")
                
                await self._initialize_schema()
                
            return self._connection
            
        except sqlite3.Error as e:
            logger.error(f"Failed to connect to database: {e}")
            raise ConnectionError(f"Database connection failed: {e}")
    
    async def _initialize_schema(self):
        """Initialize database schema"""
        schema_sql = """
        -- Backtest runs table
        CREATE TABLE IF NOT EXISTS backtest_runs (
            run_id TEXT PRIMARY KEY,
            strategy_id TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            initial_capital REAL NOT NULL,
            final_capital REAL NOT NULL,
            total_return REAL NOT NULL,
            max_drawdown REAL NOT NULL,
            sharpe_ratio REAL NOT NULL,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            status TEXT NOT NULL,
            parameters TEXT NOT NULL,
            metadata TEXT NOT NULL
        );
        
        -- Strategy configurations table
        CREATE TABLE IF NOT EXISTS strategy_configurations (
            config_id TEXT PRIMARY KEY,
            strategy_name TEXT NOT NULL,
            version TEXT NOT NULL,
            parameters TEXT NOT NULL,
            risk_parameters TEXT NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            is_active INTEGER NOT NULL,
            description TEXT,
            tags TEXT NOT NULL
        );
        
        -- Signals table
        CREATE TABLE IF NOT EXISTS signals (
            signal_id TEXT PRIMARY KEY,
            strategy_id TEXT NOT NULL,
            run_id TEXT,
            symbol TEXT NOT NULL,
            signal_type TEXT NOT NULL,
            strength TEXT NOT NULL,
            confidence REAL NOT NULL,
            timestamp TEXT NOT NULL,
            price REAL,
            quantity REAL,
            metadata TEXT NOT NULL,
            processed INTEGER NOT NULL DEFAULT 0
        );
        
        -- Performance metrics table
        CREATE TABLE IF NOT EXISTS performance_metrics (
            metrics_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            portfolio_value REAL NOT NULL,
            cash REAL NOT NULL,
            positions_value REAL NOT NULL,
            unrealized_pnl REAL NOT NULL,
            realized_pnl REAL NOT NULL,
            drawdown REAL NOT NULL,
            metrics TEXT NOT NULL,
            FOREIGN KEY (run_id) REFERENCES backtest_runs (run_id)
        );
        
        -- OHLCV data table
        CREATE TABLE IF NOT EXISTS ohlcv_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            open_price REAL NOT NULL,
            high_price REAL NOT NULL,
            low_price REAL NOT NULL,
            close_price REAL NOT NULL,
            volume INTEGER NOT NULL,
            adjusted_close REAL,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(symbol, timestamp, source)
        );
        
        -- Options chain data table
        CREATE TABLE IF NOT EXISTS options_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            underlying TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            symbol TEXT NOT NULL,
            expiration TEXT NOT NULL,
            strike REAL NOT NULL,
            option_type TEXT NOT NULL,
            bid REAL,
            ask REAL,
            last REAL,
            volume INTEGER NOT NULL,
            open_interest INTEGER NOT NULL,
            implied_volatility REAL,
            delta REAL,
            gamma REAL,
            theta REAL,
            vega REAL,
            rho REAL,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(symbol, timestamp, source)
        );
        
        -- Create indexes for performance
        CREATE INDEX IF NOT EXISTS idx_backtest_runs_strategy ON backtest_runs(strategy_id);
        CREATE INDEX IF NOT EXISTS idx_backtest_runs_dates ON backtest_runs(start_date, end_date);
        CREATE INDEX IF NOT EXISTS idx_signals_strategy ON signals(strategy_id);
        CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
        CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
        CREATE INDEX IF NOT EXISTS idx_performance_run ON performance_metrics(run_id);
        CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_time ON ohlcv_data(symbol, timestamp);
        CREATE INDEX IF NOT EXISTS idx_options_underlying_time ON options_data(underlying, timestamp);
        """
        
        try:
            self._connection.executescript(schema_sql)
            self._connection.commit()
            logger.info("Database schema initialized successfully")
        except sqlite3.Error as e:
            logger.error(f"Failed to initialize schema: {e}")
            raise RepositoryError(f"Schema initialization failed: {e}")
    
    async def close(self):
        """Close database connection"""
        if self._connection:
            self._connection.close()
            self._connection = None
    
    @asynccontextmanager
    async def transaction(self):
        """Context manager for database transactions"""
        conn = await self.connect()
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Transaction rolled back: {e}")
            raise
    
    def _serialize_json(self, obj: Any) -> str:
        """Serialize object to JSON string"""
        def decimal_serializer(obj):
            if isinstance(obj, Decimal):
                return float(obj)
            raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
        
        return json.dumps(obj, default=decimal_serializer, ensure_ascii=False)
    
    def _deserialize_json(self, json_str: str) -> Any:
        """Deserialize JSON string to object"""
        return json.loads(json_str)


class SQLiteBacktestRepository(BacktestRepository):
    """SQLite implementation of BacktestRepository"""
    
    def __init__(self, database_path: str):
        self.db = SQLiteConnection(database_path)
    
    async def create_backtest_run(self, run: BacktestRun) -> str:
        """Create new backtest run record"""
        try:
            async with self.db.transaction() as conn:
                conn.execute("""
                    INSERT INTO backtest_runs (
                        run_id, strategy_id, start_date, end_date,
                        initial_capital, final_capital, total_return,
                        max_drawdown, sharpe_ratio, created_at,
                        completed_at, status, parameters, metadata
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    run.run_id, run.strategy_id,
                    run.start_date.isoformat(), run.end_date.isoformat(),
                    float(run.initial_capital), float(run.final_capital),
                    float(run.total_return), float(run.max_drawdown),
                    float(run.sharpe_ratio), run.created_at.isoformat(),
                    run.completed_at.isoformat() if run.completed_at else None,
                    run.status,
                    self.db._serialize_json(run.parameters),
                    self.db._serialize_json(run.metadata)
                ))
                
            logger.info(f"Created backtest run: {run.run_id}")
            return run.run_id
            
        except sqlite3.IntegrityError as e:
            logger.error(f"Backtest run already exists: {run.run_id}")
            raise ValidationError(f"Backtest run {run.run_id} already exists")
        except sqlite3.Error as e:
            logger.error(f"Failed to create backtest run: {e}")
            raise RepositoryError(f"Failed to create backtest run: {e}")
    
    async def update_backtest_status(
        self,
        run_id: str,
        status: str,
        completed_at: Optional[datetime] = None
    ) -> bool:
        """Update backtest run status"""
        try:
            async with self.db.transaction() as conn:
                # If completed_at is None, don't update that field
                if completed_at is not None:
                    cursor = conn.execute("""
                        UPDATE backtest_runs
                        SET status = ?, completed_at = ?
                        WHERE run_id = ?
                    """, (
                        status,
                        completed_at.isoformat(),
                        run_id
                    ))
                else:
                    cursor = conn.execute("""
                        UPDATE backtest_runs
                        SET status = ?
                        WHERE run_id = ?
                    """, (
                        status,
                        run_id
                    ))
                
                if cursor.rowcount == 0:
                    logger.warning(f"Backtest run not found: {run_id}")
                    return False
                
            logger.info(f"Updated backtest run status: {run_id} -> {status}")
            return True
            
        except sqlite3.Error as e:
            logger.error(f"Failed to update backtest status: {e}")
            raise RepositoryError(f"Failed to update backtest status: {e}")
    
    async def store_performance_metrics(
        self,
        run_id: str,
        metrics: List[PerformanceMetrics]
    ) -> int:
        """Store performance metrics for a run"""
        try:
            async with self.db.transaction() as conn:
                stored_count = 0
                for metric in metrics:
                    conn.execute("""
                        INSERT OR REPLACE INTO performance_metrics (
                            metrics_id, run_id, timestamp, portfolio_value,
                            cash, positions_value, unrealized_pnl,
                            realized_pnl, drawdown, metrics
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        metric.metrics_id, metric.run_id,
                        metric.timestamp.isoformat(),
                        float(metric.portfolio_value), float(metric.cash),
                        float(metric.positions_value),
                        float(metric.unrealized_pnl),
                        float(metric.realized_pnl),
                        float(metric.drawdown),
                        self.db._serialize_json(metric.metrics)
                    ))
                    stored_count += 1
                
            logger.info(f"Stored {stored_count} performance metrics for run: {run_id}")
            return stored_count
            
        except sqlite3.Error as e:
            logger.error(f"Failed to store performance metrics: {e}")
            raise RepositoryError(f"Failed to store performance metrics: {e}")
    
    async def get_backtest_runs(
        self,
        strategy_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[BacktestRun]:
        """Retrieve backtest runs with optional filtering"""
        try:
            conn = await self.db.connect()
            
            # Build query with filters
            query = "SELECT * FROM backtest_runs WHERE 1=1"
            params = []
            
            if strategy_id:
                query += " AND strategy_id = ?"
                params.append(strategy_id)
            
            if start_date:
                query += " AND start_date >= ?"
                params.append(start_date.isoformat())
            
            if end_date:
                query += " AND end_date <= ?"
                params.append(end_date.isoformat())
            
            query += " ORDER BY created_at DESC"
            
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            
            # Convert rows to BacktestRun objects
            runs = []
            for row in rows:
                run = BacktestRun(
                    run_id=row['run_id'],
                    strategy_id=row['strategy_id'],
                    start_date=datetime.fromisoformat(row['start_date']),
                    end_date=datetime.fromisoformat(row['end_date']),
                    initial_capital=Decimal(str(row['initial_capital'])),
                    final_capital=Decimal(str(row['final_capital'])),
                    total_return=Decimal(str(row['total_return'])),
                    max_drawdown=Decimal(str(row['max_drawdown'])),
                    sharpe_ratio=Decimal(str(row['sharpe_ratio'])),
                    created_at=datetime.fromisoformat(row['created_at']),
                    completed_at=datetime.fromisoformat(row['completed_at']) if row['completed_at'] else None,
                    status=row['status'],
                    parameters=self.db._deserialize_json(row['parameters']),
                    metadata=self.db._deserialize_json(row['metadata'])
                )
                runs.append(run)
            
            logger.info(f"Retrieved {len(runs)} backtest runs")
            return runs
            
        except sqlite3.Error as e:
            logger.error(f"Failed to retrieve backtest runs: {e}")
            raise RepositoryError(f"Failed to retrieve backtest runs: {e}")
    
    async def get_performance_history(self, run_id: str) -> List[PerformanceMetrics]:
        """Get performance metrics history for a run"""
        try:
            conn = await self.db.connect()
            cursor = conn.execute("""
                SELECT * FROM performance_metrics 
                WHERE run_id = ? 
                ORDER BY timestamp ASC
            """, (run_id,))
            
            rows = cursor.fetchall()
            
            # Convert rows to PerformanceMetrics objects
            metrics = []
            for row in rows:
                metric = PerformanceMetrics(
                    metrics_id=row['metrics_id'],
                    run_id=row['run_id'],
                    timestamp=datetime.fromisoformat(row['timestamp']),
                    portfolio_value=Decimal(str(row['portfolio_value'])),
                    cash=Decimal(str(row['cash'])),
                    positions_value=Decimal(str(row['positions_value'])),
                    unrealized_pnl=Decimal(str(row['unrealized_pnl'])),
                    realized_pnl=Decimal(str(row['realized_pnl'])),
                    drawdown=Decimal(str(row['drawdown'])),
                    metrics=self.db._deserialize_json(row['metrics'])
                )
                metrics.append(metric)
            
            logger.info(f"Retrieved {len(metrics)} performance metrics for run: {run_id}")
            return metrics
            
        except sqlite3.Error as e:
            logger.error(f"Failed to retrieve performance history: {e}")
            raise RepositoryError(f"Failed to retrieve performance history: {e}")


class SQLiteSignalRepository(SignalRepository):
    """SQLite implementation of SignalRepository"""
    
    def __init__(self, database_path: str):
        self.db = SQLiteConnection(database_path)
    
    async def store_signals(self, signals: List[SignalRecord]) -> int:
        """Store multiple trading signals"""
        try:
            async with self.db.transaction() as conn:
                stored_count = 0
                for signal in signals:
                    conn.execute("""
                        INSERT OR REPLACE INTO signals (
                            signal_id, strategy_id, run_id, symbol,
                            signal_type, strength, confidence, timestamp,
                            price, quantity, metadata, processed
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        signal.signal_id, signal.strategy_id, signal.run_id,
                        signal.symbol, signal.signal_type, signal.strength,
                        float(signal.confidence), signal.timestamp.isoformat(),
                        float(signal.price) if signal.price else None,
                        float(signal.quantity) if signal.quantity else None,
                        self.db._serialize_json(signal.metadata),
                        1 if signal.processed else 0
                    ))
                    stored_count += 1
                
            logger.info(f"Stored {stored_count} signals")
            return stored_count
            
        except sqlite3.Error as e:
            logger.error(f"Failed to store signals: {e}")
            raise RepositoryError(f"Failed to store signals: {e}")
    
    async def get_signals(
        self,
        strategy_id: Optional[str] = None,
        symbol: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        signal_type: Optional[str] = None,
        run_id: Optional[str] = None
    ) -> List[SignalRecord]:
        """Retrieve signals with optional filtering"""
        try:
            conn = await self.db.connect()
            
            # Build query with filters
            query = "SELECT * FROM signals WHERE 1=1"
            params = []
            
            if strategy_id:
                query += " AND strategy_id = ?"
                params.append(strategy_id)
            
            if symbol:
                query += " AND symbol = ?"
                params.append(symbol)
            
            if start_date:
                query += " AND timestamp >= ?"
                params.append(start_date.isoformat())
            
            if end_date:
                query += " AND timestamp <= ?"
                params.append(end_date.isoformat())
            
            if signal_type:
                query += " AND signal_type = ?"
                params.append(signal_type)

            if run_id:
                query += " AND run_id = ?"
                params.append(run_id)

            query += " ORDER BY timestamp DESC"
            
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            
            # Convert rows to SignalRecord objects
            signals = []
            for row in rows:
                signal = SignalRecord(
                    signal_id=row['signal_id'],
                    strategy_id=row['strategy_id'],
                    run_id=row['run_id'],
                    symbol=row['symbol'],
                    signal_type=row['signal_type'],
                    strength=row['strength'],
                    confidence=Decimal(str(row['confidence'])),
                    timestamp=datetime.fromisoformat(row['timestamp']),
                    price=Decimal(str(row['price'])) if row['price'] else None,
                    quantity=Decimal(str(row['quantity'])) if row['quantity'] else None,
                    metadata=self.db._deserialize_json(row['metadata']),
                    processed=bool(row['processed'])
                )
                signals.append(signal)
            
            logger.info(f"Retrieved {len(signals)} signals")
            return signals
            
        except sqlite3.Error as e:
            logger.error(f"Failed to retrieve signals: {e}")
            raise RepositoryError(f"Failed to retrieve signals: {e}")
    
    async def mark_signals_processed(self, signal_ids: List[str]) -> int:
        """Mark signals as processed"""
        try:
            async with self.db.transaction() as conn:
                placeholders = ','.join(['?' for _ in signal_ids])
                cursor = conn.execute(f"""
                    UPDATE signals 
                    SET processed = 1 
                    WHERE signal_id IN ({placeholders})
                """, signal_ids)
                
                updated_count = cursor.rowcount
                
            logger.info(f"Marked {updated_count} signals as processed")
            return updated_count
            
        except sqlite3.Error as e:
            logger.error(f"Failed to mark signals as processed: {e}")
            raise RepositoryError(f"Failed to mark signals as processed: {e}")


class SQLiteMarketDataRepository(MarketDataRepository):
    """SQLite implementation of MarketDataRepository"""

    def __init__(self, database_path: str):
        self.db = SQLiteConnection(database_path)

    async def store_ohlcv(
        self,
        symbol: str,
        data: List[OHLCVBar],
        source: str
    ) -> int:
        """Store OHLCV data for a symbol"""
        try:
            async with self.db.transaction() as conn:
                stored_count = 0
                for bar in data:
                    conn.execute("""
                        INSERT OR REPLACE INTO ohlcv_data (
                            symbol, timestamp, open_price, high_price,
                            low_price, close_price, volume, adjusted_close,
                            source, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        bar.symbol, bar.timestamp.isoformat(),
                        float(bar.open), float(bar.high),
                        float(bar.low), float(bar.close),
                        bar.volume,
                        float(bar.adjusted_close) if bar.adjusted_close else None,
                        source, datetime.now().isoformat()
                    ))
                    stored_count += 1

            logger.info(f"Stored {stored_count} OHLCV bars for {symbol}")
            return stored_count

        except sqlite3.Error as e:
            logger.error(f"Failed to store OHLCV data: {e}")
            raise RepositoryError(f"Failed to store OHLCV data: {e}")

    async def get_ohlcv(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[OHLCVBar]:
        """Retrieve OHLCV data for date range"""
        try:
            conn = await self.db.connect()
            cursor = conn.execute("""
                SELECT * FROM ohlcv_data
                WHERE symbol = ? AND timestamp >= ? AND timestamp <= ?
                ORDER BY timestamp ASC
            """, (symbol, start_date.isoformat(), end_date.isoformat()))

            rows = cursor.fetchall()

            # Convert rows to OHLCVBar objects
            bars = []
            for row in rows:
                bar = OHLCVBar(
                    symbol=row['symbol'],
                    timestamp=datetime.fromisoformat(row['timestamp']),
                    open=Decimal(str(row['open_price'])),
                    high=Decimal(str(row['high_price'])),
                    low=Decimal(str(row['low_price'])),
                    close=Decimal(str(row['close_price'])),
                    volume=row['volume'],
                    adjusted_close=Decimal(str(row['adjusted_close'])) if row['adjusted_close'] else None
                )
                bars.append(bar)

            logger.info(f"Retrieved {len(bars)} OHLCV bars for {symbol}")
            return bars

        except sqlite3.Error as e:
            logger.error(f"Failed to retrieve OHLCV data: {e}")
            raise RepositoryError(f"Failed to retrieve OHLCV data: {e}")

    async def store_options_chain(
        self,
        chain: OptionsChain,
        source: str
    ) -> int:
        """Store complete options chain"""
        try:
            async with self.db.transaction() as conn:
                stored_count = 0
                for contract in chain.contracts:
                    conn.execute("""
                        INSERT OR REPLACE INTO options_data (
                            underlying, timestamp, symbol, expiration,
                            strike, option_type, bid, ask, last,
                            volume, open_interest, implied_volatility,
                            delta, gamma, theta, vega, rho,
                            source, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        chain.underlying, chain.timestamp.isoformat(),
                        contract.symbol, contract.expiration.isoformat(),
                        float(contract.strike), contract.option_type,
                        float(contract.bid) if contract.bid else None,
                        float(contract.ask) if contract.ask else None,
                        float(contract.last) if contract.last else None,
                        contract.volume, contract.open_interest,
                        float(contract.implied_volatility) if contract.implied_volatility else None,
                        float(contract.delta) if contract.delta else None,
                        float(contract.gamma) if contract.gamma else None,
                        float(contract.theta) if contract.theta else None,
                        float(contract.vega) if contract.vega else None,
                        float(contract.rho) if contract.rho else None,
                        source, datetime.now().isoformat()
                    ))
                    stored_count += 1

            logger.info(f"Stored {stored_count} option contracts for {chain.underlying}")
            return stored_count

        except sqlite3.Error as e:
            logger.error(f"Failed to store options chain: {e}")
            raise RepositoryError(f"Failed to store options chain: {e}")

    async def get_options_chain(
        self,
        underlying: str,
        timestamp: datetime,
        expiration_date: Optional[datetime] = None
    ) -> Optional[OptionsChain]:
        """Retrieve options chain for specific timestamp"""
        try:
            conn = await self.db.connect()

            # Build query with optional expiration filter
            query = """
                SELECT * FROM options_data
                WHERE underlying = ? AND timestamp = ?
            """
            params = [underlying, timestamp.isoformat()]

            if expiration_date:
                query += " AND expiration = ?"
                params.append(expiration_date.isoformat())

            query += " ORDER BY expiration, strike"

            cursor = conn.execute(query, params)
            rows = cursor.fetchall()

            if not rows:
                return None

            # Convert rows to OptionContract objects
            contracts = []
            for row in rows:
                contract = OptionContract(
                    symbol=row['symbol'],
                    underlying=row['underlying'],
                    expiration=datetime.fromisoformat(row['expiration']),
                    strike=Decimal(str(row['strike'])),
                    option_type=row['option_type'],
                    bid=Decimal(str(row['bid'])) if row['bid'] else None,
                    ask=Decimal(str(row['ask'])) if row['ask'] else None,
                    last=Decimal(str(row['last'])) if row['last'] else None,
                    volume=row['volume'],
                    open_interest=row['open_interest'],
                    implied_volatility=Decimal(str(row['implied_volatility'])) if row['implied_volatility'] else None,
                    delta=Decimal(str(row['delta'])) if row['delta'] else None,
                    gamma=Decimal(str(row['gamma'])) if row['gamma'] else None,
                    theta=Decimal(str(row['theta'])) if row['theta'] else None,
                    vega=Decimal(str(row['vega'])) if row['vega'] else None,
                    rho=Decimal(str(row['rho'])) if row['rho'] else None
                )
                contracts.append(contract)

            # Get underlying price from first contract or use placeholder
            underlying_price = Decimal('0.0')  # Would be fetched from separate query in real implementation

            chain = OptionsChain(
                underlying=underlying,
                timestamp=timestamp,
                underlying_price=underlying_price,
                contracts=contracts
            )

            logger.info(f"Retrieved options chain for {underlying} with {len(contracts)} contracts")
            return chain

        except sqlite3.Error as e:
            logger.error(f"Failed to retrieve options chain: {e}")
            raise RepositoryError(f"Failed to retrieve options chain: {e}")

    async def get_available_symbols(self) -> List[str]:
        """Get all symbols with stored data"""
        try:
            conn = await self.db.connect()
            cursor = conn.execute("SELECT DISTINCT symbol FROM ohlcv_data ORDER BY symbol")
            rows = cursor.fetchall()

            symbols = [row['symbol'] for row in rows]
            logger.info(f"Retrieved {len(symbols)} available symbols")
            return symbols

        except sqlite3.Error as e:
            logger.error(f"Failed to retrieve available symbols: {e}")
            raise RepositoryError(f"Failed to retrieve available symbols: {e}")

    async def get_data_range(
        self,
        symbol: str
    ) -> Optional[tuple[datetime, datetime]]:
        """Get date range of available data for symbol"""
        try:
            conn = await self.db.connect()
            cursor = conn.execute("""
                SELECT MIN(timestamp) as start_date, MAX(timestamp) as end_date
                FROM ohlcv_data WHERE symbol = ?
            """, (symbol,))

            row = cursor.fetchone()

            if row and row['start_date'] and row['end_date']:
                start_date = datetime.fromisoformat(row['start_date'])
                end_date = datetime.fromisoformat(row['end_date'])
                return (start_date, end_date)

            return None

        except sqlite3.Error as e:
            logger.error(f"Failed to retrieve data range: {e}")
            raise RepositoryError(f"Failed to retrieve data range: {e}")


class InMemoryCacheManager(CacheManager):
    """In-memory cache implementation with TTL support"""

    def __init__(self, default_ttl_seconds: int = 3600):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._default_ttl = default_ttl_seconds
        self._stats = {
            'hits': 0,
            'misses': 0,
            'sets': 0,
            'deletes': 0,
            'evictions': 0
        }

    async def get(self, key: str) -> Optional[Any]:
        """Retrieve value from cache"""
        if key in self._cache:
            entry = self._cache[key]

            # Check if expired
            if entry['expires_at'] and datetime.now().timestamp() > entry['expires_at']:
                del self._cache[key]
                self._stats['evictions'] += 1
                self._stats['misses'] += 1
                return None

            self._stats['hits'] += 1
            return entry['value']

        self._stats['misses'] += 1
        return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl_seconds: Optional[int] = None
    ) -> bool:
        """Store value in cache"""
        try:
            ttl = ttl_seconds or self._default_ttl
            expires_at = datetime.now().timestamp() + ttl if ttl > 0 else None

            self._cache[key] = {
                'value': value,
                'expires_at': expires_at,
                'created_at': datetime.now().timestamp()
            }

            self._stats['sets'] += 1
            return True

        except Exception as e:
            logger.error(f"Failed to set cache key {key}: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """Remove value from cache"""
        if key in self._cache:
            del self._cache[key]
            self._stats['deletes'] += 1
            return True
        return False

    async def clear(self, pattern: Optional[str] = None) -> int:
        """Clear cache entries"""
        if pattern is None:
            count = len(self._cache)
            self._cache.clear()
            return count

        # Simple pattern matching (startswith)
        keys_to_delete = [k for k in self._cache.keys() if k.startswith(pattern)]
        for key in keys_to_delete:
            del self._cache[key]

        return len(keys_to_delete)

    def get_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics"""
        total_requests = self._stats['hits'] + self._stats['misses']
        hit_rate = self._stats['hits'] / total_requests if total_requests > 0 else 0

        return {
            **self._stats,
            'total_requests': total_requests,
            'hit_rate': hit_rate,
            'cache_size': len(self._cache),
            'memory_usage_estimate': sum(
                len(str(entry['value'])) for entry in self._cache.values()
            )
        }


# Factory function for creating repository instances
def create_sqlite_repositories(database_path: str) -> tuple[
    SQLiteBacktestRepository,
    SQLiteSignalRepository,
    SQLiteMarketDataRepository,
    InMemoryCacheManager
]:
    """Create SQLite repository instances"""
    backtest_repo = SQLiteBacktestRepository(database_path)
    signal_repo = SQLiteSignalRepository(database_path)
    market_data_repo = SQLiteMarketDataRepository(database_path)
    cache_manager = InMemoryCacheManager()

    return backtest_repo, signal_repo, market_data_repo, cache_manager
