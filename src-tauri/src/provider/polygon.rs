use chrono::{NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::Manager; // brings .path() into scope for AppHandle

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Bar {
    pub date: String, // MM/DD/YYYY
    pub o: f64,
    pub h: f64,
    pub l: f64,
    pub c: f64,
    pub v: f64,
}

#[derive(Deserialize)]
struct AggsResponse {
    results: Option<Vec<AggBar>>,
}
#[derive(Deserialize)]
struct AggBar {
    t: i64,
    o: f64,
    h: f64,
    l: f64,
    c: f64,
    v: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NewsItem {
    pub title: String,
    pub article_url: String,
    pub published_utc: String,
    pub tickers: Option<Vec<String>>,
    #[serde(default)]
    pub sentiment: Option<f64>,
}

#[derive(Deserialize)]
struct NewsResponse {
    results: Option<Vec<NewsItem>>,
}

fn to_mmddyyyy(ms: i64) -> String {
    let dt = NaiveDateTime::from_timestamp_millis(ms)
        .unwrap_or_else(|| NaiveDateTime::from_timestamp_opt(0, 0).unwrap());
    dt.format("%m/%d/%Y").to_string()
}

fn app_cache_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("trading-app"))
}

async fn read_key(app: &tauri::AppHandle) -> Result<String, String> {
    if let Ok(k) = std::env::var("POLYGON_API_KEY") {
        if !k.is_empty() {
            return Ok(k);
        }
    }
    let secrets = app_cache_dir(app)?.join("secrets.json");
    if secrets.exists() {
        let text = std::fs::read_to_string(&secrets).map_err(|e| e.to_string())?;
        let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        if let Some(k) = v.get("polygon").and_then(|x| x.as_str()) {
            return Ok(k.to_string());
        }
    }
    Err("Polygon API key not set. Save it in settings or set POLYGON_API_KEY".into())
}

pub async fn save_polygon_key(app: &tauri::AppHandle, key: String) -> Result<(), String> {
    let dir = app_cache_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("secrets.json");
    let mut obj = if path.exists() {
        serde_json::from_str::<serde_json::Value>(&std::fs::read_to_string(&path).map_err(|e| e.to_string())?)
            .unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    obj["polygon"] = serde_json::Value::String(key);
    std::fs::write(path, serde_json::to_string_pretty(&obj).unwrap()).map_err(|e| e.to_string())
}

pub async fn fetch_history(
    app: &tauri::AppHandle,
    symbol: String,
    start: String,           // MM/DD/YYYY
    end: String,             // MM/DD/YYYY
    interval: Option<String> // "1day" | "1hour"
) -> Result<Vec<Bar>, String> {
    let key = read_key(app).await?;
    let cache_dir = app_cache_dir(app)?;
    std::fs::create_dir_all(&cache_dir).ok();

    let ts = |s: &str| -> String {
        let parts: Vec<&str> = s.split('/').collect();
        if parts.len() == 3 {
            format!("{}-{}-{}", parts[2], parts[0], parts[1])
        } else {
            s.to_string()
        }
    };
    let (mult, span) = match interval.as_deref() {
        Some("1hour") => ("1", "hour"),
        _ => ("1", "day"),
    };

    let url = format!(
        "https://api.polygon.io/v2/aggs/ticker/{}/range/{}/{}/{}/{}?adjusted=true&sort=asc&limit=50000&apiKey={}",
        symbol.to_uppercase(),
        mult,
        span,
        ts(&start),
        ts(&end),
        key
    );

    let cache_key = format!("aggs_{}_{}_{}_{}.json", symbol.to_uppercase(), mult, ts(&start), ts(&end));
    let cache_file = cache_dir.join(cache_key);
    if cache_file.exists() {
        if let Ok(text) = std::fs::read_to_string(&cache_file) {
            if let Ok(parsed) = serde_json::from_str::<AggsResponse>(&text) {
                let out = parsed
                    .results
                    .unwrap_or_default()
                    .into_iter()
                    .map(|r| Bar {
                        date: to_mmddyyyy(r.t),
                        o: r.o,
                        h: r.h,
                        l: r.l,
                        c: r.c,
                        v: r.v,
                    })
                    .collect();
                return Ok(out);
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Polygon error: {}", resp.status()));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    std::fs::write(&cache_file, &text).ok();

    let parsed: AggsResponse = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let bars = parsed
        .results
        .unwrap_or_default()
        .into_iter()
        .map(|r| Bar {
            date: to_mmddyyyy(r.t),
            o: r.o,
            h: r.h,
            l: r.l,
            c: r.c,
            v: r.v,
        })
        .collect();
    Ok(bars)
}

pub async fn fetch_news(
    app: &tauri::AppHandle,
    symbol: String,
    days: u32,
) -> Result<(f64, Vec<NewsItem>), String> {
    let key = read_key(app).await?;
    let now = Utc::now();
    let from = now - chrono::Duration::days(days as i64);
    let url = format!(
        "https://api.polygon.io/v2/reference/news?ticker={}&published_utc.gte={}&order=desc&limit=25&apiKey={}",
        symbol.to_uppercase(),
        from.format("%Y-%m-%d"),
        key
    );

    let client = reqwest::Client::new();
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Polygon news error: {}", resp.status()));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let parsed: NewsResponse = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let items = parsed.results.unwrap_or_default();

    let mut n = 0u32;
    let mut sum = 0f64;
    for it in &items {
        if let Some(s) = it.sentiment {
            sum += s;
            n += 1;
        }
    }
    let avg = if n > 0 { sum / (n as f64) } else { 0.0 };
    Ok((avg, items))
}
