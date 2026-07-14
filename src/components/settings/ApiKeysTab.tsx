import React from "react";
import { Check, Trash2, EyeOff, Eye } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface ApiKeysTabProps {
  keysConfigured: Record<string, boolean>;
  editKeys: Record<string, string>;
  setEditKeys: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showKeys: Record<string, boolean>;
  setShowKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleSaveKey: (provider: string) => void;
  handleDeleteKey: (provider: string) => void;
}

export default function ApiKeysTab({
  keysConfigured,
  editKeys,
  setEditKeys,
  showKeys,
  setShowKeys,
  handleSaveKey,
  handleDeleteKey,
}: ApiKeysTabProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-200 leading-relaxed max-w-2xl font-medium mb-2">
        Configure your LLM model provider API keys. Keys are saved securely inside the OS native credential store
        (Windows Credential Manager) and never written in plaintext configuration files.
      </p>

      {["Gemini", "OpenAI", "Anthropic", "Grok", "Groq", "OpenRouter"].map((provider) => {
        const lower = provider.toLowerCase();
        const isConfigured = keysConfigured[lower];
        return (
          <div
            key={provider}
            className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-xl p-4 flex flex-col gap-2 shadow-sm"
          >
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
                <div className="flex items-center gap-4">
                  <button
                    onClick={async () => {
                      try {
                        const val = await invoke<string>("get_api_key_value", { provider: lower });
                        setEditKeys((prev) => ({ ...prev, [lower]: val }));
                        setShowKeys((prev) => ({ ...prev, [lower]: true }));
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="text-[10px] text-slate-500 hover:text-slate-800 font-bold transition-colors flex items-center gap-1"
                  >
                    <Eye size={12} /> Reveal Key
                  </button>
                  <button
                    onClick={() => handleDeleteKey(lower)}
                    className="text-[10px] text-red-600 hover:text-red-500 font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 size={12} /> Clear Key
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <input
                  type={showKeys[lower] ? "text" : "password"}
                  placeholder={isConfigured ? "Key securely stored. Type to overwrite..." : "Enter API Key..."}
                  value={editKeys[lower] || ""}
                  onChange={(e) => setEditKeys((prev) => ({ ...prev, [lower]: e.target.value }))}
                  className={`w-full bg-slate-100 border border-slate-300/80 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#23282f] transition-all ${
                    isConfigured && !editKeys[lower] ? "text-slate-500 font-medium italic" : "text-slate-800"
                  }`}
                />
                {(editKeys[lower] || "").length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowKeys((prev) => ({ ...prev, [lower]: !prev[lower] }))}
                    className="absolute right-3.5 top-1.5 text-slate-500 hover:text-slate-800"
                  >
                    {showKeys[lower] ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                )}
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
  );
}
