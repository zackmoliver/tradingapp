"""Intraday VWAP indicator stub.
For CI: do not require real intraday data; tests will use synthetic frames.
"""
from __future__ import annotations
import pandas as pd


__all__ = ["vwap"]




def vwap(ohlcv: pd.DataFrame) -> pd.Series:
"""Compute VWAP for provided OHLCV frame.
Expects columns: high, low, close, volume. Placeholder impl.
"""
typical = (ohlcv["high"] + ohlcv["low"] + ohlcv["close"]) / 3.0
cum_tp = typical.cumsum()
cum_vol = ohlcv["volume"].replace(0, 1).cumsum()
out = (cum_tp / cum_vol).rename("vwap")
return out