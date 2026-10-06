import { getSupabaseClient } from "@/lib/supabase";
import { uid } from "@/lib/id";

/**
 * «Конспекты» — an Obsidian-style vault inside the CRM: folders of any depth, notes written in a
 * rich-text editor. A note's body is stored as MARKDOWN (the editor converts both ways), so the
 * vault stays portable — an Obsidian folder imports as-is, and the AI assistant can read it.
 *
 * One flat list of entries; the tree is `parentId`. Storage follows the library: Supabase when
 * configured and migrated (supabase/knowledge_notes.sql), localStorage otherwise. Notes written
 * locally before the table existed are moved to the cloud on the first successful load.
 */

export type NoteKind = "note" | "folder";

export interface NoteEntry {
  id: string;
  kind: NoteKind;
  /** Folder this entry lives in; null = vault root. */
  parentId: string | null;
  title: string;
  /** Markdown. Always "" for folders. */
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type NotePatch = Partial<Pick<NoteEntry, "title" | "content" | "parentId">>;

export const UNTITLED = "Без названия";

// ── Tree helpers (pure) ───────────────────────────────────────────────────────────────────

/** Folders first, then by name — the order every file tree uses. */
export function sortEntries(entries: NoteEntry[]): NoteEntry[] {
  return [...entries].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1) ||
      (a.title || UNTITLED).localeCompare(b.title || UNTITLED, "ru", { numeric: true })
  );
}

export function childrenOf(entries: NoteEntry[], parentId: string | null): NoteEntry[] {
  return sortEntries(entries.filter((e) => e.parentId === parentId));
}

/** The entry's id plus every id nested under it. */
export function subtreeIds(entries: NoteEntry[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of entries) {
      if (e.parentId && out.has(e.parentId) && !out.has(e.id)) {
        out.add(e.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Folder chain from the root down to (not including) the entry. */
export function pathOf(entries: NoteEntry[], id: string): NoteEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: NoteEntry[] = [];
  let cur = byId.get(id)?.parentId ?? null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const f = byId.get(cur);
    if (!f) break;
    out.unshift(f);
    cur = f.parentId;
  }
  return out;
}

/** Can `id` be moved into `target`? Not into itself, not into its own descendants. */
export function canMoveInto(entries: NoteEntry[], id: string, target: string | null): boolean {
  if (target === null) return true;
  const t = entries.find((e) => e.id === target);
  if (!t || t.kind !== "folder") return false;
  return !subtreeIds(entries, id).has(target);
}

/** Markdown → plain text, for search snippets and previews. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, a, b) => b || a)
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesNoteQuery(e: NoteEntry, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return e.title.toLowerCase().includes(needle) || e.content.toLowerCase().includes(needle);
}

/** ~160 chars of text around the first hit (or the start, without a query). */
export function snippet(md: string, q = "", size = 160): string {
  const text = plainText(md);
  const needle = q.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at <= 40) return text.length > size ? text.slice(0, size).trimEnd() + "…" : text;
  const start = Math.max(0, at - 40);
  const body = text.slice(start, start + size).trim();
  return "…" + body + (start + size < text.length ? "…" : "");
}

// ── Obsidian import (pure) ────────────────────────────────────────────────────────────────

export interface ImportFile {
  /** Path inside the picked folder, «Vault/Курсы/AI/Урок 1.md». */
  path: string;
  content: string;
  lastModified?: number;
}

/**
 * Turns a picked folder (or loose .md files) into entries under `parentId`: every directory on the
 * way becomes a folder (reusing ones that already exist with the same name), every .md a note.
 * Obsidian's own config (`.obsidian/`, `.trash/`) and non-markdown files are skipped.
 */
export function entriesFromFiles(existing: NoteEntry[], files: ImportFile[], parentId: string | null): NoteEntry[] {
  const now = new Date().toISOString();
  const all = [...existing];
  const created: NoteEntry[] = [];
  const folderFor = (parent: string | null, name: string): string => {
    const hit = all.find((e) => e.kind === "folder" && e.parentId === parent && e.title === name);
    if (hit) return hit.id;
    const f: NoteEntry = { id: uid(), kind: "folder", parentId: parent, title: name, content: "", createdAt: now, updatedAt: now };
    all.push(f);
    created.push(f);
    return f.id;
  };
  const md = files
    .filter((f) => /\.(md|markdown|txt)$/i.test(f.path))
    .filter((f) => !f.path.split("/").some((p) => p.startsWith(".")))
    .sort((a, b) => a.path.localeCompare(b.path, "ru", { numeric: true }));
  for (const f of md) {
    const parts = f.path.split("/").filter(Boolean);
    const file = parts.pop()!;
    let parent = parentId;
    for (const dir of parts) parent = folderFor(parent, dir);
    const at = f.lastModified ? new Date(f.lastModified).toISOString() : now;
    const note: NoteEntry = {
      id: uid(),
      kind: "note",
      parentId: parent,
      title: file.replace(/\.(md|markdown|txt)$/i, ""),
      content: f.content.replace(/\r\n/g, "\n"),
      createdAt: at,
      updatedAt: at,
    };
    all.push(note);
    created.push(note);
  }
  return created;
}

// ── Storage ───────────────────────────────────────────────────────────────────────────────

const LOCAL_KEY = "crm-notes-v1";
const TABLE = "knowledge_notes";

let cloudDown = false;

function db() {
  return cloudDown ? null : getSupabaseClient();
}

export function notesUseCloud(): boolean {
  return db() !== null;
}

export class NotesNotMigratedError extends Error {
  constructor() {
    super("Таблица конспектов ещё не создана в Supabase — выполните supabase/knowledge_notes.sql. Пока заметки хранятся локально в этом браузере.");
    this.name = "NotesNotMigratedError";
  }
}

function readLocal(): NoteEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as NoteEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(entries: NoteEntry[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(entries));
}

/** Last known vault, for synchronous readers (the AI context). */
let snapshot: NoteEntry[] = [];
export function notesSnapshot(): NoteEntry[] {
  return snapshot;
}

interface Row {
  id: string;
  kind: NoteKind;
  parent_id: string | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const fromRow = (r: Row): NoteEntry => ({
  id: r.id,
  kind: r.kind === "folder" ? "folder" : "note",
  parentId: r.parent_id,
  title: r.title ?? "",
  content: r.content ?? "",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRow = (e: NoteEntry): Row => ({
  id: e.id,
  kind: e.kind,
  parent_id: e.parentId,
  title: e.title,
  content: e.content,
  created_at: e.createdAt,
  updated_at: e.updatedAt,
});

export async function fetchNotes(): Promise<NoteEntry[]> {
  const client = db();
  if (!client) return (snapshot = readLocal());
  const { data, error } = await client.from(TABLE).select("*");
  if (error) {
    cloudDown = true;
    snapshot = readLocal();
    throw new NotesNotMigratedError();
  }
  let entries = (data as Row[]).map(fromRow);
  // Notes written while the table didn't exist yet: hand them to the cloud once, then forget them.
  const local = readLocal();
  const known = new Set(entries.map((e) => e.id));
  const pending = local.filter((e) => !known.has(e.id));
  if (pending.length > 0) {
    const { error: upErr } = await client.from(TABLE).upsert(pending.map(toRow));
    if (!upErr) {
      entries = [...entries, ...pending];
      localStorage.removeItem(LOCAL_KEY);
    }
  } else if (local.length > 0) {
    localStorage.removeItem(LOCAL_KEY);
  }
  return (snapshot = entries);
}

/** Inserts (or re-inserts, for undo) whole entries. */
export async function insertNotes(all: NoteEntry[], added: NoteEntry[]): Promise<void> {
  snapshot = all;
  const client = db();
  if (!client) return writeLocal(all);
  const { error } = await client.from(TABLE).upsert(added.map(toRow));
  if (error) throw new Error(error.message);
}

export async function updateNote(all: NoteEntry[], id: string, patch: NotePatch & { updatedAt: string }): Promise<void> {
  snapshot = all;
  const client = db();
  if (!client) return writeLocal(all);
  const row: Partial<Row> = { updated_at: patch.updatedAt };
  if ("title" in patch) row.title = patch.title;
  if ("content" in patch) row.content = patch.content;
  if ("parentId" in patch) row.parent_id = patch.parentId ?? null;
  const { error } = await client.from(TABLE).update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteNotes(all: NoteEntry[], ids: string[]): Promise<void> {
  snapshot = all;
  const client = db();
  if (!client) return writeLocal(all);
  const { error } = await client.from(TABLE).delete().in("id", ids);
  if (error) throw new Error(error.message);
}
