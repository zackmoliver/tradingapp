"""Temporary patch file to register new stock signals until full integration."""
from signals import registry
from signals import stock_patterns, vwap


registry.register("head_shoulders", stock_patterns.head_and_shoulders)
registry.register("triangle_breakout", stock_patterns.triangle_breakout)
registry.register("price_breakout", stock_patterns.price_breakout)
registry.register("vwap", vwap.vwap)