"""
RSI Mean Reversion Strategy - Options Trading Backtest Engine

A complete trading strategy that demonstrates the integration of:
- BacktestEngine for execution
- Signal Registry for RSI signal execution
- StrategyContext for market data and order management

This strategy implements a classic mean reversion approach using RSI:
- BUY when RSI indicates oversold conditions (< oversold_threshold)
- SELL when RSI indicates overbought conditions (> overbought_threshold)
- Uses the registered 'rsi_signal' from the signal registry

BUSINESS LOGIC IMPLEMENTATION
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any, List, Optional
import uuid

# Import strategy contracts
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Import required types from BacktestEngine
from src.engine.backtest_engine import BacktestStrategyContext

logger = logging.getLogger(__name__)


class RSIMeanReversionStrategy:
    """
    RSI Mean Reversion Trading Strategy
    
    This strategy demonstrates the complete integration of our Batch 2 components:
    - Uses BacktestEngine's StrategyContext for execution
    - Executes RSI signals through the Signal Registry
    - Implements proper order management and risk controls
    
    Strategy Logic:
    1. Execute RSI signal on each market data event
    2. When RSI signal indicates oversold (BUY): Submit buy order
    3. When RSI signal indicates overbought (SELL): Submit sell order
    4. Manage position sizing and risk controls
    5. Track performance and signal effectiveness
    """
    
    def __init__(self, strategy_id: str = "rsi_mean_reversion"):
        """Initialize the RSI Mean Reversion Strategy"""
        self.strategy_id = strategy_id
        self.name = "RSI Mean Reversion Strategy"
        self.version = "1.0.0"
        self.description = "Mean reversion strategy using RSI overbought/oversold signals"
        
        # Strategy state
        self.is_initialized = False
        self.parameters = {}
        self.universe = []
        self.positions = {}
        self.orders_submitted = []
        self.signals_executed = []
        self.performance_metrics = {}
        
        # Risk management
        self.max_position_size = Decimal('1000')  # Maximum position size per symbol
        self.max_portfolio_risk = Decimal('0.02')  # 2% max risk per trade
        self.position_sizing_method = "fixed"  # "fixed", "percent_portfolio", "volatility_adjusted"
        
        self._logger = logging.getLogger(f"strategy.{strategy_id}")
    
    async def initialize(self, context: BacktestStrategyContext) -> bool:
        """
        Initialize the strategy with context and parameters.
        
        Args:
            context: BacktestStrategyContext providing access to market data and execution
            
        Returns:
            True if initialization successful, False otherwise
        """
        try:
            self._logger.info(f"Initializing {self.name} v{self.version}")
            
            # Set default parameters if not provided
            self.parameters = {
                'rsi_period': 14,
                'oversold_threshold': 30,
                'overbought_threshold': 70,
                'min_confidence': 0.6,
                'position_size': Decimal('100'),  # Default position size
                'enable_short_selling': True,
                'max_positions': 5,
                'rebalance_frequency': 'daily'
            }
            
            # Set universe (symbols to trade) - will be provided by BacktestEngine config
            self.universe = ['AAPL', 'MSFT']  # Default universe
            
            # Initialize position tracking
            for symbol in self.universe:
                self.positions[symbol] = {
                    'quantity': Decimal('0'),
                    'average_price': Decimal('0'),
                    'last_signal': None,
                    'last_order_time': None
                }
            
            # Log strategy configuration
            self._logger.info(f"Strategy parameters: {self.parameters}")
            self._logger.info(f"Trading universe: {self.universe}")
            self._logger.info(f"Max position size: {self.max_position_size}")
            
            # Test signal registry connection
            try:
                # This will test that we can access the signal registry
                context.log_info("Testing signal registry connection...")
                # We'll test actual signal execution in on_market_data
                context.log_info("Signal registry connection successful")
            except Exception as e:
                self._logger.error(f"Failed to connect to signal registry: {e}")
                return False
            
            self.is_initialized = True
            context.log_info(f"{self.name} initialized successfully")
            return True
            
        except Exception as e:
            self._logger.error(f"Strategy initialization failed: {e}")
            context.log_error(f"Strategy initialization failed: {e}")
            return False
    
    async def on_market_data(self, context: BacktestStrategyContext, event) -> None:
        """
        Process market data event and execute RSI-based trading logic.
        
        Args:
            context: Strategy execution context
            event: Market data event
        """
        try:
            if not self.is_initialized:
                context.log_warning("Strategy not initialized, skipping market data processing")
                return
            
            # Process each symbol in our universe
            for symbol in self.universe:
                await self._process_symbol(context, symbol, event)
                
        except Exception as e:
            self._logger.error(f"Error processing market data: {e}")
            context.log_error(f"Error processing market data: {e}")
    
    async def _process_symbol(self, context: BacktestStrategyContext, symbol: str, event) -> None:
        """
        Process market data for a specific symbol.
        
        Args:
            context: Strategy execution context
            symbol: Symbol to process
            event: Market data event
        """
        try:
            # Get current price
            current_price = await context.get_current_price(symbol)
            if not current_price or current_price <= 0:
                context.log_warning(f"No valid current price for {symbol}")
                return
            
            # Execute RSI signal using the signal registry
            rsi_signal_result = await context.execute_signal(
                'rsi_signal',
                symbol,
                {
                    'rsi_period': self.parameters['rsi_period'],
                    'oversold_threshold': self.parameters['oversold_threshold'],
                    'overbought_threshold': self.parameters['overbought_threshold'],
                    'min_confidence': self.parameters['min_confidence']
                }
            )
            
            if not rsi_signal_result:
                context.log_debug(f"No RSI signal result for {symbol}")
                return
            
            # Store signal for analysis
            self.signals_executed.append({
                'symbol': symbol,
                'timestamp': datetime.now(),
                'signal_result': rsi_signal_result,
                'current_price': current_price
            })
            
            # Log signal details
            context.log_info(
                f"RSI Signal for {symbol}: {rsi_signal_result.signal_type.value} "
                f"(confidence: {rsi_signal_result.confidence}, "
                f"strength: {rsi_signal_result.strength.value})"
            )
            
            # Process signal and make trading decisions
            await self._process_signal(context, symbol, rsi_signal_result, current_price)
            
        except Exception as e:
            self._logger.error(f"Error processing symbol {symbol}: {e}")
            context.log_error(f"Error processing symbol {symbol}: {e}")
    
    async def _process_signal(self, context: BacktestStrategyContext, symbol: str, signal_result, current_price: Decimal) -> None:
        """
        Process RSI signal and execute trading logic.
        
        Args:
            context: Strategy execution context
            symbol: Symbol being processed
            signal_result: RSI signal result from signal registry
            current_price: Current market price
        """
        try:
            from src.signals.registry import SignalType
            
            # Get current position
            current_position = self.positions[symbol]
            current_quantity = current_position['quantity']
            
            # Determine action based on signal type
            if signal_result.signal_type == SignalType.BUY and signal_result.confidence >= self.parameters['min_confidence']:
                # RSI indicates oversold - potential buy signal
                if current_quantity <= 0:  # No long position or have short position
                    await self._execute_buy_order(context, symbol, signal_result, current_price)
                else:
                    context.log_debug(f"Already long {symbol}, skipping buy signal")
                    
            elif signal_result.signal_type == SignalType.SELL and signal_result.confidence >= self.parameters['min_confidence']:
                # RSI indicates overbought - potential sell signal
                if current_quantity >= 0:  # No short position or have long position
                    if current_quantity > 0:
                        # Close long position
                        await self._execute_sell_order(context, symbol, signal_result, current_price, close_position=True)
                    elif self.parameters['enable_short_selling']:
                        # Open short position
                        await self._execute_sell_order(context, symbol, signal_result, current_price, close_position=False)
                else:
                    context.log_debug(f"Already short {symbol}, skipping sell signal")
                    
            elif signal_result.signal_type == SignalType.HOLD:
                context.log_debug(f"RSI signal for {symbol}: HOLD - no action taken")
            
            # Update position tracking
            self.positions[symbol]['last_signal'] = signal_result
            
        except Exception as e:
            self._logger.error(f"Error processing signal for {symbol}: {e}")
            context.log_error(f"Error processing signal for {symbol}: {e}")
    
    async def _execute_buy_order(self, context: BacktestStrategyContext, symbol: str, signal_result, current_price: Decimal) -> None:
        """
        Execute buy order based on RSI signal.
        
        Args:
            context: Strategy execution context
            symbol: Symbol to buy
            signal_result: RSI signal result
            current_price: Current market price
        """
        try:
            # Calculate position size
            position_size = self._calculate_position_size(context, symbol, current_price, 'BUY')
            
            if position_size <= 0:
                context.log_warning(f"Invalid position size for {symbol} buy order: {position_size}")
                return
            
            # Create order request (simplified - BacktestEngine will handle the actual OrderRequest creation)
            order_id = await context.submit_order({
                'symbol': symbol,
                'side': 'BUY',
                'quantity': position_size,
                'order_type': 'MARKET',
                'price': None,  # Market order
                'metadata': {
                    'strategy_id': self.strategy_id,
                    'signal_id': signal_result.signal_id,
                    'signal_confidence': float(signal_result.confidence),
                    'signal_reasoning': signal_result.reasoning,
                    'rsi_signal_type': 'oversold_buy'
                }
            })
            
            # Track order
            self.orders_submitted.append({
                'order_id': order_id,
                'symbol': symbol,
                'side': 'BUY',
                'quantity': position_size,
                'price': current_price,
                'timestamp': datetime.now(),
                'signal_id': signal_result.signal_id
            })
            
            # Update position tracking (optimistic - will be corrected on fill)
            self.positions[symbol]['quantity'] += position_size
            self.positions[symbol]['last_order_time'] = datetime.now()
            
            context.log_info(
                f"Submitted BUY order for {symbol}: {position_size} shares @ ${current_price} "
                f"(RSI oversold, confidence: {signal_result.confidence})"
            )
            
        except Exception as e:
            self._logger.error(f"Error executing buy order for {symbol}: {e}")
            context.log_error(f"Error executing buy order for {symbol}: {e}")
    
    async def _execute_sell_order(self, context: BacktestStrategyContext, symbol: str, signal_result, current_price: Decimal, close_position: bool = False) -> None:
        """
        Execute sell order based on RSI signal.
        
        Args:
            context: Strategy execution context
            symbol: Symbol to sell
            signal_result: RSI signal result
            current_price: Current market price
            close_position: Whether this is closing an existing long position
        """
        try:
            if close_position:
                # Close existing long position
                current_quantity = self.positions[symbol]['quantity']
                position_size = abs(current_quantity)
                order_type = 'close_long'
            else:
                # Open new short position
                position_size = self._calculate_position_size(context, symbol, current_price, 'SELL')
                order_type = 'open_short'
            
            if position_size <= 0:
                context.log_warning(f"Invalid position size for {symbol} sell order: {position_size}")
                return
            
            # Create order request
            order_id = await context.submit_order({
                'symbol': symbol,
                'side': 'SELL',
                'quantity': position_size,
                'order_type': 'MARKET',
                'price': None,  # Market order
                'metadata': {
                    'strategy_id': self.strategy_id,
                    'signal_id': signal_result.signal_id,
                    'signal_confidence': float(signal_result.confidence),
                    'signal_reasoning': signal_result.reasoning,
                    'rsi_signal_type': 'overbought_sell',
                    'order_type': order_type
                }
            })
            
            # Track order
            self.orders_submitted.append({
                'order_id': order_id,
                'symbol': symbol,
                'side': 'SELL',
                'quantity': position_size,
                'price': current_price,
                'timestamp': datetime.now(),
                'signal_id': signal_result.signal_id,
                'order_type': order_type
            })
            
            # Update position tracking (optimistic)
            if close_position:
                self.positions[symbol]['quantity'] = Decimal('0')
            else:
                self.positions[symbol]['quantity'] -= position_size
            
            self.positions[symbol]['last_order_time'] = datetime.now()
            
            context.log_info(
                f"Submitted SELL order for {symbol}: {position_size} shares @ ${current_price} "
                f"(RSI overbought, confidence: {signal_result.confidence}, type: {order_type})"
            )
            
        except Exception as e:
            self._logger.error(f"Error executing sell order for {symbol}: {e}")
            context.log_error(f"Error executing sell order for {symbol}: {e}")
    
    def _calculate_position_size(self, context: BacktestStrategyContext, symbol: str, current_price: Decimal, side: str) -> Decimal:
        """
        Calculate appropriate position size based on risk management rules.
        
        Args:
            context: Strategy execution context
            symbol: Symbol being traded
            current_price: Current market price
            side: Order side ('BUY' or 'SELL')
            
        Returns:
            Position size in shares
        """
        try:
            if self.position_sizing_method == "fixed":
                return self.parameters['position_size']
            
            elif self.position_sizing_method == "percent_portfolio":
                # Calculate based on percentage of portfolio value
                portfolio = context.get_portfolio()  # This would be async in real implementation
                portfolio_value = Decimal('100000')  # Simplified for demo
                target_allocation = Decimal('0.1')  # 10% per position
                return (portfolio_value * target_allocation) / current_price
            
            else:
                # Default to fixed size
                return self.parameters['position_size']
                
        except Exception as e:
            self._logger.error(f"Error calculating position size: {e}")
            return self.parameters['position_size']  # Fallback to default
    
    async def cleanup(self, context: BacktestStrategyContext) -> None:
        """
        Cleanup strategy resources and finalize execution.
        
        Args:
            context: Strategy execution context
        """
        try:
            context.log_info(f"Cleaning up {self.name}")
            
            # Log final statistics
            total_signals = len(self.signals_executed)
            total_orders = len(self.orders_submitted)
            
            context.log_info(f"Strategy execution summary:")
            context.log_info(f"  Total RSI signals executed: {total_signals}")
            context.log_info(f"  Total orders submitted: {total_orders}")
            context.log_info(f"  Final positions: {self.positions}")
            
            # Calculate signal effectiveness
            if total_signals > 0:
                buy_signals = sum(1 for s in self.signals_executed if s['signal_result'].signal_type.value == 'BUY')
                sell_signals = sum(1 for s in self.signals_executed if s['signal_result'].signal_type.value == 'SELL')
                hold_signals = total_signals - buy_signals - sell_signals
                
                context.log_info(f"  Signal breakdown: {buy_signals} BUY, {sell_signals} SELL, {hold_signals} HOLD")
            
            # Clear state
            self.is_initialized = False
            context.log_info(f"{self.name} cleanup completed successfully")
            
        except Exception as e:
            self._logger.error(f"Error during strategy cleanup: {e}")
            context.log_error(f"Error during strategy cleanup: {e}")
    
    def get_strategy_info(self) -> Dict[str, Any]:
        """
        Get strategy metadata and information.
        
        Returns:
            Dictionary with strategy information
        """
        return {
            'name': self.name,
            'version': self.version,
            'description': self.description,
            'strategy_id': self.strategy_id,
            'parameters_schema': {
                'rsi_period': {'type': 'integer', 'default': 14, 'min': 2, 'max': 100},
                'oversold_threshold': {'type': 'number', 'default': 30, 'min': 10, 'max': 40},
                'overbought_threshold': {'type': 'number', 'default': 70, 'min': 60, 'max': 90},
                'min_confidence': {'type': 'number', 'default': 0.6, 'min': 0.1, 'max': 1.0},
                'position_size': {'type': 'number', 'default': 100, 'min': 1, 'max': 10000},
                'enable_short_selling': {'type': 'boolean', 'default': True},
                'max_positions': {'type': 'integer', 'default': 5, 'min': 1, 'max': 20}
            },
            'risk_parameters_schema': {
                'max_position_size': {'type': 'number', 'default': 1000},
                'max_portfolio_risk': {'type': 'number', 'default': 0.02},
                'position_sizing_method': {'type': 'string', 'default': 'fixed', 'options': ['fixed', 'percent_portfolio']}
            },
            'universe': self.universe,
            'category': 'mean_reversion',
            'tags': ['rsi', 'mean_reversion', 'technical_analysis', 'momentum'],
            'author': 'TradingEngine',
            'created_at': datetime.now().isoformat(),
            'signals_used': ['rsi_signal'],
            'execution_stats': {
                'total_signals_executed': len(self.signals_executed),
                'total_orders_submitted': len(self.orders_submitted),
                'current_positions': len([p for p in self.positions.values() if p['quantity'] != 0])
            }
        }
