// src-tauri/src/keychain.rs
use anyhow::{Result, anyhow};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::api::path::app_config_dir;

const SERVICE_NAME: &str = "trading-app";
const KEY_NAME: &str = "polygon-api-key";

#[derive(Debug, Serialize, Deserialize)]
struct SecretsFile {
    polygon_api_key: Option<String>,
}

pub struct KeychainManager {
    fallback_path: PathBuf,
}

impl KeychainManager {
    pub fn new() -> Result<Self> {
        let config_dir = app_config_dir(&tauri::Config::default())
            .ok_or_else(|| anyhow!("Failed to get config directory"))?
            .join("trading-app");
        
        // Ensure config directory exists
        fs::create_dir_all(&config_dir)?;
        
        let fallback_path = config_dir.join("secrets.json");
        
        Ok(Self {
            fallback_path,
        })
    }

    pub fn save_api_key(&self, key: String) -> Result<()> {
        // Try OS keychain first
        match Entry::new(SERVICE_NAME, KEY_NAME) {
            Ok(entry) => {
                if let Err(e) = entry.set_password(&key) {
                    eprintln!("Failed to save to keychain: {}, falling back to file", e);
                    return self.save_to_file(&key);
                }
                return Ok(());
            }
            Err(e) => {
                eprintln!("Failed to create keychain entry: {}, falling back to file", e);
                return self.save_to_file(&key);
            }
        }
    }

    pub fn get_api_key(&self) -> Result<Option<String>> {
        // Try OS keychain first
        match Entry::new(SERVICE_NAME, KEY_NAME) {
            Ok(entry) => {
                match entry.get_password() {
                    Ok(password) => return Ok(Some(password)),
                    Err(_) => {
                        // Fall through to file-based storage
                    }
                }
            }
            Err(_) => {
                // Fall through to file-based storage
            }
        }

        // Try file-based fallback
        self.get_from_file()
    }

    fn save_to_file(&self, key: &str) -> Result<()> {
        let secrets = SecretsFile {
            polygon_api_key: Some(key.to_string()),
        };
        
        let json = serde_json::to_string_pretty(&secrets)?;
        fs::write(&self.fallback_path, json)?;
        
        Ok(())
    }

    fn get_from_file(&self) -> Result<Option<String>> {
        if !self.fallback_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&self.fallback_path)?;
        let secrets: SecretsFile = serde_json::from_str(&content)?;
        
        Ok(secrets.polygon_api_key)
    }

    pub fn delete_api_key(&self) -> Result<()> {
        // Try to delete from keychain
        if let Ok(entry) = Entry::new(SERVICE_NAME, KEY_NAME) {
            let _ = entry.delete_password(); // Ignore errors
        }

        // Delete from file
        if self.fallback_path.exists() {
            let secrets = SecretsFile {
                polygon_api_key: None,
            };
            let json = serde_json::to_string_pretty(&secrets)?;
            fs::write(&self.fallback_path, json)?;
        }

        Ok(())
    }
}
