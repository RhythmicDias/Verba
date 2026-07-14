mod clipboard;
mod storage;
mod llm;
mod llama;
mod os_helpers;

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use storage::{AppConfig, HistoryEntry};

struct AppState {
    copied_text: Mutex<String>,
    clipboard_backup: Mutex<Option<String>>,
    #[cfg(target_os = "windows")]
    target_window: Mutex<Option<isize>>,
    #[cfg(target_os = "macos")]
    target_window: Mutex<Option<String>>,
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    target_window: Mutex<Option<()>>,
    http_client: reqwest::Client,
}


#[tauri::command]
fn has_api_key(provider: String) -> bool {
    storage::get_api_key(&provider).is_some()
}

#[tauri::command]
fn set_api_key(provider: String, key: String) -> Result<(), String> {
    storage::set_api_key(&provider, &key)
}

#[tauri::command]
fn delete_api_key(provider: String) -> Result<(), String> {
    storage::delete_api_key(&provider)
}

#[tauri::command]
fn get_api_key_value(provider: String) -> Result<String, String> {
    storage::get_api_key(&provider).ok_or_else(|| "Key not found".to_string())
}

#[tauri::command]
fn get_app_config(app_handle: AppHandle) -> AppConfig {
    storage::get_config(&app_handle)
}

#[tauri::command]
fn save_app_config(app_handle: AppHandle, config: AppConfig) -> Result<(), String> {
    storage::save_config(&app_handle, &config)
}

#[tauri::command]
fn add_history(
    app_handle: AppHandle,
    before: String,
    after: String,
    provider: String,
    style: String,
    duration_ms: Option<u64>,
    model: Option<String>,
) -> Result<HistoryEntry, String> {
    storage::add_history_entry(&app_handle, &before, &after, &provider, &style, duration_ms, model)
}

#[tauri::command]
fn get_copied_text(state: tauri::State<'_, AppState>) -> String {
    let text = state.copied_text.lock().unwrap_or_else(|e| e.into_inner());
    text.clone()
}

#[tauri::command]
fn paste_and_close(
    app_handle: AppHandle,
    text: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // Write polished text to clipboard
    app_handle.clipboard().write_text(text).map_err(|e| e.to_string())?;

    // Focus the target window first!
    let target = state.target_window.lock().unwrap_or_else(|e| e.into_inner()).clone();
    os_helpers::focus_window(target);

    // Hide popup window
    if let Some(popup) = app_handle.get_webview_window("popup") {
        let _ = popup.hide();
    }

    // Simulate native paste key injection
    clipboard::simulate_paste();

    // Sleep briefly to allow the operating system to process the paste command.
    std::thread::sleep(std::time::Duration::from_millis(150));

    // Restore original backed up clipboard content
    if let Some(ref val) = *state.clipboard_backup.lock().unwrap_or_else(|e| e.into_inner()) {
        let _ = app_handle.clipboard().write_text(val.clone());
    }

    Ok(())
}

#[tauri::command]
fn close_popup(app_handle: AppHandle) -> Result<(), String> {
    if let Some(popup) = app_handle.get_webview_window("popup") {
        let _ = popup.hide();
    }
    Ok(())
}

fn trigger_copy_and_show_popup(app_handle: &AppHandle) {
    #[cfg(debug_assertions)]
    println!("Global hotkey triggered! Starting copy simulation...");

    let state = app_handle.state::<AppState>();

    // Capture the target window that was focused before the hotkey popup shows
    let target = os_helpers::capture_foreground_window();
    if let Ok(mut win_guard) = state.target_window.lock() {
        *win_guard = target;
    }

    // Back up current clipboard content
    let backup = app_handle.clipboard().read_text().ok();
    if let Ok(mut backup_guard) = state.clipboard_backup.lock() {
        *backup_guard = backup;
    }

    // Clear clipboard first to ensure we catch a fresh copy event
    let _ = app_handle.clipboard().write_text("".to_string());

    // Wait briefly for physical hotkeys to release
    std::thread::sleep(std::time::Duration::from_millis(250));

    // Simulate copy
    clipboard::simulate_copy();

    // Poll clipboard for copied text
    let mut copied = String::new();
    for i in 0..10 {
        std::thread::sleep(std::time::Duration::from_millis(50));
        if let Ok(text) = app_handle.clipboard().read_text() {
            if !text.is_empty() {
                copied = text;
                #[cfg(debug_assertions)]
                println!("Success: Copied text on poll iteration {}: '{}'", i, copied);
                break;
            }
        }
    }

    // Restore the backed-up clipboard content immediately so clipboard is clean during edit/process
    if let Some(ref val) = *state.clipboard_backup.lock().unwrap_or_else(|e| e.into_inner()) {
        let _ = app_handle.clipboard().write_text(val.clone());
    }

    if copied.is_empty() {
        #[cfg(debug_assertions)]
        println!("Warning: Clipboard copy simulation resulted in empty text.");
    }

    // Store copied text in AppState
    if let Ok(mut text_guard) = state.copied_text.lock() {
        *text_guard = copied.clone();
    }

    // Show popup window and emit the selection update
    if let Some(popup) = app_handle.get_webview_window("popup") {
        let _ = popup.emit("update-selection", copied);
        let _ = popup.show();
        let _ = popup.set_focus();
    }
}

#[tauri::command]
fn update_global_shortcut(app_handle: AppHandle, new_hotkey: String) -> Result<(), String> {
    let mut config = storage::get_config(&app_handle);
    let old_hotkey = config.hotkey.clone();

    // Parse shortcuts
    let old_shortcut: Shortcut = old_hotkey.parse().map_err(|e| format!("Invalid old shortcut: {}", e))?;
    let new_shortcut: Shortcut = new_hotkey.parse().map_err(|e| format!("Invalid new shortcut: {}", e))?;

    let shortcut_manager = app_handle.global_shortcut();

    // Unregister old shortcut
    let _ = shortcut_manager.unregister(old_shortcut);

    // Register new shortcut
    shortcut_manager
        .on_shortcut(new_shortcut, move |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                trigger_copy_and_show_popup(app);
            }
        })
        .map_err(|e| format!("Failed to register new shortcut: {}", e))?;

    // Update config
    config.hotkey = new_hotkey;
    storage::save_config(&app_handle, &config)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            copied_text: Mutex::new(String::new()),
            clipboard_backup: Mutex::new(None),
            target_window: Mutex::new(None),
            http_client: reqwest::Client::new(),
        })
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Load saved hotkey configuration, default to "Ctrl+Alt+P"
            let config = storage::get_config(&app_handle);
            let hotkey_str = config.hotkey.clone();
            
            let shortcut: Shortcut = hotkey_str.parse().map_err(|e| {
                Box::<dyn std::error::Error>::from(format!("Invalid hotkey configuration: {}", e))
            })?;

            if let Err(e) = app.global_shortcut().on_shortcut(shortcut, move |app_handle_cb, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    trigger_copy_and_show_popup(app_handle_cb);
                }
            }) {
                eprintln!("Warning: Failed to register global shortcut. It may be in use by another application. Error: {}", e);
            }


            // Setup main window close interception to hide instead of destroy
            if let Some(main) = app.get_webview_window("main") {
                let main_clone = main.clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = main_clone.hide();
                    }
                });
            }

            // Create tray menu items
            let settings_i = tauri::menu::MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let update_i = tauri::menu::MenuItem::with_id(app, "update", "Check for Updates...", true, None::<&str>)?;
            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&settings_i, &update_i, &quit_i])?;

            // Retrieve the tray icon configured in tauri.conf.json
            if let Some(tray) = app.tray_by_id("main") {
                tray.set_menu(Some(menu))?;
                tray.set_tooltip(Some("Verba"))?;
                tray.on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "settings" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "update" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("trigger-update-check", ());
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                });
            }

            Ok(())
        })
        .on_tray_icon_event(|app, event| {
            if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            has_api_key,
            get_api_key_value,
            set_api_key,
            delete_api_key,
            get_app_config,
            save_app_config,
            add_history,
            get_copied_text,
            paste_and_close,
            close_popup,
            update_global_shortcut,
            llm::call_llm,
            llm::get_ollama_models,
            llama::check_local_model,
            llama::download_local_model,
            llama::cancel_local_model_download,
            llama::get_local_model_path,
            llama::is_gpu_detected
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
