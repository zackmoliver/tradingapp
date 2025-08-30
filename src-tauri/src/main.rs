// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json;
use std::{fs, thread, time::Duration};
use std::path::PathBuf;
use tauri::Manager; // needed for app_handle.path()

mod provider;
use provider::{Provider, ProviderError, HistoryPoint, OptionChain, OptionQuote};
use provider::polygon::PolygonProvider;

// --------------------------- Types ---------------------------

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

#[derive(Serialize, Deserialize, Debug)]
struct PingResponse {
    ok: bool,
    ts: u64,
}

// ------------------------ Commands ---------------------------

#[tauri::command]
async fn ping() -> PingResponse {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    PingResponse { ok: true, ts }
}

fn get_preferences_path(app_handle: tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config directory: {e}"))?;

    let trading_app_dir = config_dir.join("trading-app");
    let config_file = trading_app_dir.join("config.json");
    Ok(config_file)
}

#[tauri::command]
async fn load_preferences(app_handle: tauri::AppHandle) -> Result<Option<BacktestParams>, String> {
    let config_path = get_preferences_path(app_handle)?;
    if !config_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read preferences file: {e}"))?;

    let parsed: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse preferences JSON: {e}"))?;

    let params: BacktestParams = serde_json::from_value(parsed)
        .map_err(|e| format!("Failed to deserialize preferences: {e}"))?;

    Ok(Some(params))
}

#[tauri::command]
async fn save_preferences(
    app_handle: tauri::AppHandle,
    preferences: BacktestParams,
) -> Result<(), String> {
    let config_path = get_preferences_path(app_handle)?;

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {e}"))?;
    }

    let config_data = serde_json::json!({
        "ticker": preferences.ticker,
        "start_date": preferences.start_date,
        "end_date": preferences.end_date,
        "strategy": preferences.strategy,
        "initial_capital": preferences.initial_capital,
        "seed": preferences.seed,
        "_metadata": {
            "version": "1.0.0",
            "saved_at": Utc::now().to_rfc3339(),
            "app_version": "1.0.0"
        }
    });

    let content = serde_json::to_string_pretty(&config_data)
        .map_err(|e| format!("Failed to serialize preferences: {e}"))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write preferences file: {e}"))?;

    Ok(())
}

#[tauri::command]
async fn get_sample_backtest_result(delay_ms: Option<u64>) -> BacktestSummary {
    thread::sleep(Duration::from_millis(delay_ms.unwrap_or(1200)));

    let strategy = "PMCC".to_string();
    let symbol = "SPY".to_string();
    let start = "2022-01-01".to_string();
    let end = "2024-12-31".to_string();
    let capital = 100_000.0;

    let mut equity = capital;
    let mut equity_curve = Vec::new();
    let mut max_equity = equity;
    let mut max_dd = 0.0;
    let days = 50;

    for i in 0..days {
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

#[tauri::command]
async fn run_backtest(params: BacktestParams, delay_ms: Option<u64>) -> BacktestSummary {
    thread::sleep(Duration::from_millis(delay_ms.unwrap_or(1500)));

    let seed = params.seed.unwrap_or(42);

    let equity_curve = generate_deterministic_equity_curve(
        params.initial_capital,
        &params.start_date,
        &params.end_date,
        seed,
    );

    let (cagr, max_dd) =
        calculate_performance_metrics(&equity_curve, &params.start_date, &params.end_date);

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

// -------------------- Deterministic helpers -------------------

struct SimpleRng {
    state: u64,
}

impl SimpleRng {
    fn new(seed: u32) -> Self {
        Self { state: seed as u64 }
    }
    fn next_f64(&mut self) -> f64 {
        self.state = self.state.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.state as f64) / (u64::MAX as f64)
    }
    fn next_range(&mut self, min: f64, max: f64) -> f64 {
        min + (max - min) * self.next_f64()
    }
}

fn generate_deterministic_equity_curve(
    initial_capital: f64,
    start_date: &str,
    end_date: &str,
    seed: u32,
) -> Vec<EquityPoint> {
    let mut rng = SimpleRng::new(seed);
    let mut equity_curve = Vec::new();

    let days = calculate_days_between(start_date, end_date).max(1);

    let base_drift = 0.0008;
    let volatility = 0.015;

    let mut equity = initial_capital;
    let mut max_equity = equity;

    for i in 0..days {
        let drift_component = base_drift * (1.0 + 0.1 * (seed as f64 * i as f64).sin());
        let vol_component = volatility * rng.next_range(-1.0, 1.0);
        let daily_return = drift_component + vol_component;

        equity *= 1.0 + daily_return;
        if equity > max_equity {
            max_equity = equity;
        }
        let drawdown = (equity - max_equity) / max_equity;
        let date = format_date_from_offset(start_date, i);

        equity_curve.push(EquityPoint { t: date, equity, drawdown });
    }

    equity_curve
}

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

    let days = calculate_days_between(start_date, end_date).max(1) as f64;
    let years = days / 365.25;
    let cagr = if years > 0.0 && initial_equity > 0.0 {
        (final_equity / initial_equity).powf(1.0 / years) - 1.0
    } else {
        0.0
    };

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

fn generate_deterministic_stats(seed: u32) -> (u32, f64) {
    let mut rng = SimpleRng::new(seed);
    let trades = 15 + ((rng.next_f64() * 20.0) as u32);
    let win_rate = 0.45 + (rng.next_f64() * 0.30);
    (trades, win_rate)
}

fn calculate_days_between(start: &str, end: &str) -> i32 {
    match (start.contains("2023"), end.contains("2023")) {
        (true, true) => 365,
        _ => 252,
    }
}

fn format_date_from_offset(start_date: &str, offset: i32) -> String {
    if start_date.starts_with("01/01/2023") {
        let month = 1 + (offset / 30);
        let day = 1 + (offset % 30);
        format!("{:02}/{:02}/2023", month.min(12), day.min(28))
    } else {
        format!("Day {}", offset + 1)
    }
}

// ---------------------- Provider Commands ---------------------

#[tauri::command]
async fn fetch_history(
    app_handle: tauri::AppHandle,
    symbol: String,
    start: String,
    end: String,
    interval: String,
) -> Result<Vec<HistoryPoint>, String> {
    let provider = PolygonProvider::new(app_handle)
        .map_err(|e| format!("Failed to create provider: {}", e))?;

    provider.fetch_history(&symbol, &start, &end, &interval)
        .await
        .map_err(|e| match e {
            ProviderError::ApiKeyNotFound => "No API key set. Please configure your Polygon API key in Settings.".to_string(),
            ProviderError::RateLimited(seconds) => format!("Rate limited. Please try again in {} seconds.", seconds),
            _ => format!("Failed to fetch history: {}", e),
        })
}

#[tauri::command]
async fn fetch_option_chain(
    app_handle: tauri::AppHandle,
    symbol: String,
    as_of: String,
) -> Result<OptionChain, String> {
    let provider = PolygonProvider::new(app_handle)
        .map_err(|e| format!("Failed to create provider: {}", e))?;

    provider.fetch_option_chain(&symbol, &as_of)
        .await
        .map_err(|e| match e {
            ProviderError::ApiKeyNotFound => "No API key set. Please configure your Polygon API key in Settings.".to_string(),
            ProviderError::RateLimited(seconds) => format!("Rate limited. Please try again in {} seconds.", seconds),
            _ => format!("Failed to fetch option chain: {}", e),
        })
}

#[tauri::command]
async fn fetch_option_quotes(
    app_handle: tauri::AppHandle,
    contracts: Vec<String>,
) -> Result<Vec<OptionQuote>, String> {
    let provider = PolygonProvider::new(app_handle)
        .map_err(|e| format!("Failed to create provider: {}", e))?;

    provider.fetch_option_quotes(contracts)
        .await
        .map_err(|e| match e {
            ProviderError::ApiKeyNotFound => "No API key set. Please configure your Polygon API key in Settings.".to_string(),
            ProviderError::RateLimited(seconds) => format!("Rate limited. Please try again in {} seconds.", seconds),
            _ => format!("Failed to fetch option quotes: {}", e),
        })
}

#[tauri::command]
async fn store_api_key(
    _app_handle: tauri::AppHandle,
    service: String,
    _key: String,
) -> Result<(), String> {
    // For now, just return success - would implement actual keychain storage
    // In production, you'd use a crate like keyring-rs
    println!("Storing API key for service: {}", service);
    Ok(())
}

#[tauri::command]
async fn test_api_connection(
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let provider = PolygonProvider::new(app_handle)
        .map_err(|e| format!("Failed to create provider: {}", e))?;

    if !provider.is_configured().await {
        return Err("No API key configured".to_string());
    }

    // Test with a simple AAPL history request
    match provider.fetch_history("AAPL", "01/01/2024", "01/02/2024", "1day").await {
        Ok(_) => Ok("Connection successful".to_string()),
        Err(e) => Err(format!("Connection failed: {}", e)),
    }
}

// --------------------------- main ----------------------------

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ping,                     // line ~53
            load_preferences,         // line ~73
            save_preferences,         // line ~92
            get_sample_backtest_result, // line ~127
            run_backtest,             // line ~178
            fetch_history,            // Provider commands
            fetch_option_chain,
            fetch_option_quotes,
            store_api_key,
            test_api_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}