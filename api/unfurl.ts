import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * GET /api/unfurl?url=… → { title, description, image, siteName, author }
 *
 * Open Graph metadata for the «Библиотека» add form: paste a link, get the title and cover
 * pre-filled. Runs server-side because the browser can't read another site's HTML (CORS).
 * Reads at most 512 KB of the page and gives up after 8 s — this is a convenience, not a crawler.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    res.status(400).json({ error: "Некорректный url." });
    return;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    res.status(400).json({ error: "Только http(s) ссылки." });
    return;
  }
  if (isPrivateHost(target.hostname)) {
    res.status(400).json({ error: "Локальные адреса не разворачиваем." });
    return;
  }

  let html = "";
  try {
    const upstream = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        // Some sites serve richer OG tags to link-preview bots than to browsers.
        "User-Agent": "Mozilla/5.0 (compatible; WorkdeskBot/1.0; +https://vercel.com) facebookexternalhit/1.1",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ru,en;q=0.8",
      },
    });
    const type = upstream.headers.get("content-type") ?? "";
    if (!type.includes("html")) {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.status(200).json({ title: decodeURIComponent(target.pathname.split("/").filter(Boolean).pop() ?? target.hostname) });
      return;
    }
    html = await readHead(upstream, 512 * 1024);
  } catch (e) {
    res.status(502).json({ error: `Не удалось загрузить страницу: ${e instanceof Error ? e.message : String(e)}` });
    return;
  }

  const meta = (...names: string[]): string | undefined => {
    for (const n of names) {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRe(n)}["'][^>]*>`, "i");
      const tag = html.match(re)?.[0];
      if (!tag) continue;
      const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
      if (content) return decodeEntities(content.trim());
    }
    return undefined;
  };

  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const title = meta("og:title", "twitter:title") ?? (titleTag ? decodeEntities(titleTag.trim()) : undefined);
  const description = meta("og:description", "twitter:description", "description");
  let image = meta("og:image", "og:image:url", "twitter:image", "twitter:image:src");
  if (image) {
    try { image = new URL(image, target).toString(); } catch { image = undefined; }
  }
  const siteName = meta("og:site_name", "application-name");
  const author = meta("author", "article:author", "book:author", "twitter:creator");

  res.setHeader("Cache-Control", "public, max-age=86400");
  res.status(200).json({ title, description, image, siteName, author });
}

async function readHead(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
    // Everything we need lives in <head>; stop once it's closed or the budget is spent.
    if (out.length > limit || /<\/head>/i.test(out)) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return h.startsWith("[") || h === "::1";
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}
