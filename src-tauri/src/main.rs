#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{thread, time::Duration};

#[derive(Serialize, Deserialize, Debug, Clone)]
struct EquityPoint {
    t: String,
    equity: f64,
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

// Health check command
#[tauri::command]
async fn ping() -> &'static str {
    "ok"
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

// Runs a backtest based on JSON parameters and returns a summary
#[tauri::command]
async fn run_backtest(params: Value, delay_ms: Option<u64>) -> BacktestSummary {
    thread::sleep(Duration::from_millis(delay_ms.unwrap_or(1500)));

    // Extract parameters or default to PMCC on SPY
    let strategy = params
        .get("strategy")
        .and_then(|v| v.as_str())
        .unwrap_or("PMCC")
        .to_string();
    let symbol = params
        .get("symbol")
        .and_then(|v| v.as_str())
        .unwrap_or("SPY")
        .to_string();
    let start = params
        .get("start")
        .and_then(|v| v.as_str())
        .unwrap_or("2022-01-01")
        .to_string();
    let end = params
        .get("end")
        .and_then(|v| v.as_str())
        .unwrap_or("2024-12-31")
        .to_string();
    let capital = params
        .get("capital")
        .and_then(|v| v.as_f64())
        .unwrap_or(100_000.0);

    // Choose simple base return and volatility based on strategy
    let (base_return, volatility) = match strategy.as_str() {
        "PMCC" => (0.0008, 0.020),
        "Wheel" => (0.0006, 0.015),
        "CoveredCall" => (0.0007, 0.017),
        "iron_condor" => (0.0005, 0.012),
        "bull_put_spread" => (0.0004, 0.010),
        _ => (0.0006, 0.015),
    };

    // Generate deterministic equity curve using base return and volatility
    let mut equity = capital;
    let mut equity_curve = Vec::new();
    let mut max_equity = equity;
    let mut max_dd = 0.0;
    let days = 50;
    for i in 0..days {
        let daily_return = base_return + volatility * (i as f64 / days as f64) * 0.5;
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
        });
    }

    let cagr = ((equity / capital).powf(1.0 / (days as f64 / 252.0)) - 1.0).max(0.0);
    // For demonstration, set trades and win_rate statically; adjust to your real logic
    let trades = 20;
    let win_rate = 0.5;

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping, get_sample_backtest_result, run_backtest])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
