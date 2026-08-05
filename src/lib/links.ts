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

/**
 * The site's own logo, at a size that reads as one on a card. Google's public favicon service —
 * no key, cached on their side. Browsers can't fetch a site's OG image cross-origin, so this is
 * the reliable way to show the REAL logo; the monogram below is the fallback when a site has none.
 */
export function faviconUrl(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Card visual for a saved link: the logo sits on a coloured plate. Colours are the app's
 * design-system accents; cards cycle through them by position so the shelf reads as a varied
 * grid (red, blue, violet, green, …) rather than one flat colour.
 */
export interface LinkColor {
  /** Solid fill for the logo tile. */
  fg: string;
  /** Soft tint behind the plate, so each card carries a hint of its colour. */
  soft: string;
}

const LINK_PALETTE: LinkColor[] = [
  { fg: "hsl(0 72% 51%)", soft: "hsl(0 72% 51% / 0.10)" }, // красный (risk)
  { fg: "hsl(217 91% 60%)", soft: "hsl(217 91% 60% / 0.10)" }, // синий (brand)
  { fg: "hsl(262 83% 63%)", soft: "hsl(262 83% 63% / 0.10)" }, // фиолетовый
  { fg: "hsl(142 71% 42%)", soft: "hsl(142 71% 42% / 0.10)" }, // зелёный (success)
  { fg: "hsl(25 95% 53%)", soft: "hsl(25 95% 53% / 0.10)" }, // оранжевый
  { fg: "hsl(347 87% 60%)", soft: "hsl(347 87% 60% / 0.10)" }, // розовый
  { fg: "hsl(38 92% 50%)", soft: "hsl(38 92% 50% / 0.12)" }, // янтарный
  { fg: "hsl(189 85% 43%)", soft: "hsl(189 85% 43% / 0.12)" }, // бирюзовый
];

/** Palette entry for the card at position `i` — cycles so adjacent cards never share a colour. */
export function linkColor(i: number): LinkColor {
  return LINK_PALETTE[((i % LINK_PALETTE.length) + LINK_PALETTE.length) % LINK_PALETTE.length];
}

/** First letter of the domain, for the generated logo. Falls back to "•" for odd inputs. */
export function linkMonogram(domain: string): string {
  const m = domain.match(/[a-zA-Zа-яА-Я0-9]/);
  return (m?.[0] ?? "•").toUpperCase();
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
