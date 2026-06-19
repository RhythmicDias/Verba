# 📝 Verba

<div align="center">

[![GitHub License](https://img.shields.io/github/license/RhythmicDias/Verba?style=for-the-badge&labelColor=1e1e2e&color=8b5cf6)](https://github.com/RhythmicDias/Verba/blob/main/LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/RhythmicDias/Verba?style=for-the-badge&labelColor=1e1e2e&color=3b82f6)](https://github.com/RhythmicDias/Verba/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/RhythmicDias/Verba?style=for-the-badge&labelColor=1e1e2e&color=f43f5e)](https://github.com/RhythmicDias/Verba/issues)
[![GitHub Repo Size](https://img.shields.io/github/repo-size/RhythmicDias/Verba?style=for-the-badge&labelColor=1e1e2e&color=10b981)](https://github.com/RhythmicDias/Verba)

[![Rust](https://img.shields.io/badge/Rust-1.94+-black?style=for-the-badge&logo=rust&logoColor=white&labelColor=1e1e2e)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?style=for-the-badge&logo=tauri&logoColor=white&labelColor=1e1e2e)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react&logoColor=black&labelColor=1e1e2e)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?style=for-the-badge&logo=typescript&logoColor=white&labelColor=1e1e2e)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6+-646CFF?style=for-the-badge&logo=vite&logoColor=white&labelColor=1e1e2e)](https://vite.dev/)

</div>

---

**Verba** is an AI-powered text-polishing utility built with **Tauri v2**, **React**, **TypeScript**, and **Rust**. It runs silently in your system tray, listens to a global hotkey, instantly captures selected text, polishes it using LLM providers, and pastes the refined text back to your focused application.

## ✨ Features

- **Global Hotkey Activation**: Quickly select any text, press the hotkey (default: `Ctrl+Alt+P`), and watch it load in the Verba popup.
- **AI Text Polishing**: Integrate with top-tier AI LLM providers to clean up grammar, tone, style, or translate text.
- **Local Offline Inference**: Run text polishing completely offline using the lightweight `Llama-3.2-1B-Instruct` model powered by a built-in `llama-completion` sidecar. No API keys or internet connection required!
- **Local Model Downloader**: In-app panel to trigger, track, and cancel model downloads from HuggingFace with live download speeds and progress indicators.
- **Auto-Paste Back**: Seamlessly writes polished text back to your clipboard and injects it back into your active window.
- **Clipboard Preservation**: Backs up and restores your pre-existing clipboard contents automatically, preventing pollution of your copy/paste queue.
- **Keyboard Safety Validation**: Dynamically detects physical keystrokes and waits for hotkey releases before executing `Ctrl+C`, preventing selection replacement bugs (e.g. typing a literal 'c' instead of copying).
- **Anti-Clipping Window Layout**: Custom container layouts with fine-tuned paddings and margins to prevent CSS box-shadow clipping issues on transparent overlays.
- **System Tray Menu**: Run the app in the background with a system tray menu allowing easy access to settings and application exit.
- **Polishing History**: Keep track of previously edited texts for easy reference and reuse.
- **Secure Storage**: Safe handling of API keys using system-native keyring storage via Rust.

## 🤖 Local Offline Inference Setup

Verba supports 100% local, offline text polishing. To use this feature:

1. **Get the Executables**: Download the `llama-completion` executables and dynamic libraries (`.dll`/`.so`/`.dylib`) from the `llama.cpp` releases.
2. **Place Executables & DLLs**:
   - For compilation and bundling, place a renamed binary `llama-completion-<target-triple>.exe` in the [src-tauri/binaries](file:///d:/PythonProjects/Verba/src-tauri/binaries) directory.
   - For active development/runtime, place the dynamic libraries (`llama.dll`, `ggml.dll`, `ggml-cpu-*.dll`, etc.) and `llama-completion.exe` in the active build folder (e.g., [src-tauri/target/debug](file:///d:/PythonProjects/Verba/src-tauri/target/debug) or the production installation folder).
3. **Download the Model**: Launch Verba, go to **Settings**, select the **Local** provider, and click **Download Model** to fetch the 800MB `Llama-3.2-1B-Instruct-Q4_K_M.gguf` model file directly.
4. **Trigger Polishing**: Highlight any text, press your hotkey, select **Generative** (or any local prompt), and watch it polish instantly offline without calling any external APIs.

## 🛠️ Tech Stack

- **Desktop Framework**: [Tauri v2](https://tauri.app/) (Rust backend)
- **Local LLM Engine**: [llama.cpp](https://github.com/ggerganov/llama.cpp) via `llama-completion` sidecar
- **Frontend library**: [React](https://react.dev/) with [Vite](https://vite.dev/)
- **Programming Languages**: Rust (Core Logic), TypeScript (UI & Application orchestration)
- **Security**: System Keychain (`keyring-rs`) for API key protection

## 🚀 Quick Start

### Prerequisites

Ensure you have the following installed on your local machine:

1. **Rust & Cargo**: Follow instructions at [rustup.rs](https://rustup.rs/).
2. **Node.js & npm**: Install via [nodejs.org](https://nodejs.org/).
3. **Tauri Prerequisites**: Depending on your OS, install necessary dependencies listed in the [Tauri Getting Started Guide](https://tauri.app/start/prerequisites/).

### Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/RhythmicDias/Verba.git
   cd Verba
   ```

2. **Install node dependencies**:
   ```bash
   npm install
   ```

3. **Run in development mode**:
   ```bash
   npm run tauri dev
   ```

### Production Build

To build a standalone production-ready package:
```bash
npm run tauri build
```

## 📜 License

Distributed under the **MIT License**. See [LICENSE](file:///d:/PythonProjects/Verba/LICENSE) for more information.
