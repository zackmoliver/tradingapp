"""
Bull Put Spread Strategy - Options Trading Backtest Engine

A defined-risk, credit-based strategy for bullish or neutral-bullish market conditions.
The Bull Put Spread involves selling a higher-strike put and buying a lower-strike put
to collect premium while defining maximum risk.

Strategy Structure:
- Sell Put (higher strike) - Collect premium
- Buy Put (lower strike) - Define maximum risk

This creates a credit spread that profits from upward or sideways price movement.

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


class BullPutSpreadState(Enum):
    """Bull Put Spread position states"""
    SEARCHING = "searching"      # Looking for entry opportunity
    ACTIVE = "active"           # Spread is open
    MANAGING = "managing"       # Actively managing position
    CLOSING = "closing"         # Closing position
    CLOSED = "closed"           # Position closed
    ASSIGNED = "assigned"       # Short put was assigned


@dataclass
class BullPutSpreadLeg:
    """Individual leg of the Bull Put Spread"""
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
        
        if self.side == 'sell':
            # Short position: profit when price decreases
            pnl_per_contract = (self.entry_price - self.current_price) * 100
        else:
            # Long position: profit when price increases
            pnl_per_contract = (self.current_price - self.entry_price) * 100
        
        return pnl_per_contract * self.quantity
    
    def get_days_to_expiration(self, current_date: datetime) -> int:
        """Get days to expiration"""
        return (self.contract.expiration.date() - current_date.date()).days


@dataclass
class BullPutSpreadPosition:
    """Complete Bull Put Spread position"""
    underlying: str
    entry_date: datetime
    expiration: datetime
    state: BullPutSpreadState
    
    # The two legs
    short_put: BullPutSpreadLeg    # Higher strike (sell)
    long_put: BullPutSpreadLeg     # Lower strike (buy)
    
    # Position metrics
    net_credit_received: Decimal
    max_profit: Decimal
    max_loss: Decimal
    breakeven_price: Decimal
    spread_width: Decimal
    
    # Management parameters
    profit_target_pct: Decimal = Decimal('0.50')  # Close at 50% max profit
    loss_limit_pct: Decimal = Decimal('2.00')     # Close at 200% max loss
    dte_close_threshold: int = 7                  # Close when DTE <= 7
    delta_roll_threshold: Decimal = Decimal('0.30') # Roll if short delta > 0.30
    
    def get_total_pnl(self) -> Decimal:
        """Calculate total position P&L"""
        return self.short_put.get_current_pnl() + self.long_put.get_current_pnl()
    
    def get_days_to_expiration(self, current_date: datetime) -> int:
        """Get days to expiration"""
        return (self.expiration.date() - current_date.date()).days
    
    def get_profit_loss_ratio(self) -> Decimal:
        """Get profit/loss ratio for risk assessment"""
        if self.max_loss > 0:
            return self.max_profit / self.max_loss
        return Decimal('0')


class BullPutSpreadStrategy:
    """
    Bull Put Spread Strategy
    
    A credit spread strategy that profits from bullish or neutral price movement.
    The strategy has defined risk and limited profit potential.
    
    Entry Criteria:
    - Bullish or neutral market outlook
    - High implied volatility environment (collect more premium)
    - Target short put delta around 0.30 (out-of-the-money)
    - Defined spread width (typically $5-$10)
    - Adequate liquidity in both options
    
    Position Structure:
    - Sell Put (higher strike): Collect premium, creates obligation
    - Buy Put (lower strike): Define maximum risk, limit assignment risk
    
    Management:
    - Close at 50% of maximum profit when possible
    - Close at 200% of maximum loss (or spread width - credit)
    - Close when DTE <= 7 days to avoid gamma risk
    - Roll if short put delta exceeds 0.30 (tested)
    
    Risk Characteristics:
    - Max Profit: Net credit received
    - Max Loss: Spread width - net credit received
    - Breakeven: Short put strike - net credit received
    - Assignment Risk: On short put if ITM at expiration
    """
    
    def __init__(self, strategy_id: str = "bull_put_spread"):
        """Initialize the Bull Put Spread Strategy"""
        self.strategy_id = strategy_id
        self.name = "Bull Put Spread Strategy"
        self.version = "1.0.0"
        self.description = "Defined-risk credit spread for bullish market conditions"
        
        # Strategy state
        self.is_initialized = False
        self.positions: Dict[str, BullPutSpreadPosition] = {}  # underlying -> position
        self.orders_submitted = []
        self.performance_metrics = {}
        
        # Strategy parameters
        self.parameters = {
            # General parameters
            'underlyings': ['AAPL'],              # Stocks to trade
            'max_positions': 5,                   # Maximum concurrent positions
            'position_size': 1,                   # Number of spreads per position
            
            # Entry criteria
            'target_dte': 35,                     # Target days to expiration
            'min_dte': 30,                        # Minimum DTE for entry
            'max_dte': 45,                        # Maximum DTE for entry
            'short_put_target_delta': Decimal('0.30'), # Target delta for short put
            'delta_tolerance': Decimal('0.05'),   # Delta selection tolerance
            'spread_width': Decimal('5.00'),      # Width between strikes
            'min_credit': Decimal('0.50'),        # Minimum net credit
            'max_credit_to_width_ratio': Decimal('0.40'), # Max credit/width ratio
            
            # Management parameters
            'profit_target_pct': Decimal('0.50'), # Close at 50% max profit
            'loss_limit_pct': Decimal('2.00'),    # Close at 200% max loss
            'dte_close_threshold': 7,             # Close when DTE <= 7
            'delta_roll_threshold': Decimal('0.30'), # Roll if short delta > 0.30
            'roll_strikes_up': True,              # Roll strikes up when tested
            
            # Risk parameters
            'max_position_cost': Decimal('500'),  # Maximum risk per position
            'max_portfolio_allocation': Decimal('0.20'), # Max % of portfolio
            'min_iv_rank': 25,                    # Minimum IV rank for entry
            'max_bid_ask_spread': Decimal('0.10'), # Maximum bid-ask spread per leg
            'min_open_interest': 100,             # Minimum open interest
        }
        
        self._logger = logging.getLogger(f"strategy.{strategy_id}")
    
    async def initialize(self, context) -> bool:
        """
        Initialize the Bull Put Spread strategy.
        
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
            self._logger.info(f"Target DTE: {self.parameters['target_dte']}")
            self._logger.info(f"Short put target delta: {self.parameters['short_put_target_delta']}")
            self._logger.info(f"Spread width: ${self.parameters['spread_width']}")
            
            self.is_initialized = True
            context.log_info(f"{self.name} initialized successfully")
            return True
            
        except Exception as e:
            self._logger.error(f"Strategy initialization failed: {e}")
            context.log_error(f"Strategy initialization failed: {e}")
            return False
    
    async def on_market_data(self, context, event) -> None:
        """
        Process market data event and execute Bull Put Spread logic.
        
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
                # Look for new Bull Put Spread entry opportunity
                if len(self.positions) < self.parameters['max_positions']:
                    await self._evaluate_spread_entry(context, underlying, options_chain)
                
        except Exception as e:
            self._logger.error(f"Error processing {underlying}: {e}")
            context.log_error(f"Error processing {underlying}: {e}")
    
    async def _evaluate_spread_entry(self, context, underlying: str, options_chain: OptionsChain) -> None:
        """
        Evaluate whether to enter a new Bull Put Spread position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            options_chain: Current options chain
        """
        try:
            # Find suitable expiration
            suitable_expiration = self._find_suitable_expiration(options_chain)
            if not suitable_expiration:
                context.log_debug(f"No suitable expiration found for {underlying}")
                return
            
            # Get contracts for this expiration
            expiration_contracts = [c for c in options_chain.contracts if c.expiration == suitable_expiration]
            puts = [c for c in expiration_contracts if c.option_type == 'put']
            
            # Find optimal strikes for Bull Put Spread
            spread_strikes = self._find_optimal_strikes(options_chain.underlying_price, puts)
            if not spread_strikes:
                context.log_debug(f"No suitable strikes found for {underlying}")
                return
            
            # Calculate expected credit and risk
            expected_credit = self._calculate_expected_credit(spread_strikes)
            max_risk = self._calculate_max_risk(spread_strikes, expected_credit)
            
            # Validate trade meets criteria
            if not self._validate_trade_criteria(expected_credit, max_risk, spread_strikes):
                context.log_debug(f"Trade criteria not met for {underlying}")
                return
            
            # Execute the Bull Put Spread
            await self._execute_bull_put_spread(context, underlying, spread_strikes, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error evaluating spread entry: {e}")
            context.log_error(f"Error evaluating spread entry: {e}")
    
    def _find_suitable_expiration(self, options_chain: OptionsChain) -> Optional[datetime]:
        """
        Find expiration date that meets our DTE criteria.
        
        Args:
            options_chain: Current options chain
            
        Returns:
            Suitable expiration date or None
        """
        current_date = options_chain.timestamp
        expirations = sorted(set(c.expiration for c in options_chain.contracts))
        
        for expiration in expirations:
            dte = (expiration.date() - current_date.date()).days
            
            if (self.parameters['min_dte'] <= dte <= self.parameters['max_dte']):
                return expiration
        
        return None
    
    def _find_optimal_strikes(self, underlying_price: Decimal, puts: List[OptionContract]) -> Optional[Dict[str, OptionContract]]:
        """
        Find optimal strikes for Bull Put Spread based on delta targets.
        
        Args:
            underlying_price: Current underlying price
            puts: Available put contracts
            
        Returns:
            Dictionary with short_put and long_put contracts or None
        """
        try:
            if not puts:
                return None
            
            # Sort puts by strike (descending for puts)
            puts.sort(key=lambda x: x.strike, reverse=True)
            
            # Find short put (target delta around -0.30, OTM)
            target_short_delta = -self.parameters['short_put_target_delta']
            short_put = self._find_closest_delta_put(puts, target_short_delta, underlying_price)
            if not short_put:
                return None
            
            # Find long put (spread_width below short put)
            long_put_strike = short_put.strike - self.parameters['spread_width']
            long_put = self._find_put_by_strike(puts, long_put_strike)
            if not long_put:
                return None
            
            # Validate the structure makes sense
            if not (long_put.strike < short_put.strike):
                return None
            
            # Ensure both puts are OTM (strikes below current price)
            if short_put.strike >= underlying_price:
                return None
            
            return {
                'short_put': short_put,
                'long_put': long_put
            }
            
        except Exception as e:
            self._logger.error(f"Error finding optimal strikes: {e}")
            return None
    
    def _find_closest_delta_put(self, puts: List[OptionContract], target_delta: Decimal, underlying_price: Decimal) -> Optional[OptionContract]:
        """Find put with delta closest to target"""
        if not puts:
            return None
        
        best_put = None
        best_diff = float('inf')
        
        for put in puts:
            if put.delta is None or put.bid is None:
                continue
            
            # Only consider OTM puts (strike < underlying price)
            if put.strike >= underlying_price:
                continue
            
            diff = abs(float(put.delta - target_delta))
            if diff < best_diff and diff <= float(self.parameters['delta_tolerance']):
                best_diff = diff
                best_put = put
        
        return best_put
    
    def _find_put_by_strike(self, puts: List[OptionContract], target_strike: Decimal) -> Optional[OptionContract]:
        """Find put with specific strike price"""
        for put in puts:
            if put.strike == target_strike:
                return put
        return None
    
    def _calculate_expected_credit(self, strikes: Dict[str, OptionContract]) -> Decimal:
        """Calculate expected net credit from Bull Put Spread"""
        credit = Decimal('0')
        
        # Credit from short put (we receive premium)
        if strikes['short_put'].bid:
            credit += strikes['short_put'].bid
        
        # Debit from long put (we pay premium)
        if strikes['long_put'].ask:
            credit -= strikes['long_put'].ask
        
        return credit
    
    def _calculate_max_risk(self, strikes: Dict[str, OptionContract], net_credit: Decimal) -> Decimal:
        """Calculate maximum risk of Bull Put Spread"""
        spread_width = strikes['short_put'].strike - strikes['long_put'].strike
        return spread_width - net_credit
    
    def _validate_trade_criteria(self, expected_credit: Decimal, max_risk: Decimal, strikes: Dict[str, OptionContract]) -> bool:
        """Validate that trade meets our criteria"""
        # Must collect minimum credit
        if expected_credit < self.parameters['min_credit']:
            return False
        
        # Risk must be within limits
        if max_risk > self.parameters['max_position_cost']:
            return False
        
        # Credit to width ratio check
        spread_width = strikes['short_put'].strike - strikes['long_put'].strike
        credit_to_width_ratio = expected_credit / spread_width
        if credit_to_width_ratio > self.parameters['max_credit_to_width_ratio']:
            return False
        
        # Liquidity checks
        for leg_name, contract in strikes.items():
            if ((contract.ask - contract.bid) > self.parameters['max_bid_ask_spread'] or
                contract.open_interest < self.parameters['min_open_interest']):
                return False
        
        return True
    
    async def _execute_bull_put_spread(self, context, underlying: str, strikes: Dict[str, OptionContract], options_chain: OptionsChain) -> None:
        """
        Execute the Bull Put Spread by submitting both leg orders.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            strikes: The two put contracts
            options_chain: Current options chain
        """
        try:
            context.log_info(f"Executing Bull Put Spread on {underlying}")
            
            # Create the two legs
            short_leg = BullPutSpreadLeg(
                contract=strikes['short_put'],
                side='sell',
                quantity=self.parameters['position_size'],
                entry_price=strikes['short_put'].bid,
                entry_date=options_chain.timestamp
            )
            
            long_leg = BullPutSpreadLeg(
                contract=strikes['long_put'],
                side='buy',
                quantity=self.parameters['position_size'],
                entry_price=strikes['long_put'].ask,
                entry_date=options_chain.timestamp
            )
            
            # Submit orders for both legs
            order_ids = []
            
            # Sell short put
            short_order_id = await context.submit_order({
                'symbol': short_leg.contract.symbol,
                'underlying': underlying,
                'side': 'sell_to_open',
                'quantity': short_leg.quantity,
                'order_type': 'LIMIT',
                'price': short_leg.entry_price,
                'option_type': 'put',
                'strike': short_leg.contract.strike,
                'expiration': short_leg.contract.expiration,
                'metadata': {
                    'strategy_id': self.strategy_id,
                    'strategy_type': 'bull_put_spread',
                    'leg_type': 'short_put',
                    'underlying': underlying
                }
            })
            order_ids.append(short_order_id)
            
            # Buy long put
            long_order_id = await context.submit_order({
                'symbol': long_leg.contract.symbol,
                'underlying': underlying,
                'side': 'buy_to_open',
                'quantity': long_leg.quantity,
                'order_type': 'LIMIT',
                'price': long_leg.entry_price,
                'option_type': 'put',
                'strike': long_leg.contract.strike,
                'expiration': long_leg.contract.expiration,
                'metadata': {
                    'strategy_id': self.strategy_id,
                    'strategy_type': 'bull_put_spread',
                    'leg_type': 'long_put',
                    'underlying': underlying
                }
            })
            order_ids.append(long_order_id)
            
            # Calculate position metrics
            net_credit = self._calculate_expected_credit(strikes)
            max_risk = self._calculate_max_risk(strikes, net_credit)
            spread_width = strikes['short_put'].strike - strikes['long_put'].strike
            
            # Create position record
            position = BullPutSpreadPosition(
                underlying=underlying,
                entry_date=options_chain.timestamp,
                expiration=strikes['short_put'].expiration,
                state=BullPutSpreadState.ACTIVE,
                short_put=short_leg,
                long_put=long_leg,
                net_credit_received=net_credit,
                max_profit=net_credit,
                max_loss=max_risk,
                breakeven_price=strikes['short_put'].strike - net_credit,
                spread_width=spread_width
            )
            
            self.positions[underlying] = position
            self.orders_submitted.extend(order_ids)
            
            context.log_info(f"Bull Put Spread executed on {underlying}:")
            context.log_info(f"  Short Put: ${strikes['short_put'].strike} @ ${strikes['short_put'].bid}")
            context.log_info(f"  Long Put: ${strikes['long_put'].strike} @ ${strikes['long_put'].ask}")
            context.log_info(f"  Net Credit: ${net_credit}")
            context.log_info(f"  Max Profit: ${position.max_profit}")
            context.log_info(f"  Max Risk: ${position.max_loss}")
            context.log_info(f"  Breakeven: ${position.breakeven_price}")
            context.log_info(f"  P/L Ratio: {position.get_profit_loss_ratio():.2f}")
            
        except Exception as e:
            self._logger.error(f"Error executing Bull Put Spread: {e}")
            context.log_error(f"Error executing Bull Put Spread: {e}")
    
    async def _manage_existing_position(self, context, underlying: str, options_chain: OptionsChain) -> None:
        """
        Manage existing Bull Put Spread position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            options_chain: Current options chain
        """
        try:
            position = self.positions[underlying]
            
            # Update current prices and P&L
            self._update_position_pnl(position, options_chain)
            
            # Check management criteria
            current_pnl = position.get_total_pnl()
            dte = position.get_days_to_expiration(options_chain.timestamp)
            
            # Check profit target
            profit_target = position.max_profit * position.profit_target_pct
            if current_pnl >= profit_target:
                await self._close_position(context, underlying, "Profit target reached")
                return
            
            # Check loss limit
            loss_limit = position.max_profit * position.loss_limit_pct
            if current_pnl <= -loss_limit:
                await self._close_position(context, underlying, "Loss limit reached")
                return
            
            # Check DTE threshold
            if dte <= position.dte_close_threshold:
                await self._close_position(context, underlying, "DTE threshold reached")
                return
            
            # Check if short put is being tested (delta too high)
            current_short_put = next((c for c in options_chain.contracts 
                                    if c.strike == position.short_put.contract.strike and 
                                    c.option_type == 'put' and 
                                    c.expiration == position.short_put.contract.expiration), None)
            
            if (current_short_put and current_short_put.delta and 
                abs(current_short_put.delta) >= position.delta_roll_threshold):
                
                if self.parameters['roll_strikes_up']:
                    await self._roll_position(context, underlying, options_chain, "Short put being tested")
                else:
                    await self._close_position(context, underlying, "Short put being tested")
                return
            
            # Log position status
            context.log_debug(f"{underlying} Bull Put Spread: P&L=${current_pnl}, DTE={dte}")
            
        except Exception as e:
            self._logger.error(f"Error managing position: {e}")
            context.log_error(f"Error managing position: {e}")
    
    def _update_position_pnl(self, position: BullPutSpreadPosition, options_chain: OptionsChain) -> None:
        """Update position P&L based on current option prices"""
        try:
            # Update short put
            self._update_leg_pnl(position.short_put, options_chain)
            
            # Update long put
            self._update_leg_pnl(position.long_put, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error updating position P&L: {e}")
    
    def _update_leg_pnl(self, leg: BullPutSpreadLeg, options_chain: OptionsChain) -> None:
        """Update individual leg P&L"""
        try:
            # Find current contract price
            for contract in options_chain.contracts:
                if (contract.symbol == leg.contract.symbol or
                    (contract.strike == leg.contract.strike and
                     contract.option_type == leg.contract.option_type and
                     contract.expiration == leg.contract.expiration)):
                    
                    # Use appropriate price based on position side
                    if leg.side == 'sell':
                        leg.current_price = contract.ask  # What we'd pay to close
                    else:
                        leg.current_price = contract.bid  # What we could sell for
                    
                    leg.unrealized_pnl = leg.get_current_pnl()
                    leg.days_to_expiration = leg.get_days_to_expiration(options_chain.timestamp)
                    break
                    
        except Exception as e:
            self._logger.error(f"Error updating leg P&L: {e}")
    
    async def _close_position(self, context, underlying: str, reason: str) -> None:
        """
        Close Bull Put Spread position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            reason: Reason for closing
        """
        try:
            position = self.positions[underlying]
            
            context.log_info(f"Closing {underlying} Bull Put Spread: {reason}")
            
            # Submit closing orders for both legs (reverse the original trades)
            legs = [position.short_put, position.long_put]
            
            for leg in legs:
                # Reverse the side for closing
                close_side = 'buy_to_close' if leg.side == 'sell' else 'sell_to_close'
                
                order_id = await context.submit_order({
                    'symbol': leg.contract.symbol,
                    'underlying': underlying,
                    'side': close_side,
                    'quantity': leg.quantity,
                    'order_type': 'MARKET',  # Use market orders for closing
                    'metadata': {
                        'strategy_id': self.strategy_id,
                        'strategy_type': 'bull_put_spread',
                        'action': 'close',
                        'reason': reason
                    }
                })
                self.orders_submitted.append(order_id)
            
            # Update position state
            position.state = BullPutSpreadState.CLOSED
            
            # Remove from active positions
            del self.positions[underlying]
            
            context.log_info(f"Bull Put Spread position closed for {underlying}")
            
        except Exception as e:
            self._logger.error(f"Error closing position: {e}")
            context.log_error(f"Error closing position: {e}")
    
    async def _roll_position(self, context, underlying: str, options_chain: OptionsChain, reason: str) -> None:
        """
        Roll Bull Put Spread position to new strikes.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            options_chain: Current options chain
            reason: Reason for rolling
        """
        try:
            context.log_info(f"Rolling {underlying} Bull Put Spread: {reason}")
            
            # Close current position
            await self._close_position(context, underlying, f"Rolling position: {reason}")
            
            # Try to open new position with higher strikes
            await self._evaluate_spread_entry(context, underlying, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error rolling position: {e}")
            context.log_error(f"Error rolling position: {e}")
    
    def _validate_parameters(self) -> bool:
        """Validate strategy parameters"""
        try:
            # Validate underlyings
            if not self.parameters['underlyings']:
                self._logger.error("No underlyings specified")
                return False
            
            # Validate delta parameters
            if not (0 < self.parameters['short_put_target_delta'] < 1):
                self._logger.error("short_put_target_delta must be between 0 and 1")
                return False
            
            # Validate DTE parameters
            if self.parameters['min_dte'] >= self.parameters['max_dte']:
                self._logger.error("min_dte must be less than max_dte")
                return False
            
            # Validate spread width
            if self.parameters['spread_width'] <= 0:
                self._logger.error("spread_width must be positive")
                return False
            
            # Validate management parameters
            if self.parameters['profit_target_pct'] <= 0:
                self._logger.error("profit_target_pct must be positive")
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
            
            # Close any remaining positions
            for underlying in list(self.positions.keys()):
                await self._close_position(context, underlying, "Strategy cleanup")
            
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
            'category': 'credit_spread',
            'market_outlook': 'bullish_to_neutral',
            'complexity': 'intermediate',
            'risk_profile': 'defined_risk',
            'parameters_schema': {
                'underlyings': {'type': 'array', 'default': ['AAPL']},
                'target_dte': {'type': 'integer', 'default': 35, 'min': 21, 'max': 60},
                'short_put_target_delta': {'type': 'number', 'default': 0.30, 'min': 0.15, 'max': 0.45},
                'spread_width': {'type': 'number', 'default': 5.00, 'min': 2.50, 'max': 20.00},
                'profit_target_pct': {'type': 'number', 'default': 0.50, 'min': 0.25, 'max': 0.75},
                'loss_limit_pct': {'type': 'number', 'default': 2.00, 'min': 1.50, 'max': 3.00},
                'max_positions': {'type': 'integer', 'default': 5, 'min': 1, 'max': 20},
                'position_size': {'type': 'integer', 'default': 1, 'min': 1, 'max': 10}
            },
            'risk_characteristics': {
                'max_profit': 'net_credit_received',
                'max_loss': 'spread_width_minus_credit',
                'breakeven': 'short_strike_minus_credit',
                'time_decay': 'positive',
                'volatility_exposure': 'short',
                'assignment_risk': 'short_put_if_itm'
            },
            'market_conditions': {
                'optimal': 'bullish_with_high_iv',
                'acceptable': 'neutral_to_bullish',
                'avoid': 'strong_bearish_trends'
            },
            'execution_stats': {
                'active_positions': len(self.positions),
                'total_orders_submitted': len(self.orders_submitted)
            },
            'tags': ['options', 'bull_put_spread', 'credit_spread', 'defined_risk', 'bullish', 'intermediate'],
            'author': 'TradingEngine',
            'created_at': datetime.now().isoformat()
        }
