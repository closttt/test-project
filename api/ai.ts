/**
 * Same-origin AI proxy (Vercel Edge Function).
 *
 * The browser cannot call most LLM providers directly from the deployed HTTPS site: providers
 * often don't send CORS headers for browser origins ("Failed to fetch"), and an http endpoint is
 * blocked as mixed content on an https page. This function relays the request server-side (no CORS,
 * no mixed-content restriction) so the assistant works in production.
 *
 * The user's API key is sent from the browser in the request body and forwarded upstream — it is
 * never stored or logged here; this function only pipes the request through.
 *
 * Edge runtime is used so streaming (SSE) responses pass straight through to the client.
 */
export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Некорректный JSON запроса." }, 400);
  }

  const { baseUrl, apiKey, ...payload } = body ?? {};
  if (typeof baseUrl !== "string" || !baseUrl || typeof apiKey !== "string" || !apiKey) {
    return json({ error: "Не передан baseUrl или apiKey." }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json(
      { error: `Прокси не смог достучаться до AI-сервера: ${e instanceof Error ? e.message : String(e)}` },
      502
    );
  }

  // Pipe status + body straight through — JSON for the decide turn, SSE stream for the wrap-up.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
