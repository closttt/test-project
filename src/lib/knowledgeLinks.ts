import { extractLinks, prettyDomain } from "@/lib/links";

/**
 * "Ссылки" — a dump-anything link shelf in the Knowledge base, separate from the Telegram-sourced
 * cards. Those cards live in Supabase (written by the Hermes agent, read-only from the browser), so
 * hand-added links are kept in their own localStorage list instead: paste one or many URLs, they're
 * saved with their domain and stay editable/removable entirely client-side.
 */

export interface SavedLink {
  id: string;
  url: string;
  /** Optional user label; the domain is shown when this is empty. */
  title?: string;
  domain: string;
  createdAt: string;
}

const KEY = "crm-knowledge-links-v1";

export function loadLinks(): SavedLink[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedLink[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persist(links: SavedLink[]): SavedLink[] {
  localStorage.setItem(KEY, JSON.stringify(links));
  return links;
}

/**
 * Adds every URL found in `raw` (so you can paste a whole block of links at once), newest first.
 * Duplicates of an already-saved URL are skipped. `title` only applies when the input holds exactly
 * one link — labelling a batch with one title would be wrong.
 */
export function addLinks(existing: SavedLink[], raw: string, title?: string): SavedLink[] {
  const found = extractLinks(raw);
  if (found.length === 0) return existing;
  const known = new Set(existing.map((l) => l.url));
  const fresh: SavedLink[] = [];
  for (const { url, domain } of found) {
    if (known.has(url)) continue;
    known.add(url);
    fresh.push({
      id: `${Date.now()}-${url}`,
      url,
      domain,
      title: found.length === 1 ? title?.trim() || undefined : undefined,
      createdAt: new Date().toISOString(),
    });
  }
  if (fresh.length === 0) return existing;
  return persist([...fresh, ...existing]);
}

export function removeLink(existing: SavedLink[], id: string): SavedLink[] {
  return persist(existing.filter((l) => l.id !== id));
}

/** Groups saved links by domain, biggest group first — the shelf stays readable as it grows. */
export function groupLinksByDomain(links: SavedLink[]): { domain: string; links: SavedLink[] }[] {
  const map = new Map<string, SavedLink[]>();
  for (const l of links) {
    const d = l.domain || prettyDomain(l.url);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(l);
  }
  return [...map.entries()]
    .map(([domain, ls]) => ({ domain, links: ls }))
    .sort((a, b) => b.links.length - a.links.length || a.domain.localeCompare(b.domain));
}
