/**
 * «Индекс» · Заметки — an editorial two-pane on the four columns: the list (pinned first, then the
 * rest) in column 1, the open note set as a page in columns 2–3, its properties and actions in
 * column 4. No dialog: the right side is always a writing surface — with nothing open it is a
 * blank note, and typing creates it. One lime element: «Новая заметка».
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Reorder } from "framer-motion";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { pushUndo } from "@/lib/undoStack";
import { pushRecent } from "@/lib/recent";
import { isNotionConnected, loadNotionTarget, notionCreatePage } from "@/lib/notion";
import type { Note } from "@/types";
import { B, T, tab, pad2, Page, PageHeader, Button, KV, Empty, plural } from "@/design-lab/screens/_kit/index";
import {
  SearchField,
  Seg,
  TagToggle,
  Menu,
  ActionRow,
  Caps,
  InlineInput,
  IxEditor,
  ProseStyles,
  TitleField,
  focusProse,
  whenLabel,
  wordCount,
} from "./Notes.parts";

const NONE = "none";
type Sort = "pinned" | "newest" | "oldest" | "title";

function plainSubtitle(body: string): string {
  const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.replace(/^#+\s*/, "").replace(/^[-*]\s*(\[.\]\s*)?/, "").replace(/[*_`]/g, "").slice(0, 160);
}

const OPEN_TASK = /^\s*-\s\[ \]\s(.+)$/;

export default function Notes() {
  const { notes, allNotes, projects, allProjects, addNote, updateNote, reorderNotes, toggleNotePin, deleteNote, restoreNote, addTask, archiveNote, unarchiveNote } =
    useData();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>(NONE);
  const [sortBy, setSortBy] = useState<Sort>("pinned");
  const [selId, setSelId] = useState<string | null>(null);
  /** «Новая заметка» pressed: keep the blank page even though notes exist. */
  const [composing, setComposing] = useState(false);
  /** Remounts the editor only when the user switches notes — not when a draft becomes a note. */
  const [editorKey, setEditorKey] = useState("draft-0");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  const allTags = useMemo(() => Array.from(new Set(notes.flatMap((n) => n.tags))).sort(), [notes]);
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      notes
        .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
        .filter((n) => !activeTag || n.tags.includes(activeTag))
        .filter((n) => projectFilter === NONE || n.linkedProjectId === projectFilter)
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
          if (a.pinned && sortBy === "pinned") {
            const oa = a.order ?? Number.MAX_SAFE_INTEGER;
            const ob = b.order ?? Number.MAX_SAFE_INTEGER;
            if (oa !== ob) return oa - ob;
          }
          if (sortBy === "oldest") return a.createdAt.localeCompare(b.createdAt);
          if (sortBy === "title") return a.title.localeCompare(b.title);
          return b.createdAt.localeCompare(a.createdAt);
        }),
    [notes, q, activeTag, projectFilter, sortBy]
  );
  const pinned = visible.filter((n) => n.pinned);
  const rest = visible.filter((n) => !n.pinned);
  const canReorderPins = sortBy === "pinned" && !q && !activeTag && projectFilter === NONE && pinned.length > 1;

  const sel = allNotes.find((n) => n.id === selId) ?? null;

  // Open the first note on arrival, so the right side reads, not waits.
  useEffect(() => {
    if (!selId && !composing && visible.length) {
      setSelId(visible[0].id);
      setEditorKey(`n-${visible[0].id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length]);

  // Deep link from the command palette: { openNoteId }.
  useEffect(() => {
    const openId = (location.state as { openNoteId?: string } | null)?.openNoteId;
    if (!openId) return;
    if (allNotes.some((n) => n.id === openId)) select(openId);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  /** Leaving an untouched blank note drops it — no «Без названия» litter. */
  function dropIfBlank() {
    if (sel && !sel.title.trim() && !sel.body.trim()) deleteNote(sel.id);
  }

  function select(id: string) {
    if (id === selId) return;
    dropIfBlank();
    setSelId(id);
    setComposing(false);
    setEditorKey(`n-${id}`);
    const n = allNotes.find((x) => x.id === id);
    if (n) pushRecent({ id: n.id, label: n.title || "Без названия", to: "/notes", state: { openNoteId: n.id } });
  }

  function startNew() {
    dropIfBlank();
    setSelId(null);
    setComposing(true);
    setEditorKey(`draft-${Date.now()}`);
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  /** First keystroke on the blank page creates the note; it inherits the active filters. */
  function ensureNote(patch: Partial<Pick<Note, "title" | "body">>): string {
    if (sel) return sel.id;
    const id = addNote({
      title: patch.title ?? "",
      body: patch.body ?? "",
      pinned: false,
      tags: activeTag ? [activeTag] : [],
      linkedProjectId: projectFilter === NONE ? undefined : projectFilter,
    });
    setSelId(id);
    setComposing(false);
    return id;
  }

  function setTitle(v: string) {
    if (sel) updateNote(sel.id, { title: v });
    else ensureNote({ title: v });
  }
  function setBody(md: string) {
    if (sel) updateNote(sel.id, { body: md });
    else ensureNote({ body: md });
  }

  function remove(note: Note) {
    deleteNote(note.id);
    setSelId(null);
    setComposing(false);
    const run = pushUndo("Заметка удалена", () => restoreNote(note));
    toast("Заметка удалена", { actionLabel: "Вернуть", onAction: run });
  }

  function archive(note: Note) {
    archiveNote(note.id);
    setSelId(null);
    setComposing(false);
    const run = pushUndo("Заметка в архиве", () => unarchiveNote(note.id));
    toast("Заметка в архиве", { actionLabel: "Вернуть", onAction: run });
  }

  function extractTasks(note: Note) {
    const titles = note.body
      .split("\n")
      .map((l) => l.match(OPEN_TASK))
      .filter(Boolean)
      .map((m) => m![1].trim());
    if (!titles.length) return;
    titles.forEach((title) => addTask({ title, done: false, projectId: note.linkedProjectId }));
    toast(`Создано задач: ${titles.length}`);
  }

  async function sendToNotion(note: Note) {
    if (!isNotionConnected()) {
      toast("Notion не подключён", { actionLabel: "Настройки", onAction: () => navigate("/settings") });
      return;
    }
    if (!loadNotionTarget()) {
      toast("Выберите страницу Notion по умолчанию", { actionLabel: "Настройки", onAction: () => navigate("/settings") });
      return;
    }
    try {
      const page = await notionCreatePage({ title: note.title || "Заметка", markdown: note.body });
      toast("Отправлено в Notion", { actionLabel: "Открыть", onAction: () => window.open(page.url, "_blank", "noopener") });
    } catch {
      toast("Не удалось отправить в Notion — заметка осталась здесь");
    }
  }

  const pinnedCount = notes.filter((n) => n.pinned).length;
  const project = sel ? allProjects.find((p) => p.id === sel.linkedProjectId) : undefined;
  const openTasks = sel ? sel.body.split("\n").filter((l) => OPEN_TASK.test(l)).length : 0;
  const filterProject = projects.find((p) => p.id === projectFilter);

  // Running numbers across both groups.
  const numOf = new Map(visible.map((n, i) => [n.id, i + 1]));

  const row = (n: Note) => (
    <NoteRow key={n.id} note={n} num={numOf.get(n.id) ?? 0} active={n.id === selId} q={q} projectName={allProjects.find((p) => p.id === n.linkedProjectId)?.name} onSelect={() => select(n.id)} />
  );

  return (
    <Page>
      <ProseStyles />
      <PageHeader
        title="Заметки"
        deck={
          notes.length ? (
            <>
              {notes.length} {plural(notes.length, "заметка", "заметки", "заметок")}
              {pinnedCount ? <>, {pinnedCount} {plural(pinnedCount, "закреплена", "закреплены", "закреплено")}</> : null}. Черновики и итоги созвонов.
            </>
          ) : (
            "Мысли, черновики, итоги созвонов. Пишите справа — заметка сохранится сама."
          )
        }
        graphic="dots"
        seed={6}
        actions={<Button size="lg" onClick={startNew}>Новая заметка</Button>}
      />

      {/* ── Toolbar on the grid: search over the list, filters over the page ─────────────── */}
      {notes.length > 0 && (
        <div className="grid grid-cols-4 items-end gap-x-5">
          <SearchField value={query} onChange={setQuery} placeholder="Поиск по заметкам" />
          <div className="col-span-3 flex min-w-0 items-center gap-6 pl-5" style={{ borderBottom: `1px solid ${B.l10}`, minHeight: 40 }}>
            <Seg<Sort>
              label="Сортировка"
              value={sortBy}
              onChange={setSortBy}
              items={[
                { id: "pinned", label: "Закреплённые", title: "Закреплённые первыми, в вашем порядке" },
                { id: "newest", label: "Новые" },
                { id: "oldest", label: "Старые" },
                { id: "title", label: "А–Я" },
              ]}
            />
            {projects.length > 0 && (
              <Menu
                label="Фильтр по проекту"
                align="left"
                width={240}
                trigger={
                  <span className="flex h-8 items-center gap-1.5" style={{ ...T.body, color: filterProject ? B.text : undefined }}>
                    {filterProject ? filterProject.name : "Все проекты"}
                    <Caret />
                  </span>
                }
                items={[
                  { label: "Все проекты", onSelect: () => setProjectFilter(NONE), active: projectFilter === NONE },
                  { sep: true },
                  ...projects.map((p) => ({ label: p.name, onSelect: () => setProjectFilter(p.id), active: p.id === projectFilter })),
                ]}
              />
            )}
            {allTags.length > 0 && (
              <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 py-2">
                {allTags.slice(0, 8).map((t) => (
                  <TagToggle key={t} on={t === activeTag} onClick={() => setActiveTag(t === activeTag ? null : t)}>
                    #{t}
                  </TagToggle>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-10 grid grid-cols-4 gap-x-5">
        {/* ── 01 · the list ─────────────────────────────────────────────────────────────── */}
        <nav aria-label="Список заметок" className="sticky top-6 min-w-0 self-start">
          <div className="max-h-[calc(100vh-48px)] overflow-y-auto pr-1 [scrollbar-width:thin]">
            {notes.length === 0 ? (
              <Empty title="Заметок пока нет" text="Начните справа — заголовок, пара строк, и заметка на месте." seed={6} />
            ) : visible.length === 0 ? (
              <p className="py-6" style={{ ...T.body, color: B.text3 }}>
                Ничего не найдено{q ? ` по «${query.trim()}»` : ""}.
              </p>
            ) : (
              <>
                {pinned.length > 0 && (
                  <GroupHead title="Закреплённые" count={pinned.length} hint={canReorderPins ? "перетащите для порядка" : undefined} />
                )}
                {canReorderPins ? (
                  <Reorder.Group as="ul" axis="y" values={pinned} onReorder={(next) => reorderNotes(next.map((n) => n.id))}>
                    {pinned.map((n) => (
                      <Reorder.Item key={n.id} value={n} as="li" className="list-none" style={{ background: B.bg }}>
                        {row(n)}
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                ) : (
                  <ul>{pinned.map((n) => <li key={n.id}>{row(n)}</li>)}</ul>
                )}
                {rest.length > 0 && pinned.length > 0 && <GroupHead title="Остальные" count={rest.length} className="mt-8" />}
                {rest.length > 0 && pinned.length === 0 && <div style={{ borderTop: `1px solid ${B.l10}` }} />}
                <ul>{rest.map((n) => <li key={n.id}>{row(n)}</li>)}</ul>
              </>
            )}
          </div>
        </nav>

        {/* ── 02 · the page ─────────────────────────────────────────────────────────────── */}
        <article ref={paneRef} className="col-span-2 min-w-0 pl-5" style={{ borderLeft: `1px solid ${B.l7}` }}>
          <div className="flex h-6 items-center gap-3" style={{ ...T.meta, color: B.text3 }}>
            {sel ? (
              <>
                <span style={tab}>{pad2(numOf.get(sel.id) ?? 0)}</span>
                <span>{whenLabel(sel.createdAt)}</span>
                {sel.pinned && <span style={{ color: B.text2 }}>· закреплена</span>}
                {project && (
                  <Link to={`/projects/${project.id}`} className="truncate transition-colors hover:text-white">
                    · {project.name}
                  </Link>
                )}
              </>
            ) : (
              <span>Новая заметка · сохраняется сама, с первого символа</span>
            )}
          </div>
          <div className="mt-6">
            <TitleField
              inputRef={titleRef}
              value={sel?.title ?? ""}
              onChange={setTitle}
              onEnter={() => focusProse(paneRef.current)}
              placeholder="Заголовок"
              size={48}
            />
          </div>
          {sel && sel.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {sel.tags.map((t) => (
                <TagToggle key={t} on={t === activeTag} onClick={() => setActiveTag(t === activeTag ? null : t)}>
                  #{t}
                </TagToggle>
              ))}
            </div>
          )}
          <div className="mt-10">
            <IxEditor editorKey={editorKey} initial={sel?.body ?? ""} onChange={setBody} />
          </div>
        </article>

        {/* ── 03 · properties + actions ─────────────────────────────────────────────────── */}
        <aside className="sticky top-6 min-w-0 self-start pl-5" style={{ borderLeft: `1px solid ${B.l7}` }}>
          <Caps>Свойства</Caps>
          <div className="mt-3" style={{ borderTop: `1px solid ${B.l10}` }}>
            <KV
              k="Проект"
              v={
                <Menu
                  label="Привязать к проекту"
                  width={240}
                  trigger={
                    <span className="flex items-center gap-1.5" style={{ ...T.body, color: project ? B.text : B.text3 }}>
                      <span className="max-w-[150px] truncate">{project ? project.name : "не связано"}</span>
                      <Caret />
                    </span>
                  }
                  items={[
                    { label: "Не связано", onSelect: () => sel && updateNote(sel.id, { linkedProjectId: undefined }), active: !project, disabled: !sel },
                    { sep: true },
                    ...projects.map((p) => ({
                      label: p.name,
                      onSelect: () => updateNote(ensureNote({}), { linkedProjectId: p.id }),
                      active: p.id === sel?.linkedProjectId,
                    })),
                  ]}
                />
              }
            />
            <KV
              k="Теги"
              v={
                <InlineInput
                  align="right"
                  className="w-[150px]"
                  value={sel?.tags.join(", ") ?? ""}
                  placeholder="идеи, работа"
                  onCommit={(v) =>
                    updateNote(ensureNote({}), {
                      tags: Array.from(new Set(v.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean))),
                    })
                  }
                />
              }
            />
            <KV k="Создана" v={sel ? whenLabel(sel.createdAt) : "—"} />
            <KV k="Объём" v={sel ? `${wordCount(sel.body)} ${plural(wordCount(sel.body), "слово", "слова", "слов")}` : "—"} />
            <KV k="Открытые пункты" v={openTasks || "—"} last />
          </div>

          <Caps className="mt-10">Действия</Caps>
          <div className="mt-3" style={{ borderTop: `1px solid ${B.l10}` }}>
            <ActionRow onClick={() => sel && toggleNotePin(sel.id)} disabled={!sel} hint={sel?.pinned ? "вверху списка" : undefined}>
              {sel?.pinned ? "Открепить" : "Закрепить"}
            </ActionRow>
            <ActionRow onClick={() => sel && extractTasks(sel)} disabled={!sel || openTasks === 0} hint={openTasks || undefined}>
              Пункты → задачи
            </ActionRow>
            <ActionRow onClick={() => sel && sendToNotion(sel)} disabled={!sel}>
              Отправить в Notion
            </ActionRow>
            <ActionRow onClick={() => sel && archive(sel)} disabled={!sel}>
              В архив
            </ActionRow>
            <ActionRow onClick={() => sel && remove(sel)} disabled={!sel} danger>
              Удалить
            </ActionRow>
          </div>
          <p className="mt-6" style={{ ...T.meta, color: B.off }}>
            Markdown: # заголовок, - список, [ ] чекбокс, **жирный**. Enter в заголовке — к тексту.
          </p>
        </aside>
      </div>
    </Page>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

function GroupHead({ title, count, hint, className = "" }: { title: string; count: number; hint?: string; className?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 pb-3 ${className}`} style={{ borderBottom: `1px solid ${B.l10}` }}>
      <span className="flex items-baseline gap-2">
        <span style={{ ...T.bodyStrong, color: B.text }}>{title}</span>
        <span style={{ ...T.num, color: B.text3 }}>{count}</span>
      </span>
      {hint && <span style={{ ...T.meta, color: B.off }}>{hint}</span>}
    </div>
  );
}

function NoteRow({
  note,
  num,
  active,
  q,
  projectName,
  onSelect,
}: {
  note: Note;
  num: number;
  active: boolean;
  q: string;
  projectName?: string;
  onSelect: () => void;
}) {
  const sub = plainSubtitle(note.body);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className="group relative grid w-full grid-cols-[22px_minmax(0,1fr)] gap-2 py-4 text-left outline-none transition-colors duration-200 hover:bg-white/[0.02] focus-visible:bg-white/[0.04]"
      style={{ borderBottom: `1px solid ${B.l7}`, background: active ? "rgba(255,255,255,0.035)" : undefined }}
    >
      {active && <span className="absolute inset-y-3 -left-[1px] w-[2px]" style={{ background: B.text }} />}
      <span className="pl-2 pt-[3px]" style={{ ...T.num, fontSize: 11, color: active ? B.text3 : B.off }}>
        {pad2(num)}
      </span>
      <span className="min-w-0 pr-2">
        <span
          className="block truncate transition-colors group-hover:text-white"
          style={{ ...T.bodyStrong, color: note.title ? (active ? B.text : B.text2) : B.text3, fontStyle: note.title ? undefined : "italic" }}
        >
          {note.title || "Без названия"}
        </span>
        {sub && (
          <span className="mt-1 line-clamp-2" style={{ ...T.meta, color: B.text3 }}>
            {q && sub.toLowerCase().includes(q) ? <mark style={{ background: "transparent", color: B.text2 }}>{sub}</mark> : sub}
          </span>
        )}
        <span className="mt-2 flex min-w-0 items-center gap-2" style={{ ...T.meta, color: B.off }}>
          <span className="shrink-0">{whenLabel(note.createdAt, false)}</span>
          {projectName && <span className="truncate">· {projectName}</span>}
          {note.tags.length > 0 && <span className="truncate">· #{note.tags.join(" #")}</span>}
        </span>
      </span>
    </button>
  );
}

function Caret() {
  return (
    <svg width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden>
      <path d="M0.5 0.5L4 4L7.5 0.5" stroke="currentColor" />
    </svg>
  );
}
