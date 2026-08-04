import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Same-origin AI proxy (Vercel Node.js Serverless Function).
 *
 * The browser can't reliably call LLM providers directly from the deployed HTTPS site: providers
 * often don't send CORS headers for browser origins ("Failed to fetch"), and an http endpoint is
 * blocked as mixed content. This relays the request server-side so the assistant works in prod.
 *
 * Runs on the Node runtime (not Edge): the Edge runtime's outbound fetch was throwing
 * "Network connection lost" for provider calls; Node's undici fetch is stable for this.
 *
 * The user's API key arrives in the request body and is forwarded upstream — never stored or
 * logged here; this function only pipes the request through. Response body (JSON for the decide
 * turn, SSE for the streamed wrap-up) is piped straight back.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (typeof req.body === "string" ? safeParse(req.body) : req.body) ?? {};
  const { baseUrl, apiKey, ...payload } = body as Record<string, unknown>;
  if (typeof baseUrl !== "string" || !baseUrl || typeof apiKey !== "string" || !apiKey) {
    res.status(400).json({ error: "Не передан baseUrl или apiKey." });
    return;
  }

  // The endpoint is called from OUR server, not the browser, so a localhost/private-network baseUrl
  // (e.g. Ollama) can never be reached from the deployed site — undici just throws an opaque
  // "fetch failed". Catch it here with an actionable message instead.
  let target: URL;
  try {
    target = new URL(`${baseUrl.replace(/\/$/, "")}/chat/completions`);
  } catch {
    res.status(400).json({ error: `Некорректный AI-endpoint: «${baseUrl}». Укажите полный https-адрес в Настройках.` });
    return;
  }
  if (target.protocol !== "https:") {
    res.status(400).json({ error: "AI-endpoint должен быть по https — с задеплоенного сайта http-адрес недоступен." });
    return;
  }
  if (isUnreachableHost(target.hostname)) {
    res.status(502).json({
      error: `Локальный endpoint (${target.hostname}) не виден с сервера — Ollama и подобное работают только при локальном запуске приложения. В проде выберите облачный провайдер (Gemini, Nous и т.п.).`,
    });
    return;
  }

  const reqBody = JSON.stringify(payload);
  let upstream: Response;
  try {
    upstream = await fetchWithRetry(target, apiKey, reqBody);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      res.status(504).json({ error: "AI-сервер не ответил за 55 с — превышен таймаут. Попробуйте ещё раз или смените модель/провайдера." });
      return;
    }
    // undici hides the real reason in `.cause` (ENOTFOUND, ECONNREFUSED, TLS, …) — surface it so
    // the failure is actionable instead of a bare "fetch failed".
    res.status(502).json({
      error: `Прокси не смог достучаться до AI-сервера: ${describeFetchError(e)}`,
    });
    return;
  }

  res.status(upstream.status);
  res.setHeader("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");

  if (!upstream.body) {
    res.end();
    return;
  }

  // Pipe the upstream stream through — works for a single JSON blob and for token-by-token SSE.
  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch {
    // Upstream connection dropped mid-stream — end with whatever was already sent.
  }
  res.end();
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/**
 * POST to the provider, retrying ONCE on a network-level throw. undici occasionally throws a
 * spurious "fetch failed" on a cold connection (dropped keep-alive, transient DNS/reset); a single
 * fresh attempt clears most of them. Safe to retry: this call has no side effects — the model only
 * *decides*; tool actions run client-side afterwards. An HTTP error response (4xx/5xx) is NOT
 * retried — it's returned so the caller sees the provider's real status. Each attempt is bounded by
 * its own timeout so a hang can't wedge the function.
 */
async function fetchWithRetry(target: URL, apiKey: string, body: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    try {
      return await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      lastErr = e;
      // A real timeout is deliberate — don't burn the retry re-hanging for another 55 s.
      if (e instanceof DOMException && e.name === "AbortError") throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr;
}

/** Hosts that resolve to the server itself or a private LAN — never reachable from a deployed proxy. */
function isUnreachableHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h.endsWith(".local") ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

/** Pull the real reason out of an undici "fetch failed" (the useful part is on `.cause`). */
function describeFetchError(e: unknown): string {
  if (e instanceof Error) {
    const cause = (e as { cause?: unknown }).cause;
    if (cause && typeof cause === "object") {
      const c = cause as { code?: string; message?: string };
      if (c.code) return `${e.message} (${c.code})`;
      if (c.message) return `${e.message} — ${c.message}`;
    }
    return e.message;
  }
  return String(e);
}
