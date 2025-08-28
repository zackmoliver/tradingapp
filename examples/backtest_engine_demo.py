"""
Backtest Engine Demonstration - Options Trading Backtest Engine

This script demonstrates how to use the BacktestEngine to run a complete
backtest with strategies, market data, and signal integration.
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

# Import the backtest engine
from src.engine.backtest import (
    BacktestEngine, BacktestConfig, create_backtest_engine,
    Strategy, StrategyContext, MarketEvent, MarketEventType,
    OrderRequest, OrderType, OrderSide, OHLCVBar
)

# Import repository implementations
from src.data.repository import SQLiteMarketDataRepository

# Import signal registry
from src.signals.registry import signal, SignalOutput, SignalType, SignalStrength


class SimpleMovingAverageStrategy:
    """
    Simple Moving Average Crossover Strategy
    
    Generates buy signals when short MA crosses above long MA,
    and sell signals when short MA crosses below long MA.
    """
    
    def __init__(self, short_window: int = 10, long_window: int = 20):
        self.short_window = short_window
        self.long_window = long_window
        self.positions = {}
        self.last_signals = {}
        self.orders_submitted = []
        
    async def initialize(self, context: StrategyContext) -> bool:
        """Initialize the strategy"""
        context.log_info(f"Initializing SMA Strategy (short={self.short_window}, long={self.long_window})")
        return True
    
    async def on_market_data(self, context: StrategyContext, event: MarketEvent) -> None:
        """Handle market data updates"""
        try:
            # Process each symbol
            for symbol in ["AAPL", "MSFT"]:
                await self._process_symbol(context, symbol)
                
        except Exception as e:
            context.log_error(f"Error processing market data: {e}")
    
    async def _process_symbol(self, context: StrategyContext, symbol: str):
        """Process a single symbol"""
        try:
            # Get historical data for moving average calculation
            end_date = datetime.now()
            start_date = end_date - timedelta(days=self.long_window + 10)
            
            historical_data = await context.get_historical_data(symbol, start_date, end_date)
            
            if len(historical_data) < self.long_window:
                context.log_warning(f"Insufficient data for {symbol}: {len(historical_data)} bars")
                return
            
            # Calculate moving averages
            short_ma = self._calculate_sma(historical_data, self.short_window)
            long_ma = self._calculate_sma(historical_data, self.long_window)
            
            if short_ma is None or long_ma is None:
                return
            
            # Get current price
            current_price = await context.get_current_price(symbol)
            if not current_price:
                return
            
            # Generate trading signals
            signal = self._generate_signal(symbol, short_ma, long_ma, current_price)
            
            if signal:
                context.log_info(f"{symbol}: {signal} signal - Short MA: {short_ma:.2f}, Long MA: {long_ma:.2f}, Price: {current_price}")
                
                # Submit order based on signal
                await self._execute_signal(context, symbol, signal, current_price)
                
        except Exception as e:
            context.log_error(f"Error processing {symbol}: {e}")
    
    def _calculate_sma(self, data: List, window: int) -> Decimal:
        """Calculate Simple Moving Average"""
        if len(data) < window:
            return None
        
        recent_closes = [bar.close for bar in data[-window:]]
        return sum(recent_closes) / len(recent_closes)
    
    def _generate_signal(self, symbol: str, short_ma: Decimal, long_ma: Decimal, current_price: Decimal) -> str:
        """Generate trading signal based on MA crossover"""
        last_signal = self.last_signals.get(symbol, "HOLD")
        
        # Buy signal: short MA crosses above long MA
        if short_ma > long_ma and last_signal != "BUY":
            self.last_signals[symbol] = "BUY"
            return "BUY"
        
        # Sell signal: short MA crosses below long MA
        elif short_ma < long_ma and last_signal != "SELL":
            self.last_signals[symbol] = "SELL"
            return "SELL"
        
        return None
    
    async def _execute_signal(self, context: StrategyContext, symbol: str, signal: str, price: Decimal):
        """Execute trading signal"""
        try:
            if signal == "BUY":
                # Buy 100 shares
                order_request = OrderRequest(
                    symbol=symbol,
                    order_type=OrderType.MARKET,
                    side=OrderSide.BUY,
                    quantity=Decimal('100'),
                    price=None,
                    time_in_force="DAY",
                    metadata={
                        "strategy": "SMA_Crossover",
                        "signal_price": float(price),
                        "short_ma": self.short_window,
                        "long_ma": self.long_window
                    }
                )
                
                order_id = await context.submit_order(order_request)
                self.orders_submitted.append(order_id)
                context.log_info(f"Submitted BUY order for {symbol}: {order_id}")
                
            elif signal == "SELL":
                # Sell 100 shares
                order_request = OrderRequest(
                    symbol=symbol,
                    order_type=OrderType.MARKET,
                    side=OrderSide.SELL,
                    quantity=Decimal('100'),
                    price=None,
                    time_in_force="DAY",
                    metadata={
                        "strategy": "SMA_Crossover",
                        "signal_price": float(price),
                        "short_ma": self.short_window,
                        "long_ma": self.long_window
                    }
                )
                
                order_id = await context.submit_order(order_request)
                self.orders_submitted.append(order_id)
                context.log_info(f"Submitted SELL order for {symbol}: {order_id}")
                
        except Exception as e:
            context.log_error(f"Failed to execute {signal} signal for {symbol}: {e}")
    
    async def cleanup(self, context: StrategyContext) -> None:
        """Cleanup strategy resources"""
        context.log_info(f"SMA Strategy cleanup - Total orders submitted: {len(self.orders_submitted)}")


# Register a momentum signal for demonstration
@signal(name="momentum_signal", description="Simple momentum signal based on price change")
def momentum_signal_function(input_data) -> SignalOutput:
    """Generate momentum signal based on recent price movement"""
    
    # Simple momentum calculation
    if len(input_data.historical_data) < 5:
        signal_type = SignalType.HOLD
        strength = SignalStrength.WEAK
        confidence = Decimal('0.2')
        reasoning = "Insufficient data for momentum calculation"
    else:
        # Calculate 5-day price change
        recent_bars = input_data.historical_data[-5:]
        price_change = (recent_bars[-1].close - recent_bars[0].close) / recent_bars[0].close
        
        if price_change > Decimal('0.02'):  # 2% gain
            signal_type = SignalType.BUY
            strength = SignalStrength.MODERATE
            confidence = Decimal('0.7')
            reasoning = f"Strong momentum: {price_change:.2%} gain over 5 days"
        elif price_change < Decimal('-0.02'):  # 2% loss
            signal_type = SignalType.SELL
            strength = SignalStrength.MODERATE
            confidence = Decimal('0.6')
            reasoning = f"Negative momentum: {price_change:.2%} loss over 5 days"
        else:
            signal_type = SignalType.HOLD
            strength = SignalStrength.WEAK
            confidence = Decimal('0.3')
            reasoning = f"Neutral momentum: {price_change:.2%} change"
    
    return SignalOutput(
        signal_id=str(uuid.uuid4()),
        signal_type=signal_type,
        strength=strength,
        confidence=confidence,
        target_price=input_data.current_price * Decimal('1.03'),
        target_quantity=Decimal('100'),
        stop_loss=input_data.current_price * Decimal('0.95'),
        take_profit=input_data.current_price * Decimal('1.08'),
        expiry=None,
        reasoning=reasoning,
        supporting_data={"price_change": float(price_change) if 'price_change' in locals() else 0},
        metadata={"generated_by": "momentum_signal_function"}
    )


async def create_sample_market_data():
    """Create sample market data for demonstration"""
    print("📊 Creating sample market data...")
    
    repo = SQLiteMarketDataRepository(":memory:")
    
    # Create 30 days of sample data for AAPL and MSFT
    start_date = datetime(2024, 1, 1)
    
    for symbol in ["AAPL", "MSFT"]:
        bars = []
        base_price = Decimal('150.00') if symbol == "AAPL" else Decimal('300.00')
        
        for i in range(30):
            date = start_date + timedelta(days=i)
            
            # Simulate price movement with some trend
            trend = Decimal(str(i * 0.1))  # Slight upward trend
            noise = Decimal(str((i % 7 - 3) * 0.5))  # Random noise
            
            open_price = base_price + trend + noise
            high_price = open_price + Decimal('2.00')
            low_price = open_price - Decimal('1.50')
            close_price = open_price + Decimal(str((i % 3 - 1) * 0.75))
            volume = 1000000 + (i * 50000)
            
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
    print("🚀 Backtest Engine Demonstration")
    print("=" * 50)
    
    # 1. Create sample market data
    market_data_repo = await create_sample_market_data()
    
    # 2. Create backtest configuration
    print("\n⚙️ Creating backtest configuration...")
    config = BacktestConfig(
        start_date=datetime(2024, 1, 1),
        end_date=datetime(2024, 1, 20),  # 20 days of backtesting
        initial_capital=Decimal('100000.00'),
        symbols=["AAPL", "MSFT"],
        benchmark_symbol="SPY",
        commission_per_trade=Decimal('1.00'),
        slippage_bps=5,
        max_positions=10,
        risk_free_rate=Decimal('0.02'),
        data_frequency="1D",
        enable_options=True,
        enable_signals=True,
        performance_update_frequency=5
    )
    print(f"  ✅ Configured backtest: {config.start_date.date()} to {config.end_date.date()}")
    print(f"  💰 Initial capital: ${config.initial_capital:,}")
    print(f"  📈 Symbols: {', '.join(config.symbols)}")
    
    # 3. Create backtest engine
    print("\n🏗️ Creating backtest engine...")
    engine = create_backtest_engine(config, ":memory:")
    engine.market_data_repo = market_data_repo  # Use our sample data
    
    # 4. Add strategies
    print("\n📋 Adding strategies...")
    
    # Add SMA strategy
    sma_strategy = SimpleMovingAverageStrategy(short_window=5, long_window=10)
    await engine.add_strategy(sma_strategy, "SMA_5_10")
    print("  ✅ Added Simple Moving Average Strategy (5/10)")
    
    # 5. Initialize and run backtest
    print("\n🎯 Running backtest...")
    
    try:
        # Initialize the engine
        init_success = await engine.initialize()
        if not init_success:
            print("❌ Failed to initialize backtest engine")
            return
        
        print("  ✅ Engine initialized successfully")
        
        # Run a few time steps manually for demonstration
        print("\n⏰ Processing time steps...")
        
        for step in range(5):  # Process 5 days
            print(f"\n  📅 Processing day {step + 1}...")
            
            # Process one time step
            await engine._process_time_step()
            
            # Show current state
            current_time = engine.state.current_time
            current_bar_index = engine.state.current_bar_index
            
            print(f"    Time: {current_time.date()}")
            print(f"    Bar index: {current_bar_index}")
            
            # Show current prices
            for symbol in config.symbols:
                current_bar = engine._get_current_bar(symbol)
                if current_bar:
                    print(f"    {symbol}: ${current_bar.close}")
            
            # Advance time
            engine._advance_time()
            
            # Small delay for demonstration
            await asyncio.sleep(0.1)
        
        # 6. Show results
        print("\n📊 Backtest Results:")
        print("-" * 30)
        
        # Show strategy performance
        for strategy_id in engine.strategies:
            strategy = engine.strategies[strategy_id]
            portfolio = engine._get_strategy_portfolio(strategy_id)
            
            print(f"\n🎯 Strategy: {strategy_id}")
            print(f"  💰 Cash: ${portfolio.cash:,.2f}")
            print(f"  📈 Total Value: ${portfolio.total_value:,.2f}")
            print(f"  📊 P&L: ${portfolio.realized_pnl + portfolio.unrealized_pnl:,.2f}")
            
            if hasattr(strategy, 'orders_submitted'):
                print(f"  📋 Orders Submitted: {len(strategy.orders_submitted)}")
        
        # Show backtest run info
        runs = await engine.backtest_repo.get_backtest_runs()
        if runs:
            run = runs[0]
            print(f"\n📋 Backtest Run: {run.run_id}")
            print(f"  Status: {run.status}")
            print(f"  Created: {run.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # 7. Finalize backtest
        print("\n🏁 Finalizing backtest...")
        await engine._finalize_backtest()
        
        print("\n✅ Backtest demonstration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Backtest failed: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 50)
    print("🎉 Demonstration Complete!")


if __name__ == "__main__":
    asyncio.run(main())
