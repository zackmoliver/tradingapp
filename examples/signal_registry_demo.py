"""
Signal Registry Demonstration - Options Trading Backtest Engine

This script demonstrates how to use the signal registry system to register,
discover, and execute trading signals.
"""

import sys
import os
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
import uuid

# Add path for imports
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Import the simple registry for demonstration
from tests.test_signal_registry_simple import (
    SignalInput, SignalOutput, SignalType, SignalStrength, SignalCategory,
    signal_decorator, _test_registry, TestFixtures
)

def main():
    """Demonstrate signal registry functionality"""
    print("🚀 Signal Registry Demonstration")
    print("=" * 50)
    
    # Clear registry to start fresh
    _test_registry.clear()
    
    # 1. Register signals using the decorator
    print("\n📝 1. Registering Signals with Decorator")
    print("-" * 40)
    
    @signal_decorator(
        name="rsi_oversold",
        category=SignalCategory.TECHNICAL,
        description="RSI oversold signal - generates buy signals when RSI < 30"
    )
    def rsi_oversold_signal(input_data: SignalInput) -> SignalOutput:
        """Generate buy signal when RSI indicates oversold conditions"""
        # Simulate RSI calculation
        rsi_value = 25.5  # Simulated RSI value
        
        if rsi_value < 30:
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.BUY,
                strength=SignalStrength.STRONG,
                confidence=Decimal('0.85'),
                target_price=input_data.current_price * Decimal('1.05'),  # 5% above current
                reasoning=f"RSI oversold at {rsi_value}, strong buy signal",
                metadata={
                    "rsi_value": rsi_value,
                    "threshold": 30,
                    "signal_source": "technical_analysis"
                }
            )
        else:
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.HOLD,
                strength=SignalStrength.WEAK,
                confidence=Decimal('0.30'),
                target_price=input_data.current_price,
                reasoning=f"RSI at {rsi_value}, no action needed",
                metadata={"rsi_value": rsi_value}
            )
    
    @signal_decorator(
        name="volume_breakout",
        category=SignalCategory.MOMENTUM,
        description="Volume breakout signal - detects unusual volume spikes"
    )
    def volume_breakout_signal(input_data: SignalInput) -> SignalOutput:
        """Generate signal based on volume breakout patterns"""
        # Simulate volume analysis
        current_volume = 2500000  # Simulated current volume
        avg_volume = 1000000     # Simulated average volume
        volume_ratio = current_volume / avg_volume
        
        if volume_ratio > 2.0:  # Volume spike
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.BUY,
                strength=SignalStrength.MODERATE,
                confidence=Decimal('0.70'),
                target_price=input_data.current_price * Decimal('1.03'),  # 3% above current
                reasoning=f"Volume breakout detected: {volume_ratio:.1f}x average volume",
                metadata={
                    "current_volume": current_volume,
                    "average_volume": avg_volume,
                    "volume_ratio": volume_ratio
                }
            )
        else:
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.HOLD,
                strength=SignalStrength.WEAK,
                confidence=Decimal('0.20'),
                target_price=input_data.current_price,
                reasoning=f"Normal volume: {volume_ratio:.1f}x average",
                metadata={"volume_ratio": volume_ratio}
            )
    
    @signal_decorator(
        name="moving_average_cross",
        category=SignalCategory.TECHNICAL,
        description="Moving average crossover signal"
    )
    def ma_crossover_signal(input_data: SignalInput) -> SignalOutput:
        """Generate signal based on moving average crossover"""
        # Simulate moving averages
        ma_short = Decimal('152.30')  # 20-day MA
        ma_long = Decimal('148.75')   # 50-day MA
        
        if ma_short > ma_long:
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.BUY,
                strength=SignalStrength.MODERATE,
                confidence=Decimal('0.65'),
                target_price=input_data.current_price * Decimal('1.04'),
                reasoning=f"Bullish MA cross: {ma_short} > {ma_long}",
                metadata={
                    "ma_short": float(ma_short),
                    "ma_long": float(ma_long),
                    "cross_type": "bullish"
                }
            )
        else:
            return SignalOutput(
                signal_id=str(uuid.uuid4()),
                signal_type=SignalType.SELL,
                strength=SignalStrength.MODERATE,
                confidence=Decimal('0.60'),
                target_price=input_data.current_price * Decimal('0.96'),
                reasoning=f"Bearish MA cross: {ma_short} < {ma_long}",
                metadata={
                    "ma_short": float(ma_short),
                    "ma_long": float(ma_long),
                    "cross_type": "bearish"
                }
            )
    
    print(f"✅ Registered 3 signals successfully")
    
    # 2. List available signals
    print("\n📋 2. Listing Available Signals")
    print("-" * 40)
    
    all_signals = _test_registry.list_signals()
    print(f"Total signals registered: {len(all_signals)}")
    for signal_name in all_signals:
        signal_info = _test_registry.get_signal(signal_name)
        print(f"  • {signal_name} ({signal_info.metadata.category.value})")
        print(f"    Description: {signal_info.metadata.description}")
    
    # 3. Filter signals by category
    print("\n🔍 3. Filtering Signals by Category")
    print("-" * 40)
    
    technical_signals = _test_registry.list_signals(category=SignalCategory.TECHNICAL)
    momentum_signals = _test_registry.list_signals(category=SignalCategory.MOMENTUM)
    
    print(f"Technical signals: {technical_signals}")
    print(f"Momentum signals: {momentum_signals}")
    
    # 4. Execute signals
    print("\n⚡ 4. Executing Signals")
    print("-" * 40)
    
    # Create sample input data
    sample_input = SignalInput(
        symbol="AAPL",
        timestamp=datetime.now(),
        current_price=Decimal('150.50'),
        parameters={"lookback": 20, "threshold": 0.7},
        metadata={"source": "demo", "version": "1.0"}
    )
    
    print(f"Input: {sample_input.symbol} @ ${sample_input.current_price}")
    print()
    
    # Execute each signal
    for signal_name in all_signals:
        try:
            result = _test_registry.execute_signal(signal_name, sample_input)
            
            print(f"🎯 {signal_name}:")
            print(f"   Signal: {result.signal_type.value.upper()}")
            print(f"   Strength: {result.strength.value}")
            print(f"   Confidence: {result.confidence}")
            print(f"   Target: ${result.target_price}")
            print(f"   Reasoning: {result.reasoning}")
            print()
            
        except Exception as e:
            print(f"❌ Error executing {signal_name}: {e}")
    
    # 5. Show usage statistics
    print("\n📊 5. Usage Statistics")
    print("-" * 40)
    
    for signal_name in all_signals:
        signal_info = _test_registry.get_signal(signal_name)
        print(f"  • {signal_name}: {signal_info.usage_count} executions")
        if signal_info.last_used:
            print(f"    Last used: {signal_info.last_used.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 6. Demonstrate signal combination
    print("\n🔗 6. Signal Combination Example")
    print("-" * 40)
    
    # Execute multiple signals and combine results
    buy_signals = []
    sell_signals = []
    hold_signals = []
    
    for signal_name in all_signals:
        result = _test_registry.execute_signal(signal_name, sample_input)
        
        if result.signal_type == SignalType.BUY:
            buy_signals.append((signal_name, result))
        elif result.signal_type == SignalType.SELL:
            sell_signals.append((signal_name, result))
        else:
            hold_signals.append((signal_name, result))
    
    print(f"Buy signals: {len(buy_signals)}")
    for name, signal in buy_signals:
        print(f"  • {name}: {signal.confidence} confidence")
    
    print(f"Sell signals: {len(sell_signals)}")
    for name, signal in sell_signals:
        print(f"  • {name}: {signal.confidence} confidence")
    
    print(f"Hold signals: {len(hold_signals)}")
    for name, signal in hold_signals:
        print(f"  • {name}: {signal.confidence} confidence")
    
    # Calculate consensus
    if len(buy_signals) > len(sell_signals):
        consensus = "BUY"
        avg_confidence = sum(s[1].confidence for s in buy_signals) / len(buy_signals)
    elif len(sell_signals) > len(buy_signals):
        consensus = "SELL"
        avg_confidence = sum(s[1].confidence for s in sell_signals) / len(sell_signals)
    else:
        consensus = "HOLD"
        avg_confidence = Decimal('0.50')
    
    print(f"\n🎯 Consensus: {consensus} (avg confidence: {avg_confidence:.2f})")
    
    print("\n✅ Signal Registry Demonstration Complete!")
    print("=" * 50)


if __name__ == "__main__":
    main()
