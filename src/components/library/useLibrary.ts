import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/store/ToastProvider";
import { pushUndo } from "@/lib/undoStack";
import {
  fetchLibrary,
  addLibraryItem,
  updateLibraryItem,
  removeLibraryItem,
  restoreLibraryItem,
  libraryUsesCloud,
  type LibraryItem,
  type LibraryDraft,
} from "@/lib/library";

export interface LibraryState {
  items: LibraryItem[];
  loading: boolean;
  /** Non-fatal: shown in-panel (e.g. «SQL ещё не выполнен, работаем локально»). */
  error: string | null;
  cloud: boolean;
  reload: () => Promise<void>;
  add: (draft: LibraryDraft) => Promise<LibraryItem | null>;
  update: (id: string, patch: Partial<LibraryDraft>) => Promise<void>;
  /** Deletes with an undo toast (and Ctrl+Z), like every other delete in the app. */
  remove: (item: LibraryItem) => Promise<void>;
}

/**
 * The library's state + mutations, shared by the «Библиотека» tab and anything that adds to it
 * from elsewhere on the page (the «→ в Библиотеку» button on a Telegram card). Every mutation is
 * optimistic on the local list and rolls back with a toast if the cloud write fails.
 */
export function useLibrary(): LibraryState {
  const { toast } = useToast();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchLibrary());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // fetchLibrary has already switched to the local path — a second call can't fail.
      setItems(await fetchLibrary().catch(() => []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const fail = useCallback((e: unknown) => {
    toast(e instanceof Error ? e.message : String(e));
  }, [toast]);

  const add = useCallback(async (draft: LibraryDraft) => {
    try {
      const { items: next, item } = await addLibraryItem(items, draft);
      setItems(next);
      return item;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [items, fail]);

  const update = useCallback(async (id: string, patch: Partial<LibraryDraft>) => {
    const prev = items;
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i)));
    try {
      await updateLibraryItem(prev, id, patch);
    } catch (e) {
      setItems(prev);
      fail(e);
    }
  }, [items, fail]);

  const remove = useCallback(async (item: LibraryItem) => {
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== item.id));
    try {
      await removeLibraryItem(prev, item.id);
    } catch (e) {
      setItems(prev);
      fail(e);
      return;
    }
    const run = pushUndo(`Удалено из библиотеки: ${item.title}`, () => {
      restoreLibraryItem(items.filter((i) => i.id !== item.id), item).then(setItems).catch(fail);
    });
    toast(`Удалено: ${item.title}`, { actionLabel: "Вернуть", onAction: run });
  }, [items, fail, toast]);

  return { items, loading, error, cloud: libraryUsesCloud(), reload, add, update, remove };
}
