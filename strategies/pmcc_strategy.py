"""
Poor Man's Covered Call (PMCC) Strategy - Options Trading Backtest Engine

A capital-efficient alternative to traditional covered calls using diagonal spreads:
- Buy deep-in-the-money, long-dated call option (LEAPS)
- Sell out-of-the-money, short-dated call options against the long call
- Generate income while maintaining upside exposure with less capital

This strategy mimics covered call payoff with significantly less capital requirement.

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


class PMCCState(Enum):
    """PMCC position states"""
    SEARCHING = "searching"      # Looking for LEAPS entry
    LEAPS_ONLY = "leaps_only"   # Long call established, no short call
    ACTIVE = "active"           # Both legs active
    ROLLING = "rolling"         # Rolling short call
    CLOSING = "closing"         # Closing position
    CLOSED = "closed"           # Position closed


@dataclass
class PMCCLeg:
    """Individual leg of the PMCC"""
    contract: OptionContract
    side: str  # 'buy' or 'sell'
    quantity: int
    entry_price: Decimal
    entry_date: datetime
    
    # Current tracking
    current_price: Optional[Decimal] = None
    unrealized_pnl: Optional[Decimal] = None
    days_to_expiration: Optional[int] = None
    
    def get_current_pnl(self) -> Decimal:
        """Calculate current P&L for this leg"""
        if self.current_price is None:
            return Decimal('0')
        
        if self.side == 'buy':
            # Long position: profit when price increases
            pnl_per_contract = (self.current_price - self.entry_price) * 100
        else:
            # Short position: profit when price decreases
            pnl_per_contract = (self.entry_price - self.current_price) * 100
        
        return pnl_per_contract * self.quantity
    
    def get_days_to_expiration(self, current_date: datetime) -> int:
        """Get days to expiration"""
        return (self.contract.expiration.date() - current_date.date()).days


@dataclass
class PMCCPosition:
    """Complete PMCC diagonal spread position"""
    underlying: str
    entry_date: datetime
    state: PMCCState
    
    # The two legs
    long_call: PMCCLeg      # Deep ITM, long-dated (LEAPS)
    short_call: Optional[PMCCLeg] = None  # OTM, short-dated
    
    # Position metrics
    net_debit_paid: Decimal = Decimal('0')
    total_credits_collected: Decimal = Decimal('0')
    max_profit_potential: Optional[Decimal] = None
    breakeven_price: Optional[Decimal] = None
    
    # Management parameters
    short_call_profit_target: Decimal = Decimal('0.50')  # Close short at 50% profit
    short_call_roll_dte: int = 7                         # Roll short call at 7 DTE
    short_call_roll_delta: Decimal = Decimal('0.30')     # Roll if delta > 0.30
    position_profit_target: Decimal = Decimal('0.25')    # Close entire position at 25% profit
    
    def get_total_pnl(self) -> Decimal:
        """Calculate total position P&L"""
        total_pnl = self.long_call.get_current_pnl()
        if self.short_call:
            total_pnl += self.short_call.get_current_pnl()
        return total_pnl
    
    def get_net_position_cost(self) -> Decimal:
        """Get net cost of position"""
        return self.net_debit_paid - self.total_credits_collected


class PMCCStrategy:
    """
    Poor Man's Covered Call (PMCC) Strategy
    
    A sophisticated diagonal spread strategy that provides covered call-like exposure
    with significantly less capital requirement.
    
    Strategy Components:
    1. Long Call (LEAPS): Deep ITM call with 60+ DTE, high delta (0.70-0.90)
    2. Short Call: OTM call with 30-45 DTE, low delta (0.15-0.30)
    
    Entry Criteria:
    - Long call: Deep ITM (0.70-0.90 delta), 60+ DTE
    - Short call: OTM (0.15-0.30 delta), 30-45 DTE
    - Strike spread should allow for profit potential
    - Adequate liquidity in both options
    
    Management:
    - Roll short call at 7 DTE or when delta > 0.30
    - Close short call at 50% profit when possible
    - Close entire position at 25% profit or if LEAPS loses value
    - Maintain positive time spread (long DTE > short DTE)
    """
    
    def __init__(self, strategy_id: str = "pmcc_strategy"):
        """Initialize the PMCC Strategy"""
        self.strategy_id = strategy_id
        self.name = "Poor Man's Covered Call Strategy"
        self.version = "1.0.0"
        self.description = "Capital-efficient diagonal spread mimicking covered call payoff"
        
        # Strategy state
        self.is_initialized = False
        self.positions: Dict[str, PMCCPosition] = {}  # underlying -> position
        self.orders_submitted = []
        self.performance_metrics = {}
        
        # Strategy parameters
        self.parameters = {
            # General parameters
            'underlyings': ['AAPL'],              # Stocks to trade
            'max_positions': 3,                   # Maximum concurrent positions
            'position_size': 1,                   # Number of spreads per position
            
            # Long call (LEAPS) parameters
            'long_call_min_dte': 60,              # Minimum DTE for long call
            'long_call_target_dte': 90,           # Target DTE for long call
            'long_call_max_dte': 365,             # Maximum DTE for long call
            'long_call_min_delta': Decimal('0.70'), # Minimum delta for long call
            'long_call_max_delta': Decimal('0.90'), # Maximum delta for long call
            'long_call_target_delta': Decimal('0.80'), # Target delta for long call
            
            # Short call parameters
            'short_call_min_dte': 21,             # Minimum DTE for short call
            'short_call_target_dte': 35,          # Target DTE for short call
            'short_call_max_dte': 45,             # Maximum DTE for short call
            'short_call_min_delta': Decimal('0.15'), # Minimum delta for short call
            'short_call_max_delta': Decimal('0.30'), # Maximum delta for short call
            'short_call_target_delta': Decimal('0.20'), # Target delta for short call
            
            # Management parameters
            'short_call_profit_target': Decimal('0.50'), # Close short at 50% profit
            'short_call_roll_dte': 7,             # Roll short call at 7 DTE
            'short_call_roll_delta': Decimal('0.30'), # Roll if delta > 0.30
            'position_profit_target': Decimal('0.25'), # Close position at 25% profit
            'position_loss_limit': Decimal('0.50'), # Close position at 50% loss
            
            # Risk parameters
            'max_position_cost': Decimal('5000'),  # Maximum cost per position
            'min_credit_ratio': Decimal('0.10'),   # Min short call credit / long call cost
            'max_bid_ask_spread': Decimal('0.20'), # Maximum bid-ask spread
            'min_strike_spread': Decimal('5.00'),  # Minimum spread between strikes
        }
        
        self._logger = logging.getLogger(f"strategy.{strategy_id}")
    
    async def initialize(self, context) -> bool:
        """
        Initialize the PMCC strategy.
        
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
            
            # Initialize position tracking
            self.positions = {}
            self.orders_submitted = []
            
            # Log strategy configuration
            self._logger.info(f"Strategy parameters: {self.parameters}")
            self._logger.info(f"Long call target delta: {self.parameters['long_call_target_delta']}")
            self._logger.info(f"Short call target delta: {self.parameters['short_call_target_delta']}")
            self._logger.info(f"Max positions: {self.parameters['max_positions']}")
            
            self.is_initialized = True
            context.log_info(f"{self.name} initialized successfully")
            return True
            
        except Exception as e:
            self._logger.error(f"Strategy initialization failed: {e}")
            context.log_error(f"Strategy initialization failed: {e}")
            return False
    
    async def on_market_data(self, context, event) -> None:
        """
        Process market data event and execute PMCC logic.
        
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
            # Get current options chain
            options_chain = await context.get_options_chain(underlying)
            if not options_chain:
                context.log_debug(f"No options chain available for {underlying}")
                return
            
            # Check existing position
            if underlying in self.positions:
                await self._manage_existing_position(context, underlying, options_chain)
            else:
                # Look for new PMCC entry opportunity
                if len(self.positions) < self.parameters['max_positions']:
                    await self._evaluate_pmcc_entry(context, underlying, options_chain)
                
        except Exception as e:
            self._logger.error(f"Error processing {underlying}: {e}")
            context.log_error(f"Error processing {underlying}: {e}")
    
    async def _evaluate_pmcc_entry(self, context, underlying: str, options_chain: OptionsChain) -> None:
        """
        Evaluate whether to enter a new PMCC position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            options_chain: Current options chain
        """
        try:
            # Find suitable long call (LEAPS)
            long_call = self._find_optimal_long_call(options_chain)
            if not long_call:
                context.log_debug(f"No suitable long call found for {underlying}")
                return
            
            # Calculate position cost and validate
            long_call_cost = long_call.ask * 100 * self.parameters['position_size']
            if long_call_cost > self.parameters['max_position_cost']:
                context.log_debug(f"Long call cost too high for {underlying}: ${long_call_cost}")
                return
            
            # Check portfolio cash
            portfolio = await context.get_portfolio()
            if portfolio.cash < long_call_cost * Decimal('1.2'):  # 20% buffer
                context.log_debug(f"Insufficient cash for {underlying} PMCC")
                return
            
            # Execute the PMCC entry
            await self._execute_pmcc_entry(context, underlying, long_call, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error evaluating PMCC entry: {e}")
            context.log_error(f"Error evaluating PMCC entry: {e}")
    
    def _find_optimal_long_call(self, options_chain: OptionsChain) -> Optional[OptionContract]:
        """
        Find optimal long call (LEAPS) based on delta and DTE criteria.
        
        Args:
            options_chain: Current options chain
            
        Returns:
            Optimal long call contract or None
        """
        try:
            # Get call contracts
            calls = [c for c in options_chain.contracts 
                    if c.option_type == 'call' and c.delta is not None and c.ask is not None]
            
            if not calls:
                return None
            
            # Filter by DTE
            suitable_calls = []
            current_date = options_chain.timestamp
            
            for call in calls:
                dte = (call.expiration.date() - current_date.date()).days
                if self.parameters['long_call_min_dte'] <= dte <= self.parameters['long_call_max_dte']:
                    suitable_calls.append(call)
            
            if not suitable_calls:
                return None
            
            # Filter by delta range
            delta_filtered_calls = []
            for call in suitable_calls:
                if (self.parameters['long_call_min_delta'] <= call.delta <= 
                    self.parameters['long_call_max_delta']):
                    delta_filtered_calls.append(call)
            
            if not delta_filtered_calls:
                return None
            
            # Find call closest to target delta
            target_delta = self.parameters['long_call_target_delta']
            best_call = None
            best_delta_diff = float('inf')
            
            for call in delta_filtered_calls:
                delta_diff = abs(float(call.delta - target_delta))
                
                # Check liquidity requirements
                if ((call.ask - call.bid) <= self.parameters['max_bid_ask_spread'] and
                    call.volume > 0):
                    
                    if delta_diff < best_delta_diff:
                        best_delta_diff = delta_diff
                        best_call = call
            
            return best_call
            
        except Exception as e:
            self._logger.error(f"Error finding optimal long call: {e}")
            return None
    
    def _find_optimal_short_call(self, options_chain: OptionsChain, long_call_strike: Decimal) -> Optional[OptionContract]:
        """
        Find optimal short call based on delta and DTE criteria.
        
        Args:
            options_chain: Current options chain
            long_call_strike: Strike price of the long call
            
        Returns:
            Optimal short call contract or None
        """
        try:
            # Get call contracts above long call strike
            calls = [c for c in options_chain.contracts 
                    if (c.option_type == 'call' and c.delta is not None and c.bid is not None and
                        c.strike > long_call_strike and
                        c.strike >= long_call_strike + self.parameters['min_strike_spread'])]
            
            if not calls:
                return None
            
            # Filter by DTE
            suitable_calls = []
            current_date = options_chain.timestamp
            
            for call in calls:
                dte = (call.expiration.date() - current_date.date()).days
                if self.parameters['short_call_min_dte'] <= dte <= self.parameters['short_call_max_dte']:
                    suitable_calls.append(call)
            
            if not suitable_calls:
                return None
            
            # Filter by delta range
            delta_filtered_calls = []
            for call in suitable_calls:
                if (self.parameters['short_call_min_delta'] <= call.delta <= 
                    self.parameters['short_call_max_delta']):
                    delta_filtered_calls.append(call)
            
            if not delta_filtered_calls:
                return None
            
            # Find call closest to target delta with best premium
            target_delta = self.parameters['short_call_target_delta']
            best_call = None
            best_score = 0
            
            for call in delta_filtered_calls:
                delta_diff = abs(float(call.delta - target_delta))
                
                # Check liquidity requirements
                if ((call.ask - call.bid) <= self.parameters['max_bid_ask_spread'] and
                    call.volume > 0):
                    
                    # Score based on delta proximity and premium
                    delta_score = 1.0 / (1.0 + delta_diff)
                    premium_score = float(call.bid) / 10.0  # Normalize premium
                    total_score = delta_score + premium_score
                    
                    if total_score > best_score:
                        best_score = total_score
                        best_call = call
            
            return best_call
            
        except Exception as e:
            self._logger.error(f"Error finding optimal short call: {e}")
            return None
    
    async def _execute_pmcc_entry(self, context, underlying: str, long_call: OptionContract, options_chain: OptionsChain) -> None:
        """
        Execute PMCC entry by buying long call and selling short call.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            long_call: Long call contract to buy
            options_chain: Current options chain
        """
        try:
            context.log_info(f"Executing PMCC entry on {underlying}")
            
            # Step 1: Buy the long call (LEAPS)
            long_order_id = await context.submit_order({
                'symbol': long_call.symbol,
                'underlying': underlying,
                'side': 'buy_to_open',
                'quantity': self.parameters['position_size'],
                'order_type': 'LIMIT',
                'price': long_call.ask,
                'option_type': 'call',
                'strike': long_call.strike,
                'expiration': long_call.expiration,
                'metadata': {
                    'strategy_id': self.strategy_id,
                    'strategy_type': 'pmcc',
                    'leg_type': 'long_call',
                    'action': 'open',
                    'underlying': underlying
                }
            })
            
            # Create long leg
            long_leg = PMCCLeg(
                contract=long_call,
                side='buy',
                quantity=self.parameters['position_size'],
                entry_price=long_call.ask,
                entry_date=options_chain.timestamp
            )
            
            # Calculate net debit
            net_debit = long_call.ask * 100 * self.parameters['position_size']
            
            # Create position record (initially with just long call)
            position = PMCCPosition(
                underlying=underlying,
                entry_date=options_chain.timestamp,
                state=PMCCState.LEAPS_ONLY,
                long_call=long_leg,
                net_debit_paid=net_debit
            )
            
            # Step 2: Try to sell short call immediately
            short_call = self._find_optimal_short_call(options_chain, long_call.strike)
            if short_call:
                await self._add_short_call(context, underlying, position, short_call, options_chain)
            
            # Store position
            self.positions[underlying] = position
            self.orders_submitted.append(long_order_id)
            
            context.log_info(f"PMCC entry executed on {underlying}:")
            context.log_info(f"  Long Call: ${long_call.strike} @ ${long_call.ask} (Δ={long_call.delta})")
            context.log_info(f"  DTE: {(long_call.expiration.date() - options_chain.timestamp.date()).days}")
            context.log_info(f"  Net Debit: ${net_debit}")
            
            if short_call:
                context.log_info(f"  Short Call: ${short_call.strike} @ ${short_call.bid} (Δ={short_call.delta})")
            
        except Exception as e:
            self._logger.error(f"Error executing PMCC entry: {e}")
            context.log_error(f"Error executing PMCC entry: {e}")
    
    async def _add_short_call(self, context, underlying: str, position: PMCCPosition, short_call: OptionContract, options_chain: OptionsChain) -> None:
        """
        Add short call leg to existing PMCC position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            position: Existing PMCC position
            short_call: Short call contract to sell
            options_chain: Current options chain
        """
        try:
            # Submit sell-to-open order
            short_order_id = await context.submit_order({
                'symbol': short_call.symbol,
                'underlying': underlying,
                'side': 'sell_to_open',
                'quantity': self.parameters['position_size'],
                'order_type': 'LIMIT',
                'price': short_call.bid,
                'option_type': 'call',
                'strike': short_call.strike,
                'expiration': short_call.expiration,
                'metadata': {
                    'strategy_id': self.strategy_id,
                    'strategy_type': 'pmcc',
                    'leg_type': 'short_call',
                    'action': 'open',
                    'underlying': underlying
                }
            })
            
            # Create short leg
            short_leg = PMCCLeg(
                contract=short_call,
                side='sell',
                quantity=self.parameters['position_size'],
                entry_price=short_call.bid,
                entry_date=options_chain.timestamp
            )
            
            # Update position
            position.short_call = short_leg
            position.state = PMCCState.ACTIVE
            position.total_credits_collected += short_call.bid * 100 * self.parameters['position_size']
            
            # Calculate position metrics
            position.max_profit_potential = (short_call.strike - position.long_call.contract.strike) * 100 * self.parameters['position_size'] + position.total_credits_collected - position.net_debit_paid
            position.breakeven_price = position.long_call.contract.strike + (position.net_debit_paid - position.total_credits_collected) / (100 * self.parameters['position_size'])
            
            self.orders_submitted.append(short_order_id)
            
            context.log_info(f"Added short call to {underlying} PMCC:")
            context.log_info(f"  Short Call: ${short_call.strike} @ ${short_call.bid}")
            context.log_info(f"  Credit Collected: ${short_call.bid * 100 * self.parameters['position_size']}")
            context.log_info(f"  Max Profit Potential: ${position.max_profit_potential}")
            context.log_info(f"  Breakeven: ${position.breakeven_price}")
            
        except Exception as e:
            self._logger.error(f"Error adding short call: {e}")
            context.log_error(f"Error adding short call: {e}")
    
    async def _manage_existing_position(self, context, underlying: str, options_chain: OptionsChain) -> None:
        """
        Manage existing PMCC position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            options_chain: Current options chain
        """
        try:
            position = self.positions[underlying]
            
            # Update position prices and P&L
            self._update_position_pnl(position, options_chain)
            
            # Check overall position management
            total_pnl = position.get_total_pnl()
            net_cost = position.get_net_position_cost()
            
            # Check profit target for entire position
            if net_cost > 0 and total_pnl >= net_cost * position.position_profit_target:
                await self._close_entire_position(context, underlying, "Position profit target reached")
                return
            
            # Check loss limit for entire position
            if total_pnl <= -net_cost * self.parameters['position_loss_limit']:
                await self._close_entire_position(context, underlying, "Position loss limit reached")
                return
            
            # Manage short call if present
            if position.short_call and position.state == PMCCState.ACTIVE:
                await self._manage_short_call(context, underlying, position, options_chain)
            
            # If no short call, try to add one
            elif position.state == PMCCState.LEAPS_ONLY:
                short_call = self._find_optimal_short_call(options_chain, position.long_call.contract.strike)
                if short_call:
                    await self._add_short_call(context, underlying, position, short_call, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error managing PMCC position: {e}")
            context.log_error(f"Error managing PMCC position: {e}")
    
    async def _manage_short_call(self, context, underlying: str, position: PMCCPosition, options_chain: OptionsChain) -> None:
        """
        Manage the short call leg of PMCC position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            position: PMCC position
            options_chain: Current options chain
        """
        try:
            short_call = position.short_call
            if not short_call:
                return
            
            # Check profit target for short call
            short_pnl = short_call.get_current_pnl()
            short_cost = short_call.entry_price * 100 * short_call.quantity
            
            if short_pnl >= short_cost * short_call.profit_target:
                await self._close_short_call(context, underlying, position, "Short call profit target reached")
                return
            
            # Check rolling criteria
            dte = short_call.get_days_to_expiration(options_chain.timestamp)
            
            # Get current contract data
            current_contract = next((c for c in options_chain.contracts 
                                   if c.strike == short_call.contract.strike and 
                                   c.option_type == 'call' and 
                                   c.expiration == short_call.contract.expiration), None)
            
            should_roll = (dte <= position.short_call_roll_dte or
                          (current_contract and current_contract.delta and 
                           current_contract.delta >= position.short_call_roll_delta))
            
            if should_roll:
                await self._roll_short_call(context, underlying, position, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error managing short call: {e}")
            context.log_error(f"Error managing short call: {e}")
    
    async def _close_short_call(self, context, underlying: str, position: PMCCPosition, reason: str) -> None:
        """
        Close the short call leg.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            position: PMCC position
            reason: Reason for closing
        """
        try:
            if not position.short_call:
                return
            
            # Submit buy-to-close order
            order_id = await context.submit_order({
                'symbol': position.short_call.contract.symbol,
                'underlying': underlying,
                'side': 'buy_to_close',
                'quantity': position.short_call.quantity,
                'order_type': 'MARKET',
                'metadata': {
                    'strategy_id': self.strategy_id,
                    'strategy_type': 'pmcc',
                    'action': 'close_short',
                    'reason': reason
                }
            })
            
            # Update position state
            position.short_call = None
            position.state = PMCCState.LEAPS_ONLY
            
            self.orders_submitted.append(order_id)
            
            context.log_info(f"Closed short call on {underlying}: {reason}")
            
        except Exception as e:
            self._logger.error(f"Error closing short call: {e}")
            context.log_error(f"Error closing short call: {e}")
    
    async def _roll_short_call(self, context, underlying: str, position: PMCCPosition, options_chain: OptionsChain) -> None:
        """
        Roll short call to new expiration/strike.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            position: PMCC position
            options_chain: Current options chain
        """
        try:
            # Find new short call
            new_short_call = self._find_optimal_short_call(options_chain, position.long_call.contract.strike)
            if not new_short_call:
                context.log_warning(f"No suitable short call found for rolling {underlying}")
                return
            
            # Close current short call
            await self._close_short_call(context, underlying, position, "Rolling short call")
            
            # Add new short call
            await self._add_short_call(context, underlying, position, new_short_call, options_chain)
            
            context.log_info(f"Rolled short call on {underlying}")
            
        except Exception as e:
            self._logger.error(f"Error rolling short call: {e}")
            context.log_error(f"Error rolling short call: {e}")
    
    async def _close_entire_position(self, context, underlying: str, reason: str) -> None:
        """
        Close entire PMCC position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            reason: Reason for closing
        """
        try:
            position = self.positions[underlying]
            
            context.log_info(f"Closing entire PMCC position on {underlying}: {reason}")
            
            # Close short call if present
            if position.short_call:
                await self._close_short_call(context, underlying, position, "Closing entire position")
            
            # Close long call
            order_id = await context.submit_order({
                'symbol': position.long_call.contract.symbol,
                'underlying': underlying,
                'side': 'sell_to_close',
                'quantity': position.long_call.quantity,
                'order_type': 'MARKET',
                'metadata': {
                    'strategy_id': self.strategy_id,
                    'strategy_type': 'pmcc',
                    'action': 'close_entire',
                    'reason': reason
                }
            })
            
            # Update position state
            position.state = PMCCState.CLOSED
            
            # Remove from active positions
            del self.positions[underlying]
            
            self.orders_submitted.append(order_id)
            
            context.log_info(f"PMCC position closed for {underlying}")
            
        except Exception as e:
            self._logger.error(f"Error closing entire position: {e}")
            context.log_error(f"Error closing entire position: {e}")
    
    def _update_position_pnl(self, position: PMCCPosition, options_chain: OptionsChain) -> None:
        """Update position P&L with current market data"""
        try:
            # Update long call
            self._update_leg_pnl(position.long_call, options_chain)
            
            # Update short call if present
            if position.short_call:
                self._update_leg_pnl(position.short_call, options_chain)
                
        except Exception as e:
            self._logger.error(f"Error updating position P&L: {e}")
    
    def _update_leg_pnl(self, leg: PMCCLeg, options_chain: OptionsChain) -> None:
        """Update individual leg P&L"""
        try:
            # Find current contract price
            for contract in options_chain.contracts:
                if (contract.symbol == leg.contract.symbol or
                    (contract.strike == leg.contract.strike and
                     contract.option_type == leg.contract.option_type and
                     contract.expiration == leg.contract.expiration)):
                    
                    # Use appropriate price based on position side
                    if leg.side == 'buy':
                        leg.current_price = contract.bid  # What we could sell for
                    else:
                        leg.current_price = contract.ask  # What we'd pay to close
                    
                    leg.unrealized_pnl = leg.get_current_pnl()
                    leg.days_to_expiration = leg.get_days_to_expiration(options_chain.timestamp)
                    break
                    
        except Exception as e:
            self._logger.error(f"Error updating leg P&L: {e}")
    
    def _validate_parameters(self) -> bool:
        """Validate strategy parameters"""
        try:
            # Validate underlyings
            if not self.parameters['underlyings']:
                self._logger.error("No underlyings specified")
                return False
            
            # Validate delta parameters
            if not (0 < self.parameters['long_call_target_delta'] < 1):
                self._logger.error("long_call_target_delta must be between 0 and 1")
                return False
            
            if not (0 < self.parameters['short_call_target_delta'] < 1):
                self._logger.error("short_call_target_delta must be between 0 and 1")
                return False
            
            # Validate DTE parameters
            if self.parameters['long_call_min_dte'] >= self.parameters['long_call_max_dte']:
                self._logger.error("long_call_min_dte must be less than long_call_max_dte")
                return False
            
            if self.parameters['short_call_min_dte'] >= self.parameters['short_call_max_dte']:
                self._logger.error("short_call_min_dte must be less than short_call_max_dte")
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
            for underlying in list(self.positions.keys()):
                await self._close_entire_position(context, underlying, "Strategy cleanup")
            
            # Log final statistics
            total_orders = len(self.orders_submitted)
            context.log_info(f"Strategy execution summary:")
            context.log_info(f"  Total orders submitted: {total_orders}")
            context.log_info(f"  Positions managed: {len(self.positions)}")
            
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
            'category': 'diagonal_spread',
            'market_outlook': 'neutral_to_bullish',
            'complexity': 'advanced',
            'capital_efficiency': 'high',
            'parameters_schema': {
                'underlyings': {'type': 'array', 'default': ['AAPL']},
                'long_call_target_delta': {'type': 'number', 'default': 0.80, 'min': 0.70, 'max': 0.90},
                'short_call_target_delta': {'type': 'number', 'default': 0.20, 'min': 0.15, 'max': 0.30},
                'long_call_target_dte': {'type': 'integer', 'default': 90, 'min': 60, 'max': 365},
                'short_call_target_dte': {'type': 'integer', 'default': 35, 'min': 21, 'max': 45},
                'position_profit_target': {'type': 'number', 'default': 0.25, 'min': 0.15, 'max': 0.50},
                'max_positions': {'type': 'integer', 'default': 3, 'min': 1, 'max': 10}
            },
            'risk_characteristics': {
                'profit_potential': 'limited',
                'loss_potential': 'substantial',
                'capital_requirement': 'moderate',
                'time_decay': 'mixed',
                'volatility_exposure': 'mixed',
                'assignment_risk': 'moderate'
            },
            'market_conditions': {
                'optimal': 'neutral_to_moderately_bullish',
                'acceptable': 'low_to_moderate_volatility',
                'avoid': 'high_volatility_or_strong_bearish'
            },
            'execution_stats': {
                'active_positions': len(self.positions),
                'total_orders_submitted': len(self.orders_submitted)
            },
            'tags': ['options', 'pmcc', 'diagonal_spread', 'capital_efficient', 'covered_call_alternative', 'advanced'],
            'author': 'TradingEngine',
            'created_at': datetime.now().isoformat()
        }
