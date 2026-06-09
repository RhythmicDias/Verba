import { invoke } from "@tauri-apps/api/core";

export interface LLMConfig {
  provider: "gemini" | "openai" | "anthropic" | "ollama" | "grok" | "openrouter";
  model?: string;
  customEndpoint?: string;
}

export const STYLE_PROMPTS: Record<string, string> = {
  concise: "Make text highly concise, clear, and punchy. Eliminate filler and redundancy. Output only polished text.",
  professional: "Polite, professional, workplace business tone. Clear and polished. Output only polished text.",
  detailed: "Elaborate with clarity. Add comprehensive detail while keeping it clear. Output only polished text.",
  formal: "Formal, elegant, sophisticated, and serious tone. No slang or casual phrasing. Output only polished text.",
  funny: "Witty, humorous, and engaging twist. Preserving core message context. Output only polished text.",
  medical: "Precise clinical medical note format. Extremely concise. Standard medical terminology. Output only polished text.",
  summarize: "Summarize the text clearly without losing details.  Output only the summarized text.",
  generative: "Generate content based on the prompt instructions. Output only the generated content."
};

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
