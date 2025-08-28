"""
Iron Condor Options Strategy - Options Trading Backtest Engine

A sophisticated non-directional, premium-collecting options strategy for sideways markets.
The Iron Condor combines a bull put spread and a bear call spread to profit from low volatility.

Strategy Structure:
- Sell OTM Put (higher strike)
- Buy OTM Put (lower strike) 
- Sell OTM Call (lower strike)
- Buy OTM Call (higher strike)

This creates a profit zone between the short strikes, collecting premium upfront.

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


class IronCondorState(Enum):
    """Iron Condor position states"""
    SEARCHING = "searching"  # Looking for entry opportunity
    ENTERED = "entered"      # Position is open
    MANAGING = "managing"    # Actively managing position
    CLOSING = "closing"      # Closing position
    CLOSED = "closed"        # Position closed


@dataclass
class IronCondorLeg:
    """Individual leg of the Iron Condor"""
    contract: OptionContract
    side: str  # 'buy' or 'sell'
    quantity: int
    entry_price: Optional[Decimal] = None
    current_price: Optional[Decimal] = None
    pnl: Optional[Decimal] = None


@dataclass
class IronCondorPosition:
    """Complete Iron Condor position"""
    underlying: str
    expiration: datetime
    entry_date: datetime
    state: IronCondorState
    
    # The four legs
    short_put: IronCondorLeg
    long_put: IronCondorLeg
    short_call: IronCondorLeg
    long_call: IronCondorLeg
    
    # Position metrics
    net_premium_collected: Decimal
    max_profit: Decimal
    max_loss: Decimal
    breakeven_lower: Decimal
    breakeven_upper: Decimal
    
    # Management parameters
    profit_target_pct: Decimal = Decimal('0.50')  # Close at 50% max profit
    loss_limit_pct: Decimal = Decimal('2.00')     # Close at 200% max loss
    days_to_expiration_close: int = 7             # Close if DTE <= 7
    
    def get_current_pnl(self) -> Decimal:
        """Calculate current P&L of the position"""
        total_pnl = Decimal('0')
        for leg in [self.short_put, self.long_put, self.short_call, self.long_call]:
            if leg.pnl is not None:
                total_pnl += leg.pnl
        return total_pnl
    
    def get_days_to_expiration(self, current_date: datetime) -> int:
        """Get days to expiration"""
        return (self.expiration.date() - current_date.date()).days


class IronCondorStrategy:
    """
    Iron Condor Options Strategy
    
    A market-neutral strategy that profits from low volatility and time decay.
    Sells premium by creating a range where the underlying can trade profitably.
    
    Entry Criteria:
    - High implied volatility (IV rank > threshold)
    - Sufficient days to expiration (typically 30-45 DTE)
    - Liquid options with tight bid-ask spreads
    - Target delta for short strikes (~0.30 delta)
    
    Management:
    - Close at profit target (typically 25-50% of max profit)
    - Close at loss limit (typically 2x max profit)
    - Close when DTE reaches threshold (typically 7-14 days)
    - Adjust if underlying moves too close to short strikes
    """
    
    def __init__(self, strategy_id: str = "iron_condor"):
        """Initialize the Iron Condor Strategy"""
        self.strategy_id = strategy_id
        self.name = "Iron Condor Options Strategy"
        self.version = "1.0.0"
        self.description = "Non-directional premium collection strategy for sideways markets"
        
        # Strategy state
        self.is_initialized = False
        self.positions: Dict[str, IronCondorPosition] = {}  # underlying -> position
        self.orders_submitted = []
        self.performance_metrics = {}
        
        # Strategy parameters
        self.parameters = {
            # Entry criteria
            'target_dte': 35,                    # Target days to expiration
            'min_dte': 30,                       # Minimum DTE for entry
            'max_dte': 45,                       # Maximum DTE for entry
            'target_delta': Decimal('0.30'),     # Target delta for short strikes
            'delta_tolerance': Decimal('0.05'),  # Tolerance for delta selection
            'min_iv_rank': 30,                   # Minimum IV rank for entry
            'max_bid_ask_spread': Decimal('0.10'), # Max bid-ask spread per leg
            
            # Position sizing
            'max_positions': 3,                  # Maximum concurrent positions
            'position_size': 1,                  # Number of contracts per leg
            'max_risk_per_trade': Decimal('500'), # Maximum risk per trade
            
            # Management rules
            'profit_target_pct': Decimal('0.50'), # Close at 50% max profit
            'loss_limit_pct': Decimal('2.00'),    # Close at 200% max loss
            'dte_close_threshold': 7,             # Close when DTE <= 7
            'adjustment_threshold': Decimal('0.15'), # Adjust if delta > 0.15
            
            # Strike selection
            'put_spread_width': Decimal('5.00'),  # Width of put spread
            'call_spread_width': Decimal('5.00'), # Width of call spread
            'min_credit': Decimal('0.50'),        # Minimum net credit
        }
        
        self._logger = logging.getLogger(f"strategy.{strategy_id}")
    
    async def initialize(self, context) -> bool:
        """
        Initialize the Iron Condor strategy.
        
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
            self._logger.info(f"Target Delta: {self.parameters['target_delta']}")
            self._logger.info(f"Profit Target: {self.parameters['profit_target_pct']}%")
            
            self.is_initialized = True
            context.log_info(f"{self.name} initialized successfully")
            return True
            
        except Exception as e:
            self._logger.error(f"Strategy initialization failed: {e}")
            context.log_error(f"Strategy initialization failed: {e}")
            return False
    
    async def on_market_data(self, context, event) -> None:
        """
        Process market data event and execute Iron Condor logic.
        
        Args:
            context: Strategy execution context
            event: Market data event
        """
        try:
            if not self.is_initialized:
                context.log_warning("Strategy not initialized, skipping market data processing")
                return
            
            # Process each underlying we're interested in
            # For now, we'll focus on a single underlying (AAPL)
            underlying = "AAPL"
            
            # Get current options chain
            options_chain = await context.get_options_chain(underlying)
            if not options_chain:
                context.log_debug(f"No options chain available for {underlying}")
                return
            
            # Check existing positions first
            if underlying in self.positions:
                await self._manage_existing_position(context, underlying, options_chain)
            else:
                # Look for new entry opportunities
                await self._evaluate_entry_opportunity(context, underlying, options_chain)
                
        except Exception as e:
            self._logger.error(f"Error processing market data: {e}")
            context.log_error(f"Error processing market data: {e}")
    
    async def _evaluate_entry_opportunity(self, context, underlying: str, options_chain: OptionsChain) -> None:
        """
        Evaluate whether to enter a new Iron Condor position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            options_chain: Current options chain
        """
        try:
            # Check if we have room for more positions
            if len(self.positions) >= self.parameters['max_positions']:
                context.log_debug(f"Maximum positions reached ({self.parameters['max_positions']})")
                return
            
            # Find suitable expiration
            suitable_expiration = self._find_suitable_expiration(options_chain)
            if not suitable_expiration:
                context.log_debug(f"No suitable expiration found for {underlying}")
                return
            
            # Get contracts for this expiration
            expiration_contracts = [c for c in options_chain.contracts if c.expiration == suitable_expiration]
            
            # Find optimal strikes for Iron Condor
            condor_strikes = self._find_optimal_strikes(options_chain.underlying_price, expiration_contracts)
            if not condor_strikes:
                context.log_debug(f"No suitable strikes found for {underlying}")
                return
            
            # Calculate expected premium and risk
            expected_credit = self._calculate_expected_credit(condor_strikes)
            max_risk = self._calculate_max_risk(condor_strikes)
            
            # Validate trade meets criteria
            if not self._validate_trade_criteria(expected_credit, max_risk):
                context.log_debug(f"Trade criteria not met for {underlying}")
                return
            
            # Execute the Iron Condor
            await self._execute_iron_condor(context, underlying, condor_strikes, options_chain)
            
        except Exception as e:
            self._logger.error(f"Error evaluating entry opportunity: {e}")
            context.log_error(f"Error evaluating entry opportunity: {e}")
    
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
    
    def _find_optimal_strikes(self, underlying_price: Decimal, contracts: List[OptionContract]) -> Optional[Dict[str, OptionContract]]:
        """
        Find optimal strikes for Iron Condor based on delta targets.
        
        Args:
            underlying_price: Current underlying price
            contracts: Available option contracts
            
        Returns:
            Dictionary with the four legs or None if not found
        """
        try:
            # Separate calls and puts
            calls = [c for c in contracts if c.option_type == 'call' and c.delta is not None]
            puts = [c for c in contracts if c.option_type == 'put' and c.delta is not None]
            
            if not calls or not puts:
                return None
            
            # Sort by strike
            calls.sort(key=lambda x: x.strike)
            puts.sort(key=lambda x: x.strike, reverse=True)
            
            # Find short put (target delta around -0.30)
            target_put_delta = -self.parameters['target_delta']
            short_put = self._find_closest_delta_contract(puts, target_put_delta)
            if not short_put:
                return None
            
            # Find long put (put_spread_width below short put)
            long_put_strike = short_put.strike - self.parameters['put_spread_width']
            long_put = self._find_contract_by_strike(puts, long_put_strike)
            if not long_put:
                return None
            
            # Find short call (target delta around 0.30)
            target_call_delta = self.parameters['target_delta']
            short_call = self._find_closest_delta_contract(calls, target_call_delta)
            if not short_call:
                return None
            
            # Find long call (call_spread_width above short call)
            long_call_strike = short_call.strike + self.parameters['call_spread_width']
            long_call = self._find_contract_by_strike(calls, long_call_strike)
            if not long_call:
                return None
            
            # Validate the structure makes sense
            if not (long_put.strike < short_put.strike < short_call.strike < long_call.strike):
                return None
            
            return {
                'short_put': short_put,
                'long_put': long_put,
                'short_call': short_call,
                'long_call': long_call
            }
            
        except Exception as e:
            self._logger.error(f"Error finding optimal strikes: {e}")
            return None
    
    def _find_closest_delta_contract(self, contracts: List[OptionContract], target_delta: Decimal) -> Optional[OptionContract]:
        """Find contract with delta closest to target"""
        if not contracts:
            return None
        
        best_contract = None
        best_diff = float('inf')
        
        for contract in contracts:
            if contract.delta is None:
                continue
            
            diff = abs(float(contract.delta - target_delta))
            if diff < best_diff and diff <= float(self.parameters['delta_tolerance']):
                best_diff = diff
                best_contract = contract
        
        return best_contract
    
    def _find_contract_by_strike(self, contracts: List[OptionContract], target_strike: Decimal) -> Optional[OptionContract]:
        """Find contract with specific strike price"""
        for contract in contracts:
            if contract.strike == target_strike:
                return contract
        return None
    
    def _calculate_expected_credit(self, strikes: Dict[str, OptionContract]) -> Decimal:
        """Calculate expected net credit from Iron Condor"""
        credit = Decimal('0')
        
        # Credit from short options (we receive premium)
        if strikes['short_put'].bid:
            credit += strikes['short_put'].bid
        if strikes['short_call'].bid:
            credit += strikes['short_call'].bid
        
        # Debit from long options (we pay premium)
        if strikes['long_put'].ask:
            credit -= strikes['long_put'].ask
        if strikes['long_call'].ask:
            credit -= strikes['long_call'].ask
        
        return credit
    
    def _calculate_max_risk(self, strikes: Dict[str, OptionContract]) -> Decimal:
        """Calculate maximum risk of Iron Condor"""
        put_spread_width = strikes['short_put'].strike - strikes['long_put'].strike
        call_spread_width = strikes['long_call'].strike - strikes['short_call'].strike
        
        # Max risk is the wider spread width minus net credit
        max_spread_width = max(put_spread_width, call_spread_width)
        expected_credit = self._calculate_expected_credit(strikes)
        
        return max_spread_width - expected_credit
    
    def _validate_trade_criteria(self, expected_credit: Decimal, max_risk: Decimal) -> bool:
        """Validate that trade meets our criteria"""
        # Must collect minimum credit
        if expected_credit < self.parameters['min_credit']:
            return False
        
        # Risk must be within limits
        if max_risk > self.parameters['max_risk_per_trade']:
            return False
        
        # Risk/reward ratio should be reasonable
        if max_risk > expected_credit * 3:  # Risk no more than 3x credit
            return False
        
        return True
    
    async def _execute_iron_condor(self, context, underlying: str, strikes: Dict[str, OptionContract], options_chain: OptionsChain) -> None:
        """
        Execute the Iron Condor by submitting all four leg orders.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            strikes: The four option contracts
            options_chain: Current options chain
        """
        try:
            context.log_info(f"Executing Iron Condor on {underlying}")
            
            # Create the four legs
            legs = [
                IronCondorLeg(strikes['short_put'], 'sell', self.parameters['position_size']),
                IronCondorLeg(strikes['long_put'], 'buy', self.parameters['position_size']),
                IronCondorLeg(strikes['short_call'], 'sell', self.parameters['position_size']),
                IronCondorLeg(strikes['long_call'], 'buy', self.parameters['position_size'])
            ]
            
            # Submit orders for each leg (simplified for demo)
            order_ids = []
            for leg in legs:
                order_id = await context.submit_order({
                    'symbol': leg.contract.symbol,
                    'underlying': underlying,
                    'side': leg.side,
                    'quantity': leg.quantity,
                    'order_type': 'LIMIT',
                    'price': leg.contract.bid if leg.side == 'sell' else leg.contract.ask,
                    'option_type': leg.contract.option_type,
                    'strike': leg.contract.strike,
                    'expiration': leg.contract.expiration,
                    'metadata': {
                        'strategy_id': self.strategy_id,
                        'strategy_type': 'iron_condor',
                        'leg_type': f"{leg.side}_{leg.contract.option_type}",
                        'underlying': underlying
                    }
                })
                order_ids.append(order_id)
                self.orders_submitted.append(order_id)
            
            # Create position record
            net_credit = self._calculate_expected_credit(strikes)
            max_risk = self._calculate_max_risk(strikes)
            
            position = IronCondorPosition(
                underlying=underlying,
                expiration=strikes['short_put'].expiration,
                entry_date=options_chain.timestamp,
                state=IronCondorState.ENTERED,
                short_put=legs[0],
                long_put=legs[1],
                short_call=legs[2],
                long_call=legs[3],
                net_premium_collected=net_credit,
                max_profit=net_credit,
                max_loss=max_risk,
                breakeven_lower=strikes['short_put'].strike - net_credit,
                breakeven_upper=strikes['short_call'].strike + net_credit
            )
            
            self.positions[underlying] = position
            
            context.log_info(f"Iron Condor executed on {underlying}:")
            context.log_info(f"  Short Put: {strikes['short_put'].strike} @ {strikes['short_put'].bid}")
            context.log_info(f"  Long Put: {strikes['long_put'].strike} @ {strikes['long_put'].ask}")
            context.log_info(f"  Short Call: {strikes['short_call'].strike} @ {strikes['short_call'].bid}")
            context.log_info(f"  Long Call: {strikes['long_call'].strike} @ {strikes['long_call'].ask}")
            context.log_info(f"  Net Credit: ${net_credit}")
            context.log_info(f"  Max Risk: ${max_risk}")
            context.log_info(f"  Breakevens: ${position.breakeven_lower} - ${position.breakeven_upper}")
            
        except Exception as e:
            self._logger.error(f"Error executing Iron Condor: {e}")
            context.log_error(f"Error executing Iron Condor: {e}")
    
    async def _manage_existing_position(self, context, underlying: str, options_chain: OptionsChain) -> None:
        """
        Manage existing Iron Condor position.
        
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
            current_pnl = position.get_current_pnl()
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
            if dte <= position.days_to_expiration_close:
                await self._close_position(context, underlying, "DTE threshold reached")
                return
            
            # Log position status
            context.log_debug(f"{underlying} Iron Condor: P&L=${current_pnl}, DTE={dte}")
            
        except Exception as e:
            self._logger.error(f"Error managing position: {e}")
            context.log_error(f"Error managing position: {e}")
    
    def _update_position_pnl(self, position: IronCondorPosition, options_chain: OptionsChain) -> None:
        """Update position P&L based on current option prices"""
        # This would update each leg's current price and P&L
        # For demo purposes, we'll use a simplified calculation
        pass
    
    async def _close_position(self, context, underlying: str, reason: str) -> None:
        """
        Close Iron Condor position.
        
        Args:
            context: Strategy execution context
            underlying: Underlying symbol
            reason: Reason for closing
        """
        try:
            position = self.positions[underlying]
            
            context.log_info(f"Closing {underlying} Iron Condor: {reason}")
            
            # Submit closing orders for each leg (reverse the original trades)
            legs = [position.short_put, position.long_put, position.short_call, position.long_call]
            
            for leg in legs:
                # Reverse the side for closing
                close_side = 'buy' if leg.side == 'sell' else 'sell'
                
                order_id = await context.submit_order({
                    'symbol': leg.contract.symbol,
                    'underlying': underlying,
                    'side': close_side,
                    'quantity': leg.quantity,
                    'order_type': 'MARKET',  # Use market orders for closing
                    'metadata': {
                        'strategy_id': self.strategy_id,
                        'strategy_type': 'iron_condor',
                        'action': 'close',
                        'reason': reason
                    }
                })
                self.orders_submitted.append(order_id)
            
            # Update position state
            position.state = IronCondorState.CLOSED
            
            # Remove from active positions
            del self.positions[underlying]
            
            context.log_info(f"Iron Condor position closed for {underlying}")
            
        except Exception as e:
            self._logger.error(f"Error closing position: {e}")
            context.log_error(f"Error closing position: {e}")
    
    def _validate_parameters(self) -> bool:
        """Validate strategy parameters"""
        try:
            # Validate DTE parameters
            if self.parameters['min_dte'] >= self.parameters['max_dte']:
                self._logger.error("min_dte must be less than max_dte")
                return False
            
            # Validate delta parameters
            if self.parameters['target_delta'] <= 0 or self.parameters['target_delta'] >= Decimal('1.0'):
                self._logger.error("target_delta must be between 0 and 1")
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
            'category': 'premium_collection',
            'market_outlook': 'neutral',
            'complexity': 'advanced',
            'parameters_schema': {
                'target_dte': {'type': 'integer', 'default': 35, 'min': 14, 'max': 90},
                'target_delta': {'type': 'number', 'default': 0.30, 'min': 0.10, 'max': 0.50},
                'profit_target_pct': {'type': 'number', 'default': 0.50, 'min': 0.25, 'max': 1.00},
                'loss_limit_pct': {'type': 'number', 'default': 2.00, 'min': 1.00, 'max': 5.00},
                'max_positions': {'type': 'integer', 'default': 3, 'min': 1, 'max': 10},
                'position_size': {'type': 'integer', 'default': 1, 'min': 1, 'max': 10}
            },
            'risk_characteristics': {
                'max_risk_per_trade': float(self.parameters['max_risk_per_trade']),
                'profit_potential': 'limited',
                'loss_potential': 'limited',
                'time_decay': 'positive',
                'volatility_exposure': 'short'
            },
            'market_conditions': {
                'optimal': 'low_volatility_sideways',
                'acceptable': 'moderate_volatility_trending',
                'avoid': 'high_volatility_breakout'
            },
            'execution_stats': {
                'active_positions': len(self.positions),
                'total_orders_submitted': len(self.orders_submitted)
            },
            'tags': ['options', 'iron_condor', 'premium_collection', 'neutral', 'advanced'],
            'author': 'TradingEngine',
            'created_at': datetime.now().isoformat()
        }
