# Adaptive Intelligence Module Tests

This directory contains comprehensive pytest configuration and tests for the adaptive intelligence module.

## Test Structure

```
tests/adaptive/
├── __init__.py                 # Test package initialization
├── conftest.py                 # Pytest fixtures and configuration
├── test_types.py              # Unit tests for core types
├── test_integration.py        # Integration tests
├── run_adaptive_tests.py      # Specialized test runner
└── README.md                  # This documentation
```

## Features

### ✅ Network Isolation
- **Automatic prohibition** of all external network calls
- **Socket blocking** prevents any network connections
- **HTTP request blocking** for requests/urllib3
- **Enforced test isolation** for reproducible results

### ✅ Deterministic Fixtures
- **Seeded random generators** for reproducible test data
- **Fixed timestamps** and version tracking
- **Consistent market data** generation
- **Deterministic backtest summaries**

### ✅ Comprehensive Mock Data
- **Market state fixtures** for all market regimes
- **Price data generation** with realistic patterns
- **Options data simulation** with Greeks
- **Market indicators** (VIX, RSI, MACD, etc.)
- **Backtest summary.json slices** with realistic performance data

### ✅ Coverage Configuration
- **80% coverage threshold** matching engine modules
- **Adaptive module coverage** specifically configured
- **HTML and XML reports** for detailed analysis
- **Coverage exclusions** for test files and __pycache__

### ✅ Test Markers
- `@pytest.mark.adaptive` - All adaptive intelligence tests
- `@pytest.mark.unit` - Unit tests
- `@pytest.mark.integration` - Integration tests
- `@pytest.mark.performance` - Performance benchmarks
- `@pytest.mark.optimizer` - Optimization-specific tests
- `@pytest.mark.pattern` - Pattern recognition tests
- `@pytest.mark.rl` - Reinforcement learning tests

## Key Fixtures

### Core Type Fixtures
```python
@pytest.fixture
def test_version():
    """Standard test version for all adaptive components"""

@pytest.fixture
def sample_market_state(test_version, seeded_random):
    """Create a sample market state for testing"""

@pytest.fixture
def sample_optimized_parameters(test_version, seeded_random):
    """Create sample optimized strategy parameters"""

@pytest.fixture
def sample_strategy_allocation(test_version, multiple_strategy_parameters):
    """Create sample strategy allocation for testing"""
```

### Market Data Fixtures
```python
@pytest.fixture
def sample_price_data(seeded_random):
    """Generate deterministic price data for testing"""

@pytest.fixture
def sample_market_indicators(seeded_random):
    """Generate deterministic market indicators for testing"""
```

### Backtest Data Fixtures
```python
@pytest.fixture
def sample_backtest_summary():
    """Create deterministic backtest summary.json slice for testing"""

@pytest.fixture
def multiple_backtest_summaries(seeded_random):
    """Create multiple backtest summaries for different strategies"""

@pytest.fixture
def mock_backtest_files(tmp_path, multiple_backtest_summaries):
    """Create mock backtest files in temporary directory structure"""
```

## Running Tests

### Basic Commands
```bash
# Set Python path and run all adaptive tests
PYTHONPATH=. python -m pytest tests/adaptive/ -m adaptive

# Run unit tests only
PYTHONPATH=. python -m pytest tests/adaptive/test_types.py -v

# Run with coverage
PYTHONPATH=. python -m pytest tests/adaptive/ --cov=adaptive --cov-report=html

# Run fast tests (exclude slow)
PYTHONPATH=. python -m pytest tests/adaptive/ -m "adaptive and not slow"
```

### Using Test Runner
```bash
# Run specialized test runner
PYTHONPATH=. python tests/adaptive/run_adaptive_tests.py unit
PYTHONPATH=. python tests/adaptive/run_adaptive_tests.py integration
PYTHONPATH=. python tests/adaptive/run_adaptive_tests.py all
PYTHONPATH=. python tests/adaptive/run_adaptive_tests.py ci
```

### Windows PowerShell
```powershell
# Set environment variable in PowerShell
$env:PYTHONPATH = "."
python -m pytest tests/adaptive/ -m adaptive
```

## Test Data Examples

### Sample Backtest Summary
```json
{
  "strategy_id": "iron_condor_test",
  "run_id": "test_run_001",
  "total_trades": 25,
  "winning_trades": 18,
  "win_rate": 0.72,
  "total_pnl": 15000.0,
  "sharpe_ratio": 1.25,
  "max_drawdown": 0.08,
  "parameters": {
    "strike_delta": 0.25,
    "days_to_expiry": 45,
    "profit_target": 0.5
  },
  "performance_metrics": {
    "total_return": 0.15,
    "volatility": 0.12
  },
  "risk_metrics": {
    "var_95": 0.05,
    "expected_shortfall": 0.07
  }
}
```

### Market State Features
- 28+ standardized features including:
  - Price and volatility metrics
  - Technical indicators (RSI, MACD, Bollinger)
  - Options metrics (Put/Call ratio, Gamma exposure)
  - Market sentiment (Fear/Greed index)
  - Economic indicators (VIX, Interest rates)

## Coverage Requirements

- **Minimum 80% coverage** for all adaptive modules
- **Line coverage** and **branch coverage** tracking
- **HTML reports** generated in `htmlcov/adaptive/`
- **XML reports** for CI/CD integration
- **Coverage exclusions** for test files and generated code

## Network Isolation

All tests automatically prohibit external network calls:
```python
@pytest.fixture(autouse=True)
def prohibit_network_calls(monkeypatch):
    """Automatically prohibit all external network calls in tests"""
    # Blocks socket creation and HTTP requests
```

## Performance Testing

Performance tests verify:
- **Feature vector conversion** speed (< 1 second for 1000 iterations)
- **Constraint validation** performance (< 0.5 seconds for 1000 iterations)
- **Pattern recognition** efficiency
- **Optimization algorithm** speed

## Integration Testing

Integration tests verify:
- **End-to-end workflows** from data to allocation
- **Backtest data integration** with summary.json parsing
- **Market analysis pipelines** with regime detection
- **Error handling** for edge cases and invalid data

## Troubleshooting

### Common Issues

1. **Import Errors**
   ```bash
   # Solution: Set PYTHONPATH
   export PYTHONPATH=.  # Linux/Mac
   $env:PYTHONPATH = "."  # Windows PowerShell
   ```

2. **Network Call Errors**
   ```
   RuntimeError: Network calls are prohibited in tests
   # This is expected - use mocked data fixtures instead
   ```

3. **Coverage Failures**
   ```bash
   # Check coverage report
   python -m pytest tests/adaptive/ --cov=adaptive --cov-report=term-missing
   ```

### Debugging Tests
```bash
# Run with verbose output and no capture
PYTHONPATH=. python -m pytest tests/adaptive/ -v -s

# Run specific test with debugging
PYTHONPATH=. python -m pytest tests/adaptive/test_types.py::TestMarketState::test_market_state_creation_with_defaults -v -s
```

## CI/CD Integration

The test configuration is designed for CI/CD environments:
- **No external dependencies** required
- **Deterministic test results** with fixed seeds
- **Fast execution** with performance benchmarks
- **Comprehensive coverage** reporting
- **Multiple output formats** (terminal, HTML, XML)

## Next Steps

1. **Add more test cases** for edge cases and error conditions
2. **Implement optimizer-specific tests** when algorithms are added
3. **Add RL environment tests** when agents are implemented
4. **Enhance performance benchmarks** with more realistic datasets
5. **Add property-based testing** with Hypothesis for robust validation
