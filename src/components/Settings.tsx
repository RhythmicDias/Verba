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
  RefreshCw,
  Save
} from "lucide-react";

import ApiKeysTab from "./settings/ApiKeysTab";
import PreferencesTab from "./settings/PreferencesTab";
import HistoryTab, { HistoryEntry } from "./settings/HistoryTab";
import UpdatesTab from "./settings/UpdatesTab";

const APP_VERSION = "0.1.2";

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
  const [draftConfig, setDraftConfig] = useState<AppConfig | null>(null);

  // API Keys state
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
  const [currentVersion, setCurrentVersion] = useState("0.1.1");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "downloading" | "installing" | "up-to-date" | "error">("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateManifest, setUpdateManifest] = useState<Update | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    loadConfig();
    checkGpuDetection();

    getVersion().then((v) => setCurrentVersion(v)).catch((err) => console.error("Failed to read app version", err));

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

  const loadConfig = async () => {
    try {
      const conf: AppConfig = await invoke("get_app_config");
      setConfig(conf);
      setDraftConfig(JSON.parse(JSON.stringify(conf)));

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

    const shortcutStr = [...parts, keyName].join("+");
    setHotkeyError(null);
    setIsRecordingHotkey(false);

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

        <div className="mt-auto pt-6 border-t border-[#343b45]/40 text-[10px] text-slate-400 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-200">
            <span>Verba v{currentVersion}</span>
          </div>
          <p className="text-[10px] text-slate-500">Developed by Stephen Dias</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
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

        {/* Content Container (Reduced padding to match dense UI) */}
        <div className="flex-1 p-6 overflow-y-auto max-w-4xl w-full">
          {activeTab === "keys" && (
            <ApiKeysTab
              keysConfigured={keysConfigured}
              editKeys={editKeys}
              setEditKeys={setEditKeys}
              showKeys={showKeys}
              setShowKeys={setShowKeys}
              handleSaveKey={handleSaveKey}
              handleDeleteKey={handleDeleteKey}
            />
          )}

          {activeTab === "preferences" && (
            <PreferencesTab
              draftConfig={draftConfig}
              updateDraftField={updateDraftField}
              setDraftConfig={setDraftConfig}
              checkLocalModel={checkLocalModel}
              hasLocalModel={hasLocalModel}
              isDownloadingModel={isDownloadingModel}
              modelDownloadProgress={modelDownloadProgress}
              modelDownloadError={modelDownloadError}
              handleStartDownload={handleStartDownload}
              handleCancelDownload={handleCancelDownload}
              localModelPath={localModelPath}
              isGpuAvailable={isGpuAvailable}
              isRecordingHotkey={isRecordingHotkey}
              setIsRecordingHotkey={setIsRecordingHotkey}
              hotkeyError={hotkeyError}
              handleRecordHotkey={handleRecordHotkey}
            />
          )}

          {activeTab === "history" && (
            <HistoryTab
              history={config.history}
              clearAllHistory={clearAllHistory}
              deleteHistoryItem={deleteHistoryItem}
              copyToClipboard={copyToClipboard}
            />
          )}

          {activeTab === "update" && (
            <UpdatesTab
              currentVersion={currentVersion}
              updateStatus={updateStatus}
              updateError={updateError}
              updateManifest={updateManifest}
              downloadProgress={downloadProgress}
              checkForUpdates={checkForUpdates}
              installUpdate={installUpdate}
              setUpdateStatus={setUpdateStatus}
            />
          )}
        </div>
      </div>
    </div>
  );
}
