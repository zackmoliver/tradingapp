#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Add this chrono import for the timestamp
use chrono;
use serde::{Deserialize, Serialize};
use std::{thread, time::Duration};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug, Clone)]
struct EquityPoint {
    t: String,
    equity: f64,
    drawdown: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct BacktestParams {
    ticker: String,
    start_date: String,
    end_date: String,
    strategy: String,
    initial_capital: f64,
    seed: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct BacktestSummary {
    strategy: String,
    symbol: String,
    start: String,
    end: String,
    capital: f64,
    cagr: f64,
    trades: u32,
    win_rate: f64,
    max_dd: f64,
    equity_curve: Vec<EquityPoint>,
}

// Health check response structure
#[derive(Serialize, Deserialize, Debug)]
struct PingResponse {
    ok: bool,
    ts: u64,
}

// Health check command
#[tauri::command]
async fn ping() -> PingResponse {
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    PingResponse {
        ok: true,
        ts: timestamp,
    }
}

// Get preferences file path
fn get_preferences_path(app_handle: tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config directory: {}", e))?;

    let trading_app_dir = config_dir.join("trading-app");
    let config_file = trading_app_dir.join("config.json");

    Ok(config_file)
}

// Load preferences command
#[tauri::command]
async fn load_preferences(app_handle: tauri::AppHandle) -> Result<Option<BacktestParams>, String> {
    let config_path = get_preferences_path(app_handle)?;

    if !config_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read preferences file: {}", e))?;

    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse preferences JSON: {}", e))?;

    // Extract just the BacktestParams fields (ignore metadata)
    let params: BacktestParams = serde_json::from_value(parsed)
        .map_err(|e| format!("Failed to deserialize preferences: {}", e))?;

    Ok(Some(params))
}

// Save preferences command
#[tauri::command]
async fn save_preferences(app_handle: tauri::AppHandle, preferences: BacktestParams) -> Result<(), String> {
    let config_path = get_preferences_path(app_handle)?;

    // Ensure directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    // Add metadata
    let config_data = serde_json::json!({
        "ticker": preferences.ticker,
        "start_date": preferences.start_date,
        "end_date": preferences.end_date,
        "strategy": preferences.strategy,
        "initial_capital": preferences.initial_capital,
        "seed": preferences.seed,
        "_metadata": {
            "version": "1.0.0",
            "saved_at": chrono::Utc::now().to_rfc3339(),
            "app_version": "1.0.0"
        }
    });

    let content = serde_json::to_string_pretty(&config_data)
        .map_err(|e| format!("Failed to serialize preferences: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write preferences file: {}", e))?;

    Ok(())
}

// Returns a sample backtest summary with deterministic data
#[tauri::command]
async fn get_sample_backtest_result(delay_ms: Option<u64>) -> BacktestSummary {
    thread::sleep(Duration::from_millis(delay_ms.unwrap_or(1200)));

    let strategy = "PMCC".to_string();
    let symbol = "SPY".to_string();
    let start = "2022-01-01".to_string();
    let end = "2024-12-31".to_string();
    let capital = 100_000.0;

    // Generate a simple equity curve for demonstration
    let mut equity = capital;
    let mut equity_curve = Vec::new();
    let mut max_equity = equity;
    let mut max_dd = 0.0;
    let days = 50;
    for i in 0..days {
        // deterministic daily return that increases over time
        let daily_return = 0.0006 + 0.00002 * (i as f64);
        equity *= 1.0 + daily_return;
        if equity > max_equity {
            max_equity = equity;
        }
        let drawdown = (equity - max_equity) / max_equity;
        if drawdown < max_dd {
            max_dd = drawdown;
        }
        equity_curve.push(EquityPoint {
            t: format!("Day {}", i + 1),
            equity,
            drawdown,
        });
    }

    let cagr = ((equity / capital).powf(1.0 / (days as f64 / 252.0)) - 1.0).max(0.0);
    let trades = 40;
    let win_rate = 0.55;

    BacktestSummary {
        strategy,
        symbol,
        start,
        end,
        capital,
        cagr,
        trades,
        win_rate,
        max_dd,
        equity_curve,
    }
}

// Runs a backtest based on BacktestParams and returns a summary
#[tauri::command]
async fn run_backtest(params: BacktestParams, delay_ms: Option<u64>) -> BacktestSummary {
    thread::sleep(Duration::from_millis(delay_ms.unwrap_or(1500)));

    // Use seed for deterministic generation, default to 42 if not provided
    let seed = params.seed.unwrap_or(42);

    // Generate deterministic synthetic equity curve
    let equity_curve = generate_deterministic_equity_curve(
        params.initial_capital,
        &params.start_date,
        &params.end_date,
        seed,
    );

    // Calculate metrics from equity curve
    let (cagr, max_dd) = calculate_performance_metrics(&equity_curve, &params.start_date, &params.end_date);

    // Generate deterministic trades and win rate based on seed
    let (trades, win_rate) = generate_deterministic_stats(seed);

    BacktestSummary {
        strategy: params.strategy,
        symbol: params.ticker,
        start: params.start_date,
        end: params.end_date,
        capital: params.initial_capital,
        cagr,
        trades,
        win_rate,
        max_dd,
        equity_curve,
    }
}

// Simple Linear Congruential Generator for deterministic randomness
struct SimpleRng {
    state: u64,
}

impl SimpleRng {
    fn new(seed: u32) -> Self {
        Self {
            state: seed as u64,
        }
    }

    fn next_f64(&mut self) -> f64 {
        // LCG parameters (from Numerical Recipes)
        self.state = self.state.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.state as f64) / (u64::MAX as f64)
    }

    fn next_range(&mut self, min: f64, max: f64) -> f64 {
        min + (max - min) * self.next_f64()
    }
}

// Generate deterministic equity curve based on seed
fn generate_deterministic_equity_curve(
    initial_capital: f64,
    start_date: &str,
    end_date: &str,
    seed: u32,
) -> Vec<EquityPoint> {
    let mut rng = SimpleRng::new(seed);
    let mut equity_curve = Vec::new();

    // Parse dates to calculate number of days
    let days = calculate_days_between(start_date, end_date).max(1);

    // Strategy-specific parameters (could be enhanced to use strategy param)
    let base_drift = 0.0008; // Daily drift
    let volatility = 0.015;  // Daily volatility

    let mut equity = initial_capital;
    let mut max_equity = equity;

    // Generate deterministic daily returns
    for i in 0..days {
        // Deterministic drift component
        let drift_component = base_drift * (1.0 + 0.1 * (seed as f64 * i as f64).sin());

        // Deterministic volatility component using seed-based randomness
        let vol_component = volatility * rng.next_range(-1.0, 1.0);

        // Combine for daily return
        let daily_return = drift_component + vol_component;

        // Update equity
        equity *= 1.0 + daily_return;

        // Track maximum for drawdown calculation
        if equity > max_equity {
            max_equity = equity;
        }

        // Calculate drawdown
        let drawdown = (equity - max_equity) / max_equity;

        // Format date (simplified - using day offset)
        let date = format_date_from_offset(start_date, i);

        equity_curve.push(EquityPoint {
            t: date,
            equity,
            drawdown,
        });
    }

    equity_curve
}

// Calculate performance metrics from equity curve
fn calculate_performance_metrics(
    equity_curve: &[EquityPoint],
    start_date: &str,
    end_date: &str,
) -> (f64, f64) {
    if equity_curve.is_empty() {
        return (0.0, 0.0);
    }

    let initial_equity = equity_curve[0].equity;
    let final_equity = equity_curve[equity_curve.len() - 1].equity;

    // Calculate CAGR
    let days = calculate_days_between(start_date, end_date).max(1) as f64;
    let years = days / 365.25;
    let cagr = if years > 0.0 && initial_equity > 0.0 {
        (final_equity / initial_equity).powf(1.0 / years) - 1.0
    } else {
        0.0
    };

    // Calculate maximum drawdown
    let mut max_equity = initial_equity;
    let mut max_dd = 0.0;

    for point in equity_curve {
        if point.equity > max_equity {
            max_equity = point.equity;
        }
        let drawdown = (point.equity - max_equity) / max_equity;
        if drawdown < max_dd {
            max_dd = drawdown;
        }
    }

    (cagr, max_dd)
}

// Generate deterministic trading statistics based on seed
fn generate_deterministic_stats(seed: u32) -> (u32, f64) {
    let mut rng = SimpleRng::new(seed);

    // Generate trades between 15-35 based on seed
    let trades = 15 + ((rng.next_f64() * 20.0) as u32);

    // Generate win rate between 0.45-0.75 based on seed
    let win_rate = 0.45 + (rng.next_f64() * 0.30);

    (trades, win_rate)
}

// Helper function to calculate days between dates (simplified)
fn calculate_days_between(start: &str, end: &str) -> i32 {
    // Simplified calculation - in real implementation would parse actual dates
    // For now, return a reasonable default based on typical backtest periods
    match (start.contains("2023"), end.contains("2023")) {
        (true, true) => 365,
        _ => 252, // Trading days in a year
    }
}

// Helper function to format date from offset (simplified)
fn format_date_from_offset(start_date: &str, offset: i32) -> String {
    // Simplified date formatting - in real implementation would handle actual date arithmetic
    if start_date.starts_with("01/01/2023") {
        let month = 1 + (offset / 30);
        let day = 1 + (offset % 30);
        format!("{:02}/{:02}/2023", month.min(12), day.min(28))
    } else {
        format!("Day {}", offset + 1)
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ping,
            get_sample_backtest_result,
            run_backtest,
            load_preferences,
            save_preferences
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}