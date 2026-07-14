# Android Implementation & Setup Plan for Verba

This document details the step-by-step phased plan to set up, build, and deploy the Android version of Verba, focusing on a **Windows Host Development Environment**, NDK compilation, integrating the Kotlin `InputMethodService` (for the keyboard), and deploying to an emulator or physical device.

---

## Phase 1: Host Development Environment Setup (Windows)

To build the Android mobile application on a Windows host machine, you need to configure the Java JDK, Android SDK/NDK, and environment paths.

### 1. Prerequisites Installation
1. **Node.js**: Ensure Node.js (v18+) is installed.
2. **Rust**: Ensure Rust is installed (via `rustup`).
3. **Java Development Kit (JDK)**:
   * Download and install **Java JDK 17** (Tauri v2 requires JDK 17 for Gradle builds).
   * Verify installation in PowerShell: `java -version`

### 2. Android Studio & SDKs
1. **Download Android Studio** from [developer.android.com](https://developer.android.com/studio) and install it.
2. Open Android Studio and complete the Setup Wizard (standard setup installs SDK and emulator tools).
3. Go to **Tools** > **SDK Manager**:
   * **SDK Platforms**: Check **Android 14.0 (UpsideDownCake)** (API Level 34) or newer.
   * **SDK Tools**: Expand and check:
     * **Android SDK Build-Tools**
     * **NDK (Side by side)** (Crucial: required to compile the C++ `llama.cpp` Rust bindings)
     * **Android SDK Command-line Tools (latest)**
     * **CMake**
     * **Android Emulator**
   * Click **Apply** and wait for installation to complete.

### 3. Windows Environment Variables Configuration
To allow Cargo and Tauri CLI to call Android SDK and NDK compilers:
1. Search for **Edit the system environment variables** in the Windows Start menu.
2. Click **Environment Variables...**.
3. Under **User variables**, click **New...**:
   * **Variable Name**: `ANDROID_HOME`
   * **Variable Value**: `%LOCALAPPDATA%\Android\Sdk` (or your custom SDK install location)
4. Under **User variables**, select the **Path** variable, click **Edit...**, and add the following two directories:
   * `%LOCALAPPDATA%\Android\Sdk\platform-tools`
   * `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin`
5. Click **OK** to apply. Verify in PowerShell by typing `adb --version` (should show version info).

### 4. Configure Rust Targets
Open PowerShell and install the compilation targets for Android architectures:
```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

### 5. Initialize Android Project in Verba
In the root directory of the `Verba` project, run:
```powershell
npm run tauri android init
```
This generates the Android Studio project template under `src-tauri/gen/android`.

---

## Phase 2: In-Process Local LLM (llama.cpp on Android)
1. **Compilation Configuration**:
   * Add NDK compilation flags in `src-tauri/build.rs` to compile `llama.cpp` source code using the NDK Clang toolchain.
2. **Mobile Constraints**:
   * Restrict default GGUF models to lightweight parameters (e.g. Qwen2.5-1.5B-Instruct-Q4_K_M.gguf) to avoid OOM (Out Of Memory) crashes on devices with limited RAM.
3. **Sandbox Directories**:
   * Redirect model downloads and configurations to Android internal application storage (`Context.getFilesDir()`).

---

## Phase 3: Android Input Method Editor (IME) Service
Android custom keyboards are registered as Input Method Editors.

1. **Service Registration**:
   * Create `VerbaInputMethodService.kt` under `src-tauri/gen/android/app/src/main/java/...`.
   * Extend `android.inputmethodservice.InputMethodService`.
2. **Manifest Declaration**:
   * Add the IME service to `AndroidManifest.xml` with bind permissions:
     ```xml
     <service
         android:name=".VerbaInputMethodService"
         android:permission="android.permission.BIND_INPUT_METHOD"
         android:exported="true">
         <intent-filter>
             <action android:name="view.InputMethod" />
         </intent-filter>
         <meta-data
             android:name="android.view.im"
             android:resource="@xml/method" />
     </service>
     ```
3. **WebView Binding**:
   * Embed a WebView inside the keyboard's input view container pointing to `/keyboard` to render the React controls.
4. **Text Insertion**:
   * Implement a JNI native channel to commit text via:
     ```kotlin
     currentInputConnection.commitText(polishedText, 1)
     ```

---

## Phase 4: Frontend UI Route Optimization
1. **View Separation**:
   * Configure React router to serve an ultra-compact, borderless design on `/keyboard` with support for keyboard height configurations.
2. **Quick Actions**:
   * Render buttons for styles (*Concise*, *Professional*, *Formal*), a progress indicator, and a triggers to read/write selections.

---

## Phase 5: Verification & Testing
1. **Start Emulator**:
   * Open Android Studio -> Tools -> Device Manager -> Start Virtual Device.
2. **Build and Run**:
   * Run the development server targeting Android:
     ```powershell
     npm run tauri android dev
     ```
3. **Enabling Keyboard**:
   * Inside the Emulator: Settings -> System -> Languages & Input -> On-screen Keyboard -> Manage Keyboards -> Enable **Verba Keyboard**.
4. **Test Integration**:
   * Open an editor (e.g., Google Keep, Messages), switch keyboard input to Verba, type, and verify text replacement.
