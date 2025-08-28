"""Stock pattern detection stubs (Head & Shoulders, Triangles, Breakouts).
Registered via the global indicator registry in signals/registry.py.


Note: keep deterministic outputs for CI (use fixed thresholds in tests).
"""
from __future__ import annotations
from typing import Dict, Any
import pandas as pd


__all__ = [
"head_and_shoulders",
"triangle_breakout",
"price_breakout",
]




def head_and_shoulders(ohlcv: pd.DataFrame, *, lookback: int = 100, tolerance: float = 0.02) -> pd.Series:
"""Return a boolean Series marking H&S pattern completion bars.
Args:
ohlcv: DataFrame with columns ["open","high","low","close","volume"].
lookback: window to inspect.
tolerance: peak alignment tolerance (0..1).
"""
# TODO: implement. For now, return False for all rows.
return pd.Series(False, index=ohlcv.index, name="head_shoulders")




def triangle_breakout(ohlcv: pd.DataFrame, *, lookback: int = 60, breakout_pct: float = 0.01) -> pd.Series:
"""Return True where price breaks out of a converging triangle.
"""
return pd.Series(False, index=ohlcv.index, name="triangle_breakout")




def price_breakout(ohlcv: pd.DataFrame, *, lookback: int = 20, k: float = 2.0) -> pd.Series:
"""Simple breakout vs rolling mean + k*std (placeholder)."""
return pd.Series(False, index=ohlcv.index, name="price_breakout")