// src-tauri/src/engine/risk.rs
// Risk management engine with circuit breakers and position limits

use super::types::*;
use super::mtm::PortfolioGreeks;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskLimits {
    // Daily limits
    pub max_daily_loss: f64,           // Maximum daily loss allowed
    pub max_daily_trades: i32,         // Maximum trades per day
    pub max_daily_volume: f64,         // Maximum dollar volume per day
    
    // Per-trade limits
    pub max_trade_size: f64,           // Maximum single trade size
    pub max_position_size: f64,        // Maximum position size per symbol
    pub max_portfolio_concentration: f64, // Max % of portfolio in single position
    
    // Options-specific limits
    pub max_option_delta: f64,         // Maximum portfolio delta
    pub max_option_gamma: f64,         // Maximum portfolio gamma
    pub max_option_vega: f64,          // Maximum portfolio vega
    pub max_contracts_per_trade: i64,  // Maximum option contracts per trade
    
    // Circuit breaker settings
    pub circuit_breaker_loss_pct: f64, // Trigger circuit breaker at this loss %
    pub circuit_breaker_duration_minutes: i64, // How long to halt trading
    pub max_consecutive_losses: i32,    // Max consecutive losing trades
}

impl Default for RiskLimits {
    fn default() -> Self {
        Self {
            // Daily limits (for $100k account)
            max_daily_loss: 5000.0,        // $5k max daily loss
            max_daily_trades: 50,           // 50 trades per day max
            max_daily_volume: 50000.0,      // $50k daily volume max
            
            // Per-trade limits
            max_trade_size: 10000.0,        // $10k max single trade
            max_position_size: 20000.0,     // $20k max position size
            max_portfolio_concentration: 0.25, // 25% max concentration
            
            // Options limits
            max_option_delta: 500.0,        // 500 delta max
            max_option_gamma: 100.0,        // 100 gamma max
            max_option_vega: 1000.0,        // $1000 vega max
            max_contracts_per_trade: 50,    // 50 contracts max per trade
            
            // Circuit breakers
            circuit_breaker_loss_pct: 0.10, // 10% portfolio loss
            circuit_breaker_duration_minutes: 60, // 1 hour halt
            max_consecutive_losses: 5,       // 5 consecutive losses
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskMetrics {
    pub daily_pnl: f64,
    pub daily_trades: i32,
    pub daily_volume: f64,
    pub consecutive_losses: i32,
    pub largest_position_pct: f64,
    pub portfolio_delta: f64,
    pub portfolio_gamma: f64,
    pub portfolio_vega: f64,
    pub circuit_breaker_active: bool,
    pub circuit_breaker_until: Option<i64>,
    pub last_updated: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RiskViolationType {
    DailyLossLimit,
    DailyTradeLimit,
    DailyVolumeLimit,
    TradeSizeLimit,
    PositionSizeLimit,
    ConcentrationLimit,
    DeltaLimit,
    GammaLimit,
    VegaLimit,
    ContractLimit,
    CircuitBreaker,
    ConsecutiveLossLimit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskViolation {
    pub violation_type: RiskViolationType,
    pub message: String,
    pub current_value: f64,
    pub limit_value: f64,
    pub timestamp: i64,
    pub severity: RiskSeverity,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RiskSeverity {
    Warning,  // Approaching limit
    Error,    // Limit breached
    Critical, // Circuit breaker triggered
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskCheckResult {
    pub allowed: bool,
    pub violations: Vec<RiskViolation>,
    pub warnings: Vec<RiskViolation>,
}

#[derive(Debug, Clone)]
pub struct RiskEngine {
    pub limits: RiskLimits,
    pub metrics: RiskMetrics,
    pub daily_trades: Vec<String>, // Trade IDs for today
    pub recent_trades: Vec<(i64, f64)>, // (timestamp, pnl) for consecutive loss tracking
}

impl Default for RiskEngine {
    fn default() -> Self {
        Self::new(RiskLimits::default())
    }
}

impl RiskEngine {
    pub fn new(limits: RiskLimits) -> Self {
        Self {
            limits,
            metrics: RiskMetrics {
                daily_pnl: 0.0,
                daily_trades: 0,
                daily_volume: 0.0,
                consecutive_losses: 0,
                largest_position_pct: 0.0,
                portfolio_delta: 0.0,
                portfolio_gamma: 0.0,
                portfolio_vega: 0.0,
                circuit_breaker_active: false,
                circuit_breaker_until: None,
                last_updated: Utc::now().timestamp(),
            },
            daily_trades: Vec::new(),
            recent_trades: Vec::new(),
        }
    }

    pub fn check_order_risk(
        &mut self,
        order: &OrderRequest,
        portfolio_equity: f64,
        positions: &HashMap<String, Position>,
        portfolio_greeks: Option<&PortfolioGreeks>,
    ) -> RiskCheckResult {
        let mut violations = Vec::new();
        let mut warnings = Vec::new();

        // Check if circuit breaker is active
        if self.is_circuit_breaker_active() {
            violations.push(RiskViolation {
                violation_type: RiskViolationType::CircuitBreaker,
                message: "Trading halted due to circuit breaker".to_string(),
                current_value: 0.0,
                limit_value: 0.0,
                timestamp: Utc::now().timestamp(),
                severity: RiskSeverity::Critical,
            });
            return RiskCheckResult {
                allowed: false,
                violations,
                warnings,
            };
        }

        // Calculate estimated trade value
        let estimated_price = order.price.unwrap_or(100.0); // Default price for market orders
        let trade_value = estimated_price * order.quantity as f64;

        // Check trade size limit
        if trade_value > self.limits.max_trade_size {
            violations.push(RiskViolation {
                violation_type: RiskViolationType::TradeSizeLimit,
                message: format!("Trade size ${:.2} exceeds limit ${:.2}", trade_value, self.limits.max_trade_size),
                current_value: trade_value,
                limit_value: self.limits.max_trade_size,
                timestamp: Utc::now().timestamp(),
                severity: RiskSeverity::Error,
            });
        }

        // Check daily trade limit
        if self.metrics.daily_trades >= self.limits.max_daily_trades {
            violations.push(RiskViolation {
                violation_type: RiskViolationType::DailyTradeLimit,
                message: format!("Daily trade limit {} reached", self.limits.max_daily_trades),
                current_value: self.metrics.daily_trades as f64,
                limit_value: self.limits.max_daily_trades as f64,
                timestamp: Utc::now().timestamp(),
                severity: RiskSeverity::Error,
            });
        }

        // Check daily volume limit
        let new_daily_volume = self.metrics.daily_volume + trade_value;
        if new_daily_volume > self.limits.max_daily_volume {
            violations.push(RiskViolation {
                violation_type: RiskViolationType::DailyVolumeLimit,
                message: format!("Daily volume ${:.2} would exceed limit ${:.2}", new_daily_volume, self.limits.max_daily_volume),
                current_value: new_daily_volume,
                limit_value: self.limits.max_daily_volume,
                timestamp: Utc::now().timestamp(),
                severity: RiskSeverity::Error,
            });
        }

        // Check position size limit
        if let Some(position) = positions.get(&order.symbol) {
            let new_position_value = (position.quantity as f64 + 
                match order.side {
                    OrderSide::Buy => order.quantity as f64,
                    OrderSide::Sell => -(order.quantity as f64),
                }) * estimated_price;

            if new_position_value.abs() > self.limits.max_position_size {
                violations.push(RiskViolation {
                    violation_type: RiskViolationType::PositionSizeLimit,
                    message: format!("Position size ${:.2} would exceed limit ${:.2}", new_position_value.abs(), self.limits.max_position_size),
                    current_value: new_position_value.abs(),
                    limit_value: self.limits.max_position_size,
                    timestamp: Utc::now().timestamp(),
                    severity: RiskSeverity::Error,
                });
            }

            // Check concentration limit
            let concentration = new_position_value.abs() / portfolio_equity;
            if concentration > self.limits.max_portfolio_concentration {
                violations.push(RiskViolation {
                    violation_type: RiskViolationType::ConcentrationLimit,
                    message: format!("Position concentration {:.1}% would exceed limit {:.1}%", 
                        concentration * 100.0, self.limits.max_portfolio_concentration * 100.0),
                    current_value: concentration,
                    limit_value: self.limits.max_portfolio_concentration,
                    timestamp: Utc::now().timestamp(),
                    severity: RiskSeverity::Error,
                });
            }
        }

        // Check options-specific limits
        if order.instrument_type == InstrumentType::Option {
            // Check contract limit
            if order.quantity > self.limits.max_contracts_per_trade {
                violations.push(RiskViolation {
                    violation_type: RiskViolationType::ContractLimit,
                    message: format!("Contract quantity {} exceeds limit {}", order.quantity, self.limits.max_contracts_per_trade),
                    current_value: order.quantity as f64,
                    limit_value: self.limits.max_contracts_per_trade as f64,
                    timestamp: Utc::now().timestamp(),
                    severity: RiskSeverity::Error,
                });
            }

            // Check Greeks limits if available
            if let Some(greeks) = portfolio_greeks {
                if greeks.delta.abs() > self.limits.max_option_delta {
                    violations.push(RiskViolation {
                        violation_type: RiskViolationType::DeltaLimit,
                        message: format!("Portfolio delta {:.2} exceeds limit {:.2}", greeks.delta.abs(), self.limits.max_option_delta),
                        current_value: greeks.delta.abs(),
                        limit_value: self.limits.max_option_delta,
                        timestamp: Utc::now().timestamp(),
                        severity: RiskSeverity::Error,
                    });
                }

                if greeks.gamma.abs() > self.limits.max_option_gamma {
                    violations.push(RiskViolation {
                        violation_type: RiskViolationType::GammaLimit,
                        message: format!("Portfolio gamma {:.2} exceeds limit {:.2}", greeks.gamma.abs(), self.limits.max_option_gamma),
                        current_value: greeks.gamma.abs(),
                        limit_value: self.limits.max_option_gamma,
                        timestamp: Utc::now().timestamp(),
                        severity: RiskSeverity::Error,
                    });
                }

                if greeks.vega.abs() > self.limits.max_option_vega {
                    violations.push(RiskViolation {
                        violation_type: RiskViolationType::VegaLimit,
                        message: format!("Portfolio vega {:.2} exceeds limit {:.2}", greeks.vega.abs(), self.limits.max_option_vega),
                        current_value: greeks.vega.abs(),
                        limit_value: self.limits.max_option_vega,
                        timestamp: Utc::now().timestamp(),
                        severity: RiskSeverity::Error,
                    });
                }
            }
        }

        // Check daily loss limit
        if self.metrics.daily_pnl < -self.limits.max_daily_loss {
            violations.push(RiskViolation {
                violation_type: RiskViolationType::DailyLossLimit,
                message: format!("Daily loss ${:.2} exceeds limit ${:.2}", -self.metrics.daily_pnl, self.limits.max_daily_loss),
                current_value: -self.metrics.daily_pnl,
                limit_value: self.limits.max_daily_loss,
                timestamp: Utc::now().timestamp(),
                severity: RiskSeverity::Error,
            });
        }

        // Check consecutive losses
        if self.metrics.consecutive_losses >= self.limits.max_consecutive_losses {
            violations.push(RiskViolation {
                violation_type: RiskViolationType::ConsecutiveLossLimit,
                message: format!("Consecutive losses {} reached limit {}", self.metrics.consecutive_losses, self.limits.max_consecutive_losses),
                current_value: self.metrics.consecutive_losses as f64,
                limit_value: self.limits.max_consecutive_losses as f64,
                timestamp: Utc::now().timestamp(),
                severity: RiskSeverity::Error,
            });
        }

        // Generate warnings for approaching limits (80% threshold)
        if trade_value > self.limits.max_trade_size * 0.8 {
            warnings.push(RiskViolation {
                violation_type: RiskViolationType::TradeSizeLimit,
                message: format!("Trade size approaching limit: ${:.2} / ${:.2}", trade_value, self.limits.max_trade_size),
                current_value: trade_value,
                limit_value: self.limits.max_trade_size,
                timestamp: Utc::now().timestamp(),
                severity: RiskSeverity::Warning,
            });
        }

        RiskCheckResult {
            allowed: violations.is_empty(),
            violations,
            warnings,
        }
    }

    pub fn update_after_trade(&mut self, trade: &Trade, current_pnl: f64) {
        // Update daily metrics
        self.metrics.daily_trades += 1;
        self.metrics.daily_volume += trade.net_amount.abs();
        self.daily_trades.push(trade.id.clone());

        // Track consecutive losses
        self.recent_trades.push((trade.timestamp, current_pnl));
        self.update_consecutive_losses();

        // Check for circuit breaker trigger
        let portfolio_loss_pct = current_pnl / 100000.0; // Assuming $100k initial
        if portfolio_loss_pct < -self.limits.circuit_breaker_loss_pct {
            self.trigger_circuit_breaker();
        }

        self.metrics.last_updated = Utc::now().timestamp();
    }

    pub fn update_daily_metrics(&mut self, daily_pnl: f64, portfolio_greeks: Option<&PortfolioGreeks>) {
        self.metrics.daily_pnl = daily_pnl;
        
        if let Some(greeks) = portfolio_greeks {
            self.metrics.portfolio_delta = greeks.delta;
            self.metrics.portfolio_gamma = greeks.gamma;
            self.metrics.portfolio_vega = greeks.vega;
        }

        // Reset daily counters if it's a new day
        let today = Utc::now().date_naive();
        let last_update_date = DateTime::from_timestamp(self.metrics.last_updated, 0)
            .map(|dt| dt.date_naive())
            .unwrap_or(today);

        if today != last_update_date {
            self.reset_daily_counters();
        }

        self.metrics.last_updated = Utc::now().timestamp();
    }

    fn is_circuit_breaker_active(&self) -> bool {
        if !self.metrics.circuit_breaker_active {
            return false;
        }

        if let Some(until) = self.metrics.circuit_breaker_until {
            Utc::now().timestamp() < until
        } else {
            false
        }
    }

    fn trigger_circuit_breaker(&mut self) {
        self.metrics.circuit_breaker_active = true;
        self.metrics.circuit_breaker_until = Some(
            Utc::now().timestamp() + (self.limits.circuit_breaker_duration_minutes * 60)
        );
    }

    fn update_consecutive_losses(&mut self) {
        // Keep only recent trades (last 24 hours)
        let cutoff = Utc::now().timestamp() - 86400;
        self.recent_trades.retain(|(timestamp, _)| *timestamp > cutoff);

        // Count consecutive losses from the end
        let mut consecutive = 0;
        for (_, pnl) in self.recent_trades.iter().rev() {
            if *pnl < 0.0 {
                consecutive += 1;
            } else {
                break;
            }
        }

        self.metrics.consecutive_losses = consecutive;
    }

    fn reset_daily_counters(&mut self) {
        self.metrics.daily_trades = 0;
        self.metrics.daily_volume = 0.0;
        self.daily_trades.clear();
        self.metrics.circuit_breaker_active = false;
        self.metrics.circuit_breaker_until = None;
    }

    pub fn get_risk_status(&self) -> RiskMetrics {
        self.metrics.clone()
    }

    pub fn get_violations_summary(&self) -> Vec<String> {
        let mut summary = Vec::new();

        if self.is_circuit_breaker_active() {
            summary.push("🔴 CIRCUIT BREAKER ACTIVE - Trading halted".to_string());
        }

        if self.metrics.daily_pnl < -self.limits.max_daily_loss {
            summary.push(format!("🔴 Daily loss limit breached: ${:.2}", -self.metrics.daily_pnl));
        }

        if self.metrics.daily_trades >= self.limits.max_daily_trades {
            summary.push(format!("🔴 Daily trade limit reached: {}", self.metrics.daily_trades));
        }

        if self.metrics.consecutive_losses >= self.limits.max_consecutive_losses {
            summary.push(format!("🔴 Consecutive loss limit: {}", self.metrics.consecutive_losses));
        }

        summary
    }
}
