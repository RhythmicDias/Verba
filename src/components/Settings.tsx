import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  Save
} from "lucide-react";

interface HistoryEntry {
  id: string;
  before: string;
  after: string;
  timestamp: string;
  provider: string;
  style: string;
}

interface AppConfig {
  hotkey: string;
  active_provider: string;
  gemini_model: string;
  openai_model: string;
  openai_endpoint: string;
  anthropic_model: string;
  grok_model: string;
  ollama_model: string;
  ollama_endpoint: string;
  openrouter_model: string;
  openrouter_endpoint: string;
  history: HistoryEntry[];
}

type TabType = "keys" | "preferences" | "history";

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
    openrouter: false,
  });
  
  const [editKeys, setEditKeys] = useState<Record<string, string>>({
    gemini: "",
    openai: "",
    anthropic: "",
    grok: "",
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

  useEffect(() => {
    loadConfig();
  }, []);

  const fetchOllamaModels = async (endpoint: string) => {
    setIsFetchingOllamaModels(true);
    try {
      let baseUrl = "http://localhost:11434";
      try {
        const url = new URL(endpoint);
        baseUrl = `${url.protocol}//${url.host}`;
      } catch (_) {}

      const response = await fetch(`${baseUrl}/api/tags`);
      if (!response.ok) throw new Error("Ollama tags API responded with an error");
      const data = await response.json();
      const models = data.models?.map((m: any) => m.name) || [];
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
      const checkProviders = ["gemini", "openai", "anthropic", "grok", "openrouter"];
      const configuredStatus: Record<string, boolean> = {};
      for (const p of checkProviders) {
        const val: string | null = await invoke("get_api_key", { provider: p });
        configuredStatus[p] = !!val;
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
    if (!config || !confirm("Clear all session history?")) return;
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
          <div className="w-8 h-8 rounded-full bg-[#e8ff00] flex items-center justify-center text-[#23282f] font-extrabold shadow-md shadow-[#e8ff00]/10">
            V
          </div>
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
            Session History
          </button>
        </nav>

        {/* Footer info with accent color */}
        <div className="mt-auto pt-6 border-t border-[#343b45]/40 text-[10px] text-slate-400 flex flex-col gap-1">
          <p className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e8ff00]" />
            Local RTX CUDA optimized
          </p>
          <p>Tauri Version 2.0 • React</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top bar - soft header styling */}
        <div className="h-16 border-b border-[#5a6473]/30 bg-[#5d6776]/40 px-8 flex items-center justify-between text-white">
          <h2 className="text-sm font-bold tracking-tight text-white uppercase">
            {activeTab === "keys" && "Manage API Connections"}
            {activeTab === "preferences" && "Application Settings"}
            {activeTab === "history" && "Session log history"}
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

              {["Gemini", "OpenAI", "Anthropic", "Grok", "OpenRouter"].map((provider) => {
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
                      onChange={(e) => updateDraftField("active_provider", e.target.value)}
                      className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#23282f]"
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic Claude</option>
                      <option value="grok">xAI Grok</option>
                      <option value="ollama">Ollama (Local)</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </div>

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

          {/* TAB 3: SESSION HISTORY - Dark cards for visual contrast */}
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
                  No sessions recorded yet. Polish any text to write to this dashboard.
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
        </div>
      </div>
    </div>
  );
}
