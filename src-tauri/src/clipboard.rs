#[cfg(target_os = "windows")]
use std::thread::sleep;
#[cfg(target_os = "windows")]
use std::time::Duration;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    GetAsyncKeyState,
};

#[cfg(target_os = "windows")]
const VK_CONTROL: u16 = 0x11;
#[cfg(target_os = "windows")]
const VK_C: u16 = 0x43;
#[cfg(target_os = "windows")]
const VK_V: u16 = 0x56;

#[cfg(target_os = "windows")]
unsafe fn send_key_event(vk: u16, up: bool) {
    let mut input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    SendInput(1, &mut input, std::mem::size_of::<INPUT>() as i32);
}

#[cfg(target_os = "windows")]
pub fn wait_for_keys_release() {
    let keys_to_check = [
        0x11, // VK_CONTROL
        0x12, // VK_MENU (Alt)
        0x10, // VK_SHIFT
        0x5B, // VK_LWIN
        0x5C, // VK_RWIN
        // F1 to F12
        0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0x7B,
    ];

    let start = std::time::Instant::now();
    unsafe {
        while start.elapsed() < Duration::from_millis(800) {
            let mut any_pressed = false;
            for &vk in &keys_to_check {
                if GetAsyncKeyState(vk as i32) as u16 & 0x8000 != 0 {
                    any_pressed = true;
                    break;
                }
            }
            if !any_pressed {
                break;
            }
            sleep(Duration::from_millis(10));
        }
    }
}

#[cfg(target_os = "windows")]
pub fn simulate_copy() {
    // Wait for modifier keys to be physically released first
    wait_for_keys_release();

    unsafe {
        // Press Ctrl
        send_key_event(VK_CONTROL, false);
        sleep(Duration::from_millis(50));
        // Press C
        send_key_event(VK_C, false);
        sleep(Duration::from_millis(50));
        // Release C
        send_key_event(VK_C, true);
        sleep(Duration::from_millis(50));
        // Release Ctrl
        send_key_event(VK_CONTROL, true);
        sleep(Duration::from_millis(100)); // wait for clipboard to update
    }
}

#[cfg(target_os = "windows")]
pub fn simulate_paste() {
    unsafe {
        // Press Ctrl
        send_key_event(VK_CONTROL, false);
        sleep(Duration::from_millis(50));
        // Press V
        send_key_event(VK_V, false);
        sleep(Duration::from_millis(50));
        // Release V
        send_key_event(VK_V, true);
        sleep(Duration::from_millis(50));
        // Release Ctrl
        send_key_event(VK_CONTROL, true);
        sleep(Duration::from_millis(50));
    }
}

#[cfg(target_os = "macos")]
pub fn simulate_copy() {
    // macOS accessibility entitlement needs a brief sleep to let the user release the trigger keys
    std::thread::sleep(std::time::Duration::from_millis(250));
    let _ = std::process::Command::new("osascript")
        .arg("-e")
        .arg("tell application \"System Events\" to keystroke \"c\" using {command down}")
        .output();
    std::thread::sleep(std::time::Duration::from_millis(150));
}

#[cfg(target_os = "macos")]
pub fn simulate_paste() {
    // macOS accessibility entitlement needs a brief sleep to let trigger keys release
    std::thread::sleep(std::time::Duration::from_millis(250));
    let _ = std::process::Command::new("osascript")
        .arg("-e")
        .arg("tell application \"System Events\" to keystroke \"v\" using {command down}")
        .output();
    std::thread::sleep(std::time::Duration::from_millis(150));
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn simulate_copy() {
    println!("Simulate copy is only supported on Windows and macOS in this implementation.");
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn simulate_paste() {
    println!("Simulate paste is only supported on Windows and macOS in this implementation.");
}
