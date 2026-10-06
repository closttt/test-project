import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/store/ToastProvider";
import { uid } from "@/lib/id";
import {
  fetchNotes,
  insertNotes,
  updateNote,
  deleteNotes,
  notesUseCloud,
  subtreeIds,
  type NoteEntry,
  type NoteKind,
  type NotePatch,
} from "@/lib/knowledgeNotes";

/** Typing writes to the cloud at most this often per note; the UI itself updates instantly. */
const SAVE_DEBOUNCE_MS = 700;

export interface NotesState {
  entries: NoteEntry[];
  loading: boolean;
  /** Non-fatal: shown in-panel («SQL ещё не выполнен, работаем локально»). */
  error: string | null;
  cloud: boolean;
  /** True while a debounced write is waiting or in flight. */
  saving: boolean;
  create: (kind: NoteKind, parentId: string | null, title?: string) => NoteEntry;
  update: (id: string, patch: NotePatch) => void;
  /** Deletes the entry and everything inside it, with an undo toast. */
  remove: (id: string) => void;
  importEntries: (added: NoteEntry[]) => void;
}

export function useNotes(): NotesState {
  const { toast } = useToast();
  const [entries, setEntriesState] = useState<NoteEntry[]>([]);
  // The latest list for writes that happen after an await or a debounce — never a stale closure.
  const ref = useRef<NoteEntry[]>([]);
  const setEntries = useCallback((next: NoteEntry[] | ((cur: NoteEntry[]) => NoteEntry[])) => {
    ref.current = typeof next === "function" ? next(ref.current) : next;
    setEntriesState(ref.current);
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pending patches per note id, flushed after SAVE_DEBOUNCE_MS of quiet (or on unmount).
  const pending = useRef(new Map<string, NotePatch & { updatedAt: string }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fail = useCallback((e: unknown) => {
    toast(e instanceof Error ? e.message : String(e));
  }, [toast]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = [...pending.current.entries()];
    pending.current.clear();
    try {
      await Promise.all(batch.map(([id, patch]) => updateNote(ref.current, id, patch)));
    } catch (e) {
      fail(e);
    } finally {
      if (pending.current.size === 0) setSaving(false);
    }
  }, [fail]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchNotes();
        if (alive) { setEntries(list); setError(null); }
      } catch (e) {
        // fetchNotes has already fallen back to the local copy — load that.
        const list = await fetchNotes().catch(() => []);
        if (alive) { setEntries(list); setError(e instanceof Error ? e.message : String(e)); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    const onHide = () => { if (pending.current.size) void flush(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      alive = false;
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      if (pending.current.size) void flush();
    };
  }, [setEntries, flush]);

  const create = useCallback((kind: NoteKind, parentId: string | null, title = "") => {
    const now = new Date().toISOString();
    const entry: NoteEntry = { id: uid(), kind, parentId, title, content: "", createdAt: now, updatedAt: now };
    setEntries((cur) => [...cur, entry]);
    insertNotes(ref.current, [entry]).catch((e) => {
      setEntries((cur) => cur.filter((x) => x.id !== entry.id));
      fail(e);
    });
    return entry;
  }, [setEntries, fail]);

  const update = useCallback((id: string, patch: NotePatch) => {
    const updatedAt = new Date().toISOString();
    setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, ...patch, updatedAt } : e)));
    pending.current.set(id, { ...pending.current.get(id), ...patch, updatedAt });
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  }, [setEntries, flush]);

  const remove = useCallback((id: string) => {
    const ids = subtreeIds(ref.current, id);
    const removed = ref.current.filter((e) => ids.has(e.id));
    const target = removed.find((e) => e.id === id);
    if (!target) return;
    ids.forEach((x) => pending.current.delete(x));
    setEntries((cur) => cur.filter((e) => !ids.has(e.id)));
    deleteNotes(ref.current, [...ids])
      .then(() => {
        const what = target.kind === "folder" ? `Папка «${target.title}» удалена` : "Заметка удалена";
        toast(what, {
          actionLabel: "Вернуть",
          onAction: () => {
            setEntries((cur) => [...cur, ...removed]);
            insertNotes(ref.current, removed).catch(fail);
          },
        });
      })
      .catch((e) => {
        setEntries((cur) => [...cur, ...removed]);
        fail(e);
      });
  }, [setEntries, toast, fail]);

  const importEntries = useCallback((added: NoteEntry[]) => {
    if (added.length === 0) return;
    setEntries((cur) => [...cur, ...added]);
    insertNotes(ref.current, added).catch((e) => {
      const ids = new Set(added.map((a) => a.id));
      setEntries((cur) => cur.filter((x) => !ids.has(x.id)));
      fail(e);
    });
  }, [setEntries, fail]);

  return { entries, loading, error, cloud: notesUseCloud(), saving, create, update, remove, importEntries };
}
