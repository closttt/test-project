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

  // oEmbed first where the site publishes it: YouTube in particular serves a consent/app shell to
  // link-preview bots and no Open Graph at all, so scraping it returns an empty object.
  const viaOembed = await tryOembed(target);
  if (viaOembed?.title) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).json(viaOembed);
    return;
  }

  let html = "";
  try {
    const upstream = await fetchPage(target, BOT_UA);
    const type = upstream.headers.get("content-type") ?? "";
    if (!type.includes("html")) {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.status(200).json({ title: decodeURIComponent(target.pathname.split("/").filter(Boolean).pop() ?? target.hostname) });
      return;
    }
    html = await readHead(upstream, 512 * 1024);
    // Some sites answer bots with a stub and real markup to browsers — one retry, then give up.
    if (!/og:title|<title/i.test(html)) {
      const retry = await fetchPage(target, BROWSER_UA);
      if ((retry.headers.get("content-type") ?? "").includes("html")) html = await readHead(retry, 512 * 1024);
    }
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

const BOT_UA = "Mozilla/5.0 (compatible; WorkdeskBot/1.0; +https://vercel.com) facebookexternalhit/1.1";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

function fetchPage(target: URL, ua: string): Promise<Response> {
  return fetch(target, {
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml", "Accept-Language": "ru,en;q=0.8" },
  });
}

/** Sites whose oEmbed endpoint is stable and needs no key — title/author/thumbnail in one hop. */
const OEMBED: { test: RegExp; endpoint: string }[] = [
  { test: /(^|\.)(youtube\.com|youtu\.be)$/i, endpoint: "https://www.youtube.com/oembed?format=json&url=" },
  { test: /(^|\.)vimeo\.com$/i, endpoint: "https://vimeo.com/api/oembed.json?url=" },
  { test: /(^|\.)(spotify\.com)$/i, endpoint: "https://open.spotify.com/oembed?url=" },
  { test: /(^|\.)soundcloud\.com$/i, endpoint: "https://soundcloud.com/oembed?format=json&url=" },
];

interface OembedResponse {
  title?: string;
  author_name?: string;
  provider_name?: string;
  thumbnail_url?: string;
  description?: string;
}

async function tryOembed(target: URL): Promise<Record<string, string | undefined> | null> {
  const hit = OEMBED.find((o) => o.test.test(target.hostname));
  if (!hit) return null;
  try {
    const r = await fetch(hit.endpoint + encodeURIComponent(target.toString()), {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": BOT_UA, Accept: "application/json" },
    });
    if (!r.ok) return null;
    const d = (await r.json()) as OembedResponse;
    if (!d?.title) return null;
    return {
      title: d.title,
      description: d.description,
      image: d.thumbnail_url,
      siteName: d.provider_name,
      author: d.author_name,
    };
  } catch {
    return null;
  }
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
