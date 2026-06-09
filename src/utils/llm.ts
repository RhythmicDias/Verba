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

function parseAPIError(provider: string, errText: string, status: number): Error {
  try {
    const data = JSON.parse(errText);
    let message = "";

    // 1. Google Gemini error structure
    if (data.error) {
      if (typeof data.error === "string") {
        message = data.error;
      } else if (data.error.message) {
        message = data.error.message;
      } else if (data.error.status) {
        message = `${data.error.status}: ${data.error.message || "Request failed"}`;
      }
    } 
    // 2. OpenAI / Grok / OpenRouter / Anthropic standard structures
    else if (data.message) {
      message = data.message;
    } else if (data.description) {
      message = data.description;
    } else if (data.error_description) {
      message = data.error_description;
    }

    if (message) {
      // Clean up stringified escapes like \n
      const cleanMessage = message.replace(/\\n/g, " ").replace(/\n/g, " ");
      return new Error(`${provider} Error (${status}): ${cleanMessage}`);
    }
  } catch (_) {}

  // Truncate fallback to prevent large raw text blocks from breaking UI layout
  const cleanFallback = errText.replace(/\\n/g, " ").replace(/\n/g, " ");
  const truncated = cleanFallback.length > 150 ? cleanFallback.slice(0, 150) + "..." : cleanFallback;
  return new Error(`${provider} Error (${status}): ${truncated}`);
}

function cleanOutput(text: string, style: string): string {
  let cleaned = text.trim();

  // 1. Remove introductory filler sentences followed by a colon or newline (e.g., "Here is the rewritten text:")
  cleaned = cleaned.replace(/^(Here\s*(is|'s|are|’s)\s+[^.:\n]+[:\n]+|Sure,\s*here\s*(is|'s|are|’s)\s+[^.:\n]+[:\n]+|Below\s*is\s+[^.:\n]+[:\n]+)/gi, "");

  // 2. Remove common simple headers followed by a colon (e.g., "Polished text:")
  cleaned = cleaned.replace(/^(Polished|Rewritten|Summary|Clinical|Medical|Witty|Formal|Concise|Detailed)\s+(text|version|note|summary)?:/gi, "");

  // 3. Remove markdown bolding and italics formatting
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, "$1");
  cleaned = cleaned.replace(/\*(.*?)\*/g, "$1");

  // 4. Remove double-dashes (--) and em-dashes (—)
  cleaned = cleaned.replace(/--/g, "-").replace(/—/g, "-");

  // 5. Remove emojis unless style is funny
  if (style !== "funny") {
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{1F1E6}-\u{1F1FF}]/gu, "");
  }

  return cleaned.trim();
}

export async function callLLM(
  text: string,
  style: string,
  customPrompt: string | null,
  config: LLMConfig,
  apiKey: string
): Promise<string> {
  const baseInstruction = customPrompt ? customPrompt : STYLE_PROMPTS[style] || STYLE_PROMPTS.professional;
  
  const emojiRule = style === "funny" 
    ? "You may use contextually relevant emojis to enhance the humor." 
    : "CRITICAL: Do NOT use any emojis or emoticons under any circumstances.";

  let systemMessage = "";
  let userMessage = "";

  if (style === "generative") {
    systemMessage = `You are a helpful AI assistant. Generate the requested content based on the instructions.
CRITICAL Constraints:
- Output ONLY the generated content itself. Do NOT write any introduction, conversational filler (like "Here is the content:"), explanations, or wrap the text in quotes.
- Never use markdown formatting (such as '**' for bold or '*' for italics). Output completely plain text.
- Never use double-dashes ('--') or em-dashes ('—'). Use standard punctuation instead.
- ${emojiRule}`;

    userMessage = customPrompt 
      ? `Instruction: ${customPrompt}\nContext/Details: ${text}`
      : `Instruction/Prompt: ${text}`;
  } else {
    systemMessage = `You are a precise text-polishing editor. Rewrite the text according to this directive: "${baseInstruction}".
CRITICAL Constraints:
- Output ONLY the polished/rewritten text. Do NOT write any introduction, conversational filler, explanations, or wrap the text in quotes.
- Never use markdown formatting (such as '**' for bold or '*' for italics). Output completely plain text.
- Never use double-dashes ('--') or em-dashes ('—'). Rewrite sentences to use standard punctuation instead.
- ${emojiRule}`;

    userMessage = `Rewrite this target text:\n\n${text}`;
  }
  const { provider, model, customEndpoint } = config;

  switch (provider) {
    case "gemini": {
      const selectedModel = model || "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userMessage }] }],
          systemInstruction: { parts: [{ text: systemMessage }] },
          generationConfig: { temperature: 0.2 }
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw parseAPIError("Gemini", errText, response.status);
      }
      const data = await response.json();
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!resultText) throw new Error("Invalid response structure from Gemini API");
      return cleanOutput(resultText, style);
    }

    case "openai": {
      const selectedModel = model || "gpt-4o-mini";
      const url = customEndpoint || "https://api.openai.com/v1/chat/completions";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          temperature: 0.2
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw parseAPIError("OpenAI", errText, response.status);
      }
      const data = await response.json();
      const resultText = data.choices?.[0]?.message?.content;
      if (!resultText) throw new Error("Invalid response structure from OpenAI API");
      return cleanOutput(resultText, style);
    }

    case "grok": {
      const selectedModel = model || "grok-2-1212";
      const url = "https://api.x.ai/v1/chat/completions";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          temperature: 0.2
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw parseAPIError("Grok", errText, response.status);
      }
      const data = await response.json();
      const resultText = data.choices?.[0]?.message?.content;
      if (!resultText) throw new Error("Invalid response structure from Grok API");
      return cleanOutput(resultText, style);
    }

    case "anthropic": {
      const selectedModel = model || "claude-3-5-sonnet-20241022";
      const url = "https://api.anthropic.com/v1/messages";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "dangerously-allow-browser": "true"
        } as any,
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: 2048,
          system: systemMessage,
          messages: [{ role: "user", content: userMessage }],
          temperature: 0.2
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw parseAPIError("Anthropic", errText, response.status);
      }
      const data = await response.json();
      const resultText = data.content?.[0]?.text;
      if (!resultText) throw new Error("Invalid response structure from Anthropic API");
      return cleanOutput(resultText, style);
    }

    case "ollama": {
      const selectedModel = model || "llama3";
      const url = customEndpoint || "http://localhost:11434/v1/chat/completions";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          temperature: 0.2
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw parseAPIError("Ollama", errText, response.status);
      }
      const data = await response.json();
      const resultText = data.choices?.[0]?.message?.content;
      if (!resultText) throw new Error("Invalid response structure from Ollama API");
      return cleanOutput(resultText, style);
    }

    case "openrouter": {
      const selectedModel = model || "google/gemini-2.5-flash";
      const url = customEndpoint || "https://openrouter.ai/api/v1/chat/completions";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/diass/Verba",
          "X-OpenRouter-Title": "Verba"
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          temperature: 0.2
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw parseAPIError("OpenRouter", errText, response.status);
      }
      const data = await response.json();
      const resultText = data.choices?.[0]?.message?.content;
      if (!resultText) throw new Error("Invalid response structure from OpenRouter API");
      return cleanOutput(resultText, style);
    }

    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
