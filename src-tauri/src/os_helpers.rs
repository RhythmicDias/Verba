#[cfg(target_os = "macos")]
pub fn get_active_app_name() -> Option<String> {
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg("tell application \"System Events\" to name of first application process whose frontmost is true")
        .output()
        .ok()?;
    if output.status.success() {
        let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !name.is_empty() {
            return Some(name);
        }
    }
    None
}

#[cfg(target_os = "windows")]
pub fn capture_foreground_window() -> Option<isize> {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let hwnd = unsafe { GetForegroundWindow() } as isize;
    Some(hwnd)
}

#[cfg(target_os = "macos")]
pub fn capture_foreground_window() -> Option<String> {
    get_active_app_name()
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn capture_foreground_window() -> Option<()> {
    None
}

#[cfg(target_os = "windows")]
pub fn focus_window(window: Option<isize>) {
    if let Some(hwnd) = window {
        use windows_sys::Win32::UI::WindowsAndMessaging::{SetForegroundWindow, IsWindow};
        unsafe {
            if IsWindow(hwnd as _) != 0 {
                SetForegroundWindow(hwnd as _);
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }
    }
}

#[cfg(target_os = "macos")]
pub fn focus_window(window: Option<String>) {
    if let Some(ref app_name) = window {
        // Sanitize app_name to prevent AppleScript injection.
        let safe_name: String = app_name
            .chars()
            .filter(|c| !"\"\\{};&|`'".contains(*c))
            .collect();
        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(format!("tell application \"{}\" to activate", safe_name))
            .output();
        std::thread::sleep(std::time::Duration::from_millis(150));
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn focus_window(_window: Option<()>) {
    // Unsupported or no-op on Linux for now
}
