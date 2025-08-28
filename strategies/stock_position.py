"""Stock Position strategy stub: weekly trend filters + ATR exits."""
from __future__ import annotations
from typing import Dict, Any
from dataclasses import dataclass


@dataclass
class StockPositionParams:
symbol: str = "AAPL"
timeframe: str = "1w"
trend_ma: int = 20




class StockPositionStrategy:
name = "stock_position"


def __init__(self, params: Dict[str, Any] | None = None):
self.params = StockPositionParams(**(params or {}))


def simulate(self, *_, **__):
return None