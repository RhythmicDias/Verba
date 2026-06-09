mod clipboard;
mod storage;

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use storage::{AppConfig, HistoryEntry};

struct AppState {
    copied_text: Mutex<String>,
}

#[tauri::command]
fn get_api_key(provider: String) -> Option<String> {
    storage::get_api_key(&provider)
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
) -> Result<HistoryEntry, String> {
    storage::add_history_entry(&app_handle, &before, &after, &provider, &style)
}

#[tauri::command]
fn get_copied_text(state: tauri::State<'_, AppState>) -> String {
    let text = state.copied_text.lock().unwrap();
    text.clone()
}

#[tauri::command]
fn paste_and_close(app_handle: AppHandle, text: String) -> Result<(), String> {
    // Write polished text to clipboard
    app_handle.clipboard().write_text(text).map_err(|e| e.to_string())?;

    // Hide popup window
    if let Some(popup) = app_handle.get_webview_window("popup") {
        let _ = popup.hide();
    }

    // Simulate native paste key injection
    #[cfg(target_os = "windows")]
    clipboard::simulate_paste();

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
    println!("Global hotkey triggered! Starting copy simulation...");

    // Clear clipboard first to ensure we catch a fresh copy event
    let _ = app_handle.clipboard().write_text("".to_string());

    // Wait briefly for physical hotkeys to release
    std::thread::sleep(std::time::Duration::from_millis(250));

    // Simulate copy
    #[cfg(target_os = "windows")]
    clipboard::simulate_copy();

    // Poll clipboard for copied text
    let mut copied = String::new();
    for i in 0..10 {
        std::thread::sleep(std::time::Duration::from_millis(50));
        if let Ok(text) = app_handle.clipboard().read_text() {
            if !text.is_empty() {
                copied = text;
                println!("Success: Copied text on poll iteration {}: '{}'", i, copied);
                break;
            }
        }
    }

    if copied.is_empty() {
        println!("Warning: Clipboard copy simulation resulted in empty text.");
    }

    // Store copied text in AppState
    let state = app_handle.state::<AppState>();
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
        .manage(AppState {
            copied_text: Mutex::new(String::new()),
        })
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Load saved hotkey configuration, default to "Ctrl+Alt+P"
            let config = storage::get_config(&app_handle);
            let hotkey_str = config.hotkey.clone();
            
            let shortcut: Shortcut = hotkey_str.parse().map_err(|e| {
                Box::<dyn std::error::Error>::from(format!("Invalid hotkey configuration: {}", e))
            })?;

            app.global_shortcut().on_shortcut(shortcut, move |app_handle_cb, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    trigger_copy_and_show_popup(app_handle_cb);
                }
            })?;


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
            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&settings_i, &quit_i])?;

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
            get_api_key,
            set_api_key,
            delete_api_key,
            get_app_config,
            save_app_config,
            add_history,
            get_copied_text,
            paste_and_close,
            close_popup,
            update_global_shortcut
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
