import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { 
  Zap, 
  Briefcase, 
  AlignLeft, 
  GraduationCap, 
  Smile, 
  Stethoscope, 
  CornerDownLeft, 
  Loader2, 
  AlertCircle,
  X,
  FileText,
  Sparkles
} from "lucide-react";
import { callLLM } from "../utils/llm";

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
  style_shortcuts?: Record<string, string>;
}

const STYLE_OPTIONS = [
  { id: "concise", name: "Concise", icon: Zap },
  { id: "professional", name: "Professional", icon: Briefcase },
  { id: "detailed", name: "Detailed", icon: AlignLeft },
  { id: "formal", name: "Formal", icon: GraduationCap },
  { id: "funny", name: "Funny", icon: Smile },
  { id: "medical", name: "Medical", icon: Stethoscope },
  { id: "summarize", name: "Summarize", icon: FileText },
  { id: "generative", name: "Generative", icon: Sparkles },
];

export default function Popup() {
  const [copiedText, setCopiedText] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  
  const isMouseDownRef = useRef(false);
  const shortcutsRef = useRef<Record<string, string>>({});
  const handlePolishRef = useRef<any>(null);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (!target.closest("button") && !target.closest("input")) {
        isMouseDownRef.current = true;
        getCurrentWindow().startDragging().catch((err) => {
          console.error("Window drag failed:", err);
        });
      }
    }
  };

  // Load state and copied text when window opens
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config: AppConfig = await invoke("get_app_config");
        if (config && config.style_shortcuts) {
          setShortcuts(config.style_shortcuts);
        }
      } catch (err) {
        console.error("Failed to load configuration in popup:", err);
      }
    };

    loadConfig();

    // Listen for custom update-selection event
    const unlistenPromise = listen<string>("update-selection", (event) => {
      setCopiedText(event.payload);
      setIsLoading(false); // Reset state for a fresh highlight!
      setError(null);
      setCustomPrompt("");
    });

    // Poll for clipboard text changes every 200ms
    const interval = setInterval(async () => {
      try {
        const text: string = await invoke("get_copied_text");
        setCopiedText((prevText) => {
          if (text !== prevText) {
            setIsLoading(false);
            setError(null);
            return text;
          }
          return prevText;
        });
      } catch (err) {
        console.error("Error polling copied text:", err);
      }
    }, 200);

    // Escape listener and custom style shortcuts listener
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        invoke("close_popup");
        return;
      }

      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") {
        return;
      }

      const pressedKey = e.key.toLowerCase();
      const currentShortcuts = shortcutsRef.current;
      const styleId = Object.keys(currentShortcuts).find(
        (key) => currentShortcuts[key]?.toLowerCase() === pressedKey
      );

      if (styleId) {
        e.preventDefault();
        if (styleId === "custom") {
          const inputEl = document.querySelector("input[placeholder^='Custom instruction']") as HTMLInputElement;
          if (inputEl) {
            inputEl.focus();
          }
        } else {
          if (handlePolishRef.current) {
            handlePolishRef.current(styleId, false);
          }
        }
      }
    };

    // Clear error and reset loading when window gets focus (hotkey trigger)
    const handleFocus = () => {
      setError(null);
      setIsLoading(false);
      loadConfig();
    };

    const handleMouseUp = () => {
      isMouseDownRef.current = false;
    };

    // Auto-hide popup on focus loss (blur), ignoring it if the user is dragging (mouse is down)
    const unlistenBlurPromise = getCurrentWindow().listen("tauri://blur", () => {
      if (!isMouseDownRef.current) {
        invoke("close_popup").catch((err) => console.error("Focus loss close failed:", err));
      }
    });

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      clearInterval(interval);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("mouseup", handleMouseUp);
      unlistenPromise.then((unlisten) => unlisten());
      unlistenBlurPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handlePolish = async (styleId: string, isCustom = false) => {
    if ((!copiedText && !isCustom) || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      // Always fetch the freshest configuration when starting to polish
      const freshConfig: AppConfig = await invoke("get_app_config");

      const activeProvider = freshConfig.active_provider;
      const hasKey: boolean = await invoke("has_api_key", { provider: activeProvider });
      
      if (!hasKey && activeProvider !== "ollama" && activeProvider !== "local") {
        throw new Error(`API key for ${activeProvider} is missing.`);
      }

      const llmConfig = {
        provider: activeProvider as any,
        model: activeProvider === "gemini" ? freshConfig.gemini_model :
               activeProvider === "openai" ? freshConfig.openai_model :
               activeProvider === "anthropic" ? freshConfig.anthropic_model :
               activeProvider === "grok" ? freshConfig.grok_model :
               activeProvider === "openrouter" ? freshConfig.openrouter_model :
               freshConfig.ollama_model,
        customEndpoint: activeProvider === "openai" ? freshConfig.openai_endpoint :
                        activeProvider === "ollama" ? freshConfig.ollama_endpoint :
                        activeProvider === "openrouter" ? freshConfig.openrouter_endpoint : undefined
      };

      const polished = await callLLM(
        copiedText,
        styleId,
        isCustom ? customPrompt : null,
        llmConfig
      );

      // Save to history in Rust config
      await invoke("add_history", {
        before: copiedText,
        after: polished,
        provider: activeProvider,
        style: isCustom ? "Custom" : styleId
      });

      // Write back to clipboard and paste
      await invoke("paste_and_close", { text: polished });
    } catch (err: any) {
      const errorMsg = typeof err === "string" ? err : err.message || "An unexpected error occurred.";
      setError(errorMsg);
      setIsLoading(false); // only stop loading on error, success hides popup automatically
    }
  };

  useEffect(() => {
    handlePolishRef.current = handlePolish;
  }, [handlePolish]);

  return (
    <div 
      onMouseDown={handleMouseDown}
      className="w-screen h-screen bg-transparent flex items-center justify-center overflow-hidden p-6 select-none"
    >
      {/* 
        Outer Container Card
        - Draggable via background clicking (data-tauri-drag-region)
        - Animates dynamically in size when processing text
      */}
      <div 
        onMouseDown={handleMouseDown}
        data-tauri-drag-region
        className={`bg-[#23282f] border border-slate-700/40 shadow-xl overflow-hidden flex flex-col transition-all duration-500 ease-in-out ${
          isLoading 
            ? "w-[150px] h-[100px] rounded-3xl justify-center items-center p-3 border-[#e8ff00]/60" 
            : "w-[350px] h-[315px] rounded-2xl p-3"
        }`}
      >
        {isLoading ? (
          /* Processing Loader View */
          <div className="flex flex-col items-center justify-center gap-2 animate-in fade-in zoom-in duration-300">
            <Loader2 size={32} className="text-[#e8ff00] animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#e8ff00]">Polishing...</span>
          </div>
        ) : (
          /* Normal State View */
          <div data-tauri-drag-region className="flex flex-col h-full w-full">
            {/* Header */}
            <div 
              onMouseDown={handleMouseDown}
              data-tauri-drag-region 
              className="flex justify-between items-center mb-2.5 cursor-move active:cursor-grabbing pb-0.5"
            >
              <div data-tauri-drag-region className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#e8ff00] shadow-md shadow-[#e8ff00]/10" />
                <span data-tauri-drag-region className="text-[10px] font-extrabold tracking-wider uppercase text-slate-400">Verba</span>
              </div>
              <button 
                onClick={() => invoke("close_popup")}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Notification Badge replacing copied text preview */}
            <div 
              data-tauri-drag-region
              className="bg-[#2a3038] border border-slate-700/20 rounded-full px-3.5 py-1.5 mb-3 text-[10px] font-bold text-slate-300 flex items-center justify-between shadow-inner"
            >
              <span data-tauri-drag-region className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#e8ff00]" />
                {copiedText ? "Selected text captured" : "Waiting for text selection..."}
              </span>
              {copiedText && (
                <span className="text-[9px] bg-[#e8ff00] text-slate-900 px-2 py-0.2 rounded-full font-bold uppercase">
                  Ready
                </span>
              )}
            </div>

            {/* Selection Grid */}
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              {STYLE_OPTIONS.map((style) => {
                const IconComponent = style.icon;
                const shortcut = shortcuts[style.id];
                return (
                  <button
                    key={style.id}
                    onClick={() => handlePolish(style.id, style.id === "generative" && !!customPrompt.trim())}
                    disabled={!copiedText}
                    className="flex items-center gap-2 p-2 rounded-full border border-slate-700/40 text-xs text-slate-200 font-bold transition-all duration-200 hover:bg-slate-800/80 hover:border-[#e8ff00]/30 hover:text-[#e8ff00] disabled:opacity-30 disabled:cursor-not-allowed bg-[#2a3038]/30"
                  >
                    <IconComponent size={13} className="shrink-0 text-[#e8ff00]" />
                    <span className="truncate">{style.name}</span>
                    {shortcut && (
                      <span className="ml-auto text-[8px] text-slate-400 font-medium px-1.5 py-0.2 bg-slate-800/80 rounded-full border border-slate-700/60 uppercase shrink-0">
                        {shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom Command Input */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (customPrompt.trim()) {
                  handlePolish("custom", true);
                }
              }}
              className="relative flex items-center mt-auto"
            >
              <input
                type="text"
                placeholder={shortcuts["custom"] ? `Custom instruction... (Key: ${shortcuts["custom"]})` : "Custom instruction..."}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                disabled={isLoading}
                className="w-full bg-[#1b1f24] border border-slate-700/50 rounded-full py-1.5 pl-4 pr-9 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#e8ff00]/40 transition-colors"
              />
              <button
                type="submit"
                disabled={!customPrompt.trim() || isLoading}
                className="absolute right-3 text-slate-500 hover:text-[#e8ff00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CornerDownLeft size={14} />
              </button>
            </form>

            {/* Error Alert */}
            {error && (
              <div className="absolute inset-x-4 bottom-12 bg-red-950/95 border border-red-500/30 rounded-xl p-2 flex items-start gap-2 text-[10px] text-red-200 shadow-lg animate-in fade-in duration-200">
                <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="opacity-90">{error}</p>
                </div>
                <button 
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-250 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
