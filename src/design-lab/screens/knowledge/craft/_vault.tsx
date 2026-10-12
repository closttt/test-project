/**
 * База знаний · «Конспекты» — the Obsidian-style vault as one tile: folder tree with counts and its
 * own search on the left, the chosen folder's sub-folders and notes on the right (date on the
 * right, trash on hover). Same abilities as the old page's vault: nested folders, new note / folder
 * anywhere, rename, move (drag onto a folder or «Переместить в…» inside the note), delete with
 * «Вернуть», search across titles and text, import of an Obsidian folder or .md files.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ChevronRight, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, NotebookPen, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";

import { Btn, C, IconBtn, R, T, dashed } from "@/design-lab/screens/_kit/craft";
import { childrenOf, entriesFromFiles, pathOf, subtreeIds, type ImportFile, type NoteEntry } from "@/lib/knowledgeNotes";
import { ConfirmDialog, MenuRow, NameDialog, NoteRow, RowAct, SM, TINT, matchNote, noteCount, noteTitle, plural, useOutside, type Knowledge } from "./_parts";

const EXPANDED_KEY = "crm-notes-expanded-v1"; // same key the old vault used — the tree opens as you left it

function readExpanded(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? (v as string[]) : []);
  } catch {
    return new Set();
  }
}

async function readPicked(list: FileList | null): Promise<ImportFile[]> {
  if (!list) return [];
  return Promise.all([...list].map(async (f) => ({ path: f.webkitRelativePath || f.name, content: await f.text(), lastModified: f.lastModified })));
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
        if (e.key === "Escape") {
          e.stopPropagation();
          finish(null);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="min-w-0 flex-1 bg-transparent px-1 outline-none"
      style={{ height: 28, fontSize: 14, color: C.text, borderRadius: 8, background: C.raise }}
    />
  );
}

export function VaultPanel({
  k,
  folder,
  setFolder,
  globalQuery,
  onOpenNote,
  compact,
  stacked,
}: {
  k: Knowledge;
  /** Selected folder; null = «Все заметки». */
  folder: string | null;
  setFolder: (id: string | null) => void;
  /** The page-wide search also narrows the notes. */
  globalQuery: string;
  onOpenNote: (id: string, fresh?: boolean) => void;
  compact?: boolean;
  /** Phones: the tree sits above the list instead of beside it. */
  stacked?: boolean;
}) {
  const { entries } = k.vault;
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(readExpanded);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [confirm, setConfirm] = useState<NoteEntry | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const dragId = useRef<string | null>(null);
  const importRef = useRef<HTMLDivElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  useOutside(importRef, importOpen, () => setImportOpen(false));

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      /* remembering the tree is a convenience */
    }
  }, [expanded]);

  // The selected folder's parents unfold, so the tree always shows where you are.
  useEffect(() => {
    if (!folder) return;
    const chain = pathOf(entries, folder);
    if (chain.some((f) => !expanded.has(f.id))) setExpanded((c) => new Set([...c, ...chain.map((f) => f.id)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, entries.length]);

  // A folder deleted (here or elsewhere) shouldn't stay selected.
  const current = folder ? entries.find((e) => e.id === folder && e.kind === "folder") : undefined;
  useEffect(() => {
    if (!k.vault.loading && folder && !current) setFolder(null);
  }, [k.vault.loading, folder, current, setFolder]);

  const q = (query || globalQuery).trim().toLowerCase();
  const total = k.vault.notes.length;

  const list = useMemo(() => {
    const src = q ? k.vault.notes.filter((n) => matchNote(n, q)) : folder ? k.vault.notes.filter((n) => n.parentId === folder) : k.vault.notes;
    return [...src].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [k.vault.notes, folder, q]);
  const subfolders = !q && folder ? childrenOf(entries, folder).filter((e) => e.kind === "folder") : [];

  const toggle = (id: string) =>
    setExpanded((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const newNote = (parentId: string | null = folder) => {
    const n = k.vault.create("note", parentId, "", { draft: true });
    if (parentId) setExpanded((c) => new Set([...c, parentId]));
    onOpenNote(n.id, true);
  };

  const askDelete = (e: NoteEntry) => {
    const inside = subtreeIds(entries, e.id).size - 1;
    if (e.kind === "folder" && inside > 0) setConfirm(e);
    else doDelete(e);
  };
  const doDelete = (e: NoteEntry) => {
    if (folder && subtreeIds(entries, e.id).has(folder)) setFolder(e.parentId);
    k.vault.remove(e.id);
  };

  const move = (id: string, target: string | null) => {
    k.vault.move(id, target);
    if (target) setExpanded((c) => new Set([...c, target]));
  };

  async function onPicked(input: HTMLInputElement) {
    const files = await readPicked(input.files);
    input.value = "";
    const added = entriesFromFiles(entries, files, folder);
    const count = added.filter((a) => a.kind === "note").length;
    if (count === 0) return k.toast("В выбранном нет .md файлов");
    k.vault.importEntries(added);
    if (folder) setExpanded((c) => new Set([...c, folder]));
    k.toast(`Импортировано заметок: ${count}`);
  }

  // Native drag & drop: notes and folders onto a folder in the tree, or onto «Все заметки» (root).
  function dropProps(target: string | null) {
    const key = target ?? "root";
    const ok = () => {
      const id = dragId.current;
      if (!id || id === target) return false;
      const e = entries.find((x) => x.id === id);
      if (!e || e.parentId === target) return false;
      return target === null || !subtreeIds(entries, id).has(target);
    };
    return {
      onDragOver: (e: DragEvent) => {
        if (!ok()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget !== key) setDropTarget(key);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && dropTarget === key) setDropTarget(null);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        if (ok() && dragId.current) move(dragId.current, target);
        dragId.current = null;
        setDropTarget(null);
      },
    };
  }
  const dragSource = (id: string) => ({
    onDragStart: () => (dragId.current = id),
    onDragEnd: () => {
      dragId.current = null;
      setDropTarget(null);
    },
  });

  // A plain render function (not a component): rows keep their DOM across re-renders, so a drag
  // in progress or an open rename survives state updates.
  function treeRow(e: NoteEntry, depth: number): ReactNode {
    const open = expanded.has(e.id);
    const kids = childrenOf(entries, e.id).filter((x) => x.kind === "folder");
    const on = folder === e.id && !q;
    const dropping = dropTarget === e.id;
    return (
      <li key={e.id}>
        <div
          draggable={renaming !== e.id}
          onDragStart={(ev) => {
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", e.title);
            dragId.current = e.id;
          }}
          onDragEnd={dragSource(e.id).onDragEnd}
          {...dropProps(e.id)}
          onClick={() => {
            setQuery("");
            setFolder(e.id);
            if (!open && kids.length) toggle(e.id);
          }}
          onDoubleClick={() => setRenaming(e.id)}
          className={`group flex cursor-pointer items-center gap-1.5 pr-1 transition-colors duration-150 ${on || dropping ? "" : "hover:bg-[#17171A]"}`}
          style={{ height: 36, borderRadius: 10, paddingLeft: depth * 14 + 4, background: on || dropping ? TINT : undefined }}
          title={noteTitle(e)}
        >
          {kids.length ? (
            <button
              type="button"
              aria-label={open ? "Свернуть" : "Развернуть"}
              onClick={(ev) => {
                ev.stopPropagation();
                toggle(e.id);
              }}
              className="grid h-6 w-5 shrink-0 place-items-center"
              style={{ color: C.text3 }}
            >
              <ChevronRight size={14} strokeWidth={1.75} style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform .15s" }} />
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          {open && kids.length ? <FolderOpen size={16} strokeWidth={1.75} color={on ? C.accent : C.text2} className="shrink-0" /> : <Folder size={16} strokeWidth={1.75} color={on ? C.accent : C.text2} className="shrink-0" />}
          {renaming === e.id ? (
            <RenameInput
              initial={e.title}
              onDone={(title) => {
                setRenaming(null);
                if (title !== null && title !== e.title) k.vault.update(e.id, { title });
              }}
            />
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate pl-1" style={{ ...T.body, color: on ? C.text : C.text2 }}>
                {noteTitle(e)}
              </span>
              <span className="shrink-0 pr-2 group-hover:hidden" style={{ ...T.foot, ...T.num, fontWeight: 400, color: on ? "#5AA9FF" : C.text3 }}>
                {noteCount(entries, e.id)}
              </span>
              <span className="hidden shrink-0 items-center group-hover:flex">
                <RowAct title="Новая заметка в папке" onClick={() => newNote(e.id)}>
                  <FilePlus2 size={14} strokeWidth={1.75} />
                </RowAct>
                <RowAct title="Переименовать" onClick={() => setRenaming(e.id)}>
                  <Pencil size={14} strokeWidth={1.75} />
                </RowAct>
                <RowAct title="Удалить папку" danger onClick={() => askDelete(e)}>
                  <Trash2 size={14} strokeWidth={1.75} />
                </RowAct>
              </span>
            </>
          )}
        </div>
        {open && kids.length > 0 && (
          <ul>
            {kids.map((c) => treeRow(c, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  const roots = childrenOf(entries, null).filter((e) => e.kind === "folder");
  const chain = current ? pathOf(entries, current.id) : [];
  const rootOn = folder === null && !q;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 shrink-0" style={{ color: C.text2 }}>
            <NotebookPen size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 style={T.title}>Конспекты</h2>
            <div style={{ ...T.body, color: C.text2, marginTop: 4 }}>
              {total} {plural(total, "заметка", "заметки", "заметок")} · {k.vault.folders.length} {plural(k.vault.folders.length, "папка", "папки", "папок")}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div ref={importRef} className="relative">
            <IconBtn size={36} title="Импорт из Obsidian" onClick={() => setImportOpen((o) => !o)}>
              <Upload size={15} strokeWidth={1.75} />
            </IconBtn>
            {importOpen && (
              <div className="absolute right-0 z-40 flex flex-col p-2" style={{ top: 44, width: 260, background: C.panel, borderRadius: R.card, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 24px 60px rgba(0,0,0,0.55)` }}>
                <MenuRow
                  icon={<FolderOpen {...SM} />}
                  onClick={() => {
                    setImportOpen(false);
                    folderInput.current?.click();
                  }}
                >
                  Папку Obsidian
                </MenuRow>
                <MenuRow
                  icon={<FileText {...SM} />}
                  onClick={() => {
                    setImportOpen(false);
                    filesInput.current?.click();
                  }}
                >
                  Файлы .md
                </MenuRow>
              </div>
            )}
          </div>
          <IconBtn size={36} title={current ? "Папка внутри выбранной" : "Новая папка"} onClick={() => setNewFolder(true)}>
            <FolderPlus size={15} strokeWidth={1.75} />
          </IconBtn>
          <Btn size={36} icon={<Plus size={15} strokeWidth={2} />} onClick={() => newNote()}>
            Заметка
          </Btn>
        </div>
      </div>

      <div className={`mt-5 flex min-h-0 ${stacked ? "flex-col" : ""}`} style={{ height: stacked ? undefined : 560 }}>
        {/* Tree */}
        <div
          className={`flex min-h-0 shrink-0 flex-col ${stacked ? "pb-3" : "pr-3"}`}
          style={stacked ? { maxHeight: 280, borderBottom: `1px solid ${C.line}` } : { width: compact ? 216 : 248, borderRight: `1px solid ${C.line}` }}
        >
          <label className="flex shrink-0 items-center gap-2 px-3" style={{ height: 40, borderRadius: 999, background: C.raise }}>
            <Search size={15} strokeWidth={1.75} color={C.text3} className="shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Поиск в конспектах"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
              style={{ fontSize: 14, color: C.text }}
            />
            {query && (
              <button type="button" aria-label="Очистить поиск" onClick={() => setQuery("")} style={{ color: C.text3 }}>
                <X size={14} strokeWidth={1.75} />
              </button>
            )}
          </label>
          <div className="kn-scroll -mr-1 mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <div
              {...dropProps(null)}
              onClick={() => {
                setQuery("");
                setFolder(null);
              }}
              className={`flex cursor-pointer items-center gap-2 px-2 transition-colors duration-150 ${rootOn || dropTarget === "root" ? "" : "hover:bg-[#17171A]"}`}
              style={{ height: 36, borderRadius: 10, background: rootOn || dropTarget === "root" ? TINT : undefined }}
            >
              <NotebookPen size={16} strokeWidth={1.75} color={rootOn ? C.accent : C.text2} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: rootOn ? C.text : C.text2 }}>
                Все заметки
              </span>
              <span className="pr-2" style={{ ...T.foot, ...T.num, fontWeight: 400, color: rootOn ? "#5AA9FF" : C.text3 }}>
                {total}
              </span>
            </div>
            {k.vault.loading ? (
              <div className="flex flex-col gap-2 px-2 pt-3">
                {[70, 55, 80, 45].map((w, i) => (
                  <div key={i} className="h-4 animate-pulse" style={{ width: `${w}%`, borderRadius: 6, background: C.raise }} />
                ))}
              </div>
            ) : (
              <ul className="mt-0.5">
                {roots.map((e) => treeRow(e, 0))}
              </ul>
            )}
          </div>
        </div>

        {/* Folder contents / search results */}
        <div className={`flex min-h-0 min-w-0 flex-col ${stacked ? "flex-none pt-2" : "flex-1 pl-3"}`} style={stacked ? { height: 480 } : undefined}>
          <div className="flex shrink-0 items-baseline gap-3 px-4 pb-3" style={{ minHeight: 40, paddingTop: 10 }}>
            <span className="min-w-0 truncate" style={{ ...T.cell, fontWeight: 500 }}>
              {q ? `Найдено: ${list.length}` : current ? noteTitle(current) : "Все заметки"}
            </span>
            {!q && chain.length > 0 && (
              <span className="min-w-0 truncate" style={{ ...T.foot, color: C.text3 }}>
                {chain.map((f) => noteTitle(f)).join(" / ")}
              </span>
            )}
          </div>
          <div className="kn-scroll min-h-0 flex-1 overflow-y-auto" style={{ borderTop: `1px solid ${C.line}` }}>
            {subfolders.map((f) => (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                draggable
                {...dragSource(f.id)}
                {...dropProps(f.id)}
                onClick={() => setFolder(f.id)}
                onKeyDown={(e) => e.key === "Enter" && setFolder(f.id)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-3 outline-none transition-colors duration-150 ${dropTarget === f.id ? "" : "hover:bg-[#17171A]"}`}
                style={{ ...dashed, background: dropTarget === f.id ? TINT : undefined }}
              >
                <Folder size={16} strokeWidth={1.75} color={C.text2} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate" style={{ ...T.body, fontSize: 15, fontWeight: 500 }}>
                  {noteTitle(f)}
                </span>
                <span style={{ ...T.foot, ...T.num, fontWeight: 400, color: C.text3 }}>{noteCount(entries, f.id)}</span>
              </div>
            ))}
            {list.map((n, idx) => (
              <div key={n.id} data-lab-block={idx === 0 ? "note-row" : undefined} {...dragSource(n.id)}>
                <NoteRow k={k} n={n} q={q} showPath={!folder || !!q} draggable onOpen={() => onOpenNote(n.id)} onDelete={() => askDelete(n)} />
              </div>
            ))}
            {!k.vault.loading && list.length === 0 && subfolders.length === 0 && (
              <div className="grid place-items-center py-16" style={{ ...T.body, color: C.text3 }}>
                {q ? "Ничего не нашлось" : current ? "В этой папке пока пусто" : "Заметок пока нет"}
              </div>
            )}
          </div>
        </div>
      </div>

      <input
        ref={folderInput}
        type="file"
        className="hidden"
        // Non-standard but supported by every desktop browser: pick a whole folder, keep its paths.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        multiple
        onChange={(e) => void onPicked(e.currentTarget)}
      />
      <input ref={filesInput} type="file" className="hidden" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple onChange={(e) => void onPicked(e.currentTarget)} />

      {newFolder && (
        <NameDialog
          title={current ? `Папка в «${noteTitle(current)}»` : "Новая папка"}
          placeholder="Название папки"
          onClose={() => setNewFolder(false)}
          onSave={(t) => {
            const f = k.vault.create("folder", folder, t);
            if (folder) setExpanded((c) => new Set([...c, folder]));
            setFolder(f.id);
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`Удалить папку «${noteTitle(confirm)}»?`}
          text={`Вместе с ней удалится всё внутри: ${subtreeIds(entries, confirm.id).size - 1}. Сразу после удаления можно нажать «Вернуть».`}
          onConfirm={() => doDelete(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

