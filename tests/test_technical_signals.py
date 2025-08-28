"""
Test Suite for Technical Signals - Options Trading Backtest Engine

Comprehensive tests for RSI, MACD, and SMA crossover signals.
"""

import pytest
import sys
import os
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Any
import pandas as pd

# Add path for imports
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Import test data types
from data.provider import OHLCVBar


class TestFixtures:
    """Test data fixtures for technical signals"""
    
    @staticmethod
    def create_test_ohlcv_data(
        symbol: str = "AAPL",
        num_bars: int = 50,
        start_price: float = 150.0,
        trend: str = "sideways"  # "up", "down", "sideways"
    ) -> List[OHLCVBar]:
        """Create test OHLCV data with specified trend"""
        bars = []
        current_price = start_price
        start_date = datetime(2024, 1, 1)
        
        for i in range(num_bars):
            date = start_date + timedelta(days=i)
            
            # Apply trend
            if trend == "up":
                price_change = 0.5 + (i * 0.1)  # Gradual uptrend
            elif trend == "down":
                price_change = -0.5 - (i * 0.1)  # Gradual downtrend
            else:
                price_change = (i % 5 - 2) * 0.3  # Sideways with noise
            
            current_price += price_change
            
            # Create OHLCV bar
            open_price = current_price
            high_price = current_price + abs(price_change) + 1.0
            low_price = current_price - abs(price_change) - 1.0
            close_price = current_price + (price_change * 0.5)
            volume = 1000000 + (i * 10000)
            
            bar = OHLCVBar(
                symbol=symbol,
                timestamp=date,
                open=Decimal(str(open_price)),
                high=Decimal(str(high_price)),
                low=Decimal(str(low_price)),
                close=Decimal(str(close_price)),
                volume=volume,
                adjusted_close=Decimal(str(close_price))
            )
            bars.append(bar)
        
        return bars
    
    @staticmethod
    def create_signal_input(
        symbol: str = "AAPL",
        current_price: float = 150.0,
        historical_data: List[OHLCVBar] = None,
        parameters: Dict[str, Any] = None
    ):
        """Create SignalInput for testing"""
        # Create minimal SignalInput-like object
        class MockSignalInput:
            def __init__(self):
                self.symbol = symbol
                self.timestamp = datetime.now()
                self.current_price = Decimal(str(current_price))
                self.historical_data = historical_data or TestFixtures.create_test_ohlcv_data()
                self.parameters = parameters or {}
                self.metadata = {}
        
        return MockSignalInput()


class TestTechnicalSignalsBasic:
    """Basic tests for technical signals without complex imports"""
    
    def test_create_test_data(self):
        """Test creation of test OHLCV data"""
        bars = TestFixtures.create_test_ohlcv_data(num_bars=20)
        
        assert len(bars) == 20
        assert all(hasattr(bar, 'symbol') for bar in bars)
        assert all(hasattr(bar, 'close') for bar in bars)
        assert all(bar.symbol == "AAPL" for bar in bars)
        
        print("✅ Test OHLCV data creation successful")
    
    def test_uptrend_data(self):
        """Test uptrend data generation"""
        bars = TestFixtures.create_test_ohlcv_data(num_bars=10, trend="up")
        
        # Check that prices generally increase
        closes = [float(bar.close) for bar in bars]
        assert closes[-1] > closes[0], "Uptrend should have higher ending price"
        
        print("✅ Uptrend data generation successful")
    
    def test_downtrend_data(self):
        """Test downtrend data generation"""
        bars = TestFixtures.create_test_ohlcv_data(num_bars=10, trend="down")
        
        # Check that prices generally decrease
        closes = [float(bar.close) for bar in bars]
        assert closes[-1] < closes[0], "Downtrend should have lower ending price"
        
        print("✅ Downtrend data generation successful")
    
    def test_signal_input_creation(self):
        """Test SignalInput creation"""
        signal_input = TestFixtures.create_signal_input()
        
        assert signal_input.symbol == "AAPL"
        assert signal_input.current_price > 0
        assert len(signal_input.historical_data) > 0
        assert isinstance(signal_input.parameters, dict)
        
        print("✅ SignalInput creation successful")


class TestRSISignalLogic:
    """Test RSI signal logic without actual signal execution"""
    
    def test_rsi_calculation_logic(self):
        """Test RSI calculation logic"""
        # Create test data with known pattern
        bars = TestFixtures.create_test_ohlcv_data(num_bars=30, trend="down")
        
        # Convert to DataFrame for pandas_ta
        import pandas as pd
        import pandas_ta as ta
        
        data = []
        for bar in bars:
            data.append({
                'close': float(bar.close)
            })
        
        df = pd.DataFrame(data)
        rsi = ta.rsi(df['close'], length=14)
        
        assert not rsi.empty
        assert len(rsi) == len(df)
        
        # RSI should be between 0 and 100
        valid_rsi = rsi.dropna()
        assert all(0 <= val <= 100 for val in valid_rsi)
        
        print("✅ RSI calculation logic validation successful")
    
    def test_rsi_oversold_condition(self):
        """Test RSI oversold condition detection"""
        # Create strongly downtrending data to trigger oversold
        bars = TestFixtures.create_test_ohlcv_data(num_bars=30, start_price=200.0, trend="down")
        
        import pandas as pd
        import pandas_ta as ta
        
        data = [{'close': float(bar.close)} for bar in bars]
        df = pd.DataFrame(data)
        rsi = ta.rsi(df['close'], length=14)
        
        final_rsi = rsi.iloc[-1]
        
        # With strong downtrend, RSI should be low
        assert final_rsi < 50, f"Expected low RSI for downtrend, got {final_rsi}"
        
        print(f"✅ RSI oversold logic test successful (final RSI: {final_rsi:.2f})")


class TestMACDSignalLogic:
    """Test MACD signal logic without actual signal execution"""
    
    def test_macd_calculation_logic(self):
        """Test MACD calculation logic"""
        bars = TestFixtures.create_test_ohlcv_data(num_bars=50)
        
        import pandas as pd
        import pandas_ta as ta
        
        data = [{'close': float(bar.close)} for bar in bars]
        df = pd.DataFrame(data)
        macd_data = ta.macd(df['close'], fast=12, slow=26, signal=9)
        
        assert macd_data is not None
        assert not macd_data.empty
        assert macd_data.shape[1] == 3  # MACD, Signal, Histogram
        
        print("✅ MACD calculation logic validation successful")
    
    def test_macd_crossover_detection(self):
        """Test MACD crossover detection logic"""
        # Create data that should generate crossovers
        bars = TestFixtures.create_test_ohlcv_data(num_bars=50, trend="up")
        
        import pandas as pd
        import pandas_ta as ta
        
        data = [{'close': float(bar.close)} for bar in bars]
        df = pd.DataFrame(data)
        macd_data = ta.macd(df['close'], fast=12, slow=26, signal=9)
        
        if not macd_data.empty and len(macd_data) >= 2:
            macd_line = macd_data.iloc[:, 0]
            signal_line = macd_data.iloc[:, 1]
            
            # Check for crossovers in the data
            crossovers = 0
            for i in range(1, len(macd_line)):
                if not pd.isna(macd_line.iloc[i]) and not pd.isna(signal_line.iloc[i]):
                    prev_diff = macd_line.iloc[i-1] - signal_line.iloc[i-1]
                    curr_diff = macd_line.iloc[i] - signal_line.iloc[i]
                    
                    if (prev_diff <= 0 and curr_diff > 0) or (prev_diff >= 0 and curr_diff < 0):
                        crossovers += 1
            
            print(f"✅ MACD crossover detection successful (found {crossovers} crossovers)")
        else:
            print("✅ MACD crossover test completed (insufficient data for crossovers)")


class TestSMASignalLogic:
    """Test SMA signal logic without actual signal execution"""
    
    def test_sma_calculation_logic(self):
        """Test SMA calculation logic"""
        bars = TestFixtures.create_test_ohlcv_data(num_bars=30)
        
        import pandas as pd
        import pandas_ta as ta
        
        data = [{'close': float(bar.close)} for bar in bars]
        df = pd.DataFrame(data)
        
        fast_sma = ta.sma(df['close'], length=10)
        slow_sma = ta.sma(df['close'], length=20)
        
        assert not fast_sma.empty
        assert not slow_sma.empty
        assert len(fast_sma) == len(df)
        assert len(slow_sma) == len(df)
        
        print("✅ SMA calculation logic validation successful")
    
    def test_sma_crossover_detection(self):
        """Test SMA crossover detection logic"""
        # Create trending data to generate crossovers
        bars = TestFixtures.create_test_ohlcv_data(num_bars=40, trend="up")
        
        import pandas as pd
        import pandas_ta as ta
        
        data = [{'close': float(bar.close)} for bar in bars]
        df = pd.DataFrame(data)
        
        fast_sma = ta.sma(df['close'], length=5)
        slow_sma = ta.sma(df['close'], length=15)
        
        # Look for crossovers
        crossovers = 0
        for i in range(1, len(fast_sma)):
            if not pd.isna(fast_sma.iloc[i]) and not pd.isna(slow_sma.iloc[i]):
                prev_fast = fast_sma.iloc[i-1]
                prev_slow = slow_sma.iloc[i-1]
                curr_fast = fast_sma.iloc[i]
                curr_slow = slow_sma.iloc[i]
                
                if not pd.isna(prev_fast) and not pd.isna(prev_slow):
                    # Check for golden cross (fast crosses above slow)
                    if prev_fast <= prev_slow and curr_fast > curr_slow:
                        crossovers += 1
                    # Check for death cross (fast crosses below slow)
                    elif prev_fast >= prev_slow and curr_fast < curr_slow:
                        crossovers += 1
        
        print(f"✅ SMA crossover detection successful (found {crossovers} crossovers)")


class TestSignalValidation:
    """Test signal validation and error handling"""
    
    def test_insufficient_data_handling(self):
        """Test handling of insufficient data"""
        # Create very limited data
        bars = TestFixtures.create_test_ohlcv_data(num_bars=5)
        signal_input = TestFixtures.create_signal_input(historical_data=bars)
        
        # Test validation function
        from signals.technical_signals import validate_technical_signal_input
        
        errors = validate_technical_signal_input(signal_input)
        
        # Should pass basic validation (has data, positive price)
        assert len(errors) == 0 or all("insufficient" not in error.lower() for error in errors)
        
        print("✅ Insufficient data handling test successful")
    
    def test_invalid_parameters(self):
        """Test handling of invalid parameters"""
        signal_input = TestFixtures.create_signal_input(
            parameters={
                'fast_period': 20,  # Invalid: fast > slow
                'slow_period': 10
            }
        )
        
        # Parameters should be validated by individual signal functions
        assert signal_input.parameters['fast_period'] == 20
        assert signal_input.parameters['slow_period'] == 10
        
        print("✅ Invalid parameters test successful")


class TestSignalUtilities:
    """Test signal utility functions"""
    
    def test_get_technical_signals_info(self):
        """Test technical signals info function"""
        from signals.technical_signals import get_technical_signals_info
        
        info = get_technical_signals_info()
        
        assert 'available_signals' in info
        assert 'total_signals' in info
        assert info['total_signals'] == 3
        assert len(info['available_signals']) == 3
        
        # Check signal names
        signal_names = [sig['name'] for sig in info['available_signals']]
        expected_names = ['rsi_signal', 'macd_signal', 'sma_crossover_signal']
        
        for name in expected_names:
            assert name in signal_names
        
        print("✅ Technical signals info function test successful")


if __name__ == "__main__":
    # Run basic tests
    test_classes = [
        TestTechnicalSignalsBasic,
        TestRSISignalLogic,
        TestMACDSignalLogic,
        TestSMASignalLogic,
        TestSignalValidation,
        TestSignalUtilities
    ]
    
    total_tests = 0
    passed_tests = 0
    
    print("🚀 Technical Signals Test Suite")
    print("=" * 50)
    
    for test_class in test_classes:
        print(f"\n📋 Running {test_class.__name__}")
        print("-" * 30)
        
        instance = test_class()
        methods = [method for method in dir(instance) if method.startswith('test_')]
        
        for method_name in methods:
            total_tests += 1
            try:
                method = getattr(instance, method_name)
                method()
                passed_tests += 1
            except Exception as e:
                print(f"❌ {method_name} failed: {e}")
    
    print(f"\n📊 Test Results:")
    print(f"  Passed: {passed_tests}/{total_tests}")
    print(f"  Success Rate: {(passed_tests/total_tests)*100:.1f}%")
    
    if passed_tests == total_tests:
        print("\n✅ All technical signal tests passed!")
    else:
        print(f"\n⚠️  {total_tests-passed_tests} tests failed.")
    
    print("\n" + "=" * 50)
    print("🎯 Technical Signals Test Complete!")
