/**
 * Notes · Craft Dark · «Быстрая запись» — the pieces behind the screen: the notes model (filter /
 * sort / search, create / save / pin / archive / delete with undo, «- [ ]» lines → tasks), the
 * TaskEditor-style note editor dialog, tag picker, pills, the undo bar and the empty art.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Check, FileOutput, ListPlus, Pin, Trash2, X } from "lucide-react";

import { Btn, C, IconBtn, R, T, TONE, plural } from "@/design-lab/screens/_kit/craft";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { FIXED_TAGS } from "@/lib/tags";
import { localDayStr } from "@/lib/format";
import { pushUndo } from "@/lib/undoStack";
import { pushRecent } from "@/lib/recent";
import { isNotionConnected, loadNotionTarget, notionCreatePage } from "@/lib/notion";
import type { Note } from "@/types";

const ICON = { size: 18, strokeWidth: 1.75 } as const;
const SM = { size: 16, strokeWidth: 1.75 } as const;

// ── Text helpers ──────────────────────────────────────────────────────────────────────────────

/** First meaningful line of the body as plain text (same rule as the real page). */
export function preview(body: string, max = 160): string {
  const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line
    .replace(/^#+\s*/, "")
    .replace(/^[-*]\s*(\[.\]\s*)?/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .slice(0, max);
}

const dayOf = (iso: string) => localDayStr(new Date(iso));

/** «Сегодня, 14:20» · «Вчера» · «12 окт» · «12 окт 2025». */
export function noteDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  const day = dayOf(iso);
  const today = localDayStr();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (day === today) return withTime ? `Сегодня, ${time}` : time;
  if (day === localDayStr(y)) return withTime ? `Вчера, ${time}` : "Вчера";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const s = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" }).replace(".", "").replace(" г", "");
  return withTime ? `${s}, ${time}` : s;
}

export const openChecks = (body: string) => body.split("\n").filter((l) => /^\s*-\s\[ \]\s/.test(l)).length;

// ── Model ─────────────────────────────────────────────────────────────────────────────────────

export type SortBy = "pinned" | "newest" | "oldest" | "title";
/** Pinned always float first, so «Новые» doubles as the pinned order — three pills are enough. */
export const SORTS_SHORT: { id: SortBy; label: string }[] = [
  { id: "pinned", label: "Новые" },
  { id: "oldest", label: "Старые" },
  { id: "title", label: "А–Я" },
];

interface Draft {
  title: string;
  body: string;
  tags: string[];
  projectId: string;
}
const emptyDraft = (): Draft => ({ title: "", body: "", tags: [], projectId: "" });
const draftOf = (n: Note): Draft => ({ title: n.title, body: n.body, tags: [...n.tags], projectId: n.linkedProjectId ?? "" });

interface Undo {
  label: string;
  run: () => void;
}

export function useNotesModel() {
  const data = useData();
  const { notes, projects, allProjects } = data;
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [project, setProject] = useState<string>("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [sort, setSort] = useState<SortBy>("pinned");
  const [undo, setUndo] = useState<Undo | null>(null);

  const allTags = useMemo(() => Array.from(new Set(notes.flatMap((n) => n.tags))).sort(), [notes]);
  /** Tags offered in the editor: the fixed pair first, then whatever the notes already carry. */
  const pickTags = useMemo(() => Array.from(new Set([...FIXED_TAGS, ...allTags])), [allTags]);
  const tagCount = (t: string) => notes.filter((n) => n.tags.includes(t)).length;
  const projectName = (id?: string) => (id ? allProjects.find((p) => p.id === id)?.name : undefined);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      notes
        .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
        .filter((n) => !tag || n.tags.includes(tag))
        .filter((n) => !project || n.linkedProjectId === project)
        .filter((n) => !pinnedOnly || n.pinned)
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
          if (a.pinned && sort === "pinned") {
            const oa = a.order ?? Number.MAX_SAFE_INTEGER;
            const ob = b.order ?? Number.MAX_SAFE_INTEGER;
            if (oa !== ob) return oa - ob;
          }
          if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
          if (sort === "title") return (a.title || "").localeCompare(b.title || "", "ru");
          return b.createdAt.localeCompare(a.createdAt);
        }),
    [notes, q, tag, project, pinnedOnly, sort]
  );

  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(id);
  }, [undo]);

  const payload = (d: Draft) => ({
    title: d.title.trim(),
    body: d.body.trim(),
    tags: d.tags,
    linkedProjectId: d.projectId || undefined,
  });

  const actions = {
    create: (d: Draft) => data.addNote({ ...payload(d), title: d.title.trim() || preview(d.body, 60) || "Без названия", pinned: false }),
    save: (id: string, d: Draft) => data.updateNote(id, { ...payload(d), title: d.title.trim() || preview(d.body, 60) || "Без названия" }),
    pin: (id: string) => data.toggleNotePin(id),
    // pushUndo: the same restore is reachable from the bar's «Вернуть» and the global Ctrl+Z.
    remove: (n: Note) => {
      data.deleteNote(n.id);
      setUndo({ label: "Заметка удалена", run: pushUndo("Заметка удалена", () => data.restoreNote(n)) });
    },
    archive: (n: Note) => {
      data.archiveNote(n.id);
      setUndo({ label: "Заметка в архиве", run: pushUndo("Заметка в архиве", () => data.unarchiveNote(n.id)) });
    },
    /** «→ в Notion»: the note becomes a page under the default target chosen in Settings. */
    sendToNotion: async (n: Note) => {
      if (!isNotionConnected()) {
        toast("Notion не подключён", { actionLabel: "Настройки", onAction: () => navigate("/settings") });
        return;
      }
      if (!loadNotionTarget()) {
        toast("Выберите страницу Notion по умолчанию", { actionLabel: "Настройки", onAction: () => navigate("/settings") });
        return;
      }
      try {
        const page = await notionCreatePage({ title: n.title || "Заметка", markdown: n.body });
        toast("Отправлено в Notion", { actionLabel: "Открыть", onAction: () => window.open(page.url, "_blank", "noopener") });
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
      }
    },
    toTasks: (n: Note) => {
      const titles = n.body
        .split("\n")
        .map((l) => l.match(/^\s*-\s\[ \]\s(.+)$/))
        .filter(Boolean)
        .map((m) => m![1].trim());
      if (!titles.length) return;
      titles.forEach((title) => data.addTask({ title, done: false, projectId: n.linkedProjectId }));
      setUndo({ label: `${titles.length} ${plural(titles.length, "задача создана", "задачи созданы", "задач создано")} из пунктов`, run: () => {} });
    },
  };

  return {
    all: notes,
    visible,
    projects,
    /** Active projects plus the note's own one if it was archived — so the field never shows a wrong value. */
    projectOptions: (currentId?: string) => {
      const cur = currentId && !projects.some((p) => p.id === currentId) ? allProjects.find((p) => p.id === currentId) : undefined;
      return cur ? [...projects, cur] : projects;
    },
    openProject: (id: string) => navigate(`/projects/${id}`),
    pickTags,
    tagCount,
    projectName,
    query,
    setQuery,
    tag,
    setTag,
    project,
    setProject,
    pinnedOnly,
    setPinnedOnly,
    sort,
    setSort,
    undo,
    clearUndo: () => setUndo(null),
    actions,
    resetFilters: () => {
      setQuery("");
      setTag(null);
      setProject("");
      setPinnedOnly(false);
    },
  };
}
export type NotesModel = ReturnType<typeof useNotesModel>;

// ── Small controls ────────────────────────────────────────────────────────────────────────────

/** Filter pill — quiet by default, soft blue tint when on. */
export function FilterPill({ on, onClick, children, count, size = 36 }: { on?: boolean; onClick?: () => void; children: ReactNode; count?: number; size?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 transition-colors duration-150 ${on ? "" : "hover:bg-[#1D1D21]"}`}
      style={{ height: size, borderRadius: 999, fontSize: 14, background: on ? "rgba(10,132,255,0.14)" : C.raise, color: on ? C.text : C.text2 }}
    >
      {children}
      {count !== undefined && <span style={{ ...T.foot, ...T.num, fontWeight: 400, color: on ? "#5AA9FF" : C.text3 }}>{count}</span>}
    </button>
  );
}

/** Quiet tag chip: «#работа». */
export function TagChip({ tag, size = 24 }: { tag: string; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap" style={{ height: size, padding: "0 9px", borderRadius: 999, background: C.raise, color: C.text2, fontSize: 12 }}>
      #{tag}
    </span>
  );
}

/** Pin glyph for a pinned note — accent, filled. */
export function PinMark({ size = 14 }: { size?: number }) {
  return <Pin size={size} strokeWidth={1.75} color={C.accent} fill={C.accent} className="shrink-0" style={{ transform: "rotate(30deg)" }} />;
}

/** Hover-revealed row actions: pin + trash (the pin stays visible on pinned notes). */
export function HoverActions({ note, m, extra, quietPin }: { note: Note; m: NotesModel; extra?: ReactNode; quietPin?: boolean }) {
  const btn = "grid h-8 w-8 place-items-center rounded-full transition-[opacity,background,color] duration-150 focus-visible:opacity-100";
  return (
    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {extra}
      <button
        type="button"
        title={note.pinned ? "Открепить" : "Закрепить"}
        aria-label={note.pinned ? "Открепить" : "Закрепить"}
        onClick={() => m.actions.pin(note.id)}
        className={`${btn} hover:bg-[#1D1D21] ${note.pinned && !quietPin ? "" : "opacity-0 group-hover:opacity-100"}`}
        style={{ color: note.pinned ? C.accent : C.text3 }}
      >
        <Pin size={16} strokeWidth={1.75} fill={note.pinned ? C.accent : "none"} style={{ transform: "rotate(30deg)" }} />
      </button>
      <button
        type="button"
        title="Удалить"
        aria-label="Удалить заметку"
        onClick={() => m.actions.remove(note)}
        className={`${btn} opacity-0 hover:bg-[#2A1A1A] hover:text-[#FF6B63] group-hover:opacity-100`}
        style={{ color: C.text3 }}
      >
        <Trash2 size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** Pill select (native, dark) — project filter / project field. */
export function PillSelect({
  value,
  onChange,
  options,
  placeholder,
  height = 36,
  icon,
  tinted,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  placeholder: string;
  height?: number;
  icon?: ReactNode;
  tinted?: boolean;
}) {
  const on = tinted && !!value;
  return (
    <label
      className="relative inline-flex shrink-0 items-center gap-2 pl-3.5 pr-3"
      style={{ height, borderRadius: 999, background: on ? "rgba(10,132,255,0.14)" : C.raise, color: on ? C.text : C.text2, fontSize: 14 }}
    >
      {icon}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="cursor-pointer appearance-none bg-transparent pr-5 outline-none [color-scheme:dark]" style={{ fontSize: 14, color: "inherit", maxWidth: 200 }}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-3" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 4.5 6 7.5 9 4.5" stroke={C.text2} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

/** Segmented sort pills. */
export function SortPills({ value, onChange, items = SORTS_SHORT }: { value: SortBy; onChange: (v: SortBy) => void; items?: { id: SortBy; label: string }[] }) {
  return (
    <div className="flex shrink-0 items-center gap-1 p-1" style={{ borderRadius: 999, background: C.raise }}>
      {items.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(s.id)}
          className="whitespace-nowrap px-3 transition-colors duration-150"
          style={{ height: 28, borderRadius: 999, fontSize: 12, background: value === s.id ? C.line2 : "transparent", color: value === s.id ? C.text : C.text3 }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── Editor fields ────────────────────────────────────────────────────────────────────────────

const fieldStyle: CSSProperties = { height: 44, borderRadius: 12, background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}`, padding: "0 14px", fontSize: 14, color: C.text };
const labelStyle: CSSProperties = { ...T.foot, color: C.text3, marginBottom: 6 };

/** Tag picker: toggle pills for the known tags + a small field for a new one. */
export function TagPicker({ value, onChange, options, size = 36, trailing }: { value: string[]; onChange: (v: string[]) => void; options: string[]; size?: number; trailing?: ReactNode }) {
  const [adding, setAdding] = useState("");
  const all = Array.from(new Set([...options, ...value]));
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  const add = () => {
    const t = adding.trim().replace(/^#/, "").toLowerCase();
    if (t && !value.includes(t)) onChange([...value, t]);
    setAdding("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {all.map((t) => {
        const on = value.includes(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            className="inline-flex items-center gap-1.5 px-3.5 transition-colors"
            style={{ height: size, borderRadius: 999, fontSize: 14, background: on ? "rgba(10,132,255,0.14)" : "transparent", boxShadow: on ? "none" : `inset 0 0 0 1px ${C.line}`, color: on ? C.text : C.text2 }}
          >
            {on && <Check size={14} strokeWidth={2} color={C.accent} />}#{t}
          </button>
        );
      })}
      <input
        value={adding}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            e.stopPropagation();
            add();
          }
        }}
        onBlur={add}
        placeholder="+ тег"
        className="bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ height: size, width: 76, padding: "0 12px", borderRadius: 999, fontSize: 14, color: C.text, boxShadow: `inset 0 0 0 1px ${C.line}` }}
      />
      {trailing}
    </div>
  );
}

function ProjectField({ value, onChange, projects }: { value: string; onChange: (v: string) => void; projects: { id: string; name: string }[] }) {
  return (
    <label className="flex flex-col">
      <span style={labelStyle}>Проект</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="outline-none [color-scheme:dark]" style={fieldStyle}>
        <option value="">Не связано</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function useEsc(onClose: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
}

/**
 * Note editor in the main screen's TaskEditor language — a centred dialog. `note` undefined →
 * creating. Ctrl/⌘+Enter saves, Esc closes.
 */
export function NoteEditor({ m, note, onClose }: { m: NotesModel; note?: Note; onClose: () => void }) {
  const [d, setD] = useState<Draft>(() => (note ? draftOf(note) : emptyDraft()));
  useEsc(onClose);
  const ok = !!(d.title.trim() || d.body.trim());
  const save = () => {
    if (!ok) return;
    if (note) m.actions.save(note.id, d);
    else m.actions.create(d);
    onClose();
  };
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const checks = note ? openChecks(note.body) : 0;

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div style={T.h2}>{note ? "Заметка" : "Новая заметка"}</div>
          {note && <div style={{ ...T.foot, color: C.text3, marginTop: 4 }}>Создана {noteDate(note.createdAt, true).replace(/^./, (c) => c.toLowerCase())}</div>}
        </div>
        <div className="flex items-center gap-2">
          {note && (
            <IconBtn title={note.pinned ? "Открепить" : "Закрепить"} onClick={() => m.actions.pin(note.id)}>
              <Pin {...ICON} color={note.pinned ? C.accent : C.text} fill={note.pinned ? C.accent : "none"} style={{ transform: "rotate(30deg)" }} />
            </IconBtn>
          )}
          {note && (
            <IconBtn title="→ в Notion" onClick={() => void m.actions.sendToNotion({ ...note, title: d.title.trim() || note.title, body: d.body })}>
              <FileOutput {...ICON} />
            </IconBtn>
          )}
          {note && (
            <IconBtn
              title="В архив"
              onClick={() => {
                m.actions.archive(note);
                onClose();
              }}
            >
              <Archive {...ICON} />
            </IconBtn>
          )}
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
      </div>
      <input
        autoFocus={!note}
        value={d.title}
        onChange={(e) => set({ title: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="w-full bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ ...fieldStyle, height: 52, fontSize: 16 }}
        placeholder="Заголовок"
      />
      <textarea
        value={d.body}
        autoFocus={!!note}
        onChange={(e) => set({ body: e.target.value })}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && save()}
        rows={8}
        placeholder="Текст заметки"
        className="w-full resize-none bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ ...fieldStyle, height: "auto", padding: "12px 14px", lineHeight: 1.5 }}
      />
      <div className="flex flex-col">
        <span style={labelStyle}>Теги</span>
        <TagPicker value={d.tags} onChange={(tags) => set({ tags })} options={m.pickTags} />
      </div>
      <ProjectField value={d.projectId} onChange={(projectId) => set({ projectId })} projects={m.projectOptions(note?.linkedProjectId)} />
      <div className="flex items-center justify-between gap-2 pt-1">
        {note ? (
          <button
            type="button"
            onClick={() => {
              m.actions.remove(note);
              onClose();
            }}
            className="inline-flex items-center gap-2 px-4 transition-colors hover:bg-[#2A1A1A]"
            style={{ height: 44, borderRadius: 999, color: TONE.red.fg, fontSize: 14 }}
          >
            <Trash2 {...SM} />
            Удалить
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {note && checks > 0 && (
            <Btn
              kind="ghost"
              icon={<ListPlus {...SM} />}
              onClick={() => {
                m.actions.save(note.id, d);
                m.actions.toTasks({ ...note, body: d.body });
                onClose();
              }}
            >
              В задачи · {checks}
            </Btn>
          )}
          <Btn kind="ghost" onClick={onClose}>
            Отмена
          </Btn>
          <Btn onClick={save} disabled={!ok}>
            {note ? "Сохранить" : "Добавить"}
          </Btn>
        </div>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Заметка"
        className="flex max-h-full w-full max-w-[600px] flex-col gap-5 overflow-y-auto p-6"
        style={{ background: C.panel, borderRadius: R.page, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 30px 80px rgba(0,0,0,0.6)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}

/** Editor open state helper: null = closed, "new" = creating, id = editing. */
export function useEditor(m: NotesModel) {
  const [open, setOpen] = useState<string | null>(null);
  const note = open && open !== "new" ? m.all.find((n) => n.id === open) : undefined;
  // a note deleted from elsewhere closes its editor
  const isOpen = open === "new" || !!note;
  const edit = (id: string) => {
    setOpen(id);
    const n = m.all.find((x) => x.id === id);
    if (n) pushRecent({ id: n.id, label: n.title || "Без названия", to: "/notes", state: { openNoteId: n.id } });
  };
  return { open: isOpen, note, create: () => setOpen("new"), edit, close: () => setOpen(null), key: open ?? "" };
}

// ── Undo bar ──────────────────────────────────────────────────────────────────────────────────

export function UndoBar({ m }: { m: NotesModel }) {
  if (!m.undo) return null;
  const u = m.undo;
  const hasUndo = !u.label.includes("из пунктов");
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center">
      <div
        className="pointer-events-auto flex items-center gap-3 py-1.5 pl-5 pr-1.5"
        style={{ borderRadius: 999, background: C.raise, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 18px 50px rgba(0,0,0,0.55)` }}
      >
        <span style={{ ...T.body, color: C.text }}>{u.label}</span>
        {hasUndo ? (
          <Btn
            size={36}
            onClick={() => {
              u.run();
              m.clearUndo();
            }}
          >
            Вернуть
          </Btn>
        ) : (
          <IconBtn size={36} title="Закрыть" onClick={m.clearUndo}>
            <X {...SM} />
          </IconBtn>
        )}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────────────────────

/** Three stacked sheets with a blue page on top — the quiet illustration of an empty notebook. */
export function SheetsArt({ size = 132 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 132 106" fill="none" aria-hidden>
      <defs>
        <linearGradient id="notesheet" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3D9DFF" />
          <stop offset="1" stopColor="#0A6CF0" />
        </linearGradient>
      </defs>
      <rect x="18" y="14" width="70" height="86" rx="14" transform="rotate(-10 18 14)" fill="#19191C" stroke="#28282D" />
      <rect x="44" y="6" width="70" height="86" rx="14" transform="rotate(8 44 6)" fill="#1D1D21" stroke="#28282D" />
      <rect x="31" y="10" width="70" height="88" rx="14" fill="url(#notesheet)" />
      <rect x="31.5" y="10.5" width="69" height="87" rx="13.5" stroke="rgba(255,255,255,0.28)" />
      <rect x="43" y="28" width="34" height="5" rx="2.5" fill="#fff" />
      <rect x="43" y="42" width="46" height="4" rx="2" fill="#fff" opacity=".55" />
      <rect x="43" y="52" width="40" height="4" rx="2" fill="#fff" opacity=".55" />
      <rect x="43" y="62" width="44" height="4" rx="2" fill="#fff" opacity=".55" />
      <circle cx="46" cy="80" r="4" stroke="#fff" strokeOpacity=".8" strokeWidth="1.5" />
      <rect x="55" y="78" width="26" height="4" rx="2" fill="#fff" opacity=".55" />
    </svg>
  );
}

/** Filters matched nothing — muted line and a reset. */
export function NothingFound({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div style={{ ...T.cell, color: C.text }}>Ничего не найдено</div>
      <div style={{ ...T.body, color: C.text3 }}>Под эти фильтры не подходит ни одна заметка</div>
      <Btn kind="ghost" size={36} onClick={onReset}>
        Сбросить фильтры
      </Btn>
    </div>
  );
}

/** Autosizing textarea ref helper. */
export function useAutosize(value: string, min = 0) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(min, el.scrollHeight)}px`;
  }, [value, min]);
  return ref;
}

