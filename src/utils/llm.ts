import { invoke } from "@tauri-apps/api/core";

export interface LLMConfig {
  provider: "gemini" | "openai" | "anthropic" | "ollama" | "grok" | "groq" | "openrouter" | "local";
  model?: string;
  customEndpoint?: string;
}

export async function callLLM(
  text: string,
  style: string,
  customPrompt: string | null,
  config: LLMConfig
): Promise<string> {
  return invoke<string>("call_llm", {
    text,
    style,
    customPrompt,
    config
  });
}
