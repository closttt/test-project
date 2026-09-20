import { extractLinks, prettyDomain } from "@/lib/links";
import { getSupabaseClient } from "@/lib/supabase";
import { uid } from "@/lib/id";

/**
 * «Библиотека» — the knowledge base's own catalogue of things worth keeping: books, articles,
 * videos, podcasts, courses, tools. One item = one thing you read/watched/listened to (or mean
 * to), with your notes on it. Deliberately NOT an Obsidian: no wiki-links, no graph, no folders —
 * tags, statuses, favourites and search are the whole organising model.
 *
 * Storage follows the link shelf: Supabase when configured (so the library follows you across
 * devices), localStorage otherwise. Every mutation returns the full fresh list so the UI just
 * replaces its state.
 */

export type LibraryType = "book" | "article" | "video" | "podcast" | "course" | "tool" | "other";
export type LibraryStatus = "want" | "doing" | "done";

export interface LibraryItem {
  id: string;
  type: LibraryType;
  title: string;
  author?: string;
  url?: string;
  /** Pretty host of `url` («youtube.com») — for the card footer and type detection. */
  domain?: string;
  coverUrl?: string;
  /** One-paragraph «what it is». */
  description?: string;
  /** Your own notes, markdown. */
  notes: string;
  tags: string[];
  status: LibraryStatus;
  favorite: boolean;
  /** 1–5, undefined = not rated. */
  rating?: number;
  /** Telegram card this was made from (Знания → Карточки → «в Библиотеку»). */
  sourceCardId?: string;
  createdAt: string;
  updatedAt: string;
}

export type LibraryDraft = Omit<LibraryItem, "id" | "createdAt" | "updatedAt">;

export const LIBRARY_TYPES: Record<LibraryType, { label: string; plural: string; done: string }> = {
  book: { label: "Книга", plural: "Книги", done: "Прочитано" },
  article: { label: "Статья", plural: "Статьи", done: "Прочитано" },
  video: { label: "Видео", plural: "Видео", done: "Просмотрено" },
  podcast: { label: "Подкаст", plural: "Подкасты", done: "Прослушано" },
  course: { label: "Курс", plural: "Курсы", done: "Пройдено" },
  tool: { label: "Инструмент", plural: "Инструменты", done: "Освоено" },
  other: { label: "Другое", plural: "Другое", done: "Готово" },
};

export const LIBRARY_TYPE_ORDER: LibraryType[] = ["book", "article", "video", "podcast", "course", "tool", "other"];

export const LIBRARY_STATUSES: Record<LibraryStatus, { label: string }> = {
  want: { label: "Хочу" },
  doing: { label: "В процессе" },
  done: { label: "Готово" },
};

export const LIBRARY_STATUS_ORDER: LibraryStatus[] = ["want", "doing", "done"];

/** Type guess from the link's host — the user can always override it in the form. */
export function detectType(url: string | undefined): LibraryType {
  if (!url) return "book";
  const host = prettyDomain(url).toLowerCase();
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ""; } })();
  const has = (...parts: string[]) => parts.some((p) => host.includes(p));
  if (has("youtube.com", "youtu.be", "vimeo.com", "rutube.ru", "vk.com/video", "kinescope", "loom.com")) return "video";
  if (has("spotify.com", "podcasts.apple.com", "castbox", "music.yandex", "podster", "overcast.fm", "pocketcasts", "podcast")) return "podcast";
  if (has("litres", "goodreads", "labirint", "chitai-gorod", "books.google", "audible", "storytel", "bookmate", "mif.to", "alpinabook", "piter.com", "readly") || /\/book/.test(path)) return "book";
  if (has("amazon.") && /\/dp\/|\/gp\/product/.test(path)) return "book";
  if (has("udemy", "coursera", "stepik", "skillbox", "netology", "yandex.ru/practicum", "practicum.yandex", "edx.org", "skillshare", "geekbrains", "hexlet", "khanacademy", "masterclass")) return "course";
  if (has("github.com", "npmjs.com", "producthunt", "pypi.org", "chrome.google.com/webstore", "apps.apple.com", "play.google.com", "figma.com/community")) return "tool";
  return "article";
}

/** Shared search: title, author, description, notes, tags, domain. */
export function matchesLibraryQuery(item: LibraryItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [item.title, item.author, item.description, item.notes, item.domain, ...item.tags]
    .filter((s): s is string => !!s)
    .some((s) => s.toLowerCase().includes(needle));
}

export type LibrarySort = "newest" | "oldest" | "title" | "rating";

export function sortLibrary(items: LibraryItem[], sort: LibrarySort): LibraryItem[] {
  const out = [...items];
  switch (sort) {
    case "oldest": return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "title": return out.sort((a, b) => a.title.localeCompare(b.title, "ru"));
    case "rating": return out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.createdAt.localeCompare(a.createdAt));
    default: return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/** Tag → count, most used first. */
export function libraryTagCounts(items: LibraryItem[]): [string, number][] {
  const m = new Map<string, number>();
  items.forEach((i) => i.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
}

/** Empty draft for the «Добавить» form; `url` (if any) pre-fills type + domain. */
export function newDraft(raw = ""): LibraryDraft {
  const found = extractLinks(raw)[0];
  const url = found?.url;
  return {
    type: detectType(url),
    title: "",
    url,
    domain: found?.domain,
    notes: "",
    tags: [],
    status: "want",
    favorite: false,
  };
}

// ── Unfurl (og:title / og:image via our own serverless function) ─────────────────────────

export interface Unfurled {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
}

/**
 * Asks /api/unfurl for the page's Open Graph data. Returns {} on ANY failure — in local dev there
 * is no serverless runtime and the SPA fallback answers with HTML, which must not break adding.
 */
export async function unfurl(url: string): Promise<Unfurled> {
  try {
    const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(9000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/json")) return {};
    const data = (await res.json()) as Unfurled;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

// ── Storage ───────────────────────────────────────────────────────────────────────────────

const LOCAL_KEY = "crm-library-v1";
const COVER_BUCKET = "library-covers";

let cloudDown = false;

function db() {
  return cloudDown ? null : getSupabaseClient();
}

export function libraryUsesCloud(): boolean {
  return db() !== null;
}

export class LibraryNotMigratedError extends Error {
  constructor() {
    super("Таблица библиотеки ещё не создана в Supabase — выполните supabase/library_items.sql. Пока библиотека работает локально в этом браузере.");
    this.name = "LibraryNotMigratedError";
  }
}

function readLocal(): LibraryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as LibraryItem[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: LibraryItem[]): LibraryItem[] {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  return items;
}

interface Row {
  id: string;
  type: LibraryType;
  title: string;
  author: string | null;
  url: string | null;
  domain: string | null;
  cover_url: string | null;
  description: string | null;
  notes: string | null;
  tags: string[] | null;
  status: LibraryStatus;
  favorite: boolean;
  rating: number | null;
  source_card_id: string | null;
  created_at: string;
  updated_at: string;
}

const fromRow = (r: Row): LibraryItem => ({
  id: r.id,
  type: r.type,
  title: r.title,
  author: r.author ?? undefined,
  url: r.url ?? undefined,
  domain: r.domain ?? undefined,
  coverUrl: r.cover_url ?? undefined,
  description: r.description ?? undefined,
  notes: r.notes ?? "",
  tags: r.tags ?? [],
  status: r.status,
  favorite: r.favorite,
  rating: r.rating ?? undefined,
  sourceCardId: r.source_card_id ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRow = (d: Partial<LibraryDraft>): Partial<Omit<Row, "id" | "created_at">> => {
  const out: Partial<Omit<Row, "id" | "created_at">> = {};
  if ("type" in d) out.type = d.type;
  if ("title" in d) out.title = d.title;
  if ("author" in d) out.author = d.author ?? null;
  if ("url" in d) out.url = d.url ?? null;
  if ("domain" in d) out.domain = d.domain ?? null;
  if ("coverUrl" in d) out.cover_url = d.coverUrl ?? null;
  if ("description" in d) out.description = d.description ?? null;
  if ("notes" in d) out.notes = d.notes ?? "";
  if ("tags" in d) out.tags = d.tags ?? [];
  if ("status" in d) out.status = d.status;
  if ("favorite" in d) out.favorite = d.favorite;
  if ("rating" in d) out.rating = d.rating ?? null;
  if ("sourceCardId" in d) out.source_card_id = d.sourceCardId ?? null;
  out.updated_at = new Date().toISOString();
  return out;
};

export async function fetchLibrary(): Promise<LibraryItem[]> {
  const client = db();
  if (!client) return readLocal();
  const { data, error } = await client.from("library_items").select("*").order("created_at", { ascending: false });
  if (error) {
    cloudDown = true;
    throw new LibraryNotMigratedError();
  }
  return (data as Row[]).map(fromRow);
}

export async function addLibraryItem(items: LibraryItem[], draft: LibraryDraft): Promise<{ items: LibraryItem[]; item: LibraryItem }> {
  const now = new Date().toISOString();
  const client = db();
  if (!client) {
    const item: LibraryItem = { ...draft, id: uid(), createdAt: now, updatedAt: now };
    return { items: writeLocal([item, ...items]), item };
  }
  const { data, error } = await client.from("library_items").insert(toRow(draft)).select().single();
  if (error) throw new Error(error.message);
  const item = fromRow(data as Row);
  return { items: [item, ...items], item };
}

export async function updateLibraryItem(items: LibraryItem[], id: string, patch: Partial<LibraryDraft>): Promise<LibraryItem[]> {
  const now = new Date().toISOString();
  const next = items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now } : i));
  const client = db();
  if (!client) return writeLocal(next);
  const { error } = await client.from("library_items").update(toRow(patch)).eq("id", id);
  if (error) throw new Error(error.message);
  return next;
}

export async function removeLibraryItem(items: LibraryItem[], id: string): Promise<LibraryItem[]> {
  const next = items.filter((i) => i.id !== id);
  const client = db();
  if (!client) return writeLocal(next);
  const { error } = await client.from("library_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return next;
}

/** Re-inserts a deleted item under its old id (undo). */
export async function restoreLibraryItem(items: LibraryItem[], item: LibraryItem): Promise<LibraryItem[]> {
  const next = [item, ...items.filter((i) => i.id !== item.id)];
  const client = db();
  if (!client) return writeLocal(next);
  const { error } = await client.from("library_items").insert({ id: item.id, created_at: item.createdAt, ...toRow(item) });
  if (error) throw new Error(error.message);
  return next;
}

const MAX_COVER_BYTES = 3 * 1024 * 1024;

/**
 * Stores a cover image and returns a URL to put in `coverUrl`. Cloud: public bucket
 * `library-covers`. Local: a data URL (the item itself lives in localStorage anyway).
 */
export async function uploadCover(file: File): Promise<string> {
  if (file.size > MAX_COVER_BYTES) throw new Error("Обложка больше 3 МБ — сожмите картинку.");
  const client = db();
  if (!client) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Не удалось прочитать файл."));
      r.readAsDataURL(file);
    });
  }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await client.storage.from(COVER_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return client.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
}
