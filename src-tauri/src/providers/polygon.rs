// src-tauri/src/providers/polygon.rs
// Polygon REST + WebSocket provider for realtime data

use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt};
use reqwest;
use tauri::{AppHandle, Emitter, Manager};
use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use chrono::{DateTime, Utc, NaiveDateTime};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OhlcBar {
    pub symbol: String,
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealTimeTick {
    pub symbol: String,
    pub price: f64,
    pub size: i64,
    pub timestamp: i64,
    pub conditions: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionState {
    pub connected: bool,
    pub last_heartbeat: i64,
    pub reconnect_attempts: u32,
    pub last_disconnect: Option<i64>,
    pub backoff_duration: u64, // seconds
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataQuality {
    pub symbol: String,
    pub last_tick_time: i64,
    pub is_stale: bool,
    pub stale_threshold_seconds: u64,
    pub tick_count: u64,
    pub gap_detected: bool,
    pub last_backfill: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackfillRequest {
    pub symbol: String,
    pub from_timestamp: i64,
    pub to_timestamp: i64,
    pub timespan: String, // "minute", "hour", "day"
    pub multiplier: i32,
}

#[derive(Debug, Deserialize)]
struct PolygonOhlcResponse {
    results: Option<Vec<PolygonOhlcResult>>,
    status: String,
    count: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct PolygonOhlcResult {
    #[serde(rename = "T")]
    symbol: String,
    #[serde(rename = "t")]
    timestamp: i64,
    #[serde(rename = "o")]
    open: f64,
    #[serde(rename = "h")]
    high: f64,
    #[serde(rename = "l")]
    low: f64,
    #[serde(rename = "c")]
    close: f64,
    #[serde(rename = "v")]
    volume: f64,
}

#[derive(Debug, Deserialize)]
struct PolygonTickMessage {
    #[serde(rename = "ev")]
    event_type: String,
    #[serde(rename = "sym")]
    symbol: Option<String>,
    #[serde(rename = "p")]
    price: Option<f64>,
    #[serde(rename = "s")]
    size: Option<i64>,
    #[serde(rename = "t")]
    timestamp: Option<i64>,
    #[serde(rename = "c")]
    conditions: Option<Vec<i32>>,
}

pub struct PolygonProvider {
    api_key: String,
    base_url: String,
    ws_url: String,
    app_handle: AppHandle,
    stream_handle: Option<tokio::task::JoinHandle<()>>,
    connection_state: Arc<Mutex<ConnectionState>>,
    data_quality: Arc<Mutex<HashMap<String, DataQuality>>>,
    subscribed_symbols: Arc<Mutex<Vec<String>>>,
}

impl PolygonProvider {
    pub fn new(app_handle: AppHandle) -> Self {
        // Use demo API key for development - in production this would be from config
        let api_key = std::env::var("POLYGON_API_KEY")
            .unwrap_or_else(|_| "DEMO_KEY".to_string());
        
        Self {
            api_key,
            base_url: "https://api.polygon.io".to_string(),
            ws_url: "wss://socket.polygon.io/stocks".to_string(),
            app_handle,
            stream_handle: None,
            connection_state: Arc::new(Mutex::new(ConnectionState {
                connected: false,
                last_heartbeat: 0,
                reconnect_attempts: 0,
                last_disconnect: None,
                backoff_duration: 1, // Start with 1 second
            })),
            data_quality: Arc::new(Mutex::new(HashMap::new())),
            subscribed_symbols: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub async fn fetch_ohlc(
        &self,
        symbol: &str,
        start_date: &str,
        end_date: &str,
        timeframe: &str,
    ) -> Result<Vec<OhlcBar>, String> {
        let client = reqwest::Client::new();
        
        // Convert MM/DD/YYYY to YYYY-MM-DD
        let start = self.convert_date_format(start_date)?;
        let end = self.convert_date_format(end_date)?;
        
        let multiplier = match timeframe {
            "1D" => "1",
            "1H" => "1",
            "5M" => "5",
            _ => "1",
        };
        
        let timespan = match timeframe {
            "1D" => "day",
            "1H" => "hour", 
            "5M" => "minute",
            _ => "day",
        };
        
        let url = format!(
            "{}/v2/aggs/ticker/{}/range/{}/{}/{}/{}?adjusted=true&sort=asc&apikey={}",
            self.base_url, symbol, multiplier, timespan, start, end, self.api_key
        );
        
        println!("Fetching OHLC data from: {}", url.replace(&self.api_key, "***"));
        
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;
            
        if !response.status().is_success() {
            return Err(format!("HTTP error: {}", response.status()));
        }
        
        let polygon_response: PolygonOhlcResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse JSON: {}", e))?;
            
        if polygon_response.status != "OK" {
            return Err(format!("Polygon API error: {}", polygon_response.status));
        }
        
        let results = polygon_response.results.unwrap_or_default();
        let bars: Vec<OhlcBar> = results
            .into_iter()
            .map(|r| OhlcBar {
                symbol: r.symbol,
                timestamp: r.timestamp,
                open: r.open,
                high: r.high,
                low: r.low,
                close: r.close,
                volume: r.volume as i64,
            })
            .collect();
            
        println!("Fetched {} bars for {}", bars.len(), symbol);
        Ok(bars)
    }

    pub async fn backfill_recent_data(
        &self,
        symbol: &str,
        minutes_back: i64,
    ) -> Result<Vec<OhlcBar>, String> {
        let now = Utc::now();
        let start_time = now - chrono::Duration::minutes(minutes_back);

        let start_date = start_time.format("%Y-%m-%d").to_string();
        let end_date = now.format("%Y-%m-%d").to_string();

        println!("Backfilling {} from {} to {} ({} minutes)",
            symbol, start_date, end_date, minutes_back);

        // Fetch minute bars for backfill
        let bars = self.fetch_ohlc(symbol, &start_date, &end_date, "1/minute").await?;

        // Update data quality tracking
        {
            let mut quality_map = self.data_quality.lock().await;
            if let Some(quality) = quality_map.get_mut(symbol) {
                quality.last_backfill = Some(now.timestamp());
                quality.gap_detected = false;
            }
        }

        // Emit backfill data to frontend
        if let Err(e) = self.app_handle.emit("backfill_data", &bars) {
            eprintln!("Failed to emit backfill data: {}", e);
        }

        Ok(bars)
    }

    pub async fn check_data_staleness(&self) -> Vec<String> {
        let mut stale_symbols = Vec::new();
        let now = Utc::now().timestamp();

        {
            let mut quality_map = self.data_quality.lock().await;
            for (symbol, quality) in quality_map.iter_mut() {
                let time_since_last_tick = now - quality.last_tick_time;
                quality.is_stale = time_since_last_tick > quality.stale_threshold_seconds as i64;

                if quality.is_stale {
                    stale_symbols.push(symbol.clone());
                    println!("Data stale for {}: {} seconds since last tick",
                        symbol, time_since_last_tick);
                }
            }
        }

        // Emit stale data alert to QA system
        if !stale_symbols.is_empty() {
            if let Err(e) = self.app_handle.emit("stale_data_alert", &stale_symbols) {
                eprintln!("Failed to emit stale data alert: {}", e);
            }
        }

        stale_symbols
    }

    pub async fn start_stream(&mut self, symbols: Vec<String>) -> Result<(), String> {
        if self.stream_handle.is_some() {
            return Err("Stream already running".to_string());
        }

        // Store subscribed symbols for reconnection
        {
            let mut subscribed = self.subscribed_symbols.lock().await;
            *subscribed = symbols.clone();
        }

        // Initialize data quality tracking for symbols
        {
            let mut quality_map = self.data_quality.lock().await;
            for symbol in &symbols {
                quality_map.insert(symbol.clone(), DataQuality {
                    symbol: symbol.clone(),
                    last_tick_time: Utc::now().timestamp(),
                    is_stale: false,
                    stale_threshold_seconds: 30, // 30 seconds stale threshold
                    tick_count: 0,
                    gap_detected: false,
                    last_backfill: None,
                });
            }
        }

        let ws_url = format!("{}?apikey={}", self.ws_url, self.api_key);
        let app_handle = self.app_handle.clone();
        let connection_state = self.connection_state.clone();
        let data_quality = self.data_quality.clone();
        let subscribed_symbols = self.subscribed_symbols.clone();

        let handle = tokio::spawn(async move {
            Self::run_websocket_with_reconnect(
                ws_url,
                symbols,
                app_handle,
                connection_state,
                data_quality,
                subscribed_symbols,
            ).await;
        });

        self.stream_handle = Some(handle);
        Ok(())
    }

    pub async fn stop_stream(&mut self) -> Result<(), String> {
        if let Some(handle) = self.stream_handle.take() {
            handle.abort();
            println!("Stream stopped");

            // Reset connection state
            {
                let mut state = self.connection_state.lock().await;
                state.connected = false;
                state.reconnect_attempts = 0;
            }
        }
        Ok(())
    }

    async fn run_websocket_with_reconnect(
        ws_url: String,
        symbols: Vec<String>,
        app_handle: AppHandle,
        connection_state: Arc<Mutex<ConnectionState>>,
        data_quality: Arc<Mutex<HashMap<String, DataQuality>>>,
        subscribed_symbols: Arc<Mutex<Vec<String>>>,
    ) {
        loop {
            let result = Self::run_websocket_connection(
                &ws_url,
                &symbols,
                &app_handle,
                connection_state.clone(),
                data_quality.clone(),
            ).await;

            // Update connection state
            {
                let mut state = connection_state.lock().await;
                state.connected = false;
                state.last_disconnect = Some(Utc::now().timestamp());
                state.reconnect_attempts += 1;

                // Exponential backoff: 1, 2, 4, 8, 16, 32, 60 (max) seconds
                state.backoff_duration = std::cmp::min(
                    1u64 << (state.reconnect_attempts - 1).min(5),
                    60
                );
            }

            // Emit connection lost event
            let _ = app_handle.emit("connection_lost", &format!("Connection lost: {:?}", result));

            // Check if we should trigger backfill
            let should_backfill = {
                let state = connection_state.lock().await;
                state.reconnect_attempts == 1 // Only on first disconnect
            };

            if should_backfill {
                // Trigger backfill for all subscribed symbols
                let symbols_to_backfill = subscribed_symbols.lock().await.clone();
                for symbol in symbols_to_backfill {
                    // Backfill last 5 minutes of data
                    // Note: This would need a reference to the provider instance
                    // For now, emit a backfill request event
                    let _ = app_handle.emit("backfill_request", &BackfillRequest {
                        symbol: symbol.clone(),
                        from_timestamp: Utc::now().timestamp() - 300, // 5 minutes ago
                        to_timestamp: Utc::now().timestamp(),
                        timespan: "minute".to_string(),
                        multiplier: 1,
                    });
                }
            }

            // Wait before reconnecting (exponential backoff)
            let backoff_duration = {
                let state = connection_state.lock().await;
                state.backoff_duration
            };

            println!("Reconnecting in {} seconds (attempt {})",
                backoff_duration,
                connection_state.lock().await.reconnect_attempts
            );

            sleep(Duration::from_secs(backoff_duration)).await;

            // Emit reconnecting event
            let _ = app_handle.emit("reconnecting", &{
                let state = connection_state.lock().await;
                format!("Reconnecting... (attempt {})", state.reconnect_attempts)
            });
        }
    }

    async fn run_websocket_connection(
        ws_url: &str,
        symbols: &[String],
        app_handle: &AppHandle,
        connection_state: Arc<Mutex<ConnectionState>>,
        data_quality: Arc<Mutex<HashMap<String, DataQuality>>>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        println!("Connecting to WebSocket: {}", ws_url.replace("apikey=", "apikey=***"));
        
        let (ws_stream, _) = connect_async(ws_url).await?;
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();
        
        // Update connection state
        {
            let mut state = connection_state.lock().await;
            state.connected = true;
            state.last_heartbeat = Utc::now().timestamp();
            state.reconnect_attempts = 0; // Reset on successful connection
            state.backoff_duration = 1;
        }

        // Subscribe to symbols
        for symbol in symbols {
            let subscribe_msg = format!(r#"{{"action":"subscribe","params":"T.{}"}}"#, symbol);
            ws_sender.send(Message::Text(subscribe_msg)).await?;
            println!("Subscribed to {}", symbol);
        }

        // Emit connection status
        let _ = app_handle.emit("stream_connected", &symbols);
        
        // Process incoming messages
        while let Some(msg) = ws_receiver.next().await {
            match msg? {
                Message::Text(text) => {
                    if let Ok(tick_msgs) = serde_json::from_str::<Vec<PolygonTickMessage>>(&text) {
                        for tick_msg in tick_msgs {
                            if tick_msg.event_type == "T" {
                                if let (Some(symbol), Some(price), Some(timestamp)) = 
                                    (tick_msg.symbol, tick_msg.price, tick_msg.timestamp) {
                                    
                                    let tick = RealTimeTick {
                                        symbol: symbol.clone(),
                                        price,
                                        size: tick_msg.size.unwrap_or(0),
                                        timestamp,
                                        conditions: tick_msg.conditions.unwrap_or_default(),
                                    };

                                    // Update data quality tracking
                                    {
                                        let mut quality_map = data_quality.lock().await;
                                        if let Some(quality) = quality_map.get_mut(&symbol) {
                                            let now = Utc::now().timestamp();

                                            // Check for gaps (more than 2x the stale threshold)
                                            let time_since_last = now - quality.last_tick_time;
                                            if time_since_last > (quality.stale_threshold_seconds * 2) as i64 {
                                                quality.gap_detected = true;
                                                println!("Data gap detected for {}: {} seconds", symbol, time_since_last);
                                            }

                                            quality.last_tick_time = now;
                                            quality.tick_count += 1;
                                            quality.is_stale = false;
                                        }
                                    }

                                    // Update connection heartbeat
                                    {
                                        let mut state = connection_state.lock().await;
                                        state.last_heartbeat = Utc::now().timestamp();
                                    }

                                    // Emit tick to UI
                                    let _ = app_handle.emit("tick", &tick);
                                }
                            }
                        }
                    }
                }
                Message::Close(_) => {
                    println!("WebSocket connection closed");
                    break;
                }
                _ => {}
            }
        }
        
        let _ = app_handle.emit("stream_disconnected", ());
        Ok(())
    }

    fn convert_date_format(&self, date: &str) -> Result<String, String> {
        // Convert MM/DD/YYYY to YYYY-MM-DD
        let parts: Vec<&str> = date.split('/').collect();
        if parts.len() != 3 {
            return Err(format!("Invalid date format: {}", date));
        }
        
        let month = parts[0].parse::<u32>().map_err(|_| "Invalid month")?;
        let day = parts[1].parse::<u32>().map_err(|_| "Invalid day")?;
        let year = parts[2].parse::<u32>().map_err(|_| "Invalid year")?;
        
        Ok(format!("{:04}-{:02}-{:02}", year, month, day))
    }

    pub async fn get_connection_status(&self) -> ConnectionState {
        self.connection_state.lock().await.clone()
    }

    pub async fn get_data_quality(&self) -> HashMap<String, DataQuality> {
        self.data_quality.lock().await.clone()
    }

    pub async fn is_data_stale(&self, symbol: &str) -> bool {
        {
            let quality_map = self.data_quality.lock().await;
            if let Some(quality) = quality_map.get(symbol) {
                let now = Utc::now().timestamp();
                let time_since_last = now - quality.last_tick_time;
                return time_since_last > quality.stale_threshold_seconds as i64;
            }
        }
        true // Assume stale if no data quality info
    }

    pub async fn trigger_backfill_if_needed(&self, symbol: &str) -> Result<(), String> {
        let should_backfill = {
            let quality_map = self.data_quality.lock().await;
            if let Some(quality) = quality_map.get(symbol) {
                quality.gap_detected || quality.is_stale
            } else {
                false
            }
        };

        if should_backfill {
            println!("Triggering backfill for {} due to data quality issues", symbol);
            self.backfill_recent_data(symbol, 5).await?;
        }

        Ok(())
    }
}

// Helper function to get app config directory
pub fn get_config_path(app_handle: &AppHandle) -> Result<std::path::PathBuf, String> {
    app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config directory: {}", e))
}
