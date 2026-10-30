/**
 * «Индекс» · База знаний — the three panels and their quiet data hooks.
 * Same lib functions as the real page; every write is optimistic and a failed write (the lab
 * sandbox, a dropped connection) keeps the change on screen and only greys the sync line.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MutableRefObject, type ReactNode } from "react";

import { useToast } from "@/store/ToastProvider";
import { pushUndo } from "@/lib/undoStack";
import { uid } from "@/lib/id";
import { faviconUrl } from "@/lib/links";
import {
  fetchNotes,
  insertNotes,
  updateNote,
  deleteNotes,
  childrenOf,
  pathOf,
  canMoveInto,
  matchesNoteQuery,
  snippet,
  subtreeIds,
  entriesFromFiles,
  UNTITLED,
  type NoteEntry,
  type NoteKind,
  type NotePatch,
  type ImportFile,
} from "@/lib/knowledgeNotes";
import {
  LIBRARY_TYPES,
  LIBRARY_TYPE_ORDER,
  LIBRARY_STATUSES,
  LIBRARY_STATUS_ORDER,
  matchesLibraryQuery,
  sortLibrary,
  libraryTagCounts,
  linkDrafts,
  unfurl,
  unfurlPatch,
  uploadCover,
  fetchLibrary,
  addLibraryItem,
  updateLibraryItem,
  removeLibraryItem,
  restoreLibraryItem,
  type LibraryItem,
  type LibraryDraft,
  type LibraryType,
  type LibraryStatus,
  type LibrarySort,
} from "@/lib/library";
import {
  fetchShelf,
  addLinks,
  removeLink,
  moveLink,
  addSection,
  renameSection,
  removeSection,
  moveSection,
  linksOfSection,
  positionBetween,
  parseNewLinks,
  nextPosition,
  type SavedLink,
  type LinkSection,
  type LinkShelf,
} from "@/lib/knowledgeLinks";
import { B, T, tab, pad2, Button, KV, Empty, Stats, Dither, Hook, Pixel, Sparkle, CtaBar, hashSeed, plural } from "@/design-lab/screens/_kit/index";
import {
  SearchField,
  Seg,
  TagToggle,
  QuietCheck,
  ActionRow,
  Caps,
  Menu,
  Dots,
  SyncNote,
  Highlight,
  IxEditor,
  TitleField,
  InlineInput,
  SidePanel,
  CloseButton,
  focusProse,
  whenLabel,
  wordCount,
  useQuietSync,
  type SyncState,
} from "./Notes.parts";

function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a convenience, never an error */
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * 01 · Конспекты — data
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

const SAVE_DEBOUNCE_MS = 700;

export interface VaultState {
  entries: NoteEntry[];
  loading: boolean;
  sync: SyncState;
  create: (kind: NoteKind, parentId: string | null, title?: string) => NoteEntry;
  update: (id: string, patch: NotePatch) => void;
  remove: (id: string) => void;
  importEntries: (added: NoteEntry[]) => void;
}

/** useNotes without the red toasts and rollbacks: the screen keeps what you did. */
export function useVault(): VaultState {
  const { toast } = useToast();
  const { state: sync, run } = useQuietSync();
  const [entries, setState] = useState<NoteEntry[]>([]);
  const ref = useRef<NoteEntry[]>([]);
  const setEntries = useCallback((next: NoteEntry[] | ((cur: NoteEntry[]) => NoteEntry[])) => {
    ref.current = typeof next === "function" ? next(ref.current) : next;
    setState(ref.current);
  }, []);
  const [loading, setLoading] = useState(true);
  const pending = useRef(new Map<string, NotePatch & { updatedAt: string }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = [...pending.current.entries()];
    pending.current.clear();
    if (batch.length) void run(Promise.all(batch.map(([id, patch]) => updateNote(ref.current, id, patch))));
  }, [run]);

  useEffect(() => {
    let alive = true;
    fetchNotes()
      .catch(() => fetchNotes().catch(() => [] as NoteEntry[]))
      .then((list) => alive && setEntries(list))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      if (pending.current.size) flush();
    };
  }, [setEntries, flush]);

  const create = useCallback(
    (kind: NoteKind, parentId: string | null, title = "") => {
      const now = new Date().toISOString();
      const entry: NoteEntry = { id: uid(), kind, parentId, title, content: "", createdAt: now, updatedAt: now };
      setEntries((cur) => [...cur, entry]);
      void run(insertNotes(ref.current, [entry]));
      return entry;
    },
    [setEntries, run]
  );

  const update = useCallback(
    (id: string, patch: NotePatch) => {
      const updatedAt = new Date().toISOString();
      setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, ...patch, updatedAt } : e)));
      pending.current.set(id, { ...pending.current.get(id), ...patch, updatedAt });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [setEntries, flush]
  );

  const remove = useCallback(
    (id: string) => {
      const ids = subtreeIds(ref.current, id);
      const removed = ref.current.filter((e) => ids.has(e.id));
      const target = removed.find((e) => e.id === id);
      if (!target) return;
      ids.forEach((x) => pending.current.delete(x));
      setEntries((cur) => cur.filter((e) => !ids.has(e.id)));
      void run(deleteNotes(ref.current, [...ids]));
      const what = target.kind === "folder" ? `Папка «${target.title}» удалена` : "Заметка удалена";
      const undo = pushUndo(what, () => {
        setEntries((cur) => [...cur, ...removed]);
        void run(insertNotes(ref.current, removed));
      });
      toast(what, { actionLabel: "Вернуть", onAction: undo });
    },
    [setEntries, run, toast]
  );

  const importEntries = useCallback(
    (added: NoteEntry[]) => {
      if (!added.length) return;
      setEntries((cur) => [...cur, ...added]);
      void run(insertNotes(ref.current, added));
    },
    [setEntries, run]
  );

  return { entries, loading, sync, create, update, remove, importEntries };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * 01 · Конспекты — panel: tree in column 1, the note as a page in 2–3, properties in 4
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

const OPEN_KEY = "ix-notes-open-v1";
const EXPANDED_KEY = "ix-notes-expanded-v1";

async function readPicked(list: FileList | null): Promise<ImportFile[]> {
  if (!list) return [];
  return Promise.all([...list].map(async (f) => ({ path: f.webkitRelativePath || f.name, content: await f.text(), lastModified: f.lastModified })));
}

export function VaultPanel({ vault, primary }: { vault: VaultState; primary: MutableRefObject<() => void> }) {
  const { entries } = vault;
  const { toast } = useToast();
  const [openId, setOpenId] = useState<string | null>(() => readJSON<string | null>(OPEN_KEY, null));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(readJSON<string[]>(EXPANDED_KEY, [])));
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const importParent = useRef<string | null>(null);

  const open = entries.find((e) => e.id === openId) ?? null;
  useEffect(() => writeJSON(OPEN_KEY, openId), [openId]);
  useEffect(() => writeJSON(EXPANDED_KEY, [...expanded]), [expanded]);

  // The open note's folders unfold, so the tree always shows where you are.
  useEffect(() => {
    if (!open) return;
    const chain = pathOf(entries, open.id);
    if (chain.some((f) => !expanded.has(f.id))) setExpanded((cur) => new Set([...cur, ...chain.map((f) => f.id)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id, entries.length]);

  useEffect(() => {
    if (!vault.loading && openId && !open) setOpenId(null);
  }, [vault.loading, openId, open]);

  useEffect(() => {
    if (freshId && open?.id === freshId) {
      titleRef.current?.focus();
      setFreshId(null);
    }
  }, [freshId, open?.id]);

  const contextFolder = open ? (open.kind === "folder" ? open.id : open.parentId) : null;

  const rootRef = useRef<HTMLDivElement>(null);
  function select(id: string | null) {
    setConfirmId(null);
    setOpenId(id);
    // Opened from deep in a long list: bring the page head back into view.
    const top = rootRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) window.scrollBy({ top: top - 24, behavior: "smooth" });
  }
  function newNote(parentId: string | null = contextFolder) {
    const n = vault.create("note", parentId);
    if (parentId) setExpanded((cur) => new Set([...cur, parentId]));
    setQuery("");
    setFreshId(n.id);
    select(n.id);
  }
  function newFolder(parentId: string | null = contextFolder) {
    const f = vault.create("folder", parentId, "Новая папка");
    if (parentId) setExpanded((cur) => new Set([...cur, parentId]));
    setQuery("");
    setRenamingId(f.id);
  }
  primary.current = () => newNote();

  function toggle(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function move(id: string, target: string | null) {
    const e = entries.find((x) => x.id === id);
    if (!e || e.parentId === target || !canMoveInto(entries, id, target)) return;
    vault.update(id, { parentId: target });
    if (target) setExpanded((cur) => new Set([...cur, target]));
  }
  function pickImport(kind: "folder" | "files", parentId: string | null) {
    importParent.current = parentId;
    (kind === "folder" ? folderInput : filesInput).current?.click();
  }
  async function onPicked(list: FileList | null, input: HTMLInputElement) {
    const files = await readPicked(list);
    input.value = "";
    const added = entriesFromFiles(entries, files, importParent.current);
    const count = added.filter((a) => a.kind === "note").length;
    if (!count) {
      toast("В выбранном нет .md файлов");
      return;
    }
    vault.importEntries(added);
    if (importParent.current) setExpanded((cur) => new Set([...cur, importParent.current!]));
    toast(`Импортировано заметок: ${count}`);
  }

  // Native drag & drop: notes and folders into folders, or onto the vault root.
  const dragId = useRef<string | null>(null);
  function dragProps(target: string | null) {
    const key = target ?? "root";
    return {
      onDragOver: (e: DragEvent) => {
        if (!dragId.current || !canMoveInto(entries, dragId.current, target)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget !== key) setDropTarget(key);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && dropTarget === key) setDropTarget(null);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragId.current) move(dragId.current, target);
        dragId.current = null;
        setDropTarget(null);
      },
    };
  }

  const noteCount = useMemo(() => entries.filter((e) => e.kind === "note").length, [entries]);
  const results = useMemo(
    () => (query.trim() ? entries.filter((e) => e.kind === "note" && matchesNoteQuery(e, query)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : []),
    [entries, query]
  );
  const roots = childrenOf(entries, null);
  const confirmEntry = entries.find((e) => e.id === confirmId) ?? null;

  function renderRow(e: NoteEntry, depth: number): ReactNode {
    const isFolder = e.kind === "folder";
    const isOpen = expanded.has(e.id);
    const active = e.id === openId;
    const kids = isFolder && isOpen ? childrenOf(entries, e.id) : [];
    const count = isFolder ? [...subtreeIds(entries, e.id)].filter((id) => entries.find((x) => x.id === id)?.kind === "note").length : 0;
    return (
      <li key={e.id}>
        <div
          draggable={renamingId !== e.id}
          onDragStart={(ev) => {
            dragId.current = e.id;
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", e.title);
          }}
          onDragEnd={() => {
            dragId.current = null;
            setDropTarget(null);
          }}
          {...(isFolder ? dragProps(e.id) : {})}
          className="group relative flex h-8 items-center gap-1 pr-1 transition-colors duration-150 hover:bg-white/[0.025]"
          style={{
            paddingLeft: depth * 14,
            background: dropTarget === e.id ? "rgba(255,255,255,0.06)" : active ? "rgba(255,255,255,0.04)" : undefined,
            boxShadow: dropTarget === e.id ? `inset 0 0 0 1px ${B.l25}` : undefined,
          }}
        >
          {active && <span className="absolute inset-y-[7px] left-0 w-[2px]" style={{ background: B.text }} />}
          {isFolder ? (
            <button
              type="button"
              aria-label={isOpen ? "Свернуть" : "Развернуть"}
              onClick={() => toggle(e.id)}
              className="flex h-6 w-5 shrink-0 items-center justify-center outline-none transition-colors hover:text-white"
              style={{ color: B.text3 }}
            >
              <Chevron open={isOpen} />
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          {renamingId === e.id ? (
            <RenameInput
              initial={e.title}
              onDone={(title) => {
                setRenamingId(null);
                if (title !== null && title !== e.title) vault.update(e.id, { title });
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isFolder && !isOpen) toggle(e.id);
                select(e.id);
              }}
              onDoubleClick={() => setRenamingId(e.id)}
              title={e.title || UNTITLED}
              className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none transition-colors group-hover:text-white focus-visible:underline"
              style={{
                ...T.body,
                fontWeight: isFolder ? 500 : 400,
                color: active ? B.text : isFolder ? B.text2 : B.text3,
                fontStyle: e.title ? undefined : "italic",
              }}
            >
              <span className="truncate">{e.title || UNTITLED}</span>
              {isFolder && count > 0 && (
                <span className="ml-auto pl-1 group-hover:hidden" style={{ ...T.num, fontSize: 11, color: B.off }}>
                  {count}
                </span>
              )}
            </button>
          )}
          {renamingId !== e.id && (
            <div className="ml-auto hidden shrink-0 items-center gap-1 group-focus-within:flex group-hover:flex">
              {isFolder && (
                <button
                  type="button"
                  title="Новая заметка в папке"
                  aria-label="Новая заметка в папке"
                  onClick={() => newNote(e.id)}
                  className="flex h-6 w-6 items-center justify-center outline-none transition-colors hover:text-white"
                  style={{ color: B.text3 }}
                >
                  <Sparkle size={10} />
                </button>
              )}
              <Menu
                trigger={<Dots />}
                items={[
                  ...(isFolder
                    ? [
                        { label: "Новая заметка", onSelect: () => newNote(e.id) },
                        { label: "Вложенная папка", onSelect: () => newFolder(e.id) },
                        { label: "Импорт сюда", onSelect: () => pickImport("folder", e.id) },
                        { sep: true as const },
                      ]
                    : []),
                  { label: "Переименовать", onSelect: () => setRenamingId(e.id) },
                  { label: "Удалить", danger: true, onSelect: () => setConfirmId(e.id) },
                ]}
              />
            </div>
          )}
        </div>
        {kids.length > 0 && <ul>{kids.map((k) => renderRow(k, depth + 1))}</ul>}
      </li>
    );
  }

  /* ── main pane ───────────────────────────────────────────────────────────────────────── */
  let main: ReactNode;
  if (open?.kind === "note") {
    const chain = pathOf(entries, open.id);
    const links = (open.content.match(/\(#note-[^)]+\)/g) ?? []).length;
    const words = wordCount(open.content);
    main = (
      <div className="col-span-3 grid min-w-0 grid-cols-3 gap-x-5">
        <article ref={paneRef} className="col-span-2 min-w-0 pl-5" style={{ borderLeft: `1px solid ${B.l7}` }}>
          <nav aria-label="Путь" className="flex h-6 min-w-0 items-center gap-1.5 overflow-hidden" style={{ ...T.meta, color: B.text3 }}>
            <button type="button" className="shrink-0 transition-colors hover:text-white" onClick={() => select(null)}>
              Конспекты
            </button>
            {chain.map((f) => (
              <span key={f.id} className="flex min-w-0 items-center gap-1.5">
                <span style={{ color: B.off }}>/</span>
                <button type="button" className="truncate transition-colors hover:text-white" onClick={() => select(f.id)}>
                  {f.title || UNTITLED}
                </button>
              </span>
            ))}
          </nav>
          <div className="mt-6">
            <TitleField inputRef={titleRef} value={open.title} onChange={(title) => vault.update(open.id, { title })} onEnter={() => focusProse(paneRef.current)} placeholder={UNTITLED} size={44} />
          </div>
          <div className="mt-10">
            <IxEditor editorKey={open.id} initial={open.content} onChange={(content) => vault.update(open.id, { content })} onOpenNote={(id) => select(id)} />
          </div>
        </article>
        <aside className="sticky top-6 min-w-0 self-start pl-5" style={{ borderLeft: `1px solid ${B.l7}` }}>
          <Caps>Свойства</Caps>
          <div className="mt-3" style={{ borderTop: `1px solid ${B.l10}` }}>
            <KV
              k="Папка"
              v={
                <Menu
                  label="Переместить в…"
                  width={240}
                  trigger={
                    <span className="flex items-center gap-1.5" style={{ ...T.body, color: B.text }}>
                      <span className="max-w-[150px] truncate">{chain.length ? chain[chain.length - 1].title : "корень"}</span>
                      <Caret />
                    </span>
                  }
                  items={[
                    { heading: "Переместить в" },
                    { label: "Корень", onSelect: () => move(open.id, null), active: open.parentId === null },
                    ...entries
                      .filter((x) => x.kind === "folder")
                      .sort((a, b) => a.title.localeCompare(b.title, "ru"))
                      .map((f) => ({ label: f.title || UNTITLED, onSelect: () => move(open.id, f.id), active: f.id === open.parentId })),
                  ]}
                />
              }
            />
            <KV k="Создана" v={whenLabel(open.createdAt)} />
            <KV k="Изменена" v={whenLabel(open.updatedAt)} />
            <KV k="Объём" v={`${words} ${plural(words, "слово", "слова", "слов")}`} />
            <KV k="Ссылки на заметки" v={links || "—"} last />
          </div>
          <Caps className="mt-10">Действия</Caps>
          <div className="mt-3" style={{ borderTop: `1px solid ${B.l10}` }}>
            <ActionRow onClick={() => newNote(open.parentId)}>Новая заметка рядом</ActionRow>
            <ActionRow onClick={() => titleRef.current?.focus()}>Переименовать</ActionRow>
            <ActionRow onClick={() => setConfirmId(open.id)} danger>
              Удалить
            </ActionRow>
          </div>
          {confirmEntry && <ConfirmBox entry={confirmEntry} entries={entries} onCancel={() => setConfirmId(null)} onConfirm={() => doRemove(confirmEntry)} />}
          <div className="mt-8">
            <SyncNote state={vault.sync} />
          </div>
        </aside>
      </div>
    );
  } else {
    main = (
      <FolderView
        folder={open}
        entries={entries}
        loading={vault.loading}
        onOpen={select}
        onNewNote={() => newNote(open?.id ?? null)}
        onNewFolder={() => newFolder(open?.id ?? null)}
        onRename={() => open && setRenamingId(open.id)}
        onDelete={() => open && setConfirmId(open.id)}
        confirm={confirmEntry ? <ConfirmBox entry={confirmEntry} entries={entries} onCancel={() => setConfirmId(null)} onConfirm={() => doRemove(confirmEntry)} /> : null}
      />
    );
  }

  function doRemove(entry: NoteEntry) {
    if (entry.id === openId || subtreeIds(entries, entry.id).has(openId ?? "")) setOpenId(entry.parentId);
    setConfirmId(null);
    vault.remove(entry.id);
  }

  return (
    <div ref={rootRef} className="grid grid-cols-4 gap-x-5">
      {/* ── tree ───────────────────────────────────────────────────────────────────────── */}
      <aside className="sticky top-6 flex max-h-[calc(100vh-48px)] min-w-0 flex-col self-start">
        <SearchField value={query} onChange={setQuery} placeholder="Поиск по конспектам" />
        <div className="mt-5 flex items-center justify-between">
          <Caps>Хранилище</Caps>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => newFolder()} className="transition-colors hover:text-white" style={{ ...T.meta, color: B.text3 }}>
              + папка
            </button>
            <Menu
              label="Импорт из Obsidian"
              trigger={<Dots />}
              items={[
                { heading: "Импорт из Obsidian" },
                { label: "Папку — хранилище целиком", onSelect: () => pickImport("folder", null) },
                { label: "Файлы .md", onSelect: () => pickImport("files", null) },
              ]}
            />
          </div>
        </div>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-width:thin]" style={{ borderTop: `1px solid ${B.l10}` }} {...dragProps(null)}>
          {query.trim() ? (
            <SearchResults results={results} entries={entries} q={query} openId={openId} onOpen={select} />
          ) : (
            <>
              <button
                type="button"
                onClick={() => select(null)}
                className="relative mt-1 flex h-8 w-full items-center gap-2 pl-5 pr-1 text-left outline-none transition-colors hover:bg-white/[0.025] focus-visible:underline"
                style={{
                  ...T.body,
                  fontWeight: 500,
                  color: openId === null ? B.text : B.text2,
                  background: openId === null ? "rgba(255,255,255,0.04)" : dropTarget === "root" ? "rgba(255,255,255,0.06)" : undefined,
                }}
              >
                {openId === null && <span className="absolute inset-y-[7px] left-0 w-[2px]" style={{ background: B.text }} />}
                Все заметки
                <span className="ml-auto" style={{ ...T.num, fontSize: 11, color: B.off }}>
                  {noteCount}
                </span>
              </button>
              {vault.loading ? (
                <div className="flex flex-col gap-2 pl-5 pt-3">
                  {[70, 55, 80, 45, 62].map((w, i) => (
                    <span key={i} className="h-3" style={{ width: `${w}%`, background: B.l5 }} />
                  ))}
                </div>
              ) : roots.length === 0 ? (
                <p className="pl-5 pt-3" style={{ ...T.meta, color: B.text3 }}>
                  Пусто. Создайте папку под курс и первую заметку — или импортируйте хранилище Obsidian.
                </p>
              ) : (
                <ul>{roots.map((e) => renderRow(e, 0))}</ul>
              )}
            </>
          )}
        </div>
        <div className="pt-3" style={{ borderTop: `1px solid ${B.l7}` }}>
          <SyncNote state={vault.loading ? "saving" : vault.sync} />
        </div>
      </aside>

      {main}

      <input
        ref={folderInput}
        type="file"
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        multiple
        onChange={(e) => void onPicked(e.target.files, e.currentTarget)}
      />
      <input ref={filesInput} type="file" className="hidden" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple onChange={(e) => void onPicked(e.target.files, e.currentTarget)} />
    </div>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v === null ? null : v.trim() || initial);
  };
  return (
    <input
      autoFocus
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(value);
        if (e.key === "Escape") finish(null);
      }}
      className="h-7 min-w-0 flex-1 bg-transparent px-1 outline-none"
      style={{ ...T.body, color: B.text, boxShadow: `inset 0 -1px 0 ${B.l40}` }}
    />
  );
}

function ConfirmBox({ entry, entries, onCancel, onConfirm }: { entry: NoteEntry; entries: NoteEntry[]; onCancel: () => void; onConfirm: () => void }) {
  const inside = subtreeIds(entries, entry.id).size - 1;
  return (
    <div className="mt-6 p-4" style={{ boxShadow: `inset 0 0 0 1px ${B.l15}` }}>
      <div style={{ ...T.bodyStrong, color: B.text }}>{entry.kind === "folder" ? `Удалить папку «${entry.title}»?` : `Удалить «${entry.title || UNTITLED}»?`}</div>
      <p className="mt-1" style={{ ...T.meta, color: B.text3 }}>
        {entry.kind === "folder" && inside > 0 ? `Вместе с ней — всё внутри: ${inside}. ` : ""}Сразу после удаления можно нажать «Вернуть».
      </p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className="h-8 px-4 outline-none transition-colors hover:bg-[#FF5A36]/10 focus-visible:ring-1 focus-visible:ring-[#FF5A36]"
          style={{ ...T.btn, color: B.danger, boxShadow: `inset 0 0 0 1px ${B.danger}` }}
        >
          Удалить
        </button>
        <Button variant="ghost" size="sm" hook={false} onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

function SearchResults({ results, entries, q, openId, onOpen }: { results: NoteEntry[]; entries: NoteEntry[]; q: string; openId: string | null; onOpen: (id: string) => void }) {
  if (!results.length)
    return (
      <p className="pt-3" style={{ ...T.meta, color: B.text3 }}>
        Ничего не нашлось по «{q.trim()}».
      </p>
    );
  return (
    <ul>
      <li className="pb-1 pt-3" style={{ ...T.meta, color: B.text3 }}>
        Найдено: {results.length}
      </li>
      {results.map((n) => {
        const path = pathOf(entries, n.id).map((f) => f.title).join(" / ");
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onOpen(n.id)}
              className="flex w-full flex-col gap-1 py-3 text-left outline-none transition-colors hover:bg-white/[0.02] focus-visible:bg-white/[0.04]"
              style={{ borderBottom: `1px solid ${B.l7}`, background: n.id === openId ? "rgba(255,255,255,0.04)" : undefined }}
            >
              <span className="truncate" style={{ ...T.bodyStrong, color: B.text }}>
                <Highlight text={n.title || UNTITLED} q={q} />
              </span>
              <span className="line-clamp-2" style={{ ...T.meta, color: B.text3 }}>
                <Highlight text={snippet(n.content, q, 120)} q={q} />
              </span>
              <span className="truncate" style={{ ...T.meta, color: B.off }}>
                {path ? `${path} · ` : ""}
                {whenLabel(n.updatedAt)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const RECENT_PAGE = 24;

function FolderView({
  folder,
  entries,
  loading,
  onOpen,
  onNewNote,
  onNewFolder,
  onRename,
  onDelete,
  confirm,
}: {
  folder: NoteEntry | null;
  entries: NoteEntry[];
  loading: boolean;
  onOpen: (id: string) => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  confirm: ReactNode;
}) {
  const [limit, setLimit] = useState(RECENT_PAGE);
  useEffect(() => setLimit(RECENT_PAGE), [folder?.id]);
  const subfolders = folder ? childrenOf(entries, folder.id).filter((e) => e.kind === "folder") : childrenOf(entries, null).filter((e) => e.kind === "folder");
  const list = folder ? entries.filter((e) => e.parentId === folder.id && e.kind === "note") : entries.filter((e) => e.kind === "note");
  const sorted = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const chain = folder ? pathOf(entries, folder.id) : [];
  const total = folder ? subtreeIds(entries, folder.id).size - 1 : entries.length;

  return (
    <div className="col-span-3 min-w-0 pl-5" style={{ borderLeft: `1px solid ${B.l7}` }}>
      <div className="flex h-6 items-center gap-1.5" style={{ ...T.meta, color: B.text3 }}>
        <span>Конспекты</span>
        {chain.map((f) => (
          <span key={f.id} className="flex items-center gap-1.5">
            <span style={{ color: B.off }}>/</span>
            <button type="button" onClick={() => onOpen(f.id)} className="transition-colors hover:text-white">
              {f.title}
            </button>
          </span>
        ))}
      </div>
      <div className="mt-6 flex items-end justify-between gap-8">
        <div className="min-w-0">
          <h2 className="truncate" style={{ fontSize: 44, lineHeight: 1.02, letterSpacing: "-0.05em", fontWeight: 500 }}>
            {folder ? folder.title || UNTITLED : "Все заметки"}
          </h2>
          <p className="mt-3" style={{ ...T.bodyL, color: B.text2 }}>
            {list.length} {plural(list.length, "заметка", "заметки", "заметок")}
            {subfolders.length ? ` · ${subfolders.length} ${plural(subfolders.length, "папка", "папки", "папок")}` : ""}
            {folder && total > list.length + subfolders.length ? ` · всего внутри ${total}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button variant="outline" size="sm" onClick={onNewFolder} hook={false}>
            Папка
          </Button>
          {folder && (
            <Menu
              trigger={<Dots />}
              items={[
                { label: "Переименовать", onSelect: onRename },
                { label: "Удалить папку", danger: true, onSelect: onDelete },
              ]}
            />
          )}
        </div>
      </div>
      {confirm}

      {subfolders.length > 0 && (
        <section className="mt-12">
          <div className="flex items-baseline justify-between pb-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
            <Caps>Папки</Caps>
            <span style={{ ...T.num, color: B.text3 }}>{subfolders.length}</span>
          </div>
          <ul className="grid grid-cols-3 gap-x-5">
            {subfolders.map((f, i) => {
              const n = [...subtreeIds(entries, f.id)].filter((id) => entries.find((x) => x.id === id)?.kind === "note").length;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(f.id)}
                    className="group flex h-14 w-full items-center gap-3 text-left outline-none transition-colors hover:bg-white/[0.02] focus-visible:bg-white/[0.04]"
                    style={{ borderBottom: `1px solid ${B.l7}` }}
                  >
                    <span style={{ ...T.num, fontSize: 11, color: B.off }}>{pad2(i + 1)}</span>
                    <span className="min-w-0 flex-1 truncate transition-colors group-hover:text-white" style={{ ...T.bodyStrong, color: B.text2 }}>
                      {f.title || UNTITLED}
                    </span>
                    <span style={{ ...T.num, color: B.text3 }}>{n}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <div className="flex items-baseline justify-between pb-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
          <Caps>{folder ? "Заметки" : "Недавние"}</Caps>
          <span style={{ ...T.meta, color: B.text3 }}>по дате изменения</span>
        </div>
        {loading ? null : sorted.length === 0 ? (
          <div className="max-w-[320px] py-10">
            <Empty title={folder ? "В папке пока нет заметок" : "Здесь будут конспекты"} text="Новая заметка — кнопка вверху или «+» у папки в дереве." seed={9} />
          </div>
        ) : (
          <ul>
            {sorted.slice(0, limit).map((n, i) => {
              const where = !folder ? pathOf(entries, n.id).map((f) => f.title).join(" / ") : "";
              const text = snippet(n.content, "", 180);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(n.id)}
                    className="group grid w-full items-start gap-4 py-4 text-left outline-none transition-colors hover:bg-white/[0.02] focus-visible:bg-white/[0.04]"
                    style={{ gridTemplateColumns: "28px minmax(0,1fr) 120px", borderBottom: `1px solid ${B.l7}` }}
                  >
                    <span className="pt-[4px]" style={{ ...T.num, fontSize: 11, color: B.off }}>
                      {pad2(i + 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate transition-colors group-hover:text-white" style={{ ...T.bodyL, fontWeight: 500, color: n.title ? B.text : B.text3 }}>
                        {n.title || UNTITLED}
                      </span>
                      {text && (
                        <span className="mt-1 line-clamp-1" style={{ ...T.body, color: B.text3 }}>
                          {text}
                        </span>
                      )}
                      {where && (
                        <span className="mt-1 block truncate" style={{ ...T.meta, color: B.off }}>
                          {where}
                        </span>
                      )}
                    </span>
                    <span className="pt-[3px] text-right" style={{ ...T.meta, color: B.text3, ...tab }}>
                      {whenLabel(n.updatedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {sorted.length > limit && (
          <ActionRow onClick={() => setLimit((l) => l + RECENT_PAGE)} hint={`ещё ${sorted.length - limit}`}>
            Показать ещё
          </ActionRow>
        )}
      </section>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden style={{ transform: open ? "rotate(90deg)" : undefined, transition: `transform .2s ${B.ease}` }}>
      <path d="M2.5 1L5.5 4L2.5 7" stroke="currentColor" />
    </svg>
  );
}

export function Caret() {
  return (
    <svg width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden>
      <path d="M0.5 0.5L4 4L7.5 0.5" stroke="currentColor" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * 02 · Библиотека — data
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

export interface QuietLibrary {
  items: LibraryItem[];
  loading: boolean;
  sync: SyncState;
  add: (draft: LibraryDraft, onSaved?: (item: LibraryItem) => void) => LibraryItem;
  update: (id: string, patch: Partial<LibraryDraft>) => void;
  remove: (item: LibraryItem) => void;
}

export function useQuietLibrary(): QuietLibrary {
  const { toast } = useToast();
  const { state: sync, run } = useQuietSync();
  const [items, setState] = useState<LibraryItem[]>([]);
  const ref = useRef<LibraryItem[]>([]);
  const setItems = useCallback((next: LibraryItem[] | ((cur: LibraryItem[]) => LibraryItem[])) => {
    ref.current = typeof next === "function" ? next(ref.current) : next;
    setState(ref.current);
  }, []);
  const [loading, setLoading] = useState(true);
  /** Optimistic id → the id the server gave it (so a late patch still lands). */
  const alias = useRef(new Map<string, string>());
  const real = (id: string) => alias.current.get(id) ?? id;

  useEffect(() => {
    let alive = true;
    fetchLibrary()
      .catch(() => fetchLibrary().catch(() => [] as LibraryItem[]))
      .then((list) => alive && setItems(list))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [setItems]);

  const add = useCallback(
    (draft: LibraryDraft, onSaved?: (item: LibraryItem) => void) => {
      const now = new Date().toISOString();
      const local: LibraryItem = { ...draft, id: uid(), createdAt: now, updatedAt: now };
      setItems((cur) => [local, ...cur]);
      void run(addLibraryItem(ref.current.filter((i) => i.id !== local.id), draft)).then((res) => {
        if (!res) return;
        alias.current.set(local.id, res.item.id);
        onSaved?.(res.item);
        setItems((cur) => cur.map((i) => (i.id === local.id ? { ...res.item, ...i, id: res.item.id } : i)));
      });
      return local;
    },
    [setItems, run]
  );

  const update = useCallback(
    (id: string, patch: Partial<LibraryDraft>) => {
      const rid = real(id);
      setItems((cur) => cur.map((i) => (i.id === rid ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i)));
      void run(updateLibraryItem(ref.current, rid, patch));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setItems, run]
  );

  const remove = useCallback(
    (item: LibraryItem) => {
      setItems((cur) => cur.filter((i) => i.id !== item.id));
      void run(removeLibraryItem(ref.current, item.id));
      const undo = pushUndo(`Удалено из библиотеки: ${item.title}`, () => {
        setItems((cur) => [item, ...cur.filter((i) => i.id !== item.id)]);
        void run(restoreLibraryItem(ref.current.filter((i) => i.id !== item.id), item));
      });
      toast(`Удалено: ${item.title}`, { actionLabel: "Вернуть", onAction: undo });
    },
    [setItems, run, toast]
  );

  return { items, loading, sync, add, update, remove };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * 02 · Библиотека — panel: one paste field, numbers, filters, an index of dithered covers
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

const VIEW_KEY = "ix-library-view-v1";
const PREVIEW_TRIED_KEY = "ix-library-preview-tried-v1";
const PREVIEW_RETRY_MS = 3 * 24 * 60 * 60 * 1000;
const HAS_LINK = /https?:\/\//i;

const FIELD_BY_TYPE: Record<LibraryType, "orb" | "stripes" | "wave" | "ridge" | "blob"> = {
  book: "ridge",
  article: "stripes",
  post: "stripes",
  video: "wave",
  podcast: "orb",
  course: "blob",
  tool: "stripes",
  other: "orb",
};

const HEART = ["##.##", "#####", "#####", ".###.", "..#.."];

export function LibraryIndex({
  lib,
  primary,
  openId,
  pendingRaw,
  onConsumed,
}: {
  lib: QuietLibrary;
  primary: MutableRefObject<() => void>;
  openId?: string | null;
  pendingRaw?: string | null;
  onConsumed?: () => void;
}) {
  const { items, loading } = lib;
  const { toast } = useToast();
  const [view, setView] = useState<"index" | "covers">(() => (readJSON<string>(VIEW_KEY, "index") === "covers" ? "covers" : "index"));
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<LibraryType | "all">("all");
  const [status, setStatus] = useState<LibraryStatus | "all">("all");
  const [onlyFav, setOnlyFav] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [addValue, setAddValue] = useState("");
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const addRef = useRef<HTMLInputElement>(null);
  primary.current = () => addRef.current?.focus();

  useEffect(() => writeJSON(VIEW_KEY, view), [view]);

  const mark = useCallback((id: string, on: boolean) => {
    setPending((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Previews for what is already saved: items with a link but no picture unfurl in the background.
  const inflight = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (loading) return;
    const tried = readJSON<Record<string, number>>(PREVIEW_TRIED_KEY, {});
    const now = Date.now();
    const queue = items.filter((i) => i.url && !i.coverUrl && !inflight.current.has(i.id) && !(now - (tried[i.url] ?? 0) < PREVIEW_RETRY_MS));
    if (!queue.length) return;
    queue.forEach((i) => {
      inflight.current.add(i.id);
      mark(i.id, true);
    });
    void (async () => {
      for (const i of queue) {
        const patch = unfurlPatch(await unfurl(i.url!), i);
        if (Object.keys(patch).length) lib.update(i.id, patch);
        const log = readJSON<Record<string, number>>(PREVIEW_TRIED_KEY, {});
        log[i.url!] = Date.now();
        writeJSON(PREVIEW_TRIED_KEY, log);
        inflight.current.delete(i.id);
        mark(i.id, false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, items.length]);

  // Deep links: open an item, or take a shared link, once the list is here.
  useEffect(() => {
    if (openId && !loading) {
      if (items.some((i) => i.id === openId)) setOpenedId(openId);
      onConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loading]);
  useEffect(() => {
    if (!pendingRaw || loading) return;
    quickAdd(pendingRaw);
    onConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRaw, loading]);

  /** Paste → item at once, titled by its domain; the page's title and preview land a moment later. */
  function quickAdd(raw: string) {
    const drafts = linkDrafts(raw, items);
    if (!drafts.length) {
      toast(HAS_LINK.test(raw) ? "Эта ссылка уже в библиотеке" : "Вставьте ссылку — https://…");
      return;
    }
    setAddValue("");
    for (const d of drafts) {
      const item = lib.add(d);
      if (!d.url) continue;
      mark(item.id, true);
      unfurl(d.url)
        .then((meta) => {
          const patch = unfurlPatch(meta, item);
          if (Object.keys(patch).length) lib.update(item.id, patch);
        })
        .finally(() => mark(item.id, false));
    }
    if (drafts.length > 1) toast(`Добавлено: ${drafts.length}`);
  }

  const tagCounts = useMemo(() => libraryTagCounts(items), [items]);
  const typeCounts = useMemo(() => {
    const m: Partial<Record<LibraryType, number>> = {};
    items.forEach((i) => (m[i.type] = (m[i.type] ?? 0) + 1));
    return m;
  }, [items]);
  const statusCounts = useMemo(() => {
    const m: Record<LibraryStatus, number> = { want: 0, doing: 0, done: 0 };
    items.forEach((i) => (m[i.status] += 1));
    return m;
  }, [items]);
  const favCount = items.filter((i) => i.favorite).length;
  const tgCount = items.filter((i) => i.sourceCardId).length;

  const visible = useMemo(
    () =>
      sortLibrary(
        items.filter(
          (i) =>
            (type === "all" || i.type === type) &&
            (status === "all" || i.status === status) &&
            (!onlyFav || i.favorite) &&
            (!tag || i.tags.includes(tag)) &&
            matchesLibraryQuery(i, query)
        ),
        sort
      ),
    [items, type, status, onlyFav, tag, query, sort]
  );
  const filtered = type !== "all" || status !== "all" || onlyFav || !!tag || !!query.trim();
  const opened = items.find((i) => i.id === openedId) ?? null;
  const toggleSeen = (i: LibraryItem) => lib.update(i.id, { status: i.status === "done" ? "want" : "done" });

  return (
    <div>
      {/* the whole add flow: paste a link */}
      <form
        className="flex h-16 items-center gap-4 transition-colors focus-within:!border-white/40"
        style={{ borderBottom: `1px solid ${B.l15}` }}
        onSubmit={(e) => {
          e.preventDefault();
          if (addValue.trim()) quickAdd(addValue);
        }}
      >
        <span style={{ color: B.text3 }}>
          <Hook size={16} />
        </span>
        <input
          ref={addRef}
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (HAS_LINK.test(text)) {
              e.preventDefault();
              quickAdd(`${addValue} ${text}`);
            }
          }}
          aria-label="Добавить по ссылке"
          placeholder="Вставьте ссылку — название и превью подтянутся сами"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#454545]"
          style={{ ...T.bodyL, fontSize: 18, color: B.text }}
        />
        <span style={{ ...T.meta, color: B.off }}>Enter · можно несколько</span>
      </form>

      <div className="mt-10">
        <Stats
          items={[
            { k: "В библиотеке", v: items.length, sub: tgCount ? `${tgCount} из Telegram` : "книги, статьи, видео" },
            { k: LIBRARY_STATUSES.want.label, v: statusCounts.want, sub: "в очереди" },
            { k: LIBRARY_STATUSES.doing.label, v: statusCounts.doing, sub: "читаю, смотрю" },
            { k: LIBRARY_STATUSES.done.label, v: statusCounts.done, sub: items.length ? `${Math.round((statusCounts.done / items.length) * 100)}% всего` : "—" },
          ]}
        />
      </div>

      <div className="mt-12 grid grid-cols-4 items-end gap-x-5">
        <SearchField value={query} onChange={setQuery} placeholder="Название, автор, заметки, теги" />
        <div className="col-span-3 flex min-h-[40px] min-w-0 items-center gap-8 pl-5" style={{ borderBottom: `1px solid ${B.l10}` }}>
          <Seg<LibraryType | "all">
            label="Тип"
            value={type}
            onChange={setType}
            items={[{ id: "all", label: "Все", count: items.length }, ...LIBRARY_TYPE_ORDER.filter((t) => typeCounts[t]).map((t) => ({ id: t, label: LIBRARY_TYPES[t].plural, count: typeCounts[t] }))]}
          />
          <span className="h-4 w-px shrink-0" style={{ background: B.l10 }} />
          <Seg<LibraryStatus | "all">
            label="Статус"
            value={status}
            onChange={setStatus}
            items={[{ id: "all", label: "Любой статус" }, ...LIBRARY_STATUS_ORDER.map((s) => ({ id: s, label: LIBRARY_STATUSES[s].label, count: statusCounts[s] }))]}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <TagToggle on={onlyFav} onClick={() => setOnlyFav((v) => !v)} count={favCount || undefined}>
            <Pixel map={HEART} px={2} /> Избранное
          </TagToggle>
          {tagCounts.slice(0, 12).map(([t, n]) => (
            <TagToggle key={t} on={tag === t} onClick={() => setTag(tag === t ? null : t)} count={n}>
              #{t}
            </TagToggle>
          ))}
        </div>
        <Menu
          label="Сортировка"
          width={180}
          trigger={
            <span className="flex h-8 items-center gap-1.5" style={T.body}>
              {{ newest: "Новые", oldest: "Старые", title: "А–Я", rating: "По оценке" }[sort]}
              <Caret />
            </span>
          }
          items={(["newest", "oldest", "title", "rating"] as LibrarySort[]).map((s) => ({
            label: { newest: "Новые", oldest: "Старые", title: "А–Я", rating: "По оценке" }[s],
            onSelect: () => setSort(s),
            active: s === sort,
          }))}
        />
        <Seg<"index" | "covers"> label="Вид" value={view} onChange={setView} items={[{ id: "index", label: "Индекс" }, { id: "covers", label: "Обложки" }]} />
      </div>

      <div className="mt-8">
        {loading && !items.length ? (
          <ul style={{ borderTop: `1px solid ${B.l10}` }}>
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex h-[104px] items-center gap-5" style={{ borderBottom: `1px solid ${B.l7}` }}>
                <span className="h-[72px] w-[120px]" style={{ background: B.l5 }} />
                <span className="h-3 w-1/3" style={{ background: B.l5 }} />
              </li>
            ))}
          </ul>
        ) : !items.length ? (
          <div className="max-w-[360px] py-8">
            <Empty title="Библиотека пуста" text="Книги, статьи, видео, подкасты, курсы. Вставьте ссылку — остальное подтянется." seed={4} />
          </div>
        ) : !visible.length ? (
          <p className="py-10" style={{ ...T.body, color: B.text3, borderTop: `1px solid ${B.l10}` }}>
            Ничего не найдено{filtered ? " по этим фильтрам" : ""}.
          </p>
        ) : view === "index" ? (
          <ul style={{ borderTop: `1px solid ${B.l10}` }}>
            {visible.map((i, n) => (
              <li key={i.id}>
                <IndexRow item={i} n={n + 1} pending={pending.has(i.id)} onOpen={() => setOpenedId(i.id)} onSeen={() => toggleSeen(i)} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-4 gap-x-5 gap-y-12">
            {visible.map((i, n) => (
              <li key={i.id}>
                <CoverCard item={i} n={n + 1} pending={pending.has(i.id)} onOpen={() => setOpenedId(i.id)} onSeen={() => toggleSeen(i)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8">
        <SyncNote state={lib.sync} idle="Посты из Telegram-бота попадают сюда сами" />
      </div>

      <ItemPanel item={opened} onClose={() => setOpenedId(null)} lib={lib} knownTags={tagCounts.map(([t]) => t)} />
    </div>
  );
}

function Rating({ value, onChange, size = 6 }: { value?: number; onChange?: (v: number | undefined) => void; size?: number }) {
  return (
    <span className="inline-flex items-center gap-[2px]" role={onChange ? undefined : "img"} aria-label={onChange ? undefined : `Оценка ${value ?? 0} из 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            aria-label={`Оценка ${n}`}
            onClick={() => onChange(value === n ? undefined : n)}
            className="p-[3px] outline-none transition-opacity hover:opacity-70 focus-visible:ring-1 focus-visible:ring-white/40"
          >
            <span className="block" style={{ width: size, height: size, background: (value ?? 0) >= n ? B.text : B.off }} />
          </button>
        ) : (
          <span key={n} style={{ width: size, height: size, background: (value ?? 0) >= n ? B.text2 : B.off }} />
        )
      )}
    </span>
  );
}

function statusWord(i: LibraryItem) {
  return i.status === "done" ? LIBRARY_TYPES[i.type].done : LIBRARY_STATUSES[i.status].label;
}

function IndexRow({ item: i, n, pending, onOpen, onSeen }: { item: LibraryItem; n: number; pending: boolean; onOpen: () => void; onSeen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className="group grid cursor-pointer items-center gap-5 py-4 outline-none transition-colors duration-200 hover:bg-white/[0.02] focus-visible:bg-white/[0.04]"
      style={{ gridTemplateColumns: "24px 120px minmax(0,1fr) 96px 150px 64px", borderBottom: `1px solid ${B.l7}` }}
    >
      <span style={{ ...T.num, fontSize: 11, color: B.off }}>{pad2(n)}</span>
      <Dither src={i.coverUrl} className="h-[72px] w-[120px]" fallbackKind={FIELD_BY_TYPE[i.type]} seed={hashSeed(i.id) % 997} cell={2} />
      <div className="min-w-0">
        <div className="line-clamp-2 transition-colors group-hover:text-white" style={{ ...T.bodyL, fontWeight: 500, color: i.status === "done" ? B.text2 : B.text }}>
          {i.title}
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-2" style={{ ...T.meta, color: B.text3 }}>
          {i.domain && <img src={faviconUrl(i.domain, 32)} alt="" width={12} height={12} loading="lazy" className="h-3 w-3 shrink-0 opacity-70 grayscale" />}
          <span className="truncate">{pending ? "подтягиваю название и превью…" : [i.author ?? i.domain, whenLabel(i.createdAt, false)].filter(Boolean).join(" · ")}</span>
          {i.sourceCardId && <span className="shrink-0" style={{ color: B.off }}>· Telegram</span>}
        </div>
      </div>
      <span style={{ ...T.meta, color: B.text3 }}>{LIBRARY_TYPES[i.type].label}</span>
      <span className="flex items-center gap-2.5">
        <QuietCheck done={i.status === "done"} onClick={onSeen} label={`${LIBRARY_TYPES[i.type].done}: ${i.title}`} />
        <span style={{ ...T.meta, color: i.status === "done" ? B.text3 : i.status === "doing" ? B.text : B.text3 }}>{statusWord(i)}</span>
      </span>
      <span className="flex flex-col items-end gap-2">
        {i.favorite && (
          <span style={{ color: B.text2 }} title="В избранном">
            <Pixel map={HEART} px={2} />
          </span>
        )}
        {i.rating ? <Rating value={i.rating} size={5} /> : null}
      </span>
    </div>
  );
}

function CoverCard({ item: i, n, pending, onOpen, onSeen }: { item: LibraryItem; n: number; pending: boolean; onOpen: () => void; onSeen: () => void }) {
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()} className="group cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-white/40">
      <div className="relative">
        <Dither src={i.coverUrl} className="aspect-[4/3] w-full" fallbackKind={FIELD_BY_TYPE[i.type]} seed={hashSeed(i.id) % 997} cell={3} />
        {i.favorite && (
          <span className="absolute right-2 top-2 p-1" style={{ background: B.bg, color: B.text2 }}>
            <Pixel map={HEART} px={2} />
          </span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between" style={{ ...T.meta, color: B.text3 }}>
        <span className="flex items-center gap-2">
          <span style={{ ...T.num, fontSize: 11, color: B.off }}>{pad2(n)}</span>
          {LIBRARY_TYPES[i.type].label}
        </span>
        {i.rating ? <Rating value={i.rating} size={5} /> : null}
      </div>
      <div className="mt-2 line-clamp-2 transition-colors group-hover:text-white" style={{ ...T.bodyStrong, color: i.status === "done" ? B.text2 : B.text }}>
        {i.title}
      </div>
      <div className="mt-3 flex items-center gap-2.5 pt-3" style={{ borderTop: `1px solid ${B.l7}` }}>
        <QuietCheck done={i.status === "done"} onClick={onSeen} label={`${LIBRARY_TYPES[i.type].done}: ${i.title}`} size={12} />
        <span className="min-w-0 flex-1 truncate" style={{ ...T.meta, color: B.text3 }}>
          {pending ? "подтягиваю превью…" : statusWord(i)}
        </span>
        <span className="truncate" style={{ ...T.meta, color: B.off }}>
          {i.domain ?? i.author}
        </span>
      </div>
    </div>
  );
}

/** The item as a «case»: dithered cover, big title, a key–value table, notes, one CTA bar. */
function ItemPanel({ item, onClose, lib, knownTags }: { item: LibraryItem | null; onClose: () => void; lib: QuietLibrary; knownTags: string[] }) {
  // Keep the last item while the panel slides out.
  const last = useRef<LibraryItem | null>(null);
  if (item) last.current = item;
  const i = item ?? last.current;
  const [title, setTitle] = useState("");
  const [coverLink, setCoverLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "fill" | "upload">("");
  const fileRef = useRef<HTMLInputElement>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setTitle(item?.title ?? "");
    setCoverLink(null);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!i) return <SidePanel open={false} onClose={onClose} label="Элемент библиотеки">{null}</SidePanel>;
  const commit = (patch: Partial<LibraryDraft>) => lib.update(i.id, patch);

  async function fill() {
    if (!i?.url) return;
    setBusy("fill");
    const meta = await unfurl(i.url);
    const patch: Partial<LibraryDraft> = {};
    if (meta.title && !i.title) patch.title = meta.title;
    if (meta.description && !i.description) patch.description = meta.description;
    if (meta.image && !i.coverUrl) patch.coverUrl = meta.image;
    if (meta.author && !i.author) patch.author = meta.author;
    if (Object.keys(patch).length) commit(patch);
    setBusy("");
  }
  async function onCover(file: File | null) {
    if (!file) return;
    setBusy("upload");
    try {
      commit({ coverUrl: await uploadCover(file) });
    } catch {
      // Storage refused (sandbox / offline) — show the picture from memory, quietly.
      commit({ coverUrl: URL.createObjectURL(file) });
    } finally {
      setBusy("");
    }
  }

  const tagsLeft = knownTags.filter((t) => !i.tags.includes(t)).slice(0, 8);

  return (
    <SidePanel open={!!item} onClose={onClose} label="Элемент библиотеки" width={600}>
      <div className="flex h-14 shrink-0 items-center justify-between px-8" style={{ borderBottom: `1px solid ${B.l10}` }}>
        <span style={{ ...T.caps, color: B.text3 }}>
          Библиотека · {LIBRARY_TYPES[i.type].label}
          {i.sourceCardId ? " · из Telegram" : ""}
        </span>
        <CloseButton onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-8 [scrollbar-width:thin]">
        <Dither key={i.coverUrl ?? i.id} src={i.coverUrl} className="h-[240px] w-full" fallbackKind={FIELD_BY_TYPE[i.type]} seed={hashSeed(i.id) % 997} cell={3} />
        <div className="mt-3 flex items-center gap-5" style={{ ...T.meta, color: B.text3 }}>
          <button type="button" className="transition-colors hover:text-white" onClick={() => fileRef.current?.click()}>
            {busy === "upload" ? "Загружаю…" : "Загрузить обложку"}
          </button>
          <button type="button" className="transition-colors hover:text-white" onClick={() => setCoverLink((v) => (v === null ? "" : null))}>
            По ссылке
          </button>
          {i.coverUrl && (
            <button type="button" className="transition-colors hover:text-white" onClick={() => commit({ coverUrl: undefined })}>
              Убрать
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => (void onCover(e.target.files?.[0] ?? null), (e.target.value = ""))} />
        </div>
        {coverLink !== null && (
          <input
            autoFocus
            value={coverLink}
            onChange={(e) => setCoverLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && coverLink.trim()) {
                commit({ coverUrl: coverLink.trim() });
                setCoverLink(null);
              }
              if (e.key === "Escape") setCoverLink(null);
            }}
            placeholder="https://… картинка, Enter"
            className="mt-3 h-9 w-full bg-transparent outline-none placeholder:text-[#454545]"
            style={{ ...T.body, color: B.text, borderBottom: `1px solid ${B.l20}` }}
          />
        )}

        <div className="mt-8">
          <Seg<LibraryType> label="Тип" value={i.type} onChange={(t) => commit({ type: t })} items={LIBRARY_TYPE_ORDER.map((t) => ({ id: t, label: LIBRARY_TYPES[t].label }))} />
        </div>
        <div className="mt-4">
          <TitleField value={title} onChange={setTitle} placeholder="Название" size={34} />
        </div>
        <TitleCommit value={title} current={i.title} onCommit={(t) => commit({ title: t })} />
        <InlineInput value={i.author ?? ""} placeholder="Автор / канал / источник" onCommit={(v) => commit({ author: v.trim() || undefined })} className="mt-3 w-full" style={{ ...T.bodyL, color: B.text2 }} />

        <div className="mt-8" style={{ borderTop: `1px solid ${B.l10}` }}>
          <KV
            k="Статус"
            v={<Seg<LibraryStatus> label="Статус" value={i.status} onChange={(s) => commit({ status: s })} items={LIBRARY_STATUS_ORDER.map((s) => ({ id: s, label: s === "done" ? LIBRARY_TYPES[i.type].done : LIBRARY_STATUSES[s].label }))} />}
            py={6}
          />
          <KV k="Оценка" v={<Rating value={i.rating} onChange={(r) => commit({ rating: r })} size={8} />} py={8} />
          <KV
            k="Избранное"
            v={
              <button type="button" onClick={() => commit({ favorite: !i.favorite })} className="flex items-center gap-2 transition-colors hover:text-white" style={{ color: i.favorite ? B.text : B.text3 }}>
                <Pixel map={HEART} px={2} /> {i.favorite ? "в избранном" : "добавить"}
              </button>
            }
          />
          <KV
            k="Ссылка"
            v={
              <span className="flex items-center justify-end gap-3">
                <InlineInput align="right" className="w-[260px]" value={i.url ?? ""} placeholder="https://…" onCommit={(v) => commit({ url: v.trim() || undefined })} />
                {i.url && (
                  <button type="button" onClick={() => void fill()} disabled={busy === "fill"} className="shrink-0 transition-colors hover:text-white disabled:opacity-40" style={{ ...T.meta, color: B.text3 }} title="Подтянуть название, описание и обложку">
                    {busy === "fill" ? "…" : "заполнить"}
                  </button>
                )}
              </span>
            }
          />
          <KV k="Добавлено" v={`${whenLabel(i.createdAt)}${i.domain ? ` · ${i.domain}` : ""}`} />
          <KV
            k="Теги"
            last
            v={
              <InlineInput
                align="right"
                className="w-[300px]"
                value={i.tags.map((t) => `#${t}`).join(" ")}
                placeholder="#тег через пробел"
                onCommit={(v) => commit({ tags: Array.from(new Set(v.split(/[,\s]+/).map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean))) })}
              />
            }
          />
        </div>
        {tagsLeft.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tagsLeft.map((t) => (
              <TagToggle key={t} on={false} onClick={() => commit({ tags: [...i.tags, t] })}>
                + #{t}
              </TagToggle>
            ))}
          </div>
        )}

        <Caps className="mt-10">О чём</Caps>
        <DescField value={i.description ?? ""} onCommit={(v) => commit({ description: v.trim() || undefined })} />

        <Caps className="mt-10">Мои заметки</Caps>
        <div className="mt-4">
          <IxEditor
            editorKey={`lib-${i.id}`}
            initial={i.notes}
            onChange={(md) => {
              if (notesTimer.current) clearTimeout(notesTimer.current);
              notesTimer.current = setTimeout(() => commit({ notes: md }), 700);
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            lib.remove(i);
            onClose();
          }}
          className="mt-2 transition-colors hover:!text-[#FF5A36]"
          style={{ ...T.meta, color: B.text3 }}
        >
          Удалить из библиотеки
        </button>
      </div>
      {i.url && (
        <CtaBar tone="invert" onClick={() => window.open(i.url, "_blank", "noopener")}>
          Открыть источник
        </CtaBar>
      )}
    </SidePanel>
  );
}

/** Commits the panel title when focus leaves the title field (kept separate for clarity). */
function TitleCommit({ value, current, onCommit }: { value: string; current: string; onCommit: (t: string) => void }) {
  const latest = useRef({ value, current });
  latest.current = { value, current };
  useEffect(() => {
    const t = setTimeout(() => {
      const v = latest.current.value.trim();
      if (v && v !== latest.current.current) onCommit(v);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return null;
}

function DescField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  return (
    <textarea
      ref={ref}
      rows={2}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      placeholder="Пара строк — что это и зачем"
      className="mt-3 w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-[#454545]"
      style={{ ...T.bodyL, lineHeight: 1.55, color: B.text2 }}
    />
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * 03 · Ссылки — data
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

let localSeq = 0;
const localId = () => `local-${Date.now()}-${localSeq++}`;

export interface QuietShelf {
  shelf: LinkShelf;
  loading: boolean;
  sync: SyncState;
  apply: (op: (s: LinkShelf) => Promise<LinkShelf>, optimistic: (s: LinkShelf) => LinkShelf) => void;
}

export function useQuietShelf(): QuietShelf {
  const { state: sync, run } = useQuietSync();
  const [shelf, setState] = useState<LinkShelf>({ sections: [], links: [] });
  const ref = useRef(shelf);
  const set = useCallback((s: LinkShelf) => {
    ref.current = s;
    setState(s);
  }, []);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchShelf()
      .catch(() => fetchShelf().catch(() => ({ sections: [], links: [] }) as LinkShelf))
      .then((s) => alive && set(s))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [set]);
  const apply = useCallback(
    (op: (s: LinkShelf) => Promise<LinkShelf>, optimistic: (s: LinkShelf) => LinkShelf) => {
      const before = ref.current;
      const guess = optimistic(before);
      set(guess);
      void run(op(before)).then((res) => {
        // Only take the server's version if nothing else changed meanwhile.
        if (res && ref.current === guess) set(res);
      });
    },
    [set, run]
  );
  return { shelf, loading, sync, apply };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * 03 · Ссылки — panel: hairline lists by section, two sections per row
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

const DRAG_LINK = "application/x-knowledge-link";
const DRAG_SECTION = "application/x-knowledge-section";

export function LinksShelf({ api, primary }: { api: QuietShelf; primary: MutableRefObject<() => void> }) {
  const { shelf } = api;
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [newSection, setNewSection] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  primary.current = () => urlRef.current?.focus();

  const q = query.trim().toLowerCase();
  const match = (l: SavedLink) => !q || `${l.title ?? ""} ${l.domain} ${l.url}`.toLowerCase().includes(q);
  const sections = [...shelf.sections].sort((a, b) => a.position - b.position);

  function submitLinks() {
    const fresh = parseNewLinks(draft, shelf.links, { title, sectionId: null, startPosition: nextPosition(linksOfSection(shelf.links, null)) });
    if (!fresh.length) {
      toast("Ссылок не найдено — вставьте адрес, начинающийся с http(s)://");
      return;
    }
    const raw = draft;
    const label = title;
    api.apply(
      (s) => addLinks(s, raw, { title: label }),
      (s) => ({ ...s, links: [...s.links, ...fresh.map((d) => ({ ...d, id: localId() }))] })
    );
    setDraft("");
    setTitle("");
    toast(fresh.length === 1 ? "Ссылка добавлена" : `Добавлено ссылок: ${fresh.length}`);
  }

  function submitSection() {
    const name = newSection.trim();
    if (!name) return;
    api.apply(
      (s) => addSection(s, name),
      (s) => ({ ...s, sections: [...s.sections, { id: localId(), name, position: nextPosition(s.sections), createdAt: new Date().toISOString() }] })
    );
    setNewSection("");
  }

  function dropLinkBefore(draggedId: string, sectionId: string | null, target: SavedLink | null) {
    const list = linksOfSection(shelf.links, sectionId).filter((l) => l.id !== draggedId);
    const idx = target ? list.findIndex((l) => l.id === target.id) : list.length;
    const position = positionBetween(list[idx - 1]?.position, list[idx]?.position);
    setDragging(null);
    api.apply(
      (s) => moveLink(s, draggedId, sectionId, position),
      (s) => ({ ...s, links: s.links.map((l) => (l.id === draggedId ? { ...l, sectionId, position } : l)) })
    );
  }

  function reorderSection(draggedId: string, target: LinkSection) {
    if (draggedId === target.id) return;
    const list = sections.filter((s) => s.id !== draggedId);
    const idx = list.findIndex((s) => s.id === target.id);
    const position = positionBetween(list[idx - 1]?.position, list[idx]?.position);
    api.apply(
      (s) => moveSection(s, draggedId, position),
      (s) => ({ ...s, sections: s.sections.map((x) => (x.id === draggedId ? { ...x, position } : x)) })
    );
  }

  const groups: (LinkSection | null)[] = [null, ...sections];
  const total = shelf.links.length;

  return (
    <div>
      <form
        className="grid grid-cols-4 items-end gap-x-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) submitLinks();
        }}
      >
        <label className="col-span-2 flex h-16 items-center gap-4 transition-colors focus-within:!border-white/40" style={{ borderBottom: `1px solid ${B.l15}` }}>
          <span style={{ color: B.text3 }}>
            <Hook size={16} />
          </span>
          <input
            ref={urlRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://… — можно несколько через пробел"
            aria-label="Ссылки"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#454545]"
            style={{ ...T.bodyL, fontSize: 18, color: B.text }}
          />
        </label>
        <label className="flex h-16 items-center transition-colors focus-within:!border-white/40" style={{ borderBottom: `1px solid ${B.l15}` }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название — необязательно"
            aria-label="Название"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#454545]"
            style={{ ...T.bodyL, color: B.text }}
          />
        </label>
        <div className="flex h-16 items-center justify-end" style={{ borderBottom: `1px solid ${B.l15}` }}>
          <Button variant="outline" type="submit" disabled={!draft.trim()}>
            Добавить
          </Button>
        </div>
      </form>

      <div className="mt-12 grid grid-cols-4 items-end gap-x-5">
        <SearchField value={query} onChange={setQuery} placeholder="Название или домен" />
        <div className="col-span-3 flex min-h-[40px] items-center gap-6 pl-5" style={{ borderBottom: `1px solid ${B.l10}` }}>
          <span style={{ ...T.meta, color: B.text3, ...tab }}>
            {total} {plural(total, "ссылка", "ссылки", "ссылок")} · {sections.length} {plural(sections.length, "секция", "секции", "секций")} · перетаскивайте строки между секциями
          </span>
          <form
            className="ml-auto flex items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitSection();
            }}
          >
            <input
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              placeholder="Новая секция…"
              aria-label="Новая секция"
              className="h-8 w-44 bg-transparent outline-none placeholder:text-[#454545]"
              style={{ ...T.body, color: B.text }}
            />
            <button type="submit" disabled={!newSection.trim()} className="transition-colors hover:text-white disabled:opacity-40" style={{ ...T.meta, color: B.text2 }}>
              + секция
            </button>
          </form>
        </div>
      </div>

      {api.loading ? null : total === 0 && sections.length === 0 ? (
        <div className="mt-12 max-w-[360px]">
          <Empty title="Ссылок пока нет" text="Вставьте одну или несколько ссылок выше — они лягут строками с логотипом сайта." seed={13} />
        </div>
      ) : (
        <div className="mt-14 grid grid-cols-2 gap-x-5 gap-y-16">
          {groups.map((section, gi) => {
            const id = section?.id ?? null;
            const key = id ?? "__none";
            const items = linksOfSection(shelf.links, id).filter(match);
            if (!section && items.length === 0 && sections.length > 0) return null;
            if (q && items.length === 0) return null;
            return (
              <section
                key={key}
                className="min-w-0 transition-colors"
                style={{ background: over === key ? "rgba(255,255,255,0.025)" : undefined, boxShadow: over === key ? `0 0 0 8px rgba(255,255,255,0.025)` : undefined }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(key);
                }}
                onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver((c) => (c === key ? null : c))}
                onDrop={(e) => {
                  setOver(null);
                  const dragged = e.dataTransfer.getData(DRAG_LINK);
                  if (dragged) return dropLinkBefore(dragged, id, null);
                  const sec = e.dataTransfer.getData(DRAG_SECTION);
                  if (sec && section) reorderSection(sec, section);
                }}
              >
                <div className="group/sec flex items-end justify-between gap-4 pb-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
                  <div className="flex min-w-0 items-baseline gap-3">
                    <span
                      draggable={!!section}
                      onDragStart={(e) => section && e.dataTransfer.setData(DRAG_SECTION, section.id)}
                      title={section ? "Перетащите, чтобы поменять порядок" : undefined}
                      className={section ? "cursor-grab" : undefined}
                      style={{ ...T.num, color: B.off }}
                    >
                      {pad2(section ? gi : 0)}
                    </span>
                    {section && renaming === section.id ? (
                      <RenameInput
                        initial={section.name}
                        onDone={(name) => {
                          setRenaming(null);
                          if (name && name !== section.name) api.apply((s) => renameSection(s, section.id, name), (s) => ({ ...s, sections: s.sections.map((x) => (x.id === section.id ? { ...x, name } : x)) }));
                        }}
                      />
                    ) : (
                      <h3 className="truncate" style={{ ...T.title, color: section ? B.text : B.text3 }} onDoubleClick={() => section && setRenaming(section.id)} title={section ? "Двойной клик — переименовать" : undefined}>
                        {section ? section.name : "Без секции"}
                      </h3>
                    )}
                    <span style={{ ...T.num, color: B.text3 }}>{items.length}</span>
                  </div>
                  {section && (
                    <div className="flex shrink-0 items-center gap-4 opacity-0 transition-opacity group-hover/sec:opacity-100 focus-within:opacity-100">
                      <button type="button" onClick={() => setRenaming(section.id)} className="transition-colors hover:text-white" style={{ ...T.meta, color: B.text3 }}>
                        переименовать
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          api.apply(
                            (s) => removeSection(s, section.id),
                            (s) => ({ sections: s.sections.filter((x) => x.id !== section.id), links: s.links.map((l) => (l.sectionId === section.id ? { ...l, sectionId: null } : l)) })
                          )
                        }
                        className="transition-colors hover:!text-[#FF5A36]"
                        style={{ ...T.meta, color: B.text3 }}
                        title="Ссылки секции вернутся в «Без секции»"
                      >
                        удалить
                      </button>
                    </div>
                  )}
                </div>
                {items.length === 0 ? (
                  <p className="flex h-11 items-center" style={{ ...T.meta, color: B.off, borderBottom: `1px dashed ${B.l10}` }}>
                    Перетащите сюда ссылки
                  </p>
                ) : (
                  <ul>
                    {items.map((l) => (
                      <li
                        key={l.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(DRAG_LINK, l.id);
                          setDragging(l.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          const dragged = e.dataTransfer.getData(DRAG_LINK);
                          if (!dragged || dragged === l.id) return;
                          e.stopPropagation();
                          setOver(null);
                          dropLinkBefore(dragged, id, l);
                        }}
                        className="group relative"
                        style={{ opacity: dragging === l.id ? 0.35 : 1 }}
                      >
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          title={l.url}
                          className="grid h-12 items-center gap-3 pr-8 outline-none transition-colors duration-200 hover:bg-white/[0.02] focus-visible:bg-white/[0.04]"
                          style={{ gridTemplateColumns: "16px minmax(0,1fr) auto", borderBottom: `1px solid ${B.l7}` }}
                        >
                          <img src={faviconUrl(l.domain, 32)} alt="" width={14} height={14} loading="lazy" className="h-3.5 w-3.5 opacity-60 grayscale transition-opacity group-hover:opacity-100" />
                          <span className="truncate transition-colors group-hover:text-white" style={{ ...T.body, color: B.text2 }}>
                            <Highlight text={l.title || l.domain} q={query} />
                          </span>
                          <span className="truncate text-right" style={{ ...T.meta, color: B.text3 }}>
                            {l.domain} <span style={{ color: B.off }}>· {whenLabel(l.createdAt, false)}</span>
                          </span>
                        </a>
                        <button
                          type="button"
                          aria-label={`Удалить ссылку: ${l.url}`}
                          title="Удалить"
                          onClick={() => api.apply((s) => removeLink(s, l.id), (s) => ({ ...s, links: s.links.filter((x) => x.id !== l.id) }))}
                          className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center opacity-0 outline-none transition-opacity hover:!text-[#FF5A36] focus-visible:opacity-100 group-hover:opacity-100"
                          style={{ color: B.text3 }}
                        >
                          <Sparkle size={10} open />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      <div className="mt-14">
        <SyncNote state={api.sync} />
      </div>
    </div>
  );
}
