# iOS Implementation & Setup Plan for Verba

This document details the step-by-step phased plan to set up, build, and deploy the iOS version of Verba, focusing on a **macOS Host Development Environment**, Xcode Custom Keyboard Extensions, Sandboxing App Groups, and in-process local inference.

---

## Phase 1: Host Development Environment Setup (macOS)

Building and compiling applications for iOS (iPhone/iPad) requires Apple's compiler toolchains, which are only available on macOS machines.

### 1. Xcode Installation
1. Open the App Store on your Mac and download **Xcode** (latest stable version).
2. Once installed, open terminal and install the command-line developer tools:
   ```bash
   xcode-select --install
   ```
3. Open Xcode and agree to the license terms.

### 2. Package Managers & Runtimes
1. Install **Homebrew** (if not already installed) to manage Unix packages:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. Install **Node.js** and **Rust**:
   * Node.js: `brew install node`
   * Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### 3. iOS Deploy & Simulator Tools
Install command-line utilities to launch simulators and debug from your terminal:
```bash
brew install ios-deploy
```

### 4. Configure Rust Targets
Install compiler targets for physical iOS devices (ARM64) and simulated environments:
```bash
rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
```

### 5. Initialize iOS Project in Verba
Run the initialization command in the root of the `Verba` directory:
```bash
npm run tauri ios init
```
This generates the Xcode project workspace under `src-tauri/gen/apple`.

---

## Phase 2: iOS Custom Keyboard Extension Target

1. **Xcode Configuration**:
   * Open `src-tauri/gen/apple/Verba.xcodeproj` in Xcode.
   * Go to **File** -> **New** -> **Target...**.
   * Under the **iOS** tab, select **Custom Keyboard Extension** and click Next.
   * Name it `VerbaKeyboard` and click Finish.
2. **ViewController Setup**:
   * Locate `KeyboardViewController.swift` in the newly created project folder.
   * Embed a `WKWebView` pointing to the Tauri application instance route `/keyboard` (which React serves).
3. **Text Insertion**:
   * Use Apple's text document proxy in Swift to insert the polished text returned by the Rust inference engine:
     ```swift
     self.textDocumentProxy.insertText(polishedText)
     ```

---

## Phase 3: Sandboxing & App Groups
iOS apps and extensions are sandboxed separately. To share configurations, database files, and GGUF models between the main application interface (downloader/settings) and the Keyboard Extension (running inside other host apps):

1. **Enable App Groups**:
   * In Xcode, click the top-level project file, select the main **Verba** target -> **Signing & Capabilities** -> click **+ Capability** -> select **App Groups**.
   * Create an identifier (e.g. `group.com.yourname.verba`).
   * Repeat this configuration for the **VerbaKeyboard** target, checking the exact same group identifier.
2. **Shared Storage Pathing**:
   * Update the path resolutions in Rust (`storage.rs` and `llama.rs`) when running on iOS target configurations to use the App Group container path rather than the default sandbox folder.

---

## Phase 4: Frontend UI Route Optimization
1. **View Separation**:
   * Configure the React router to serve an ultra-compact, borderless design on `/keyboard` with support for keyboard height constraints.
2. **Keyboard Controls**:
   * Render button controls for styles (*Concise*, *Professional*, *Formal*), a progress loader, and a triggers to read/write selections.

---

## Phase 5: Verification & Testing
1. **Build and Run**:
   * Run the development server targeting iOS:
     ```bash
     npm run tauri ios dev
     ```
2. **Enabling Keyboard**:
   * Inside the iOS Simulator: go to Settings -> General -> Keyboard -> Keyboards -> Add New Keyboard -> Select **Verba**.
   * Tap **Verba** and toggle **Allow Full Access** (required to enable local network downloading and shared app group storage access).
3. **Inter-App Test**:
   * Open Apple Notes, select Verba from the Globe key, type text, and verify inline text replacement works as expected.
