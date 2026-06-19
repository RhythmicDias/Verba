import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { 
  Key, 
  Settings as SettingsIcon, 
  History, 
  Check, 
  Eye, 
  EyeOff, 
  Keyboard, 
  Trash2, 
  Copy,
  RefreshCw,
  Save,
  Download
} from "lucide-react";

interface HistoryEntry {
  id: string;
  before: string;
  after: string;
  timestamp: string;
  provider: string;
  style: string;
}

const STYLE_NAMES: Record<string, string> = {
  concise: "Concise",
  professional: "Professional",
  detailed: "Detailed",
  formal: "Formal",
  funny: "Funny",
  medical: "Medical",
  summarize: "Summarize",
  generative: "Generative",
  custom: "Custom Focus",
};

interface AppConfig {
  hotkey: string;
  active_provider: string;
  gemini_model: string;
  openai_model: string;
  openai_endpoint: string;
  anthropic_model: string;
  grok_model: string;
  groq_model: string;
  ollama_model: string;
  ollama_endpoint: string;
  openrouter_model: string;
  openrouter_endpoint: string;
  save_history: boolean;
  history: HistoryEntry[];
  style_shortcuts?: Record<string, string>;
  use_gpu: boolean;
}

type TabType = "keys" | "preferences" | "history" | "update";

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabType>("keys");
  const [config, setConfig] = useState<AppConfig | null>(null);
  
  // Local draft state for saving configurations
  const [draftConfig, setDraftConfig] = useState<AppConfig | null>(null);

  // API Keys state (retrieved from secure keyring)
  const [keysConfigured, setKeysConfigured] = useState<Record<string, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
    grok: false,
    groq: false,
    openrouter: false,
  });
  
  const [editKeys, setEditKeys] = useState<Record<string, string>>({
    gemini: "",
    openai: "",
    anthropic: "",
    grok: "",
    groq: "",
    openrouter: "",
  });
  
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Hotkey recorder state
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);

  // Ollama local models discovery
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isFetchingOllamaModels, setIsFetchingOllamaModels] = useState(false);

  // Local model state
  const [hasLocalModel, setHasLocalModel] = useState(false);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [modelDownloadProgress, setModelDownloadProgress] = useState({
    progress: 0,
    speed: 0,
    downloaded: 0,
    total: 0,
  });
  const [modelDownloadError, setModelDownloadError] = useState<string | null>(null);
  const [localModelPath, setLocalModelPath] = useState("");
  const [isGpuAvailable, setIsGpuAvailable] = useState(false);

  const checkGpuDetection = async () => {
    try {
      const detected = await invoke<boolean>("is_gpu_detected");
      setIsGpuAvailable(detected);
    } catch (err) {
      console.error("Failed to detect GPU:", err);
    }
  };

  // Updater State
  const [currentVersion, setCurrentVersion] = useState("0.1.0");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "downloading" | "installing" | "up-to-date" | "error">("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateManifest, setUpdateManifest] = useState<Update | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);



  useEffect(() => {
    loadConfig();
    checkGpuDetection();

    // Fetch current app version
    getVersion().then((v) => setCurrentVersion(v)).catch((err) => console.error("Failed to read app version", err));

    // Register trigger update listener from system tray
    const unlistenPromise = listen("trigger-update-check", () => {
      setActiveTab("update");
      checkForUpdates(true);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const checkLocalModel = async () => {
    try {
      const exists = await invoke<boolean>("check_local_model");
      setHasLocalModel(exists);
      const path = await invoke<string>("get_local_model_path");
      setLocalModelPath(path);
    } catch (err) {
      console.error("Failed to check local model:", err);
    }
  };

  const handleStartDownload = async () => {
    try {
      setModelDownloadError(null);
      setIsDownloadingModel(true);
      await invoke("download_local_model");
    } catch (err: any) {
      setIsDownloadingModel(false);
      setModelDownloadError(err.toString());
    }
  };

  const handleCancelDownload = async () => {
    try {
      await invoke("cancel_local_model_download");
    } catch (err) {
      console.error("Failed to cancel download:", err);
    }
  };

  useEffect(() => {
    checkLocalModel();

    let unlistenProgress: any;
    let unlistenComplete: any;
    let unlistenCancelled: any;
    let unlistenError: any;

    const setupListeners = async () => {
      unlistenProgress = await listen<any>("local-model-download-progress", (event) => {
        setIsDownloadingModel(true);
        setModelDownloadProgress(event.payload);
      });
      unlistenComplete = await listen("local-model-download-complete", () => {
        setIsDownloadingModel(false);
        setHasLocalModel(true);
        checkLocalModel();
        showTemporaryStatus("Local model downloaded successfully!");
      });
      unlistenCancelled = await listen("local-model-download-cancelled", () => {
        setIsDownloadingModel(false);
        showTemporaryStatus("Model download cancelled.");
      });
      unlistenError = await listen<string>("local-model-download-error", (event) => {
        setIsDownloadingModel(false);
        setModelDownloadError(event.payload);
      });
    };

    setupListeners();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
      if (unlistenCancelled) unlistenCancelled();
      if (unlistenError) unlistenError();
    };
  }, []);

  const checkForUpdates = async (manual = true) => {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const update = await check();
      if (update) {
        setUpdateManifest(update);
        setUpdateStatus("available");
      } else {
        setUpdateStatus("up-to-date");
        if (manual) showTemporaryStatus("You are running the latest version!");
      }
    } catch (err: any) {
      console.error("Check for updates failed:", err);
      setUpdateStatus("error");
      setUpdateError(err.toString());
    }
  };

  const installUpdate = async () => {
    if (!updateManifest) return;
    setUpdateStatus("downloading");
    setDownloadProgress(0);
    try {
      let downloaded = 0;
      let contentLength = 0;
      await updateManifest.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 1;
            setUpdateStatus("downloading");
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            setDownloadProgress(Math.round((downloaded / contentLength) * 100));
            break;
          case 'Finished':
            setUpdateStatus("installing");
            break;
        }
      });
      showTemporaryStatus("Relaunching app to apply update...");
      await relaunch();
    } catch (err: any) {
      console.error("Install update failed:", err);
      setUpdateStatus("error");
      setUpdateError(err.toString());
    }
  };

  const fetchOllamaModels = async (endpoint: string) => {
    setIsFetchingOllamaModels(true);
    try {
      const models: string[] = await invoke("get_ollama_models", { endpoint });
      setOllamaModels(models);
      showTemporaryStatus(`Found ${models.length} local Ollama models.`);
    } catch (err) {
      console.warn("Failed to contact local Ollama:", err);
      setOllamaModels([]);
    } finally {
      setIsFetchingOllamaModels(false);
    }
  };

  useEffect(() => {
    if (draftConfig?.active_provider === "ollama") {
      fetchOllamaModels(draftConfig.ollama_endpoint);
    }
  }, [draftConfig?.active_provider, draftConfig?.ollama_endpoint]);

  const loadConfig = async () => {
    try {
      const conf: AppConfig = await invoke("get_app_config");
      setConfig(conf);
      setDraftConfig(JSON.parse(JSON.stringify(conf))); // deep clone draft

      // Check which keys are stored in keyring
      const checkProviders = ["gemini", "openai", "anthropic", "grok", "groq", "openrouter"];
      const configuredStatus: Record<string, boolean> = {};
      for (const p of checkProviders) {
        const val: boolean = await invoke("has_api_key", { provider: p });
        configuredStatus[p] = val;
      }
      setKeysConfigured(configuredStatus);
    } catch (err) {
      console.error("Failed to load config", err);
    }
  };

  const handleSaveKey = async (provider: string) => {
    const keyVal = editKeys[provider];
    if (!keyVal) return;
    try {
      await invoke("set_api_key", { provider, key: keyVal });
      setEditKeys(prev => ({ ...prev, [provider]: "" }));
      showTemporaryStatus(`Successfully saved ${provider} API Key!`);
      loadConfig();
    } catch (err: any) {
      showTemporaryStatus(`Error saving API key: ${err}`);
    }
  };

  const handleDeleteKey = async (provider: string) => {
    if (!confirm(`Are you sure you want to delete the API key for ${provider}?`)) return;
    try {
      await invoke("delete_api_key", { provider });
      showTemporaryStatus(`Successfully deleted ${provider} API Key!`);
      loadConfig();
    } catch (err: any) {
      showTemporaryStatus(`Error deleting API key: ${err}`);
    }
  };

  // Explicit Save Configuration
  const handleSaveConfiguration = async () => {
    if (!draftConfig) return;
    try {
      await invoke("save_app_config", { config: draftConfig });
      setConfig(JSON.parse(JSON.stringify(draftConfig)));
      showTemporaryStatus("Configuration saved successfully!");
    } catch (err) {
      showTemporaryStatus(`Error saving settings: ${err}`);
    }
  };

  const updateDraftField = (field: keyof AppConfig, value: any) => {
    if (!draftConfig) return;
    setDraftConfig({ ...draftConfig, [field]: value });
  };

  const handleRecordHotkey = (e: React.KeyboardEvent) => {
    if (!isRecordingHotkey || !draftConfig) return;
    e.preventDefault();
    e.stopPropagation();

    const ignoreKeys = ["Control", "Alt", "Shift", "Meta"];
    if (ignoreKeys.includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    let keyName = e.key.toUpperCase();
    if (keyName === "ARROWUP") keyName = "Up";
    if (keyName === "ARROWDOWN") keyName = "Down";
    if (keyName === "ARROWLEFT") keyName = "Left";
    if (keyName === "ARROWRIGHT") keyName = "Right";
    if (keyName === "ESCAPE") keyName = "Esc";
    if (keyName === "ENTER") keyName = "Enter";
    if (keyName === " ") keyName = "Space";

    if (parts.length === 0) {
      setHotkeyError("Shortcut must include at least one modifier key (Ctrl, Alt, Shift)");
      return;
    }

    const shortcutStr = [...parts, keyName].join("+");
    setHotkeyError(null);
    setIsRecordingHotkey(false);

    // Update shortcut in Rust backend
    invoke("update_global_shortcut", { newHotkey: shortcutStr })
      .then(() => {
        loadConfig();
        showTemporaryStatus("Hotkey shortcut updated successfully!");
      })
      .catch((err) => {
        setHotkeyError(`Rust shortcut error: ${err}`);
      });
  };

  const showTemporaryStatus = (msg: string) => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(null), 3500);
  };

  const deleteHistoryItem = async (id: string) => {
    if (!config) return;
    const newHistory = config.history.filter(item => item.id !== id);
    const newConfig = { ...config, history: newHistory };
    setConfig(newConfig);
    if (draftConfig) {
      setDraftConfig({ ...draftConfig, history: newHistory });
    }
    try {
      await invoke("save_app_config", { config: newConfig });
    } catch (err) {
      console.error(err);
    }
  };

  const clearAllHistory = async () => {
    if (!config || !confirm("Clear all local history?")) return;
    const newConfig = { ...config, history: [] };
    setConfig(newConfig);
    if (draftConfig) {
      setDraftConfig({ ...draftConfig, history: [] });
    }
    try {
      await invoke("save_app_config", { config: newConfig });
      showTemporaryStatus("History cleared!");
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showTemporaryStatus("Copied to clipboard!");
  };

  if (!config || !draftConfig) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#5f6a7a] text-slate-200">
        <div className="animate-pulse">Loading settings...</div>
      </div>
    );
  }

  const hasChanges = JSON.stringify(config) !== JSON.stringify(draftConfig);

  return (
    <div className="flex h-screen bg-[#6b7685] text-slate-900 font-sans overflow-hidden">
      {/* Sidebar - Matte dark slate */}
      <div className="w-64 bg-[#23282f] border-r border-[#343b45]/40 flex flex-col p-6 text-slate-100">
        <div className="flex items-center gap-3 mb-8">
          <img src="/logo.png" alt="Verba Logo" className="w-8 h-8 rounded-lg shadow-md border border-slate-700/30 object-cover" />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white">Verba</h1>
            <span className="text-[10px] text-slate-400 font-medium">Control Center</span>
          </div>
        </div>

        <nav className="space-y-1">
          <button
            onClick={() => setActiveTab("keys")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${
              activeTab === "keys"
                ? "bg-[#eaecef] text-[#23282f] shadow-sm"
                : "text-slate-400 hover:bg-[#343b45]/50 hover:text-white"
            }`}
          >
            <Key size={16} />
            API Keys
          </button>
          <button
            onClick={() => setActiveTab("preferences")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${
              activeTab === "preferences"
                ? "bg-[#eaecef] text-[#23282f] shadow-sm"
                : "text-slate-400 hover:bg-[#343b45]/50 hover:text-white"
            }`}
          >
            <SettingsIcon size={16} />
            Preferences
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${
              activeTab === "history"
                ? "bg-[#eaecef] text-[#23282f] shadow-sm"
                : "text-slate-400 hover:bg-[#343b45]/50 hover:text-white"
            }`}
          >
            <History size={16} />
            Local History
          </button>
          <button
            onClick={() => setActiveTab("update")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${
              activeTab === "update"
                ? "bg-[#eaecef] text-[#23282f] shadow-sm"
                : "text-slate-400 hover:bg-[#343b45]/50 hover:text-white"
            }`}
          >
            <RefreshCw size={16} />
            Updates
          </button>
        </nav>

        {/* Footer info with accent color */}
        <div className="mt-auto pt-6 border-t border-[#343b45]/40 text-[10px] text-slate-400 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-200">
            <span>Verba v{currentVersion}</span>
          </div>
          <p className="text-[10px] text-slate-500">Developed by Stephen Dias</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top bar - soft header styling */}
        <div className="h-16 border-b border-[#5a6473]/30 bg-[#5d6776]/40 px-8 flex items-center justify-between text-white">
          <h2 className="text-sm font-bold tracking-tight text-white uppercase">
            {activeTab === "keys" && "Manage API Connections"}
            {activeTab === "preferences" && "Application Settings"}
            {activeTab === "history" && "Local log history"}
            {activeTab === "update" && "Application Updates"}
          </h2>
          <div className="flex items-center gap-3">
            {saveStatus && (
              <div className="text-[10px] bg-[#e8ff00] text-slate-900 border border-[#e8ff00]/20 px-3 py-1 rounded-full font-bold shadow-md">
                {saveStatus}
              </div>
            )}
            {activeTab === "preferences" && hasChanges && (
              <button
                onClick={handleSaveConfiguration}
                className="flex items-center gap-1.5 bg-[#e8ff00] hover:bg-[#d6ec00] text-[#23282f] text-xs font-bold px-4 py-1.5 rounded-full transition-all shadow-md"
              >
                <Save size={14} />
                Save Changes
              </button>
            )}
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 p-8 overflow-y-auto max-w-4xl w-full">
          {/* TAB 1: API KEYS - Light cards with soft contrast */}
          {activeTab === "keys" && (
            <div className="space-y-6">
              <p className="text-xs text-slate-200 leading-relaxed max-w-2xl font-medium">
                Configure your LLM model provider API keys. Keys are saved securely inside the OS native credential store (Windows Credential Manager) and never written in plaintext configuration files.
              </p>

              {["Gemini", "OpenAI", "Anthropic", "Grok", "Groq", "OpenRouter"].map((provider) => {
                const lower = provider.toLowerCase();
                const isConfigured = keysConfigured[lower];
                return (
                  <div key={provider} className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#23282f] tracking-wide uppercase">{provider}</span>
                        {isConfigured ? (
                          <span className="flex items-center gap-1 text-[9px] bg-[#23282f] text-[#e8ff00] px-2 py-0.5 rounded-full font-bold">
                            <Check size={9} /> Active
                          </span>
                        ) : (
                          <span className="text-[9px] bg-slate-300 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                            Not Configured
                          </span>
                        )}
                      </div>
                      {isConfigured && (
                        <button
                          onClick={() => handleDeleteKey(lower)}
                          className="text-[10px] text-red-600 hover:text-red-500 font-bold transition-colors flex items-center gap-1.5"
                        >
                          <Trash2 size={12} /> Clear Key
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKeys[lower] ? "text" : "password"}
                          placeholder={isConfigured ? "••••••••••••••••••••••••••••••••" : "Enter API Key..."}
                          value={editKeys[lower] || ""}
                          onChange={(e) => setEditKeys(prev => ({ ...prev, [lower]: e.target.value }))}
                          className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f] transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKeys(prev => ({ ...prev, [lower]: !prev[lower] }))}
                          className="absolute right-3.5 top-2 text-slate-500 hover:text-slate-800"
                        >
                          {showKeys[lower] ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      <button
                        onClick={() => handleSaveKey(lower)}
                        disabled={!editKeys[lower]}
                        className="bg-[#23282f] hover:bg-[#343b45] disabled:opacity-50 text-xs text-[#e8ff00] px-4 py-1.5 rounded-lg font-bold transition-all shadow-sm"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: PREFERENCES */}
          {activeTab === "preferences" && (
            <div className="space-y-6">
              {/* Default Provider Selector - Matte off-white card */}
              <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-2xl p-5 space-y-4 shadow-sm">
                <h3 className="text-xs font-bold text-[#23282f] tracking-wide uppercase">Model Provider Defaults</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Active LLM Provider</label>
                    <select
                      value={draftConfig.active_provider}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateDraftField("active_provider", val);
                        if (val === "local") {
                          checkLocalModel();
                        }
                      }}
                      className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#23282f]"
                    >
                      <option value="local">Built-In Polisher (Local Offline)</option>
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic Claude</option>
                      <option value="grok">xAI Grok</option>
                      <option value="groq">Groq LPU</option>
                      <option value="ollama">Ollama (Local)</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </div>

                  {draftConfig.active_provider === "local" && (
                    <div className="col-span-2 bg-slate-100 border border-slate-300/60 rounded-xl p-4.5 space-y-3.5 mt-1">
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <h4 className="text-xs font-bold text-[#23282f] tracking-wide uppercase">Built-In Model Status</h4>
                          <p className="text-[10px] text-slate-500 leading-normal max-w-md">
                            Offline polishing uses a highly-optimized Llama-3.2-1B model (~700MB) downloaded directly to your machine. No internet or API keys are required once setup.
                          </p>
                        </div>
                        {hasLocalModel ? (
                          <span className="bg-[#23282f] text-[#e8ff00] text-[9px] font-bold px-3 py-1 rounded-full border border-[#23282f]/20 uppercase">
                            Ready (Offline)
                          </span>
                        ) : (
                          <span className="bg-slate-300 text-slate-600 text-[9px] font-bold px-3 py-1 rounded-full uppercase">
                            Not Installed
                          </span>
                        )}
                      </div>

                      {isDownloadingModel ? (
                        <div className="space-y-2.5 pt-2">
                          <div className="flex justify-between text-[10px] font-bold text-slate-700">
                            <span>Downloading Llama-3.2-1B ({modelDownloadProgress.progress.toFixed(1)}%)</span>
                            <span>{modelDownloadProgress.speed.toFixed(1)} MB/s</span>
                          </div>
                          <div className="w-full bg-slate-300 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-[#23282f] h-full rounded-full transition-all duration-150"
                              style={{ width: `${modelDownloadProgress.progress}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[9px] text-slate-500 font-bold">
                            <span>{modelDownloadProgress.downloaded.toFixed(1)} MB / {modelDownloadProgress.total.toFixed(1)} MB</span>
                            <button
                              type="button"
                              onClick={handleCancelDownload}
                              className="text-red-600 hover:text-red-800 transition-colors uppercase cursor-pointer"
                            >
                              Cancel Download
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 pt-2">
                          {modelDownloadError && (
                            <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5 font-bold">
                              Error downloading model: {modelDownloadError}
                            </div>
                          )}
                          {!hasLocalModel && (
                            <button
                              type="button"
                              onClick={handleStartDownload}
                              className="w-full py-2 bg-[#23282f] hover:bg-[#343b45] text-[#e8ff00] text-xs font-bold rounded-lg transition-colors shadow-sm text-center cursor-pointer"
                            >
                              Download Local Model (700MB)
                            </button>
                          )}
                          {hasLocalModel && (
                            <div className="text-[10px] text-slate-600 font-semibold flex items-center gap-1.5">
                              <span className="text-emerald-600 text-xs">✓</span> Local model is successfully installed and ready for offline polishing.
                            </div>
                          )}
                        </div>
                      )}
                      {localModelPath && (
                        <>
                          <div className="pt-2.5 border-t border-slate-300/40 flex items-center justify-between">
                            <div className="space-y-0.5">
                              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">GPU Acceleration (CUDA)</label>
                              <span className="text-[9px] text-slate-400 font-medium normal-case block">
                                {isGpuAvailable
                                  ? "NVIDIA CUDA hardware detected. Enable for faster local offline inference."
                                  : "No NVIDIA CUDA GPU detected. Local offline inference will run on CPU."}
                              </span>
                            </div>
                            <input
                              type="checkbox"
                              checked={draftConfig.use_gpu}
                              disabled={!isGpuAvailable}
                              onChange={(e) => updateDraftField("use_gpu", e.target.checked)}
                              className="w-4 h-4 text-[#23282f] border-slate-300 rounded focus:ring-[#23282f] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            />
                          </div>
                          <div className="pt-2.5 border-t border-slate-300/40 text-[10px] text-slate-500 font-bold space-y-1">
                            <span className="uppercase text-[9px] tracking-wider text-slate-400">Model Storage Path</span>
                            <div className="bg-slate-200/60 border border-slate-300/40 px-2.5 py-1.5 rounded-lg select-text break-all font-mono text-[9px] text-slate-700">
                              {localModelPath}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {draftConfig.active_provider === "gemini" && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Gemini Model</label>
                      <input
                        type="text"
                        value={draftConfig.gemini_model}
                        onChange={(e) => updateDraftField("gemini_model", e.target.value)}
                        className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f]"
                      />
                    </div>
                  )}

                  {draftConfig.active_provider === "openai" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">OpenAI Model</label>
                        <input
                          type="text"
                          value={draftConfig.openai_model}
                          onChange={(e) => updateDraftField("openai_model", e.target.value)}
                          className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f]"
                        />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">API Endpoint</label>
                        <input
                          type="text"
                          value={draftConfig.openai_endpoint}
                          onChange={(e) => updateDraftField("openai_endpoint", e.target.value)}
                          className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f]"
                        />
                      </div>
                    </>
                  )}

                  {draftConfig.active_provider === "anthropic" && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Claude Model</label>
                      <input
                        type="text"
                        value={draftConfig.anthropic_model}
                        onChange={(e) => updateDraftField("anthropic_model", e.target.value)}
                        className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f]"
                      />
                    </div>
                  )}

                  {draftConfig.active_provider === "grok" && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Grok Model</label>
                      <input
                        type="text"
                        value={draftConfig.grok_model}
                        onChange={(e) => updateDraftField("grok_model", e.target.value)}
                        className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f]"
                      />
                    </div>
                  )}

                  {draftConfig.active_provider === "groq" && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Groq Model</label>
                      <input
                        type="text"
                        value={draftConfig.groq_model}
                        onChange={(e) => updateDraftField("groq_model", e.target.value)}
                        className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f]"
                      />
                    </div>
                  )}

                  {draftConfig.active_provider === "ollama" && (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Local Model Tag</label>
                          <button
                            type="button"
                            onClick={() => fetchOllamaModels(draftConfig.ollama_endpoint)}
                            disabled={isFetchingOllamaModels}
                            className="text-[9px] text-blue-600 hover:text-blue-800 font-extrabold flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw size={10} className={isFetchingOllamaModels ? "animate-spin" : ""} />
                            Refresh
                          </button>
                        </div>
                        {ollamaModels.length > 0 ? (
                          <select
                            value={draftConfig.ollama_model}
                            onChange={(e) => updateDraftField("ollama_model", e.target.value)}
                            className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#23282f]"
                          >
                            {ollamaModels.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={draftConfig.ollama_model}
                            placeholder="e.g. llama3"
                            onChange={(e) => updateDraftField("ollama_model", e.target.value)}
                            className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f]"
                          />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Ollama API URL</label>
                        <input
                          type="text"
                          value={draftConfig.ollama_endpoint}
                          onChange={(e) => updateDraftField("ollama_endpoint", e.target.value)}
                          className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f]"
                        />
                      </div>
                    </>
                  )}

                  {draftConfig.active_provider === "openrouter" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">OpenRouter Model</label>
                        <input
                          type="text"
                          value={draftConfig.openrouter_model}
                          onChange={(e) => updateDraftField("openrouter_model", e.target.value)}
                          className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">OpenRouter API URL</label>
                        <input
                          type="text"
                          value={draftConfig.openrouter_endpoint}
                          onChange={(e) => updateDraftField("openrouter_endpoint", e.target.value)}
                          className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f]"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Privacy Settings */}
              <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-2xl p-5 space-y-4 shadow-sm">
                <h3 className="text-xs font-bold text-[#23282f] tracking-wide uppercase">Privacy Settings</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-[11px] text-[#23282f] font-bold uppercase tracking-wider block">Save Local History</label>
                    <span className="text-[10px] text-slate-500 font-medium">Toggle whether polished text is persistently stored in your local configuration.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftConfig.save_history}
                    onChange={(e) => updateDraftField("save_history", e.target.checked)}
                    className="w-4 h-4 text-[#23282f] border-slate-300 rounded focus:ring-[#23282f]"
                  />
                </div>
              </div>

              {/* Style Shortcuts Settings */}
              <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-2xl p-5 space-y-4 shadow-sm">
                <h3 className="text-xs font-bold text-[#23282f] tracking-wide uppercase flex items-center gap-2">
                  <Keyboard size={16} /> Style Keyboard Shortcuts
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Assign a single-character key (letter, number, or symbol) to quickly trigger options when the popup is visible. Keys are ignored when typing in the custom instruction input.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  {Object.keys(STYLE_NAMES).map((styleId) => {
                    const shortcut = draftConfig?.style_shortcuts?.[styleId] || "";
                    return (
                      <div key={styleId} className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block truncate">
                          {STYLE_NAMES[styleId]}
                        </label>
                        <input
                          type="text"
                          maxLength={1}
                          value={shortcut}
                          onChange={(e) => {
                            const val = e.target.value;
                            const newShortcuts = { 
                              ...(draftConfig?.style_shortcuts || {}), 
                              [styleId]: val 
                            };
                            setDraftConfig(prev => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                style_shortcuts: newShortcuts
                              };
                            });
                          }}
                          className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-bold text-center uppercase focus:outline-none focus:border-[#23282f]"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Shortcut Manager Settings */}
              <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-2xl p-5 space-y-4 shadow-sm">
                <h3 className="text-xs font-bold text-[#23282f] tracking-wide uppercase flex items-center gap-2">
                  <Keyboard size={16} /> Global Trigger Shortcut
                </h3>
                <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                  Use the trigger button below to assign a new hotkey. Press your combination of modifiers (e.g. Ctrl, Alt, Shift) along with a key, then release.
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onKeyDown={handleRecordHotkey}
                    onClick={() => {
                      setIsRecordingHotkey(true);
                      setHotkeyError(null);
                    }}
                    className={`px-5 py-3 rounded-full border text-xs font-extrabold tracking-wide uppercase transition-all shadow-sm ${
                      isRecordingHotkey
                        ? "bg-red-950/80 border-red-500 text-red-400 animate-pulse"
                        : "bg-[#23282f] hover:bg-[#343b45] border-transparent text-[#e8ff00]"
                    }`}
                  >
                    {isRecordingHotkey ? "Recording (Press Keys)..." : `Trigger Key: ${config.hotkey}`}
                  </button>
                  {isRecordingHotkey && (
                    <button
                      onClick={() => setIsRecordingHotkey(false)}
                      className="text-xs text-slate-500 hover:text-slate-800 font-bold"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {hotkeyError && (
                  <p className="text-xs font-bold text-red-600">{hotkeyError}</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LOCAL HISTORY - Dark cards for visual contrast */}
          {activeTab === "history" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center text-white">
                <p className="text-xs text-slate-100 font-medium">
                  Total logged adjustments: <strong className="text-[#e8ff00] font-extrabold">{config.history.length}</strong>
                </p>
                {config.history.length > 0 && (
                  <button
                    onClick={clearAllHistory}
                    className="text-xs font-bold text-red-200 hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={13} /> Clear Log History
                  </button>
                )}
              </div>

              {config.history.length === 0 ? (
                <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-2xl p-8 text-center text-slate-500 text-xs shadow-sm">
                  No local history recorded yet. Polish any text to write to this dashboard.
                </div>
              ) : (
                <div className="space-y-4">
                  {config.history.map((item) => (
                    <div key={item.id} className="bg-[#23282f] border border-[#343b45]/45 rounded-2xl p-4.5 space-y-3 relative text-slate-200 shadow-md">
                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold border-b border-[#343b45]/40 pb-2">
                        <div className="flex items-center gap-3">
                          <span className="capitalize px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[#e8ff00] font-bold">
                            {item.style}
                          </span>
                          <span className="uppercase tracking-wider text-slate-400 font-bold">
                            {item.provider}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span>{new Date(item.timestamp).toLocaleString()}</span>
                          <button
                            onClick={() => deleteHistoryItem(item.id)}
                            className="text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Before</span>
                            <button
                              onClick={() => copyToClipboard(item.before)}
                              className="text-slate-500 hover:text-white"
                            >
                              <Copy size={10} />
                            </button>
                          </div>
                          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 max-h-24 overflow-y-auto text-slate-300 whitespace-pre-wrap select-text italic">
                            {item.before}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider text-[#e8ff00]">After</span>
                            <button
                              onClick={() => copyToClipboard(item.after)}
                              className="text-slate-500 hover:text-white"
                            >
                              <Copy size={10} />
                            </button>
                          </div>
                          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-white max-h-24 overflow-y-auto whitespace-pre-wrap select-text font-medium">
                            {item.after}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: UPDATES */}
          {activeTab === "update" && (
            <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-2xl p-6 space-y-6 shadow-sm text-slate-800">
              <div className="flex items-center justify-between border-b border-[#d2d5db] pb-4">
                <div>
                  <h3 className="text-sm font-bold text-[#23282f] tracking-wide uppercase">Application Updates</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">Current Version: <span className="font-extrabold text-[#23282f]">{currentVersion}</span></p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#23282f] flex items-center justify-center text-[#e8ff00] font-bold">
                  v2
                </div>
              </div>

              {updateStatus === "idle" && (
                <div className="py-4 text-center space-y-4">
                  <p className="text-xs text-slate-600">Check if there is a newer release of Verba available.</p>
                  <button
                    onClick={() => checkForUpdates(true)}
                    className="bg-[#23282f] hover:bg-[#343b45] text-xs text-[#e8ff00] px-5 py-2 rounded-full font-bold transition-all shadow-sm flex items-center gap-2 mx-auto cursor-pointer"
                  >
                    <RefreshCw size={13} /> Check for Updates
                  </button>
                </div>
              )}

              {updateStatus === "checking" && (
                <div className="py-8 flex flex-col items-center justify-center gap-3">
                  <RefreshCw size={24} className="text-[#23282f] animate-spin" />
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Checking for updates...</p>
                </div>
              )}

              {updateStatus === "up-to-date" && (
                <div className="py-6 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto shadow-inner">
                    <Check size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">You are up to date!</p>
                    <p className="text-[10px] text-slate-500 mt-1">Verba {currentVersion} is currently the newest version available.</p>
                  </div>
                  <button
                    onClick={() => checkForUpdates(true)}
                    className="border border-[#23282f] hover:bg-slate-100 text-xs text-[#23282f] px-5 py-2 rounded-full font-bold transition-all shadow-sm flex items-center gap-2 mx-auto cursor-pointer"
                  >
                    <RefreshCw size={13} /> Check Again
                  </button>
                </div>
              )}

              {updateStatus === "available" && updateManifest && (
                <div className="space-y-4">
                  <div className="bg-[#23282f] text-white p-4.5 rounded-xl border border-[#343b45] space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-[#e8ff00] uppercase tracking-wide">Update Available</span>
                      <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded font-mono">v{updateManifest.version}</span>
                    </div>
                    {updateManifest.body && (
                      <div className="text-[11px] text-slate-300 leading-relaxed border-t border-[#343b45]/60 pt-2 font-medium italic">
                        {updateManifest.body}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setUpdateStatus("idle")}
                      className="border border-slate-300 hover:bg-slate-100 text-xs text-slate-700 px-4 py-1.5 rounded-full font-bold transition-all cursor-pointer"
                    >
                      Later
                    </button>
                    <button
                      onClick={installUpdate}
                      className="bg-green-600 hover:bg-green-500 text-xs text-white px-5 py-1.5 rounded-full font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download size={13} /> Update Now
                    </button>
                  </div>
                </div>
              )}

              {(updateStatus === "downloading" || updateStatus === "installing") && (
                <div className="py-6 space-y-4">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{updateStatus === "downloading" ? "Downloading update..." : "Installing update..."}</span>
                    {updateStatus === "downloading" && <span>{downloadProgress}%</span>}
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 shadow-inner overflow-hidden">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${updateStatus === "downloading" ? downloadProgress : 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 italic text-center">
                    {updateStatus === "downloading" 
                      ? "Retrieving update files from secure release servers..." 
                      : "Applying updates. The application will restart automatically."}
                  </p>
                </div>
              )}

              {updateStatus === "error" && (
                <div className="py-4 space-y-4 text-center">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-700 leading-relaxed max-w-md mx-auto shadow-sm">
                    <p className="font-bold">Check Failed</p>
                    <p className="text-[10px] mt-1 text-red-600/90 font-mono break-all">{updateError}</p>
                  </div>
                  <button
                    onClick={() => checkForUpdates(true)}
                    className="bg-[#23282f] hover:bg-[#343b45] text-xs text-[#e8ff00] px-5 py-2 rounded-full font-bold transition-all shadow-sm flex items-center gap-2 mx-auto cursor-pointer"
                  >
                    <RefreshCw size={13} /> Try Again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
