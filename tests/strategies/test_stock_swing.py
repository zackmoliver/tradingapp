import pytest
from strategies.stock_swing import StockSwingStrategy


@pytest.mark.skip("stub: implement simulation & signals")
def test_stock_swing_stub():
s = StockSwingStrategy({"symbol":"AAPL"})
assert s.name == "stock_swing"