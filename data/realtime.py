"""Real-time data provider stub compatible with DataProvider interface.
CI uses mocked WebSocket events; no external network calls.
"""
from __future__ import annotations
from typing import AsyncIterator, Dict, Any


class RealTimeDataProvider:
async def stream(self, symbol: str, timeframe: str = "1m") -> AsyncIterator[Dict[str, Any]]:
"""Yield mocked ticks/kline updates (stub)."""
if False:
yield {"symbol": symbol, "timeframe": timeframe, "price": 0.0}
return