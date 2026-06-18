import { invoke } from "@tauri-apps/api/core";

export interface LLMConfig {
  provider: "gemini" | "openai" | "anthropic" | "ollama" | "grok" | "openrouter";
  model?: string;
  customEndpoint?: string;
}

export const STYLE_PROMPTS: Record<string, string> = {
  concise: "Make the text highly concise, clear, and punchy. Eliminate fluff, passive voice, wordiness, and redundancies. Direct, strong, and active language is preferred while preserving the core message.",
  professional: "Refine the text to a polite, professional, and workplace-appropriate business tone. Ensure it is clear, respectful, objective, and grammatically precise, removing casual phrasing or conversational slang.",
  detailed: "Elaborate on the input text with clarity. Expand on the core concepts, providing thorough details, context, and clear logical progression, while remaining readable, engaging, and avoiding filler.",
  formal: "Elevate the text to a formal, elegant, sophisticated, and serious tone. Use high-register vocabulary, precise grammatical structures, and professional transitions. Strictly avoid slang, casual idioms, or contractions.",
  funny: "Infuse the text with a witty, humorous, and engaging twist. Maintain the core meaning and context, but make it lighthearted, clever, and fun.",
  medical: "Format the text into a professional, concise, clinical medical text. Use standard medical terminology, precise clinical language. Do not make up things.",
  summarize: "Summarize the text clearly, highlighting the most important information and key takeaways. Avoid losing critical context, but omit fluff and unnecessary details. Provide a clean, cohesive summary.",
  generative: "Generate content strictly based on the prompt instructions and the provided context details. DO NOT be chatty. Do NOT include any introductory remarks, conversational filler, conversational prefixes, explanations, or notes. Output ONLY the raw generated content."
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
