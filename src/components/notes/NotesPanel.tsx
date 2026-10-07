import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  ChevronRight,
  ChevronLeft,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
  NotebookPen,
  Check,
  Loader2,
  CloudOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { useNotes } from "@/components/notes/useNotes";
import { useToast } from "@/store/ToastProvider";
import { cn } from "@/lib/utils";
import {
  childrenOf,
  pathOf,
  canMoveInto,
  matchesNoteQuery,
  snippet,
  subtreeIds,
  entriesFromFiles,
  UNTITLED,
  type NoteEntry,
  type ImportFile,
} from "@/lib/knowledgeNotes";

const OPEN_KEY = "crm-notes-open-v1";
const EXPANDED_KEY = "crm-notes-expanded-v1";

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
    // Remembering the open note is a convenience — never worth an error.
  }
}

/** «сегодня, 14:05» · «вчера, 09:12» · «13 июл.» · «13 июл. 2025». */
export function noteDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => x.toDateString();
  if (day(d) === day(now)) return `сегодня, ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (day(d) === day(y)) return `вчера, ${time}`;
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Wraps every occurrence of `q` in a highlight. */
function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.trim();
  if (!needle) return <>{text}</>;
  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === needle.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-brand/25 text-foreground">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

async function readPicked(list: FileList | null): Promise<ImportFile[]> {
  if (!list) return [];
  return Promise.all(
    [...list].map(async (f) => ({
      path: f.webkitRelativePath || f.name,
      content: await f.text(),
      lastModified: f.lastModified,
    }))
  );
}

/**
 * «Конспекты»: an Obsidian-style vault — a folder tree on the left, the open note on the right.
 * Folders nest to any depth; notes and folders drag between folders; search covers titles and
 * text across the whole vault. An Obsidian vault (or loose .md files) imports with its structure.
 */
export function NotesPanel() {
  const notes = useNotes();
  const { entries } = notes;
  const { toast } = useToast();

  const [openId, setOpenId] = useState<string | null>(() => readJSON<string | null>(OPEN_KEY, null));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(readJSON<string[]>(EXPANDED_KEY, [])));
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  // Phones: one pane at a time — the tree, or the open note/folder.
  const [mobileMain, setMobileMain] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
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
    if (chain.some((f) => !expanded.has(f.id))) {
      setExpanded((cur) => new Set([...cur, ...chain.map((f) => f.id)]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id, entries.length]);

  // A note that was deleted (here or on another device) shouldn't leave a dangling selection.
  useEffect(() => {
    if (!notes.loading && openId && !open) setOpenId(null);
  }, [notes.loading, openId, open]);

  useEffect(() => {
    if (freshId && open?.id === freshId) {
      titleRef.current?.focus();
      setFreshId(null);
    }
  }, [freshId, open?.id]);

  /** Where «new» lands: the open folder, or the folder of the open note, else the root. */
  const contextFolder = open ? (open.kind === "folder" ? open.id : open.parentId) : null;

  function select(id: string | null) {
    setOpenId(id);
    setMobileMain(true);
  }

  function newNote(parentId: string | null = contextFolder) {
    const n = notes.create("note", parentId);
    if (parentId) setExpanded((cur) => new Set([...cur, parentId]));
    setQuery("");
    setFreshId(n.id);
    select(n.id);
  }

  function newFolder(parentId: string | null = contextFolder) {
    const f = notes.create("folder", parentId, "Новая папка");
    if (parentId) setExpanded((cur) => new Set([...cur, parentId]));
    setQuery("");
    setRenamingId(f.id);
  }

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
    notes.update(id, { parentId: target });
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
    if (count === 0) {
      toast("В выбранном нет .md файлов");
      return;
    }
    notes.importEntries(added);
    if (importParent.current) setExpanded((cur) => new Set([...cur, importParent.current!]));
    toast(`Импортировано заметок: ${count}`);
  }

  // ── Drag & drop (native — notes and folders into folders, or onto the vault root) ─────────
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
    () =>
      query.trim()
        ? entries
            .filter((e) => e.kind === "note" && matchesNoteQuery(e, query))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : [],
    [entries, query]
  );

  // ── Tree ──────────────────────────────────────────────────────────────────────────────────

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
          onDragEnd={() => { dragId.current = null; setDropTarget(null); }}
          {...(isFolder ? dragProps(e.id) : {})}
          className={cn(
            "group flex h-8 items-center gap-1 rounded-md pr-1 text-sm transition-colors",
            active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            dropTarget === e.id && "bg-brand/15 text-foreground ring-1 ring-brand/50"
          )}
          style={{ paddingLeft: `${depth * 0.875 + 0.25}rem` }}
        >
          {isFolder ? (
            <button
              type="button"
              aria-label={isOpen ? "Свернуть" : "Развернуть"}
              onClick={() => toggle(e.id)}
              className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          {renamingId === e.id ? (
            <RenameInput
              initial={e.title}
              onDone={(title) => {
                setRenamingId(null);
                if (title !== null && title !== e.title) notes.update(e.id, { title });
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => { if (isFolder && !isOpen) toggle(e.id); select(e.id); }}
              onDoubleClick={() => setRenamingId(e.id)}
              className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left focus-visible:outline-none"
              title={e.title || UNTITLED}
            >
              {isFolder ? (
                isOpen ? <FolderOpen className="h-4 w-4 shrink-0 text-brand" /> : <Folder className="h-4 w-4 shrink-0 text-brand" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 opacity-70" />
              )}
              <span className={cn("truncate", !e.title && "italic opacity-60", isFolder && "font-medium")}>{e.title || UNTITLED}</span>
              {isFolder && count > 0 && <span className="ml-auto pl-1 text-xs tabular-nums opacity-50 group-hover:hidden">{count}</span>}
            </button>
          )}
          {renamingId !== e.id && (
            <div className="ml-auto hidden shrink-0 items-center group-hover:flex group-focus-within:flex">
              {isFolder && (
                <RowIcon title="Новая заметка в папке" onClick={() => newNote(e.id)}>
                  <FilePlus2 className="h-3.5 w-3.5" />
                </RowIcon>
              )}
              <EntryMenu
                entry={e}
                onNewNote={() => newNote(e.id)}
                onNewFolder={() => newFolder(e.id)}
                onImport={() => pickImport("folder", e.id)}
                onRename={() => setRenamingId(e.id)}
                onDelete={() => setConfirmId(e.id)}
              />
            </div>
          )}
        </div>
        {kids.length > 0 && <ul>{kids.map((k) => renderRow(k, depth + 1))}</ul>}
      </li>
    );
  }

  const roots = childrenOf(entries, null);

  const sidebar = (
    <aside
      className={cn(
        "flex min-h-0 w-full flex-col border-border md:w-72 md:shrink-0 md:border-r",
        mobileMain && "hidden md:flex"
      )}
    >
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Поиск по заметкам…"
            className="h-8 pl-8 pr-7 text-sm"
          />
          {query && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" className="h-8 flex-1" onClick={() => newNote()}>
            <FilePlus2 className="h-4 w-4" /> Заметка
          </Button>
          <Button size="sm" variant="outline" className="h-8 w-8 px-0" title="Новая папка" aria-label="Новая папка" onClick={() => newFolder()}>
            <FolderPlus className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 w-8 px-0" title="Импорт из Obsidian" aria-label="Импорт">
                <Upload className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => pickImport("folder", null)}>
                <FolderOpen /> Папку (хранилище Obsidian)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => pickImport("files", null)}>
                <FileText /> Файлы .md
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" {...dragProps(null)}>
        {query.trim() ? (
          <SearchResults results={results} entries={entries} q={query} openId={openId} onOpen={select} />
        ) : (
          <>
            <button
              type="button"
              onClick={() => select(null)}
              className={cn(
                "mb-1 flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors",
                openId === null ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                dropTarget === "root" && "ring-1 ring-brand/50"
              )}
            >
              <NotebookPen className="h-4 w-4" />
              <span className="font-medium">Все заметки</span>
              <span className="ml-auto text-xs tabular-nums opacity-50">{noteCount}</span>
            </button>
            {notes.loading ? (
              <div className="flex flex-col gap-1.5 px-2 pt-1">
                {[70, 55, 80, 45].map((w, i) => (
                  <div key={i} className="h-5 animate-pulse rounded bg-secondary/60" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : roots.length === 0 ? (
              <p className="px-2 pt-2 text-xs leading-relaxed text-muted-foreground">
                Пока пусто. Создайте папку под курс и первую заметку — или импортируйте хранилище Obsidian.
              </p>
            ) : (
              <ul>{roots.map((e) => renderRow(e, 0))}</ul>
            )}
          </>
        )}
      </div>

      <SyncLine cloud={notes.cloud} saving={notes.saving} loading={notes.loading} error={notes.error} />
    </aside>
  );

  // ── Main pane ─────────────────────────────────────────────────────────────────────────────

  let main: ReactNode;
  if (open?.kind === "note") {
    const chain = pathOf(entries, open.id);
    main = (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground md:px-6">
          <button type="button" className="md:hidden" onClick={() => setMobileMain(false)} aria-label="К списку">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <nav className="flex min-w-0 items-center gap-1 overflow-hidden" aria-label="Путь">
            <button type="button" className="shrink-0 hover:text-foreground" onClick={() => select(null)}>Заметки</button>
            {chain.map((f) => (
              <span key={f.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                <button type="button" className="truncate hover:text-foreground" onClick={() => select(f.id)}>{f.title || UNTITLED}</button>
              </span>
            ))}
          </nav>
          <span className="ml-auto hidden shrink-0 sm:inline" title={`Создано ${noteDate(open.createdAt)}`}>
            Изменено {noteDate(open.updatedAt)}
          </span>
          <div className="ml-auto sm:ml-0">
            <EntryMenu
              entry={open}
              folders={entries.filter((x) => x.kind === "folder")}
              onMove={(target) => move(open.id, target)}
              onRename={() => titleRef.current?.focus()}
              onDelete={() => setConfirmId(open.id)}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-6 md:px-12">
            <input
              ref={titleRef}
              value={open.title}
              onChange={(e) => notes.update(open.id, { title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "ArrowDown") {
                  e.preventDefault();
                  (document.querySelector(".note-prose") as HTMLElement | null)?.focus();
                }
              }}
              placeholder={UNTITLED}
              className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50 md:text-3xl"
            />
          </div>
          <NoteEditor
            key={open.id}
            initial={open.content}
            onChange={(content) => notes.update(open.id, { content })}
            onOpenNote={select}
          />
        </div>
      </div>
    );
  } else {
    main = (
      <FolderView
        folder={open}
        entries={entries}
        onBack={() => setMobileMain(false)}
        onOpen={select}
        onNewNote={() => newNote(open?.id ?? null)}
        onNewFolder={() => newFolder(open?.id ?? null)}
        onRename={() => open && setRenamingId(open.id)}
        onDelete={() => open && setConfirmId(open.id)}
        loading={notes.loading}
      />
    );
  }

  const confirmEntry = entries.find((e) => e.id === confirmId);
  const confirmCount = confirmEntry ? subtreeIds(entries, confirmEntry.id).size - 1 : 0;

  return (
    <div className="flex h-[calc(100dvh-15rem)] min-h-[26rem] overflow-hidden rounded-xl border border-border bg-card/40 md:h-[calc(100dvh-11.5rem)]">
      {sidebar}
      <section className={cn("min-w-0 flex-1 flex-col", mobileMain ? "flex" : "hidden md:flex")}>{main}</section>

      <input
        ref={folderInput}
        type="file"
        className="hidden"
        // Non-standard but supported by every desktop browser: pick a whole folder, keep its paths.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        multiple
        onChange={(e) => void onPicked(e.target.files, e.currentTarget)}
      />
      <input
        ref={filesInput}
        type="file"
        className="hidden"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        multiple
        onChange={(e) => void onPicked(e.target.files, e.currentTarget)}
      />

      <ConfirmDialog
        open={!!confirmEntry}
        onOpenChange={(v) => !v && setConfirmId(null)}
        title={confirmEntry?.kind === "folder" ? `Удалить папку «${confirmEntry.title}»?` : "Удалить заметку?"}
        description={
          confirmEntry?.kind === "folder"
            ? confirmCount > 0
              ? `Вместе с ней удалится всё внутри: ${confirmCount}. Сразу после удаления можно нажать «Вернуть».`
              : "Папка пустая."
            : `«${confirmEntry?.title || UNTITLED}» — сразу после удаления можно нажать «Вернуть».`
        }
        onConfirm={() => {
          if (!confirmEntry) return;
          if (confirmEntry.id === openId || subtreeIds(entries, confirmEntry.id).has(openId ?? "")) {
            setOpenId(confirmEntry.parentId);
          }
          notes.remove(confirmEntry.id);
        }}
      />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────────────────────

function RowIcon({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
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
      className="h-6 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-sm text-foreground outline-none"
    />
  );
}

function EntryMenu({
  entry,
  folders,
  onNewNote,
  onNewFolder,
  onImport,
  onMove,
  onRename,
  onDelete,
}: {
  entry: NoteEntry;
  folders?: NoteEntry[];
  onNewNote?: () => void;
  onNewFolder?: () => void;
  onImport?: () => void;
  onMove?: (target: string | null) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [moving, setMoving] = useState(false);
  return (
    <DropdownMenu onOpenChange={(v) => !v && setMoving(false)}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Действия"
          title="Действия"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        {moving && folders && onMove ? (
          <>
            <DropdownMenuItem onClick={() => onMove(null)} disabled={entry.parentId === null}>
              <NotebookPen /> Корень
            </DropdownMenuItem>
            {folders
              .filter((f) => f.id !== entry.parentId)
              .sort((a, b) => a.title.localeCompare(b.title, "ru"))
              .map((f) => (
                <DropdownMenuItem key={f.id} onClick={() => onMove(f.id)}>
                  <Folder /> <span className="truncate">{f.title || UNTITLED}</span>
                </DropdownMenuItem>
              ))}
          </>
        ) : (
          <>
            {onNewNote && <DropdownMenuItem onClick={onNewNote}><FilePlus2 /> Новая заметка</DropdownMenuItem>}
            {onNewFolder && <DropdownMenuItem onClick={onNewFolder}><FolderPlus /> Вложенная папка</DropdownMenuItem>}
            {onImport && <DropdownMenuItem onClick={onImport}><Upload /> Импорт сюда</DropdownMenuItem>}
            {(onNewNote || onNewFolder || onImport) && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={onRename}><Pencil /> Переименовать</DropdownMenuItem>
            {folders && onMove && folders.length > 0 && (
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setMoving(true); }}>
                <Folder /> Переместить в…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDelete} className="text-risk focus:text-risk [&_svg]:text-risk">
              <Trash2 /> Удалить
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SearchResults({
  results,
  entries,
  q,
  openId,
  onOpen,
}: {
  results: NoteEntry[];
  entries: NoteEntry[];
  q: string;
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  if (results.length === 0) {
    return <p className="px-2 pt-2 text-xs text-muted-foreground">Ничего не нашлось по «{q.trim()}».</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      <li className="px-2 pb-1 text-xs text-muted-foreground">Найдено: {results.length}</li>
      {results.map((n) => {
        const path = pathOf(entries, n.id).map((f) => f.title).join(" / ");
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onOpen(n.id)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
                n.id === openId ? "bg-accent" : "hover:bg-accent/50"
              )}
            >
              <span className="truncate text-sm font-medium"><Highlight text={n.title || UNTITLED} q={q} /></span>
              <span className="line-clamp-2 text-xs text-muted-foreground"><Highlight text={snippet(n.content, q, 120)} q={q} /></span>
              <span className="truncate text-[11px] text-muted-foreground/70">{path ? `${path} · ` : ""}{noteDate(n.updatedAt)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FolderView({
  folder,
  entries,
  loading,
  onBack,
  onOpen,
  onNewNote,
  onNewFolder,
  onRename,
  onDelete,
}: {
  folder: NoteEntry | null;
  entries: NoteEntry[];
  loading: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  // A folder shows its sub-folders, then its notes newest first; «Все заметки» shows recent notes.
  const subfolders = folder ? childrenOf(entries, folder.id).filter((e) => e.kind === "folder") : [];
  const list = folder
    ? entries.filter((e) => e.parentId === folder.id && e.kind === "note")
    : entries.filter((e) => e.kind === "note");
  const sorted = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const chain = folder ? pathOf(entries, folder.id) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:px-6">
        <button type="button" className="text-muted-foreground md:hidden" onClick={onBack} aria-label="К списку">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          {chain.length > 0 && (
            <p className="truncate text-xs text-muted-foreground">{chain.map((f) => f.title).join(" / ")}</p>
          )}
          <h2 className="flex items-center gap-2 truncate text-lg font-semibold">
            {folder ? <FolderOpen className="h-5 w-5 shrink-0 text-brand" /> : <NotebookPen className="h-5 w-5 shrink-0" />}
            <span className="truncate">{folder ? folder.title || UNTITLED : "Все заметки"}</span>
          </h2>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button size="sm" className="h-8" onClick={onNewNote}><FilePlus2 className="h-4 w-4" /> Заметка</Button>
          <Button size="sm" variant="outline" className="h-8 w-8 px-0" onClick={onNewFolder} title="Новая папка" aria-label="Новая папка">
            <FolderPlus className="h-4 w-4" />
          </Button>
          {folder && (
            <>
              <Button size="sm" variant="outline" className="h-8 w-8 px-0" onClick={onRename} title="Переименовать" aria-label="Переименовать">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 w-8 px-0 text-risk" onClick={onDelete} title="Удалить папку" aria-label="Удалить папку">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-6">
        {!folder && <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Недавние</p>}
        {subfolders.length > 0 && (
          <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
            {subfolders.map((f) => {
              const n = subtreeIds(entries, f.id).size - 1;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onOpen(f.id)}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50"
                >
                  <Folder className="h-4 w-4 shrink-0 text-brand" />
                  <span className="truncate font-medium">{f.title || UNTITLED}</span>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">{n}</span>
                </button>
              );
            })}
          </div>
        )}
        {loading ? null : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <NotebookPen className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              {folder ? "В этой папке пока нет заметок." : "Здесь будут ваши конспекты."}
            </p>
            <Button size="sm" onClick={onNewNote}><FilePlus2 className="h-4 w-4" /> Новая заметка</Button>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {sorted.map((n) => {
              const where = !folder ? pathOf(entries, n.id).map((f) => f.title).join(" / ") : "";
              const text = snippet(n.content);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(n.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn("truncate text-sm font-medium", !n.title && "italic text-muted-foreground")}>{n.title || UNTITLED}</span>
                      {text && <span className="line-clamp-1 text-xs text-muted-foreground">{text}</span>}
                      {where && <span className="truncate text-[11px] text-muted-foreground/70">{where}</span>}
                    </span>
                    <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{noteDate(n.updatedAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SyncLine({ cloud, saving, loading, error }: { cloud: boolean; saving: boolean; loading: boolean; error: string | null }) {
  return (
    <div className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-[11px] text-muted-foreground" title={error ?? undefined}>
      {loading || saving ? (
        <><Loader2 className="h-3 w-3 animate-spin" /> {loading ? "Загружаю…" : "Сохраняю…"}</>
      ) : cloud ? (
        <><Check className="h-3 w-3" /> Сохранено в облаке</>
      ) : (
        <><CloudOff className="h-3 w-3" /> Только в этом браузере{error ? " — нужен SQL" : ""}</>
      )}
    </div>
  );
}
