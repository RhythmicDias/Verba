use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs::{create_dir_all, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use uuid::Uuid;
use chrono::Utc;

const SERVICE_NAME: &str = "Verba";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub id: String,
    pub before: String,
    pub after: String,
    pub timestamp: String,
    pub provider: String,
    pub style: String,
}

fn default_shortcuts() -> std::collections::HashMap<String, String> {
    [
        ("concise".to_string(), "1".to_string()),
        ("professional".to_string(), "2".to_string()),
        ("detailed".to_string(), "3".to_string()),
        ("formal".to_string(), "4".to_string()),
        ("funny".to_string(), "5".to_string()),
        ("medical".to_string(), "6".to_string()),
        ("summarize".to_string(), "7".to_string()),
        ("generative".to_string(), "8".to_string()),
        ("custom".to_string(), "0".to_string()),
    ].into_iter().collect()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub hotkey: String,
    pub active_provider: String,
    pub gemini_model: String,
    pub openai_model: String,
    pub openai_endpoint: String,
    pub anthropic_model: String,
    pub grok_model: String,
    pub ollama_model: String,
    pub ollama_endpoint: String,
    pub openrouter_model: String,
    pub openrouter_endpoint: String,
    pub save_history: bool,
    pub history: Vec<HistoryEntry>,
    #[serde(default = "default_shortcuts")]
    pub style_shortcuts: std::collections::HashMap<String, String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            hotkey: "Ctrl+Alt+P".to_string(),
            active_provider: "gemini".to_string(),
            gemini_model: "gemini-1.5-flash".to_string(),
            openai_model: "gpt-4o-mini".to_string(),
            openai_endpoint: "https://api.openai.com/v1/chat/completions".to_string(),
            anthropic_model: "claude-3-5-sonnet-20241022".to_string(),
            grok_model: "grok-2-1212".to_string(),
            ollama_model: "llama3".to_string(),
            ollama_endpoint: "http://localhost:11434/v1/chat/completions".to_string(),
            openrouter_model: "google/gemini-2.5-flash".to_string(),
            openrouter_endpoint: "https://openrouter.ai/api/v1/chat/completions".to_string(),
            save_history: true,
            history: Vec::new(),
            style_shortcuts: default_shortcuts(),
        }
    }
}

pub fn get_api_key(provider: &str) -> Option<String> {
    let entry_name = format!("apikey_{}", provider.to_lowercase());
    match Entry::new(SERVICE_NAME, &entry_name) {
        Ok(entry) => entry.get_password().ok(),
        Err(_) => None,
    }
}

pub fn set_api_key(provider: &str, key: &str) -> Result<(), String> {
    let entry_name = format!("apikey_{}", provider.to_lowercase());
    let entry = Entry::new(SERVICE_NAME, &entry_name)
        .map_err(|e| format!("Failed to initialize keyring entry: {}", e))?;
    entry.set_password(key)
        .map_err(|e| format!("Failed to set password in keyring: {}", e))?;
    Ok(())
}

pub fn delete_api_key(provider: &str) -> Result<(), String> {
    let entry_name = format!("apikey_{}", provider.to_lowercase());
    let entry = Entry::new(SERVICE_NAME, &entry_name)
        .map_err(|e| format!("Failed to initialize keyring entry: {}", e))?;
    entry.delete_password()
        .map_err(|e| format!("Failed to delete password in keyring: {}", e))?;
    Ok(())
}

fn get_config_path(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    let mut path = app_handle.path().app_data_dir().ok()?;
    if !path.exists() {
        let _ = create_dir_all(&path);
    }
    path.push("config.json");
    Some(path)
}

pub fn get_config(app_handle: &tauri::AppHandle) -> AppConfig {
    if let Some(path) = get_config_path(app_handle) {
        if path.exists() {
            if let Ok(mut file) = File::open(&path) {
                let mut content = String::new();
                if file.read_to_string(&mut content).is_ok() {
                    if let Ok(config) = serde_json::from_str::<AppConfig>(&content) {
                        return config;
                    }
                }
            }
        }
    }
    AppConfig::default()
}

pub fn save_config(app_handle: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = get_config_path(app_handle)
        .ok_or_else(|| "Failed to get app configuration path".to_string())?;
    
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    let mut file = File::create(path)
        .map_err(|e| format!("Failed to create config file: {}", e))?;
    
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    
    Ok(())
}

pub fn add_history_entry(
    app_handle: &tauri::AppHandle,
    before: &str,
    after: &str,
    provider: &str,
    style: &str,
) -> Result<HistoryEntry, String> {
    let mut config = get_config(app_handle);
    let entry = HistoryEntry {
        id: Uuid::new_v4().to_string(),
        before: before.to_string(),
        after: after.to_string(),
        timestamp: Utc::now().to_rfc3339(),
        provider: provider.to_string(),
        style: style.to_string(),
    };
    if config.save_history {
        config.history.insert(0, entry.clone());
        // Keep max 100 history entries
        if config.history.len() > 100 {
            config.history.truncate(100);
        }
        save_config(app_handle, &config)?;
    }
    Ok(entry)
}
