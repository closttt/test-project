/**
 * Project card · Craft Dark — shared model and pieces for the five concepts (v1…v5).
 *
 * The model mirrors src/pages/ProjectDetail.tsx on the real store: tasks by manual sections (or by
 * time buckets when the project has none), add / toggle / edit / delete with undo, sections
 * add / rename / delete / reorder, the «Обновления» journal, linked notes, files, tracked time and
 * project edit (name, client, status, priority, delete). In the app the project comes from the
 * route (/projects/:id) and the switcher navigates; in a lab preview with no route id it comes from
 * ?project=<id|name> or falls back to the active project with the most open tasks, and the switcher
 * writes the choice back to the query string.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderKanban,
  Link2,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Btn, C, Empty, IconBtn, R, Ring, RoundCheck, StatusPill, T, TONE, dashed, plural, type Tone } from "@/design-lab/screens/_kit/craft";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { addDays, dueLabel, isOverdue, localDayStr } from "@/lib/format";
import { groupTasksByTime } from "@/lib/taskGrouping";
import { projectHealth, type HealthLevel } from "@/lib/projectHealth";
import { parseNaturalInput } from "@/lib/nlp";
import { pushUndo } from "@/lib/undoStack";
import { loadAttachmentBlob } from "@/lib/attachments";
import type { Attachment, Note, Priority, Project, ProjectComment, ProjectStatus, Task } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────────────────────

export const ICON = { size: 18, strokeWidth: 1.75 } as const;
export const PRIO_DOT: Record<number, string> = { 0: "#4A4C54", 1: C.red, 2: C.amber, 3: C.accent };
export const PRIOS: { p: Priority; label: string }[] = [
  { p: 1, label: "Высокий" },
  { p: 2, label: "Средний" },
  { p: 3, label: "Низкий" },
  { p: 0, label: "Без приоритета" },
];
export const PRIO_LABEL: Record<number, string> = { 0: "Без приоритета", 1: "Высокий", 2: "Средний", 3: "Низкий" };

export const STATUS_LABEL: Record<ProjectStatus, string> = { planned: "Не начат", active: "В работе", done: "Завершён", archived: "Архив" };
export const STATUS_TONE: Record<ProjectStatus, Tone> = { planned: "neutral", active: "blue", done: "green", archived: "neutral" };
export const STATUSES: ProjectStatus[] = ["planned", "active", "done", "archived"];

export const HEALTH_LABEL: Record<HealthLevel, string> = { "on-track": "На треке", "at-risk": "Риск", "off-track": "Сорвано", done: "Всё закрыто", empty: "Нет задач" };
/** Overdue reads amber, never red — both «риск» and «сорвано» are amber tints. */
export const HEALTH_TONE: Record<HealthLevel, Tone> = { "on-track": "blue", "at-risk": "amber", "off-track": "amber", done: "green", empty: "neutral" };

type SortMode = "manual" | "date" | "priority";

// ── Small helpers ─────────────────────────────────────────────────────────────────────────────

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

export function useEsc(on: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && on();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [on]);
}

export function dur(min: number): string {
  if (!min) return "0 мин";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

/** «25 авг.» / «25 авг. 2025 г.» for another year. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function fileSize(b: number): string {
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} КБ`;
  return `${(b / 1024 / 1024).toFixed(1)} МБ`;
}

/** Due text for the right edge of a row: overdue → amber «с 05 окт.», done → «закрыта 05 окт.». */
export function dueText(t: Task): { text: string; late: boolean } {
  if (t.done) return { text: t.completedAt ? `закрыта ${dayLabel(t.completedAt)}` : "готово", late: false };
  if (!t.dueDate) return { text: "", late: false };
  if (isOverdue(t.dueDate)) return { text: `с ${dueLabel(t.dueDate)}`, late: true };
  return { text: dueLabel(t.dueDate), late: false };
}

/** Text with URLs turned into quiet blue links (journal entries are often links). */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="break-all hover:underline" style={{ color: "#5AA9FF" }}>
            {p.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

// ── The model ─────────────────────────────────────────────────────────────────────────────────

export interface Group {
  key: string;
  /** Section name (null for «Без секции» and time buckets). */
  section: string | null;
  label: string;
  kind: "section" | "none" | "time" | "done";
  /** Every task of the group (open + done). */
  all: Task[];
  /** What to render: open tasks + done ones when shown (or ticked in this session). */
  items: Task[];
  done: number;
  total: number;
}

function readParam(): string | null {
  try {
    return new URLSearchParams(location.search).get("project");
  } catch {
    return null;
  }
}

function writeParam(id: string | null) {
  try {
    const u = new URL(location.href);
    if (id) u.searchParams.set("project", id);
    else u.searchParams.delete("project");
    history.replaceState(history.state, "", u.toString());
  } catch {
    /* the in-memory choice still holds */
  }
}

export interface ModelRoute {
  /** Project id from the URL; when set there is no fallback — an unknown id means «not found». */
  id: string;
  /** Switch to another project (null → back to the list). */
  go: (id: string | null) => void;
}

export function useProjectModel(route?: ModelRoute) {
  const data = useData();
  const { allProjects, projects, tasks, allTasks, notes, clients } = data;
  const { toast } = useToast();
  const [selId, setSelId] = useState<string | null>(() => (route ? route.id : readParam()));
  const [showDone, setShowDone] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>("manual");
  const [query, setQuery] = useState("");
  /** Tasks ticked in this session stay visible (struck) until reload, like the dashboard list. */
  const [justDone, setJustDone] = useState<Set<string>>(() => new Set());

  const list = useMemo(() => {
    const rank: Record<ProjectStatus, number> = { active: 0, planned: 1, done: 2, archived: 3 };
    return projects
      .map((p) => {
        const ts = tasks.filter((t) => t.projectId === p.id);
        const open = ts.filter((t) => !t.done).length;
        return { project: p, open, total: ts.length, done: ts.length - open };
      })
      .sort((a, b) => rank[a.project.status] - rank[b.project.status] || b.open - a.open || a.project.name.localeCompare(b.project.name, "ru"));
  }, [projects, tasks]);

  const routeId = route?.id;
  const project: Project | undefined = useMemo(() => {
    if (routeId) return allProjects.find((p) => p.id === routeId);
    const q = selId?.trim().toLowerCase();
    const hit = q ? allProjects.find((p) => p.id === selId || p.name.toLowerCase() === q) : undefined;
    if (hit) return hit;
    const active = list.filter((x) => x.project.status === "active").sort((a, b) => b.open - a.open);
    return (active[0] ?? list[0])?.project;
  }, [routeId, selId, allProjects, list]);

  const select = (id: string | null) => {
    if (route) return route.go(id);
    setSelId(id);
    setJustDone(new Set());
    writeParam(id);
  };

  const pid = project?.id;
  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === pid).sort((a, b) => a.order - b.order), [tasks, pid]);
  const archivedCount = useMemo(() => allTasks.filter((t) => t.projectId === pid && t.archivedAt).length, [allTasks, pid]);
  const sections = project?.sections ?? [];
  const total = projectTasks.length;
  const done = projectTasks.filter((t) => t.done).length;
  const open = total - done;
  const pct = total ? (done / total) * 100 : 0;
  const overdue = projectTasks.filter((t) => !t.done && isOverdue(t.dueDate)).length;
  const health = projectHealth(projectTasks);
  const spentMin = projectTasks.reduce((s, t) => s + (t.spentMin || 0), 0);
  const estimateMin = projectTasks.reduce((s, t) => s + (t.estimateMin || 0), 0);
  const client = project?.clientId ? clients.find((c) => c.id === project.clientId) : undefined;
  const comments = useMemo(() => [...(project?.comments ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [project?.comments]);
  const files: Attachment[] = project?.files ?? [];

  const linkedNotes: Note[] = useMemo(() => {
    if (!project) return [];
    const pn = project.name.toLowerCase();
    return notes.filter((n) => {
      if (n.linkedProjectId === project.id) return true;
      const mentions = n.body.match(/\[\[([^\]]+)\]\]/g);
      return !!mentions?.some((raw) => {
        const name = raw.slice(2, -2).trim().toLowerCase();
        return pn === name || pn.includes(name) || name.includes(pn);
      });
    });
  }, [notes, project]);

  const q = query.trim().toLowerCase();
  const match = (t: Task) => !q || t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q);

  const sortList = (xs: Task[]) => {
    const openXs = xs.filter((t) => !t.done);
    const doneXs = xs.filter((t) => t.done).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    let o = openXs;
    if (sortBy === "date") o = [...openXs].sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿"));
    if (sortBy === "priority") {
      const rank: Record<number, number> = { 1: 0, 2: 1, 3: 2, 0: 3 };
      o = [...openXs].sort((a, b) => rank[a.priority] - rank[b.priority]);
    }
    return [...o, ...doneXs];
  };
  const shown = (t: Task) => (!t.done || showDone || justDone.has(t.id)) && match(t);

  const mk = (key: string, section: string | null, label: string, kind: Group["kind"], all: Task[]): Group => ({
    key,
    section,
    label,
    kind,
    all,
    items: sortList(all.filter(shown)),
    done: all.filter((t) => t.done).length,
    total: all.length,
  });

  /** Sections + «Без секции» — always (the board uses these even for a project without sections). */
  const sectionGroups: Group[] = [
    ...sections.map((s) => mk(`s:${s}`, s, s, "section", projectTasks.filter((t) => t.section === s))),
    mk("none", null, sections.length ? "Без секции" : "Задачи", "none", projectTasks.filter((t) => !t.section || !sections.includes(t.section))),
  ];

  /** What the list shows: manual sections win; no sections → time buckets like the real page. */
  const useTime = sections.length === 0 && total > 0;
  let groups: Group[] = sectionGroups;
  if (useTime) {
    const timeGroups = groupTasksByTime(projectTasks.filter((t) => !t.done && match(t))).map((g) => mk(`t:${g.key}`, null, g.label, "time", g.items));
    const doneGroup = mk("done", null, "Выполнено", "done", projectTasks.filter((t) => t.done));
    groups = doneGroup.items.length ? [...timeGroups, doneGroup] : timeGroups;
  }

  const actions = {
    addTask: (raw: string, section?: string | null, extra?: { priority?: Priority; dueDate?: string }) => {
      if (!project || !raw.trim()) return;
      const parsed = parseNaturalInput(raw);
      data.addTask({
        title: parsed.title.trim() || raw.trim(),
        done: false,
        projectId: project.id,
        section: section || undefined,
        priority: extra?.priority ?? 0,
        dueDate: extra?.dueDate || parsed.dueDate,
        tags: parsed.tags,
        important: parsed.important,
        remindAt: parsed.remindAt,
        estimateMin: parsed.estimateMin,
        recurrence: parsed.recurrence,
      });
    },
    toggle: (id: string) => {
      const t = tasks.find((x) => x.id === id);
      if (t && !t.done) setJustDone((s) => new Set(s).add(id));
      data.toggleTask(id);
    },
    update: data.updateTask,
    remove: (t: Task) => {
      data.deleteTask(t.id);
      const run = pushUndo("Задача удалена", () => data.restoreTask(t));
      toast("Задача удалена", { actionLabel: "Вернуть", onAction: run });
    },
    moveToSection: (id: string, section: string | null) => data.updateTask(id, { section: section ?? undefined }),
    toggleSubtask: data.toggleSubtask,
    addSubtask: data.addSubtask,
    deleteSubtask: data.deleteSubtask,
    addSection: (name: string) => {
      if (project && name.trim()) data.addProjectSection(project.id, name.trim());
    },
    renameSection: (from: string, to: string) => {
      if (project && to.trim() && to.trim() !== from) data.renameProjectSection(project.id, from, to.trim());
    },
    deleteSection: (name: string) => {
      if (project) data.deleteProjectSection(project.id, name);
    },
    moveSection: (name: string, dir: -1 | 1) => {
      if (!project) return;
      const cur = [...sections];
      const i = cur.indexOf(name);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return;
      [cur[i], cur[j]] = [cur[j], cur[i]];
      data.reorderProjectSections(project.id, cur);
    },
    addComment: (text: string) => {
      if (project && text.trim()) data.addProjectComment(project.id, text.trim());
    },
    editComment: (id: string, text: string) => {
      if (project && text.trim()) data.updateProject(project.id, { comments: (project.comments ?? []).map((c) => (c.id === id ? { ...c, text: text.trim() } : c)) });
    },
    deleteComment: (id: string) => {
      if (project) data.deleteProjectComment(project.id, id);
    },
    updateProject: (patch: Partial<Project>) => {
      if (project) data.updateProject(project.id, patch);
    },
    unarchive: () => {
      if (project) data.unarchiveProject(project.id);
    },
    deleteProject: () => {
      if (!project) return;
      const p = project;
      data.deleteProject(p.id);
      const run = pushUndo(`Проект удалён: ${p.name}`, () => data.restoreProject(p));
      toast("Проект удалён", {
        actionLabel: "Вернуть",
        onAction: () => {
          run();
          select(p.id);
        },
      });
      select(null);
    },
  };

  return {
    project,
    list,
    select,
    client,
    clients,
    projectTasks,
    archivedCount,
    sections,
    total,
    done,
    open,
    pct,
    overdue,
    health,
    spentMin,
    estimateMin,
    comments,
    files,
    linkedNotes,
    groups,
    sectionGroups,
    useTime,
    showDone,
    setShowDone,
    sortBy,
    setSortBy,
    query,
    setQuery,
    actions,
  };
}

export type ProjectModel = ReturnType<typeof useProjectModel>;

// ── Switcher ──────────────────────────────────────────────────────────────────────────────────

export function ProjectSwitcher({ m, size = 44, align = "right" }: { m: ProjectModel; size?: number; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-lab-block="switcher"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 whitespace-nowrap pl-3.5 pr-3 transition-colors duration-150 hover:bg-[#232327]"
        style={{ height: size, borderRadius: 999, background: open ? C.line : C.raise, fontSize: 14, color: C.text }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <FolderKanban size={16} strokeWidth={1.75} color={C.text2} />
        <span className="max-w-[88px] truncate sm:max-w-[120px] xl:max-w-[180px]">{m.project?.name ?? "Проект"}</span>
        <ChevronDown size={16} strokeWidth={1.75} color={C.text2} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>
      {open && (
        <div
          role="listbox"
          className={`absolute z-40 flex flex-col gap-0.5 p-2 ${align === "right" ? "right-0" : "left-0"}`}
          style={{ top: size + 8, width: 320, maxHeight: 440, overflowY: "auto", background: C.panel, borderRadius: R.card, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 24px 60px rgba(0,0,0,0.55)` }}
        >
          <div className="px-3 pb-1.5 pt-1" style={{ ...T.foot, color: C.text3 }}>
            Проекты
          </div>
          {m.list.map(({ project: p, open: o, total, done }) => {
            const on = p.id === m.project?.id;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  m.select(p.id);
                  setOpen(false);
                }}
                className={`flex items-center gap-3 px-3 text-left transition-colors duration-150 ${on ? "" : "hover:bg-[#1B1B1F]"}`}
                style={{ minHeight: 52, borderRadius: R.small, background: on ? "rgba(10,132,255,0.14)" : undefined }}
              >
                <Ring pct={total ? (done / total) * 100 : 0} size={24} stroke={3} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate" style={{ ...T.body, color: C.text }}>
                    {p.name}
                  </span>
                  <span className="block" style={{ ...T.foot, color: C.text3, marginTop: 2 }}>
                    {STATUS_LABEL[p.status]} · {o ? `${o} ${plural(o, "открытая", "открытые", "открытых")}` : total ? "всё закрыто" : "нет задач"}
                  </span>
                </span>
                {on && <Check size={16} strokeWidth={2} color={C.accent} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Pills ─────────────────────────────────────────────────────────────────────────────────────

export function HealthPill({ m, size = 32, count = true }: { m: ProjectModel; size?: 28 | 32 | 40; count?: boolean }) {
  return (
    <StatusPill tone={HEALTH_TONE[m.health]} size={size}>
      {HEALTH_LABEL[m.health]}
      {count && m.overdue > 0 ? ` · ${m.overdue} просроч.` : ""}
    </StatusPill>
  );
}

export function ProjectStatusPill({ status, size = 32 }: { status: ProjectStatus; size?: 28 | 32 | 40 }) {
  return (
    <StatusPill tone={STATUS_TONE[status]} size={size}>
      {STATUS_LABEL[status]}
    </StatusPill>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────────────────────

export function TaskRow({
  t,
  m,
  onOpen,
  pad = 24,
  height = 56,
  showSection,
  draggable,
}: {
  t: Task;
  m: ProjectModel;
  onOpen: (t: Task) => void;
  pad?: number;
  height?: number;
  showSection?: boolean;
  draggable?: boolean;
}) {
  const [subs, setSubs] = useState(false);
  const { text, late } = dueText(t);
  const doneSub = t.subtasks.filter((s) => s.done).length;
  return (
    <div style={dashed}>
      <div
        role="button"
        tabIndex={0}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/task", t.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => onOpen(t)}
        onKeyDown={(e) => e.key === "Enter" && onOpen(t)}
        className="group grid cursor-pointer items-center gap-3 outline-none transition-colors duration-150 hover:bg-[#1C1C20] focus-visible:bg-[#1C1C20]"
        style={{ gridTemplateColumns: "22px minmax(0,1fr) auto 32px", minHeight: height, paddingLeft: pad, paddingRight: Math.max(8, pad - 12) }}
      >
        <RoundCheck done={t.done} onChange={() => m.actions.toggle(t.id)} />
        <div className="flex min-w-0 items-center gap-2">
          {t.priority > 0 && <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[t.priority] }} title={PRIO_LABEL[t.priority]} />}
          <span className="truncate" style={{ ...T.cell, fontSize: 15, color: t.done ? C.text3 : C.text, textDecorationLine: t.done ? "line-through" : "none", textDecorationColor: C.text3 }}>
            {t.title}
          </span>
          {showSection && t.section && (
            <span className="shrink-0 truncate" style={{ ...T.body, color: C.text3, maxWidth: 160 }}>
              · {t.section}
            </span>
          )}
          {t.subtasks.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSubs((s) => !s);
              }}
              className="inline-flex shrink-0 items-center gap-1 px-2 transition-colors duration-150 hover:bg-[#26262C]"
              style={{ height: 24, borderRadius: 999, ...T.foot, color: subs ? C.text : C.text3 }}
              title={subs ? "Свернуть подзадачи" : "Показать подзадачи"}
            >
              {subs ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />}
              {doneSub}/{t.subtasks.length}
            </button>
          )}
        </div>
        <span className="whitespace-nowrap text-right" style={{ ...T.body, color: late ? TONE.amber.fg : C.text3 }}>
          {text}
        </span>
        <button
          type="button"
          title="Удалить задачу"
          aria-label="Удалить задачу"
          onClick={(e) => {
            e.stopPropagation();
            m.actions.remove(t);
          }}
          className="grid h-8 w-8 place-items-center rounded-full opacity-0 transition-[opacity,background,color] duration-150 hover:bg-[#2A1A1A] hover:text-[#FF7A73] focus-visible:opacity-100 group-hover:opacity-100"
          style={{ color: C.text3 }}
        >
          <Trash2 size={16} strokeWidth={1.75} />
        </button>
      </div>
      {subs && t.subtasks.length > 0 && <SubList t={t} m={m} padLeft={pad + 34} padRight={pad} />}
    </div>
  );
}

export function SubList({ t, m, padLeft, padRight }: { t: Task; m: ProjectModel; padLeft: number; padRight: number }) {
  return (
    <div className="flex flex-col pb-2" style={{ paddingLeft: padLeft, paddingRight: padRight }}>
      {t.subtasks.map((s) => (
        <div key={s.id} className="flex items-center gap-2.5" style={{ minHeight: 34 }}>
          <RoundCheck done={s.done} size={16} onChange={() => m.actions.toggleSubtask(t.id, s.id)} />
          <span className="truncate" style={{ ...T.body, color: s.done ? C.text3 : C.text2, textDecoration: s.done ? "line-through" : undefined }}>
            {s.title}
          </span>
          {s.dueDate && !s.done && (
            <span className="ml-auto shrink-0" style={{ ...T.foot, color: isOverdue(s.dueDate) ? TONE.amber.fg : C.text3 }}>
              {dueLabel(s.dueDate)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Adding ────────────────────────────────────────────────────────────────────────────────────

export function InlineAdd({ onAdd, placeholder, pad = 24, height = 48 }: { onAdd: (v: string) => void; placeholder: string; pad?: number; height?: number }) {
  const [v, setV] = useState("");
  return (
    <label className="flex cursor-text items-center gap-3" style={{ minHeight: height, paddingLeft: pad, paddingRight: pad }}>
      <span className="grid shrink-0 place-items-center" style={{ width: 22, height: 22, color: C.text3 }}>
        <Plus size={16} strokeWidth={1.75} />
      </span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim()) {
            onAdd(v);
            setV("");
          }
          if (e.key === "Escape") setV("");
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
      {v.trim() && (
        <span className="shrink-0" style={{ ...T.foot, color: C.text3 }}>
          Enter
        </span>
      )}
    </label>
  );
}

/** «+ Секция» pill that turns into an input. */
export function AddSection({ m, height = 36, block }: { m: ProjectModel; height?: number; block?: boolean }) {
  const [on, setOn] = useState(false);
  const [v, setV] = useState("");
  const commit = () => {
    if (v.trim()) m.actions.addSection(v);
    setV("");
    setOn(false);
  };
  if (!on)
    return (
      <button
        type="button"
        onClick={() => setOn(true)}
        className={`inline-flex items-center gap-2 whitespace-nowrap px-3.5 transition-colors duration-150 hover:bg-[#26262C] ${block ? "w-full justify-center" : ""}`}
        style={{ height, borderRadius: 999, background: C.raise, color: C.text, fontSize: 13 }}
      >
        <Plus size={14} strokeWidth={2} color={C.text2} />
        Секция
      </button>
    );
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setV("");
          setOn(false);
        }
      }}
      placeholder="Название секции"
      className={`bg-transparent px-4 outline-none placeholder:text-[#5E6068] ${block ? "w-full" : "w-44"}`}
      style={{ height, borderRadius: 999, boxShadow: "inset 0 0 0 1px rgba(10,132,255,0.5)", background: C.card, fontSize: 13, color: C.text }}
    />
  );
}

// ── Section header (rename on double click or pencil; delete keeps the tasks) ────────────────

export function SectionTitle({ g, m, size = 16, ring = true, extra }: { g: Group; m: ProjectModel; size?: number; ring?: boolean; extra?: ReactNode }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(g.label);
  const editable = g.kind === "section" && g.section !== null;
  const muted = g.kind === "none" && m.sections.length > 0;
  const commit = () => {
    if (g.section) m.actions.renameSection(g.section, v);
    setEdit(false);
  };
  return (
    <div className="group/sec flex min-w-0 flex-1 items-center gap-2.5">
      {edit ? (
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEdit(false);
          }}
          className="min-w-0 flex-1 bg-transparent px-2 outline-none"
          style={{ height: 32, borderRadius: 10, boxShadow: "inset 0 0 0 1px rgba(10,132,255,0.5)", fontSize: size, fontWeight: 500, color: C.text }}
        />
      ) : (
        <span
          className="truncate"
          style={{ fontSize: size, lineHeight: 1.25, fontWeight: 500, letterSpacing: "-0.01em", color: muted ? C.text2 : C.text }}
          onDoubleClick={() => {
            if (!editable) return;
            setV(g.label);
            setEdit(true);
          }}
          title={editable ? "Двойной клик — переименовать" : undefined}
        >
          {g.label}
        </span>
      )}
      {ring && g.total > 0 && !edit && (
        <span className="flex shrink-0 items-center gap-1.5" title="Закрыто в секции">
          <Ring pct={(g.done / g.total) * 100} size={18} stroke={2.5} />
          <span style={{ ...T.foot, ...T.num, color: C.text3 }}>
            {g.done}/{g.total}
          </span>
        </span>
      )}
      {extra}
      {editable && !edit && (
        <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/sec:opacity-100">
          <HoverIcon
            title="Переименовать секцию"
            onClick={() => {
              setV(g.label);
              setEdit(true);
            }}
          >
            <Pencil size={14} strokeWidth={1.75} />
          </HoverIcon>
          <HoverIcon title="Удалить секцию (задачи останутся)" danger onClick={() => g.section && m.actions.deleteSection(g.section)}>
            <Trash2 size={14} strokeWidth={1.75} />
          </HoverIcon>
        </span>
      )}
    </div>
  );
}

export function HoverIcon({ children, title, onClick, danger, size = 30 }: { children: ReactNode; title: string; onClick: () => void; danger?: boolean; size?: number }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid shrink-0 place-items-center rounded-full transition-colors duration-150 ${danger ? "hover:bg-[#2A1A1A] hover:text-[#FF7A73]" : "hover:bg-[#26262C] hover:text-[#F4F5F7]"}`}
      style={{ width: size, height: size, color: C.text3 }}
    >
      {children}
    </button>
  );
}

// ── Journal («Обновления») ────────────────────────────────────────────────────────────────────

export function JournalAdd({ m, inputRef, placeholder = "Что нужно внести или сделать…" }: { m: ProjectModel; inputRef?: React.RefObject<HTMLInputElement>; placeholder?: string }) {
  const [v, setV] = useState("");
  const submit = () => {
    if (!v.trim()) return;
    m.actions.addComment(v);
    setV("");
  };
  return (
    <div className="flex items-center gap-2 pl-4 pr-1.5" style={{ height: 52, borderRadius: R.inner, boxShadow: `inset 0 0 0 1px ${C.line}` }}>
      <input
        ref={inputRef}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
      <Btn size={40} kind={v.trim() ? "primary" : "ghost"} onClick={submit}>
        Записать
      </Btn>
    </div>
  );
}

export function JournalEntry({ c, m, flat }: { c: ProjectComment; m: ProjectModel; flat?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(c.text);
  const commit = () => {
    if (v.trim() && v.trim() !== c.text) m.actions.editComment(c.id, v);
    setEdit(false);
  };
  return (
    <div className={`group/c flex flex-col gap-1.5 ${flat ? "py-3.5" : "p-4"}`} style={flat ? dashed : { background: C.raise, borderRadius: R.inner }}>
      <div className="flex items-center justify-between gap-2" style={{ minHeight: 20 }}>
        <span style={{ ...T.foot, color: C.text3 }}>
          {dayLabel(c.at)} · {timeLabel(c.at)}
        </span>
        <span className="-my-1.5 flex items-center opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/c:opacity-100">
          <HoverIcon title="Удалить запись" danger size={28} onClick={() => m.actions.deleteComment(c.id)}>
            <Trash2 size={14} strokeWidth={1.75} />
          </HoverIcon>
        </span>
      </div>
      {edit ? (
        <textarea
          autoFocus
          value={v}
          rows={Math.min(6, Math.max(2, v.split("\n").length))}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setV(c.text);
              setEdit(false);
            }
          }}
          className="w-full resize-none bg-transparent px-2 py-1.5 outline-none"
          style={{ borderRadius: 10, boxShadow: "inset 0 0 0 1px rgba(10,132,255,0.5)", fontSize: 14, lineHeight: 1.45, color: C.text }}
        />
      ) : (
        <p
          className="cursor-text whitespace-pre-wrap break-words"
          style={{ ...T.body, lineHeight: 1.45, color: C.text }}
          onClick={() => {
            setV(c.text);
            setEdit(true);
          }}
          title="Клик — редактировать"
        >
          <Linkify text={c.text} />
        </p>
      )}
    </div>
  );
}

export function JournalList({ m, flat, limit }: { m: ProjectModel; flat?: boolean; limit?: number }) {
  const [all, setAll] = useState(false);
  const xs = limit && !all ? m.comments.slice(0, limit) : m.comments;
  if (m.comments.length === 0)
    return (
      <div className="py-1" style={{ ...T.body, color: C.text3 }}>
        Записей пока нет.
      </div>
    );
  return (
    <div className={`flex flex-col ${flat ? "" : "gap-2"}`}>
      {xs.map((c) => (
        <JournalEntry key={c.id} c={c} m={m} flat={flat} />
      ))}
      {limit && m.comments.length > limit && (
        <button type="button" onClick={() => setAll((x) => !x)} className="mt-2 self-start" style={{ ...T.foot, color: C.text2 }}>
          {all ? "Свернуть" : `Ещё ${m.comments.length - limit}`}
        </button>
      )}
    </div>
  );
}

// ── Materials: files + links + notes ──────────────────────────────────────────────────────────

async function openFile(f: Attachment) {
  try {
    const blob = await loadAttachmentBlob(f.id);
    if (blob) window.open(URL.createObjectURL(blob), "_blank");
  } catch {
    /* the blob lives on the device where it was attached */
  }
}

export function FileRow({ f }: { f: Attachment }) {
  const ext = (f.name.split(".").pop() ?? "").slice(0, 4).toUpperCase();
  return (
    <button
      type="button"
      onClick={() => openFile(f)}
      className="flex w-full items-center gap-3 px-3 text-left transition-colors duration-150 hover:bg-[#232327]"
      style={{ minHeight: 56, borderRadius: R.small, background: C.raise }}
    >
      <span className="grid shrink-0 place-items-center" style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(10,132,255,0.10)", color: "#5AA9FF", fontSize: 9, fontWeight: 500, letterSpacing: "0.02em" }}>
        {ext || <FileText size={16} strokeWidth={1.75} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate" style={{ ...T.body, color: C.text }}>
          {f.name}
        </span>
        <span className="block" style={{ ...T.foot, color: C.text3, marginTop: 2 }}>
          {fileSize(f.size)} · {dayLabel(f.createdAt)}
        </span>
      </span>
    </button>
  );
}

export function NoteRow({ n }: { n: Note }) {
  return (
    <div className="flex items-center gap-3 px-3" style={{ minHeight: 48, borderRadius: R.small, background: C.raise }}>
      <NotebookPen size={16} strokeWidth={1.75} color={C.text2} />
      <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>
        {n.title || "Без названия"}
      </span>
      <span className="shrink-0" style={{ ...T.foot, color: C.text3 }}>
        {dayLabel(n.createdAt)}
      </span>
    </div>
  );
}

export function useLinks(m: ProjectModel) {
  return useMemo(() => {
    const out: { url: string; at: string }[] = [];
    for (const c of m.comments) for (const u of c.text.match(/https?:\/\/[^\s]+/g) ?? []) out.push({ url: u, at: c.at });
    return out;
  }, [m.comments]);
}

/** Files + links found in the journal + note mentions. One calm line when there's nothing. */
export function Materials({ m }: { m: ProjectModel }) {
  const links = useLinks(m);
  if (m.files.length + m.linkedNotes.length + links.length === 0)
    return <div style={{ ...T.body, color: C.text3 }}>Файлов, ссылок и упоминаний в заметках нет.</div>;
  return (
    <div className="flex flex-col gap-2">
      {m.files.map((f) => (
        <FileRow key={f.id} f={f} />
      ))}
      {links.map((l, i) => (
        <a
          key={i}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-3 transition-colors duration-150 hover:bg-[#232327]"
          style={{ minHeight: 48, borderRadius: R.small, background: C.raise }}
        >
          <Link2 size={16} strokeWidth={1.75} color={C.text2} />
          <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>
            {l.url.replace(/^https?:\/\//, "").split("/")[0]}
          </span>
          <span className="shrink-0" style={{ ...T.foot, color: C.text3 }}>
            {dayLabel(l.at)}
          </span>
        </a>
      ))}
      {m.linkedNotes.map((n) => (
        <NoteRow key={n.id} n={n} />
      ))}
    </div>
  );
}

// ── Dialog chrome (the dashboard TaskEditor recipe) ───────────────────────────────────────────

export const field: CSSProperties = { height: 44, borderRadius: 12, background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}`, padding: "0 14px", fontSize: 14, color: C.text };
export const fieldLabel: CSSProperties = { ...T.foot, color: C.text3, marginBottom: 6 };

export function Dialog({ title, onClose, children, width = 560, label }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number; label: string }) {
  useEsc(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={label}
        className="flex w-full flex-col gap-5 overflow-y-auto p-6 [scrollbar-width:thin]"
        style={{ maxWidth: width, maxHeight: "calc(100vh - 48px)", background: C.panel, borderRadius: R.page, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 30px 80px rgba(0,0,0,0.6)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span style={T.h2}>{title}</span>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
        {children}
      </div>
    </div>
  );
}

export function DialogFoot({ onDelete, deleteLabel = "Удалить", onClose, onSave, canSave }: { onDelete?: () => void; deleteLabel?: string; onClose: () => void; onSave: () => void; canSave: boolean }) {
  return (
    <div className="flex items-center justify-between pt-1">
      {onDelete ? (
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 px-4 transition-colors hover:bg-[#2A1A1A]" style={{ height: 44, borderRadius: 999, color: TONE.red.fg, fontSize: 14 }}>
          <Trash2 size={16} strokeWidth={1.75} />
          {deleteLabel}
        </button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        <Btn kind="ghost" onClick={onClose}>
          Отмена
        </Btn>
        <Btn onClick={onSave} disabled={!canSave}>
          Сохранить
        </Btn>
      </div>
    </div>
  );
}

function ChoicePill({ on, onClick, children, dot }: { on: boolean; onClick: () => void; children: ReactNode; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3.5 transition-colors"
      style={{ height: 36, borderRadius: 999, fontSize: 14, background: on ? "rgba(10,132,255,0.14)" : "transparent", boxShadow: on ? "none" : `inset 0 0 0 1px ${C.line}`, color: on ? C.text : C.text2 }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 9, background: dot }} />}
      {children}
    </button>
  );
}

/** Task editor — title, description, due, estimate, priority, section, subtasks; delete with undo. */
export function TaskEditor({ task, m, onClose }: { task: Task; m: ProjectModel; onClose: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [due, setDue] = useState(task.dueDate ?? "");
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [section, setSection] = useState(task.section && m.sections.includes(task.section) ? task.section : "");
  const [estimate, setEstimate] = useState(task.estimateMin ? String(task.estimateMin) : "");
  const [sub, setSub] = useState("");
  const save = () => {
    if (!title.trim()) return;
    const est = Math.max(0, Math.round(Number(estimate)));
    m.actions.update(task.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: due || undefined,
      priority,
      section: section || undefined,
      estimateMin: est || undefined,
    });
    onClose();
  };
  return (
    <Dialog title="Задача" label="Задача" onClose={onClose}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="w-full bg-transparent outline-none"
        style={{ ...field, height: 52, fontSize: 16 }}
        placeholder="Название задачи"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="Описание, ссылки, детали…"
        className="w-full resize-none bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ ...field, height: "auto", padding: "12px 14px", lineHeight: 1.45 }}
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col">
          <span style={fieldLabel}>Срок</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="outline-none [color-scheme:dark]" style={field} />
        </label>
        <label className="flex flex-col">
          <span style={fieldLabel}>Оценка, мин</span>
          <input type="number" min={0} step={15} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="—" className="outline-none" style={field} />
        </label>
      </div>
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
      {m.sections.length > 0 && (
        <label className="flex flex-col">
          <span style={fieldLabel}>Секция</span>
          <select value={section} onChange={(e) => setSection(e.target.value)} className="outline-none [color-scheme:dark]" style={field}>
            <option value="">Без секции</option>
            {m.sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-col">
        <span style={fieldLabel}>Подзадачи{task.subtasks.length ? ` · ${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length}` : ""}</span>
        <div className="flex flex-col overflow-hidden" style={{ background: C.card, borderRadius: 12, boxShadow: `inset 0 0 0 1px ${C.line}` }}>
          {task.subtasks.map((s) => (
            <div key={s.id} className="group/st flex items-center gap-2.5 px-3.5" style={{ minHeight: 40, ...dashed }}>
              <RoundCheck done={s.done} size={16} onChange={() => m.actions.toggleSubtask(task.id, s.id)} />
              <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: s.done ? C.text3 : C.text, textDecoration: s.done ? "line-through" : undefined }}>
                {s.title}
              </span>
              <span className="opacity-0 transition-opacity group-hover/st:opacity-100">
                <HoverIcon title="Удалить подзадачу" danger size={26} onClick={() => m.actions.deleteSubtask(task.id, s.id)}>
                  <X size={13} strokeWidth={1.75} />
                </HoverIcon>
              </span>
            </div>
          ))}
          <input
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && sub.trim()) {
                m.actions.addSubtask(task.id, sub);
                setSub("");
              }
            }}
            placeholder="Новая подзадача — Enter"
            className="bg-transparent px-3.5 outline-none placeholder:text-[#5E6068]"
            style={{ height: 40, fontSize: 14, color: C.text }}
          />
        </div>
      </div>
      <DialogFoot
        onClose={onClose}
        onSave={save}
        canSave={!!title.trim()}
        onDelete={() => {
          onClose();
          m.actions.remove(task);
        }}
      />
    </Dialog>
  );
}

/** Project editor — name, client, status, priority; «Удалить проект» with undo. */
export function ProjectEditor({ m, onClose }: { m: ProjectModel; onClose: () => void }) {
  const p = m.project!;
  const [name, setName] = useState(p.name);
  const [clientId, setClientId] = useState(p.clientId ?? "");
  const [status, setStatus] = useState<ProjectStatus>(p.status);
  const [priority, setPriority] = useState<Priority>(p.priority ?? 0);
  const save = () => {
    if (!name.trim()) return;
    m.actions.updateProject({ name: name.trim(), clientId: clientId || undefined, status, priority });
    onClose();
  };
  const statusDot: Record<ProjectStatus, string> = { planned: "#4A4C54", active: C.accent, done: C.green, archived: "#4A4C54" };
  return (
    <Dialog title="Проект" label="Проект" onClose={onClose}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="w-full bg-transparent outline-none"
        style={{ ...field, height: 52, fontSize: 16 }}
        placeholder="Название проекта"
      />
      <label className="flex flex-col">
        <span style={fieldLabel}>Клиент</span>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="outline-none [color-scheme:dark]" style={field}>
          <option value="">Без клиента</option>
          {m.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.company ? ` · ${c.company}` : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col">
        <span style={fieldLabel}>Статус</span>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <ChoicePill key={s} on={status === s} onClick={() => setStatus(s)} dot={statusDot[s]}>
              {STATUS_LABEL[s]}
            </ChoicePill>
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        <span style={fieldLabel}>Приоритет</span>
        <div className="flex flex-wrap gap-1.5">
          {PRIOS.map(({ p: pr, label }) => (
            <ChoicePill key={pr} on={priority === pr} onClick={() => setPriority(pr)} dot={PRIO_DOT[pr]}>
              {label}
            </ChoicePill>
          ))}
        </div>
      </div>
      <DialogFoot
        onClose={onClose}
        onSave={save}
        canSave={!!name.trim()}
        deleteLabel="Удалить проект"
        onDelete={() => {
          onClose();
          m.actions.deleteProject();
        }}
      />
    </Dialog>
  );
}

/** Editing state shared by every concept: which task / whether the project dialog is open. */
export function useEditors(m: ProjectModel) {
  const { tasks } = useData();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const task = taskId ? tasks.find((t) => t.id === taskId) : undefined;
  return {
    openTask: (t: Task) => setTaskId(t.id),
    openProject: () => setProjectOpen(true),
    node: (
      <>
        {task && <TaskEditor key={task.id} task={task} m={m} onClose={() => setTaskId(null)} />}
        {projectOpen && m.project && <ProjectEditor m={m} onClose={() => setProjectOpen(false)} />}
      </>
    ),
  };
}

/** Archived-project line (the real page lets you restore from here). */
export function ArchivedNote({ m }: { m: ProjectModel }) {
  if (!m.project?.archivedAt) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4" style={{ minHeight: 52, borderRadius: R.inner, background: C.card }}>
      <span style={{ ...T.body, color: C.text2 }}>Проект в архиве — он скрыт из списков.</span>
      <Btn size={36} onClick={m.actions.unarchive}>
        Восстановить
      </Btn>
    </div>
  );
}

export function NoProject() {
  return (
    <div className="mt-6">
      <Empty>Проектов пока нет — создайте первый в разделе «Проекты».</Empty>
    </div>
  );
}

export function NoTasks({ query }: { query?: string }) {
  return <Empty>{query ? "Ничего не найдено" : "В проекте пока нет задач — добавьте первую."}</Empty>;
}

export function visibleCount(groups: Group[]) {
  return groups.reduce((s, g) => s + g.items.length, 0);
}
