"""
Wheel Strategy - Options Trading Backtest Engine

A sophisticated two-phase options strategy that generates income through premium collection:
- Phase 1: Sell cash-secured puts to collect premium and potentially acquire stock
- Phase 2: Sell covered calls against owned stock to generate additional income

The strategy manages the complete lifecycle, including rolling positions and state transitions.

BUSINESS LOGIC IMPLEMENTATION
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any, List, Optional, Tuple
import uuid
from dataclasses import dataclass
from enum import Enum

# Import strategy contracts
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Import required types
from data.provider import OptionContract, OptionsChain

logger = logging.getLogger(__name__)


class WheelPhase(Enum):
    """Wheel strategy phases"""
    CASH_SECURED_PUTS = "cash_secured_puts"  # Phase 1: Selling puts
    COVERED_CALLS = "covered_calls"          # Phase 2: Selling calls against stock
    TRANSITIONING = "transitioning"          # Transitioning between phases
    IDLE = "idle"                           # No active positions


class WheelPositionState(Enum):
    """Individual position states"""
    ACTIVE = "active"           # Position is open
    ROLLING = "rolling"         # Position is being rolled
    ASSIGNED = "assigned"       # Put was assigned (stock acquired)
    CALLED_AWAY = "called_away" # Call was assigned (stock sold)
    EXPIRED = "expired"         # Position expired worthless
    CLOSED = "closed"          # Position manually closed


@dataclass
class WheelPosition:
    """Individual wheel position (put or call)"""
    underlying: str
    contract: OptionContract
    entry_date: datetime
    entry_price: Decimal
    quantity: int
    state: WheelPositionState
    
    # Position tracking
    current_price: Optional[Decimal] = None
    unrealized_pnl: Optional[Decimal] = None
    days_to_expiration: Optional[int] = None
    
    # Management flags
    roll_candidate: bool = False
    close_candidate: bool = False
    
    def get_current_pnl(self) -> Decimal:
        """Calculate current P&L"""
        if self.current_price is None:
            return Decimal('0')
        
        # For short positions (selling options), profit when price decreases
        pnl_per_contract = (self.entry_price - self.current_price) * 100  # Options are per 100 shares
        return pnl_per_contract * self.quantity
    
    def get_days_to_expiration(self, current_date: datetime) -> int:
        """Get days to expiration"""
        return (self.contract.expiration.date() - current_date.date()).days


@dataclass
class WheelState:
    """Complete wheel strategy state"""
    underlying: str
    phase: WheelPhase
    
    # Stock position (Phase 2)
    stock_quantity: Decimal = Decimal('0')
    stock_average_price: Decimal = Decimal('0')
    
    # Active options positions
    active_puts: List[WheelPosition] = None
    active_calls: List[WheelPosition] = None
    
    # Performance tracking
    total_premium_collected: Decimal = Decimal('0')
    total_assignments: int = 0
    total_called_away: int = 0
    
    def __post_init__(self):
        if self.active_puts is None:
            self.active_puts = []
        if self.active_calls is None:
            self.active_calls = []


class WheelStrategy:
    """
    Wheel Strategy - Premium Collection Through Put/Call Cycles
    
    A systematic approach to generating income through options:
    
    Phase 1 - Cash-Secured Puts:
    - Sell out-of-the-money puts on high-quality stocks
    - Collect premium with intention to acquire stock if assigned
    - Roll puts when they get close to expiration or tested
    
    Phase 2 - Covered Calls:
    - Once assigned stock, immediately sell covered calls
    - Generate additional income while holding stock
    - Roll calls to avoid assignment or accept being called away
    
    Management Rules:
    - Roll at 21 DTE or when strike is tested (delta > 0.30)
    - Target 0.15-0.30 delta for new positions
    - Close positions at 50% profit when possible
    - Maintain adequate cash reserves for assignments
    """
    
    def __init__(self, strategy_id: str = "wheel_strategy"):
        """Initialize the Wheel Strategy"""
        self.strategy_id = strategy_id
        self.name = "Wheel Strategy"
        self.version = "1.0.0"
        self.description = "Two-phase premium collection strategy using cash-secured puts and covered calls"
        
        # Strategy state
        self.is_initialized = False
        self.wheel_states: Dict[str, WheelState] = {}  # underlying -> state
        self.orders_submitted = []
        self.performance_metrics = {}
        
        # Strategy parameters
        self.parameters = {
            # General parameters
            'underlyings': ['AAPL'],              # Stocks to wheel
            'max_positions_per_underlying': 1,    # Max concurrent positions per stock
            'cash_reserve_ratio': Decimal('0.20'), # Keep 20% cash reserve
            
            # Put selling parameters (Phase 1)
            'put_target_delta': Decimal('0.20'),   # Target delta for puts
            'put_delta_tolerance': Decimal('0.05'), # Delta selection tolerance
            'put_target_dte': 30,                  # Target days to expiration
            'put_min_dte': 21,                     # Minimum DTE for new puts
            'put_max_dte': 45,                     # Maximum DTE for new puts
            'put_roll_dte': 21,                    # Roll puts at this DTE
            'put_roll_delta': Decimal('0.30'),     # Roll if delta exceeds this
            
            # Call selling parameters (Phase 2)
            'call_target_delta': Decimal('0.25'),  # Target delta for calls
            'call_delta_tolerance': Decimal('0.05'), # Delta selection tolerance
            'call_target_dte': 30,                 # Target days to expiration
            'call_min_dte': 21,                    # Minimum DTE for new calls
            'call_max_dte': 45,                    # Maximum DTE for new calls
            'call_roll_dte': 21,                   # Roll calls at this DTE
            'call_roll_delta': Decimal('0.30'),    # Roll if delta exceeds this
            
            # Management parameters
            'profit_target_pct': Decimal('0.50'),  # Close at 50% profit
            'max_loss_pct': Decimal('2.00'),       # Close at 200% loss
            'min_premium': Decimal('0.20'),        # Minimum premium per contract
            'max_bid_ask_spread': Decimal('0.10'), # Maximum bid-ask spread
            
            # Position sizing
            'contracts_per_position': 1,           # Number of contracts per position
            'max_portfolio_allocation': Decimal('0.80'), # Max % of portfolio per underlying
        }
        
        self._logger = logging.getLogger(f"strategy.{strategy_id}")
    
    async def initialize(self, context) -> bool:
        """
        Initialize the Wheel strategy.
        
        Args:
            context: BacktestStrategyContext providing access to market data and execution
            
        Returns:
            True if initialization successful, False otherwise
        """
        try:
            self._logger.info(f"Initializing {self.name} v{self.version}")
            
            # Validate parameters
            if not self._validate_parameters():
                return False
            
            # Initialize wheel states for each underlying
            for underlying in self.parameters['underlyings']:
                self.wheel_states[underlying] = WheelState(
                    underlying=underlying,
                    phase=WheelPhase.CASH_SECURED_PUTS  # Start with Phase 1
                )
            
            # Initialize tracking
            self.orders_submitted = []
            
            # Log strategy configuration
            self._logger.info(f"Strategy parameters: {self.parameters}")
            self._logger.info(f"Underlyings: {self.parameters['underlyings']}")
            self._logger.info(f"Put target delta: {self.parameters['put_target_delta']}")
            self._logger.info(f"Call target delta: {self.parameters['call_target_delta']}")
            
            self.is_initialized = True
            context.log_info(f"{self.name} initialized successfully")
            return True
            
        except Exception as e:
            self._logger.error(f"Strategy initialization failed: {e}")
            context.log_error(f"Strategy initialization failed: {e}")
            return False
    
    async def on_market_data(self, context, event) -> None:
        """
        Process market data event and execute Wheel strategy logic.
        
        Args:
            context: Strategy execution context
            event: Market data event
        """
        try:
            if not self.is_initialized:
                context.log_warning("Strategy not initialized, skipping market data processing")
                return
            
            # Process each underlying
            for underlying in self.parameters['underlyings']:
                await self._process_underlying(context, underlying)
                
        except Exception as e:
            self._logger.error(f"Error processing market data: {e}")
            context.log_error(f"Error processing market data: {e}")
    
    async def _process_underlying(self, context, underlying: str) -> None:
        """
        Process market data for a specific underlying.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol to process
        """
        try:
            wheel_state = self.wheel_states[underlying]
            
            # Get current options chain
            options_chain = await context.get_options_chain(underlying)
            if not options_chain:
                context.log_debug(f"No options chain available for {underlying}")
                return
            
            # Update existing positions
            await self._update_positions(context, underlying, options_chain)
            
            # Execute phase-specific logic
            if wheel_state.phase == WheelPhase.CASH_SECURED_PUTS:
                await self._process_phase1_puts(context, underlying, options_chain)
            elif wheel_state.phase == WheelPhase.COVERED_CALLS:
                await self._process_phase2_calls(context, underlying, options_chain)
            
            # Check for phase transitions
            await self._check_phase_transitions(context, underlying)
            
        except Exception as e:
            self._logger.error(f"Error processing {underlying}: {e}")
            context.log_error(f"Error processing {underlying}: {e}")
    
    async def _process_phase1_puts(self, context, underlying: str, options_chain: OptionsChain) -> None:
        """
        Process Phase 1: Cash-Secured Puts
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            options_chain: Current options chain
        """
        try:
            wheel_state = self.wheel_states[underlying]
            
            # Check if we need to sell new puts
            if len(wheel_state.active_puts) < self.parameters['max_positions_per_underlying']:
                await self._evaluate_put_entry(context, underlying, options_chain)
            
            # Check existing puts for rolling or closing
            for put_position in wheel_state.active_puts[:]:  # Copy list to allow modification
                await self._manage_put_position(context, underlying, put_position, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error in Phase 1 processing: {e}")
            context.log_error(f"Error in Phase 1 processing: {e}")
    
    async def _process_phase2_calls(self, context, underlying: str, options_chain: OptionsChain) -> None:
        """
        Process Phase 2: Covered Calls
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            options_chain: Current options chain
        """
        try:
            wheel_state = self.wheel_states[underlying]
            
            # Only sell calls if we own stock
            if wheel_state.stock_quantity <= 0:
                context.log_warning(f"No stock position for {underlying} in covered call phase")
                return
            
            # Check if we need to sell new calls
            if len(wheel_state.active_calls) < self.parameters['max_positions_per_underlying']:
                await self._evaluate_call_entry(context, underlying, options_chain)
            
            # Check existing calls for rolling or closing
            for call_position in wheel_state.active_calls[:]:  # Copy list to allow modification
                await self._manage_call_position(context, underlying, call_position, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error in Phase 2 processing: {e}")
            context.log_error(f"Error in Phase 2 processing: {e}")
    
    async def _evaluate_put_entry(self, context, underlying: str, options_chain: OptionsChain) -> None:
        """
        Evaluate whether to enter a new cash-secured put position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            options_chain: Current options chain
        """
        try:
            # Find suitable put contract
            put_contract = self._find_optimal_put(options_chain)
            if not put_contract:
                context.log_debug(f"No suitable put found for {underlying}")
                return
            
            # Validate we have enough cash for assignment
            required_cash = put_contract.strike * 100 * self.parameters['contracts_per_position']
            portfolio = await context.get_portfolio()
            
            if portfolio.cash < required_cash * (1 + self.parameters['cash_reserve_ratio']):
                context.log_debug(f"Insufficient cash for {underlying} put assignment")
                return
            
            # Execute the put sale
            await self._execute_put_sale(context, underlying, put_contract, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error evaluating put entry: {e}")
            context.log_error(f"Error evaluating put entry: {e}")
    
    async def _evaluate_call_entry(self, context, underlying: str, options_chain: OptionsChain) -> None:
        """
        Evaluate whether to enter a new covered call position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            options_chain: Current options chain
        """
        try:
            wheel_state = self.wheel_states[underlying]
            
            # Find suitable call contract
            call_contract = self._find_optimal_call(options_chain, wheel_state.stock_average_price)
            if not call_contract:
                context.log_debug(f"No suitable call found for {underlying}")
                return
            
            # Execute the call sale
            await self._execute_call_sale(context, underlying, call_contract, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error evaluating call entry: {e}")
            context.log_error(f"Error evaluating call entry: {e}")
    
    def _find_optimal_put(self, options_chain: OptionsChain) -> Optional[OptionContract]:
        """
        Find optimal put contract based on delta and DTE criteria.
        
        Args:
            options_chain: Current options chain
            
        Returns:
            Optimal put contract or None
        """
        try:
            # Get put contracts
            puts = [c for c in options_chain.contracts 
                   if c.option_type == 'put' and c.delta is not None and c.bid is not None]
            
            if not puts:
                return None
            
            # Filter by DTE
            suitable_puts = []
            current_date = options_chain.timestamp
            
            for put in puts:
                dte = (put.expiration.date() - current_date.date()).days
                if self.parameters['put_min_dte'] <= dte <= self.parameters['put_max_dte']:
                    suitable_puts.append(put)
            
            if not suitable_puts:
                return None
            
            # Find put closest to target delta
            target_delta = -self.parameters['put_target_delta']  # Puts have negative delta
            best_put = None
            best_delta_diff = float('inf')
            
            for put in suitable_puts:
                delta_diff = abs(float(put.delta - target_delta))
                
                # Check if within tolerance and has minimum premium
                if (delta_diff <= float(self.parameters['put_delta_tolerance']) and
                    put.bid >= self.parameters['min_premium'] and
                    (put.ask - put.bid) <= self.parameters['max_bid_ask_spread']):
                    
                    if delta_diff < best_delta_diff:
                        best_delta_diff = delta_diff
                        best_put = put
            
            return best_put
            
        except Exception as e:
            self._logger.error(f"Error finding optimal put: {e}")
            return None
    
    def _find_optimal_call(self, options_chain: OptionsChain, stock_cost_basis: Decimal) -> Optional[OptionContract]:
        """
        Find optimal call contract based on delta and DTE criteria.
        
        Args:
            options_chain: Current options chain
            stock_cost_basis: Average cost basis of stock position
            
        Returns:
            Optimal call contract or None
        """
        try:
            # Get call contracts above cost basis
            calls = [c for c in options_chain.contracts 
                    if (c.option_type == 'call' and c.delta is not None and c.bid is not None and
                        c.strike >= stock_cost_basis)]  # Only calls above cost basis
            
            if not calls:
                return None
            
            # Filter by DTE
            suitable_calls = []
            current_date = options_chain.timestamp
            
            for call in calls:
                dte = (call.expiration.date() - current_date.date()).days
                if self.parameters['call_min_dte'] <= dte <= self.parameters['call_max_dte']:
                    suitable_calls.append(call)
            
            if not suitable_calls:
                return None
            
            # Find call closest to target delta
            target_delta = self.parameters['call_target_delta']  # Calls have positive delta
            best_call = None
            best_delta_diff = float('inf')
            
            for call in suitable_calls:
                delta_diff = abs(float(call.delta - target_delta))
                
                # Check if within tolerance and has minimum premium
                if (delta_diff <= float(self.parameters['call_delta_tolerance']) and
                    call.bid >= self.parameters['min_premium'] and
                    (call.ask - call.bid) <= self.parameters['max_bid_ask_spread']):
                    
                    if delta_diff < best_delta_diff:
                        best_delta_diff = delta_diff
                        best_call = call
            
            return best_call
            
        except Exception as e:
            self._logger.error(f"Error finding optimal call: {e}")
            return None
    
    async def _execute_put_sale(self, context, underlying: str, put_contract: OptionContract, options_chain: OptionsChain) -> None:
        """
        Execute cash-secured put sale.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            put_contract: Put contract to sell
            options_chain: Current options chain
        """
        try:
            # Submit sell-to-open order
            order_id = await context.submit_order({
                'symbol': put_contract.symbol,
                'underlying': underlying,
                'side': 'sell_to_open',
                'quantity': self.parameters['contracts_per_position'],
                'order_type': 'LIMIT',
                'price': put_contract.bid,
                'option_type': 'put',
                'strike': put_contract.strike,
                'expiration': put_contract.expiration,
                'metadata': {
                    'strategy_id': self.strategy_id,
                    'strategy_type': 'wheel',
                    'phase': 'cash_secured_puts',
                    'action': 'open',
                    'underlying': underlying,
                    'target_delta': float(self.parameters['put_target_delta'])
                }
            })
            
            # Create position record
            wheel_position = WheelPosition(
                underlying=underlying,
                contract=put_contract,
                entry_date=options_chain.timestamp,
                entry_price=put_contract.bid,
                quantity=self.parameters['contracts_per_position'],
                state=WheelPositionState.ACTIVE
            )
            
            # Add to wheel state
            wheel_state = self.wheel_states[underlying]
            wheel_state.active_puts.append(wheel_position)
            wheel_state.total_premium_collected += put_contract.bid * 100 * self.parameters['contracts_per_position']
            
            # Track order
            self.orders_submitted.append(order_id)
            
            context.log_info(f"Executed cash-secured put sale on {underlying}:")
            context.log_info(f"  Strike: ${put_contract.strike}")
            context.log_info(f"  Premium: ${put_contract.bid}")
            context.log_info(f"  Delta: {put_contract.delta}")
            context.log_info(f"  DTE: {(put_contract.expiration.date() - options_chain.timestamp.date()).days}")
            
        except Exception as e:
            self._logger.error(f"Error executing put sale: {e}")
            context.log_error(f"Error executing put sale: {e}")
    
    async def _execute_call_sale(self, context, underlying: str, call_contract: OptionContract, options_chain: OptionsChain) -> None:
        """
        Execute covered call sale.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            call_contract: Call contract to sell
            options_chain: Current options chain
        """
        try:
            # Submit sell-to-open order
            order_id = await context.submit_order({
                'symbol': call_contract.symbol,
                'underlying': underlying,
                'side': 'sell_to_open',
                'quantity': self.parameters['contracts_per_position'],
                'order_type': 'LIMIT',
                'price': call_contract.bid,
                'option_type': 'call',
                'strike': call_contract.strike,
                'expiration': call_contract.expiration,
                'metadata': {
                    'strategy_id': self.strategy_id,
                    'strategy_type': 'wheel',
                    'phase': 'covered_calls',
                    'action': 'open',
                    'underlying': underlying,
                    'target_delta': float(self.parameters['call_target_delta'])
                }
            })
            
            # Create position record
            wheel_position = WheelPosition(
                underlying=underlying,
                contract=call_contract,
                entry_date=options_chain.timestamp,
                entry_price=call_contract.bid,
                quantity=self.parameters['contracts_per_position'],
                state=WheelPositionState.ACTIVE
            )
            
            # Add to wheel state
            wheel_state = self.wheel_states[underlying]
            wheel_state.active_calls.append(wheel_position)
            wheel_state.total_premium_collected += call_contract.bid * 100 * self.parameters['contracts_per_position']
            
            # Track order
            self.orders_submitted.append(order_id)
            
            context.log_info(f"Executed covered call sale on {underlying}:")
            context.log_info(f"  Strike: ${call_contract.strike}")
            context.log_info(f"  Premium: ${call_contract.bid}")
            context.log_info(f"  Delta: {call_contract.delta}")
            context.log_info(f"  DTE: {(call_contract.expiration.date() - options_chain.timestamp.date()).days}")
            
        except Exception as e:
            self._logger.error(f"Error executing call sale: {e}")
            context.log_error(f"Error executing call sale: {e}")
    
    async def _update_positions(self, context, underlying: str, options_chain: OptionsChain) -> None:
        """
        Update existing positions with current market data.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            options_chain: Current options chain
        """
        try:
            wheel_state = self.wheel_states[underlying]
            
            # Update put positions
            for put_position in wheel_state.active_puts:
                self._update_position_metrics(put_position, options_chain)
            
            # Update call positions
            for call_position in wheel_state.active_calls:
                self._update_position_metrics(call_position, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error updating positions: {e}")
            context.log_error(f"Error updating positions: {e}")
    
    def _update_position_metrics(self, position: WheelPosition, options_chain: OptionsChain) -> None:
        """Update position metrics with current market data"""
        try:
            # Find current contract price
            for contract in options_chain.contracts:
                if (contract.symbol == position.contract.symbol or
                    (contract.strike == position.contract.strike and
                     contract.option_type == position.contract.option_type and
                     contract.expiration == position.contract.expiration)):
                    
                    position.current_price = contract.bid  # Use bid for short positions
                    position.unrealized_pnl = position.get_current_pnl()
                    position.days_to_expiration = position.get_days_to_expiration(options_chain.timestamp)
                    break
                    
        except Exception as e:
            self._logger.error(f"Error updating position metrics: {e}")
    
    async def _manage_put_position(self, context, underlying: str, position: WheelPosition, options_chain: OptionsChain) -> None:
        """
        Manage existing put position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            position: Put position to manage
            options_chain: Current options chain
        """
        try:
            # Check for profit target
            if position.unrealized_pnl and position.unrealized_pnl >= position.entry_price * 100 * position.quantity * self.parameters['profit_target_pct']:
                await self._close_position(context, underlying, position, "Profit target reached")
                return
            
            # Check for rolling criteria
            dte = position.get_days_to_expiration(options_chain.timestamp)
            
            # Roll if DTE threshold reached or delta too high
            current_contract = next((c for c in options_chain.contracts 
                                   if c.strike == position.contract.strike and 
                                   c.option_type == 'put' and 
                                   c.expiration == position.contract.expiration), None)
            
            should_roll = (dte <= self.parameters['put_roll_dte'] or
                          (current_contract and current_contract.delta and 
                           abs(current_contract.delta) >= self.parameters['put_roll_delta']))
            
            if should_roll:
                await self._roll_put_position(context, underlying, position, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error managing put position: {e}")
            context.log_error(f"Error managing put position: {e}")
    
    async def _manage_call_position(self, context, underlying: str, position: WheelPosition, options_chain: OptionsChain) -> None:
        """
        Manage existing call position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            position: Call position to manage
            options_chain: Current options chain
        """
        try:
            # Check for profit target
            if position.unrealized_pnl and position.unrealized_pnl >= position.entry_price * 100 * position.quantity * self.parameters['profit_target_pct']:
                await self._close_position(context, underlying, position, "Profit target reached")
                return
            
            # Check for rolling criteria
            dte = position.get_days_to_expiration(options_chain.timestamp)
            
            # Roll if DTE threshold reached or delta too high
            current_contract = next((c for c in options_chain.contracts 
                                   if c.strike == position.contract.strike and 
                                   c.option_type == 'call' and 
                                   c.expiration == position.contract.expiration), None)
            
            should_roll = (dte <= self.parameters['call_roll_dte'] or
                          (current_contract and current_contract.delta and 
                           current_contract.delta >= self.parameters['call_roll_delta']))
            
            if should_roll:
                await self._roll_call_position(context, underlying, position, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error managing call position: {e}")
            context.log_error(f"Error managing call position: {e}")
    
    async def _close_position(self, context, underlying: str, position: WheelPosition, reason: str) -> None:
        """
        Close an options position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            position: Position to close
            reason: Reason for closing
        """
        try:
            # Submit buy-to-close order
            order_id = await context.submit_order({
                'symbol': position.contract.symbol,
                'underlying': underlying,
                'side': 'buy_to_close',
                'quantity': position.quantity,
                'order_type': 'MARKET',
                'metadata': {
                    'strategy_id': self.strategy_id,
                    'strategy_type': 'wheel',
                    'action': 'close',
                    'reason': reason
                }
            })
            
            # Update position state
            position.state = WheelPositionState.CLOSED
            
            # Remove from active positions
            wheel_state = self.wheel_states[underlying]
            if position in wheel_state.active_puts:
                wheel_state.active_puts.remove(position)
            elif position in wheel_state.active_calls:
                wheel_state.active_calls.remove(position)
            
            self.orders_submitted.append(order_id)
            
            context.log_info(f"Closed {position.contract.option_type} position on {underlying}: {reason}")
            
        except Exception as e:
            self._logger.error(f"Error closing position: {e}")
            context.log_error(f"Error closing position: {e}")
    
    async def _roll_put_position(self, context, underlying: str, position: WheelPosition, options_chain: OptionsChain) -> None:
        """Roll put position to new expiration/strike"""
        try:
            # Find new put contract
            new_put = self._find_optimal_put(options_chain)
            if not new_put:
                context.log_warning(f"No suitable put found for rolling {underlying}")
                return
            
            # Close current position
            await self._close_position(context, underlying, position, "Rolling position")
            
            # Open new position
            await self._execute_put_sale(context, underlying, new_put, options_chain)
            
            context.log_info(f"Rolled put position on {underlying}")
            
        except Exception as e:
            self._logger.error(f"Error rolling put position: {e}")
            context.log_error(f"Error rolling put position: {e}")
    
    async def _roll_call_position(self, context, underlying: str, position: WheelPosition, options_chain: OptionsChain) -> None:
        """Roll call position to new expiration/strike"""
        try:
            wheel_state = self.wheel_states[underlying]
            
            # Find new call contract
            new_call = self._find_optimal_call(options_chain, wheel_state.stock_average_price)
            if not new_call:
                context.log_warning(f"No suitable call found for rolling {underlying}")
                return
            
            # Close current position
            await self._close_position(context, underlying, position, "Rolling position")
            
            # Open new position
            await self._execute_call_sale(context, underlying, new_call, options_chain)
            
            context.log_info(f"Rolled call position on {underlying}")
            
        except Exception as e:
            self._logger.error(f"Error rolling call position: {e}")
            context.log_error(f"Error rolling call position: {e}")
    
    async def _check_phase_transitions(self, context, underlying: str) -> None:
        """
        Check for phase transitions (assignment, called away, etc.)
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
        """
        try:
            wheel_state = self.wheel_states[underlying]
            
            # Simulate assignment logic (in real implementation, this would be event-driven)
            # For now, we'll use simplified logic based on position states
            
            # Check for put assignment (transition to Phase 2)
            if wheel_state.phase == WheelPhase.CASH_SECURED_PUTS:
                for put_position in wheel_state.active_puts[:]:
                    # Simulate assignment if put is deep ITM at expiration
                    if (put_position.days_to_expiration == 0 and 
                        put_position.contract.strike > await context.get_current_price(underlying)):
                        
                        await self._handle_put_assignment(context, underlying, put_position)
            
            # Check for call assignment (transition back to Phase 1)
            elif wheel_state.phase == WheelPhase.COVERED_CALLS:
                for call_position in wheel_state.active_calls[:]:
                    # Simulate assignment if call is deep ITM at expiration
                    if (call_position.days_to_expiration == 0 and 
                        call_position.contract.strike < await context.get_current_price(underlying)):
                        
                        await self._handle_call_assignment(context, underlying, call_position)
            
        except Exception as e:
            self._logger.error(f"Error checking phase transitions: {e}")
            context.log_error(f"Error checking phase transitions: {e}")
    
    async def _handle_put_assignment(self, context, underlying: str, position: WheelPosition) -> None:
        """
        Handle put assignment - acquire stock and transition to Phase 2.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            position: Assigned put position
        """
        try:
            wheel_state = self.wheel_states[underlying]
            
            # Calculate stock acquisition
            shares_acquired = position.quantity * 100
            cost_basis = position.contract.strike
            
            # Update wheel state
            wheel_state.stock_quantity += shares_acquired
            wheel_state.stock_average_price = cost_basis  # Simplified - should be weighted average
            wheel_state.phase = WheelPhase.COVERED_CALLS
            wheel_state.total_assignments += 1
            
            # Update position state
            position.state = WheelPositionState.ASSIGNED
            wheel_state.active_puts.remove(position)
            
            context.log_info(f"Put assigned on {underlying}:")
            context.log_info(f"  Acquired {shares_acquired} shares @ ${cost_basis}")
            context.log_info(f"  Transitioning to Phase 2: Covered Calls")
            
        except Exception as e:
            self._logger.error(f"Error handling put assignment: {e}")
            context.log_error(f"Error handling put assignment: {e}")
    
    async def _handle_call_assignment(self, context, underlying: str, position: WheelPosition) -> None:
        """
        Handle call assignment - sell stock and transition back to Phase 1.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            position: Assigned call position
        """
        try:
            wheel_state = self.wheel_states[underlying]
            
            # Calculate stock sale
            shares_sold = position.quantity * 100
            sale_price = position.contract.strike
            
            # Update wheel state
            wheel_state.stock_quantity -= shares_sold
            if wheel_state.stock_quantity <= 0:
                wheel_state.phase = WheelPhase.CASH_SECURED_PUTS  # Back to Phase 1
                wheel_state.stock_average_price = Decimal('0')
            
            wheel_state.total_called_away += 1
            
            # Update position state
            position.state = WheelPositionState.CALLED_AWAY
            wheel_state.active_calls.remove(position)
            
            context.log_info(f"Call assigned on {underlying}:")
            context.log_info(f"  Sold {shares_sold} shares @ ${sale_price}")
            context.log_info(f"  Transitioning to Phase 1: Cash-Secured Puts")
            
        except Exception as e:
            self._logger.error(f"Error handling call assignment: {e}")
            context.log_error(f"Error handling call assignment: {e}")
    
    def _validate_parameters(self) -> bool:
        """Validate strategy parameters"""
        try:
            # Validate underlyings
            if not self.parameters['underlyings']:
                self._logger.error("No underlyings specified")
                return False
            
            # Validate delta parameters
            if not (0 < self.parameters['put_target_delta'] < 1):
                self._logger.error("put_target_delta must be between 0 and 1")
                return False
            
            if not (0 < self.parameters['call_target_delta'] < 1):
                self._logger.error("call_target_delta must be between 0 and 1")
                return False
            
            # Validate DTE parameters
            if self.parameters['put_min_dte'] >= self.parameters['put_max_dte']:
                self._logger.error("put_min_dte must be less than put_max_dte")
                return False
            
            if self.parameters['call_min_dte'] >= self.parameters['call_max_dte']:
                self._logger.error("call_min_dte must be less than call_max_dte")
                return False
            
            return True
            
        except Exception as e:
            self._logger.error(f"Parameter validation failed: {e}")
            return False
    
    async def cleanup(self, context) -> None:
        """
        Cleanup strategy resources and finalize execution.
        
        Args:
            context: Strategy execution context
        """
        try:
            context.log_info(f"Cleaning up {self.name}")
            
            # Close all active positions
            for underlying, wheel_state in self.wheel_states.items():
                # Close puts
                for put_position in wheel_state.active_puts[:]:
                    await self._close_position(context, underlying, put_position, "Strategy cleanup")
                
                # Close calls
                for call_position in wheel_state.active_calls[:]:
                    await self._close_position(context, underlying, call_position, "Strategy cleanup")
            
            # Log final statistics
            total_orders = len(self.orders_submitted)
            total_premium = sum(state.total_premium_collected for state in self.wheel_states.values())
            total_assignments = sum(state.total_assignments for state in self.wheel_states.values())
            
            context.log_info(f"Strategy execution summary:")
            context.log_info(f"  Total orders submitted: {total_orders}")
            context.log_info(f"  Total premium collected: ${total_premium}")
            context.log_info(f"  Total assignments: {total_assignments}")
            
            for underlying, state in self.wheel_states.items():
                context.log_info(f"  {underlying}: Phase {state.phase.value}, Stock: {state.stock_quantity} shares")
            
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
            'strategy_type': 'options',
            'category': 'premium_collection',
            'market_outlook': 'neutral_to_bullish',
            'complexity': 'intermediate',
            'phases': ['cash_secured_puts', 'covered_calls'],
            'parameters_schema': {
                'underlyings': {'type': 'array', 'default': ['AAPL']},
                'put_target_delta': {'type': 'number', 'default': 0.20, 'min': 0.10, 'max': 0.40},
                'call_target_delta': {'type': 'number', 'default': 0.25, 'min': 0.15, 'max': 0.40},
                'put_target_dte': {'type': 'integer', 'default': 30, 'min': 14, 'max': 60},
                'call_target_dte': {'type': 'integer', 'default': 30, 'min': 14, 'max': 60},
                'profit_target_pct': {'type': 'number', 'default': 0.50, 'min': 0.25, 'max': 1.00},
                'contracts_per_position': {'type': 'integer', 'default': 1, 'min': 1, 'max': 10}
            },
            'risk_characteristics': {
                'profit_potential': 'limited',
                'loss_potential': 'substantial',
                'time_decay': 'positive',
                'volatility_exposure': 'short',
                'assignment_risk': 'high'
            },
            'market_conditions': {
                'optimal': 'neutral_to_bullish_with_high_iv',
                'acceptable': 'sideways_markets',
                'avoid': 'strong_bearish_trends'
            },
            'execution_stats': {
                'active_wheel_states': len(self.wheel_states),
                'total_orders_submitted': len(self.orders_submitted),
                'total_premium_collected': sum(state.total_premium_collected for state in self.wheel_states.values()),
                'total_assignments': sum(state.total_assignments for state in self.wheel_states.values())
            },
            'tags': ['options', 'wheel', 'premium_collection', 'cash_secured_puts', 'covered_calls', 'intermediate'],
            'author': 'TradingEngine',
            'created_at': datetime.now().isoformat()
        }

    def get_current_wheel_status(self) -> Dict[str, Any]:
        """
        Get current status of all wheel positions.

        Returns:
            Dictionary with current wheel status
        """
        status = {}

        for underlying, wheel_state in self.wheel_states.items():
            status[underlying] = {
                'phase': wheel_state.phase.value,
                'stock_quantity': float(wheel_state.stock_quantity),
                'stock_average_price': float(wheel_state.stock_average_price),
                'active_puts': len(wheel_state.active_puts),
                'active_calls': len(wheel_state.active_calls),
                'total_premium_collected': float(wheel_state.total_premium_collected),
                'total_assignments': wheel_state.total_assignments,
                'total_called_away': wheel_state.total_called_away
            }

        return status
