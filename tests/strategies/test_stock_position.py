import pytest
from strategies.stock_position import StockPositionStrategy


@pytest.mark.skip("stub: implement simulation & trend filters")
def test_stock_position_stub():
s = StockPositionStrategy({"symbol":"AAPL"})
assert s.name == "stock_position"