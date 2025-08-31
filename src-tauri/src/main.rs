#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod provider {
    pub mod polygon;
    pub mod yahoo;
}

mod providers {
    pub mod polygon;
}

mod storage {
    pub mod cache;
}

mod engine {
    pub mod types;
    pub mod broker;
    pub mod mtm;
    pub mod risk;
    pub mod calendar;
    pub mod r#loop;
}

use provider::polygon as poly;
use provider::yahoo as yfin;
use providers::polygon::{PolygonProvider, OhlcBar};
use engine::broker::PaperBroker;
use engine::types::{OrderRequest, TradeExecution, Portfolio, Trade, MarketData, EnhancedPortfolio};
use engine::risk::RiskMetrics;
use engine::calendar::TradingSession;
use engine::r#loop::{StrategyLoop, StrategyLoopConfig, LoopState, SignalEvaluation};
use storage::cache::JournalStats;

use serde::{Deserialize, Serialize};
use std::{fs, time::Instant};
use tauri::{Manager, Emitter};

//
// ---------- Types shared with frontend ----------
//

#[tauri::command]
async fn get_sample_backtest_result() -> BacktestSummary {
    // TODO: return your existing sample, or synthesize a small curve
    // minimal safe stub:
    BacktestSummary {
        strategy: "PMCC".into(),
        symbol: "SPY".into(),
        start: "01/01/2023".into(),
        end: "12/31/2023".into(),
        capital: 100_000.0,
        cagr: 0.12,
        trades: 40,
        win_rate: 0.55,
        max_dd: -0.15,
        equity_curve: (0..252).scan((100000.0f64, 100000.0f64), |state, i|{
          let r = 0.0006f64;
          state.0 *= 1.0 + r;
          state.1 = state.1.max(state.0);
          Some(EquityPoint{
            t: format!("{:02}/{:02}/2023", (i % 12) + 1, (i % 28) + 1),
            equity: state.0,
            drawdown: (state.0 - state.1) / state.1
          })
        }).collect()
    }
}



#[tauri::command]
async fn suggest_and_analyze(_params: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
      "ok": true,
      "notes": ["stub"],
      "recommendation": { "strategy": "PMCC", "confidence": 0.6 }
    })
}

#[tauri::command]
async fn fetch_news_sentiment(symbol: String) -> serde_json::Value {
    serde_json::json!({ "symbol": symbol, "stories": [], "sentiment": 0.0 })
}

#[tauri::command]
async fn fetch_polygon_bars(
    symbol: String,
    from: String,
    to: String,
    apikey: String
) -> serde_json::Value {
    // Construct Polygon API URL
    let url = format!(
        "https://api.polygon.io/v2/aggs/ticker/{}/range/1/day/{}/{}?adjusted=true&sort=asc&apikey={}",
        symbol.to_uppercase(),
        from,
        to,
        apikey
    );

    // Make HTTP request
    match reqwest::get(&url).await {
        Ok(response) => {
            match response.json::<serde_json::Value>().await {
                Ok(data) => data,
                Err(e) => {
                    eprintln!("Failed to parse Polygon response: {}", e);
                    serde_json::json!({
                        "status": "ERROR",
                        "error": "Failed to parse response"
                    })
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to fetch from Polygon: {}", e);
            serde_json::json!({
                "status": "ERROR",
                "error": format!("HTTP request failed: {}", e)
            })
        }
    }
}



#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EquityPoint {
    pub t: String,     // MM/DD/YYYY
    pub equity: f64,   // portfolio equity
    pub drawdown: f64, // <= 0
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BacktestParams {
    pub ticker: String,
    pub start_date: String,   // MM/DD/YYYY
    pub end_date: String,     // MM/DD/YYYY
    pub strategy: String,     // e.g. "BuyHold" / "PMCC"
    pub initial_capital: f64, // e.g. 100000
    pub seed: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BacktestSummary {
    pub strategy: String,
    pub symbol: String,
    pub start: String,
    pub end: String,
    pub capital: f64,
    pub cagr: f64,
    pub trades: u32,
    pub win_rate: f64, // 0..1
    pub max_dd: f64,   // <= 0
    pub equity_curve: Vec<EquityPoint>,
}

#[derive(Serialize, Deserialize, Debug)]
struct PingResponse {
    ok: bool,
    ts: u64,
}

//
// ---------- Helper math ----------
//

fn calc_drawdown_series(eqs: &[f64]) -> (Vec<f64>, f64) {
    let mut max_run = if eqs.is_empty() { 0.0 } else { eqs[0] };
    let mut dds = Vec::with_capacity(eqs.len());
    let mut min_dd = 0.0;
    for &e in eqs {
        if e > max_run {
            max_run = e;
        }
        let dd = if max_run > 0.0 { (e - max_run) / max_run } else { 0.0 };
        if dd < min_dd {
            min_dd = dd;
        }
        dds.push(dd);
    }
    (dds, min_dd)
}

fn annualized_cagr(first: f64, last: f64, days: usize) -> f64 {
    if first <= 0.0 || last <= 0.0 || days == 0 {
        return 0.0;
    }
    let years = (days as f64) / 365.25;
    if years <= 0.0 {
        0.0
    } else {
        (last / first).powf(1.0 / years) - 1.0
    }
}

//
// ---------- Commands: utilities ----------
//

#[tauri::command]
async fn ping() -> PingResponse {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    PingResponse { ok: true, ts }
}

fn prefs_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let p = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(p.join("trading-app").join("config.json"))
}

#[tauri::command]
async fn load_preferences(app: tauri::AppHandle) -> Result<Option<BacktestParams>, String> {
    let path = prefs_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let p: BacktestParams = serde_json::from_value(v).map_err(|e| e.to_string())?;
    Ok(Some(p))
}

#[tauri::command]
async fn save_preferences(app: tauri::AppHandle, preferences: BacktestParams) -> Result<(), String> {
    let path = prefs_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let v = serde_json::json!({
        "ticker": preferences.ticker,
        "start_date": preferences.start_date,
        "end_date": preferences.end_date,
        "strategy": preferences.strategy,
        "initial_capital": preferences.initial_capital,
        "seed": preferences.seed
    });
    fs::write(path, serde_json::to_string_pretty(&v).unwrap()).map_err(|e| e.to_string())
}

//
// ---------- Commands: data providers ----------
//

#[tauri::command]
async fn save_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    poly::save_polygon_key(&app, key).await
}

#[tauri::command]
async fn fetch_history(
    app: tauri::AppHandle,
    symbol: String,
    start: String,
    end: String,
    interval: Option<String>,
) -> Result<Vec<poly::Bar>, String> {
    poly::fetch_history(&app, symbol, start, end, interval).await
}

#[tauri::command]
async fn fetch_history_yahoo(symbol: String, start: String, end: String) -> Result<Vec<yfin::YBar>, String> {
    yfin::yahoo_history(symbol, start, end).await
}

#[tauri::command]
async fn fetch_news(app: tauri::AppHandle, symbol: String, days: u32) -> Result<(f64, Vec<poly::NewsItem>), String> {
    poly::fetch_news(&app, symbol, days).await
}

// Additional command stubs to prevent "command not found" errors
#[tauri::command]
async fn adaptive_run(_mode: String) -> serde_json::Value {
    serde_json::json!({
        "status": "stub",
        "message": "Adaptive run not implemented yet"
    })
}

#[tauri::command]
async fn fetch_option_chain(_symbol: String, _expiry: String) -> serde_json::Value {
    serde_json::json!({
        "status": "stub",
        "chains": []
    })
}

#[tauri::command]
async fn fetch_option_quotes(_symbols: Vec<String>) -> serde_json::Value {
    serde_json::json!({
        "status": "stub",
        "quotes": []
    })
}

#[tauri::command]
async fn store_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    // Alias for save_api_key for backward compatibility
    save_api_key(app, key).await
}

#[tauri::command]
async fn test_api_connection() -> Result<String, String> {
    Ok("Connection test not implemented".to_string())
}

//
// ---------- Commands: Realtime Data & Streaming ----------
//

#[tauri::command]
async fn fetch_ohlc(
    app: tauri::AppHandle,
    symbol: String,
    start: String,
    end: String,
    tf: String,
) -> Result<Vec<OhlcBar>, String> {
    let provider = PolygonProvider::new(app);
    provider.fetch_ohlc(&symbol, &start, &end, &tf).await
}

#[tauri::command]
async fn start_stream(
    app: tauri::AppHandle,
    symbols: Vec<String>,
) -> Result<(), String> {
    // Store provider in app state - for now we'll create a new one each time
    // In production, you'd want to manage this as persistent state
    let mut provider = PolygonProvider::new(app);
    provider.start_stream(symbols).await
}

#[tauri::command]
async fn stop_stream(app: tauri::AppHandle) -> Result<(), String> {
    // For now, we'll emit a stop signal
    // In production, you'd access the stored provider state
    let _ = app.emit("stream_stop_requested", ());
    Ok(())
}

//
// ---------- Commands: Paper Broker ----------
//

#[tauri::command]
async fn paper_order(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
    req: OrderRequest,
) -> Result<TradeExecution, String> {
    let mut broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    broker.place_order(req)
}

#[tauri::command]
async fn portfolio(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
) -> Result<Portfolio, String> {
    let broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(broker.get_portfolio())
}

#[tauri::command]
async fn trades(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
) -> Result<Vec<Trade>, String> {
    let broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(broker.get_trades())
}

#[tauri::command]
async fn cancel_order(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
    order_id: String,
) -> Result<(), String> {
    let mut broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    broker.cancel_order(&order_id)
}

#[tauri::command]
async fn close_position(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
    symbol: String,
) -> Result<TradeExecution, String> {
    let mut broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    broker.close_position(&symbol)
}

#[tauri::command]
async fn update_market_data(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
    data: MarketData,
) -> Result<(), String> {
    let mut broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    broker.update_market_data(data);
    Ok(())
}

#[tauri::command]
async fn enhanced_portfolio(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
) -> Result<EnhancedPortfolio, String> {
    let broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(broker.get_enhanced_portfolio())
}

#[tauri::command]
async fn risk_status(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
) -> Result<RiskMetrics, String> {
    let broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(broker.get_risk_status())
}

#[tauri::command]
async fn risk_violations(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
) -> Result<Vec<String>, String> {
    let broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(broker.get_risk_violations())
}

#[tauri::command]
async fn update_risk_metrics(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
) -> Result<(), String> {
    let mut broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    broker.update_risk_metrics();
    Ok(())
}

//
// ---------- Commands: Broker Persistence ----------
//

#[tauri::command]
async fn save_broker_state(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
) -> Result<(), String> {
    let mut broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    broker.save_state()
}

#[tauri::command]
async fn get_journal_stats(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
) -> Result<JournalStats, String> {
    let broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    broker.get_journal_stats()
}

#[tauri::command]
async fn backup_journal(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
    backup_suffix: String,
) -> Result<String, String> {
    let broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    let backup_path = broker.backup_journal(&backup_suffix)?;
    Ok(backup_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn set_auto_save(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
    enabled: bool,
) -> Result<(), String> {
    let mut broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    broker.set_auto_save(enabled);
    Ok(())
}

//
// ---------- Commands: Market Calendar ----------
//

#[tauri::command]
async fn get_current_session(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
) -> Result<TradingSession, String> {
    let broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(broker.get_current_session())
}

#[tauri::command]
async fn is_market_open(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
) -> Result<bool, String> {
    let broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(broker.is_market_open())
}

#[tauri::command]
async fn get_next_session_start(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
) -> Result<Option<i64>, String> {
    let broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(broker.get_next_session_start())
}

#[tauri::command]
async fn configure_extended_hours(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
    premarket: bool,
    afterhours: bool,
) -> Result<(), String> {
    let mut broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    broker.configure_extended_hours(premarket, afterhours);
    Ok(())
}

#[tauri::command]
async fn set_holiday_trading(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
    enabled: bool,
) -> Result<(), String> {
    let mut broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;
    broker.set_holiday_trading(enabled);
    Ok(())
}

#[tauri::command]
async fn add_custom_holiday(
    broker: tauri::State<'_, std::sync::Mutex<PaperBroker>>,
    date: String, // MM/DD/YYYY format
    name: String,
    is_early_close: bool,
) -> Result<(), String> {
    let mut broker = broker.lock().map_err(|e| format!("Lock error: {}", e))?;

    // Parse MM/DD/YYYY date format
    let date_parts: Vec<&str> = date.split('/').collect();
    if date_parts.len() != 3 {
        return Err("Date must be in MM/DD/YYYY format".to_string());
    }

    let month: u32 = date_parts[0].parse()
        .map_err(|_| "Invalid month".to_string())?;
    let day: u32 = date_parts[1].parse()
        .map_err(|_| "Invalid day".to_string())?;
    let year: i32 = date_parts[2].parse()
        .map_err(|_| "Invalid year".to_string())?;

    let naive_date = chrono::NaiveDate::from_ymd_opt(year, month, day)
        .ok_or("Invalid date".to_string())?;

    broker.add_custom_holiday(naive_date, name, is_early_close);
    Ok(())
}

//
// ---------- Commands: Strategy Loop ----------
//

#[tauri::command]
fn start_strategy_loop(
    strategy_loop: tauri::State<'_, std::sync::Mutex<StrategyLoop>>,
) -> Result<(), String> {
    let mut loop_guard = strategy_loop.lock().map_err(|e| format!("Lock error: {}", e))?;
    // Use blocking version or spawn the async operation
    tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(loop_guard.start())
    })
}

#[tauri::command]
fn stop_strategy_loop(
    strategy_loop: tauri::State<'_, std::sync::Mutex<StrategyLoop>>,
) -> Result<(), String> {
    let mut loop_guard = strategy_loop.lock().map_err(|e| format!("Lock error: {}", e))?;
    tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(loop_guard.stop())
    })
}

#[tauri::command]
fn get_strategy_loop_state(
    strategy_loop: tauri::State<'_, std::sync::Mutex<StrategyLoop>>,
) -> Result<LoopState, String> {
    let loop_guard = strategy_loop.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(loop_guard.get_state())
    }))
}

#[tauri::command]
fn get_strategy_loop_config(
    strategy_loop: tauri::State<'_, std::sync::Mutex<StrategyLoop>>,
) -> Result<StrategyLoopConfig, String> {
    let loop_guard = strategy_loop.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(loop_guard.get_config())
    }))
}

#[tauri::command]
fn update_strategy_loop_config(
    strategy_loop: tauri::State<'_, std::sync::Mutex<StrategyLoop>>,
    config: StrategyLoopConfig,
) -> Result<(), String> {
    let mut loop_guard = strategy_loop.lock().map_err(|e| format!("Lock error: {}", e))?;
    tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(loop_guard.update_config(config))
    })
}

#[tauri::command]
fn reset_strategy_loop_state(
    strategy_loop: tauri::State<'_, std::sync::Mutex<StrategyLoop>>,
) -> Result<(), String> {
    let mut loop_guard = strategy_loop.lock().map_err(|e| format!("Lock error: {}", e))?;
    tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(loop_guard.reset_state())
    })
}

//
// ---------- Command: run_backtest (uses Polygon, falls back to Yahoo) ----------
//

#[tauri::command]
async fn run_backtest(app: tauri::AppHandle, params: BacktestParams) -> Result<BacktestSummary, String> {
    let t0 = Instant::now();

    // Try Polygon first
    let bars_res = fetch_history(
        app.clone(),
        params.ticker.clone(),
        params.start_date.clone(),
        params.end_date.clone(),
        Some("1day".into()),
    )
    .await
    .map(|v| {
        v.into_iter()
            .map(|b| (b.date, b.c))
            .collect::<Vec<(String, f64)>>()
    });

    // Fallback to Yahoo if Polygon fails
    let closes: Vec<(String, f64)> = match bars_res {
        Ok(v) if !v.is_empty() => v,
        _ => fetch_history_yahoo(params.ticker.clone(), params.start_date.clone(), params.end_date.clone())
            .await
            .map_err(|e| format!("Both providers failed: {e}"))?
            .into_iter()
            .map(|b| (b.date, b.c))
            .collect(),
    };

    // If we have insufficient data, return empty result (frontend will handle with synthetic data)
    if closes.len() < 2 {
        return Ok(BacktestSummary {
            strategy: params.strategy.clone(),
            symbol: params.ticker.clone(),
            start: params.start_date.clone(),
            end: params.end_date.clone(),
            capital: params.initial_capital,
            cagr: 0.0,
            trades: 0,
            win_rate: 0.0,
            max_dd: 0.0,
            equity_curve: vec![], // Empty curve - frontend will detect and use synthetic data
        });
    }

    // Simple buy & hold example backtest; replace with your strategy later.
    let mut equity_curve = Vec::with_capacity(closes.len());
    let mut equities = Vec::with_capacity(closes.len());

    let start_close = closes[0].1.max(1e-9);
    let mut equity = params.initial_capital;

    for (i, (d, c)) in closes.iter().enumerate() {
        // scale equity proportional to close/first_close
        equity = params.initial_capital * (*c / start_close);
        equities.push(equity);
        // drawdown computed later
        equity_curve.push(EquityPoint {
            t: d.clone(),
            equity,
            drawdown: 0.0,
        });
    }

    let (dd_series, max_dd) = calc_drawdown_series(&equities);
    for (i, dd) in dd_series.into_iter().enumerate() {
        equity_curve[i].drawdown = dd;
    }

    // Daily positive return as a proxy for "win"
    let mut wins = 0u32;
    let mut trades = 0u32;
    for i in 1..closes.len() {
        let r = (closes[i].1 / closes[i - 1].1) - 1.0;
        trades += 1;
        if r > 0.0 {
            wins += 1;
        }
    }
    let win_rate = (wins as f64) / (trades as f64);

    let cagr = annualized_cagr(equity_curve[0].equity, equity_curve.last().unwrap().equity, closes.len());

    let out = BacktestSummary {
        strategy: params.strategy.clone(),
        symbol: params.ticker.clone(),
        start: params.start_date.clone(),
        end: params.end_date.clone(),
        capital: params.initial_capital,
        cagr,
        trades,
        win_rate,
        max_dd,
        equity_curve,
    };

    let _elapsed_ms = t0.elapsed().as_millis();
    Ok(out)
}

// Helper function to generate synthetic equity curve
fn generate_deterministic_equity_curve(days: usize, start_equity: f64, seed: u64) -> Vec<EquityPoint> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    seed.hash(&mut hasher);
    let mut rng_state = hasher.finish();

    // Simple LCG for deterministic random numbers
    let mut next_random = move || {
        rng_state = rng_state.wrapping_mul(1103515245).wrapping_add(12345);
        (rng_state / 65536) % 32768
    };

    let mut equity = start_equity;
    let mut max_equity = start_equity;
    let mut curve = Vec::with_capacity(days);

    for i in 0..days {
        // Generate deterministic return
        let rand_val = next_random() as f64 / 32767.0; // 0 to 1
        let daily_return = 0.0006 + (rand_val - 0.5) * 0.02; // ~0.06% avg with volatility

        equity *= 1.0 + daily_return;
        max_equity = max_equity.max(equity);
        let drawdown = (equity - max_equity) / max_equity;

        curve.push(EquityPoint {
            t: format!("{:02}/{:02}/2023", (i % 12) + 1, (i % 28) + 1),
            equity,
            drawdown,
        });
    }

    curve
}



//
// ---------- App bootstrap ----------
//

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize paper broker with $100,000 starting capital
            let mut paper_broker = PaperBroker::new(100000.0);

            // Initialize storage and restore state
            if let Err(e) = paper_broker.initialize_storage(&app.handle()) {
                eprintln!("Failed to initialize broker storage: {}", e);
            }

            // Create shared broker reference for strategy loop
            let broker_arc = std::sync::Arc::new(tokio::sync::Mutex::new(paper_broker));

            // Initialize strategy loop
            let strategy_loop = StrategyLoop::new(broker_arc.clone(), app.handle().clone());

            // Convert Arc<tokio::Mutex<PaperBroker>> back to PaperBroker for std::sync::Mutex
            // This is a workaround for the different mutex types
            let paper_broker_for_tauri = {
                let broker_guard = broker_arc.blocking_lock();
                broker_guard.clone()
            };

            // Manage the broker state and strategy loop
            app.manage(std::sync::Mutex::new(paper_broker_for_tauri));
            app.manage(std::sync::Mutex::new(strategy_loop));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // utils / prefs
            ping,
            load_preferences,
            save_preferences,
            // data
            save_api_key,
            store_api_key,
            test_api_connection,
            fetch_history,
            fetch_history_yahoo,
            fetch_news,
            fetch_polygon_bars,
            fetch_option_chain,
            fetch_option_quotes,
            // realtime data
            fetch_ohlc,
            start_stream,
            stop_stream,
            // paper broker
            paper_order,
            portfolio,
            trades,
            cancel_order,
            close_position,
            update_market_data,
            // enhanced portfolio & risk
            enhanced_portfolio,
            risk_status,
            risk_violations,
            update_risk_metrics,
            // broker persistence
            save_broker_state,
            get_journal_stats,
            backup_journal,
            set_auto_save,
            // market calendar
            get_current_session,
            is_market_open,
            get_next_session_start,
            configure_extended_hours,
            set_holiday_trading,
            add_custom_holiday,
            // strategy loop
            start_strategy_loop,
            stop_strategy_loop,
            get_strategy_loop_state,
            get_strategy_loop_config,
            update_strategy_loop_config,
            reset_strategy_loop_state,
            // backtest
            run_backtest,
            get_sample_backtest_result,
            suggest_and_analyze,
            fetch_news_sentiment,
            // adaptive
            adaptive_run,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
