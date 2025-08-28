import pytest
import pandas as pd
from signals.stock_patterns import head_and_shoulders, triangle_breakout, price_breakout


@pytest.mark.skip("stub: implement patterns")
def test_patterns_stub():
idx = pd.date_range("2024-01-01", periods=100, freq="D")
df = pd.DataFrame({"open":1,"high":1,"low":1,"close":1,"volume":1}, index=idx)
assert (~head_and_shoulders(df)).all()
assert (~triangle_breakout(df)).all()
assert (~price_breakout(df)).all()