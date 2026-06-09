#[cfg(target_os = "windows")]
use std::thread::sleep;
#[cfg(target_os = "windows")]
use std::time::Duration;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
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
pub fn simulate_copy() {
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

#[cfg(not(target_os = "windows"))]
pub fn simulate_copy() {
    println!("Simulate copy is only supported on Windows in this implementation.");
}

#[cfg(not(target_os = "windows"))]
pub fn simulate_paste() {
    println!("Simulate paste is only supported on Windows in this implementation.");
}
