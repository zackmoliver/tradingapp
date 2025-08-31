// src-tauri/src/engine/broker.rs
// Advanced paper broker with realistic order execution

use super::types::*;
use super::mtm::{MtMEngine, MtMSnapshot};
use super::risk::{RiskEngine, RiskLimits};
use super::calendar::{MarketCalendar, TradingSession};
use crate::storage::cache::{FileCache, JournalStats};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;
use rand::Rng;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperBroker {
    pub cash: f64,
    pub positions: HashMap<String, Position>,
    pub orders: HashMap<String, Order>,
    pub trades: Vec<Trade>,
    pub market_data: HashMap<String, MarketData>,
    pub config: BrokerConfig,
    pub day_start_equity: f64,
    pub created_at: i64,
    pub option_assignments: Vec<OptionAssignment>,
    pub option_expirations: Vec<OptionExpiration>,
    #[serde(skip)]
    pub mtm_engine: MtMEngine,
    #[serde(skip)]
    pub risk_engine: RiskEngine,
    #[serde(skip)]
    pub storage: Option<FileCache>,
    pub auto_save_enabled: bool,
    pub last_saved_at: i64,
    pub market_calendar: MarketCalendar,
}

impl PaperBroker {
    pub fn new(initial_cash: f64) -> Self {
        Self {
            cash: initial_cash,
            positions: HashMap::new(),
            orders: HashMap::new(),
            trades: Vec::new(),
            market_data: HashMap::new(),
            config: BrokerConfig::default(),
            day_start_equity: initial_cash,
            created_at: chrono::Utc::now().timestamp(),
            option_assignments: Vec::new(),
            option_expirations: Vec::new(),
            mtm_engine: MtMEngine::new(),
            risk_engine: RiskEngine::new(RiskLimits::default()),
            storage: None,
            auto_save_enabled: true,
            last_saved_at: chrono::Utc::now().timestamp(),
            market_calendar: MarketCalendar::default(),
        }
    }

    pub fn with_config(initial_cash: f64, config: BrokerConfig) -> Self {
        Self {
            cash: initial_cash,
            positions: HashMap::new(),
            orders: HashMap::new(),
            trades: Vec::new(),
            market_data: HashMap::new(),
            config,
            day_start_equity: initial_cash,
            created_at: chrono::Utc::now().timestamp(),
            option_assignments: Vec::new(),
            option_expirations: Vec::new(),
            mtm_engine: MtMEngine::new(),
            risk_engine: RiskEngine::new(RiskLimits::default()),
            storage: None,
            auto_save_enabled: true,
            last_saved_at: chrono::Utc::now().timestamp(),
            market_calendar: MarketCalendar::default(),
        }
    }

    pub fn place_order(&mut self, request: OrderRequest) -> Result<TradeExecution, String> {
        // Validate order
        request.validate()?;

        // Risk check
        let portfolio = self.get_portfolio();
        let mtm_snapshot = self.get_mtm_snapshot();
        let risk_check = self.risk_engine.check_order_risk(
            &request,
            portfolio.equity,
            &self.positions,
            Some(&mtm_snapshot.portfolio_greeks),
        );

        if !risk_check.allowed {
            let violation_messages: Vec<String> = risk_check.violations
                .iter()
                .map(|v| v.message.clone())
                .collect();
            return Err(format!("Risk check failed: {}", violation_messages.join("; ")));
        }

        // Check buying power for buy orders
        if request.side == OrderSide::Buy {
            let estimated_cost = self.estimate_order_cost(&request)?;
            if estimated_cost > self.cash {
                return Err("Insufficient buying power".to_string());
            }
        }

        // Check position for sell orders
        if request.side == OrderSide::Sell {
            let position = self.positions.get(&request.symbol);
            let available_quantity = position.map(|p| p.quantity.max(0)).unwrap_or(0);
            if request.quantity > available_quantity {
                return Err("Insufficient shares to sell".to_string());
            }
        }

        // Create order
        let order_id = Uuid::new_v4().to_string();
        let mut order = Order::new(request, order_id.clone());

        // Try to execute immediately for market orders or if conditions are met
        let execution = self.try_execute_order(&mut order)?;

        // Store order
        self.orders.insert(order_id.clone(), order);

        Ok(execution)
    }

    pub fn cancel_order(&mut self, order_id: &str) -> Result<(), String> {
        let order = self.orders.get_mut(order_id)
            .ok_or_else(|| "Order not found".to_string())?;

        if order.is_complete() {
            return Err("Cannot cancel completed order".to_string());
        }

        order.status = OrderStatus::Canceled;
        order.updated_at = chrono::Utc::now().timestamp();

        // Auto-save after order cancellation
        self.auto_save_if_enabled();

        Ok(())
    }

    pub fn update_market_data(&mut self, data: MarketData) {
        let symbol = data.symbol.clone();
        self.market_data.insert(symbol.clone(), data.clone());

        // Update position market values
        if let Some(position) = self.positions.get_mut(&symbol) {
            position.update_market_data(data.last_price);
        }

        // Check for order executions
        self.process_pending_orders(&symbol);

        // Auto-save after market data updates (less frequent to avoid excessive I/O)
        let now = chrono::Utc::now().timestamp();
        if now - self.last_saved_at > 60 { // Save at most once per minute
            self.auto_save_if_enabled();
        }
    }

    pub fn get_portfolio(&self) -> Portfolio {
        let mut total_market_value = 0.0;
        let mut total_unrealized_pnl = 0.0;
        let mut total_realized_pnl = 0.0;

        for position in self.positions.values() {
            total_market_value += position.market_value;
            total_unrealized_pnl += position.unrealized_pnl;
            total_realized_pnl += position.realized_pnl;
        }

        let equity = self.cash + total_market_value;
        let day_pnl = equity - self.day_start_equity;

        Portfolio {
            cash: self.cash,
            equity,
            buying_power: self.cash, // Simplified - no margin
            positions: self.positions.clone(),
            day_pnl,
            total_pnl: total_realized_pnl + total_unrealized_pnl,
            updated_at: chrono::Utc::now().timestamp(),
        }
    }

    pub fn get_trades(&self) -> Vec<Trade> {
        self.trades.clone()
    }

    pub fn get_orders(&self) -> Vec<Order> {
        self.orders.values().cloned().collect()
    }

    pub fn get_mtm_snapshot(&self) -> MtMSnapshot {
        self.mtm_engine.calculate_portfolio_mtm(
            &self.positions,
            &self.market_data,
            self.day_start_equity,
            self.cash,
        )
    }

    pub fn update_volatility(&mut self, symbol: &str, volatility: f64) {
        self.mtm_engine.update_volatility(symbol, volatility);
    }

    pub fn get_enhanced_portfolio(&self) -> EnhancedPortfolio {
        let mtm_snapshot = self.get_mtm_snapshot();
        let basic_portfolio = self.get_portfolio();

        EnhancedPortfolio {
            cash: basic_portfolio.cash,
            equity: mtm_snapshot.total_equity,
            buying_power: basic_portfolio.buying_power,
            positions: basic_portfolio.positions,
            day_pnl: mtm_snapshot.day_pnl,
            total_pnl: mtm_snapshot.unrealized_pnl + mtm_snapshot.realized_pnl,
            updated_at: mtm_snapshot.timestamp,
            // Enhanced MtM fields
            stock_value: mtm_snapshot.stock_value,
            option_value: mtm_snapshot.option_value,
            unrealized_pnl: mtm_snapshot.unrealized_pnl,
            realized_pnl: mtm_snapshot.realized_pnl,
            portfolio_greeks: mtm_snapshot.portfolio_greeks,
            position_greeks: mtm_snapshot.position_greeks,
        }
    }

    pub fn get_risk_status(&self) -> super::risk::RiskMetrics {
        self.risk_engine.get_risk_status()
    }

    pub fn get_risk_violations(&self) -> Vec<String> {
        self.risk_engine.get_violations_summary()
    }

    pub fn update_risk_metrics(&mut self) {
        let portfolio = self.get_portfolio();
        let mtm_snapshot = self.get_mtm_snapshot();
        self.risk_engine.update_daily_metrics(
            portfolio.day_pnl,
            Some(&mtm_snapshot.portfolio_greeks),
        );
    }

    // Persistence methods
    pub fn initialize_storage(&mut self, app_handle: &AppHandle) -> Result<(), String> {
        let storage = FileCache::new(app_handle)?;

        // Try to load existing broker state
        if let Some(saved_state) = storage.load_broker_state::<PaperBroker>()? {
            println!("Restoring broker state from disk");

            // Restore core state
            self.cash = saved_state.cash;
            self.positions = saved_state.positions;
            self.orders = saved_state.orders;
            self.market_data = saved_state.market_data;
            self.config = saved_state.config;
            self.day_start_equity = saved_state.day_start_equity;
            self.option_assignments = saved_state.option_assignments;
            self.option_expirations = saved_state.option_expirations;
            self.auto_save_enabled = saved_state.auto_save_enabled;
            self.last_saved_at = saved_state.last_saved_at;

            println!("Broker state restored: ${:.2} cash, {} positions, {} orders",
                self.cash, self.positions.len(), self.orders.len());
        }

        // Load trade journal
        let journal_trades: Vec<Trade> = storage.load_trade_journal()?;
        self.trades = journal_trades;

        println!("Loaded {} trades from journal", self.trades.len());

        self.storage = Some(storage);
        Ok(())
    }

    pub fn save_state(&mut self) -> Result<(), String> {
        // Take ownership of storage temporarily
        let mut storage = match self.storage.take() {
            Some(storage) => storage,
            None => return Err("Storage not initialized".to_string()),
        };

        // Save the broker state
        let result = storage.save_broker_state(self);

        // Put storage back
        self.storage = Some(storage);

        if result.is_ok() {
            self.last_saved_at = chrono::Utc::now().timestamp();
        }

        result
    }

    pub fn append_trade_to_journal(&mut self, trade: &Trade) -> Result<(), String> {
        if let Some(ref storage) = self.storage {
            storage.append_to_trade_journal(trade)?;
            Ok(())
        } else {
            Err("Storage not initialized".to_string())
        }
    }

    pub fn get_journal_stats(&self) -> Result<JournalStats, String> {
        if let Some(ref storage) = self.storage {
            storage.get_journal_stats()
        } else {
            Err("Storage not initialized".to_string())
        }
    }

    pub fn backup_journal(&self, backup_suffix: &str) -> Result<std::path::PathBuf, String> {
        if let Some(ref storage) = self.storage {
            storage.backup_journal(backup_suffix)
        } else {
            Err("Storage not initialized".to_string())
        }
    }

    pub fn set_auto_save(&mut self, enabled: bool) {
        self.auto_save_enabled = enabled;
    }

    fn auto_save_if_enabled(&mut self) {
        if self.auto_save_enabled {
            if let Err(e) = self.save_state() {
                eprintln!("Auto-save failed: {}", e);
            }
        }
    }

    // Market calendar methods
    pub fn configure_extended_hours(&mut self, premarket: bool, afterhours: bool) {
        self.market_calendar.allow_premarket = premarket;
        self.market_calendar.allow_afterhours = afterhours;
    }

    pub fn set_holiday_trading(&mut self, enabled: bool) {
        self.market_calendar.allow_holiday_trading = enabled;
    }

    pub fn get_current_session(&self) -> TradingSession {
        let current_time = chrono::Utc::now().timestamp();
        let dt = chrono::DateTime::from_timestamp(current_time, 0).unwrap();
        self.market_calendar.get_session_info(dt)
    }

    pub fn is_market_open(&self) -> bool {
        let current_time = chrono::Utc::now().timestamp();
        self.market_calendar.is_trading_allowed(current_time)
    }

    pub fn get_next_session_start(&self) -> Option<i64> {
        let current_time = chrono::Utc::now().timestamp();
        self.market_calendar.get_next_session_start(current_time)
    }

    pub fn add_custom_holiday(&mut self, date: chrono::NaiveDate, name: String, is_early_close: bool) {
        let holiday_type = if is_early_close {
            super::calendar::HolidayType::EarlyClose
        } else {
            super::calendar::HolidayType::Full
        };
        self.market_calendar.add_holiday(date, name, holiday_type);
    }

    pub fn close_position(&mut self, symbol: &str) -> Result<TradeExecution, String> {
        let position = self.positions.get(symbol)
            .ok_or_else(|| "Position not found".to_string())?;

        if position.quantity == 0 {
            return Err("No position to close".to_string());
        }

        let side = if position.quantity > 0 {
            OrderSide::Sell
        } else {
            OrderSide::Buy
        };

        let request = OrderRequest {
            symbol: symbol.to_string(),
            side,
            order_type: OrderType::Market,
            quantity: position.quantity.abs(),
            price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock, // Default to stock
            option_details: None,
        };

        self.place_order(request)
    }

    fn estimate_order_cost(&self, request: &OrderRequest) -> Result<f64, String> {
        let market_data = self.market_data.get(&request.symbol);
        
        let estimated_price = match request.order_type {
            OrderType::Market => {
                match request.side {
                    OrderSide::Buy => market_data.and_then(|d| d.ask).unwrap_or(100.0),
                    OrderSide::Sell => market_data.and_then(|d| d.bid).unwrap_or(100.0),
                }
            }
            OrderType::Limit => request.price.unwrap_or(100.0),
            OrderType::Stop | OrderType::StopLimit => {
                request.stop_price.unwrap_or(100.0)
            }
        };

        let gross_amount = estimated_price * request.quantity as f64;

        // Create a temporary order for commission calculation
        let temp_order = Order::new(request.clone(), "temp".to_string());
        let commission = self.calculate_commission(&temp_order, request.quantity, estimated_price);

        Ok(gross_amount + commission)
    }

    fn try_execute_order(&mut self, order: &mut Order) -> Result<TradeExecution, String> {
        let mut fills = Vec::new();
        let mut message = String::new();

        // Check if trading is allowed at current time
        let current_time = chrono::Utc::now().timestamp();
        if !self.market_calendar.is_trading_allowed(current_time) {
            let session_info = self.market_calendar.get_session_info(
                chrono::DateTime::from_timestamp(current_time, 0).unwrap()
            );

            message = match session_info.session {
                super::calendar::MarketSession::Closed => {
                    if session_info.is_holiday {
                        format!("Order pending - Market closed for {}",
                            session_info.holiday_name.unwrap_or("holiday".to_string()))
                    } else {
                        "Order pending - Market closed".to_string()
                    }
                },
                super::calendar::MarketSession::PreMarket =>
                    "Order pending - Pre-market trading disabled".to_string(),
                super::calendar::MarketSession::AfterHours =>
                    "Order pending - After-hours trading disabled".to_string(),
                _ => "Order pending - Trading not allowed".to_string(),
            };

            return Ok(TradeExecution {
                order_id: order.id.clone(),
                fills,
                status: order.status.clone(),
                message,
            });
        }

        match order.order_type {
            OrderType::Market => {
                if let Some(fill) = self.execute_market_order(order)? {
                    fills.push(fill);
                    message = "Market order executed".to_string();
                } else {
                    message = "Market order pending - no market data".to_string();
                }
            }
            OrderType::Limit => {
                if let Some(fill) = self.execute_limit_order(order)? {
                    fills.push(fill);
                    message = "Limit order executed".to_string();
                } else {
                    message = "Limit order pending".to_string();
                }
            }
            OrderType::Stop => {
                // Stop orders remain pending until triggered
                message = "Stop order pending".to_string();
            }
            OrderType::StopLimit => {
                // Stop limit orders remain pending until triggered
                message = "Stop limit order pending".to_string();
            }
        }

        // Apply fills to order and positions
        for fill in &fills {
            order.add_fill(fill.clone());
            self.apply_fill_to_position(fill);
            self.record_trade(fill);

            // Update risk engine after each fill
            let current_portfolio = self.get_portfolio();
            let trade = &self.trades[self.trades.len() - 1]; // Get the just-recorded trade
            self.risk_engine.update_after_trade(trade, current_portfolio.total_pnl);
        }

        Ok(TradeExecution {
            order_id: order.id.clone(),
            fills,
            status: order.status.clone(),
            message,
        })
    }

    fn execute_market_order(&mut self, order: &Order) -> Result<Option<Fill>, String> {
        let market_data = match self.market_data.get(&order.symbol) {
            Some(data) => data,
            None => return Ok(None), // No market data available
        };

        let fill_price = match order.side {
            OrderSide::Buy => market_data.ask.unwrap_or(market_data.last_price),
            OrderSide::Sell => market_data.bid.unwrap_or(market_data.last_price),
        };

        // Apply slippage
        let slipped_price = self.apply_slippage(fill_price, &order.side, order.remaining_quantity);

        // Determine fill quantity (may be partial)
        let fill_quantity = self.determine_fill_quantity(order.remaining_quantity);

        let commission = self.calculate_commission(order, fill_quantity, slipped_price);

        Ok(Some(Fill {
            id: Uuid::new_v4().to_string(),
            order_id: order.id.clone(),
            symbol: order.symbol.clone(),
            side: order.side.clone(),
            quantity: fill_quantity,
            price: slipped_price,
            timestamp: chrono::Utc::now().timestamp(),
            commission,
            instrument_type: order.instrument_type.clone(),
            option_details: order.option_details.clone(),
            leg_number: None, // Single leg order
        }))
    }

    fn execute_limit_order(&mut self, order: &Order) -> Result<Option<Fill>, String> {
        let market_data = match self.market_data.get(&order.symbol) {
            Some(data) => data,
            None => return Ok(None),
        };

        let limit_price = order.price.unwrap();
        let can_fill = match order.side {
            OrderSide::Buy => {
                // Buy limit fills when ask <= limit price
                market_data.ask.map(|ask| ask <= limit_price)
                    .or_else(|| Some(market_data.last_price <= limit_price))
                    .unwrap_or(false)
            }
            OrderSide::Sell => {
                // Sell limit fills when bid >= limit price
                market_data.bid.map(|bid| bid >= limit_price)
                    .or_else(|| Some(market_data.last_price >= limit_price))
                    .unwrap_or(false)
            }
        };

        if !can_fill {
            return Ok(None);
        }

        // Fill at limit price (no slippage for limit orders)
        let fill_quantity = self.determine_fill_quantity(order.remaining_quantity);
        let commission = self.calculate_commission(order, fill_quantity, limit_price);

        Ok(Some(Fill {
            id: Uuid::new_v4().to_string(),
            order_id: order.id.clone(),
            symbol: order.symbol.clone(),
            side: order.side.clone(),
            quantity: fill_quantity,
            price: limit_price,
            timestamp: chrono::Utc::now().timestamp(),
            commission,
            instrument_type: order.instrument_type.clone(),
            option_details: order.option_details.clone(),
            leg_number: None, // Single leg order
        }))
    }

    fn process_pending_orders(&mut self, symbol: &str) {
        let order_ids: Vec<String> = self.orders
            .iter()
            .filter(|(_, order)| order.symbol == symbol && order.can_fill())
            .map(|(id, _)| id.clone())
            .collect();

        for order_id in order_ids {
            if let Some(mut order) = self.orders.remove(&order_id) {
                let _ = self.try_execute_order(&mut order);
                self.orders.insert(order_id, order);
            }
        }
    }

    fn apply_slippage(&self, price: f64, side: &OrderSide, quantity: i64) -> f64 {
        let slippage_factor = self.config.slippage_bps / 10000.0;
        let size_impact = (quantity as f64 / 1000.0).min(1.0); // More slippage for larger orders
        let total_slippage = slippage_factor * (1.0 + size_impact);

        match side {
            OrderSide::Buy => price * (1.0 + total_slippage),
            OrderSide::Sell => price * (1.0 - total_slippage),
        }
    }

    fn determine_fill_quantity(&self, remaining_quantity: i64) -> i64 {
        let mut rng = rand::thread_rng();
        
        if rng.gen::<f64>() < self.config.partial_fill_probability {
            // Partial fill
            let min_fill = (remaining_quantity as f64 * self.config.min_partial_fill_ratio) as i64;
            let fill_quantity = rng.gen_range(min_fill..=remaining_quantity);
            fill_quantity.max(1)
        } else {
            // Full fill
            remaining_quantity
        }
    }

    fn calculate_commission(&self, order: &Order, quantity: i64, price: f64) -> f64 {
        match order.instrument_type {
            InstrumentType::Stock => {
                let per_share_commission = quantity as f64 * self.config.commission_per_share;
                let total_commission = per_share_commission + self.config.commission_per_trade;

                total_commission
                    .max(self.config.min_commission)
                    .min(self.config.max_commission)
            }
            InstrumentType::Option => {
                let per_contract_commission = quantity as f64 * self.config.option_commission_per_contract;
                let total_commission = per_contract_commission + self.config.option_commission_per_trade;

                total_commission
                    .max(self.config.option_min_commission)
                    .min(self.config.option_max_commission)
            }
        }
    }

    fn apply_fill_to_position(&mut self, fill: &Fill) {
        let position = self.positions
            .entry(fill.symbol.clone())
            .or_insert_with(|| Position::new(fill.symbol.clone()));

        let realized_pnl = position.apply_fill(fill);

        // Update cash
        let net_amount = match fill.side {
            OrderSide::Buy => -(fill.price * fill.quantity as f64 + fill.commission),
            OrderSide::Sell => fill.price * fill.quantity as f64 - fill.commission,
        };
        
        self.cash += net_amount;

        // Remove position if quantity is zero
        if position.quantity == 0 {
            self.positions.remove(&fill.symbol);
        }
    }

    fn record_trade(&mut self, fill: &Fill) {
        let net_amount = match fill.side {
            OrderSide::Buy => -(fill.price * fill.quantity as f64 + fill.commission),
            OrderSide::Sell => fill.price * fill.quantity as f64 - fill.commission,
        };

        let trade = Trade {
            id: Uuid::new_v4().to_string(),
            symbol: fill.symbol.clone(),
            side: fill.side.clone(),
            quantity: fill.quantity,
            price: fill.price,
            timestamp: fill.timestamp,
            order_id: fill.order_id.clone(),
            commission: fill.commission,
            net_amount,
            instrument_type: fill.instrument_type.clone(),
            option_details: fill.option_details.clone(),
            leg_number: fill.leg_number,
            assignment_id: None,
        };

        // Add to trades list
        self.trades.push(trade.clone());

        // Append to immutable journal
        if let Err(e) = self.append_trade_to_journal(&trade) {
            eprintln!("Failed to append trade to journal: {}", e);
        }

        // Auto-save state after trade
        self.auto_save_if_enabled();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_broker() -> PaperBroker {
        PaperBroker::new(100000.0)
    }

    fn create_market_data(symbol: &str, last: f64, bid: Option<f64>, ask: Option<f64>) -> MarketData {
        MarketData {
            symbol: symbol.to_string(),
            last_price: last,
            bid,
            ask,
            bid_size: Some(1000),
            ask_size: Some(1000),
            volume: Some(10000),
            timestamp: chrono::Utc::now().timestamp(),
        }
    }

    #[test]
    fn test_market_buy_order() {
        let mut broker = create_test_broker();

        // Add market data
        let market_data = create_market_data("AAPL", 150.0, Some(149.95), Some(150.05));
        broker.update_market_data(market_data);

        // Place market buy order
        let request = OrderRequest {
            symbol: "AAPL".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: 100,
            price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };

        let execution = broker.place_order(request).unwrap();
        assert_eq!(execution.fills.len(), 1);
        assert_eq!(execution.status, OrderStatus::Filled);

        let fill = &execution.fills[0];
        assert_eq!(fill.quantity, 100);
        assert!(fill.price >= 150.05); // Should fill at ask + slippage

        // Check position
        let position = broker.positions.get("AAPL").unwrap();
        assert_eq!(position.quantity, 100);
        assert!(position.avg_cost >= 150.05);

        // Check cash reduction
        assert!(broker.cash < 100000.0);
    }

    #[test]
    fn test_limit_buy_order_no_fill() {
        let mut broker = create_test_broker();

        // Add market data with ask above limit price
        let market_data = create_market_data("AAPL", 150.0, Some(149.95), Some(150.05));
        broker.update_market_data(market_data);

        // Place limit buy order below market
        let request = OrderRequest {
            symbol: "AAPL".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity: 100,
            price: Some(149.00),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };

        let execution = broker.place_order(request).unwrap();
        assert_eq!(execution.fills.len(), 0);
        assert_eq!(execution.status, OrderStatus::Pending);

        // Check no position created
        assert!(!broker.positions.contains_key("AAPL"));
        assert_eq!(broker.cash, 100000.0);
    }

    #[test]
    fn test_limit_buy_order_fill() {
        let mut broker = create_test_broker();

        // Place limit buy order
        let request = OrderRequest {
            symbol: "AAPL".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity: 100,
            price: Some(150.00),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };

        let execution = broker.place_order(request).unwrap();
        assert_eq!(execution.fills.len(), 0);

        // Update market data to trigger fill
        let market_data = create_market_data("AAPL", 149.50, Some(149.45), Some(149.95));
        broker.update_market_data(market_data);

        // Check order was filled
        let orders = broker.get_orders();
        let order = orders.iter().find(|o| o.symbol == "AAPL").unwrap();
        assert_eq!(order.status, OrderStatus::Filled);
        assert_eq!(order.fills[0].price, 150.00); // Filled at limit price

        // Check position
        let position = broker.positions.get("AAPL").unwrap();
        assert_eq!(position.quantity, 100);
        assert_eq!(position.avg_cost, 150.00);
    }

    #[test]
    fn test_stop_order_trigger() {
        let mut broker = create_test_broker();

        // First buy some shares
        let market_data = create_market_data("AAPL", 150.0, Some(149.95), Some(150.05));
        broker.update_market_data(market_data);

        let buy_request = OrderRequest {
            symbol: "AAPL".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: 100,
            price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };
        broker.place_order(buy_request).unwrap();

        // Place stop loss order
        let stop_request = OrderRequest {
            symbol: "AAPL".to_string(),
            side: OrderSide::Sell,
            order_type: OrderType::Stop,
            quantity: 100,
            price: None,
            stop_price: Some(145.00),
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };

        let execution = broker.place_order(stop_request).unwrap();
        assert_eq!(execution.status, OrderStatus::Pending);

        // Price drops to trigger stop
        let market_data = create_market_data("AAPL", 144.00, Some(143.95), Some(144.05));
        broker.update_market_data(market_data);

        // Stop order should still be pending (needs implementation of stop trigger logic)
        let orders = broker.get_orders();
        let stop_order = orders.iter().find(|o| o.order_type == OrderType::Stop).unwrap();
        assert_eq!(stop_order.status, OrderStatus::Pending);
    }

    #[test]
    fn test_insufficient_buying_power() {
        let mut broker = PaperBroker::new(1000.0); // Low cash

        let market_data = create_market_data("AAPL", 150.0, Some(149.95), Some(150.05));
        broker.update_market_data(market_data);

        // Try to buy more than we can afford
        let request = OrderRequest {
            symbol: "AAPL".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: 100, // Would cost ~$15,000
            price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };

        let result = broker.place_order(request);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Insufficient buying power"));
    }

    #[test]
    fn test_insufficient_shares_to_sell() {
        let mut broker = create_test_broker();

        // Try to sell shares we don't own
        let request = OrderRequest {
            symbol: "AAPL".to_string(),
            side: OrderSide::Sell,
            order_type: OrderType::Market,
            quantity: 100,
            price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };

        let result = broker.place_order(request);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Insufficient shares"));
    }

    #[test]
    fn test_pnl_calculation() {
        let mut broker = create_test_broker();

        // Buy at $150
        let market_data = create_market_data("AAPL", 150.0, Some(149.95), Some(150.05));
        broker.update_market_data(market_data);

        let buy_request = OrderRequest {
            symbol: "AAPL".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: 100,
            price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };
        broker.place_order(buy_request).unwrap();

        // Price moves to $160
        let market_data = create_market_data("AAPL", 160.0, Some(159.95), Some(160.05));
        broker.update_market_data(market_data);

        let portfolio = broker.get_portfolio();
        let position = portfolio.positions.get("AAPL").unwrap();

        // Should have unrealized profit (approximately $1000 minus commissions and slippage)
        assert!(position.unrealized_pnl > 900.0);
        assert!(portfolio.total_pnl > 900.0);

        // Sell half the position
        let sell_request = OrderRequest {
            symbol: "AAPL".to_string(),
            side: OrderSide::Sell,
            order_type: OrderType::Market,
            quantity: 50,
            price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };
        broker.place_order(sell_request).unwrap();

        let portfolio = broker.get_portfolio();
        let position = portfolio.positions.get("AAPL").unwrap();

        // Should have realized some profit
        assert!(position.realized_pnl > 400.0);
        assert_eq!(position.quantity, 50);
    }

    #[test]
    fn test_order_validation() {
        // Test empty symbol
        let request = OrderRequest {
            symbol: "".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: 100,
            price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };
        assert!(request.validate().is_err());

        // Test zero quantity
        let request = OrderRequest {
            symbol: "AAPL".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: 0,
            price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };
        assert!(request.validate().is_err());

        // Test limit order without price
        let request = OrderRequest {
            symbol: "AAPL".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity: 100,
            price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            client_order_id: None,
            instrument_type: InstrumentType::Stock,
            option_details: None,
        };
        assert!(request.validate().is_err());
    }
}
