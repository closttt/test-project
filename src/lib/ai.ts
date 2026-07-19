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
    defaultModel: "gemini-2.0-flash",
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

export interface ToolCallRequest {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Present on an assistant message that invoked tools — replayed back so the model has full
   * context of what it already did when we ask it for the final wrap-up. Typed loosely (not
   * `ToolCallRequest[]`) on purpose: this must always be the VERBATIM object the API returned,
   * not a rebuilt copy — some providers (Gemini) attach extra required metadata per call (e.g.
   * `thought_signature`) that a hand-reconstructed `{id, type, function}` object silently drops,
   * and Gemini then rejects the follow-up request with a 400. */
  tool_calls?: unknown[];
  /** Present on a "tool" message — which call this result answers. */
  tool_call_id?: string;
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface CompletionResult {
  /** The assistant's plain-text reply — present when it didn't call a tool. */
  content?: string;
  /** Parsed tool calls (for the executor to dispatch), if the model decided to act. */
  toolCalls?: ParsedToolCall[];
  /** The EXACT `tool_calls` array from the API response, byte-for-byte — hand this to
   * `ChatMessage.tool_calls` when replaying the assistant's turn back for the follow-up call.
   * Never rebuild this from `toolCalls`; see the note on `ChatMessage.tool_calls`. */
  rawToolCalls?: unknown[];
}

/**
 * Where chat-completions requests actually go.
 *
 * In PRODUCTION we relay through our own same-origin Edge proxy (`/api/ai`, see `api/ai.ts`): the
 * browser can't reliably call LLM providers directly from the deployed HTTPS site (many block
 * browser origins → CORS → "Failed to fetch"; an http endpoint is blocked as mixed content), so the
 * proxy makes the call server-side. In DEV (Vite dev server, no serverless functions) we call the
 * provider directly. Either way, a network-level failure is converted into an actionable message
 * instead of the browser's opaque "Failed to fetch".
 */
async function chatFetch(
  cfg: AiConfig,
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Response> {
  const viaProxy = import.meta.env.PROD;

  if (
    !viaProxy &&
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    cfg.baseUrl.startsWith("http://")
  ) {
    throw new Error("AI-endpoint по http нельзя вызвать с https-сайта (mixed content). Укажите https-endpoint.");
  }

  const url = viaProxy ? "/api/ai" : `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = viaProxy
    ? { "Content-Type": "application/json" }
    : { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` };
  const body = viaProxy
    ? JSON.stringify({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, ...payload })
    : JSON.stringify(payload);

  try {
    return await fetch(url, { method: "POST", headers, body, signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error(
      "Не удалось подключиться к AI-серверу. Частые причины: endpoint недоступен из браузера (CORS), " +
      "endpoint по http на https-сайте, локальный endpoint (Ollama) не виден с задеплоенного сайта, " +
      "или нет сети. Проверьте endpoint и ключ в Настройках."
    );
  }
}

/**
 * Non-streaming request — used for the "decide" turn when tools are offered. Tool-call arguments
 * arrive as one parsed JSON object this way, instead of fragments that would need reassembling
 * across SSE deltas (the streaming endpoint's tool-call shape varies more across providers).
 */
export async function requestCompletion(
  messages: ChatMessage[],
  tools: ToolDef[] | undefined,
  signal?: AbortSignal
): Promise<CompletionResult> {
  const cfg = loadAiConfig();
  if (!cfg) throw new Error("AI не настроен — добавьте ключ в Настройках.");

  const res = await chatFetch(
    cfg,
    { model: cfg.model, messages, ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}) },
    signal
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI API вернул ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }
  const json = await res.json();
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new Error("AI API вернул пустой ответ.");

  const rawCalls = msg.tool_calls as ToolCallRequest[] | undefined;
  const toolCalls: ParsedToolCall[] | undefined = rawCalls?.map((c) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(c.function.arguments || "{}");
    } catch {
      // Malformed JSON from the model — treat as no arguments; the tool executor validates
      // required fields itself and reports back, so this degrades to a normal "missing field" error.
    }
    return { id: c.id, name: c.function.name, arguments: args };
  });

  return { content: msg.content ?? undefined, toolCalls, rawToolCalls: rawCalls };
}

/** Streams assistant text deltas from an OpenAI-compatible /chat/completions endpoint (SSE). */
export async function* streamChat(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const cfg = loadAiConfig();
  if (!cfg) throw new Error("AI не настроен — добавьте ключ в Настройках.");

  const res = await chatFetch(cfg, { model: cfg.model, messages, stream: true }, signal);
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
