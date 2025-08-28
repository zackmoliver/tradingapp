"""
Risk Management Interfaces - Options Trading Backtest Engine

This module defines the abstract interfaces for risk management, position sizing,
and exposure management. All risk management implementations must conform to
these contracts for consistent risk control across strategies.

NO BUSINESS LOGIC - INTERFACES ONLY
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, date
from decimal import Decimal
from typing import Protocol, Optional, List, Dict, Any, Union
from enum import Enum

# Import data types from other modules
from .strategy import Order, Position, Portfolio, StrategySignal, Fill
from ..data.provider import OptionContract


# Core Risk Data Types
class RiskLevel(Enum):
    """Risk assessment levels"""
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class RiskCheckResult(Enum):
    """Risk check outcomes"""
    APPROVED = "approved"
    REJECTED = "rejected"
    MODIFIED = "modified"
    WARNING = "warning"


class PositionSizingMethod(Enum):
    """Position sizing methodologies"""
    FIXED_DOLLAR = "fixed_dollar"
    FIXED_SHARES = "fixed_shares"
    PERCENT_CAPITAL = "percent_capital"
    VOLATILITY_BASED = "volatility_based"
    KELLY_CRITERION = "kelly_criterion"
    RISK_PARITY = "risk_parity"
    MAX_LOSS_PERCENT = "max_loss_percent"


@dataclass(frozen=True)
class RiskParameters:
    """Risk management configuration parameters"""
    max_position_size_percent: Decimal  # Max % of capital per position
    max_sector_exposure_percent: Decimal  # Max % exposure per sector
    max_single_asset_percent: Decimal  # Max % in single asset
    max_portfolio_leverage: Decimal  # Maximum portfolio leverage
    max_daily_loss_percent: Decimal  # Max daily loss threshold
    max_drawdown_percent: Decimal  # Max drawdown threshold
    var_confidence_level: Decimal  # VaR confidence level (e.g., 0.95)
    var_time_horizon_days: int  # VaR time horizon
    correlation_threshold: Decimal  # Max correlation between positions
    volatility_lookback_days: int  # Days for volatility calculation
    rebalance_threshold_percent: Decimal  # Rebalancing trigger
    margin_buffer_percent: Decimal  # Margin safety buffer
    metadata: Dict[str, Any]


@dataclass(frozen=True)
class PositionSizingRequest:
    """Request for position sizing calculation"""
    request_id: str
    strategy_id: str
    symbol: str
    signal: StrategySignal
    current_portfolio: Portfolio
    risk_parameters: RiskParameters
    market_data: Dict[str, Any]  # Current prices, volatility, etc.
    timestamp: datetime


@dataclass(frozen=True)
class PositionSizingResponse:
    """Response from position sizing calculation"""
    request_id: str
    recommended_quantity: Decimal
    max_allowed_quantity: Decimal
    risk_adjusted_quantity: Decimal
    sizing_method: PositionSizingMethod
    expected_risk: Decimal
    expected_return: Optional[Decimal]
    confidence_level: Decimal
    reasoning: str
    warnings: List[str]
    metadata: Dict[str, Any]


@dataclass(frozen=True)
class RiskCheckRequest:
    """Request for risk validation"""
    request_id: str
    strategy_id: str
    order: Order
    current_portfolio: Portfolio
    risk_parameters: RiskParameters
    market_data: Dict[str, Any]
    timestamp: datetime


@dataclass(frozen=True)
class RiskCheckResponse:
    """Response from risk validation"""
    request_id: str
    result: RiskCheckResult
    risk_level: RiskLevel
    approved: bool
    modified_order: Optional[Order]
    violations: List[str]
    warnings: List[str]
    risk_metrics: Dict[str, Decimal]
    reasoning: str
    metadata: Dict[str, Any]


@dataclass(frozen=True)
class ExposureMetrics:
    """Portfolio exposure measurements"""
    portfolio_id: str
    timestamp: datetime
    total_delta: Decimal  # Portfolio delta exposure
    total_gamma: Decimal  # Portfolio gamma exposure
    total_theta: Decimal  # Portfolio theta exposure
    total_vega: Decimal  # Portfolio vega exposure
    total_rho: Decimal  # Portfolio rho exposure
    net_exposure: Decimal  # Net long/short exposure
    gross_exposure: Decimal  # Total absolute exposure
    leverage: Decimal  # Portfolio leverage ratio
    beta: Decimal  # Portfolio beta to market
    sector_exposures: Dict[str, Decimal]  # Exposure by sector
    asset_exposures: Dict[str, Decimal]  # Exposure by asset
    correlation_risk: Decimal  # Portfolio correlation risk
    concentration_risk: Decimal  # Position concentration risk
    liquidity_risk: Decimal  # Portfolio liquidity risk
    metadata: Dict[str, Any]


@dataclass(frozen=True)
class RiskLimit:
    """Individual risk limit specification"""
    limit_id: str
    limit_type: str  # 'position_size', 'sector_exposure', 'var', etc.
    limit_value: Decimal
    warning_threshold: Decimal  # Warning level (% of limit)
    scope: str  # 'portfolio', 'strategy', 'asset', 'sector'
    scope_identifier: Optional[str]  # Specific asset/sector if applicable
    is_active: bool
    created_at: datetime
    expires_at: Optional[datetime]
    metadata: Dict[str, Any]


@dataclass(frozen=True)
class RiskViolation:
    """Risk limit violation record"""
    violation_id: str
    limit_id: str
    portfolio_id: str
    strategy_id: Optional[str]
    violation_type: str
    current_value: Decimal
    limit_value: Decimal
    severity: RiskLevel
    timestamp: datetime
    resolved: bool
    resolved_at: Optional[datetime]
    description: str
    metadata: Dict[str, Any]


class PositionSizer(Protocol):
    """
    Interface for position sizing calculations.
    
    Determines appropriate position sizes based on risk parameters,
    market conditions, and portfolio state.
    """

    @abstractmethod
    async def calculate_position_size(
        self,
        request: PositionSizingRequest
    ) -> PositionSizingResponse:
        """
        Calculate recommended position size for a signal.
        
        Args:
            request: Position sizing request with all context
            
        Returns:
            Position sizing recommendation with risk metrics
            
        Raises:
            PositionSizingError: When calculation fails
        """
        ...

    @abstractmethod
    def get_supported_methods(self) -> List[PositionSizingMethod]:
        """
        Get list of supported position sizing methods.
        
        Returns:
            List of supported sizing methodologies
        """
        ...

    @abstractmethod
    def validate_parameters(
        self,
        risk_parameters: RiskParameters
    ) -> List[str]:
        """
        Validate risk parameters for position sizing.
        
        Args:
            risk_parameters: Risk parameters to validate
            
        Returns:
            List of validation errors (empty if valid)
        """
        ...

    @abstractmethod
    def estimate_risk(
        self,
        symbol: str,
        quantity: Decimal,
        current_portfolio: Portfolio,
        market_data: Dict[str, Any]
    ) -> Decimal:
        """
        Estimate risk for a potential position.
        
        Args:
            symbol: Symbol for position
            quantity: Position quantity
            current_portfolio: Current portfolio state
            market_data: Current market data
            
        Returns:
            Estimated risk (e.g., VaR, expected loss)
        """
        ...


class RiskManager(Protocol):
    """
    Interface for comprehensive risk management.
    
    Validates orders and positions against risk limits,
    monitors portfolio risk, and enforces risk controls.
    """

    @abstractmethod
    async def validate_order(
        self,
        request: RiskCheckRequest
    ) -> RiskCheckResponse:
        """
        Validate order against risk limits.
        
        Args:
            request: Risk check request with order details
            
        Returns:
            Risk validation result with approval/rejection
            
        Raises:
            RiskCheckError: When validation fails
        """
        ...

    @abstractmethod
    async def validate_portfolio(
        self,
        portfolio: Portfolio,
        risk_parameters: RiskParameters
    ) -> List[RiskViolation]:
        """
        Validate entire portfolio against risk limits.
        
        Args:
            portfolio: Portfolio to validate
            risk_parameters: Risk limits to check against
            
        Returns:
            List of risk violations found
        """
        ...

    @abstractmethod
    def check_position_limits(
        self,
        symbol: str,
        new_quantity: Decimal,
        current_portfolio: Portfolio,
        risk_parameters: RiskParameters
    ) -> List[str]:
        """
        Check if position would violate size limits.
        
        Args:
            symbol: Symbol for position
            new_quantity: Proposed position quantity
            current_portfolio: Current portfolio state
            risk_parameters: Risk limits
            
        Returns:
            List of limit violations (empty if valid)
        """
        ...

    @abstractmethod
    def check_concentration_limits(
        self,
        portfolio: Portfolio,
        risk_parameters: RiskParameters
    ) -> List[str]:
        """
        Check portfolio concentration limits.
        
        Args:
            portfolio: Portfolio to check
            risk_parameters: Concentration limits
            
        Returns:
            List of concentration violations
        """
        ...

    @abstractmethod
    def calculate_var(
        self,
        portfolio: Portfolio,
        confidence_level: Decimal,
        time_horizon_days: int,
        market_data: Dict[str, Any]
    ) -> Decimal:
        """
        Calculate Value at Risk for portfolio.
        
        Args:
            portfolio: Portfolio to analyze
            confidence_level: VaR confidence level
            time_horizon_days: Time horizon for VaR
            market_data: Historical market data
            
        Returns:
            Value at Risk estimate
        """
        ...

    @abstractmethod
    def get_risk_limits(self) -> List[RiskLimit]:
        """
        Get all active risk limits.
        
        Returns:
            List of active risk limits
        """
        ...

    @abstractmethod
    def add_risk_limit(self, limit: RiskLimit) -> str:
        """
        Add new risk limit.
        
        Args:
            limit: Risk limit to add
            
        Returns:
            Limit ID
        """
        ...

    @abstractmethod
    def remove_risk_limit(self, limit_id: str) -> bool:
        """
        Remove risk limit.
        
        Args:
            limit_id: Limit to remove
            
        Returns:
            True if limit was removed
        """
        ...


class ExposureCalculator(Protocol):
    """
    Interface for portfolio exposure calculations.
    
    Calculates Greeks exposure, sector exposure, and other
    risk metrics for options and equity portfolios.
    """

    @abstractmethod
    async def calculate_portfolio_exposure(
        self,
        portfolio: Portfolio,
        options_data: Dict[str, OptionContract],
        market_data: Dict[str, Any]
    ) -> ExposureMetrics:
        """
        Calculate comprehensive portfolio exposure metrics.
        
        Args:
            portfolio: Portfolio to analyze
            options_data: Current options data with Greeks
            market_data: Current market data
            
        Returns:
            Complete exposure metrics
            
        Raises:
            ExposureCalculationError: When calculation fails
        """
        ...

    @abstractmethod
    def calculate_delta_exposure(
        self,
        positions: Dict[str, Position],
        options_data: Dict[str, OptionContract]
    ) -> Decimal:
        """
        Calculate total portfolio delta exposure.
        
        Args:
            positions: Current positions
            options_data: Options contracts with Greeks
            
        Returns:
            Total delta exposure
        """
        ...

    @abstractmethod
    def calculate_gamma_exposure(
        self,
        positions: Dict[str, Position],
        options_data: Dict[str, OptionContract]
    ) -> Decimal:
        """
        Calculate total portfolio gamma exposure.
        
        Args:
            positions: Current positions
            options_data: Options contracts with Greeks
            
        Returns:
            Total gamma exposure
        """
        ...

    @abstractmethod
    def calculate_theta_exposure(
        self,
        positions: Dict[str, Position],
        options_data: Dict[str, OptionContract]
    ) -> Decimal:
        """
        Calculate total portfolio theta exposure.
        
        Args:
            positions: Current positions
            options_data: Options contracts with Greeks
            
        Returns:
            Total theta exposure
        """
        ...

    @abstractmethod
    def calculate_vega_exposure(
        self,
        positions: Dict[str, Position],
        options_data: Dict[str, OptionContract]
    ) -> Decimal:
        """
        Calculate total portfolio vega exposure.
        
        Args:
            positions: Current positions
            options_data: Options contracts with Greeks
            
        Returns:
            Total vega exposure
        """
        ...

    @abstractmethod
    def calculate_sector_exposure(
        self,
        portfolio: Portfolio,
        sector_mappings: Dict[str, str]
    ) -> Dict[str, Decimal]:
        """
        Calculate exposure by sector.
        
        Args:
            portfolio: Portfolio to analyze
            sector_mappings: Symbol to sector mappings
            
        Returns:
            Dictionary mapping sector to exposure amount
        """
        ...

    @abstractmethod
    def calculate_correlation_risk(
        self,
        portfolio: Portfolio,
        correlation_matrix: Dict[str, Dict[str, Decimal]]
    ) -> Decimal:
        """
        Calculate portfolio correlation risk.
        
        Args:
            portfolio: Portfolio to analyze
            correlation_matrix: Asset correlation matrix
            
        Returns:
            Portfolio correlation risk measure
        """
        ...


class DrawdownProtection(Protocol):
    """
    Interface for drawdown protection and portfolio preservation.
    
    Monitors portfolio drawdown and implements protective measures
    when drawdown limits are breached.
    """

    @abstractmethod
    def calculate_current_drawdown(
        self,
        current_value: Decimal,
        peak_value: Decimal
    ) -> Decimal:
        """
        Calculate current drawdown from peak.
        
        Args:
            current_value: Current portfolio value
            peak_value: Historical peak value
            
        Returns:
            Current drawdown percentage
        """
        ...

    @abstractmethod
    def check_drawdown_limits(
        self,
        current_drawdown: Decimal,
        max_drawdown_limit: Decimal
    ) -> bool:
        """
        Check if drawdown exceeds limits.
        
        Args:
            current_drawdown: Current drawdown level
            max_drawdown_limit: Maximum allowed drawdown
            
        Returns:
            True if drawdown limit is breached
        """
        ...

    @abstractmethod
    def get_protection_actions(
        self,
        portfolio: Portfolio,
        drawdown_level: Decimal,
        risk_parameters: RiskParameters
    ) -> List[str]:
        """
        Get recommended protection actions for drawdown.
        
        Args:
            portfolio: Current portfolio
            drawdown_level: Current drawdown level
            risk_parameters: Risk management parameters
            
        Returns:
            List of recommended actions
        """
        ...

    @abstractmethod
    def calculate_position_reduction(
        self,
        current_positions: Dict[str, Position],
        target_reduction_percent: Decimal
    ) -> Dict[str, Decimal]:
        """
        Calculate position reductions for drawdown protection.
        
        Args:
            current_positions: Current portfolio positions
            target_reduction_percent: Target reduction percentage
            
        Returns:
            Dictionary mapping symbol to reduction quantity
        """
        ...


# Exception Types
class RiskManagementError(Exception):
    """Base exception for risk management errors"""
    pass


class PositionSizingError(RiskManagementError):
    """Exception for position sizing calculation errors"""
    pass


class RiskCheckError(RiskManagementError):
    """Exception for risk validation errors"""
    pass


class ExposureCalculationError(RiskManagementError):
    """Exception for exposure calculation errors"""
    pass


class RiskLimitViolationError(RiskManagementError):
    """Exception for risk limit violations"""
    pass


class InsufficientDataError(RiskManagementError):
    """Exception for insufficient data for risk calculations"""
    pass
