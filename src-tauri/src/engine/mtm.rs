// src-tauri/src/engine/mtm.rs
// Mark-to-market engine with Greeks calculation

use super::types::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc, NaiveDate};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioGreeks {
    pub delta: f64,      // Portfolio delta (price sensitivity)
    pub gamma: f64,      // Portfolio gamma (delta sensitivity)
    pub theta: f64,      // Portfolio theta (time decay per day)
    pub vega: f64,       // Portfolio vega (volatility sensitivity)
    pub rho: f64,        // Portfolio rho (interest rate sensitivity)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionGreeks {
    pub symbol: String,
    pub delta: f64,
    pub gamma: f64,
    pub theta: f64,
    pub vega: f64,
    pub rho: f64,
    pub quantity: i64,
    pub underlying_price: f64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MtMSnapshot {
    pub timestamp: i64,
    pub total_equity: f64,
    pub cash: f64,
    pub stock_value: f64,
    pub option_value: f64,
    pub unrealized_pnl: f64,
    pub realized_pnl: f64,
    pub day_pnl: f64,
    pub portfolio_greeks: PortfolioGreeks,
    pub position_greeks: Vec<PositionGreeks>,
}

#[derive(Debug, Clone)]
pub struct MtMEngine {
    pub risk_free_rate: f64,
    pub default_volatility: f64,
    pub volatility_cache: HashMap<String, f64>,
}

impl Default for MtMEngine {
    fn default() -> Self {
        Self {
            risk_free_rate: 0.05,      // 5% risk-free rate
            default_volatility: 0.25,  // 25% default volatility
            volatility_cache: HashMap::new(),
        }
    }
}

impl MtMEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_risk_free_rate(mut self, rate: f64) -> Self {
        self.risk_free_rate = rate;
        self
    }

    pub fn calculate_portfolio_mtm(
        &self,
        positions: &HashMap<String, Position>,
        market_data: &HashMap<String, MarketData>,
        day_start_equity: f64,
        cash: f64,
    ) -> MtMSnapshot {
        let timestamp = Utc::now().timestamp();
        let mut stock_value = 0.0;
        let mut option_value = 0.0;
        let mut unrealized_pnl = 0.0;
        let mut realized_pnl = 0.0;
        let mut position_greeks = Vec::new();
        
        let mut portfolio_delta = 0.0;
        let mut portfolio_gamma = 0.0;
        let mut portfolio_theta = 0.0;
        let mut portfolio_vega = 0.0;
        let mut portfolio_rho = 0.0;

        for (symbol, position) in positions {
            let market_price = market_data
                .get(symbol)
                .map(|data| self.get_mid_price(data))
                .unwrap_or(position.last_price);

            // Update position values
            let position_value = position.quantity as f64 * market_price;
            let position_unrealized = position_value - (position.quantity as f64 * position.avg_cost);
            
            unrealized_pnl += position_unrealized;
            realized_pnl += position.realized_pnl;

            // Determine if this is a stock or option position
            if self.is_option_symbol(symbol) {
                option_value += position_value;
                
                // Calculate Greeks for option positions
                if let Some(option_details) = self.parse_option_symbol(symbol) {
                    let greeks = self.calculate_option_greeks(
                        &option_details,
                        market_price,
                        position.quantity,
                    );
                    
                    portfolio_delta += greeks.delta;
                    portfolio_gamma += greeks.gamma;
                    portfolio_theta += greeks.theta;
                    portfolio_vega += greeks.vega;
                    portfolio_rho += greeks.rho;
                    
                    position_greeks.push(greeks);
                }
            } else {
                stock_value += position_value;
                
                // Stock positions have delta = quantity, other Greeks = 0
                portfolio_delta += position.quantity as f64;
                
                position_greeks.push(PositionGreeks {
                    symbol: symbol.clone(),
                    delta: position.quantity as f64,
                    gamma: 0.0,
                    theta: 0.0,
                    vega: 0.0,
                    rho: 0.0,
                    quantity: position.quantity,
                    underlying_price: market_price,
                    updated_at: timestamp,
                });
            }
        }

        let total_equity = cash + stock_value + option_value;
        let day_pnl = total_equity - day_start_equity;

        MtMSnapshot {
            timestamp,
            total_equity,
            cash,
            stock_value,
            option_value,
            unrealized_pnl,
            realized_pnl,
            day_pnl,
            portfolio_greeks: PortfolioGreeks {
                delta: portfolio_delta,
                gamma: portfolio_gamma,
                theta: portfolio_theta,
                vega: portfolio_vega,
                rho: portfolio_rho,
            },
            position_greeks,
        }
    }

    fn get_mid_price(&self, market_data: &MarketData) -> f64 {
        match (market_data.bid, market_data.ask) {
            (Some(bid), Some(ask)) => (bid + ask) / 2.0,
            (Some(bid), None) => bid,
            (None, Some(ask)) => ask,
            (None, None) => market_data.last_price,
        }
    }

    fn is_option_symbol(&self, symbol: &str) -> bool {
        // Simple heuristic: options symbols typically contain expiry dates
        // Format: AAPL240315C00150000 (AAPL, March 15 2024, Call, $150 strike)
        symbol.len() > 10 && (symbol.contains('C') || symbol.contains('P'))
    }

    fn parse_option_symbol(&self, symbol: &str) -> Option<OptionDetails> {
        // Parse option symbol format: AAPL240315C00150000
        // This is a simplified parser - in production you'd use a more robust parser
        if symbol.len() < 15 {
            return None;
        }

        // Find the underlying symbol (everything before the date)
        let mut underlying_end = 0;
        for (i, c) in symbol.chars().enumerate() {
            if c.is_ascii_digit() {
                underlying_end = i;
                break;
            }
        }

        if underlying_end == 0 {
            return None;
        }

        let underlying = symbol[..underlying_end].to_string();
        let rest = &symbol[underlying_end..];

        if rest.len() < 15 {
            return None;
        }

        // Parse date (YYMMDD format)
        let year_str = &rest[0..2];
        let month_str = &rest[2..4];
        let day_str = &rest[4..6];

        // Parse option type (C or P)
        let option_type_char = rest.chars().nth(6)?;
        let option_type = match option_type_char {
            'C' => OptionType::Call,
            'P' => OptionType::Put,
            _ => return None,
        };

        // Parse strike price (8 digits, last 3 are decimals)
        let strike_str = &rest[7..15];
        let strike = strike_str.parse::<i64>().ok()? as f64 / 1000.0;

        // Format expiry date as MM/DD/YYYY
        let year = format!("20{}", year_str);
        let expiry = format!("{}/{}/{}", month_str, day_str, year);

        Some(OptionDetails {
            underlying,
            option_type,
            strike,
            expiry,
            multiplier: 100,
        })
    }

    fn calculate_option_greeks(
        &self,
        option_details: &OptionDetails,
        underlying_price: f64,
        quantity: i64,
    ) -> PositionGreeks {
        // Get time to expiration in years
        let tte = self.calculate_time_to_expiry(&option_details.expiry);
        
        // Get volatility (use cached or default)
        let volatility = self.volatility_cache
            .get(&option_details.underlying)
            .copied()
            .unwrap_or(self.default_volatility);

        // Calculate Black-Scholes Greeks
        let greeks = self.black_scholes_greeks(
            underlying_price,
            option_details.strike,
            tte,
            self.risk_free_rate,
            volatility,
            &option_details.option_type,
        );

        // Scale by position size
        let position_multiplier = quantity as f64 * option_details.multiplier as f64;

        PositionGreeks {
            symbol: format!("{}_option", option_details.underlying), // Simplified
            delta: greeks.0 * position_multiplier,
            gamma: greeks.1 * position_multiplier,
            theta: greeks.2 * position_multiplier,
            vega: greeks.3 * position_multiplier,
            rho: greeks.4 * position_multiplier,
            quantity,
            underlying_price,
            updated_at: Utc::now().timestamp(),
        }
    }

    fn calculate_time_to_expiry(&self, expiry: &str) -> f64 {
        // Parse MM/DD/YYYY format
        let parts: Vec<&str> = expiry.split('/').collect();
        if parts.len() != 3 {
            return 0.0;
        }

        let month = parts[0].parse::<u32>().unwrap_or(1);
        let day = parts[1].parse::<u32>().unwrap_or(1);
        let year = parts[2].parse::<i32>().unwrap_or(2024);

        let expiry_date = match NaiveDate::from_ymd_opt(year, month, day) {
            Some(date) => date,
            None => return 0.0,
        };

        let now = Utc::now().date_naive();
        let days_to_expiry = (expiry_date - now).num_days();
        
        // Convert to years (assuming 365 days per year)
        (days_to_expiry as f64 / 365.0).max(0.0)
    }

    fn black_scholes_greeks(
        &self,
        s: f64,    // Underlying price
        k: f64,    // Strike price
        t: f64,    // Time to expiry (years)
        r: f64,    // Risk-free rate
        v: f64,    // Volatility
        option_type: &OptionType,
    ) -> (f64, f64, f64, f64, f64) {
        if t <= 0.0 {
            return (0.0, 0.0, 0.0, 0.0, 0.0);
        }

        let sqrt_t = t.sqrt();
        let d1 = (s.ln() - k.ln() + (r + 0.5 * v * v) * t) / (v * sqrt_t);
        let d2 = d1 - v * sqrt_t;

        let n_d1 = self.normal_cdf(d1);
        let n_d2 = self.normal_cdf(d2);
        let n_prime_d1 = self.normal_pdf(d1);

        let (delta, rho) = match option_type {
            OptionType::Call => {
                let delta = n_d1;
                let rho = k * t * (-r * t).exp() * n_d2;
                (delta, rho)
            }
            OptionType::Put => {
                let delta = n_d1 - 1.0;
                let rho = -k * t * (-r * t).exp() * (1.0 - n_d2);
                (delta, rho)
            }
        };

        let gamma = n_prime_d1 / (s * v * sqrt_t);
        let theta = -(s * n_prime_d1 * v) / (2.0 * sqrt_t) - r * k * (-r * t).exp() * 
            match option_type {
                OptionType::Call => n_d2,
                OptionType::Put => 1.0 - n_d2,
            };
        let vega = s * n_prime_d1 * sqrt_t;

        // Convert theta to per-day (divide by 365)
        let theta_per_day = theta / 365.0;

        // Convert vega to per 1% volatility change (divide by 100)
        let vega_per_percent = vega / 100.0;

        (delta, gamma, theta_per_day, vega_per_percent, rho)
    }

    fn normal_cdf(&self, x: f64) -> f64 {
        // Approximation of the cumulative distribution function for standard normal
        0.5 * (1.0 + self.erf(x / 2.0_f64.sqrt()))
    }

    fn normal_pdf(&self, x: f64) -> f64 {
        // Probability density function for standard normal
        (-0.5 * x * x).exp() / (2.0 * std::f64::consts::PI).sqrt()
    }

    fn erf(&self, x: f64) -> f64 {
        // Approximation of the error function
        let a1 = 0.254829592;
        let a2 = -0.284496736;
        let a3 = 1.421413741;
        let a4 = -1.453152027;
        let a5 = 1.061405429;
        let p = 0.3275911;

        let sign = if x < 0.0 { -1.0 } else { 1.0 };
        let x = x.abs();

        let t = 1.0 / (1.0 + p * x);
        let y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * (-x * x).exp();

        sign * y
    }

    pub fn update_volatility(&mut self, symbol: &str, volatility: f64) {
        self.volatility_cache.insert(symbol.to_string(), volatility);
    }

    pub fn get_volatility(&self, symbol: &str) -> f64 {
        self.volatility_cache
            .get(symbol)
            .copied()
            .unwrap_or(self.default_volatility)
    }
}
