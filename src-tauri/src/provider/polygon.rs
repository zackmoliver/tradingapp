use super::{Provider, ProviderResult, ProviderError, HistoryPoint, OptionChain, OptionContract, OptionQuote, normalize_date_for_api, normalize_date_for_ui};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::time::{sleep, Duration};
use reqwest::Client;
use tauri::{AppHandle, Manager, Emitter};

// Polygon API endpoints
const POLYGON_REST_BASE: &str = "https://api.polygon.io";
const POLYGON_WS_BASE: &str = "wss://socket.polygon.io";

pub struct PolygonProvider {
    client: Client,
    app_handle: AppHandle,
    cache_dir: std::path::PathBuf,
}

#[derive(Debug, Deserialize)]
struct PolygonHistoryResponse {
    status: String,
    results: Option<Vec<PolygonBar>>,
    #[serde(rename = "resultsCount")]
    results_count: Option<i32>,
    #[serde(rename = "next_url")]
    next_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PolygonBar {
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
    volume: i64,
}

#[derive(Debug, Deserialize)]
struct PolygonOptionChainResponse {
    status: String,
    results: Option<Vec<PolygonOptionContract>>,
    #[serde(rename = "next_url")]
    next_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PolygonOptionContract {
    ticker: String,
    underlying_ticker: String,
    strike_price: f64,
    expiration_date: String,
    contract_type: String,
    #[serde(rename = "last_quote")]
    last_quote: Option<PolygonQuote>,
    #[serde(rename = "last_trade")]
    last_trade: Option<PolygonTrade>,
    #[serde(rename = "greeks")]
    greeks: Option<PolygonGreeks>,
}

#[derive(Debug, Deserialize)]
struct PolygonQuote {
    bid: Option<f64>,
    ask: Option<f64>,
    #[serde(rename = "bid_size")]
    bid_size: Option<i64>,
    #[serde(rename = "ask_size")]
    ask_size: Option<i64>,
    timestamp: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct PolygonTrade {
    price: Option<f64>,
    size: Option<i64>,
    timestamp: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct PolygonGreeks {
    delta: Option<f64>,
    gamma: Option<f64>,
    theta: Option<f64>,
    vega: Option<f64>,
}

impl PolygonProvider {
    pub fn new(app_handle: AppHandle) -> ProviderResult<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| ProviderError::NetworkError(e.to_string()))?;

        let cache_dir = app_handle
            .path()
            .app_cache_dir()
            .map_err(|e| ProviderError::Other(format!("Failed to get cache dir: {}", e)))?;

        // Ensure cache directory exists
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| ProviderError::Other(format!("Failed to create cache dir: {}", e)))?;

        Ok(Self {
            client,
            app_handle,
            cache_dir,
        })
    }

    async fn get_api_key(&self) -> ProviderResult<String> {
        // For now, return a placeholder - this would be implemented with actual keychain access
        // In a real implementation, you'd use a keychain library like keyring-rs
        // The emit call would be replaced with actual keychain reading
        Err(ProviderError::ApiKeyNotFound)
    }

    async fn make_request_with_retry<T>(&self, url: &str) -> ProviderResult<T>
    where
        T: for<'de> Deserialize<'de>,
    {
        let api_key = self.get_api_key().await?;
        let mut attempts = 0;
        const MAX_ATTEMPTS: u32 = 3;

        loop {
            attempts += 1;
            
            let response = self.client
                .get(url)
                .query(&[("apikey", &api_key)])
                .send()
                .await
                .map_err(|e| ProviderError::NetworkError(e.to_string()))?;

            match response.status().as_u16() {
                200 => {
                    let data = response.json::<T>().await
                        .map_err(|e| ProviderError::ParseError(e.to_string()))?;
                    return Ok(data);
                }
                429 => {
                    if attempts >= MAX_ATTEMPTS {
                        return Err(ProviderError::RateLimited(60));
                    }
                    // Exponential backoff
                    let delay = Duration::from_secs(2_u64.pow(attempts - 1));
                    sleep(delay).await;
                    continue;
                }
                401 => return Err(ProviderError::ApiKeyNotFound),
                status => {
                    let error_text = response.text().await
                        .unwrap_or_else(|_| format!("HTTP {}", status));
                    return Err(ProviderError::NetworkError(error_text));
                }
            }
        }
    }

    fn get_cache_path(&self, key: &str) -> std::path::PathBuf {
        self.cache_dir.join(format!("{}.json", key))
    }

    async fn get_from_cache<T>(&self, key: &str) -> Option<T>
    where
        T: for<'de> Deserialize<'de>,
    {
        let path = self.get_cache_path(key);
        if let Ok(content) = tokio::fs::read_to_string(&path).await {
            serde_json::from_str(&content).ok()
        } else {
            None
        }
    }

    async fn save_to_cache<T>(&self, key: &str, data: &T) -> Result<(), std::io::Error>
    where
        T: Serialize,
    {
        let path = self.get_cache_path(key);
        let content = serde_json::to_string(data)?;
        tokio::fs::write(&path, content).await
    }
}

#[async_trait]
impl Provider for PolygonProvider {
    async fn fetch_history(
        &self,
        symbol: &str,
        start_date: &str,
        end_date: &str,
        interval: &str,
    ) -> ProviderResult<Vec<HistoryPoint>> {
        let cache_key = format!("history_{}_{}_{}_{}", symbol, start_date, end_date, interval);
        
        // Try cache first
        if let Some(cached) = self.get_from_cache::<Vec<HistoryPoint>>(&cache_key).await {
            return Ok(cached);
        }

        let start_api = normalize_date_for_api(start_date)?;
        let end_api = normalize_date_for_api(end_date)?;
        
        let multiplier = match interval {
            "1day" => "1",
            "1hour" => "1",
            _ => "1",
        };
        
        let timespan = match interval {
            "1day" => "day",
            "1hour" => "hour",
            _ => "day",
        };

        let url = format!(
            "{}/v2/aggs/ticker/{}/range/{}/{}/{}/{}",
            POLYGON_REST_BASE, symbol, multiplier, timespan, start_api, end_api
        );

        let response: PolygonHistoryResponse = self.make_request_with_retry(&url).await?;

        if response.status != "OK" {
            return Err(ProviderError::Other(format!("API returned status: {}", response.status)));
        }

        let bars = response.results.unwrap_or_default();
        let mut history_points = Vec::new();

        for bar in bars {
            let date = chrono::DateTime::from_timestamp_millis(bar.timestamp)
                .ok_or_else(|| ProviderError::ParseError("Invalid timestamp".to_string()))?
                .format("%m/%d/%Y")
                .to_string();

            history_points.push(HistoryPoint {
                date,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume,
            });
        }

        // Cache the result
        let _ = self.save_to_cache(&cache_key, &history_points).await;

        Ok(history_points)
    }

    async fn fetch_option_chain(
        &self,
        symbol: &str,
        as_of: &str,
    ) -> ProviderResult<OptionChain> {
        let cache_key = format!("option_chain_{}_{}", symbol, as_of);
        
        if let Some(cached) = self.get_from_cache::<OptionChain>(&cache_key).await {
            return Ok(cached);
        }

        let as_of_api = normalize_date_for_api(as_of)?;
        
        let url = format!(
            "{}/v3/reference/options/contracts?underlying_ticker={}&as_of={}",
            POLYGON_REST_BASE, symbol, as_of_api
        );

        let response: PolygonOptionChainResponse = self.make_request_with_retry(&url).await?;

        if response.status != "OK" {
            return Err(ProviderError::Other(format!("API returned status: {}", response.status)));
        }

        let contracts_data = response.results.unwrap_or_default();
        let mut contracts = HashMap::new();
        let mut expiry_dates = std::collections::HashSet::new();
        let mut strikes = Vec::new();

        for contract_data in contracts_data {
            let expiry_ui = normalize_date_for_ui(&contract_data.expiration_date)?;
            expiry_dates.insert(expiry_ui.clone());
            if !strikes.contains(&contract_data.strike_price) {
                strikes.push(contract_data.strike_price);
            }

            let contract = OptionContract {
                symbol: contract_data.ticker.clone(),
                strike: contract_data.strike_price,
                expiry: expiry_ui,
                option_type: contract_data.contract_type.to_lowercase(),
                last_price: contract_data.last_trade.as_ref().and_then(|t| t.price),
                bid: contract_data.last_quote.as_ref().and_then(|q| q.bid),
                ask: contract_data.last_quote.as_ref().and_then(|q| q.ask),
                volume: contract_data.last_trade.as_ref().and_then(|t| t.size),
                open_interest: None, // Polygon doesn't provide this in basic response
                implied_volatility: None, // Would need separate endpoint
                delta: contract_data.greeks.as_ref().and_then(|g| g.delta),
                gamma: contract_data.greeks.as_ref().and_then(|g| g.gamma),
                theta: contract_data.greeks.as_ref().and_then(|g| g.theta),
                vega: contract_data.greeks.as_ref().and_then(|g| g.vega),
            };

            contracts.insert(contract_data.ticker, contract);
        }

        let mut expiry_vec: Vec<String> = expiry_dates.into_iter().collect();
        expiry_vec.sort();

        strikes.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let option_chain = OptionChain {
            underlying_symbol: symbol.to_string(),
            as_of_date: as_of.to_string(),
            expiry_dates: expiry_vec,
            strikes,
            contracts,
        };

        // Cache the result
        let _ = self.save_to_cache(&cache_key, &option_chain).await;

        Ok(option_chain)
    }

    async fn fetch_option_quotes(
        &self,
        contracts: Vec<String>,
    ) -> ProviderResult<Vec<OptionQuote>> {
        let mut quotes = Vec::new();
        
        // Polygon requires individual requests for option quotes
        for contract_symbol in contracts {
            let _url = format!(
                "{}/v2/last/trade/options/{}",
                POLYGON_REST_BASE, contract_symbol
            );

            // For now, return empty quotes - would need proper implementation
            quotes.push(OptionQuote {
                contract_symbol: contract_symbol.clone(),
                last_price: None,
                bid: None,
                ask: None,
                volume: None,
                open_interest: None,
                implied_volatility: None,
                delta: None,
                gamma: None,
                theta: None,
                vega: None,
                timestamp: chrono::Utc::now().to_rfc3339(),
            });
        }

        Ok(quotes)
    }

    fn name(&self) -> &'static str {
        "Polygon"
    }

    async fn is_configured(&self) -> bool {
        self.get_api_key().await.is_ok()
    }
}
