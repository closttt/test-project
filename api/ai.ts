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

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    res.status(502).json({
      error: `Прокси не смог достучаться до AI-сервера: ${e instanceof Error ? e.message : String(e)}`,
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
