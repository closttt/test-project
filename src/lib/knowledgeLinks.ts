import { extractLinks } from "@/lib/links";
import { getSupabaseClient } from "@/lib/supabase";

/**
 * "Ссылки" — the Knowledge base's own link shelf, organised into user-made sections
 * («Анимации», «Шрифты», …) exactly like project sections: create a section, drop links into it,
 * drag to reorder.
 *
 * Storage: Supabase when it's configured (so the shelf follows the user across devices, same as
 * the Telegram cards), falling back to localStorage when it isn't — the shelf must keep working
 * on a machine with no keys set. Both paths go through the same async API below, so the UI never
 * needs to know which one is live.
 */

export interface SavedLink {
  id: string;
  url: string;
  /** Optional user label; the domain is shown when this is empty. */
  title?: string;
  domain: string;
  /** Section this link belongs to; null = the unsorted area at the top. */
  sectionId: string | null;
  /** Manual order within its section (ascending). */
  position: number;
  createdAt: string;
}

export interface LinkSection {
  id: string;
  name: string;
  position: number;
  createdAt: string;
}

export interface LinkShelf {
  sections: LinkSection[];
  links: SavedLink[];
}

const LINKS_KEY = "crm-knowledge-links-v1";
const SECTIONS_KEY = "crm-knowledge-link-sections-v1";

/** Gap between neighbouring positions when appending — leaves room to drop cards in between. */
const STEP = 1000;

/**
 * A position that sorts strictly between two neighbours. Using the midpoint of doubles means a
 * drop only rewrites the ONE card that moved, instead of renumbering the whole list.
 */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return STEP;
  if (before === undefined) return after! - STEP;
  if (after === undefined) return before + STEP;
  return (before + after) / 2;
}

/** Position that puts a new item at the end of `items`. */
export function nextPosition(items: { position: number }[]): number {
  return items.length === 0 ? STEP : Math.max(...items.map((i) => i.position)) + STEP;
}

/**
 * Turns pasted text into link drafts: every URL found (so a whole block can be pasted at once),
 * skipping ones already saved. `title` only applies when the input holds exactly one link —
 * labelling a batch with a single title would be wrong.
 */
export function parseNewLinks(
  raw: string,
  existing: SavedLink[],
  opts: { title?: string; sectionId?: string | null; startPosition?: number } = {}
): Omit<SavedLink, "id">[] {
  const found = extractLinks(raw);
  if (found.length === 0) return [];
  const known = new Set(existing.map((l) => l.url));
  const out: Omit<SavedLink, "id">[] = [];
  let pos = opts.startPosition ?? nextPosition(existing);
  for (const { url, domain } of found) {
    if (known.has(url)) continue;
    known.add(url);
    out.push({
      url,
      domain,
      title: found.length === 1 ? opts.title?.trim() || undefined : undefined,
      sectionId: opts.sectionId ?? null,
      position: pos,
      createdAt: new Date().toISOString(),
    });
    pos += STEP;
  }
  return out;
}

/** Links of one section (null = unsorted), in manual order. */
export function linksOfSection(links: SavedLink[], sectionId: string | null): SavedLink[] {
  return links.filter((l) => (l.sectionId ?? null) === sectionId).sort((a, b) => a.position - b.position);
}

// ── Storage ───────────────────────────────────────────────────────────────────────────────
// Supabase when configured, localStorage otherwise. Every function below returns the FULL fresh
// shelf so the caller just replaces its state — no partial-update bookkeeping in the UI.

function localId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readLocal(): LinkShelf {
  const parse = <T>(key: string): T[] => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(raw) ? (raw as T[]) : [];
    } catch {
      return [];
    }
  };
  const links = parse<SavedLink>(LINKS_KEY).map((l, i) => ({
    ...l,
    // Backfill rows saved before sections existed.
    sectionId: l.sectionId ?? null,
    position: typeof l.position === "number" ? l.position : (i + 1) * STEP,
  }));
  return { sections: parse<LinkSection>(SECTIONS_KEY), links };
}

function writeLocal(shelf: LinkShelf): LinkShelf {
  localStorage.setItem(LINKS_KEY, JSON.stringify(shelf.links));
  localStorage.setItem(SECTIONS_KEY, JSON.stringify(shelf.sections));
  return shelf;
}

interface LinkRow {
  id: string;
  url: string;
  title: string | null;
  domain: string;
  section_id: string | null;
  position: number;
  created_at: string;
}

interface SectionRow {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

const fromLinkRow = (r: LinkRow): SavedLink => ({
  id: r.id,
  url: r.url,
  title: r.title ?? undefined,
  domain: r.domain,
  sectionId: r.section_id,
  position: r.position,
  createdAt: r.created_at,
});

const fromSectionRow = (r: SectionRow): LinkSection => ({
  id: r.id,
  name: r.name,
  position: r.position,
  createdAt: r.created_at,
});

/**
 * Set once the cloud has proven unusable this session (keys present but the tables aren't there
 * yet — i.e. the migration hasn't been run). Everything then falls back to localStorage, so the
 * shelf keeps working exactly as before instead of showing an empty page.
 */
let cloudDown = false;

function db() {
  return cloudDown ? null : getSupabaseClient();
}

/** True when the shelf lives in Supabase (keys set and reachable); false = this browser only. */
export function linksUseCloud(): boolean {
  return db() !== null;
}

/** Marks that the migration hasn't been run, so callers can say so instead of showing a raw 404. */
export class ShelfNotMigratedError extends Error {
  constructor() {
    super(
      "Таблицы ссылок ещё не созданы в Supabase — выполните supabase/knowledge_links.sql. " +
        "Пока полка работает локально в этом браузере."
    );
    this.name = "ShelfNotMigratedError";
  }
}

const MIGRATED_KEY = "crm-knowledge-links-uploaded-v1";

/**
 * One-time lift of this browser's existing shelf into a freshly-created cloud one. Without it the
 * links saved before the migration would silently disappear from view the moment the tables exist.
 */
async function uploadLocalShelf(client: NonNullable<ReturnType<typeof getSupabaseClient>>): Promise<LinkShelf | null> {
  if (localStorage.getItem(MIGRATED_KEY)) return null;
  const local = readLocal();
  if (local.links.length === 0 && local.sections.length === 0) {
    localStorage.setItem(MIGRATED_KEY, "1");
    return null;
  }
  const { data, error } = await client
    .from("knowledge_links")
    .insert(
      local.links.map((l) => ({
        url: l.url,
        title: l.title ?? null,
        domain: l.domain,
        // Local section ids don't exist server-side; the links land unsorted and can be re-filed.
        section_id: null,
        position: l.position,
      }))
    )
    .select();
  if (error) throw new Error(error.message);
  localStorage.setItem(MIGRATED_KEY, "1");
  return { sections: [], links: (data as LinkRow[]).map(fromLinkRow) };
}

export async function fetchShelf(): Promise<LinkShelf> {
  const client = db();
  if (!client) return readLocal();
  const [sections, links] = await Promise.all([
    client.from("knowledge_link_sections").select("*").order("position"),
    client.from("knowledge_links").select("*").order("position"),
  ]);
  const failure = sections.error ?? links.error;
  if (failure) {
    // Tables missing → the SQL hasn't been run. Keep the shelf usable locally and say why.
    cloudDown = true;
    throw new ShelfNotMigratedError();
  }
  const shelf: LinkShelf = {
    sections: (sections.data as SectionRow[]).map(fromSectionRow),
    links: (links.data as LinkRow[]).map(fromLinkRow),
  };
  if (shelf.links.length === 0 && shelf.sections.length === 0) {
    const uploaded = await uploadLocalShelf(client);
    if (uploaded) return uploaded;
  }
  return shelf;
}

export async function addLinks(
  shelf: LinkShelf,
  raw: string,
  opts: { title?: string; sectionId?: string | null } = {}
): Promise<LinkShelf> {
  const sectionId = opts.sectionId ?? null;
  const drafts = parseNewLinks(raw, shelf.links, {
    title: opts.title,
    sectionId,
    startPosition: nextPosition(linksOfSection(shelf.links, sectionId)),
  });
  if (drafts.length === 0) return shelf;

  const client = db();
  if (!client) {
    const created = drafts.map((d) => ({ ...d, id: localId() }));
    return writeLocal({ ...shelf, links: [...shelf.links, ...created] });
  }
  const { data, error } = await client
    .from("knowledge_links")
    .insert(
      drafts.map((d) => ({
        url: d.url,
        title: d.title ?? null,
        domain: d.domain,
        section_id: d.sectionId,
        position: d.position,
      }))
    )
    .select();
  if (error) throw new Error(error.message);
  return { ...shelf, links: [...shelf.links, ...(data as LinkRow[]).map(fromLinkRow)] };
}

export async function removeLink(shelf: LinkShelf, id: string): Promise<LinkShelf> {
  const next = { ...shelf, links: shelf.links.filter((l) => l.id !== id) };
  const client = db();
  if (!client) return writeLocal(next);
  const { error } = await client.from("knowledge_links").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return next;
}

/** Moves a link into `sectionId` at `position` — the single write behind every drag-and-drop. */
export async function moveLink(
  shelf: LinkShelf,
  id: string,
  sectionId: string | null,
  position: number
): Promise<LinkShelf> {
  const next = {
    ...shelf,
    links: shelf.links.map((l) => (l.id === id ? { ...l, sectionId, position } : l)),
  };
  const client = db();
  if (!client) return writeLocal(next);
  const { error } = await client
    .from("knowledge_links")
    .update({ section_id: sectionId, position })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return next;
}

export async function renameLink(shelf: LinkShelf, id: string, title: string): Promise<LinkShelf> {
  const clean = title.trim() || undefined;
  const next = { ...shelf, links: shelf.links.map((l) => (l.id === id ? { ...l, title: clean } : l)) };
  const client = db();
  if (!client) return writeLocal(next);
  const { error } = await client.from("knowledge_links").update({ title: clean ?? null }).eq("id", id);
  if (error) throw new Error(error.message);
  return next;
}

export async function addSection(shelf: LinkShelf, name: string): Promise<LinkShelf> {
  const clean = name.trim();
  if (!clean) return shelf;
  const position = nextPosition(shelf.sections);
  const client = db();
  if (!client) {
    const created: LinkSection = { id: localId(), name: clean, position, createdAt: new Date().toISOString() };
    return writeLocal({ ...shelf, sections: [...shelf.sections, created] });
  }
  const { data, error } = await client
    .from("knowledge_link_sections")
    .insert({ name: clean, position })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ...shelf, sections: [...shelf.sections, fromSectionRow(data as SectionRow)] };
}

export async function renameSection(shelf: LinkShelf, id: string, name: string): Promise<LinkShelf> {
  const clean = name.trim();
  if (!clean) return shelf;
  const next = { ...shelf, sections: shelf.sections.map((s) => (s.id === id ? { ...s, name: clean } : s)) };
  const client = db();
  if (!client) return writeLocal(next);
  const { error } = await client.from("knowledge_link_sections").update({ name: clean }).eq("id", id);
  if (error) throw new Error(error.message);
  return next;
}

/** Deleting a section keeps its links — they drop back into the unsorted area. */
export async function removeSection(shelf: LinkShelf, id: string): Promise<LinkShelf> {
  const next: LinkShelf = {
    sections: shelf.sections.filter((s) => s.id !== id),
    links: shelf.links.map((l) => (l.sectionId === id ? { ...l, sectionId: null } : l)),
  };
  const client = db();
  if (!client) return writeLocal(next);
  // The FK is ON DELETE SET NULL, so the links are re-parented server-side by this one delete.
  const { error } = await client.from("knowledge_link_sections").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return next;
}

export async function moveSection(shelf: LinkShelf, id: string, position: number): Promise<LinkShelf> {
  const next = { ...shelf, sections: shelf.sections.map((s) => (s.id === id ? { ...s, position } : s)) };
  const client = db();
  if (!client) return writeLocal(next);
  const { error } = await client.from("knowledge_link_sections").update({ position }).eq("id", id);
  if (error) throw new Error(error.message);
  return next;
}
