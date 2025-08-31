// src-tauri/src/engine/types.rs
// Trading engine types for paper broker

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OrderType {
    Market,
    Limit,
    Stop,
    StopLimit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InstrumentType {
    Stock,
    Option,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OptionType {
    Call,
    Put,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionDetails {
    pub underlying: String,
    pub option_type: OptionType,
    pub strike: f64,
    pub expiry: String,  // MM/DD/YYYY format
    pub multiplier: i64, // Usually 100 for equity options
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TimeInForce {
    Day,      // Good for day
    GTC,      // Good till canceled
    IOC,      // Immediate or cancel
    FOK,      // Fill or kill
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OrderStatus {
    Pending,
    PartiallyFilled,
    Filled,
    Canceled,
    Rejected,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderRequest {
    pub symbol: String,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub quantity: i64,
    pub price: Option<f64>,        // For limit orders
    pub stop_price: Option<f64>,   // For stop orders
    pub time_in_force: TimeInForce,
    pub client_order_id: Option<String>,
    pub instrument_type: InstrumentType,
    pub option_details: Option<OptionDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub id: String,
    pub client_order_id: Option<String>,
    pub symbol: String,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub quantity: i64,
    pub filled_quantity: i64,
    pub remaining_quantity: i64,
    pub price: Option<f64>,
    pub stop_price: Option<f64>,
    pub time_in_force: TimeInForce,
    pub status: OrderStatus,
    pub created_at: i64,
    pub updated_at: i64,
    pub fills: Vec<Fill>,
    pub instrument_type: InstrumentType,
    pub option_details: Option<OptionDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fill {
    pub id: String,
    pub order_id: String,
    pub symbol: String,
    pub side: OrderSide,
    pub quantity: i64,
    pub price: f64,
    pub timestamp: i64,
    pub commission: f64,
    pub instrument_type: InstrumentType,
    pub option_details: Option<OptionDetails>,
    pub leg_number: Option<i32>, // For multi-leg strategies
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub symbol: String,
    pub quantity: i64,           // Positive = long, negative = short
    pub avg_cost: f64,          // Average cost basis
    pub market_value: f64,      // Current market value
    pub unrealized_pnl: f64,    // Unrealized P&L
    pub realized_pnl: f64,      // Realized P&L from closed trades
    pub last_price: f64,        // Last known price
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Portfolio {
    pub cash: f64,
    pub equity: f64,            // Cash + market value of positions
    pub buying_power: f64,      // Available buying power
    pub positions: HashMap<String, Position>,
    pub day_pnl: f64,          // Day's P&L
    pub total_pnl: f64,        // Total P&L
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedPortfolio {
    // Basic portfolio fields
    pub cash: f64,
    pub equity: f64,
    pub buying_power: f64,
    pub positions: HashMap<String, Position>,
    pub day_pnl: f64,
    pub total_pnl: f64,
    pub updated_at: i64,

    // Enhanced MtM fields
    pub stock_value: f64,
    pub option_value: f64,
    pub unrealized_pnl: f64,
    pub realized_pnl: f64,
    pub portfolio_greeks: PortfolioGreeks,
    pub position_greeks: Vec<PositionGreeks>,
}

// Re-export from mtm module for convenience
use super::mtm::{PortfolioGreeks, PositionGreeks};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trade {
    pub id: String,
    pub symbol: String,
    pub side: OrderSide,
    pub quantity: i64,
    pub price: f64,
    pub timestamp: i64,
    pub order_id: String,
    pub commission: f64,
    pub net_amount: f64,        // Price * quantity +/- commission
    pub instrument_type: InstrumentType,
    pub option_details: Option<OptionDetails>,
    pub leg_number: Option<i32>,
    pub assignment_id: Option<String>, // For option assignments
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketData {
    pub symbol: String,
    pub last_price: f64,
    pub bid: Option<f64>,
    pub ask: Option<f64>,
    pub bid_size: Option<i64>,
    pub ask_size: Option<i64>,
    pub volume: Option<i64>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokerConfig {
    // Stock commissions
    pub commission_per_share: f64,
    pub commission_per_trade: f64,
    pub min_commission: f64,
    pub max_commission: f64,

    // Options commissions
    pub option_commission_per_contract: f64,
    pub option_commission_per_trade: f64,
    pub option_min_commission: f64,
    pub option_max_commission: f64,
    pub assignment_fee: f64,
    pub exercise_fee: f64,

    // Market simulation
    pub slippage_bps: f64,          // Slippage in basis points
    pub partial_fill_probability: f64, // Probability of partial fills
    pub min_partial_fill_ratio: f64,   // Minimum ratio for partial fills

    // Options expiration rules
    pub auto_close_dte_threshold: i32,  // Auto-close options at this DTE
    pub itm_assignment_threshold: f64,  // ITM threshold for assignment (e.g., 0.01 = $0.01)
}

impl Default for BrokerConfig {
    fn default() -> Self {
        Self {
            // Stock commissions (typical discount broker)
            commission_per_share: 0.005,    // $0.005 per share
            commission_per_trade: 0.0,      // No per-trade fee
            min_commission: 1.0,            // $1 minimum
            max_commission: 10.0,           // $10 maximum

            // Options commissions (typical rates)
            option_commission_per_contract: 0.65,  // $0.65 per contract
            option_commission_per_trade: 0.0,      // No base fee
            option_min_commission: 1.0,            // $1 minimum
            option_max_commission: 50.0,           // $50 maximum
            assignment_fee: 19.99,                 // $19.99 assignment fee
            exercise_fee: 19.99,                   // $19.99 exercise fee

            // Market simulation
            slippage_bps: 5.0,              // 5 basis points slippage
            partial_fill_probability: 0.1,  // 10% chance of partial fill
            min_partial_fill_ratio: 0.3,    // At least 30% fill

            // Options expiration rules
            auto_close_dte_threshold: 0,    // Auto-close on expiry day
            itm_assignment_threshold: 0.01, // $0.01 ITM triggers assignment
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeExecution {
    pub order_id: String,
    pub fills: Vec<Fill>,
    pub status: OrderStatus,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionAssignment {
    pub id: String,
    pub symbol: String,
    pub option_type: OptionType,
    pub strike: f64,
    pub expiry: String,
    pub quantity: i64,           // Number of contracts assigned
    pub underlying_quantity: i64, // Shares received/delivered (quantity * multiplier)
    pub assignment_price: f64,   // Strike price
    pub underlying_price: f64,   // Market price at assignment
    pub timestamp: i64,
    pub assignment_fee: f64,
    pub net_cash_impact: f64,    // Cash impact from assignment
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionExpiration {
    pub id: String,
    pub symbol: String,
    pub option_type: OptionType,
    pub strike: f64,
    pub expiry: String,
    pub quantity: i64,
    pub underlying_price: f64,   // Price at expiration
    pub intrinsic_value: f64,    // Max(0, underlying - strike) for calls
    pub timestamp: i64,
    pub action: ExpirationAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ExpirationAction {
    Expired,      // Expired worthless
    AutoExercised, // Auto-exercised ITM
    AutoClosed,   // Auto-closed before expiry
}

// Helper functions for order validation
impl OrderRequest {
    pub fn validate(&self) -> Result<(), String> {
        if self.symbol.is_empty() {
            return Err("Symbol cannot be empty".to_string());
        }
        
        if self.quantity <= 0 {
            return Err("Quantity must be positive".to_string());
        }
        
        match self.order_type {
            OrderType::Limit => {
                if self.price.is_none() {
                    return Err("Limit orders require a price".to_string());
                }
                if let Some(price) = self.price {
                    if price <= 0.0 {
                        return Err("Price must be positive".to_string());
                    }
                }
            }
            OrderType::Stop => {
                if self.stop_price.is_none() {
                    return Err("Stop orders require a stop price".to_string());
                }
                if let Some(stop_price) = self.stop_price {
                    if stop_price <= 0.0 {
                        return Err("Stop price must be positive".to_string());
                    }
                }
            }
            OrderType::StopLimit => {
                if self.price.is_none() || self.stop_price.is_none() {
                    return Err("Stop limit orders require both price and stop price".to_string());
                }
                if let (Some(price), Some(stop_price)) = (self.price, self.stop_price) {
                    if price <= 0.0 || stop_price <= 0.0 {
                        return Err("Price and stop price must be positive".to_string());
                    }
                }
            }
            OrderType::Market => {
                // Market orders don't need price validation
            }
        }
        
        Ok(())
    }
}

impl Order {
    pub fn new(request: OrderRequest, id: String) -> Self {
        let now = chrono::Utc::now().timestamp();

        Self {
            id,
            client_order_id: request.client_order_id,
            symbol: request.symbol,
            side: request.side,
            order_type: request.order_type,
            quantity: request.quantity,
            filled_quantity: 0,
            remaining_quantity: request.quantity,
            price: request.price,
            stop_price: request.stop_price,
            time_in_force: request.time_in_force,
            status: OrderStatus::Pending,
            created_at: now,
            updated_at: now,
            fills: Vec::new(),
            instrument_type: request.instrument_type,
            option_details: request.option_details,
        }
    }
    
    pub fn is_complete(&self) -> bool {
        matches!(self.status, OrderStatus::Filled | OrderStatus::Canceled | OrderStatus::Rejected | OrderStatus::Expired)
    }
    
    pub fn can_fill(&self) -> bool {
        matches!(self.status, OrderStatus::Pending | OrderStatus::PartiallyFilled) && self.remaining_quantity > 0
    }
    
    pub fn add_fill(&mut self, fill: Fill) {
        self.filled_quantity += fill.quantity;
        self.remaining_quantity = self.quantity - self.filled_quantity;
        self.fills.push(fill);
        self.updated_at = chrono::Utc::now().timestamp();
        
        if self.remaining_quantity == 0 {
            self.status = OrderStatus::Filled;
        } else if self.filled_quantity > 0 {
            self.status = OrderStatus::PartiallyFilled;
        }
    }
}

impl Position {
    pub fn new(symbol: String) -> Self {
        Self {
            symbol,
            quantity: 0,
            avg_cost: 0.0,
            market_value: 0.0,
            unrealized_pnl: 0.0,
            realized_pnl: 0.0,
            last_price: 0.0,
            updated_at: chrono::Utc::now().timestamp(),
        }
    }
    
    pub fn update_market_data(&mut self, price: f64) {
        self.last_price = price;
        self.market_value = self.quantity as f64 * price;
        self.unrealized_pnl = self.market_value - (self.quantity as f64 * self.avg_cost);
        self.updated_at = chrono::Utc::now().timestamp();
    }
    
    pub fn apply_fill(&mut self, fill: &Fill) -> f64 {
        let old_quantity = self.quantity;
        let fill_quantity = match fill.side {
            OrderSide::Buy => fill.quantity,
            OrderSide::Sell => -fill.quantity,
        };
        
        let new_quantity = old_quantity + fill_quantity;
        let mut realized_pnl = 0.0;
        
        if old_quantity == 0 {
            // Opening position
            self.quantity = new_quantity;
            self.avg_cost = fill.price;
        } else if (old_quantity > 0 && fill_quantity > 0) || (old_quantity < 0 && fill_quantity < 0) {
            // Adding to position
            let total_cost = (old_quantity as f64 * self.avg_cost) + (fill_quantity as f64 * fill.price);
            self.quantity = new_quantity;
            self.avg_cost = total_cost / new_quantity as f64;
        } else {
            // Reducing or closing position
            let closed_quantity = fill_quantity.abs().min(old_quantity.abs());
            realized_pnl = closed_quantity as f64 * (fill.price - self.avg_cost) * if old_quantity > 0 { 1.0 } else { -1.0 };
            self.quantity = new_quantity;
            self.realized_pnl += realized_pnl;
            
            if self.quantity == 0 {
                self.avg_cost = 0.0;
            }
        }
        
        self.update_market_data(fill.price);
        realized_pnl
    }
}
