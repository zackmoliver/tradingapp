"""
Simple Backtest Engine Demonstration - Options Trading Backtest Engine

This script demonstrates the core BacktestEngine functionality without
complex imports, focusing on the engine's capabilities.
"""

import sys
import os
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Any
import uuid

# Add path for imports
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Import the backtest engine components
from src.engine.backtest import (
    BacktestEngine, BacktestConfig, create_backtest_engine,
    Strategy, StrategyContext, MarketEvent, MarketEventType,
    OrderRequest, OrderType, OrderSide, OHLCVBar
)

# Import repository implementations
from src.data.repository import SQLiteMarketDataRepository


class DemoStrategy:
    """
    Simple demonstration strategy that logs market data
    and occasionally submits orders for testing.
    """
    
    def __init__(self, name: str):
        self.name = name
        self.market_data_count = 0
        self.orders_submitted = []
        
    async def initialize(self, context: StrategyContext) -> bool:
        """Initialize the strategy"""
        context.log_info(f"Initializing {self.name} strategy")
        return True
    
    async def on_market_data(self, context: StrategyContext, event: MarketEvent) -> None:
        """Handle market data updates"""
        self.market_data_count += 1
        
        try:
            # Log market data reception
            context.log_info(f"Processing market data event #{self.market_data_count}")
            
            # Get current prices for all symbols
            for symbol in ["AAPL", "MSFT"]:
                current_price = await context.get_current_price(symbol)
                if current_price:
                    context.log_info(f"{symbol} current price: ${current_price}")
            
            # Submit a test order every 3 market data events
            if self.market_data_count % 3 == 0:
                await self._submit_test_order(context)
                
        except Exception as e:
            context.log_error(f"Error in market data processing: {e}")
    
    async def _submit_test_order(self, context: StrategyContext):
        """Submit a test order"""
        try:
            # Alternate between buy and sell orders
            side = OrderSide.BUY if len(self.orders_submitted) % 2 == 0 else OrderSide.SELL
            symbol = "AAPL" if len(self.orders_submitted) % 2 == 0 else "MSFT"
            
            order_request = OrderRequest(
                symbol=symbol,
                order_type=OrderType.MARKET,
                side=side,
                quantity=Decimal('100'),
                price=None,
                time_in_force="DAY",
                metadata={
                    "strategy": self.name,
                    "test_order": True,
                    "order_number": len(self.orders_submitted) + 1
                }
            )
            
            order_id = await context.submit_order(order_request)
            self.orders_submitted.append(order_id)
            
            context.log_info(f"Submitted {side.value} order for {symbol}: {order_id}")
            
        except Exception as e:
            context.log_error(f"Failed to submit test order: {e}")
    
    async def cleanup(self, context: StrategyContext) -> None:
        """Cleanup strategy resources"""
        context.log_info(f"{self.name} strategy cleanup - Processed {self.market_data_count} market events, submitted {len(self.orders_submitted)} orders")


async def create_sample_market_data():
    """Create sample market data for demonstration"""
    print("📊 Creating sample market data...")
    
    repo = SQLiteMarketDataRepository(":memory:")
    
    # Create 15 days of sample data for AAPL and MSFT
    start_date = datetime(2024, 1, 1)
    
    for symbol in ["AAPL", "MSFT"]:
        bars = []
        base_price = Decimal('150.00') if symbol == "AAPL" else Decimal('300.00')
        
        for i in range(15):
            date = start_date + timedelta(days=i)
            
            # Simulate realistic price movement
            daily_change = Decimal(str((i % 5 - 2) * 0.8))  # -1.6 to +2.4
            open_price = base_price + daily_change
            high_price = open_price + Decimal('1.50')
            low_price = open_price - Decimal('1.20')
            close_price = open_price + Decimal(str((i % 3 - 1) * 0.5))
            volume = 1500000 + (i * 75000)
            
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
        
        await repo.store_ohlcv(symbol, bars, "demo_source")
        print(f"  ✅ Created {len(bars)} bars for {symbol}")
    
    return repo


async def main():
    """Run the backtest engine demonstration"""
    print("🚀 Simple Backtest Engine Demonstration")
    print("=" * 55)
    
    try:
        # 1. Create sample market data
        print("\n📊 Step 1: Creating Market Data")
        print("-" * 35)
        market_data_repo = await create_sample_market_data()
        
        # 2. Create backtest configuration
        print("\n⚙️ Step 2: Configuring Backtest")
        print("-" * 35)
        config = BacktestConfig(
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 10),  # 10 days of backtesting
            initial_capital=Decimal('100000.00'),
            symbols=["AAPL", "MSFT"],
            benchmark_symbol="SPY",
            commission_per_trade=Decimal('1.00'),
            slippage_bps=5,
            max_positions=5,
            risk_free_rate=Decimal('0.02'),
            data_frequency="1D",
            enable_options=False,  # Simplified for demo
            enable_signals=False,  # Simplified for demo
            performance_update_frequency=3
        )
        
        print(f"  📅 Period: {config.start_date.date()} to {config.end_date.date()}")
        print(f"  💰 Capital: ${config.initial_capital:,}")
        print(f"  📈 Symbols: {', '.join(config.symbols)}")
        print(f"  💵 Commission: ${config.commission_per_trade} per trade")
        
        # 3. Create backtest engine
        print("\n🏗️ Step 3: Creating Backtest Engine")
        print("-" * 35)
        engine = create_backtest_engine(config, ":memory:")
        engine.market_data_repo = market_data_repo  # Use our sample data
        print("  ✅ Engine created with SQLite repositories")
        
        # 4. Add strategies
        print("\n📋 Step 4: Adding Strategies")
        print("-" * 35)
        
        # Add demo strategies
        strategy1 = DemoStrategy("Demo_Strategy_Alpha")
        strategy2 = DemoStrategy("Demo_Strategy_Beta")
        
        success1 = await engine.add_strategy(strategy1, "demo_alpha")
        success2 = await engine.add_strategy(strategy2, "demo_beta")
        
        print(f"  ✅ Added Demo_Strategy_Alpha: {success1}")
        print(f"  ✅ Added Demo_Strategy_Beta: {success2}")
        print(f"  📊 Total strategies: {len(engine.strategies)}")
        
        # 5. Initialize engine
        print("\n🎯 Step 5: Initializing Engine")
        print("-" * 35)
        
        init_success = await engine.initialize()
        print(f"  ✅ Initialization successful: {init_success}")
        
        if init_success:
            print(f"  📊 Market data loaded: {len(engine._market_data_cache)} symbols")
            print(f"  📈 Total bars per symbol: {engine.state.total_bars}")
            print(f"  🎯 Strategies initialized: {engine.state.strategies_initialized}")
        
        # 6. Run backtest simulation
        print("\n⏰ Step 6: Running Backtest Simulation")
        print("-" * 35)
        
        # Process several time steps manually for demonstration
        for step in range(6):  # Process 6 days
            print(f"\n  📅 Day {step + 1}:")
            
            # Show current state
            current_time = engine.state.current_time
            bar_index = engine.state.current_bar_index
            
            print(f"    📆 Date: {current_time.date()}")
            print(f"    📊 Bar Index: {bar_index}")
            
            # Show current market prices
            for symbol in config.symbols:
                current_bar = engine._get_current_bar(symbol)
                if current_bar:
                    print(f"    💰 {symbol}: ${current_bar.close} (Vol: {current_bar.volume:,})")
            
            # Process the time step
            await engine._process_time_step()
            
            # Show strategy activity
            for strategy_id, strategy in engine.strategies.items():
                if hasattr(strategy, 'market_data_count'):
                    print(f"    🎯 {strategy_id}: {strategy.market_data_count} events, {len(strategy.orders_submitted)} orders")
            
            # Advance to next time step
            engine._advance_time()
            
            # Small delay for readability
            await asyncio.sleep(0.2)
        
        # 7. Show final results
        print("\n📊 Step 7: Final Results")
        print("-" * 35)
        
        # Show strategy performance
        for strategy_id, strategy in engine.strategies.items():
            portfolio = engine._get_strategy_portfolio(strategy_id)
            
            print(f"\n  🎯 {strategy_id}:")
            print(f"    💰 Cash: ${portfolio.cash:,.2f}")
            print(f"    📈 Total Value: ${portfolio.total_value:,.2f}")
            print(f"    📊 Unrealized P&L: ${portfolio.unrealized_pnl:,.2f}")
            print(f"    📊 Realized P&L: ${portfolio.realized_pnl:,.2f}")
            
            if hasattr(strategy, 'market_data_count'):
                print(f"    📋 Market Events: {strategy.market_data_count}")
                print(f"    📋 Orders Submitted: {len(strategy.orders_submitted)}")
        
        # Show backtest run information
        runs = await engine.backtest_repo.get_backtest_runs()
        if runs:
            run = runs[0]
            print(f"\n  📋 Backtest Run:")
            print(f"    🆔 ID: {run.run_id}")
            print(f"    📊 Status: {run.status}")
            print(f"    📅 Created: {run.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"    💰 Initial Capital: ${run.initial_capital:,}")
        
        # 8. Finalize backtest
        print("\n🏁 Step 8: Finalizing Backtest")
        print("-" * 35)
        
        await engine._finalize_backtest()
        
        # Check final status
        final_runs = await engine.backtest_repo.get_backtest_runs()
        if final_runs:
            final_run = final_runs[0]
            print(f"  ✅ Final Status: {final_run.status}")
            if final_run.completed_at:
                print(f"  ⏰ Completed: {final_run.completed_at.strftime('%Y-%m-%d %H:%M:%S')}")
        
        print("\n✅ Backtest demonstration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Demonstration failed: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 55)
    print("🎉 Simple Backtest Engine Demo Complete!")
    print("\nKey Features Demonstrated:")
    print("  ✅ Engine initialization and configuration")
    print("  ✅ Strategy registration and lifecycle management")
    print("  ✅ Market data loading and processing")
    print("  ✅ Time-step simulation")
    print("  ✅ Order submission and tracking")
    print("  ✅ Portfolio management")
    print("  ✅ Database integration and persistence")
    print("  ✅ Comprehensive logging and error handling")


if __name__ == "__main__":
    asyncio.run(main())
