/**
 * Проекты · Craft Dark — shared pieces of v6 «Как сейчас» (the live /projects page, folder grid) and
 * v5 «Список и карточка» (lab alternative): the project model (progress, health, overdue, time, next
 * date — the same rules as src/pages/Projects.tsx), the create / edit dialog and the undo bar for
 * archive / delete. Status / sort controls and the priority pill are used by v5 only.
 * Not a variant file — the board only loads v*.tsx.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Archive, ArrowDownUp, Check, ChevronDown, Trash2, X } from "lucide-react";

import { Btn, C, IconBtn, R, T, TONE, plural, type Tone } from "@/design-lab/screens/_kit/craft";
import { useData } from "@/store/DataProvider";
import { projectHealth, type HealthLevel } from "@/lib/projectHealth";
import { dueLabel, isOverdue } from "@/lib/format";
import { loadAttachmentBlob } from "@/lib/attachments";
import type { Client, Priority, Project, ProjectStatus, Task } from "@/types";

const ICON = { size: 18, strokeWidth: 1.75 } as const;
export const PRIO_DOT: Record<number, string> = { 0: "#4A4C54", 1: C.red, 2: C.amber, 3: C.accent };
export const SOFT = "rgba(10,132,255,0.14)";

// ── Labels ────────────────────────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Не начат",
  active: "В работе",
  done: "Завершён",
  archived: "Архив",
};
export const STATUSES: ProjectStatus[] = ["planned", "active", "done", "archived"];
export const STATUS_DOT: Record<ProjectStatus, string> = { planned: C.text2, active: C.accent, done: C.green, archived: C.text3 };

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  "on-track": "На треке",
  "at-risk": "Риск",
  "off-track": "Сорвано",
  done: "Готов",
  empty: "Нет задач",
};
export const HEALTH_TONE: Record<HealthLevel, Tone> = { "off-track": "red", "at-risk": "amber", "on-track": "blue", done: "green", empty: "neutral" };
const HEALTH_RANK: Record<HealthLevel, number> = { "off-track": 0, "at-risk": 1, "on-track": 2, done: 3, empty: 4 };
const PRIORITY_RANK: Record<number, number> = { 1: 0, 2: 1, 3: 2, 0: 3 };

export const PRIOS: { p: Priority; label: string }[] = [
  { p: 1, label: "Высокий" },
  { p: 2, label: "Средний" },
  { p: 3, label: "Низкий" },
  { p: 0, label: "Без приоритета" },
];

export function dur(min: number): string {
  if (!min) return "0 мин";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

export const short = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");

// ── Model ─────────────────────────────────────────────────────────────────────────────────────

export interface ProjectRow {
  project: Project;
  tasks: Task[];
  total: number;
  done: number;
  open: number;
  pct: number;
  overdue: number;
  health: HealthLevel;
  spentMin: number;
  estimateMin: number;
  client?: Client;
  /** Earliest due date among open tasks. */
  nextDue?: string;
  lastDoneAt?: string;
}

function buildRow(p: Project, all: Task[], clients: Client[]): ProjectRow {
  const tasks = all.filter((t) => t.projectId === p.id);
  const done = tasks.filter((t) => t.done).length;
  const openTasks = tasks.filter((t) => !t.done);
  const dues = openTasks.map((t) => t.dueDate).filter((d): d is string => !!d).sort();
  const closed = tasks.filter((t) => t.done && t.completedAt).map((t) => t.completedAt as string).sort();
  return {
    project: p,
    tasks,
    total: tasks.length,
    done,
    open: openTasks.length,
    pct: tasks.length ? (done / tasks.length) * 100 : 0,
    overdue: openTasks.filter((t) => isOverdue(t.dueDate)).length,
    health: projectHealth(tasks),
    spentMin: tasks.reduce((s, t) => s + (t.spentMin ?? 0), 0),
    estimateMin: openTasks.reduce((s, t) => s + (t.estimateMin ?? 0), 0),
    client: p.clientId ? clients.find((c) => c.id === p.clientId) : undefined,
    nextDue: dues[0],
    lastDoneAt: closed[closed.length - 1],
  };
}

export type StatusFilter = "all" | ProjectStatus;
export type SortMode = "manual" | "priority" | "health" | "name" | "progress" | "tasks";
const SORTS: { id: SortMode; label: string }[] = [
  { id: "manual", label: "Как есть" },
  { id: "priority", label: "По приоритету" },
  { id: "health", label: "По состоянию" },
  { id: "name", label: "По имени" },
  { id: "progress", label: "По прогрессу" },
  { id: "tasks", label: "По числу задач" },
];

function sortRows(rows: ProjectRow[], mode: SortMode): ProjectRow[] {
  if (mode === "manual") return rows;
  return [...rows].sort((a, b) => {
    if (mode === "name") return a.project.name.localeCompare(b.project.name);
    if (mode === "priority") return PRIORITY_RANK[a.project.priority ?? 0] - PRIORITY_RANK[b.project.priority ?? 0];
    if (mode === "tasks") return b.total - a.total;
    if (mode === "health") return HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
    return b.pct - a.pct;
  });
}

/** Rows for the active (non-archived) projects — «В архив» hides a project here, as in the app. */
function useProjectRows() {
  const { projects, tasks, clients } = useData();
  return useMemo(() => projects.map((p) => buildRow(p, tasks, clients)), [projects, tasks, clients]);
}

/** Same filter as the real page: «Архив» is the project STATUS, not the archived-away projects. */
function inFilter(r: ProjectRow, f: StatusFilter) {
  return f === "all" || r.project.status === f;
}

function matchQuery(r: ProjectRow, q: string) {
  if (!q) return true;
  return r.project.name.toLowerCase().includes(q) || (r.client?.name ?? "").toLowerCase().includes(q);
}

/** Text on the right of a row: overdue (amber) → next deadline → finished / last activity. */
export function rowDate(r: ProjectRow): { text: string; tone: "amber" | "muted" | "plain" } {
  if (r.overdue > 0 && r.nextDue) return { text: `с ${short(r.nextDue)}`, tone: "amber" };
  if (r.nextDue) {
    const l = dueLabel(r.nextDue);
    return { text: l === "Сегодня" || l === "Завтра" ? l.toLowerCase() : `до ${short(r.nextDue)}`, tone: "plain" };
  }
  if (r.open === 0 && r.lastDoneAt) return { text: `закрыт ${short(r.lastDoneAt)}`, tone: "muted" };
  if (r.lastDoneAt) return { text: `обновлён ${short(r.lastDoneAt)}`, tone: "muted" };
  return { text: `с ${short(r.project.createdAt)}`, tone: "muted" };
}

export function dateColor(tone: "amber" | "muted" | "plain") {
  return tone === "amber" ? TONE.amber.fg : tone === "plain" ? C.text2 : C.text3;
}

// ── Screen state shared by v5 and v6 ─────────────────────────────────────────────────

type Editing = { mode: "create"; status?: ProjectStatus } | { mode: "edit"; id: string } | null;

export function useProjectsScreen() {
  const data = useData();
  const all = useProjectRows();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("manual");
  const [editing, setEditing] = useState<Editing>(null);
  const [undo, setUndo] = useState<{ text: string; run: () => void } | null>(null);

  const q = query.trim().toLowerCase();
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: 0, planned: 0, active: 0, done: 0, archived: 0 };
    all.forEach((r) => (["all", ...STATUSES] as StatusFilter[]).forEach((f) => inFilter(r, f) && (c[f] += 1)));
    return c;
  }, [all]);
  const visible = useMemo(() => sortRows(all.filter((r) => inFilter(r, filter) && matchQuery(r, q)), sort), [all, filter, q, sort]);

  const archive = (r: ProjectRow) => {
    data.archiveProject(r.project.id);
    setUndo({ text: `«${r.project.name}» в архиве`, run: () => data.unarchiveProject(r.project.id) });
  };
  const remove = (p: Project) => {
    const linked = data.allTasks.filter((t) => t.projectId === p.id).map((t) => ({ id: t.id, section: t.section }));
    data.deleteProject(p.id);
    setEditing(null);
    setUndo({
      text: `Проект «${p.name}» удалён`,
      run: () => {
        data.restoreProject(p);
        linked.forEach((t) => data.updateTask(t.id, { projectId: p.id, section: t.section }));
      },
    });
  };

  const editingProject = editing?.mode === "edit" ? data.allProjects.find((p) => p.id === editing.id) : undefined;

  const overlays = (
    <>
      {editing && (editing.mode === "create" || editingProject) && (
        <ProjectEditor
          key={editing.mode === "edit" ? editing.id : "new"}
          project={editingProject}
          initialStatus={editing.mode === "create" ? editing.status : undefined}
          onClose={() => setEditing(null)}
          onDelete={editingProject ? () => remove(editingProject) : undefined}
        />
      )}
      {undo && <UndoBar text={undo.text} onUndo={() => (undo.run(), setUndo(null))} onClose={() => setUndo(null)} />}
    </>
  );

  return {
    data,
    all,
    visible,
    counts,
    query,
    setQuery,
    q,
    filter,
    setFilter,
    sort,
    setSort,
    create: (status?: ProjectStatus) => setEditing({ mode: "create", status }),
    edit: (id: string) => setEditing({ mode: "edit", id }),
    archive,
    remove,
    overlays,
    search: { value: query, onChange: setQuery, placeholder: "Поиск проектов" },
  };
}
export type ProjectsScreen = ReturnType<typeof useProjectsScreen>;

// ── Small pieces ──────────────────────────────────────────────────────────────────────────────

function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
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

const FILTERS: StatusFilter[] = ["all", "planned", "active", "done", "archived"];
const FILTER_LABEL: Record<StatusFilter, string> = { all: "Все", ...STATUS_LABEL };

/** Status pills with counts; active = soft blue tint, never an outline. */
export function StatusTabs({ s, size = 40, compact }: { s: ProjectsScreen; size?: number; compact?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {FILTERS.map((f) => {
        const on = s.filter === f;
        return (
          <button
            key={f}
            type="button"
            onClick={() => s.setFilter(f)}
            className={`inline-flex items-center gap-2 whitespace-nowrap transition-colors duration-150 ${on ? "" : "hover:bg-[#1B1B1F]"}`}
            style={{ height: size, padding: compact ? "0 12px" : "0 16px", borderRadius: 999, background: on ? SOFT : "transparent", color: on ? C.text : C.text2, fontSize: 14 }}
          >
            {FILTER_LABEL[f]}
            <span style={{ ...T.foot, ...T.num, fontWeight: 400, color: on ? "#5AA9FF" : C.text3 }}>{s.counts[f]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Pill with a dropdown of the real page's six sort modes. */
export function SortMenu({ s, size = 40 }: { s: ProjectsScreen; size?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  const cur = SORTS.find((x) => x.id === s.sort)!;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 whitespace-nowrap px-4 transition-colors duration-150 hover:bg-[#232327]"
        style={{ height: size, borderRadius: 999, background: open ? C.line : C.raise, fontSize: 14, color: C.text }}
      >
        <ArrowDownUp size={15} strokeWidth={1.75} color={C.text2} />
        {s.sort === "manual" ? "Сортировка" : cur.label}
        <ChevronDown size={16} strokeWidth={1.75} color={C.text2} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 flex flex-col p-1.5"
          style={{ top: size + 8, width: 220, background: C.panel, borderRadius: R.inner, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 24px 60px rgba(0,0,0,0.55)` }}
        >
          {SORTS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                s.setSort(x.id);
                setOpen(false);
              }}
              className="flex items-center justify-between px-3 text-left transition-colors hover:bg-[#1B1B1F]"
              style={{ height: 40, borderRadius: R.small, fontSize: 14, color: s.sort === x.id ? C.text : C.text2, background: s.sort === x.id ? SOFT : undefined }}
            >
              {x.label}
              {s.sort === x.id && <Check size={15} strokeWidth={2} color={C.accent} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Health as a quiet dot + label (no pill border) — for dense rows. */
export function HealthDot({ h }: { h: HealthLevel }) {
  const t = TONE[HEALTH_TONE[h]];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" style={{ ...T.body, color: h === "empty" ? C.text3 : t.fg }}>
      <span style={{ width: 6, height: 6, borderRadius: 9, background: h === "empty" ? C.text3 : t.dot }} />
      {HEALTH_LABEL[h]}
    </span>
  );
}

/** Object URL of a project's cover from IndexedDB, when this browser has it. */
export function useCover(id?: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let alive = true;
    setUrl(null);
    if (id) {
      loadAttachmentBlob(id)
        .then((b) => {
          if (b && alive) {
            u = URL.createObjectURL(b);
            setUrl(u);
          }
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  return url;
}

/** Cover thumbnail, otherwise a soft blue initial tile. */
export function ProjectMark({ p, size = 40 }: { p: Project; size?: number }) {
  const url = useCover(p.coverAttachmentId);
  const radius = size >= 56 ? R.inner : R.small;
  if (url) return <img src={url} alt="" className="shrink-0 object-cover" style={{ width: size, height: size, borderRadius: radius }} />;
  return (
    <span
      className="grid shrink-0 place-items-center"
      style={{ width: size, height: size, borderRadius: radius, background: "rgba(10,132,255,0.10)", boxShadow: "inset 0 0 0 1px rgba(10,132,255,0.18)", color: "#5AA9FF", fontSize: size * 0.4, fontWeight: 500, letterSpacing: "-0.02em" }}
    >
      {p.name.trim().slice(0, 1).toUpperCase() || "•"}
    </span>
  );
}

/** Thin progress capsule. */
export function Bar({ pct, width = "100%", height = 6 }: { pct: number; width?: number | string; height?: number }) {
  return (
    <span className="block overflow-hidden" style={{ width, height, borderRadius: 99, background: "#26262C" }}>
      <span className="block h-full" style={{ width: `${Math.max(pct > 0 ? 4 : 0, Math.min(100, pct))}%`, borderRadius: 99, background: C.accent }} />
    </span>
  );
}

/** Hover-revealed row actions: archive (with undo) and delete. */
export function RowActions({ r, s, className = "" }: { r: ProjectRow; s: ProjectsScreen; className?: string }) {
  const btn = "grid h-8 w-8 place-items-center rounded-full transition-[background,color] duration-150";
  return (
    <span className={`flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 ${className}`}>
      <button type="button" title="В архив" aria-label="В архив" onClick={(e) => (e.stopPropagation(), s.archive(r))} className={`${btn} hover:bg-[#232327] hover:text-[#F4F5F7]`} style={{ color: C.text3 }}>
        <Archive size={16} strokeWidth={1.75} />
      </button>
      <button type="button" title="Удалить проект" aria-label="Удалить проект" onClick={(e) => (e.stopPropagation(), s.remove(r.project))} className={`${btn} hover:bg-[#2A1A1A] hover:text-[#FF7A73]`} style={{ color: C.text3 }}>
        <Trash2 size={16} strokeWidth={1.75} />
      </button>
    </span>
  );
}

/** Segmented pill group on a card track — the real page's two «Segmented» controls. Active = soft blue tint. */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
  label,
  size = 36,
}: {
  items: { id: K; label: string; title?: string }[];
  value: K;
  onChange: (id: K) => void;
  label: string;
  size?: number;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5 p-1" style={{ background: C.card, borderRadius: 999 }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={it.title}
            onClick={() => onChange(it.id)}
            className={`whitespace-nowrap transition-colors duration-150 ${on ? "" : "hover:text-[#F4F5F7]"}`}
            style={{ height: size, padding: "0 14px", borderRadius: 999, background: on ? SOFT : "transparent", color: on ? C.text : C.text2, fontSize: 14 }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

const PRIO_SHORT: Record<number, string> = { 0: "Приоритет", 1: "Выс", 2: "Ср", 3: "Низ" };
const PRIO_TONE_OF: Record<number, Tone> = { 0: "neutral", 1: "red", 2: "amber", 3: "blue" };

/** Priority pill with a direct choice of the four levels (the real page's PriorityPicker). */
export function PriorityPick({ p, onChange }: { p: Priority; onChange: (p: Priority) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  const t = TONE[PRIO_TONE_OF[p]];
  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        title="Приоритет"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center whitespace-nowrap transition-[filter] duration-150 hover:brightness-125"
        style={{ height: 28, padding: "0 10px", borderRadius: 999, fontSize: 12, background: p ? t.bg : "transparent", boxShadow: `inset 0 0 0 1px ${p ? t.bd : C.line2}`, color: p ? t.fg : C.text3 }}
      >
        {PRIO_SHORT[p]}
      </button>
      {open && (
        <div
          className="absolute left-0 z-30 flex flex-col p-1.5"
          style={{ top: 34, width: 200, background: C.panel, borderRadius: R.inner, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 24px 60px rgba(0,0,0,0.55)` }}
        >
          {PRIOS.map(({ p: pr, label }) => (
            <button
              key={pr}
              type="button"
              onClick={() => {
                onChange(pr);
                setOpen(false);
              }}
              className="flex items-center gap-2.5 px-3 text-left transition-colors hover:bg-[#1B1B1F]"
              style={{ height: 38, borderRadius: R.small, fontSize: 14, color: pr === p ? C.text : C.text2, background: pr === p ? SOFT : undefined }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[pr] }} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NoResults({ s, children }: { s: ProjectsScreen; children?: ReactNode }) {
  const empty = s.all.length === 0;
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
      style={{ borderRadius: R.inner, border: `1px dashed ${C.line2}`, ...T.body, color: C.text3 }}
    >
      {empty ? "Проектов пока нет — проект собирает задачи одного направления работы." : s.q ? `Ничего не найдено по «${s.query.trim()}»` : "Нет проектов с таким статусом"}
      {empty ? (
        <Btn size={40} onClick={() => s.create()}>
          Создать проект
        </Btn>
      ) : s.q ? (
        <Btn size={36} kind="ghost" onClick={() => s.setQuery("")}>
          Сбросить поиск
        </Btn>
      ) : (
        <Btn size={36} kind="ghost" onClick={() => s.setFilter("all")}>
          Показать все
        </Btn>
      )}
      {children}
    </div>
  );
}

export function projectsWord(n: number) {
  return `${n} ${plural(n, "проект", "проекта", "проектов")}`;
}

// ── Undo bar ──────────────────────────────────────────────────────────────────────────────────

function UndoBar({ text, onUndo, onClose }: { text: string; onUndo: () => void; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, 6000);
    return () => clearTimeout(id);
  }, [text, onClose]);
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 py-1.5 pl-5 pr-1.5"
      style={{ height: 52, borderRadius: 999, background: C.raise, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 20px 50px rgba(0,0,0,0.55)` }}
    >
      <span className="max-w-[420px] truncate" style={{ ...T.body, color: C.text }}>
        {text}
      </span>
      <Btn size={40} onClick={onUndo}>
        Вернуть
      </Btn>
      <button type="button" aria-label="Закрыть" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[#2A2A30]" style={{ color: C.text3 }}>
        <X size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────────────────────

const field = { height: 44, borderRadius: 12, background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}`, padding: "0 14px", fontSize: 14, color: C.text } as const;
const fieldLabel = { ...T.foot, color: C.text3, marginBottom: 6 } as const;

export function ChoicePill({ on, onClick, dot, children }: { on: boolean; onClick: () => void; dot?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 whitespace-nowrap px-3.5 transition-colors"
      style={{ height: 36, borderRadius: 999, fontSize: 14, background: on ? SOFT : "transparent", boxShadow: on ? "none" : `inset 0 0 0 1px ${C.line}`, color: on ? C.text : C.text2 }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 9, background: dot }} />}
      {children}
    </button>
  );
}

const NONE = "";

/** Create / edit dialog — panel 24, blurred backdrop, labelled fields, Delete left, Cancel + Save right, Esc closes. */
function ProjectEditor({
  project,
  initialStatus,
  onClose,
  onDelete,
}: {
  project?: Project;
  initialStatus?: ProjectStatus;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { clients, settings, addProject, updateProject, createProjectFromTemplate } = useData();
  const [name, setName] = useState(project?.name ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? initialStatus ?? "active");
  const [priority, setPriority] = useState<Priority>(project?.priority ?? 0);
  const [clientId, setClientId] = useState(project?.clientId ?? NONE);
  const [templateId, setTemplateId] = useState(NONE);
  const templated = !project && templateId !== NONE;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (project) updateProject(project.id, { name: n, status, priority, clientId: clientId || undefined });
    else if (templated) createProjectFromTemplate(n, templateId);
    else addProject({ name: n, status, priority, clientId: clientId || undefined });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={project ? "Проект" : "Новый проект"}
        className="flex w-full max-w-[560px] flex-col gap-5 p-6"
        style={{ background: C.panel, borderRadius: R.page, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 30px 80px rgba(0,0,0,0.6)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span style={T.h2}>{project ? "Проект" : "Новый проект"}</span>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="w-full bg-transparent outline-none placeholder:text-[#5E6068]"
          style={{ ...field, height: 52, fontSize: 16 }}
          placeholder="Название проекта"
        />
        {!templated && (
          <div className="flex flex-col">
            <span style={fieldLabel}>Статус</span>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((st) => (
                <ChoicePill key={st} on={status === st} onClick={() => setStatus(st)} dot={STATUS_DOT[st]}>
                  {STATUS_LABEL[st]}
                </ChoicePill>
              ))}
            </div>
          </div>
        )}
        {!templated && (
          <div className="flex flex-col">
            <span style={fieldLabel}>Приоритет</span>
            <div className="flex flex-wrap gap-1.5">
              {PRIOS.map(({ p, label }) => (
                <ChoicePill key={p} on={priority === p} onClick={() => setPriority(p)} dot={PRIO_DOT[p]}>
                  {label}
                </ChoicePill>
              ))}
            </div>
          </div>
        )}
        <div className={`grid gap-3 ${!project && settings.projectTemplates.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
          {!templated && (
            <label className="flex flex-col">
              <span style={fieldLabel}>Клиент</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="outline-none [color-scheme:dark]" style={field}>
                <option value={NONE}>Без клиента</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!project && settings.projectTemplates.length > 0 && (
            <label className="flex flex-col">
              <span style={fieldLabel}>Шаблон</span>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="outline-none [color-scheme:dark]" style={field}>
                <option value={NONE}>Без шаблона</option>
                {settings.projectTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.tasks.length} {plural(t.tasks.length, "задача", "задачи", "задач")}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex items-center justify-between pt-1">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-2 px-4 transition-colors hover:bg-[#2A1A1A]"
              style={{ height: 44, borderRadius: 999, color: TONE.red.fg, fontSize: 14 }}
            >
              <Trash2 size={16} strokeWidth={1.75} />
              Удалить
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Btn kind="ghost" onClick={onClose}>
              Отмена
            </Btn>
            <Btn onClick={save} disabled={!name.trim()}>
              {project ? "Сохранить" : "Создать"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
