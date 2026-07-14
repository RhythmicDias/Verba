import React from "react";
import { Keyboard } from "lucide-react";

export const STYLE_NAMES: Record<string, string> = {
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

export interface PreferencesTabProps {
  draftConfig: any;
  updateDraftField: (field: any, value: any) => void;
  setDraftConfig: React.Dispatch<React.SetStateAction<any>>;
  checkLocalModel: () => void;
  hasLocalModel: boolean;
  isDownloadingModel: boolean;
  modelDownloadProgress: any;
  modelDownloadError: string | null;
  handleStartDownload: () => void;
  handleCancelDownload: () => void;
  localModelPath: string;
  isGpuAvailable: boolean;
  isRecordingHotkey: boolean;
  setIsRecordingHotkey: (v: boolean) => void;
  hotkeyError: string | null;
  handleRecordHotkey: (e: React.KeyboardEvent) => void;
}

export default function PreferencesTab({
  draftConfig,
  updateDraftField,
  setDraftConfig,
  checkLocalModel,
  hasLocalModel,
  isDownloadingModel,
  modelDownloadProgress,
  modelDownloadError,
  handleStartDownload,
  handleCancelDownload,
  localModelPath,
  isGpuAvailable,
  isRecordingHotkey,
  setIsRecordingHotkey,
  hotkeyError,
  handleRecordHotkey,
}: PreferencesTabProps) {
  return (
    <div className="space-y-4">
      {/* Default Provider Selector - Matte off-white card */}
      <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-xl p-4 space-y-3 shadow-sm">
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
            <div className="col-span-2 bg-slate-100 border border-slate-300/60 rounded-xl p-4 space-y-3 mt-1">
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
                <div className="space-y-2 pt-1">
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
                <div className="flex flex-col gap-2 pt-1">
                  {modelDownloadError && (
                    <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 font-bold">
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
                  <div className="pt-2 border-t border-slate-300/40 flex items-center justify-between">
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
                  <div className="pt-2 border-t border-slate-300/40 text-[10px] text-slate-500 font-bold space-y-1">
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
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Ollama Model</label>
                <input
                  type="text"
                  value={draftConfig.ollama_model}
                  onChange={(e) => updateDraftField("ollama_model", e.target.value)}
                  className="w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#23282f]"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Ollama Endpoint</label>
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
              <div className="col-span-2 space-y-1.5">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">API Endpoint</label>
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
      <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-xl p-4 flex items-center justify-between shadow-sm">
        <div>
          <h3 className="text-xs font-bold text-[#23282f] tracking-wide uppercase">Privacy Settings</h3>
          <label className="text-[11px] text-[#23282f] font-bold uppercase tracking-wider block mt-2">Save Local History</label>
          <span className="text-[10px] text-slate-500 font-medium">Toggle whether polished text is persistently stored in your local configuration.</span>
        </div>
        <input
          type="checkbox"
          checked={draftConfig.save_history}
          onChange={(e) => updateDraftField("save_history", e.target.checked)}
          className="w-4 h-4 text-[#23282f] border-slate-300 rounded focus:ring-[#23282f]"
        />
      </div>

      {/* Style Shortcuts Settings */}
      <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-xl p-4 space-y-3 shadow-sm">
        <h3 className="text-xs font-bold text-[#23282f] tracking-wide uppercase flex items-center gap-2">
          <Keyboard size={16} /> Style Keyboard Shortcuts
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          Assign a single-character key (letter, number, or symbol) to quickly trigger options when the popup is visible. Keys are ignored when typing in the custom instruction input.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.keys(STYLE_NAMES).map((styleId) => {
            const shortcut = draftConfig?.style_shortcuts?.[styleId] || "";
            return (
              <div key={styleId} className="flex items-center justify-between bg-slate-50/50 border border-slate-300/60 rounded-lg px-3 py-1.5 shadow-sm">
                <label className="text-[10px] text-slate-600 font-bold uppercase tracking-wider truncate mr-2">
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
                      [styleId]: val,
                    };
                    setDraftConfig((prev: any) => {
                      if (!prev) return null;
                      return {
                        ...prev,
                        style_shortcuts: newShortcuts,
                      };
                    });
                  }}
                  className="w-7 h-6 bg-white border border-slate-300/80 rounded text-xs text-slate-800 font-bold text-center uppercase focus:outline-none focus:border-[#23282f] focus:ring-1 focus:ring-[#23282f] transition-all"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Shortcut Manager Settings */}
      <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-xl p-4 space-y-3 shadow-sm">
        <h3 className="text-xs font-bold text-[#23282f] tracking-wide uppercase flex items-center gap-2">
          <Keyboard size={16} /> Global Trigger Shortcut
        </h3>
        <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
          Use the trigger button below to assign a new hotkey. Press any key or combination of keys, then release.
        </p>

        <div className="flex items-center gap-3">
          <button
            onKeyDown={handleRecordHotkey}
            onClick={() => {
              setIsRecordingHotkey(true);
            }}
            className={`px-5 py-2 rounded-full font-bold text-[11px] transition-all border ${
              isRecordingHotkey
                ? "bg-white text-slate-900 border-[#23282f] shadow-[0_0_0_2px_rgba(35,40,47,0.2)] animate-pulse"
                : "bg-[#23282f] text-white border-transparent hover:bg-[#343b45] shadow-sm cursor-pointer"
            }`}
          >
            {isRecordingHotkey ? "PRESS SHORTCUT NOW..." : `TRIGGER KEY: ${draftConfig.hotkey}`}
          </button>
          {!isRecordingHotkey && (
            <span className="text-[10px] text-slate-500 font-medium">
              Click the button to record a new shortcut.
            </span>
          )}
        </div>
        {hotkeyError && (
          <p className="text-[10px] text-red-600 bg-red-50 px-3 py-1.5 rounded-md font-bold mt-2">
            {hotkeyError}
          </p>
        )}
      </div>
    </div>
  );
}
