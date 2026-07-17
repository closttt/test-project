/**
 * Direct-fetch client for any OpenAI-compatible chat-completions API (Nous Portal, Gemini's
 * OpenAI-compat endpoint, OpenRouter, etc). No SDK package — same principle as the rest of the
 * app's external calls. The API key lives in its OWN localStorage key, never inside AppData, so
 * it can never leak into a JSON export/import.
 */

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  keyHint: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "ollama",
    label: "Ollama (локально)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "hermes3",
    keyHint: "Реальный ключ не нужен — впишите любой текст (Ollama его не проверяет). Ollama должна быть запущена локально.",
  },
  {
    id: "nous",
    label: "Nous Portal",
    baseUrl: "https://inference-api.nousresearch.com/v1",
    defaultModel: "tencent/hy3:free",
    keyHint: "Ключ из portal.nousresearch.com → API keys",
  },
  {
    id: "gemini",
    label: "Gemini (Google AI Studio)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.5-flash",
    keyHint: "Ключ из aistudio.google.com → Get API key",
  },
  {
    id: "custom",
    label: "Другой (свой endpoint)",
    baseUrl: "",
    defaultModel: "",
    keyHint: "Любой OpenAI-совместимый /chat/completions endpoint",
  },
];

const KEY = "crm-ai-config-v1";

export function loadAiConfig(): AiConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as AiConfig;
    return cfg.apiKey && cfg.baseUrl && cfg.model ? cfg : null;
  } catch {
    return null;
  }
}

export function saveAiConfig(cfg: AiConfig) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function clearAiConfig() {
  localStorage.removeItem(KEY);
}

export function isAiConfigured(): boolean {
  return loadAiConfig() !== null;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Streams assistant text deltas from an OpenAI-compatible /chat/completions endpoint (SSE). */
export async function* streamChat(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const cfg = loadAiConfig();
  if (!cfg) throw new Error("AI не настроен — добавьте ключ в Настройках.");

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, messages, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI API вернул ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch {
        // keepalive / partial line — ignore
      }
    }
  }
}
