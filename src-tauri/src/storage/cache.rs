// src-tauri/src/storage/cache.rs
// Simple file cache in app_config_dir for JSON data

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry<T> {
    pub data: T,
    pub timestamp: i64,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheMetadata {
    pub key: String,
    pub size_bytes: u64,
    pub created_at: i64,
    pub last_accessed: i64,
    pub access_count: u64,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct FileCache {
    cache_dir: PathBuf,
    metadata: HashMap<String, CacheMetadata>,
    metadata_file: PathBuf,
}

impl FileCache {
    pub fn new(app_handle: &AppHandle) -> Result<Self, String> {
        let cache_dir = app_handle
            .path()
            .app_config_dir()
            .map_err(|e| format!("Failed to get app config directory: {}", e))?
            .join("cache");
            
        // Create cache directory if it doesn't exist
        fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to create cache directory: {}", e))?;
            
        let metadata_file = cache_dir.join("metadata.json");
        
        // Load existing metadata
        let metadata = if metadata_file.exists() {
            let content = fs::read_to_string(&metadata_file)
                .map_err(|e| format!("Failed to read metadata: {}", e))?;
            serde_json::from_str(&content)
                .unwrap_or_else(|_| HashMap::new())
        } else {
            HashMap::new()
        };
        
        Ok(Self {
            cache_dir,
            metadata,
            metadata_file,
        })
    }

    pub fn get<T>(&mut self, key: &str) -> Result<Option<T>, String>
    where
        T: for<'de> Deserialize<'de>,
    {
        let file_path = self.get_file_path(key);
        
        if !file_path.exists() {
            return Ok(None);
        }
        
        // Check if expired
        if let Some(meta) = self.metadata.get(key) {
            if let Some(expires_at) = meta.expires_at {
                let now = Utc::now().timestamp();
                if now > expires_at {
                    // Remove expired entry
                    let _ = fs::remove_file(&file_path);
                    self.metadata.remove(key);
                    self.save_metadata()?;
                    return Ok(None);
                }
            }
        }
        
        // Read and deserialize
        let content = fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read cache file: {}", e))?;
            
        let entry: CacheEntry<T> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to deserialize cache entry: {}", e))?;
            
        // Update access metadata
        if let Some(meta) = self.metadata.get_mut(key) {
            meta.last_accessed = Utc::now().timestamp();
            meta.access_count += 1;
            let _ = self.save_metadata();
        }
        
        Ok(Some(entry.data))
    }

    pub fn set<T>(&mut self, key: &str, data: T, ttl_seconds: Option<i64>) -> Result<(), String>
    where
        T: Serialize,
    {
        let now = Utc::now().timestamp();
        let expires_at = ttl_seconds.map(|ttl| now + ttl);
        
        let entry = CacheEntry {
            data,
            timestamp: now,
            expires_at,
        };
        
        let content = serde_json::to_string_pretty(&entry)
            .map_err(|e| format!("Failed to serialize cache entry: {}", e))?;
            
        let file_path = self.get_file_path(key);
        fs::write(&file_path, content)
            .map_err(|e| format!("Failed to write cache file: {}", e))?;
            
        // Update metadata
        let size_bytes = fs::metadata(&file_path)
            .map(|m| m.len())
            .unwrap_or(0);
            
        let metadata = CacheMetadata {
            key: key.to_string(),
            size_bytes,
            created_at: now,
            last_accessed: now,
            access_count: 1,
            expires_at,
        };
        
        self.metadata.insert(key.to_string(), metadata);
        self.save_metadata()?;
        
        Ok(())
    }

    pub fn remove(&mut self, key: &str) -> Result<bool, String> {
        let file_path = self.get_file_path(key);
        
        if file_path.exists() {
            fs::remove_file(&file_path)
                .map_err(|e| format!("Failed to remove cache file: {}", e))?;
            self.metadata.remove(key);
            self.save_metadata()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn clear(&mut self) -> Result<(), String> {
        // Remove all cache files
        for key in self.metadata.keys().cloned().collect::<Vec<_>>() {
            let _ = self.remove(&key);
        }
        
        self.metadata.clear();
        self.save_metadata()?;
        
        Ok(())
    }

    pub fn get_stats(&self) -> CacheStats {
        let total_entries = self.metadata.len();
        let total_size = self.metadata.values().map(|m| m.size_bytes).sum();
        let oldest_entry = self.metadata.values()
            .map(|m| m.created_at)
            .min();
        let most_accessed = self.metadata.values()
            .map(|m| m.access_count)
            .max()
            .unwrap_or(0);
            
        CacheStats {
            total_entries,
            total_size_bytes: total_size,
            oldest_entry_timestamp: oldest_entry,
            max_access_count: most_accessed,
        }
    }

    pub fn cleanup_expired(&mut self) -> Result<u32, String> {
        let now = Utc::now().timestamp();
        let mut removed_count = 0;
        
        let expired_keys: Vec<String> = self.metadata
            .iter()
            .filter_map(|(key, meta)| {
                if let Some(expires_at) = meta.expires_at {
                    if now > expires_at {
                        Some(key.clone())
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect();
            
        for key in expired_keys {
            if self.remove(&key)? {
                removed_count += 1;
            }
        }
        
        Ok(removed_count)
    }

    pub fn get_keys(&self) -> Vec<String> {
        self.metadata.keys().cloned().collect()
    }

    fn get_file_path(&self, key: &str) -> PathBuf {
        // Sanitize key for filename
        let safe_key = key
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
            .collect::<String>();
            
        self.cache_dir.join(format!("{}.json", safe_key))
    }

    fn save_metadata(&self) -> Result<(), String> {
        let content = serde_json::to_string_pretty(&self.metadata)
            .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
            
        fs::write(&self.metadata_file, content)
            .map_err(|e| format!("Failed to write metadata: {}", e))?;
            
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_entries: usize,
    pub total_size_bytes: u64,
    pub oldest_entry_timestamp: Option<i64>,
    pub max_access_count: u64,
}

// Helper functions for common cache operations
pub fn cache_key_for_ohlc(symbol: &str, start: &str, end: &str, timeframe: &str) -> String {
    format!("ohlc_{}_{}_{}_{}", symbol, start, end, timeframe)
}

pub fn cache_key_for_quote(symbol: &str) -> String {
    format!("quote_{}", symbol)
}

pub fn cache_key_for_news(symbol: &str, days: u32) -> String {
    format!("news_{}_{}", symbol, days)
}

// Broker persistence utilities
impl FileCache {
    pub fn save_broker_state<T>(&mut self, broker_state: &T) -> Result<(), String>
    where
        T: Serialize,
    {
        let broker_file = self.cache_dir.join("broker_state.json");
        let content = serde_json::to_string_pretty(broker_state)
            .map_err(|e| format!("Failed to serialize broker state: {}", e))?;

        fs::write(&broker_file, content)
            .map_err(|e| format!("Failed to write broker state: {}", e))?;

        println!("Broker state saved to: {:?}", broker_file);
        Ok(())
    }

    pub fn load_broker_state<T>(&self) -> Result<Option<T>, String>
    where
        T: for<'de> Deserialize<'de>,
    {
        let broker_file = self.cache_dir.join("broker_state.json");

        if !broker_file.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&broker_file)
            .map_err(|e| format!("Failed to read broker state: {}", e))?;

        let state = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to deserialize broker state: {}", e))?;

        println!("Broker state loaded from: {:?}", broker_file);
        Ok(Some(state))
    }

    pub fn append_to_trade_journal<T>(&self, entry: &T) -> Result<(), String>
    where
        T: Serialize,
    {
        let journal_file = self.cache_dir.join("trade_journal.jsonl");

        // Serialize the entry to a single line
        let json_line = serde_json::to_string(entry)
            .map_err(|e| format!("Failed to serialize journal entry: {}", e))?;

        // Append to the JSONL file
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&journal_file)
            .map_err(|e| format!("Failed to open journal file: {}", e))?;

        writeln!(file, "{}", json_line)
            .map_err(|e| format!("Failed to write to journal: {}", e))?;

        file.flush()
            .map_err(|e| format!("Failed to flush journal: {}", e))?;

        Ok(())
    }

    pub fn load_trade_journal<T>(&self) -> Result<Vec<T>, String>
    where
        T: for<'de> Deserialize<'de>,
    {
        let journal_file = self.cache_dir.join("trade_journal.jsonl");

        if !journal_file.exists() {
            return Ok(Vec::new());
        }

        let file = fs::File::open(&journal_file)
            .map_err(|e| format!("Failed to open journal file: {}", e))?;

        let reader = BufReader::new(file);
        let mut entries = Vec::new();

        for (line_num, line) in reader.lines().enumerate() {
            let line = line.map_err(|e| format!("Failed to read line {}: {}", line_num + 1, e))?;

            if line.trim().is_empty() {
                continue;
            }

            let entry: T = serde_json::from_str(&line)
                .map_err(|e| format!("Failed to parse line {}: {}", line_num + 1, e))?;

            entries.push(entry);
        }

        println!("Loaded {} entries from trade journal", entries.len());
        Ok(entries)
    }

    pub fn get_journal_stats(&self) -> Result<JournalStats, String> {
        let journal_file = self.cache_dir.join("trade_journal.jsonl");

        if !journal_file.exists() {
            return Ok(JournalStats {
                total_entries: 0,
                file_size_bytes: 0,
                created_at: None,
                last_modified: None,
            });
        }

        let metadata = fs::metadata(&journal_file)
            .map_err(|e| format!("Failed to get journal metadata: {}", e))?;

        let file = fs::File::open(&journal_file)
            .map_err(|e| format!("Failed to open journal file: {}", e))?;

        let reader = BufReader::new(file);
        let line_count = reader.lines().count();

        Ok(JournalStats {
            total_entries: line_count,
            file_size_bytes: metadata.len(),
            created_at: metadata.created().ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64),
            last_modified: metadata.modified().ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64),
        })
    }

    pub fn backup_journal(&self, backup_suffix: &str) -> Result<PathBuf, String> {
        let journal_file = self.cache_dir.join("trade_journal.jsonl");
        let backup_file = self.cache_dir.join(format!("trade_journal_{}.jsonl", backup_suffix));

        if !journal_file.exists() {
            return Err("No journal file to backup".to_string());
        }

        fs::copy(&journal_file, &backup_file)
            .map_err(|e| format!("Failed to backup journal: {}", e))?;

        println!("Journal backed up to: {:?}", backup_file);
        Ok(backup_file)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalStats {
    pub total_entries: usize,
    pub file_size_bytes: u64,
    pub created_at: Option<i64>,
    pub last_modified: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_sanitization() {
        let cache_dir = std::path::PathBuf::from("/tmp/test");

        let cache = FileCache {
            cache_dir: cache_dir.clone(),
            metadata: HashMap::new(),
            metadata_file: cache_dir.join("metadata.json"),
        };

        let path = cache.get_file_path("AAPL/2023-01-01/2023-12-31");
        assert!(path.to_string_lossy().contains("AAPL_2023-01-01_2023-12-31"));
    }
}
