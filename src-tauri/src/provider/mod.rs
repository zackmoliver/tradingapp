use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use async_trait::async_trait;

pub mod polygon;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryPoint {
    pub date: String,  // MM/DD/YYYY format
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionContract {
    pub symbol: String,
    pub strike: f64,
    pub expiry: String,  // MM/DD/YYYY format
    pub option_type: String,  // "call" or "put"
    pub last_price: Option<f64>,
    pub bid: Option<f64>,
    pub ask: Option<f64>,
    pub volume: Option<i64>,
    pub open_interest: Option<i64>,
    pub implied_volatility: Option<f64>,
    pub delta: Option<f64>,
    pub gamma: Option<f64>,
    pub theta: Option<f64>,
    pub vega: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionChain {
    pub underlying_symbol: String,
    pub as_of_date: String,  // MM/DD/YYYY format
    pub expiry_dates: Vec<String>,  // MM/DD/YYYY format
    pub strikes: Vec<f64>,
    pub contracts: HashMap<String, OptionContract>,  // key: contract symbol
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionQuote {
    pub contract_symbol: String,
    pub last_price: Option<f64>,
    pub bid: Option<f64>,
    pub ask: Option<f64>,
    pub volume: Option<i64>,
    pub open_interest: Option<i64>,
    pub implied_volatility: Option<f64>,
    pub delta: Option<f64>,
    pub gamma: Option<f64>,
    pub theta: Option<f64>,
    pub vega: Option<f64>,
    pub timestamp: String,  // ISO format
}

#[derive(Debug)]
pub enum ProviderError {
    ApiKeyNotFound,
    RateLimited(u64),  // retry after seconds
    NetworkError(String),
    ParseError(String),
    InvalidSymbol(String),
    InvalidDateRange(String),
    Other(String),
}

impl std::fmt::Display for ProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProviderError::ApiKeyNotFound => write!(f, "API key not found in keychain"),
            ProviderError::RateLimited(seconds) => write!(f, "Rate limited, retry after {} seconds", seconds),
            ProviderError::NetworkError(msg) => write!(f, "Network error: {}", msg),
            ProviderError::ParseError(msg) => write!(f, "Parse error: {}", msg),
            ProviderError::InvalidSymbol(symbol) => write!(f, "Invalid symbol: {}", symbol),
            ProviderError::InvalidDateRange(msg) => write!(f, "Invalid date range: {}", msg),
            ProviderError::Other(msg) => write!(f, "Error: {}", msg),
        }
    }
}

impl std::error::Error for ProviderError {}

pub type ProviderResult<T> = Result<T, ProviderError>;

#[async_trait]
pub trait Provider: Send + Sync {
    /// Fetch historical price data for a symbol
    async fn fetch_history(
        &self,
        symbol: &str,
        start_date: &str,  // MM/DD/YYYY
        end_date: &str,    // MM/DD/YYYY
        interval: &str,    // "1day", "1hour", etc.
    ) -> ProviderResult<Vec<HistoryPoint>>;

    /// Fetch option chain for a symbol
    async fn fetch_option_chain(
        &self,
        symbol: &str,
        as_of: &str,  // MM/DD/YYYY
    ) -> ProviderResult<OptionChain>;

    /// Fetch option quotes for specific contracts
    async fn fetch_option_quotes(
        &self,
        contracts: Vec<String>,
    ) -> ProviderResult<Vec<OptionQuote>>;

    /// Get provider name
    fn name(&self) -> &'static str;

    /// Check if provider is configured (has API key, etc.)
    async fn is_configured(&self) -> bool;
}

/// Convert MM/DD/YYYY to YYYY-MM-DD for API calls
pub fn normalize_date_for_api(date: &str) -> Result<String, ProviderError> {
    let parts: Vec<&str> = date.split('/').collect();
    if parts.len() != 3 {
        return Err(ProviderError::InvalidDateRange(format!("Invalid date format: {}", date)));
    }
    
    let month = parts[0].parse::<u32>()
        .map_err(|_| ProviderError::InvalidDateRange(format!("Invalid month: {}", parts[0])))?;
    let day = parts[1].parse::<u32>()
        .map_err(|_| ProviderError::InvalidDateRange(format!("Invalid day: {}", parts[1])))?;
    let year = parts[2].parse::<u32>()
        .map_err(|_| ProviderError::InvalidDateRange(format!("Invalid year: {}", parts[2])))?;
    
    if month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100 {
        return Err(ProviderError::InvalidDateRange(format!("Invalid date values: {}", date)));
    }
    
    Ok(format!("{:04}-{:02}-{:02}", year, month, day))
}

/// Convert YYYY-MM-DD to MM/DD/YYYY for UI
pub fn normalize_date_for_ui(date: &str) -> Result<String, ProviderError> {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return Err(ProviderError::ParseError(format!("Invalid API date format: {}", date)));
    }
    
    let year = parts[0];
    let month = parts[1].parse::<u32>()
        .map_err(|_| ProviderError::ParseError(format!("Invalid month: {}", parts[1])))?;
    let day = parts[2].parse::<u32>()
        .map_err(|_| ProviderError::ParseError(format!("Invalid day: {}", parts[2])))?;
    
    Ok(format!("{:02}/{:02}/{}", month, day, year))
}
