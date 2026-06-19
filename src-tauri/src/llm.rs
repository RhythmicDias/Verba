use serde::{Deserialize, Serialize};
use regex::Regex;
use crate::storage;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct LLMConfig {
    pub provider: String,
    pub model: Option<String>,
    #[serde(rename = "customEndpoint")]
    pub custom_endpoint: Option<String>,
}

fn get_style_prompt(style: &str) -> &str {
    match style {
        "concise" => "Rewrite the input text to be as brief, direct, and concise as possible. Remove all filler, passive voice, and redundant words, while strictly preserving the core information.",
        "detailed" => "Elaborate on the input text by expanding on the core points. Provide additional helpful context and explanations while preserving the original meaning and readability.",
        "formal" => "Rewrite the text in a highly formal, serious, and academic tone. Replace contractions, slang, and casual words with precise vocabulary, while preserving the exact message.",
        "funny" => "Rewrite the text to be witty, sarcastic, and humorous. Make a lighthearted joke about the situation, but preserve the core meaning. Do not copy the input verbatim or repeat yourself.",
        "medical" => "Translate and rewrite the symptoms or description into a formal, concise, and clinical medical note. Use standard medical terminology, while preserving all clinical details.",
        "summarize" => "Summarize the main points of the input text into a single, short sentence or brief bullet points. Extract only the essential takeaways while retaining critical context.",
        "generative" => "Generate content strictly based on the prompt instructions and the provided context details. DO NOT be chatty. Do NOT include any introductory remarks, conversational filler, conversational prefixes, explanations, or notes. Output ONLY the raw generated content.",
        _ => "Rewrite the text in a polite, objective, and professional business tone. Remove slang and casual phrasing, while strictly preserving the original meaning. Do not add email intros, greetings, signatures, or sign-offs.",
    }
}

fn clean_output(text: &str, style: &str) -> String {
    let mut cleaned = text.trim().to_string();

    // 1. Remove introductory filler sentences
    if let Ok(re) = Regex::new(r"(?i)^(Here\s*(is|'s|are|’s)\s+[^.:\n]+[:\n]+|Sure,\s*here\s*(is|'s|are|’s)\s+[^.:\n]+[:\n]+|Below\s*is\s+[^.:\n]+[:\n]+)") {
        cleaned = re.replace_all(&cleaned, "").to_string();
    }

    // 2. Remove common simple headers
    if let Ok(re) = Regex::new(r"(?i)^(Polished|Rewritten|Summary|Clinical|Medical|Witty|Formal|Concise|Detailed)\s+(text|version|note|summary)?:") {
        cleaned = re.replace_all(&cleaned, "").to_string();
    }

    // 3. Remove markdown bolding and italics formatting
    if let Ok(re) = Regex::new(r"\*\*(.*?)\*\*") {
        cleaned = re.replace_all(&cleaned, "$1").to_string();
    }
    if let Ok(re) = Regex::new(r"\*(.*?)\*") {
        cleaned = re.replace_all(&cleaned, "$1").to_string();
    }

    // 4. Remove double-dashes (--) and em-dashes (—)
    cleaned = cleaned.replace("--", "-").replace("—", "-");

    // 5. Remove emojis unless style is funny
    if style != "funny" {
        if let Ok(re) = Regex::new(r"[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{1F1E6}-\u{1F1FF}]") {
            cleaned = re.replace_all(&cleaned, "").to_string();
        }
    }

    cleaned.trim().to_string()
}

fn validate_endpoint_url(url: &str) -> Result<(), String> {
    let lower = url.trim().to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        Ok(())
    } else {
        Err(format!("Invalid endpoint URL: only http:// and https:// schemes are allowed, got: {}", url))
    }
}

#[tauri::command]
pub async fn call_llm(
    app_handle: tauri::AppHandle,
    text: String,
    style: String,
    custom_prompt: Option<String>,
    config: LLMConfig,
) -> Result<String, String> {
    let active_provider = config.provider.to_lowercase();
    let api_key = if active_provider == "local" {
        "".to_string()
    } else if active_provider == "ollama" {
        storage::get_api_key(&active_provider).unwrap_or_default()
    } else {
        storage::get_api_key(&active_provider)
            .ok_or_else(|| format!("API key not configured for provider: {}", active_provider))?
    };

    let base_instruction = if let Some(ref prompt) = custom_prompt {
        prompt.as_str()
    } else {
        get_style_prompt(&style)
    };

    let emoji_rule = if style == "funny" {
        "You may use up to 2 contextually relevant emojis to enhance the humor, but do NOT spam emojis or repeat text."
    } else {
        "CRITICAL: Do NOT use any emojis or emoticons under any circumstances."
    };

    let (system_message, user_message) = if text.trim().is_empty() {
        (
            format!(
                "You are a creative generative AI assistant. Generate high-quality content based on the provided instructions.\n\n\
                 CRITICAL RULES:\n\
                 1. Output ONLY the generated content. Do NOT write introductory remarks, conversational filler, explanations, or notes.\n\
                 2. DO NOT use markdown formatting (no bold **, no italics *, no headers #). Output raw plain text.\n\
                 3. DO NOT use double-dashes (--) or em-dashes (—).\n\
                 4. {}",
                emoji_rule
            ),
            format!(
                "<instructions>\n{}\n</instructions>",
                base_instruction
            )
        )
    } else if style == "generative" {
        (
            format!(
                "You are a creative generative AI assistant. Generate high-quality content based on the instructions and context.\n\n\
                 CRITICAL RULES:\n\
                 1. Output ONLY the generated content. Do NOT write introductory remarks, conversational filler, explanations, or notes.\n\
                 2. DO NOT use markdown formatting (no bold **, no italics *, no headers #). Output raw plain text.\n\
                 3. DO NOT use double-dashes (--) or em-dashes (—).\n\
                 4. {}",
                emoji_rule
            ),
            if custom_prompt.is_some() {
                format!(
                    "<instructions>\n{}\n</instructions>\n\n<context_details>\n{}\n</context_details>",
                    base_instruction, text
                )
            } else {
                format!(
                    "<instructions>\n{}\n</instructions>",
                    text
                )
            }
        )
    } else {
        (
            format!(
                "You are an expert text editor. Rewrite the text inside the <target_text> tags to match this style: \"{}\".\n\n\
                 CRITICAL RULES:\n\
                 1. You MUST change the tone and vocabulary to fit the requested style. Do NOT copy the input text verbatim.\n\
                 2. Keep the original meaning and core information intact.\n\
                 3. Output ONLY the rewritten text itself. Absolutely NO introductory phrases, explanations, notes, greetings, signatures, or sign-offs.\n\
                 4. Do NOT repeat sentences, paragraphs, or phrases. Output a single cohesive response.\n\
                 5. DO NOT use markdown formatting (no bold **, no italics *, no headers #). Output raw plain text.\n\
                 6. DO NOT use double-dashes (--) or em-dashes (—).\n\
                 7. {}",
                base_instruction, emoji_rule
            ),
            format!(
                "<target_text>\n{}\n</target_text>",
                text
            )
        )
    };

    let client = reqwest::Client::new();

    let result_text = match active_provider.as_str() {
        "local" => {
            crate::llama::run_local_inference(&app_handle, &system_message, &user_message)?
        }
        "gemini" => {
            let model = config.model.as_deref().unwrap_or("gemini-1.5-flash");
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
                model
            );

            let payload = serde_json::json!({
                "contents": [{ "parts": [{ "text": user_message }] }],
                "systemInstruction": { "parts": [{ "text": system_message }] },
                "generationConfig": { "temperature": 0.2 }
            });

            let res = client.post(&url)
                .header("x-goog-api-key", &api_key)
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Gemini request failed: {}", e))?;

            if !res.status().is_success() {
                let status = res.status();
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("Gemini Error ({}): {}", status, err_text));
            }

            let data: serde_json::Value = res.json()
                .await
                .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;

            data["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .ok_or_else(|| "Invalid response structure from Gemini API".to_string())?
                .to_string()
        }

        "openai" => {
            let model = config.model.as_deref().unwrap_or("gpt-4o-mini");
            let url = config.custom_endpoint.as_deref()
                .unwrap_or("https://api.openai.com/v1/chat/completions");
            validate_endpoint_url(url)?;

            let payload = serde_json::json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": system_message },
                    { "role": "user", "content": user_message }
                ],
                "temperature": 0.2
            });

            let res = client.post(url)
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("OpenAI request failed: {}", e))?;

            if !res.status().is_success() {
                let status = res.status();
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("OpenAI Error ({}): {}", status, err_text));
            }

            let data: serde_json::Value = res.json()
                .await
                .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

            data["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| "Invalid response structure from OpenAI API".to_string())?
                .to_string()
        }

        "grok" => {
            let model = config.model.as_deref().unwrap_or("grok-2-1212");
            let url = "https://api.x.ai/v1/chat/completions";

            let payload = serde_json::json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": system_message },
                    { "role": "user", "content": user_message }
                ],
                "temperature": 0.2
            });

            let res = client.post(url)
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Grok request failed: {}", e))?;

            if !res.status().is_success() {
                let status = res.status();
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("Grok Error ({}): {}", status, err_text));
            }

            let data: serde_json::Value = res.json()
                .await
                .map_err(|e| format!("Failed to parse Grok response: {}", e))?;

            data["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| "Invalid response structure from Grok API".to_string())?
                .to_string()
        }

        "anthropic" => {
            let model = config.model.as_deref().unwrap_or("claude-3-5-sonnet-20241022");
            let url = "https://api.anthropic.com/v1/messages";

            let payload = serde_json::json!({
                "model": model,
                "max_tokens": 2048,
                "system": system_message,
                "messages": [{ "role": "user", "content": user_message }],
                "temperature": 0.2
            });

            let res = client.post(url)
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Anthropic request failed: {}", e))?;

            if !res.status().is_success() {
                let status = res.status();
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("Anthropic Error ({}): {}", status, err_text));
            }

            let data: serde_json::Value = res.json()
                .await
                .map_err(|e| format!("Failed to parse Anthropic response: {}", e))?;

            data["content"][0]["text"]
                .as_str()
                .ok_or_else(|| "Invalid response structure from Anthropic API".to_string())?
                .to_string()
        }

        "ollama" => {
            let model = config.model.as_deref().unwrap_or("llama3");
            let url = config.custom_endpoint.as_deref()
                .unwrap_or("http://localhost:11434/v1/chat/completions");
            validate_endpoint_url(url)?;

            let payload = serde_json::json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": system_message },
                    { "role": "user", "content": user_message }
                ],
                "temperature": 0.2
            });

            let mut req = client.post(url);
            if !api_key.is_empty() && api_key != "null" {
                req = req.header("Authorization", format!("Bearer {}", api_key));
            }

            let res = req.json(&payload)
                .send()
                .await
                .map_err(|e| format!("Ollama request failed: {}", e))?;

            if !res.status().is_success() {
                let status = res.status();
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("Ollama Error ({}): {}", status, err_text));
            }

            let data: serde_json::Value = res.json()
                .await
                .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

            data["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| "Invalid response structure from Ollama API".to_string())?
                .to_string()
        }

        "openrouter" => {
            let model = config.model.as_deref().unwrap_or("google/gemini-2.5-flash");
            let url = config.custom_endpoint.as_deref()
                .unwrap_or("https://openrouter.ai/api/v1/chat/completions");
            validate_endpoint_url(url)?;

            let payload = serde_json::json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": system_message },
                    { "role": "user", "content": user_message }
                ],
                "temperature": 0.2
            });

            let res = client.post(url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("HTTP-Referer", "https://github.com/RhythmicDias/Verba")
                .header("X-OpenRouter-Title", "Verba")
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("OpenRouter request failed: {}", e))?;

            if !res.status().is_success() {
                let status = res.status();
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("OpenRouter Error ({}): {}", status, err_text));
            }

            let data: serde_json::Value = res.json()
                .await
                .map_err(|e| format!("Failed to parse OpenRouter response: {}", e))?;

            data["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| "Invalid response structure from OpenRouter API".to_string())?
                .to_string()
        }

        _ => return Err(format!("Unsupported provider: {}", active_provider)),
    };

    Ok(clean_output(&result_text, &style))
}

#[tauri::command]
pub async fn get_ollama_models(endpoint: String) -> Result<Vec<String>, String> {
    let mut base_url = "http://localhost:11434".to_string();
    if let Ok(url) = reqwest::Url::parse(&endpoint) {
        if let Some(host) = url.host_str() {
            let port = url.port_or_known_default().unwrap_or(11434);
            let scheme = url.scheme();
            base_url = format!("{}://{}:{}", scheme, host, port);
        }
    }

    let url = format!("{}/api/tags", base_url);
    let client = reqwest::Client::new();
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Ollama returned status: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OllamaModel {
        name: String,
    }

    #[derive(Deserialize)]
    struct OllamaTagsResponse {
        models: Option<Vec<OllamaModel>>,
    }

    let data: OllamaTagsResponse = res.json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    let models = data.models
        .unwrap_or_default()
        .into_iter()
        .map(|m| m.name)
        .collect();

    Ok(models)
}
