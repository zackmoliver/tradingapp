#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::Manager;
use tokio::time::{sleep, Duration};

// Backend integration types matching our TypeScript interfaces
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestResult {
    pub run_id: String,
    pub strategy_id: String,
    pub execution_info: ExecutionInfo,
    pub performance_summary: PerformanceSummary,
    pub equity_curve: EquityCurve,
    pub trade_summary: TradeSummary,
    pub attribution: Attribution,
    pub risk_metrics: RiskMetrics,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionInfo {
    pub start_date: String,
    pub end_date: String,
    pub duration_days: i32,
    pub total_bars: i32,
    pub execution_time_seconds: f64,
    pub initial_capital: f64,
    pub final_capital: f64,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceSummary {
    pub total_return: f64,
    pub annualized_return: f64,
    pub volatility: f64,
    pub sharpe_ratio: f64,
    pub sortino_ratio: f64,
    pub calmar_ratio: f64,
    pub max_drawdown: f64,
    pub max_drawdown_duration_days: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquityCurve {
    pub data_points: Vec<EquityPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquityPoint {
    pub date: String,
    pub portfolio_value: f64,
    pub cumulative_return: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeSummary {
    pub total_trades: i32,
    pub winning_trades: i32,
    pub losing_trades: i32,
    pub win_rate: f64,
    pub profit_factor: f64,
    pub average_win: f64,
    pub average_loss: f64,
    pub largest_win: f64,
    pub largest_loss: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attribution {
    pub by_symbol: HashMap<String, AttributionItem>,
    pub by_strategy: HashMap<String, AttributionItem>,
    pub by_sector: HashMap<String, AttributionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttributionItem {
    pub total_return: f64,
    pub contribution: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskMetrics {
    pub value_at_risk_95: f64,
    pub conditional_var_95: f64,
    pub beta: f64,
    pub correlation_to_benchmark: f64,
    pub tracking_error: f64,
    pub information_ratio: f64,
}

#[tauri::command]
async fn get_sample_backtest_result() -> Result<BacktestResult, String> {
    // Simulate some processing time to test loading states
    sleep(Duration::from_millis(1500)).await;

    // Generate realistic equity curve data
    let mut equity_points = Vec::new();
    let start_date = chrono::NaiveDate::from_ymd_opt(2023, 1, 1).unwrap();
    let mut current_value = 100000.0;

    for i in 0..252 {
        let date = start_date + chrono::Duration::days(i);
        let daily_return = 0.0008 + (i as f64 * 0.00001); // Trending upward
        current_value *= 1.0 + daily_return;

        equity_points.push(EquityPoint {
            date: date.format("%Y-%m-%d").to_string(),
            portfolio_value: current_value,
            cumulative_return: (current_value - 100000.0) / 100000.0,
        });
    }

    let result = BacktestResult {
        run_id: "sample-run-2024-001".to_string(),
        strategy_id: "iron_condor_strategy".to_string(),
        execution_info: ExecutionInfo {
            start_date: "2023-01-01".to_string(),
            end_date: "2023-12-31".to_string(),
            duration_days: 365,
            total_bars: 252,
            execution_time_seconds: 12.5,
            initial_capital: 100000.0,
            final_capital: current_value,
            currency: "USD".to_string(),
        },
        performance_summary: PerformanceSummary {
            total_return: (current_value - 100000.0) / 100000.0,
            annualized_return: 0.2847,
            volatility: 0.1523,
            sharpe_ratio: 1.87,
            sortino_ratio: 2.34,
            calmar_ratio: 4.12,
            max_drawdown: 0.0691,
            max_drawdown_duration_days: 23,
        },
        equity_curve: EquityCurve {
            data_points: equity_points,
        },
        trade_summary: TradeSummary {
            total_trades: 48,
            winning_trades: 32,
            losing_trades: 16,
            win_rate: 0.6667,
            profit_factor: 1.85,
            average_win: 1250.0,
            average_loss: 750.0,
            largest_win: 3200.0,
            largest_loss: 1800.0,
        },
        attribution: Attribution {
            by_symbol: {
                let mut map = HashMap::new();
                map.insert("AAPL".to_string(), AttributionItem { total_return: 0.12, contribution: 0.4 });
                map.insert("MSFT".to_string(), AttributionItem { total_return: 0.08, contribution: 0.3 });
                map.insert("GOOGL".to_string(), AttributionItem { total_return: 0.15, contribution: 0.3 });
                map
            },
            by_strategy: {
                let mut map = HashMap::new();
                map.insert("iron_condor_strategy".to_string(), AttributionItem { total_return: 0.2847, contribution: 1.0 });
                map
            },
            by_sector: {
                let mut map = HashMap::new();
                map.insert("Technology".to_string(), AttributionItem { total_return: 0.2847, contribution: 1.0 });
                map
            },
        },
        risk_metrics: RiskMetrics {
            value_at_risk_95: -0.0234,
            conditional_var_95: -0.0312,
            beta: 0.87,
            correlation_to_benchmark: 0.73,
            tracking_error: 0.045,
            information_ratio: 0.92,
        },
        metadata: {
            let mut map = HashMap::new();
            map.insert("schema_version".to_string(), serde_json::Value::String("1.0.0".to_string()));
            map.insert("generator".to_string(), serde_json::Value::String("TradingEngine BacktestRunner v1.0.0".to_string()));
            map.insert("generated_at".to_string(), serde_json::Value::String(chrono::Utc::now().to_rfc3339()));
            map
        },
    };

    Ok(result)
}

#[tauri::command]
async fn run_backtest(params: serde_json::Value) -> Result<BacktestResult, String> {
    // Simulate realistic backtest processing time
    sleep(Duration::from_millis(3000)).await;

    // Extract parameters with defaults
    let ticker = params.get("ticker")
        .and_then(|v| v.as_str())
        .unwrap_or("AAPL");

    let start_date = params.get("start_date")
        .and_then(|v| v.as_str())
        .unwrap_or("01/01/2023");

    let end_date = params.get("end_date")
        .and_then(|v| v.as_str())
        .unwrap_or("12/31/2023");

    let strategy = params.get("strategy")
        .and_then(|v| v.as_str())
        .unwrap_or("iron_condor");

    let seed = params.get("seed")
        .and_then(|v| v.as_u64())
        .unwrap_or(42) as u32;

    let initial_capital = params.get("initial_capital")
        .and_then(|v| v.as_f64())
        .unwrap_or(100000.0);

    println!("Running backtest: {} on {} from {} to {} (seed: {})",
             strategy, ticker, start_date, end_date, seed);

    // Generate deterministic results based on parameters
    let result = generate_deterministic_backtest(
        ticker, start_date, end_date, strategy, seed, initial_capital
    )?;

    Ok(result)
}

fn generate_deterministic_backtest(
    ticker: &str,
    start_date: &str,
    end_date: &str,
    strategy: &str,
    seed: u32,
    initial_capital: f64,
) -> Result<BacktestResult, String> {
    // Parse dates (MM/DD/YYYY format)
    let start = parse_date_mmddyyyy(start_date)
        .map_err(|_| format!("Invalid start date format: {}", start_date))?;
    let end = parse_date_mmddyyyy(end_date)
        .map_err(|_| format!("Invalid end date format: {}", end_date))?;

    if end <= start {
        return Err("End date must be after start date".to_string());
    }

    let duration_days = (end - start).num_days() as i32;
    let trading_days = (duration_days as f64 * 0.7) as i32; // Approximate trading days

    // Generate deterministic equity curve
    let equity_points = generate_deterministic_equity_curve(
        start, trading_days, initial_capital, seed, ticker, strategy
    );

    let final_capital = equity_points.last()
        .map(|p| p.portfolio_value)
        .unwrap_or(initial_capital);

    // Calculate performance metrics
    let total_return = (final_capital - initial_capital) / initial_capital;
    let annualized_return = if duration_days > 0 {
        ((final_capital / initial_capital).powf(365.0 / duration_days as f64)) - 1.0
    } else {
        total_return
    };

    // Generate strategy-specific metrics
    let (volatility, sharpe_ratio, max_drawdown, trades) = calculate_strategy_metrics(
        &equity_points, strategy, seed, annualized_return
    );

    let run_id = format!("{}-{}-{}", strategy, ticker, seed);

    Ok(BacktestResult {
        run_id,
        strategy_id: format!("{}_strategy", strategy),
        execution_info: ExecutionInfo {
            start_date: start_date.to_string(),
            end_date: end_date.to_string(),
            duration_days,
            total_bars: trading_days,
            execution_time_seconds: 3.0 + (seed % 5) as f64,
            initial_capital,
            final_capital,
            currency: "USD".to_string(),
        },
        performance_summary: PerformanceSummary {
            total_return,
            annualized_return,
            volatility,
            sharpe_ratio,
            sortino_ratio: sharpe_ratio * 1.2, // Approximation
            calmar_ratio: if max_drawdown > 0.0 { annualized_return / max_drawdown } else { 0.0 },
            max_drawdown,
            max_drawdown_duration_days: 15 + (seed % 20) as i32,
        },
        equity_curve: EquityCurve {
            data_points: equity_points,
        },
        trade_summary: TradeSummary {
            total_trades: trades,
            winning_trades: (trades as f64 * (0.55 + (seed % 20) as f64 / 100.0)) as i32,
            losing_trades: trades - (trades as f64 * (0.55 + (seed % 20) as f64 / 100.0)) as i32,
            win_rate: 0.55 + (seed % 20) as f64 / 100.0,
            profit_factor: 1.2 + (seed % 10) as f64 / 10.0,
            average_win: 800.0 + (seed % 500) as f64,
            average_loss: 450.0 + (seed % 300) as f64,
            largest_win: 2500.0 + (seed % 1000) as f64,
            largest_loss: 1200.0 + (seed % 600) as f64,
        },
        attribution: Attribution {
            by_symbol: {
                let mut map = HashMap::new();
                map.insert(ticker.to_string(), AttributionItem {
                    total_return,
                    contribution: 1.0
                });
                map
            },
            by_strategy: {
                let mut map = HashMap::new();
                map.insert(format!("{}_strategy", strategy), AttributionItem {
                    total_return,
                    contribution: 1.0
                });
                map
            },
            by_sector: {
                let mut map = HashMap::new();
                let sector = match ticker {
                    "AAPL" | "MSFT" | "GOOGL" => "Technology",
                    "JPM" | "BAC" => "Financial",
                    "JNJ" | "PFE" => "Healthcare",
                    _ => "Mixed",
                };
                map.insert(sector.to_string(), AttributionItem {
                    total_return,
                    contribution: 1.0
                });
                map
            },
        },
        risk_metrics: RiskMetrics {
            value_at_risk_95: -0.02 - (seed % 10) as f64 / 1000.0,
            conditional_var_95: -0.03 - (seed % 15) as f64 / 1000.0,
            beta: 0.8 + (seed % 40) as f64 / 100.0,
            correlation_to_benchmark: 0.65 + (seed % 30) as f64 / 100.0,
            tracking_error: 0.03 + (seed % 20) as f64 / 1000.0,
            information_ratio: 0.5 + (seed % 50) as f64 / 100.0,
        },
        metadata: {
            let mut map = HashMap::new();
            map.insert("schema_version".to_string(), serde_json::Value::String("1.0.0".to_string()));
            map.insert("generator".to_string(), serde_json::Value::String("TradingEngine BacktestRunner v1.0.0".to_string()));
            map.insert("generated_at".to_string(), serde_json::Value::String(chrono::Utc::now().to_rfc3339()));
            map.insert("ticker".to_string(), serde_json::Value::String(ticker.to_string()));
            map.insert("strategy".to_string(), serde_json::Value::String(strategy.to_string()));
            map.insert("seed".to_string(), serde_json::Value::Number(serde_json::Number::from(seed)));
            map
        },
    })
}

fn parse_date_mmddyyyy(date_str: &str) -> Result<chrono::NaiveDate, chrono::ParseError> {
    chrono::NaiveDate::parse_from_str(date_str, "%m/%d/%Y")
}

fn generate_deterministic_equity_curve(
    start_date: chrono::NaiveDate,
    trading_days: i32,
    initial_capital: f64,
    seed: u32,
    ticker: &str,
    strategy: &str,
) -> Vec<EquityPoint> {
    let mut equity_points = Vec::new();
    let mut current_value = initial_capital;
    let mut rng_state = seed;

    // Strategy-specific parameters
    let (base_return, volatility_factor, trend_factor) = match strategy {
        "iron_condor" => (0.0005, 0.8, 0.3),      // Low volatility, slight upward trend
        "wheel" => (0.0008, 1.0, 0.5),            // Moderate volatility, steady trend
        "pmcc" => (0.0012, 1.2, 0.7),             // Higher volatility, stronger trend
        "bull_put_spread" => (0.0006, 0.9, 0.4),  // Moderate volatility, slight trend
        _ => (0.0007, 1.0, 0.5),                   // Default parameters
    };

    // Ticker-specific adjustments
    let ticker_multiplier = match ticker {
        "AAPL" => 1.1,
        "MSFT" => 1.0,
        "GOOGL" => 1.2,
        "TSLA" => 1.5,
        "SPY" => 0.8,
        _ => 1.0,
    };

    for i in 0..trading_days {
        let current_date = start_date + chrono::Duration::days(i as i64);

        // Generate deterministic but realistic returns
        rng_state = rng_state.wrapping_mul(1103515245).wrapping_add(12345);
        let random_factor = (rng_state as f64 / u32::MAX as f64) - 0.5; // -0.5 to 0.5

        // Calculate daily return with trend and volatility
        let trend_component = base_return * trend_factor * ticker_multiplier;
        let volatility_component = random_factor * volatility_factor * ticker_multiplier * 0.02;
        let daily_return = trend_component + volatility_component;

        // Apply some market regime changes
        let regime_factor = if i > trading_days / 3 && i < 2 * trading_days / 3 {
            0.7 // Simulate a drawdown period
        } else {
            1.0
        };

        current_value *= 1.0 + (daily_return * regime_factor);

        // Ensure we don't go below a reasonable minimum
        current_value = current_value.max(initial_capital * 0.3);

        equity_points.push(EquityPoint {
            date: current_date.format("%m/%d/%Y").to_string(),
            portfolio_value: current_value,
            cumulative_return: (current_value - initial_capital) / initial_capital,
        });
    }

    equity_points
}

fn calculate_strategy_metrics(
    equity_points: &[EquityPoint],
    strategy: &str,
    seed: u32,
    annualized_return: f64,
) -> (f64, f64, f64, i32) {
    if equity_points.is_empty() {
        return (0.0, 0.0, 0.0, 0);
    }

    // Calculate volatility from equity curve
    let returns: Vec<f64> = equity_points.windows(2)
        .map(|w| (w[1].portfolio_value - w[0].portfolio_value) / w[0].portfolio_value)
        .collect();

    let mean_return = returns.iter().sum::<f64>() / returns.len() as f64;
    let variance = returns.iter()
        .map(|r| (r - mean_return).powi(2))
        .sum::<f64>() / returns.len() as f64;
    let volatility = variance.sqrt() * (252.0_f64).sqrt(); // Annualized

    // Calculate maximum drawdown
    let mut peak = equity_points[0].portfolio_value;
    let mut max_drawdown = 0.0;

    for point in equity_points {
        if point.portfolio_value > peak {
            peak = point.portfolio_value;
        }
        let drawdown = (peak - point.portfolio_value) / peak;
        if drawdown > max_drawdown {
            max_drawdown = drawdown;
        }
    }

    // Calculate Sharpe ratio (assuming 2% risk-free rate)
    let risk_free_rate = 0.02;
    let sharpe_ratio = if volatility > 0.0 {
        (annualized_return - risk_free_rate) / volatility
    } else {
        0.0
    };

    // Strategy-specific trade counts
    let base_trades = match strategy {
        "iron_condor" => 24,      // Monthly trades
        "wheel" => 52,            // Weekly trades
        "pmcc" => 36,             // Bi-weekly trades
        "bull_put_spread" => 48,  // Bi-weekly trades
        _ => 40,
    };

    let trades = base_trades + (seed % 20) as i32;

    (volatility, sharpe_ratio, max_drawdown, trades)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_sample_backtest_result,
            run_backtest
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}