use std::fs::{create_dir_all, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

static CANCEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);
static IS_DOWNLOADING: AtomicBool = AtomicBool::new(false);

const MODEL_URL: &str = "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf";
const MODEL_FILE_NAME: &str = "Llama-3.2-1B-Instruct-Q4_K_M.gguf";

#[derive(serde::Serialize, Clone)]
struct DownloadProgress {
    progress: f64,
    speed: f64,
    downloaded: f64,
    total: f64,
}

pub fn get_model_dir(app_handle: &AppHandle) -> Option<PathBuf> {
    let mut path = app_handle.path().app_data_dir().ok()?;
    path.push("models");
    if !path.exists() {
        let _ = create_dir_all(&path);
    }
    Some(path)
}

pub fn get_model_path(app_handle: &AppHandle) -> Option<PathBuf> {
    let mut path = get_model_dir(app_handle)?;
    path.push(MODEL_FILE_NAME);
    Some(path)
}

#[tauri::command]
pub fn check_local_model(app_handle: AppHandle) -> bool {
    if let Some(path) = get_model_path(&app_handle) {
        // Model file should exist and be reasonably sized (at least 500MB)
        path.exists() && path.metadata().map(|m| m.len() > 500_000_000).unwrap_or(false)
    } else {
        false
    }
}

#[tauri::command]
pub fn get_local_model_path(app_handle: AppHandle) -> Result<String, String> {
    let exists = check_local_model(app_handle.clone());
    let path = if exists {
        get_model_path(&app_handle)
            .ok_or_else(|| "Failed to determine model storage path".to_string())?
    } else {
        get_model_dir(&app_handle)
            .ok_or_else(|| "Failed to determine model storage directory".to_string())?
    };
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn cancel_local_model_download() {
    CANCEL_DOWNLOAD.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn download_local_model(app_handle: AppHandle) -> Result<(), String> {
    if IS_DOWNLOADING.load(Ordering::SeqCst) {
        return Err("Download already in progress".to_string());
    }

    let model_path = get_model_path(&app_handle).ok_or("Failed to determine model storage path")?;
    
    // Reset cancel flag
    CANCEL_DOWNLOAD.store(false, Ordering::SeqCst);
    IS_DOWNLOADING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        let result = perform_download(&app_handle, model_path);
        IS_DOWNLOADING.store(false, Ordering::SeqCst);
        
        match result {
            Ok(true) => {
                let _ = app_handle.emit("local-model-download-complete", ());
            }
            Ok(false) => {
                let _ = app_handle.emit("local-model-download-cancelled", ());
            }
            Err(err) => {
                let _ = app_handle.emit("local-model-download-error", err);
            }
        }
    });

    Ok(())
}

fn perform_download(app_handle: &AppHandle, dest_path: PathBuf) -> Result<bool, String> {
    // We create a temporary file for downloading
    let mut temp_path = dest_path.clone();
    temp_path.set_extension("download");

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut response = client.get(MODEL_URL)
        .send()
        .map_err(|e| format!("Failed to connect to model host: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Server returned error: {}", response.status()));
    }

    let total_size = response.content_length()
        .ok_or_else(|| "Content length missing".to_string())?;

    let mut file = File::create(&temp_path)
        .map_err(|e| format!("Failed to create temporary file: {}", e))?;

    let mut buffer = [0; 65536]; // 64KB chunks
    let mut downloaded: u64 = 0;
    let start_time = Instant::now();
    let mut last_emit = Instant::now();

    loop {
        if CANCEL_DOWNLOAD.load(Ordering::SeqCst) {
            // Clean up temporary file
            drop(file);
            let _ = std::fs::remove_file(temp_path);
            return Ok(false);
        }

        let bytes_read = response.read(&mut buffer)
            .map_err(|e| format!("Error reading network stream: {}", e))?;

        if bytes_read == 0 {
            break; // Finished download
        }

        file.write_all(&buffer[..bytes_read])
            .map_err(|e| format!("Failed to write to disk: {}", e))?;

        downloaded += bytes_read as u64;

        // Emit progress updates at most every 100ms
        if last_emit.elapsed() >= Duration::from_millis(150) {
            let elapsed = start_time.elapsed().as_secs_f64();
            let speed = if elapsed > 0.0 {
                (downloaded as f64 / (1024.0 * 1024.0)) / elapsed
            } else {
                0.0
            };
            
            let progress = (downloaded as f64 / total_size as f64) * 100.0;
            let downloaded_mb = downloaded as f64 / (1024.0 * 1024.0);
            let total_mb = total_size as f64 / (1024.0 * 1024.0);

            let _ = app_handle.emit("local-model-download-progress", DownloadProgress {
                progress,
                speed,
                downloaded: downloaded_mb,
                total: total_mb,
            });
            last_emit = Instant::now();
        }
    }

    // Flush and rename to final name
    file.flush().map_err(|e| format!("Failed to flush file: {}", e))?;
    drop(file);

    std::fs::rename(temp_path, dest_path)
        .map_err(|e| format!("Failed to save final model file: {}", e))?;

    Ok(true)
}

fn get_sidecar_path(app_handle: &AppHandle, binary_name: &str) -> Option<PathBuf> {
    let triple = if cfg!(target_arch = "x86_64") && cfg!(target_os = "windows") {
        "x86_64-pc-windows-msvc"
    } else if cfg!(target_arch = "aarch64") && cfg!(target_os = "windows") {
        "aarch64-pc-windows-msvc"
    } else if cfg!(target_arch = "x86_64") && cfg!(target_os = "macos") {
        "x86_64-apple-darwin"
    } else if cfg!(target_arch = "aarch64") && cfg!(target_os = "macos") {
        "aarch64-apple-darwin"
    } else if cfg!(target_arch = "x86_64") && cfg!(target_os = "linux") {
        "x86_64-unknown-linux-gnu"
    } else {
        return None;
    };

    let bin_name_triple = if cfg!(target_os = "windows") {
        format!("{}-{}.exe", binary_name, triple)
    } else {
        format!("{}-{}", binary_name, triple)
    };

    let bin_name_plain = if cfg!(target_os = "windows") {
        format!("{}.exe", binary_name)
    } else {
        binary_name.to_string()
    };

    let current_exe = std::env::current_exe().ok()?;
    let current_dir = current_exe.parent()?;

    // 1. Try resource directory first (so we are adjacent to the bundled DLLs in the binaries/ folder)
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        let res_path_triple = res_dir.join("binaries").join(&bin_name_triple);
        if res_path_triple.exists() {
            return Some(res_path_triple);
        }
        let res_path_plain = res_dir.join("binaries").join(&bin_name_plain);
        if res_path_plain.exists() {
            return Some(res_path_plain);
        }
    }

    // 2. Try current_dir/binaries fallback (useful for dev mode / tests where binaries are copied adjacent to the DLLs)
    let dev_binaries_triple = current_dir.join("binaries").join(&bin_name_triple);
    if dev_binaries_triple.exists() {
        return Some(dev_binaries_triple);
    }
    let dev_binaries_plain = current_dir.join("binaries").join(&bin_name_plain);
    if dev_binaries_plain.exists() {
        return Some(dev_binaries_plain);
    }

    // 3. Try triple name in current directory (standard Tauri sidecar behavior)
    let path_triple = current_dir.join(&bin_name_triple);
    if path_triple.exists() {
        return Some(path_triple);
    }

    // 4. Try plain name in current directory (how Tauri renames sidecars in target/debug during dev mode)
    let path_plain = current_dir.join(&bin_name_plain);
    if path_plain.exists() {
        return Some(path_plain);
    }

    // Return the default plain path if none found (so calling code gets a path to check/fail on)
    Some(current_dir.join(&bin_name_plain))
}

pub fn is_gpu_available() -> bool {
    #[cfg(target_os = "windows")]
    {
        std::path::Path::new("C:\\Windows\\System32\\nvcuda.dll").exists()
    }
    #[cfg(target_os = "linux")]
    {
        std::path::Path::new("/usr/lib/x86_64-linux-gnu/libcuda.so").exists()
            || std::path::Path::new("/usr/lib/libcuda.so").exists()
            || std::process::Command::new("nvidia-smi").output().is_ok()
    }
    #[cfg(target_os = "macos")]
    {
        // Apple Silicon macOS runs Metal acceleration out of the box in llama.cpp,
        // which does not require separate CUDA drivers.
        true
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        false
    }
}

#[tauri::command]
pub fn is_gpu_detected() -> bool {
    is_gpu_available()
}

pub fn run_local_inference(
    app_handle: &AppHandle,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    let model_path = get_model_path(app_handle)
        .ok_or_else(|| "Failed to resolve local model path".to_string())?;

    if !model_path.exists() {
        return Err("Local model is not downloaded. Please download it in Settings first.".to_string());
    }

    let sidecar_path = get_sidecar_path(app_handle, "verba-engine")
        .ok_or_else(|| "Failed to resolve verba-engine sidecar executable path".to_string())?;

    if !sidecar_path.exists() {
        return Err("Built-in runner (verba-engine sidecar) is missing from the installation.".to_string());
    }

    // Read config to see if GPU is enabled
    let config = crate::storage::get_config(app_handle);
    let use_gpu = config.use_gpu && is_gpu_available();

    // Run llama-completion without showing a console window on Windows (prevents focus loss and blur trigger)
    let mut cmd = std::process::Command::new(&sidecar_path);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0C000000); // CREATE_NO_WINDOW | CREATE_DEFAULT_ERROR_MODE
    }

    cmd.arg("-m").arg(&model_path);

    if use_gpu {
        cmd.arg("-ngl").arg("99");
    }
    let combined_prompt = format!(
        "<|start_header_id|>system<|end_header_id|>\n\n{}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n",
        system_prompt, user_prompt
    );

    cmd.arg("-c").arg("8192")
       .arg("-p").arg(combined_prompt)
       .arg("-no-cnv")
       .arg("-st")
       .arg("-n").arg("1024")
       .arg("--temp").arg("0.6")
       .arg("--repeat-penalty").arg("1.2")
       .arg("--no-warmup")
       .arg("--simple-io");

    cmd.stdin(std::process::Stdio::null());

    let output = cmd.output()
        .map_err(|e| format!("Failed to launch llama-completion sidecar: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Local inference failed: {}", stderr));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    
    // 1. Find the start of the model's actual answer after the assistant marker
    let assistant_marker = "<|start_header_id|>assistant<|end_header_id|>";
    let truncation_marker = "... (truncated)";
    
    let response_start = if let Some(pos) = stdout_str.rfind(assistant_marker) {
        &stdout_str[pos + assistant_marker.len()..]
    } else if let Some(pos) = stdout_str.rfind(truncation_marker) {
        &stdout_str[pos + truncation_marker.len()..]
    } else if let Some(pos) = stdout_str.rfind("assistant\r\n") {
        &stdout_str[pos + 11..]
    } else if let Some(pos) = stdout_str.rfind("assistant\n") {
        &stdout_str[pos + 10..]
    } else if let Some(pos) = stdout_str.rfind("assistant") {
        &stdout_str[pos + 9..]
    } else {
        &stdout_str
    };

    // 2. Locate the llama-cli stats block ([ Prompt: ... ]) and take only the text before it
    let stats_marker = "[ Prompt:";
    let clean_response = if let Some(pos) = response_start.find(stats_marker) {
        &response_start[..pos]
    } else {
        response_start
    };

    let final_text = clean_response
        .replace("<|eot_id|>", "")
        .replace("<|end_of_text|>", "")
        .replace("[end of text]", "")
        .trim()
        .to_string();

    Ok(final_text)
}

#[tauri::command]
pub fn delete_local_model(app_handle: AppHandle) -> Result<(), String> {
    if IS_DOWNLOADING.load(Ordering::SeqCst) {
        return Err("Cannot delete model while download is in progress. Please cancel the download first.".to_string());
    }
    if let Some(path) = get_model_path(&app_handle) {
        if path.exists() {
            std::fs::remove_file(path).map_err(|e| format!("Failed to delete model file: {}", e))?;
        }
        Ok(())
    } else {
        Err("Failed to resolve model storage path".to_string())
    }
}
