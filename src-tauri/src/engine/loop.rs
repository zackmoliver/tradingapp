// src-tauri/src/engine/loop.rs
// Deterministic strategy loop with 5-minute cadence and structured logging

use super::types::*;
use super::broker::PaperBroker;
use crate::storage::cache::FileCache;
use crate::providers::polygon::OhlcBar;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use chrono::{DateTime, Utc, NaiveDateTime};
use tokio::time::{sleep, Duration, Instant};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyLoopConfig {
    pub enabled: bool,
    pub cadence_minutes: u64,        // 5 minutes default
    pub max_concurrent_signals: u32, // Prevent signal spam
    pub cooldown_seconds: u64,       // Minimum time between signals for same symbol
    pub log_level: LogLevel,
    pub dry_run: bool,               // Log decisions but don't place orders
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BarCloseEvent {
    pub symbol: String,
    pub timestamp: i64,
    pub bar: OhlcBar,
    pub is_complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalEvaluation {
    pub symbol: String,
    pub timestamp: i64,
    pub bar_timestamp: i64,
    pub signals: Vec<SignalResult>,
    pub decision: StrategyDecision,
    pub execution_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalResult {
    pub name: String,
    pub direction: SignalDirection,
    pub confidence: f64,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SignalDirection {
    Long,
    Short,
    Neutral,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyDecision {
    pub action: DecisionAction,
    pub reason: String,
    pub orders: Vec<OrderRequest>,
    pub risk_assessment: RiskAssessment,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DecisionAction {
    Buy,
    Sell,
    Hold,
    Close,
    Skip,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskAssessment {
    pub position_size: f64,
    pub risk_per_trade: f64,
    pub portfolio_heat: f64,
    pub max_drawdown_risk: f64,
    pub approved: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopState {
    pub running: bool,
    pub last_execution: i64,
    pub processed_bars: HashSet<String>, // "symbol:timestamp" to prevent double-firing
    pub signal_cooldowns: HashMap<String, i64>, // symbol -> last signal time
    pub execution_count: u64,
    pub error_count: u64,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyLog {
    pub timestamp: i64,
    pub level: LogLevel,
    pub category: String,
    pub message: String,
    pub data: Option<serde_json::Value>,
    pub symbol: Option<String>,
    pub bar_timestamp: Option<i64>,
}

pub struct StrategyLoop {
    config: StrategyLoopConfig,
    state: Arc<Mutex<LoopState>>,
    broker: Arc<Mutex<PaperBroker>>,
    app_handle: AppHandle,
    storage: Option<FileCache>,
    loop_handle: Option<tokio::task::JoinHandle<()>>,
}

impl Default for StrategyLoopConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            cadence_minutes: 5,
            max_concurrent_signals: 10,
            cooldown_seconds: 300, // 5 minutes
            log_level: LogLevel::Info,
            dry_run: true,
        }
    }
}

impl StrategyLoop {
    pub fn new(broker: Arc<Mutex<PaperBroker>>, app_handle: AppHandle) -> Self {
        Self {
            config: StrategyLoopConfig::default(),
            state: Arc::new(Mutex::new(LoopState {
                running: false,
                last_execution: 0,
                processed_bars: HashSet::new(),
                signal_cooldowns: HashMap::new(),
                execution_count: 0,
                error_count: 0,
                last_error: None,
            })),
            broker,
            app_handle,
            storage: None,
            loop_handle: None,
        }
    }

    pub fn with_config(mut self, config: StrategyLoopConfig) -> Self {
        self.config = config;
        self
    }

    pub async fn start(&mut self) -> Result<(), String> {
        if self.loop_handle.is_some() {
            return Err("Strategy loop already running".to_string());
        }

        if !self.config.enabled {
            return Err("Strategy loop is disabled in config".to_string());
        }

        // Update state
        {
            let mut state = self.state.lock().await;
            state.running = true;
            state.last_execution = Utc::now().timestamp();
        }

        let config = self.config.clone();
        let state = self.state.clone();
        let broker = self.broker.clone();
        let app_handle = self.app_handle.clone();

        let handle = tokio::spawn(async move {
            Self::run_strategy_loop(config, state, broker, app_handle).await;
        });

        self.loop_handle = Some(handle);
        self.log(LogLevel::Info, "loop", "Strategy loop started", None, None, None).await;

        Ok(())
    }

    pub async fn stop(&mut self) -> Result<(), String> {
        if let Some(handle) = self.loop_handle.take() {
            handle.abort();
            
            // Update state
            {
                let mut state = self.state.lock().await;
                state.running = false;
            }

            self.log(LogLevel::Info, "loop", "Strategy loop stopped", None, None, None).await;
        }

        Ok(())
    }

    async fn run_strategy_loop(
        config: StrategyLoopConfig,
        state: Arc<Mutex<LoopState>>,
        broker: Arc<Mutex<PaperBroker>>,
        app_handle: AppHandle,
    ) {
        let mut interval = tokio::time::interval(Duration::from_secs(config.cadence_minutes * 60));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;

            let execution_start = Instant::now();
            let current_time = Utc::now().timestamp();

            // Update execution count
            {
                let mut loop_state = state.lock().await;
                loop_state.execution_count += 1;
                loop_state.last_execution = current_time;
            }

            // Get current market data and positions
            let (market_data, positions) = {
                let broker_guard = broker.lock().await;
                (broker_guard.market_data.clone(), broker_guard.positions.clone())
            };

            // Process each symbol with market data
            for (symbol, data) in market_data.iter() {
                if let Err(e) = Self::process_symbol_bar(
                    &symbol,
                    data,
                    &positions,
                    &config,
                    &state,
                    &broker,
                    &app_handle,
                    current_time,
                ).await {
                    // Log error and continue with other symbols
                    let mut loop_state = state.lock().await;
                    loop_state.error_count += 1;
                    loop_state.last_error = Some(e.clone());
                    
                    let _ = app_handle.emit("strategy_error", &format!("Error processing {}: {}", symbol, e));
                }
            }

            let execution_time = execution_start.elapsed().as_millis() as u64;
            
            // Emit loop execution event
            let execution_count = {
                let loop_state = state.lock().await;
                loop_state.execution_count
            };
            let _ = app_handle.emit("strategy_loop_execution", &serde_json::json!({
                "timestamp": current_time,
                "execution_time_ms": execution_time,
                "symbols_processed": market_data.len(),
                "execution_count": execution_count
            }));

            // Cleanup old processed bars (keep last 24 hours)
            Self::cleanup_processed_bars(&state, current_time - 86400).await;
        }
    }

    async fn process_symbol_bar(
        symbol: &str,
        market_data: &MarketData,
        positions: &HashMap<String, Position>,
        config: &StrategyLoopConfig,
        state: &Arc<Mutex<LoopState>>,
        broker: &Arc<Mutex<PaperBroker>>,
        app_handle: &AppHandle,
        current_time: i64,
    ) -> Result<(), String> {
        let bar_timestamp = Self::get_bar_timestamp(current_time, config.cadence_minutes);
        let bar_key = format!("{}:{}", symbol, bar_timestamp);

        // Check if we've already processed this bar (prevent double-firing)
        {
            let loop_state = state.lock().await;
            if loop_state.processed_bars.contains(&bar_key) {
                return Ok(()); // Already processed
            }
        }

        // Check cooldown period
        {
            let loop_state = state.lock().await;
            if let Some(&last_signal_time) = loop_state.signal_cooldowns.get(symbol) {
                if current_time - last_signal_time < config.cooldown_seconds as i64 {
                    return Ok(()); // Still in cooldown
                }
            }
        }

        let evaluation_start = Instant::now();

        // Create synthetic OHLC bar from market data
        let bar = OhlcBar {
            symbol: symbol.to_string(),
            timestamp: bar_timestamp,
            open: market_data.last_price,
            high: market_data.last_price,
            low: market_data.last_price,
            close: market_data.last_price,
            volume: 0,
        };

        // Evaluate signals for this symbol
        let signals = Self::evaluate_signals(symbol, &bar, market_data, positions).await?;

        // Make strategy decision
        let decision = Self::make_strategy_decision(symbol, &signals, positions, market_data).await?;

        let evaluation_time = evaluation_start.elapsed().as_millis() as u64;

        // Create evaluation record
        let evaluation = SignalEvaluation {
            symbol: symbol.to_string(),
            timestamp: current_time,
            bar_timestamp,
            signals: signals.clone(),
            decision: decision.clone(),
            execution_time_ms: evaluation_time,
        };

        // Log the evaluation
        Self::log_evaluation(&evaluation, config, app_handle).await;

        // Execute decision if not in dry run mode
        if !config.dry_run && decision.risk_assessment.approved {
            Self::execute_decision(symbol, &decision, broker, app_handle).await?;

            // Update cooldown
            {
                let mut loop_state = state.lock().await;
                loop_state.signal_cooldowns.insert(symbol.to_string(), current_time);
            }
        }

        // Mark bar as processed
        {
            let mut loop_state = state.lock().await;
            loop_state.processed_bars.insert(bar_key);
        }

        // Emit evaluation event
        let _ = app_handle.emit("signal_evaluation", &evaluation);

        Ok(())
    }

    async fn evaluate_signals(
        _symbol: &str,
        bar: &OhlcBar,
        market_data: &MarketData,
        _positions: &HashMap<String, Position>,
    ) -> Result<Vec<SignalResult>, String> {
        let mut signals = Vec::new();

        // Simple moving average crossover signal (mock implementation)
        let price = bar.close;
        let sma_short = price; // In real implementation, calculate from historical data
        let sma_long = price * 0.99; // Mock longer MA slightly below current price

        if sma_short > sma_long {
            signals.push(SignalResult {
                name: "SMA_Crossover".to_string(),
                direction: SignalDirection::Long,
                confidence: 0.7,
                metadata: {
                    let mut meta = HashMap::new();
                    meta.insert("sma_short".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(sma_short).unwrap()));
                    meta.insert("sma_long".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(sma_long).unwrap()));
                    meta
                },
            });
        }

        // RSI signal (mock implementation)
        let rsi = 45.0; // Mock RSI value
        if rsi < 30.0 {
            signals.push(SignalResult {
                name: "RSI_Oversold".to_string(),
                direction: SignalDirection::Long,
                confidence: 0.8,
                metadata: {
                    let mut meta = HashMap::new();
                    meta.insert("rsi".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(rsi).unwrap()));
                    meta
                },
            });
        } else if rsi > 70.0 {
            signals.push(SignalResult {
                name: "RSI_Overbought".to_string(),
                direction: SignalDirection::Short,
                confidence: 0.8,
                metadata: {
                    let mut meta = HashMap::new();
                    meta.insert("rsi".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(rsi).unwrap()));
                    meta
                },
            });
        }

        // Volume signal (mock implementation)
        let avg_volume = 1000000.0; // Mock average volume
        let current_volume = market_data.volume.unwrap_or(0) as f64;
        if current_volume > avg_volume * 1.5 {
            signals.push(SignalResult {
                name: "Volume_Spike".to_string(),
                direction: SignalDirection::Neutral,
                confidence: 0.6,
                metadata: {
                    let mut meta = HashMap::new();
                    meta.insert("volume".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(current_volume).unwrap()));
                    meta.insert("avg_volume".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(avg_volume).unwrap()));
                    meta
                },
            });
        }

        Ok(signals)
    }

    async fn make_strategy_decision(
        symbol: &str,
        signals: &[SignalResult],
        positions: &HashMap<String, Position>,
        market_data: &MarketData,
    ) -> Result<StrategyDecision, String> {
        let current_position = positions.get(symbol);
        let price = market_data.last_price;

        // Count signal directions
        let long_signals: Vec<_> = signals.iter().filter(|s| s.direction == SignalDirection::Long).collect();
        let short_signals: Vec<_> = signals.iter().filter(|s| s.direction == SignalDirection::Short).collect();

        // Calculate average confidence
        let long_confidence: f64 = long_signals.iter().map(|s| s.confidence).sum::<f64>() / long_signals.len().max(1) as f64;
        let short_confidence: f64 = short_signals.iter().map(|s| s.confidence).sum::<f64>() / short_signals.len().max(1) as f64;

        // Risk assessment
        let position_size = 100.0; // Mock position size
        let risk_per_trade = position_size * price * 0.02; // 2% risk
        let portfolio_heat = 0.05; // 5% portfolio heat
        let max_drawdown_risk = 0.10; // 10% max drawdown

        let risk_assessment = RiskAssessment {
            position_size,
            risk_per_trade,
            portfolio_heat,
            max_drawdown_risk,
            approved: true, // Mock approval
            warnings: Vec::new(),
        };

        // Decision logic
        let (action, reason, orders) = if long_signals.len() > short_signals.len() && long_confidence > 0.6 {
            if current_position.is_none() {
                // Open long position
                let order = OrderRequest {
                    symbol: symbol.to_string(),
                    side: OrderSide::Buy,
                    order_type: OrderType::Market,
                    quantity: position_size as i64,
                    price: None,
                    stop_price: None,
                    time_in_force: TimeInForce::Day,
                    client_order_id: Some(format!("strategy_{}", Utc::now().timestamp())),
                    instrument_type: InstrumentType::Stock,
                    option_details: None,
                };
                (DecisionAction::Buy, format!("Long signals: {} with confidence {:.2}", long_signals.len(), long_confidence), vec![order])
            } else {
                (DecisionAction::Hold, "Already have position".to_string(), vec![])
            }
        } else if short_signals.len() > long_signals.len() && short_confidence > 0.6 {
            if let Some(pos) = current_position {
                if pos.quantity > 0 {
                    // Close long position
                    let order = OrderRequest {
                        symbol: symbol.to_string(),
                        side: OrderSide::Sell,
                        order_type: OrderType::Market,
                        quantity: pos.quantity,
                        price: None,
                        stop_price: None,
                        time_in_force: TimeInForce::Day,
                        client_order_id: Some(format!("strategy_{}", Utc::now().timestamp())),
                        instrument_type: InstrumentType::Stock,
                        option_details: None,
                    };
                    (DecisionAction::Close, format!("Short signals: {} with confidence {:.2}", short_signals.len(), short_confidence), vec![order])
                } else {
                    (DecisionAction::Hold, "Already short".to_string(), vec![])
                }
            } else {
                (DecisionAction::Skip, "No position to close".to_string(), vec![])
            }
        } else {
            (DecisionAction::Skip, "No clear signal consensus".to_string(), vec![])
        };

        Ok(StrategyDecision {
            action,
            reason,
            orders,
            risk_assessment,
        })
    }

    async fn execute_decision(
        symbol: &str,
        decision: &StrategyDecision,
        broker: &Arc<Mutex<PaperBroker>>,
        app_handle: &AppHandle,
    ) -> Result<(), String> {
        let mut broker_guard = broker.lock().await;

        for order in &decision.orders {
            match broker_guard.place_order(order.clone()) {
                Ok(execution) => {
                    let _ = app_handle.emit("strategy_order_placed", &serde_json::json!({
                        "symbol": symbol,
                        "action": decision.action,
                        "order": order,
                        "execution": execution
                    }));
                }
                Err(e) => {
                    let _ = app_handle.emit("strategy_order_failed", &serde_json::json!({
                        "symbol": symbol,
                        "action": decision.action,
                        "order": order,
                        "error": e
                    }));
                    return Err(format!("Failed to place order for {}: {}", symbol, e));
                }
            }
        }

        Ok(())
    }

    async fn log_evaluation(
        evaluation: &SignalEvaluation,
        config: &StrategyLoopConfig,
        app_handle: &AppHandle,
    ) {
        let log_entry = StrategyLog {
            timestamp: evaluation.timestamp,
            level: LogLevel::Info,
            category: "evaluation".to_string(),
            message: format!(
                "Symbol: {} | Bar: {} | Signals: {} | Action: {:?} | Reason: {}",
                evaluation.symbol,
                Self::format_timestamp(evaluation.bar_timestamp),
                evaluation.signals.len(),
                evaluation.decision.action,
                evaluation.decision.reason
            ),
            data: Some(serde_json::to_value(evaluation).unwrap_or(serde_json::Value::Null)),
            symbol: Some(evaluation.symbol.clone()),
            bar_timestamp: Some(evaluation.bar_timestamp),
        };

        // Emit log event
        let _ = app_handle.emit("strategy_log", &log_entry);

        // Print to console based on log level
        if config.log_level == LogLevel::Debug || config.log_level == LogLevel::Info {
            println!("[STRATEGY] {}", log_entry.message);
        }
    }

    async fn log(
        &self,
        level: LogLevel,
        category: &str,
        message: &str,
        data: Option<serde_json::Value>,
        symbol: Option<String>,
        bar_timestamp: Option<i64>,
    ) {
        let log_entry = StrategyLog {
            timestamp: Utc::now().timestamp(),
            level: level.clone(),
            category: category.to_string(),
            message: message.to_string(),
            data,
            symbol,
            bar_timestamp,
        };

        let _ = self.app_handle.emit("strategy_log", &log_entry);

        if self.config.log_level == LogLevel::Debug ||
           (self.config.log_level == LogLevel::Info && level != LogLevel::Debug) {
            println!("[STRATEGY] {}", log_entry.message);
        }
    }

    fn get_bar_timestamp(current_time: i64, cadence_minutes: u64) -> i64 {
        // Round down to the nearest cadence interval
        let cadence_seconds = cadence_minutes * 60;
        (current_time / cadence_seconds as i64) * cadence_seconds as i64
    }

    fn format_timestamp(timestamp: i64) -> String {
        DateTime::from_timestamp(timestamp, 0)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S UTC").to_string())
            .unwrap_or_else(|| timestamp.to_string())
    }

    async fn cleanup_processed_bars(state: &Arc<Mutex<LoopState>>, cutoff_time: i64) {
        let mut loop_state = state.lock().await;
        loop_state.processed_bars.retain(|bar_key| {
            if let Some(timestamp_str) = bar_key.split(':').nth(1) {
                if let Ok(timestamp) = timestamp_str.parse::<i64>() {
                    return timestamp > cutoff_time;
                }
            }
            false
        });
    }

    pub async fn get_state(&self) -> LoopState {
        self.state.lock().await.clone()
    }

    pub async fn get_config(&self) -> StrategyLoopConfig {
        self.config.clone()
    }

    pub async fn update_config(&mut self, config: StrategyLoopConfig) -> Result<(), String> {
        if self.loop_handle.is_some() {
            return Err("Cannot update config while loop is running".to_string());
        }
        self.config = config;
        Ok(())
    }

    pub async fn reset_state(&mut self) -> Result<(), String> {
        if self.loop_handle.is_some() {
            return Err("Cannot reset state while loop is running".to_string());
        }

        let mut state = self.state.lock().await;
        state.processed_bars.clear();
        state.signal_cooldowns.clear();
        state.execution_count = 0;
        state.error_count = 0;
        state.last_error = None;

        Ok(())
    }
}
