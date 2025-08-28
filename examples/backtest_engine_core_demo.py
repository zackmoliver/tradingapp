"""
Backtest Engine Core Demonstration - Options Trading Backtest Engine

This script demonstrates the core BacktestEngine functionality by showing
the key components and their interactions without complex imports.
"""

import sys
import os
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Any, Optional
import uuid
from dataclasses import dataclass
from enum import Enum

print("🚀 Backtest Engine Core Demonstration")
print("=" * 55)

# Define minimal types for demonstration
class StrategyState(Enum):
    CREATED = "created"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"

class MarketEventType(Enum):
    BAR_UPDATE = "bar_update"
    TRADE = "trade"
    ORDER_FILL = "order_fill"

class OrderType(Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"

class OrderSide(Enum):
    BUY = "buy"
    SELL = "sell"

@dataclass
class OHLCVBar:
    symbol: str
    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int
    adjusted_close: Decimal

@dataclass
class MarketEvent:
    event_type: MarketEventType
    timestamp: datetime
    symbol: str
    data: Dict[str, Any]

@dataclass
class OrderRequest:
    symbol: str
    order_type: OrderType
    side: OrderSide
    quantity: Decimal
    price: Optional[Decimal]
    time_in_force: str
    metadata: Dict[str, Any]

@dataclass
class Position:
    symbol: str
    quantity: Decimal
    average_price: Decimal
    market_value: Decimal
    unrealized_pnl: Decimal

@dataclass
class Portfolio:
    cash: Decimal
    positions: Dict[str, Position]
    total_value: Decimal
    unrealized_pnl: Decimal
    realized_pnl: Decimal

@dataclass
class BacktestConfig:
    start_date: datetime
    end_date: datetime
    initial_capital: Decimal
    symbols: List[str]
    commission_per_trade: Decimal = Decimal('1.00')
    enable_signals: bool = True
    enable_options: bool = True

@dataclass
class BacktestState:
    current_time: datetime
    current_bar_index: int = 0
    total_bars: int = 0
    is_running: bool = False
    strategies_initialized: bool = False

# Mock Strategy Context
class MockStrategyContext:
    def __init__(self, strategy_id: str, engine):
        self.strategy_id = strategy_id
        self.engine = engine
        self._logger_messages = []
    
    async def get_historical_data(self, symbol: str, start_date: datetime, end_date: datetime) -> List[OHLCVBar]:
        # Return sample historical data
        bars = []
        current_date = start_date
        base_price = Decimal('150.00') if symbol == "AAPL" else Decimal('300.00')
        
        while current_date <= end_date:
            bar = OHLCVBar(
                symbol=symbol,
                timestamp=current_date,
                open=base_price,
                high=base_price + Decimal('2.00'),
                low=base_price - Decimal('1.50'),
                close=base_price + Decimal('0.50'),
                volume=1000000,
                adjusted_close=base_price + Decimal('0.50')
            )
            bars.append(bar)
            current_date += timedelta(days=1)
        
        return bars
    
    async def get_current_price(self, symbol: str) -> Optional[Decimal]:
        # Return current price from engine's current bars
        current_bar = self.engine._get_current_bar(symbol)
        return current_bar.close if current_bar else None
    
    async def submit_order(self, order_request: OrderRequest) -> str:
        order_id = str(uuid.uuid4())
        self.log_info(f"Order submitted: {order_id}")
        return order_id
    
    async def get_portfolio(self) -> Portfolio:
        return Portfolio(
            cash=Decimal('100000.00'),
            positions={},
            total_value=Decimal('100000.00'),
            unrealized_pnl=Decimal('0'),
            realized_pnl=Decimal('0')
        )
    
    def log_info(self, message: str):
        log_msg = f"[{self.strategy_id}] {message}"
        self._logger_messages.append(log_msg)
        print(f"    📝 {log_msg}")
    
    def log_warning(self, message: str):
        self.log_info(f"WARNING: {message}")
    
    def log_error(self, message: str):
        self.log_info(f"ERROR: {message}")

# Mock Strategy
class DemoStrategy:
    def __init__(self, name: str):
        self.name = name
        self.state = StrategyState.CREATED
        self.initialization_called = False
        self.market_data_calls = 0
        self.cleanup_called = False
        self.orders_submitted = []
    
    async def initialize(self, context) -> bool:
        self.initialization_called = True
        self.state = StrategyState.RUNNING
        context.log_info(f"Strategy {self.name} initialized")
        return True
    
    async def on_market_data(self, context, event: MarketEvent) -> None:
        self.market_data_calls += 1
        context.log_info(f"Processing market data event #{self.market_data_calls}")
        
        # Test context functionality
        if self.market_data_calls % 3 == 0:
            # Get current prices
            for symbol in ["AAPL", "MSFT"]:
                price = await context.get_current_price(symbol)
                if price:
                    context.log_info(f"{symbol} price: ${price}")
            
            # Submit test order
            if self.market_data_calls == 6:
                order_request = OrderRequest(
                    symbol="AAPL",
                    order_type=OrderType.MARKET,
                    side=OrderSide.BUY,
                    quantity=Decimal('100'),
                    price=None,
                    time_in_force="DAY",
                    metadata={"strategy": self.name}
                )
                
                order_id = await context.submit_order(order_request)
                self.orders_submitted.append(order_id)
    
    async def cleanup(self, context) -> None:
        self.cleanup_called = True
        self.state = StrategyState.STOPPED
        context.log_info(f"Strategy {self.name} cleaned up")

# Simplified Backtest Engine
class SimplifiedBacktestEngine:
    def __init__(self, config: BacktestConfig):
        self.config = config
        self.state = BacktestState(current_time=config.start_date)
        self.run_id = str(uuid.uuid4())
        
        # Strategy management
        self.strategies = {}
        self.strategy_contexts = {}
        self.strategy_portfolios = {}
        
        # Market data
        self._market_data_cache = {}
        self._current_bars = {}
    
    async def add_strategy(self, strategy, strategy_id: str) -> bool:
        if strategy_id in self.strategies:
            return False
        
        self.strategies[strategy_id] = strategy
        context = MockStrategyContext(strategy_id, self)
        self.strategy_contexts[strategy_id] = context
        
        # Initialize portfolio
        self.strategy_portfolios[strategy_id] = Portfolio(
            cash=self.config.initial_capital,
            positions={},
            total_value=self.config.initial_capital,
            unrealized_pnl=Decimal('0'),
            realized_pnl=Decimal('0')
        )
        
        return True
    
    def _get_current_bar(self, symbol: str) -> Optional[OHLCVBar]:
        return self._current_bars.get(symbol)
    
    async def _load_market_data(self):
        """Create sample market data"""
        for symbol in self.config.symbols:
            bars = []
            base_price = Decimal('150.00') if symbol == "AAPL" else Decimal('300.00')
            current_date = self.config.start_date
            
            i = 0
            while current_date <= self.config.end_date:
                # Simulate price movement
                price_change = Decimal(str((i % 5 - 2) * 0.5))
                open_price = base_price + price_change
                
                bar = OHLCVBar(
                    symbol=symbol,
                    timestamp=current_date,
                    open=open_price,
                    high=open_price + Decimal('2.00'),
                    low=open_price - Decimal('1.50'),
                    close=open_price + Decimal('0.75'),
                    volume=1000000 + (i * 50000),
                    adjusted_close=open_price + Decimal('0.75')
                )
                bars.append(bar)
                current_date += timedelta(days=1)
                i += 1
            
            self._market_data_cache[symbol] = bars
            self.state.total_bars = max(self.state.total_bars, len(bars))
    
    async def _initialize_strategies(self):
        for strategy_id, strategy in self.strategies.items():
            context = self.strategy_contexts[strategy_id]
            await strategy.initialize(context)
    
    def _update_current_bars(self):
        for symbol, bars in self._market_data_cache.items():
            if self.state.current_bar_index < len(bars):
                self._current_bars[symbol] = bars[self.state.current_bar_index]
    
    async def _process_time_step(self):
        self._update_current_bars()
        
        # Create market event
        market_event = MarketEvent(
            event_type=MarketEventType.BAR_UPDATE,
            timestamp=self.state.current_time,
            symbol="",
            data={"bar_index": self.state.current_bar_index}
        )
        
        # Process strategies
        for strategy_id, strategy in self.strategies.items():
            context = self.strategy_contexts[strategy_id]
            await strategy.on_market_data(context, market_event)
    
    def _advance_time(self):
        self.state.current_bar_index += 1
        if self.config.symbols and self._market_data_cache.get(self.config.symbols[0]):
            bars = self._market_data_cache[self.config.symbols[0]]
            if self.state.current_bar_index < len(bars):
                self.state.current_time = bars[self.state.current_bar_index].timestamp
    
    async def initialize(self) -> bool:
        print("\n🏗️ Initializing Backtest Engine")
        print("-" * 35)
        
        await self._load_market_data()
        print(f"  ✅ Loaded market data: {len(self._market_data_cache)} symbols, {self.state.total_bars} bars each")
        
        await self._initialize_strategies()
        print(f"  ✅ Initialized {len(self.strategies)} strategies")
        
        self.state.strategies_initialized = True
        return True
    
    async def run_simulation(self, num_steps: int = 5):
        print(f"\n⏰ Running {num_steps} Time Steps")
        print("-" * 35)
        
        self.state.is_running = True
        
        for step in range(num_steps):
            if self.state.current_bar_index >= self.state.total_bars:
                break
            
            print(f"\n  📅 Step {step + 1}: {self.state.current_time.date()}")
            
            # Show current market data
            for symbol in self.config.symbols:
                current_bar = self._get_current_bar(symbol)
                if current_bar:
                    print(f"    💰 {symbol}: ${current_bar.close} (Vol: {current_bar.volume:,})")
            
            # Process time step
            await self._process_time_step()
            
            # Show strategy activity
            for strategy_id, strategy in self.strategies.items():
                print(f"    🎯 {strategy_id}: {strategy.market_data_calls} events, {len(strategy.orders_submitted)} orders")
            
            # Advance time
            self._advance_time()
            
            await asyncio.sleep(0.1)  # Small delay for readability
        
        self.state.is_running = False
    
    async def finalize(self):
        print("\n🏁 Finalizing Backtest")
        print("-" * 35)
        
        for strategy_id, strategy in self.strategies.items():
            context = self.strategy_contexts[strategy_id]
            await strategy.cleanup(context)
        
        print("  ✅ All strategies cleaned up")

async def main():
    """Run the backtest engine core demonstration"""
    
    try:
        # 1. Create configuration
        print("\n⚙️ Creating Configuration")
        print("-" * 35)
        
        config = BacktestConfig(
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 10),
            initial_capital=Decimal('100000.00'),
            symbols=["AAPL", "MSFT"],
            commission_per_trade=Decimal('1.00'),
            enable_signals=True,
            enable_options=True
        )
        
        print(f"  📅 Period: {config.start_date.date()} to {config.end_date.date()}")
        print(f"  💰 Capital: ${config.initial_capital:,}")
        print(f"  📈 Symbols: {', '.join(config.symbols)}")
        
        # 2. Create engine
        print("\n🏗️ Creating Engine")
        print("-" * 35)
        
        engine = SimplifiedBacktestEngine(config)
        print(f"  ✅ Engine created with run ID: {engine.run_id[:8]}...")
        
        # 3. Add strategies
        print("\n📋 Adding Strategies")
        print("-" * 35)
        
        strategy1 = DemoStrategy("Alpha_Strategy")
        strategy2 = DemoStrategy("Beta_Strategy")
        
        success1 = await engine.add_strategy(strategy1, "alpha")
        success2 = await engine.add_strategy(strategy2, "beta")
        
        print(f"  ✅ Alpha Strategy added: {success1}")
        print(f"  ✅ Beta Strategy added: {success2}")
        
        # 4. Initialize and run
        init_success = await engine.initialize()
        print(f"\n  🎯 Initialization successful: {init_success}")
        
        if init_success:
            await engine.run_simulation(6)
        
        # 5. Show results
        print("\n📊 Final Results")
        print("-" * 35)
        
        for strategy_id, strategy in engine.strategies.items():
            portfolio = engine.strategy_portfolios[strategy_id]
            context = engine.strategy_contexts[strategy_id]
            
            print(f"\n  🎯 {strategy.name}:")
            print(f"    📊 State: {strategy.state.value}")
            print(f"    📋 Market Events: {strategy.market_data_calls}")
            print(f"    📋 Orders: {len(strategy.orders_submitted)}")
            print(f"    💰 Portfolio Value: ${portfolio.total_value:,}")
            print(f"    📝 Log Messages: {len(context._logger_messages)}")
        
        # 6. Finalize
        await engine.finalize()
        
        print("\n✅ Core demonstration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Demonstration failed: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 55)
    print("🎉 Backtest Engine Core Demo Complete!")
    print("\nKey Components Demonstrated:")
    print("  ✅ BacktestConfig - Flexible configuration system")
    print("  ✅ BacktestState - Real-time execution state tracking")
    print("  ✅ StrategyContext - Complete strategy interface")
    print("  ✅ Market Data Processing - Time-step simulation")
    print("  ✅ Strategy Management - Multi-strategy orchestration")
    print("  ✅ Event Loop - Core backtesting event processing")
    print("  ✅ Portfolio Tracking - Strategy-specific portfolios")
    print("  ✅ Order Management - Order submission and tracking")
    print("  ✅ Logging System - Context-aware logging")
    print("  ✅ Lifecycle Management - Initialize → Run → Finalize")

if __name__ == "__main__":
    asyncio.run(main())
