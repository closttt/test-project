/**
 * Link handling for Knowledge cards. Browsers can't fetch arbitrary sites' HTML (CORS), so real
 * OG image/title previews need a server-side fetch — that's a future Supabase-edge-function step.
 * What we CAN do fully client-side: pull every URL out of a card's text and present each as a
 * clean, labelled, clickable chip (domain + link icon) instead of a raw string. Covers arbitrary
 * links, not just the single manual sourceUrl fallback.
 */

export interface ExtractedLink {
  url: string;
  domain: string;
}

const URL_RE = /https?:\/\/[^\s<>()"']+/gi;
// Trailing punctuation that's almost never part of the URL itself (sentence enders, markdown).
const TRAILING = /[.,;:!?»)\]]+$/;

/** Human domain: strip protocol + leading www., drop any path. "https://www.t.me/x" → "t.me". */
export function prettyDomain(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? url;
  }
}

/** Every distinct http(s) link in `text`, in first-seen order, trailing punctuation trimmed. */
export function extractLinks(text: string | undefined): ExtractedLink[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: ExtractedLink[] = [];
  for (const raw of text.match(URL_RE) ?? []) {
    const url = raw.replace(TRAILING, "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, domain: prettyDomain(url) });
  }
  return out;
}
