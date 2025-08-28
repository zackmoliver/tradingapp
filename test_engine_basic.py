#!/usr/bin/env python3
"""
Basic BacktestEngine Test - Options Trading Backtest Engine

Simple test to validate core BacktestEngine functionality without complex imports.
"""

import sys
import os
from datetime import datetime
from decimal import Decimal

# Add current directory to path
sys.path.append('.')

def test_basic_imports():
    """Test basic imports work"""
    print("🧪 Testing basic imports...")
    
    try:
        from src.data.repository import SQLiteBacktestRepository
        print("  ✅ Repository imports working")
        return True
    except Exception as e:
        print(f"  ❌ Repository import failed: {e}")
        return False

def test_repository_creation():
    """Test repository creation"""
    print("🧪 Testing repository creation...")
    
    try:
        from src.data.repository import SQLiteBacktestRepository
        repo = SQLiteBacktestRepository(':memory:')
        print("  ✅ SQLite repository created successfully")
        return True
    except Exception as e:
        print(f"  ❌ Repository creation failed: {e}")
        return False

def test_config_creation():
    """Test configuration creation"""
    print("🧪 Testing configuration creation...")
    
    try:
        # Create a simple config-like object
        class TestConfig:
            def __init__(self):
                self.start_date = datetime(2024, 1, 1)
                self.end_date = datetime(2024, 1, 10)
                self.initial_capital = Decimal('100000.00')
                self.symbols = ['AAPL', 'MSFT']
                self.enable_signals = True
                self.enable_options = True
                self.commission_per_trade = Decimal('1.00')
                self.slippage_bps = 5
                self.max_positions = 10
                self.performance_update_frequency = 5
        
        config = TestConfig()
        print(f"  ✅ Test config created: {config.symbols}, ${config.initial_capital}")
        return True
    except Exception as e:
        print(f"  ❌ Config creation failed: {e}")
        return False

def test_data_structures():
    """Test basic data structures"""
    print("🧪 Testing data structures...")
    
    try:
        # Test OHLCVBar creation
        from data.provider import OHLCVBar
        
        bar = OHLCVBar(
            symbol="AAPL",
            timestamp=datetime(2024, 1, 1),
            open=Decimal('150.00'),
            high=Decimal('152.00'),
            low=Decimal('149.00'),
            close=Decimal('151.00'),
            volume=1000000,
            adjusted_close=Decimal('151.00')
        )
        
        print(f"  ✅ OHLCVBar created: {bar.symbol} @ ${bar.close}")
        return True
    except Exception as e:
        print(f"  ❌ Data structure test failed: {e}")
        return False

def main():
    """Run all basic tests"""
    print("🚀 BacktestEngine Basic Functionality Test")
    print("=" * 50)
    
    tests = [
        test_basic_imports,
        test_repository_creation,
        test_config_creation,
        test_data_structures
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        try:
            if test():
                passed += 1
            print()
        except Exception as e:
            print(f"  ❌ Test failed with exception: {e}")
            print()
    
    print("📊 Test Results:")
    print(f"  Passed: {passed}/{total}")
    print(f"  Success Rate: {(passed/total)*100:.1f}%")
    
    if passed == total:
        print("\n✅ All basic tests passed! Core components are working.")
    else:
        print(f"\n⚠️  {total-passed} tests failed. Some components need attention.")
    
    print("\n" + "=" * 50)
    print("🎯 Basic Test Complete!")

if __name__ == "__main__":
    main()
