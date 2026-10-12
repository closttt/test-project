/**
 * База знаний · Craft Dark — pieces of the live «База знаний» page (concept v5 «Обзор»): the data
 * hook, editors, rows.
 *
 * Data: the same libs the old page used (lib/library, lib/knowledgeNotes, lib/knowledgeLinks) —
 * Supabase in production, localStorage when it isn't configured. Every mutation is optimistic:
 * local state changes first, then the real lib call runs; if the write fails, the change is put
 * back (or the draft dropped) and the error is shown in a toast. Nothing is written on mount.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useEditor, useEditorState, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import {
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  ExternalLink,
  FileText,
  Folder,
  FolderInput,
  Heading1,
  Heading2,
  Heart,
  Italic,
  Link2,
  List,
  ListTodo,
  NotebookPen,
  Plus,
  Quote,
  Star,
  Strikethrough,
  Trash2,
  X,
} from "lucide-react";

import { Btn, C, IconBtn, R, T, TONE, dashed, plural } from "@/design-lab/screens/_kit/craft";
import { useToast } from "@/store/ToastProvider";
import { uid } from "@/lib/id";
import { faviconUrl, linkMonogram } from "@/lib/links";
import {
  LIBRARY_STATUSES,
  LIBRARY_STATUS_ORDER,
  LIBRARY_TYPES,
  LIBRARY_TYPE_ORDER,
  detectType,
  fetchLibrary,
  linkDrafts,
  removeLibraryItem,
  restoreLibraryItem,
  unfurl,
  unfurlPatch,
  updateLibraryItem,
  type LibraryDraft,
  type LibraryItem,
  type LibraryStatus,
} from "@/lib/library";
import {
  UNTITLED,
  canMoveInto,
  deleteNotes,
  fetchNotes,
  insertNotes,
  pathOf,
  snippet,
  subtreeIds,
  updateNote,
  type NoteEntry,
  type NoteKind,
  type NotePatch,
} from "@/lib/knowledgeNotes";
import {
  addLinks,
  addSection,
  fetchShelf,
  linksOfSection,
  moveLink,
  nextPosition,
  parseNewLinks,
  removeLink,
  removeSection,
  renameLink,
  renameSection,
  type LinkSection,
  type LinkShelf,
  type SavedLink,
} from "@/lib/knowledgeLinks";
import { TYPE_ICON } from "@/components/library/libraryMeta";

export const ICON = { size: 18, strokeWidth: 1.75 } as const;
export const SM = { size: 16, strokeWidth: 1.75 } as const;
export const TINT = "rgba(10,132,255,0.14)";

// ── Data ──────────────────────────────────────────────────────────────────────────────────────

/** Typing writes a note at most this often; the UI itself updates instantly. */
const SAVE_DEBOUNCE_MS = 700;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useRefState<T>(init: T) {
  const ref = useRef(init);
  const [v, setV] = useState(init);
  const set = useCallback((next: T | ((c: T) => T)) => {
    ref.current = typeof next === "function" ? (next as (c: T) => T)(ref.current) : next;
    setV(ref.current);
  }, []);
  return [v, set, ref] as const;
}

export interface Lib {
  items: LibraryItem[];
  loading: boolean;
  pending: Set<string>;
  /** `onSaved` runs once the item is really stored. */
  add: (draft: LibraryDraft, onSaved?: () => void) => LibraryItem;
  /** Paste → items (one per new link); returns how many were added. */
  quickAdd: (raw: string) => number;
  update: (id: string, patch: Partial<LibraryDraft>) => void;
  /** The round checkbox: closes an item (status «done») or puts it back, with «Вернуть» in a toast. */
  setClosed: (item: LibraryItem, closed: boolean) => void;
  remove: (item: LibraryItem) => void;
  tags: string[];
}

export interface Vault {
  entries: NoteEntry[];
  loading: boolean;
  /** `draft: true` keeps a new note local until its first edit — closing it untouched leaves nothing behind. */
  create: (kind: NoteKind, parentId: string | null, title?: string, opts?: { draft?: boolean }) => NoteEntry;
  /** Drops a still-untouched draft note (never written, so nothing to delete). */
  discard: (id: string) => void;
  update: (id: string, patch: NotePatch) => void;
  remove: (id: string) => void;
  move: (id: string, target: string | null) => void;
  importEntries: (added: NoteEntry[]) => void;
  folders: NoteEntry[];
  notes: NoteEntry[];
}

export interface Shelf {
  shelf: LinkShelf;
  sections: LinkSection[];
  add: (raw: string, opts?: { title?: string; sectionId?: string | null }) => number;
  remove: (id: string) => void;
  move: (id: string, sectionId: string | null, position: number) => void;
  rename: (id: string, title: string) => void;
  addSection: (name: string) => void;
  renameSection: (id: string, name: string) => void;
  removeSection: (id: string) => void;
}

export interface Knowledge {
  lib: Lib;
  vault: Vault;
  links: Shelf;
  toast: (m: string, o?: { actionLabel?: string; onAction?: () => void }) => void;
}

export function useKnowledge(): Knowledge {
  const { toast } = useToast();
  const fail = useCallback((e: unknown) => toast(errText(e)), [toast]);

  // Library
  const [items, setItems, itemsRef] = useRefState<LibraryItem[]>([]);
  const [libLoading, setLibLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  /** id → insert in flight (resolves true when it landed). Updates of that item wait for it. */
  const libInserting = useRef(new Map<string, Promise<boolean>>());

  // Vault
  const [entries, setEntries, entriesRef] = useRefState<NoteEntry[]>([]);
  const [vaultLoading, setVaultLoading] = useState(true);
  const queue = useRef(new Map<string, NotePatch & { updatedAt: string }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drafts = useRef(new Set<string>());
  const noteInserting = useRef(new Map<string, Promise<boolean>>());

  // Shelf
  const [shelf, setShelf, shelfRef] = useRefState<LinkShelf>({ sections: [], links: [] });

  // Reads only. A failed cloud read makes the lib fall back to this browser's copy — say so once.
  useEffect(() => {
    let alive = true;
    const load = <V,>(get: () => Promise<V>, fallback: V, apply: (v: V) => void) =>
      get()
        .catch((e) => {
          if (alive) toast(errText(e));
          return get();
        })
        .catch(() => fallback)
        .then((v) => {
          if (alive) apply(v);
        });
    load(fetchLibrary, [] as LibraryItem[], (xs) => (setItems(xs), setLibLoading(false)));
    load(fetchNotes, [] as NoteEntry[], (xs) => (setEntries(xs), setVaultLoading(false)));
    load(fetchShelf, { sections: [], links: [] } as LinkShelf, setShelf);
    return () => {
      alive = false;
    };
  }, [setItems, setEntries, setShelf, toast]);

  // ── library mutations
  const libUpdate = useCallback(
    (id: string, patch: Partial<LibraryDraft>) => {
      const prev = itemsRef.current.find((i) => i.id === id);
      if (!prev) return;
      const now = new Date().toISOString();
      setItems((c) => c.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now } : i)));
      (libInserting.current.get(id) ?? Promise.resolve(true))
        .then((ok) => (ok ? updateLibraryItem(itemsRef.current, id, patch) : undefined))
        .catch((e) => {
          // Put back only the fields this write touched — later edits stay.
          const back = Object.fromEntries(Object.keys(patch).map((key) => [key, prev[key as keyof LibraryItem]])) as Partial<LibraryItem>;
          setItems((c) => c.map((i) => (i.id === id ? { ...i, ...back } : i)));
          fail(e);
        });
    },
    [fail, setItems, itemsRef]
  );

  const libAdd = useCallback(
    (draft: LibraryDraft, onSaved?: () => void) => {
      const now = new Date().toISOString();
      const item: LibraryItem = { ...draft, id: uid(), createdAt: now, updatedAt: now };
      setItems((c) => [item, ...c]);
      // Inserted under the id made here (restoreLibraryItem keeps the id), so the item never
      // changes identity and an edit made while the insert is in flight targets the right row.
      const p = restoreLibraryItem(
        itemsRef.current.filter((i) => i.id !== item.id),
        item
      ).then(
        () => {
          onSaved?.();
          return true;
        },
        (e) => {
          setItems((c) => c.filter((i) => i.id !== item.id));
          fail(e);
          return false;
        }
      );
      libInserting.current.set(item.id, p);
      p.finally(() => libInserting.current.delete(item.id));
      return item;
    },
    [fail, setItems, itemsRef]
  );

  const quickAdd = useCallback(
    (raw: string) => {
      const ds = linkDrafts(raw, itemsRef.current);
      if (ds.length === 0) {
        toast(/https?:\/\//i.test(raw) ? "Эта ссылка уже в библиотеке" : "Вставьте ссылку — https://…");
        return 0;
      }
      for (const d of ds) {
        const item = libAdd(d);
        if (!d.url) continue;
        setPending((p) => new Set([...p, item.id]));
        unfurl(d.url)
          .then((meta) => {
            const cur = itemsRef.current.find((x) => x.id === item.id);
            if (!cur) return;
            const patch = unfurlPatch(meta, cur);
            if (Object.keys(patch).length) libUpdate(item.id, patch);
          })
          .catch(() => undefined) // no preview is fine — the link itself is saved
          .finally(() =>
            setPending((p) => {
              const n = new Set(p);
              n.delete(item.id);
              return n;
            })
          );
      }
      toast(ds.length === 1 ? "Добавлено в библиотеку" : `Добавлено: ${ds.length}`);
      return ds.length;
    },
    [libAdd, libUpdate, toast, itemsRef]
  );

  const setClosed = useCallback(
    (item: LibraryItem, closed: boolean) => {
      const before = item.status;
      const next: LibraryStatus = closed ? "done" : "want";
      if (before === next) return;
      libUpdate(item.id, { status: next });
      if (closed) {
        toast(`Закрыто: ${clean(item.title) || item.domain || "материал"}`, {
          actionLabel: "Вернуть",
          onAction: () => libUpdate(item.id, { status: before }),
        });
      }
    },
    [libUpdate, toast]
  );

  const libRemove = useCallback(
    (item: LibraryItem) => {
      const id = item.id;
      setItems((c) => c.filter((i) => i.id !== id));
      (libInserting.current.get(id) ?? Promise.resolve(true))
        .then((ok) => (ok ? removeLibraryItem(itemsRef.current, id) : undefined))
        .then(() =>
          toast(`Удалено: ${clean(item.title)}`, {
            actionLabel: "Вернуть",
            onAction: () => {
              setItems((c) => [item, ...c.filter((i) => i.id !== id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
              restoreLibraryItem(
                itemsRef.current.filter((i) => i.id !== id),
                item
              ).catch((e) => {
                setItems((c) => c.filter((i) => i.id !== id));
                fail(e);
              });
            },
          })
        )
        .catch((e) => {
          setItems((c) => [item, ...c.filter((i) => i.id !== id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
          fail(e);
        });
    },
    [fail, toast, setItems, itemsRef]
  );

  // ── vault mutations
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = [...queue.current.entries()];
    queue.current.clear();
    for (const [id, p] of batch) {
      (noteInserting.current.get(id) ?? Promise.resolve(true))
        .then((ok) => (ok ? updateNote(entriesRef.current, id, p) : undefined))
        .catch(fail);
    }
  }, [fail, entriesRef]);

  // Unsaved typing goes out when the tab hides or the page unmounts.
  useEffect(() => {
    const onHide = () => {
      if (queue.current.size) flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      onHide();
    };
  }, [flush]);

  const insertEntries = useCallback(
    (added: NoteEntry[]) => {
      const ids = new Set(added.map((a) => a.id));
      const p = insertNotes(entriesRef.current, added).then(
        () => true,
        (e) => {
          setEntries((c) => c.filter((x) => !ids.has(x.id)));
          fail(e);
          return false;
        }
      );
      ids.forEach((id) => noteInserting.current.set(id, p));
      p.finally(() => ids.forEach((id) => noteInserting.current.get(id) === p && noteInserting.current.delete(id)));
    },
    [fail, setEntries, entriesRef]
  );

  const noteCreate = useCallback(
    (kind: NoteKind, parentId: string | null, title = "", opts: { draft?: boolean } = {}) => {
      const now = new Date().toISOString();
      const e: NoteEntry = { id: uid(), kind, parentId, title, content: "", createdAt: now, updatedAt: now };
      setEntries((c) => [...c, e]);
      if (opts.draft && kind === "note") drafts.current.add(e.id);
      else insertEntries([e]);
      return e;
    },
    [setEntries, insertEntries]
  );

  const noteDiscard = useCallback(
    (id: string) => {
      if (!drafts.current.delete(id)) return;
      setEntries((c) => c.filter((e) => e.id !== id));
    },
    [setEntries]
  );

  const noteUpdate = useCallback(
    (id: string, patch: NotePatch) => {
      const updatedAt = new Date().toISOString();
      setEntries((c) => c.map((e) => (e.id === id ? { ...e, ...patch, updatedAt } : e)));
      if (drafts.current.delete(id)) {
        // First edit of a new note: this is when it gets written.
        const e = entriesRef.current.find((x) => x.id === id);
        if (e) insertEntries([e]);
        return;
      }
      queue.current.set(id, { ...queue.current.get(id), ...patch, updatedAt });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush, insertEntries, setEntries, entriesRef]
  );

  const noteRemove = useCallback(
    (id: string) => {
      if (drafts.current.has(id)) return noteDiscard(id);
      const ids = subtreeIds(entriesRef.current, id);
      const removed = entriesRef.current.filter((e) => ids.has(e.id));
      const target = removed.find((e) => e.id === id);
      if (!target) return;
      ids.forEach((x) => queue.current.delete(x));
      setEntries((c) => c.filter((e) => !ids.has(e.id)));
      deleteNotes(entriesRef.current, [...ids])
        .then(() =>
          toast(target.kind === "folder" ? `Папка «${clean(target.title) || UNTITLED}» удалена` : "Заметка удалена", {
            actionLabel: "Вернуть",
            onAction: () => {
              setEntries((c) => [...c.filter((e) => !ids.has(e.id)), ...removed]);
              insertEntries(removed);
            },
          })
        )
        .catch((e) => {
          setEntries((c) => [...c.filter((x) => !ids.has(x.id)), ...removed]);
          fail(e);
        });
    },
    [fail, toast, noteDiscard, insertEntries, setEntries, entriesRef]
  );

  const noteMove = useCallback(
    (id: string, target: string | null) => {
      const e = entriesRef.current.find((x) => x.id === id);
      if (!e || e.parentId === target || !canMoveInto(entriesRef.current, id, target)) return;
      noteUpdate(id, { parentId: target });
    },
    [noteUpdate, entriesRef]
  );

  const importEntries = useCallback(
    (added: NoteEntry[]) => {
      if (added.length === 0) return;
      setEntries((c) => [...c, ...added]);
      insertEntries(added);
    },
    [setEntries, insertEntries]
  );

  // ── shelf mutations
  const shelfAdd = useCallback(
    (raw: string, opts: { title?: string; sectionId?: string | null } = {}) => {
      const sectionId = opts.sectionId ?? null;
      const cur = shelfRef.current;
      const ds = parseNewLinks(raw, cur.links, { title: opts.title, sectionId, startPosition: nextPosition(linksOfSection(cur.links, sectionId)) });
      if (ds.length === 0) return 0;
      const local = ds.map((d) => ({ ...d, id: uid() }));
      const localIds = new Set(local.map((l) => l.id));
      setShelf((c) => ({ ...c, links: [...c.links, ...local] }));
      addLinks(cur, raw, opts)
        .then((res) => {
          const fresh = res.links.filter((l) => !cur.links.some((x) => x.id === l.id));
          setShelf((c) => ({
            ...c,
            links: c.links.map((l) => {
              const i = local.findIndex((x) => x.id === l.id);
              return i >= 0 && fresh[i] ? { ...fresh[i], sectionId: l.sectionId, position: l.position } : l;
            }),
          }));
        })
        .catch((e) => {
          setShelf((c) => ({ ...c, links: c.links.filter((l) => !localIds.has(l.id)) }));
          fail(e);
        });
      return local.length;
    },
    [fail, setShelf, shelfRef]
  );

  const shelfOps = useMemo(
    () => ({
      remove: (id: string) => {
        const prev = shelfRef.current;
        const gone = prev.links.find((l) => l.id === id);
        if (!gone) return;
        setShelf((c) => ({ ...c, links: c.links.filter((l) => l.id !== id) }));
        removeLink(prev, id)
          .then(() => toast(`Ссылка удалена: ${gone.title || gone.domain}`))
          .catch((e) => {
            setShelf((c) => ({ ...c, links: [...c.links.filter((l) => l.id !== id), gone] }));
            fail(e);
          });
      },
      move: (id: string, sectionId: string | null, position: number) => {
        const prev = shelfRef.current;
        const was = prev.links.find((l) => l.id === id);
        if (!was) return;
        setShelf((c) => ({ ...c, links: c.links.map((l) => (l.id === id ? { ...l, sectionId, position } : l)) }));
        moveLink(prev, id, sectionId, position).catch((e) => {
          setShelf((c) => ({ ...c, links: c.links.map((l) => (l.id === id ? { ...l, sectionId: was.sectionId, position: was.position } : l)) }));
          fail(e);
        });
      },
      rename: (id: string, title: string) => {
        const prev = shelfRef.current;
        const was = prev.links.find((l) => l.id === id);
        if (!was) return;
        const t = title.trim() || undefined;
        setShelf((c) => ({ ...c, links: c.links.map((l) => (l.id === id ? { ...l, title: t } : l)) }));
        renameLink(prev, id, title).catch((e) => {
          setShelf((c) => ({ ...c, links: c.links.map((l) => (l.id === id ? { ...l, title: was.title } : l)) }));
          fail(e);
        });
      },
      addSection: (name: string) => {
        const nm = name.trim();
        if (!nm) return;
        const prev = shelfRef.current;
        const s: LinkSection = { id: uid(), name: nm, position: nextPosition(prev.sections), createdAt: new Date().toISOString() };
        setShelf((c) => ({ ...c, sections: [...c.sections, s] }));
        addSection(prev, nm)
          .then((res) => {
            const saved = res.sections[res.sections.length - 1];
            if (!saved) return;
            setShelf((c) => ({
              sections: c.sections.map((x) => (x.id === s.id ? saved : x)),
              links: c.links.map((l) => (l.sectionId === s.id ? { ...l, sectionId: saved.id } : l)),
            }));
          })
          .catch((e) => {
            setShelf((c) => ({ ...c, sections: c.sections.filter((x) => x.id !== s.id) }));
            fail(e);
          });
      },
      renameSection: (id: string, name: string) => {
        if (!name.trim()) return;
        const prev = shelfRef.current;
        const was = prev.sections.find((s) => s.id === id);
        if (!was) return;
        setShelf((c) => ({ ...c, sections: c.sections.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)) }));
        renameSection(prev, id, name).catch((e) => {
          setShelf((c) => ({ ...c, sections: c.sections.map((s) => (s.id === id ? { ...s, name: was.name } : s)) }));
          fail(e);
        });
      },
      removeSection: (id: string) => {
        const prev = shelfRef.current;
        const was = prev.sections.find((s) => s.id === id);
        if (!was) return;
        const moved = new Set(prev.links.filter((l) => l.sectionId === id).map((l) => l.id));
        setShelf((c) => ({ sections: c.sections.filter((s) => s.id !== id), links: c.links.map((l) => (l.sectionId === id ? { ...l, sectionId: null } : l)) }));
        removeSection(prev, id).catch((e) => {
          setShelf((c) => ({ sections: [...c.sections, was], links: c.links.map((l) => (moved.has(l.id) ? { ...l, sectionId: id } : l)) }));
          fail(e);
        });
      },
    }),
    [fail, toast, setShelf, shelfRef]
  );

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((i) => i.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [items]);
  const folders = useMemo(() => entries.filter((e) => e.kind === "folder"), [entries]);
  const notes = useMemo(() => entries.filter((e) => e.kind === "note"), [entries]);
  const sections = useMemo(() => [...shelf.sections].sort((a, b) => a.position - b.position), [shelf.sections]);

  return {
    lib: { items, loading: libLoading, pending, add: libAdd, quickAdd, update: libUpdate, setClosed, remove: libRemove, tags },
    vault: { entries, loading: vaultLoading, create: noteCreate, discard: noteDiscard, update: noteUpdate, remove: noteRemove, move: noteMove, importEntries, folders, notes },
    links: { shelf, sections, add: shelfAdd, ...shelfOps },
    toast,
  };
}

// ── Text helpers ───────────────────────────────────────────────────────────────────────────────

/** Display-only: drops emoji from titles («🎨Дизайн» → «Дизайн»); the data keeps them. */
export function clean(s: string | undefined): string {
  return (s ?? "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, "").replace(/\s+/g, " ").trim();
}

export const noteTitle = (e: NoteEntry) => clean(e.title) || UNTITLED;

export function dateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, now)) return "сегодня";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (same(d, y)) return "вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

export function folderPath(entries: NoteEntry[], id: string): string {
  return pathOf(entries, id)
    .map((f) => noteTitle(f))
    .join(" / ");
}

export function noteCount(entries: NoteEntry[], folderId: string): number {
  const ids = subtreeIds(entries, folderId);
  return entries.filter((e) => e.kind === "note" && ids.has(e.id)).length;
}

export function matchLib(i: LibraryItem, q: string) {
  if (!q) return true;
  return [i.title, i.author, i.description, i.notes, i.domain, ...i.tags].some((s) => s && s.toLowerCase().includes(q));
}
export const matchNote = (e: NoteEntry, q: string) => !q || e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q);
export const matchLink = (l: SavedLink, q: string) => !q || `${l.title ?? ""} ${l.domain} ${l.url}`.toLowerCase().includes(q);

// ── Global styles (prose + scrollbars) ─────────────────────────────────────────────────────────

export function KnStyles() {
  return (
    <style>{`
.kn-prose.note-prose{min-height:100%;padding:4px 0 96px;font-size:15px;line-height:1.65;color:#E4E5E9;outline:none}
.kn-prose h1{font-size:26px;font-weight:500;letter-spacing:-0.02em;line-height:1.2}
.kn-prose h2{font-size:21px;font-weight:500;letter-spacing:-0.015em}
.kn-prose h3{font-size:17px;font-weight:500}
.kn-prose strong{font-weight:600;color:#F4F5F7}
.kn-prose a{color:#5AA9FF}
.kn-prose blockquote{border-left:2px solid rgba(10,132,255,.55);color:#9A9CA3}
.kn-prose pre{background:#19191C;border-radius:12px}
.kn-prose code{background:#19191C;border-radius:6px}
.kn-prose hr{border:none;height:1px;background-image:linear-gradient(to right,#28282D 50%,transparent 50%);background-size:8px 1px}
.kn-prose img{border-radius:12px}
.kn-prose li::marker{color:#5E6068}
.kn-prose ul[data-type=taskList] input{accent-color:#0A84FF}
.kn-prose p.is-empty::before,.kn-prose h1.is-empty::before,.kn-prose h2.is-empty::before,.kn-prose h3.is-empty::before{color:#5E6068}
.kn-scroll{scrollbar-width:thin;scrollbar-color:#28282D transparent}
.kn-noscroll{scrollbar-width:none}
.kn-clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.kn-clamp1{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
`}</style>
  );
}

// ── Small controls ─────────────────────────────────────────────────────────────────────────────

export function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [ref, open, close]);
}

export function useWide(px: number) {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= px);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= px);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [px]);
  return wide;
}

/** Filter pill — active is a soft blue tint, never an outline. */
export function Pill({ on, onClick, children, count, icon, size = 36 }: { on?: boolean; onClick?: () => void; children: ReactNode; count?: number; icon?: ReactNode; size?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap transition-colors duration-150 ${on ? "" : "hover:bg-[#161619]"}`}
      style={{ height: size, padding: "0 14px", borderRadius: 999, fontSize: 14, background: on ? TINT : "transparent", boxShadow: on ? "none" : `inset 0 0 0 1px ${C.line}`, color: on ? C.text : C.text2 }}
    >
      {icon && <span style={{ color: on ? C.accent : C.text3, display: "inline-flex" }}>{icon}</span>}
      {children}
      {count !== undefined && <span style={{ ...T.num, fontWeight: 400, fontSize: 13, color: on ? "#5AA9FF" : C.text3 }}>{count}</span>}
    </button>
  );
}

/** Segmented control on a raise track. */
export function Seg<K extends string>({ items, value, onChange, size = 36 }: { items: { id: K; label: ReactNode; count?: number }[]; value: K; onChange: (k: K) => void; size?: number }) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 p-1" style={{ borderRadius: 999, background: C.raise }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150"
            style={{ height: size - 8, padding: "0 12px", borderRadius: 999, fontSize: 13, background: on ? C.line2 : "transparent", color: on ? C.text : C.text2 }}
          >
            {it.label}
            {it.count !== undefined && <span style={{ ...T.num, fontWeight: 400, color: C.text3 }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Ghost round icon used for hover-revealed row actions. */
export function RowAct({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors duration-150 ${danger ? "hover:bg-[#2A1A1A] hover:text-[#FF6B63]" : "hover:bg-[#1D1D21] hover:text-[#F4F5F7]"}`}
      style={{ color: C.text3 }}
    >
      {children}
    </button>
  );
}

export const field: CSSProperties = { height: 44, borderRadius: 12, background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}`, padding: "0 14px", fontSize: 14, color: C.text, width: "100%" };
export const fieldLabel: CSSProperties = { ...T.foot, color: C.text3, marginBottom: 6 };

/** Choice pill inside editors — same recipe as the main screen's TaskEditor priority. */
export function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 whitespace-nowrap px-3.5 transition-colors"
      style={{ height: 36, borderRadius: 999, fontSize: 14, background: on ? C.raise : "transparent", boxShadow: `inset 0 0 0 1px ${on ? C.line2 : C.line}`, color: on ? C.text : C.text2 }}
    >
      {children}
    </button>
  );
}

/** Pill input with a solid action — the one-gesture add (paste a link). */
export function AddBar({
  placeholder,
  onSubmit,
  label = "Добавить",
  inputRef,
  height = 52,
  surface = C.raise,
  iconOnly,
}: {
  placeholder: string;
  onSubmit: (v: string) => boolean | void;
  label?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  height?: number;
  surface?: string;
  iconOnly?: boolean;
}) {
  const [v, setV] = useState("");
  const go = (raw: string) => {
    if (!raw.trim()) return;
    if (onSubmit(raw) !== false) setV("");
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(v);
      }}
      className="flex min-w-0 flex-1 items-center gap-2 pl-4 pr-1.5"
      style={{ height, borderRadius: 999, background: surface }}
    >
      <Link2 size={16} strokeWidth={1.75} color={C.accent} className="shrink-0" />
      <input
        ref={inputRef}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/https?:\/\//i.test(text)) {
            e.preventDefault();
            go(`${v} ${text}`);
          }
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
      {iconOnly ? (
        <button type="submit" title={label} aria-label={label} className="grid shrink-0 place-items-center transition-[filter] hover:brightness-110" style={{ width: 36, height: 36, borderRadius: 999, background: C.accent, color: "#fff" }}>
          <Plus size={16} strokeWidth={2} />
        </button>
      ) : (
        <Btn type="submit" size={height >= 52 ? 40 : 36} icon={<Plus size={16} strokeWidth={2} />}>
          {label}
        </Btn>
      )}
    </form>
  );
}

// ── Media ──────────────────────────────────────────────────────────────────────────────────────

export function Favicon({ domain, size = 36, radius = 10 }: { domain?: string; size?: number; radius?: number }) {
  const [ok, setOk] = useState(false);
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden" style={{ width: size, height: size, borderRadius: radius, background: "#F4F5F7" }}>
      {!ok && <span style={{ fontSize: size * 0.42, fontWeight: 500, color: "#0A6CF0" }}>{linkMonogram(domain ?? "•")}</span>}
      {domain && (
        <img
          src={faviconUrl(domain, 64)}
          alt=""
          loading="lazy"
          onLoad={() => setOk(true)}
          className="absolute object-contain"
          style={{ width: size * 0.62, height: size * 0.62, opacity: ok ? 1 : 0 }}
        />
      )}
    </span>
  );
}

/** Cover plate: the picture, or the site's icon on a quiet plate, or the type glyph. */
export function Cover({ item, ratio = "16 / 10", radius = 14, loading }: { item: LibraryItem; ratio?: string; radius?: number; loading?: boolean }) {
  const [bad, setBad] = useState(false);
  const Icon = TYPE_ICON[item.type];
  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: ratio, borderRadius: radius, background: C.raise }}>
      {item.coverUrl && !bad ? (
        <img src={item.coverUrl} alt="" loading="lazy" onError={() => setBad(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : loading ? (
        <div className="absolute inset-0 animate-pulse" style={{ background: "linear-gradient(110deg,#19191C 30%,#202025 50%,#19191C 70%)" }} />
      ) : (
        <div className="absolute inset-0 grid place-items-center" style={{ background: "linear-gradient(160deg,#1F2632,#131315)" }}>
          {item.domain ? (
            <span className="flex flex-col items-center gap-2">
              <Favicon domain={item.domain} size={44} radius={12} />
              <span style={{ ...T.foot, color: C.text2 }}>{item.domain}</span>
            </span>
          ) : (
            <Icon size={28} strokeWidth={1.5} color={C.text3} />
          )}
        </div>
      )}
    </div>
  );
}

export function Thumb({ item, size = 44, radius = 12 }: { item: LibraryItem; size?: number; radius?: number }) {
  const [bad, setBad] = useState(false);
  const Icon = TYPE_ICON[item.type];
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden" style={{ width: size, height: size, borderRadius: radius, background: C.raise }}>
      {item.coverUrl && !bad ? (
        <img src={item.coverUrl} alt="" loading="lazy" onError={() => setBad(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : item.domain ? (
        <Favicon domain={item.domain} size={size * 0.62} radius={8} />
      ) : (
        <Icon size={size * 0.4} strokeWidth={1.6} color={C.text3} />
      )}
    </span>
  );
}

/** Round «закрыть» checkbox on library items — same round check as tasks. Closed = status «done». */
export function SeenCheck({ item, onToggle, size = 22, onImage }: { item: LibraryItem; onToggle: () => void; size?: number; onImage?: boolean }) {
  const done = item.status === "done";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      title={done ? "Вернуть в очередь" : "Закрыть"}
      aria-label={done ? "Вернуть в очередь" : "Закрыть"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="grid shrink-0 place-items-center transition-colors duration-150 hover:brightness-125"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: done ? C.accent : onImage ? "rgba(18,18,20,0.72)" : "transparent",
        boxShadow: done ? "none" : `inset 0 0 0 1.5px ${onImage ? "rgba(244,245,247,0.55)" : C.line2}`,
        backdropFilter: onImage ? "blur(6px)" : undefined,
      }}
    >
      {done && <Check size={size * 0.6} strokeWidth={3} color="#fff" />}
    </button>
  );
}

export const toggleSeen = (lib: Lib, i: LibraryItem) => lib.setClosed(i, i.status !== "done");

// ── Modal shell (TaskEditor recipe) ────────────────────────────────────────────────────────────

export function Modal({ title, onClose, width = 560, children, footer, label }: { title: ReactNode; onClose: () => void; width?: number; children: ReactNode; footer?: ReactNode; label?: string }) {
  useEsc(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={label}
        className="flex max-h-[92vh] w-full flex-col"
        style={{ maxWidth: width, background: C.panel, borderRadius: R.page, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 30px 80px rgba(0,0,0,0.6)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6">
          <span style={T.h2}>{title}</span>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
        <div className="kn-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-2 pt-5">{children}</div>
        {footer && <div className="flex items-center justify-between gap-3 px-6 pb-6 pt-4">{footer}</div>}
      </div>
    </div>
  );
}

export function DeleteBtn({ onClick, label = "Удалить" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 px-4 transition-colors hover:bg-[#2A1A1A]" style={{ height: 44, borderRadius: 999, color: TONE.red.fg, fontSize: 14 }}>
      <Trash2 {...SM} />
      {label}
    </button>
  );
}

// ── Library item form ──────────────────────────────────────────────────────────────────────────

function toDraft(i: LibraryItem): LibraryDraft {
  const { id: _a, createdAt: _b, updatedAt: _c, ...rest } = i;
  return rest;
}

export function blankDraft(): LibraryDraft {
  return { type: "article", title: "", notes: "", tags: [], status: "want", favorite: false };
}

function TagsField({ tags, known, onChange }: { tags: string[]; known: string[]; onChange: (t: string[]) => void }) {
  const [v, setV] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(/[,\s]+/).map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);
    if (parts.length) onChange([...new Set([...tags, ...parts])]);
    setV("");
  };
  const offer = known.filter((t) => !tags.includes(t)).slice(0, 8);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 px-2 py-1.5" style={{ ...field, height: "auto", padding: "6px 8px" }}>
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 pl-2.5 pr-1" style={{ height: 28, borderRadius: 999, background: TINT, color: C.text, fontSize: 13 }}>
            #{t}
            <button type="button" aria-label={`Убрать тег ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-[#1D1D21]" style={{ color: C.text2 }}>
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(v);
            }
          }}
          onBlur={() => add(v)}
          placeholder={tags.length ? "+ тег" : "Теги через запятую"}
          className="min-w-[120px] flex-1 bg-transparent px-1.5 outline-none placeholder:text-[#5E6068]"
          style={{ fontSize: 14, color: C.text, height: 30 }}
        />
      </div>
      {offer.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {offer.map((t) => (
            <button key={t} type="button" onClick={() => onChange([...tags, t])} className="px-2.5 transition-colors hover:text-[#F4F5F7]" style={{ height: 26, borderRadius: 999, boxShadow: `inset 0 0 0 1px ${C.line}`, fontSize: 12, color: C.text3 }}>
              #{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Rating({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-label={`Оценка ${n}`} onClick={() => onChange(value === n ? undefined : n)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[#19191C]">
          <Star size={16} strokeWidth={1.75} color={(value ?? 0) >= n ? C.accent : C.text3} fill={(value ?? 0) >= n ? C.accent : "none"} />
        </button>
      ))}
    </span>
  );
}

/**
 * The fields of a library item. `commit` is called with each change: an editor dialog collects
 * them and saves once; the inline detail pane writes them straight away (like the real card).
 */
export function LibraryFields({ f, set, known, compact, minimal }: { f: LibraryDraft; set: (p: Partial<LibraryDraft>, persistNow?: boolean) => void; known: string[]; compact?: boolean; minimal?: boolean }) {
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverUrl, setCoverUrl] = useState("");
  const fake: LibraryItem = { ...f, id: "x", createdAt: "", updatedAt: "" };
  return (
    <div className="flex flex-col gap-5">
      <div className={compact ? "flex flex-col gap-4" : "grid gap-4"} style={compact ? undefined : { gridTemplateColumns: "200px minmax(0,1fr)" }}>
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Cover item={fake} radius={16} ratio={compact ? "2 / 1" : "16 / 11"} />
            {f.coverUrl && (
              <button type="button" title="Убрать обложку" aria-label="Убрать обложку" onClick={() => set({ coverUrl: undefined }, true)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full" style={{ background: "rgba(18,18,20,0.75)", color: C.text, backdropFilter: "blur(6px)" }}>
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </div>
          {coverOpen ? (
            <input
              autoFocus
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && coverUrl.trim()) {
                  set({ coverUrl: coverUrl.trim() }, true);
                  setCoverUrl("");
                  setCoverOpen(false);
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setCoverOpen(false);
                }
              }}
              placeholder="Ссылка на картинку, Enter"
              className="outline-none placeholder:text-[#5E6068]"
              style={{ ...field, height: 36, fontSize: 13 }}
            />
          ) : (
            <button type="button" onClick={() => setCoverOpen(true)} className="self-start px-3 transition-colors hover:bg-[#19191C]" style={{ height: 32, borderRadius: 999, fontSize: 13, color: C.text2 }}>
              Обложка по ссылке
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {!minimal && <input value={f.title} onChange={(e) => set({ title: e.target.value })} onBlur={() => set({}, true)} placeholder="Название" className="outline-none placeholder:text-[#5E6068]" style={{ ...field, height: 52, fontSize: 16 }} />}
          <input value={f.author ?? ""} onChange={(e) => set({ author: e.target.value || undefined })} onBlur={() => set({}, true)} placeholder="Автор, канал, источник" className="outline-none placeholder:text-[#5E6068]" style={field} />
          <div className="flex items-center gap-2">
            <input
              value={f.url ?? ""}
              onChange={(e) => set({ url: e.target.value || undefined })}
              onBlur={() => set({}, true)}
              placeholder="Ссылка"
              className="min-w-0 flex-1 outline-none placeholder:text-[#5E6068]"
              style={field}
            />
            {f.url && (
              <IconBtn title="Открыть источник" onClick={() => window.open(f.url, "_blank", "noopener")}>
                <ExternalLink {...SM} />
              </IconBtn>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col">
        <span style={fieldLabel}>Тип</span>
        <div className="flex flex-wrap gap-1.5">
          {LIBRARY_TYPE_ORDER.map((t) => {
            const I = TYPE_ICON[t];
            return (
              <Choice key={t} on={f.type === t} onClick={() => set({ type: t }, true)}>
                <I size={14} strokeWidth={1.75} />
                {LIBRARY_TYPES[t].label}
              </Choice>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col">
          <span style={fieldLabel}>Статус</span>
          <div className="flex flex-wrap gap-1.5">
            {LIBRARY_STATUS_ORDER.map((s) => (
              <Choice key={s} on={f.status === s} onClick={() => set({ status: s }, true)}>
                <span style={{ width: 6, height: 6, borderRadius: 9, background: s === "done" ? C.green : s === "doing" ? C.accent : C.text3 }} />
                {s === "done" ? LIBRARY_TYPES[f.type].done : LIBRARY_STATUSES[s].label}
              </Choice>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Rating value={f.rating} onChange={(v) => set({ rating: v }, true)} />
          <button
            type="button"
            onClick={() => set({ favorite: !f.favorite }, true)}
            className="inline-flex items-center gap-2 px-3.5 transition-colors"
            style={{ height: 36, borderRadius: 999, fontSize: 14, background: f.favorite ? TINT : "transparent", boxShadow: f.favorite ? "none" : `inset 0 0 0 1px ${C.line}`, color: f.favorite ? C.text : C.text2 }}
          >
            <Heart size={14} strokeWidth={1.75} color={f.favorite ? C.accent : C.text3} fill={f.favorite ? C.accent : "none"} />
            {f.favorite ? "В избранном" : "В избранное"}
          </button>
        </div>
      </div>

      <label className="flex flex-col">
        <span style={fieldLabel}>О чём</span>
        <textarea
          value={f.description ?? ""}
          onChange={(e) => set({ description: e.target.value || undefined })}
          onBlur={() => set({}, true)}
          rows={compact ? 3 : 2}
          placeholder="Пара строк о материале"
          className="resize-none bg-transparent outline-none placeholder:text-[#5E6068]"
          style={{ ...field, height: "auto", padding: "12px 14px", lineHeight: 1.45 }}
        />
      </label>

      <div className="flex flex-col">
        <span style={fieldLabel}>Теги</span>
        <TagsField tags={f.tags} known={known} onChange={(tags) => set({ tags }, true)} />
      </div>

      {!minimal && (
      <label className="flex flex-col">
        <span style={fieldLabel}>Мои заметки · markdown</span>
        <textarea
          value={f.notes}
          onChange={(e) => set({ notes: e.target.value })}
          onBlur={() => set({}, true)}
          rows={compact ? 8 : 5}
          placeholder="Мысли, цитаты, что забрать себе"
          className="resize-y bg-transparent outline-none placeholder:text-[#5E6068]"
          style={{ ...field, height: "auto", padding: "12px 14px", lineHeight: 1.55, fontSize: 14 }}
        />
      </label>
      )}
    </div>
  );
}

/** Dialog editor (create or edit) — collects changes, «Сохранить» writes them. */
export function LibraryEditor({ k, item, draft, onClose }: { k: Knowledge; item?: LibraryItem; draft?: LibraryDraft; onClose: () => void }) {
  const [f, setF] = useState<LibraryDraft>(() => (item ? toDraft(item) : draft ?? blankDraft()));
  const set = (p: Partial<LibraryDraft>) => setF((c) => ({ ...c, ...p }));
  const save = () => {
    if (!f.title.trim() && !f.url) return;
    const url = f.url?.trim() || undefined;
    let domain = f.domain;
    try {
      domain = url ? new URL(url).hostname.replace(/^www\./, "") : undefined;
    } catch {
      /* keep */
    }
    const next = { ...f, url, domain, title: f.title.trim() || domain || "Без названия" };
    if (item) k.lib.update(item.id, next);
    else k.lib.add({ ...next, type: f.type ?? (url ? detectType(url) : "article") });
    onClose();
  };
  return (
    <Modal
      title={item ? "Материал" : "Новый материал"}
      label="Материал"
      onClose={onClose}
      width={720}
      footer={
        <>
          {item ? (
            <DeleteBtn
              onClick={() => {
                k.lib.remove(item);
                onClose();
              }}
            />
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {item && (
              <span className="mr-2 hidden whitespace-nowrap md:inline" style={{ ...T.foot, color: C.text3 }}>
                Добавлено {dateLabel(item.createdAt)}
              </span>
            )}
            <Btn kind="ghost" onClick={onClose}>
              Отмена
            </Btn>
            <Btn onClick={save} disabled={!f.title.trim() && !f.url}>
              Сохранить
            </Btn>
          </div>
        </>
      }
    >
      <LibraryFields f={f} set={set} known={k.lib.tags} />
    </Modal>
  );
}

/** Prev/next for flipping through a list in the reading view; a missing handler = the end. */
export interface LibraryNav {
  onPrev?: () => void;
  onNext?: () => void;
  /** «3 / 12». */
  label?: string;
}

function NavBtn({ title, onClick, children }: { title: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={!onClick}
      onClick={onClick}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors duration-150 enabled:hover:bg-[#1D1D21] enabled:hover:text-[#F4F5F7] disabled:opacity-30"
      style={{ color: C.text2 }}
    >
      {children}
    </button>
  );
}

/** Textarea that grows with its text — a plain line of writing, no box around it. */
function GrowText({ value, onChange, onBlur, placeholder, style, autoFocus }: { value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string; style?: CSSProperties; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className="w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-[#5E6068]"
      style={{ color: C.text, ...style }}
    />
  );
}

/**
 * An opened library item, minimal: the close checkbox and three quiet actions on top, then the
 * title, where it's from, what it's about and your notes — click any text to edit, it saves when
 * you leave the field. Type, status, rating, tags and cover stay folded under «Подробнее».
 */
export function LibraryView({ k, item, onClose, nav }: { k: Knowledge; item: LibraryItem; onClose: () => void; nav?: LibraryNav }) {
  const [f, setF] = useState<LibraryDraft>(() => toDraft(item));
  const [more, setMore] = useState(false);
  const fRef = useRef(f);
  const dirty = useRef(new Set<keyof LibraryDraft>());
  const itemRef = useRef(item);
  itemRef.current = item;
  // The checkbox (or an undo toast) can change the status while the sheet is open — follow it.
  useEffect(() => {
    if (fRef.current.status === item.status) return;
    fRef.current = { ...fRef.current, status: item.status };
    setF(fRef.current);
  }, [item.status]);

  /** Sends only the fields edited here that differ from the saved item. */
  const commit = useCallback(() => {
    const cur = itemRef.current;
    const next = fRef.current;
    const patch: Partial<LibraryDraft> = {};
    dirty.current.forEach((key) => {
      if (JSON.stringify(next[key]) !== JSON.stringify(cur[key])) (patch as Record<string, unknown>)[key] = next[key];
    });
    dirty.current.clear();
    if ("title" in patch && !patch.title?.trim()) delete patch.title; // a title is required — keep the old one
    if ("url" in patch) {
      const url = patch.url?.trim() || undefined;
      patch.url = url;
      try {
        patch.domain = url ? new URL(url).hostname.replace(/^www\./, "") : undefined;
      } catch {
        /* not a full URL — leave the domain */
      }
    }
    if (Object.keys(patch).length) k.lib.update(cur.id, patch);
  }, [k.lib]);

  const set = (p: Partial<LibraryDraft>, now?: boolean) => {
    (Object.keys(p) as (keyof LibraryDraft)[]).forEach((key) => dirty.current.add(key));
    fRef.current = { ...fRef.current, ...p };
    setF(fRef.current);
    if (now) commit();
  };

  const close = useCallback(() => {
    commit();
    onClose();
  }, [commit, onClose]);

  // ← → flip through the list without closing (edits are saved first). Not while typing.
  const layer = useRef<object | null>(null);
  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (!layer.current || !isTop(layer.current)) return;
      const t = e.target as HTMLElement | null;
      if ((t && t.closest("input, textarea, [contenteditable=true]")) || e.metaKey || e.ctrlKey || e.altKey) return;
      const go = e.key === "ArrowLeft" ? navRef.current?.onPrev : navRef.current?.onNext;
      if (!go) return;
      e.preventDefault();
      commit();
      go();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [commit]);
  const flip = (go: () => void) => () => {
    commit();
    go();
  };

  const done = item.status === "done";
  const source = [item.domain, item.author].filter(Boolean).join(" · ");
  return (
    <Sheet label="Материал" onClose={close} width={820} layerRef={layer}>
      <div className="flex items-center gap-3 pl-5 pr-3 pt-4 sm:pl-10 sm:pr-4" style={{ minHeight: 56 }}>
        <SeenCheck item={item} onToggle={() => k.lib.setClosed(item, !done)} size={24} />
        <span className="min-w-0 flex-1 truncate" style={{ ...T.foot, color: C.text3 }}>
          {done ? "Закрыто" : item.status === "doing" ? "В процессе" : LIBRARY_TYPES[item.type].label}
        </span>
        {nav ? (
          <span className="flex shrink-0 items-center">
            <NavBtn title="Предыдущий (←)" onClick={nav.onPrev ? flip(nav.onPrev) : undefined}>
              <ChevronLeft {...ICON} />
            </NavBtn>
            {nav.label && (
              <span className="min-w-[44px] text-center" style={{ ...T.foot, ...T.num, fontWeight: 400, color: C.text3 }}>
                {nav.label}
              </span>
            )}
            <NavBtn title="Следующий (→)" onClick={nav.onNext ? flip(nav.onNext) : undefined}>
              <ChevronRight {...ICON} />
            </NavBtn>
          </span>
        ) : (
          <span className="mr-2 hidden shrink-0 whitespace-nowrap sm:inline" style={{ ...T.foot, color: C.text3 }}>
            {dateLabel(item.createdAt)}
          </span>
        )}
        <RowAct
          title="Удалить"
          danger
          onClick={() => {
            k.lib.remove(item);
            onClose();
          }}
        >
          <Trash2 {...SM} />
        </RowAct>
        <RowAct title="Закрыть окно" onClick={close}>
          <X {...ICON} />
        </RowAct>
      </div>
      <div className="kn-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[680px] px-5 pb-16 pt-4 sm:px-10">
          <div className="mb-7">
            <Cover item={item} ratio="16 / 9" radius={18} />
          </div>
          <GrowText
            value={f.title}
            onChange={(title) => set({ title })}
            onBlur={commit}
            placeholder="Название"
            style={{ fontSize: 30, lineHeight: 1.2, fontWeight: 500, letterSpacing: "-0.03em" }}
          />
          {(source || item.url) && (
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2" style={{ ...T.body, color: C.text3 }}>
              {source && (
                <span className="flex min-w-0 items-center gap-2">
                  {item.domain && <Favicon domain={item.domain} size={16} radius={4} />}
                  <span className="truncate">{source}</span>
                </span>
              )}
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 transition-colors hover:text-[#F4F5F7]" style={{ color: "#5AA9FF" }}>
                  <ExternalLink size={14} strokeWidth={1.75} />
                  Открыть источник
                </a>
              )}
            </div>
          )}
          {item.description && !more && (
            <p className="mt-6" style={{ fontSize: 15, lineHeight: 1.6, color: C.text2 }}>
              {item.description}
            </p>
          )}
          <div className="mt-8">
            <GrowText value={f.notes} onChange={(notes) => set({ notes })} onBlur={commit} placeholder="Мои заметки…" style={{ fontSize: 15, lineHeight: 1.65, minHeight: 120 }} />
          </div>
          <button type="button" onClick={() => setMore((m) => !m)} className="mt-8 inline-flex items-center gap-1.5 transition-colors hover:text-[#F4F5F7]" style={{ ...T.body, color: C.text3 }}>
            Подробнее
            <ChevronDown size={14} strokeWidth={1.75} style={{ transform: more ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
          </button>
          {more && (
            <div className="mt-5">
              <LibraryFields f={f} set={set} known={k.lib.tags} compact minimal />
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

// ── Notes: editor, pane, dialog ────────────────────────────────────────────────────────────────

function TB({ on, disabled, onClick, title, children }: { on?: boolean; disabled?: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-30 ${on ? "" : "hover:bg-[#26262B]"}`}
      style={{ background: on ? TINT : undefined, color: on ? "#5AA9FF" : C.text2 }}
    >
      {children}
    </button>
  );
}

/**
 * Formatting appears only over a selection — the open note stays a clean page. Blocks also come
 * from typing: «# » heading, «- » list, «[ ] » checkbox, «> » quote, «```» code, «---» divider.
 */
function SelectionBar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      bullet: e.isActive("bulletList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
    }),
  });
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("");
  const c = () => editor.chain().focus();
  const sep = <span className="mx-1 shrink-0" style={{ width: 1, height: 16, background: C.line2 }} />;
  const apply = () => {
    const url = href.trim();
    setLinking(false);
    setHref("");
    if (!url) return;
    const h = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
    c().extendMarkRange("link").setLink({ href: h }).run();
  };
  return (
    <div className="flex items-center gap-0.5 p-1" style={{ borderRadius: 999, background: C.raise, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 12px 32px rgba(0,0,0,0.5)` }}>
      {linking ? (
        <input
          autoFocus
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
            if (e.key === "Escape") {
              e.stopPropagation();
              setLinking(false);
            }
          }}
          onBlur={() => setLinking(false)}
          placeholder="https://… и Enter"
          className="w-[220px] bg-transparent px-3 outline-none placeholder:text-[#5E6068]"
          style={{ height: 32, fontSize: 13, color: C.text }}
        />
      ) : (
        <>
          <TB title="Заголовок" on={s.h1} onClick={() => c().toggleHeading({ level: 1 }).run()}>
            <Heading1 {...SM} />
          </TB>
          <TB title="Подзаголовок" on={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
            <Heading2 {...SM} />
          </TB>
          {sep}
          <TB title="Жирный" on={s.bold} onClick={() => c().toggleBold().run()}>
            <Bold {...SM} />
          </TB>
          <TB title="Курсив" on={s.italic} onClick={() => c().toggleItalic().run()}>
            <Italic {...SM} />
          </TB>
          <TB title="Зачёркнутый" on={s.strike} onClick={() => c().toggleStrike().run()}>
            <Strikethrough {...SM} />
          </TB>
          <TB title="Код" on={s.code} onClick={() => c().toggleCode().run()}>
            <Code {...SM} />
          </TB>
          <TB title={s.link ? "Убрать ссылку" : "Ссылка"} on={s.link} onClick={() => (s.link ? c().extendMarkRange("link").unsetLink().run() : setLinking(true))}>
            <Link2 {...SM} />
          </TB>
          {sep}
          <TB title="Список" on={s.bullet} onClick={() => c().toggleBulletList().run()}>
            <List {...SM} />
          </TB>
          <TB title="Чек-лист" on={s.task} onClick={() => c().toggleTaskList().run()}>
            <ListTodo {...SM} />
          </TB>
          <TB title="Цитата" on={s.quote} onClick={() => c().toggleBlockquote().run()}>
            <Quote {...SM} />
          </TB>
        </>
      )}
    </div>
  );
}

/** Rich-text body that speaks markdown — the real editor's extensions. Mount with key={note.id}. */
export function NoteBody({ initial, onChange, onOpenNote, autoFocus }: { initial: string; onChange: (md: string) => void; onOpenNote?: (id: string) => void; autoFocus?: boolean }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, defaultProtocol: "https" } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Placeholder.configure({ placeholder: ({ node }) => (node.type.name === "heading" ? "Заголовок" : "Пишите…") }),
      Markdown,
    ],
    content: initial,
    contentType: "markdown",
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: { class: "note-prose kn-prose", spellcheck: "true" },
      handleClick: (_v, _p, event) => {
        const href = (event.target as HTMLElement).closest("a")?.getAttribute("href");
        if (!href) return false;
        const m = href.match(/^#note-(.+)$/);
        if (m) {
          onOpenNote?.(m[1]);
          return true;
        }
        if (event.ctrlKey || event.metaKey) {
          window.open(href, "_blank", "noopener");
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getMarkdown()),
  });
  if (!editor) return null;
  return (
    <div className="kn-scroll relative min-h-0 flex-1 cursor-text overflow-y-auto" onClick={(e) => e.target === e.currentTarget && editor.chain().focus("end").run()}>
      <BubbleMenu editor={editor} shouldShow={({ editor: e, state }) => !state.selection.empty && !e.isActive("codeBlock")} style={{ zIndex: 60 }}>
        <SelectionBar editor={editor} />
      </BubbleMenu>
      <EditorContent editor={editor} />
    </div>
  );
}

/** Folder picker popover — «Переместить в…». */
export function MoveMenu({ k, entry, align = "right" }: { k: Knowledge; entry: NoteEntry; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  const targets = [...k.vault.folders]
    .filter((f) => f.id !== entry.parentId && canMoveInto(k.vault.entries, entry.id, f.id))
    .sort((a, b) => folderPath(k.vault.entries, a.id).concat(noteTitle(a)).localeCompare(folderPath(k.vault.entries, b.id).concat(noteTitle(b)), "ru"));
  if (targets.length === 0 && entry.parentId === null) return null;
  return (
    <div ref={ref} className="relative">
      <RowAct title="Переместить в папку" onClick={() => setOpen((o) => !o)}>
        <FolderInput {...SM} />
      </RowAct>
      {open && (
        <div
          className="kn-scroll absolute z-40 flex max-h-80 flex-col overflow-y-auto p-2"
          style={{ top: 40, [align]: 0, width: 280, background: C.panel, borderRadius: R.card, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 24px 60px rgba(0,0,0,0.55)` }}
        >
          <div className="px-3 pb-2 pt-1" style={{ ...T.foot, color: C.text3 }}>
            Переместить в
          </div>
          {entry.parentId !== null && (
            <MenuRow
              icon={<NotebookPen {...SM} />}
              onClick={() => {
                k.vault.move(entry.id, null);
                setOpen(false);
              }}
            >
              Все заметки (корень)
            </MenuRow>
          )}
          {targets.map((f) => {
            const p = folderPath(k.vault.entries, f.id);
            return (
              <MenuRow
                key={f.id}
                icon={<Folder {...SM} />}
                onClick={() => {
                  k.vault.move(entry.id, f.id);
                  setOpen(false);
                }}
              >
                <span className="truncate">{noteTitle(f)}</span>
                {p && <span className="ml-auto truncate pl-2" style={{ ...T.foot, color: C.text3, maxWidth: 110 }}>{p}</span>}
              </MenuRow>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MenuRow({ icon, children, onClick, danger }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full min-w-0 items-center gap-2.5 px-3 text-left transition-colors hover:bg-[#19191C]" style={{ height: 40, borderRadius: R.small, fontSize: 14, color: danger ? TONE.red.fg : C.text }}>
      {icon && <span className="shrink-0" style={{ color: danger ? TONE.red.fg : C.text2 }}>{icon}</span>}
      {children}
    </button>
  );
}

/** Open overlays, newest last — Esc (and the reading view's arrows) belong to the top one only. */
const layers: object[] = [];
const isTop = (id: object) => layers[layers.length - 1] === id;

/** Registers an overlay layer for as long as the component is mounted; returns its id. */
function useLayer() {
  const [id] = useState(() => ({}));
  useEffect(() => {
    layers.push(id);
    return () => {
      const i = layers.indexOf(id);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [id]);
  return id;
}

/** Esc closes the top overlay only — a sheet opened over another closes alone. */
function useEsc(onClose: () => void) {
  const id = useLayer();
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTop(id)) ref.current();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [id]);
  return id;
}

/** The quiet page an opened item sits on: dim backdrop, one plain sheet, no frame around content. */
export function Sheet({ label, onClose, children, width = 820, layerRef }: { label: string; onClose: () => void; children: ReactNode; width?: number; layerRef?: { current: object | null } }) {
  const layer = useEsc(onClose);
  if (layerRef) layerRef.current = layer;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={label}
        className="flex w-full flex-col"
        style={{ maxWidth: width, height: "min(88vh, 920px)", background: C.panel, borderRadius: R.page, boxShadow: `0 30px 80px rgba(0,0,0,0.6)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * An opened note, minimal: a quiet path line with three actions, the title, the text. Formatting
 * shows up over a selection only.
 */
export function NoteDialog({ k, noteId, onClose, onOpen, onFolder, fresh }: { k: Knowledge; noteId: string; onClose: () => void; onOpen: (id: string) => void; onFolder?: (id: string | null) => void; fresh?: boolean }) {
  const note = k.vault.entries.find((e) => e.id === noteId);
  const titleRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => {
    k.vault.discard(noteId); // a new note closed untouched leaves nothing behind
    onClose();
  }, [k.vault, noteId, onClose]);
  useEffect(() => {
    if (fresh) titleRef.current?.focus();
  }, [fresh, noteId]);
  if (!note) return null;
  const chain = pathOf(k.vault.entries, note.id);
  const toFolder = (id: string | null) => {
    onFolder?.(id);
    close();
  };
  return (
    <Sheet label="Заметка" onClose={close}>
      <div className="flex items-center gap-2 pl-10 pr-4 pt-4" style={{ minHeight: 56 }}>
        <nav className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden" style={{ ...T.foot, color: C.text3 }} aria-label="Путь">
          <button type="button" className="shrink-0 hover:text-[#F4F5F7]" onClick={() => toFolder(null)}>
            Конспекты
          </button>
          {chain.map((f) => (
            <span key={f.id} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight size={12} strokeWidth={1.75} className="shrink-0" />
              <button type="button" className="truncate hover:text-[#F4F5F7]" onClick={() => toFolder(f.id)}>
                {noteTitle(f)}
              </button>
            </span>
          ))}
        </nav>
        <span className="mr-2 hidden shrink-0 whitespace-nowrap sm:inline" style={{ ...T.foot, color: C.text3 }}>
          {dateLabel(note.updatedAt)}
        </span>
        <MoveMenu k={k} entry={note} />
        <RowAct
          title="Удалить заметку"
          danger
          onClick={() => {
            k.vault.remove(note.id);
            onClose();
          }}
        >
          <Trash2 {...SM} />
        </RowAct>
        <RowAct title="Закрыть" onClick={close}>
          <X {...ICON} />
        </RowAct>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-[680px] flex-1 flex-col px-10">
        <input
          ref={titleRef}
          value={note.title}
          onChange={(e) => k.vault.update(note.id, { title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "ArrowDown") {
              e.preventDefault();
              (document.querySelector(".kn-prose") as HTMLElement | null)?.focus();
            }
          }}
          placeholder={UNTITLED}
          className="mb-5 mt-6 w-full shrink-0 bg-transparent outline-none placeholder:text-[#5E6068]"
          style={{ fontSize: 32, lineHeight: 1.15, fontWeight: 500, letterSpacing: "-0.03em", color: C.text }}
        />
        <NoteBody key={note.id} initial={note.content} onChange={(content) => k.vault.update(note.id, { content })} onOpenNote={(id) => k.vault.entries.find((e) => e.id === id)?.kind === "note" && onOpen(id)} />
      </div>
    </Sheet>
  );
}

/** Small dialog: name a new folder / rename one. */
export function NameDialog({ title, initial = "", placeholder, onSave, onClose }: { title: string; initial?: string; placeholder: string; onSave: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(initial);
  const save = () => {
    if (!v.trim()) return;
    onSave(v.trim());
    onClose();
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={460}
      footer={
        <>
          <span />
          <div className="flex gap-2">
            <Btn kind="ghost" onClick={onClose}>
              Отмена
            </Btn>
            <Btn onClick={save} disabled={!v.trim()}>
              Сохранить
            </Btn>
          </div>
        </>
      }
    >
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder={placeholder} className="outline-none placeholder:text-[#5E6068]" style={{ ...field, height: 52, fontSize: 16 }} />
    </Modal>
  );
}

/** Small confirm for destructive actions that take more than one thing with them. */
export function ConfirmDialog({ title, text, confirm = "Удалить", onConfirm, onClose }: { title: string; text?: ReactNode; confirm?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={460}
      footer={
        <>
          <span />
          <div className="flex gap-2">
            <Btn kind="ghost" onClick={onClose}>
              Отмена
            </Btn>
            <Btn
              kind="danger"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {confirm}
            </Btn>
          </div>
        </>
      }
    >
      {text && <p style={{ ...T.body, color: C.text2, lineHeight: 1.5 }}>{text}</p>}
    </Modal>
  );
}

// ── Vault rows ─────────────────────────────────────────────────────────────────────────────────

/** Wraps every occurrence of `q` in a soft blue highlight. */
export function Highlight({ text, q }: { text: string; q?: string }) {
  const needle = (q ?? "").trim();
  if (!needle) return <>{text}</>;
  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === needle.toLowerCase() ? (
          <mark key={i} style={{ background: "rgba(10,132,255,0.28)", color: C.text, borderRadius: 3 }}>
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

/** One note row: title, one-line snippet, path, date on the right (trash on hover). Drag it onto a folder to move. */
export function NoteRow({ k, n, on, onOpen, q, showPath = true, onDelete, draggable }: { k: Knowledge; n: NoteEntry; on?: boolean; onOpen: () => void; q?: string; showPath?: boolean; onDelete?: () => void; draggable?: boolean }) {
  const text = snippet(n.content, q ?? "", 140).replace(/\\([[\]\\*_#`>~-])/g, "$1");
  const path = showPath ? folderPath(k.vault.entries, n.id) : "";
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-kn-entry", n.id);
        e.dataTransfer.setData("text/plain", n.title);
      }}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen()}
      className={`group flex cursor-pointer items-start gap-3 px-4 py-3.5 outline-none transition-colors duration-150 ${on ? "" : "hover:bg-[#17171A]"}`}
      style={{ ...dashed, background: on ? TINT : undefined }}
    >
      <FileText size={16} strokeWidth={1.75} color={on ? C.accent : C.text3} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3" style={{ minHeight: 20 }}>
          <span className="min-w-0 flex-1 truncate" style={{ ...T.body, fontSize: 15, fontWeight: 500, color: n.title ? C.text : C.text2 }}>
            <Highlight text={noteTitle(n)} q={q} />
          </span>
          <span className={`shrink-0 ${onDelete ? "group-hover:hidden" : ""}`} style={{ ...T.foot, color: C.text3 }}>
            {dateLabel(n.updatedAt)}
          </span>
          {onDelete && (
            <span className="-my-1.5 hidden shrink-0 group-hover:inline-flex">
              <RowAct title="Удалить заметку" danger onClick={onDelete}>
                <Trash2 size={14} strokeWidth={1.75} />
              </RowAct>
            </span>
          )}
        </div>
        {text && (
          <div className="kn-clamp1 mt-1" style={{ ...T.body, fontSize: 13, color: C.text2 }}>
            <Highlight text={text} q={q} />
          </div>
        )}
        {path && (
          <div className="mt-1 truncate" style={{ ...T.foot, color: C.text3 }}>
            {path}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Link shelf ─────────────────────────────────────────────────────────────────────────────────

/** Link editor dialog: label, section, open, delete. */
export function LinkEditor({ k, link, onClose }: { k: Knowledge; link: SavedLink; onClose: () => void }) {
  const [title, setTitle] = useState(link.title ?? "");
  const [section, setSection] = useState<string>(link.sectionId ?? "");
  const save = () => {
    if ((link.title ?? "") !== title.trim()) k.links.rename(link.id, title);
    const target = section || null;
    if (target !== (link.sectionId ?? null)) k.links.move(link.id, target, nextPosition(linksOfSection(k.links.shelf.links, target)));
    onClose();
  };
  return (
    <Modal
      title="Ссылка"
      onClose={onClose}
      width={520}
      footer={
        <>
          <DeleteBtn
            onClick={() => {
              k.links.remove(link.id);
              onClose();
            }}
          />
          <div className="flex gap-2">
            <Btn kind="ghost" onClick={onClose}>
              Отмена
            </Btn>
            <Btn onClick={save}>Сохранить</Btn>
          </div>
        </>
      }
    >
      <LinkFields k={k} link={link} title={title} setTitle={setTitle} section={section} setSection={setSection} onEnter={save} />
    </Modal>
  );
}

export function LinkFields({ k, link, title, setTitle, section, setSection, onEnter, onBlur }: { k: Knowledge; link: SavedLink; title: string; setTitle: (v: string) => void; section: string; setSection: (v: string) => void; onEnter?: () => void; onBlur?: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 p-4" style={{ borderRadius: R.inner, background: C.card }}>
        <Favicon domain={link.domain} size={52} radius={14} />
        <div className="min-w-0 flex-1">
          <div className="truncate" style={{ ...T.cell, fontWeight: 500 }}>
            {link.domain}
          </div>
          <a href={link.url} target="_blank" rel="noreferrer" className="mt-1 block truncate hover:underline" style={{ ...T.foot, color: "#5AA9FF" }}>
            {link.url}
          </a>
        </div>
        <Btn size={40} icon={<ExternalLink {...SM} />} onClick={() => window.open(link.url, "_blank", "noopener")}>
          Открыть
        </Btn>
      </div>
      <label className="flex flex-col">
        <span style={fieldLabel}>Название</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={onBlur} onKeyDown={(e) => e.key === "Enter" && onEnter?.()} placeholder={link.domain} className="outline-none placeholder:text-[#5E6068]" style={{ ...field, height: 52, fontSize: 16 }} />
      </label>
      <div className="flex flex-col">
        <span style={fieldLabel}>Секция</span>
        <div className="flex flex-wrap gap-1.5">
          <Choice on={section === ""} onClick={() => setSection("")}>
            Без секции
          </Choice>
          {k.links.sections.map((s) => (
            <Choice key={s.id} on={section === s.id} onClick={() => setSection(s.id)}>
              {s.name}
            </Choice>
          ))}
        </div>
      </div>
      <div style={{ ...T.foot, color: C.text3 }}>Добавлено {dateLabel(link.createdAt)}</div>
    </div>
  );
}

// ── Misc ───────────────────────────────────────────────────────────────────────────────────────

export function libStats(items: LibraryItem[]) {
  const s = { want: 0, doing: 0, done: 0 } as Record<LibraryStatus, number>;
  items.forEach((i) => (s[i.status] += 1));
  return s;
}

export { plural, LIBRARY_TYPES };
export type { LibraryItem, LinkSection, SavedLink };
