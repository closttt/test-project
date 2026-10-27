/**
 * «Задачи» · Craft Dark — pieces of the chosen screen (v1): the task model (same filters, counts and
 * store actions as pages/Tasks.tsx), the list row (draggable onto a day of the week board), quick
 * add, pill tabs and the task editor (the main screen's TaskEditor, extended with tags and subtasks).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, CalendarClock, Check, Clock3, FolderKanban, ListChecks, Plus, Trash2, X } from "lucide-react";

import { Btn, C, IconBtn, PRIO_TONE, R, T, TONE, dashed } from "@/design-lab/screens/_kit/craft";
import { CalendarPanel, DatePicker, Floating, Select, TagChips, TagInput, metaChip } from "@/design-lab/screens/_kit/controls";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { addDays, dueLabel, formatDate, formatDuration, isOverdue, isToday, isUpcoming, todayStr } from "@/lib/format";
import { isSnoozed } from "@/lib/taskGrouping";
import { blockingTasks } from "@/lib/dependencies";
import { parseNaturalInput } from "@/lib/nlp";
import { pushUndo } from "@/lib/undoStack";
import { FIXED_TAGS } from "@/lib/tags";
import type { Meeting, Priority, Task } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────────────────────

export const ICON = { size: 18, strokeWidth: 1.75 } as const;
export const PRIO_DOT: Record<number, string> = { 0: "#4A4C54", 1: C.red, 2: C.amber, 3: C.accent };
const PRIOS: { p: Priority; label: string }[] = [
  { p: 1, label: "Высокий" },
  { p: 2, label: "Средний" },
  { p: 3, label: "Низкий" },
  { p: 0, label: "Без приоритета" },
];
export const PRIO_LABEL: Record<number, string> = { 0: "Без приоритета", 1: "Высокий", 2: "Средний", 3: "Низкий" };
export const PRIO_RANK: Record<number, number> = { 1: 0, 2: 1, 3: 2, 0: 3 };
export const tint = "rgba(10,132,255,0.14)";

export type SmartList = "all" | "today" | "overdue" | "upcoming" | "snoozed" | "done";

export const LISTS: { key: SmartList; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "today", label: "Сегодня" },
  { key: "overdue", label: "Просрочено" },
  { key: "upcoming", label: "Предстоящие" },
  { key: "snoozed", label: "Отложенные" },
  { key: "done", label: "Завершённые" },
];

/** Same rules as pages/Tasks.tsx. */
function matchesList(t: Task, list: SmartList): boolean {
  if (list === "snoozed") return !t.done && isSnoozed(t);
  if (isSnoozed(t)) return false;
  switch (list) {
    case "all":
      return !t.done;
    case "today":
      return !t.done && !!t.dueDate && isToday(t.dueDate);
    case "overdue":
      return !t.done && isOverdue(t.dueDate);
    case "upcoming":
      return !t.done && isUpcoming(t.dueDate);
    case "done":
      return t.done;
  }
}

const byDue = (a: Task, b: Task) => {
  if (a.done !== b.done) return Number(a.done) - Number(b.done);
  const d = (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿");
  return d || PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
};

/** Right-hand date text: «с 05 окт.» when overdue, «до …» when snoozed, «готово 05 окт.» when done. */
export function dueText(t: Task): { text: string; late: boolean } {
  if (t.done) return { text: t.completedAt ? `готово ${formatDate(t.completedAt)}` : "готово", late: false };
  if (isSnoozed(t)) return { text: `до ${dueLabel(t.snoozedUntil!)}`, late: false };
  if (!t.dueDate) return { text: "без срока", late: false };
  if (isOverdue(t.dueDate)) return { text: `с ${dueLabel(t.dueDate)}`, late: true };
  return { text: dueLabel(t.dueDate), late: false };
}

// ── Model ─────────────────────────────────────────────────────────────────────────────────────

interface FilterOpts {
  list: SmartList;
  query?: string;
  projectId?: string | null; // null = only without project, undefined = any
  tag?: string | null;
}

export function useTasksModel() {
  const data = useData();
  const { tasks, projects, gamification, completionLog, settings } = data;
  const { toggleTask, addTask, deleteTask, restoreTask, updateTask, toggleSubtask, addSubtask, deleteSubtask } = data;
  const { toast } = useToast();
  /** Ticked in this session — stay in their list struck through instead of vanishing. */
  const [justClosed, setJustClosed] = useState<Set<string>>(() => new Set());
  /** Added in this session — float to the top of their list so a new task is never hidden behind «Ещё». */
  const [justAdded, setJustAdded] = useState<string[]>([]);

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  /** Every tag in use, most used first, with the fixed pair always offered. */
  const allTags = useMemo(() => {
    const n = new Map<string, number>(FIXED_TAGS.map((t) => [t, 0]));
    for (const t of tasks) for (const tag of t.tags) n.set(tag, (n.get(tag) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru")).map(([t]) => t);
  }, [tasks]);

  const counts = useMemo(() => {
    const c = {} as Record<SmartList, number>;
    LISTS.forEach(({ key }) => (c[key] = tasks.filter((t) => matchesList(t, key)).length));
    return c;
  }, [tasks]);

  const inList = (t: Task, list: SmartList) =>
    matchesList(t, list) || (list !== "done" && t.done && justClosed.has(t.id) && matchesList({ ...t, done: false }, list));

  const filter = ({ list, query = "", projectId, tag }: FilterOpts): Task[] => {
    const q = query.trim().toLowerCase();
    const out = tasks.filter(
      (t) =>
        inList(t, list) &&
        (projectId === undefined || (projectId === null ? !t.projectId : t.projectId === projectId)) &&
        (!tag || t.tags.includes(tag)) &&
        (!q ||
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.projectId ? (projectName.get(t.projectId) ?? "").toLowerCase().includes(q) : false))
    );
    if (list === "done") return out.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    return freshFirst(out.sort(byDue));
  };

  const freshFirst = (xs: Task[]): Task[] => {
    if (!justAdded.length) return xs;
    const rank = new Map(justAdded.map((id, i) => [id, i]));
    const fresh = xs.filter((t) => rank.has(t.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    return fresh.length ? [...fresh, ...xs.filter((t) => !rank.has(t.id))] : xs;
  };

  const goal = Math.max(1, gamification.dailyGoal || settings.dailyFocusLimit || 5);
  const closedToday = completionLog[todayStr()] ?? 0;

  const actions = {
    toggle: (t: Task) => {
      if (!t.done) {
        const blockers = blockingTasks(t, tasks);
        if (blockers.length > 0) {
          toast(`Заблокировано — сначала закройте «${blockers[0].title}»${blockers.length > 1 ? ` (+${blockers.length - 1})` : ""}`);
          return;
        }
        setJustClosed((s) => new Set(s).add(t.id));
      }
      toggleTask(t.id);
    },
    add: (raw: string, extra: { dueDate?: string; projectId?: string; priority?: Priority } = {}) => {
      const title = raw.trim();
      if (!title) return "";
      const parsed = parseNaturalInput(title);
      const id = addTask({
        title: parsed.title.trim() || title,
        done: false,
        dueDate: parsed.dueDate ?? extra.dueDate,
        projectId: extra.projectId,
        priority: extra.priority ?? 0,
        tags: parsed.tags,
        important: parsed.important,
        remindAt: parsed.remindAt,
        estimateMin: parsed.estimateMin,
        recurrence: parsed.recurrence,
      });
      setJustAdded((xs) => [id, ...xs]);
      toast("Задача добавлена");
      return id;
    },
    remove: (t: Task) => {
      deleteTask(t.id);
      const run = pushUndo("Задача удалена", () => restoreTask(t));
      toast("Задача удалена", { actionLabel: "Вернуть", onAction: run });
    },
    /** Full-form create (the «Новая задача» dialog) — every field already chosen, no text parsing. */
    create: (input: {
      title: string;
      description?: string;
      dueDate?: string;
      priority: Priority;
      projectId?: string;
      estimateMin?: number;
      tags: string[];
      subtaskTitles: string[];
    }) => {
      const id = addTask({ ...input, done: false });
      setJustAdded((xs) => [id, ...xs]);
      toast("Задача добавлена");
      return id;
    },
    update: (id: string, patch: Partial<Task>) => updateTask(id, patch),
    toggleSub: toggleSubtask,
    addSub: addSubtask,
    deleteSub: deleteSubtask,
    bulkReschedule: (ids: string[], offset: number) => {
      ids.forEach((id) => updateTask(id, { dueDate: addDays(new Date(), offset) }));
      toast(`Перенесено: ${ids.length}`);
    },
  };

  return { tasks, projects, projectName, allTags, counts, filter, freshFirst, goal, closedToday, weekStartsMonday: settings.weekStartsMonday, actions };
}

export type TasksModel = ReturnType<typeof useTasksModel>;

// ── Controls ──────────────────────────────────────────────────────────────────────────────────

/** Pill tabs with counts; active = soft blue tint. */
export function ListTabs<K extends string>({
  items,
  value,
  onChange,
  size = 40,
}: {
  items: { key: K; label: string; count?: number; warn?: boolean }[];
  value: K;
  onChange: (k: K) => void;
  size?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`inline-flex items-center gap-2 whitespace-nowrap px-4 transition-colors duration-150 ${on ? "" : "hover:bg-[#161619]"}`}
            style={{ height: size, borderRadius: 999, background: on ? tint : "transparent", color: on ? C.text : C.text2, fontSize: 14 }}
          >
            {it.label}
            {it.count !== undefined && it.count > 0 && (
              <span style={{ ...T.num, fontWeight: 400, fontSize: 12, color: on ? "#5AA9FF" : it.warn ? TONE.amber.fg : C.text3 }}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Quick add — the main screen's SolidAdd: hairline field + solid blue «Добавить». */
export function QuickAdd({
  onAdd,
  placeholder = "Новая задача — «завтра 15:00 #работа»",
  inputRef,
  height = 56,
  compact,
}: {
  onAdd: (v: string) => void;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  height?: number;
  compact?: boolean;
}) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v);
        setV("");
      }}
      className="flex items-center gap-2 pr-1.5"
      style={{ height, paddingLeft: compact ? 14 : 20, borderRadius: compact ? R.small : R.inner, boxShadow: `inset 0 0 0 1px ${C.line}` }}
    >
      <input
        ref={inputRef}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
      {compact ? (
        <button
          type="submit"
          aria-label="Добавить"
          className="grid shrink-0 place-items-center transition-[filter] hover:brightness-110"
          style={{ width: height - 10, height: height - 10, borderRadius: 999, background: v.trim() ? C.accent : C.raise, color: v.trim() ? "#fff" : C.text2 }}
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      ) : (
        <Btn type="submit" icon={<Plus size={16} strokeWidth={2} />}>
          Добавить
        </Btn>
      )}
    </form>
  );
}

/** Hover-revealed trash button. */
function TrashBtn({ onClick, size = 32 }: { onClick: () => void; size?: number }) {
  return (
    <button
      type="button"
      title="Удалить задачу"
      aria-label="Удалить задачу"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid shrink-0 place-items-center rounded-full opacity-0 transition-[opacity,background,color] duration-150 hover:bg-[#2A1A1A] hover:text-[#FF6B63] focus-visible:opacity-100 group-hover:opacity-100"
      style={{ width: size, height: size, color: C.text3 }}
    >
      <Trash2 size={16} strokeWidth={1.75} />
    </button>
  );
}

/** Priority as its own tinted chip in the priority hue (red / amber / blue); nothing for «без приоритета». */
export function PrioChip({ p }: { p: number }) {
  if (!p) return null;
  const tone = TONE[PRIO_TONE[p]];
  return (
    <span className="inline-flex shrink-0 items-center" style={{ ...metaChip, background: tone.bg, color: tone.fg }}>
      {PRIO_LABEL[p]}
    </span>
  );
}

/** Project as a muted chip with the folder glyph; click opens the project. `on` = the surface below. */
export function ProjectChip({ id, name, on = "card", onNavigate }: { id: string; name: string; on?: "card" | "raise"; onNavigate?: () => void }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      title={`Открыть проект «${name}»`}
      onClick={(e) => {
        e.stopPropagation();
        onNavigate?.();
        navigate(`/projects/${id}`);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="inline-flex min-w-0 shrink items-center gap-1 transition-colors hover:text-[#F4F5F7]"
      style={{ ...metaChip, maxWidth: 170, background: on === "raise" ? C.line2 : C.raise, color: C.text2 }}
    >
      <FolderKanban size={12} strokeWidth={1.75} className="shrink-0" />
      <span className="truncate">{name}</span>
    </button>
  );
}

/** Subtasks done/total with the list glyph. */
export function SubCount({ t }: { t: Task }) {
  if (!t.subtasks.length) return null;
  const done = t.subtasks.filter((s) => s.done).length;
  return (
    <span className="inline-flex shrink-0 items-center gap-1" style={{ ...T.num, fontWeight: 400, fontSize: 12, color: done === t.subtasks.length ? TONE.green.fg : C.text3 }}>
      <ListChecks size={13} strokeWidth={1.75} />
      {done}/{t.subtasks.length}
    </span>
  );
}

/** Tracked time (or the estimate, «~») with the clock glyph. */
export function TimeMeta({ t }: { t: Task }) {
  const v = t.spentMin > 0 ? formatDuration(t.spentMin) : t.estimateMin ? `~${formatDuration(t.estimateMin)}` : "";
  if (!v) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1" style={{ ...T.num, fontWeight: 400, fontSize: 12, color: C.text3 }}>
      <Clock3 size={13} strokeWidth={1.75} />
      {v}
    </span>
  );
}

/** The list row — same information as the card: check · title · priority · project · tags · subtasks · time … date · trash. */
export function TaskLine({
  t,
  m,
  onOpen,
  active,
  showProject = true,
  pad = 24,
  height = 60,
}: {
  t: Task;
  m: TasksModel;
  onOpen: () => void;
  active?: boolean;
  showProject?: boolean;
  pad?: number;
  height?: number;
}) {
  const { text, late } = dueText(t);
  const pname = t.projectId ? m.projectName.get(t.projectId) : undefined;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group grid cursor-pointer items-center gap-4 outline-none transition-colors duration-150 hover:bg-[#17171A] focus-visible:bg-[#17171A]"
      style={{
        gridTemplateColumns: "22px minmax(0,1fr) auto 32px",
        minHeight: height,
        paddingLeft: pad,
        paddingRight: pad - 8,
        ...dashed,
        background: active ? "rgba(10,132,255,0.10)" : undefined,
      }}
    >
      <RoundCheckBtn done={t.done} onChange={() => m.actions.toggle(t)} />
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="min-w-0 truncate"
          style={{ ...T.cell, minWidth: 96, color: t.done ? C.text3 : C.text, textDecorationLine: t.done ? "line-through" : "none", textDecorationColor: C.text3 }}
        >
          {t.title}
        </span>
        <PrioChip p={t.priority} />
        {showProject && pname && t.projectId && (
          <span className="hidden min-w-0 shrink sm:inline-flex">
            <ProjectChip id={t.projectId} name={pname} />
          </span>
        )}
        <span className="hidden min-w-0 shrink md:inline-flex">
          <TagChips tags={t.tags} />
        </span>
        <SubCount t={t} />
        <span className="hidden lg:inline-flex">
          <TimeMeta t={t} />
        </span>
      </div>
      <span className="whitespace-nowrap text-right" style={{ ...T.body, color: late ? TONE.amber.fg : C.text3 }}>
        {text}
      </span>
      <TrashBtn onClick={() => m.actions.remove(t)} />
    </div>
  );
}

/** Round checkbox (kit RoundCheck look) that stops row clicks. */
export function RoundCheckBtn({ done, onChange, size = 22 }: { done: boolean; onChange: () => void; size?: number }) {
  return (
    <button
      type="button"
      aria-label={done ? "Вернуть в работу" : "Завершить"}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="grid shrink-0 place-items-center transition-colors duration-150 hover:shadow-[inset_0_0_0_1.5px_#0A84FF]"
      style={{ width: size, height: size, borderRadius: 999, background: done ? C.accent : "transparent", boxShadow: done ? "none" : `inset 0 0 0 1.5px ${C.line2}` }}
    >
      {done && <Check size={size * 0.6} strokeWidth={3} color="#fff" />}
    </button>
  );
}

// ── Dates ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Date popover anchored to a card's date chip: quick chips, «Без срока» and a month calendar.
 * Kit `Floating`: portaled with fixed positioning so it never widens a narrow column or the page,
 * and it stops React events so a pick doesn't also open the card underneath.
 */
export function DatePop({
  anchor,
  value,
  weekStartsMonday,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  value?: string;
  weekStartsMonday: boolean;
  onPick: (date: string | undefined) => void;
  onClose: () => void;
}) {
  const keyRef = useRef<((e: KeyboardEvent) => boolean | void) | null>(null);
  return (
    <Floating anchor={anchor} onClose={onClose} width={292} align="end" label="Срок" onKey={(e) => keyRef.current?.(e)}>
      <CalendarPanel
        value={value ?? ""}
        weekStartsMonday={weekStartsMonday}
        keyRef={keyRef}
        onPick={(d) => {
          onPick(d || undefined);
          onClose();
        }}
      />
    </Floating>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────────────────────

const fieldStyle: CSSProperties = { height: 44, borderRadius: 12, background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}`, padding: "0 14px", fontSize: 14, color: C.text };
const labelStyle: CSSProperties = { ...T.foot, color: C.text3, marginBottom: 6 };

/** Defaults for a task created from the «Новая задача» dialog. */
export interface TaskDraft {
  dueDate?: string;
  projectId?: string;
  priority?: Priority;
}

/**
 * The task form — title, description, due (quick dates + any date), estimate, priority, project,
 * tags, subtasks. With `taskId` it edits that task: fields save on «Сохранить», subtasks apply right
 * away (like the real dialog). Without it, it creates a task from `draft` on «Создать».
 * `surface` = what it sits on: the dialog panel, or a card (split view) — fields step up one tone.
 */
function TaskForm({
  taskId,
  draft,
  m,
  onClose,
  onSaved,
  surface = "panel",
  autoFocus = true,
}: {
  taskId?: string;
  draft?: TaskDraft;
  m: TasksModel;
  onClose?: () => void;
  onSaved?: () => void;
  surface?: "panel" | "card";
  autoFocus?: boolean;
}) {
  const navigate = useNavigate();
  const task = taskId ? m.tasks.find((t) => t.id === taskId) : undefined;
  const creating = !taskId;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [due, setDue] = useState(task ? task.dueDate ?? "" : draft?.dueDate ?? "");
  const [priority, setPriority] = useState<Priority>(task ? task.priority : draft?.priority ?? 0);
  const [projectId, setProjectId] = useState(task ? task.projectId ?? "" : draft?.projectId ?? "");
  const [estimate, setEstimate] = useState(task?.estimateMin ? String(task.estimateMin) : "");
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [sub, setSub] = useState("");
  /** Subtasks typed while creating — handed to addTask together with the task. */
  const [newSubs, setNewSubs] = useState<string[]>([]);
  if (!creating && !task) return null;
  const field: CSSProperties = surface === "card" ? { ...fieldStyle, background: C.raise, boxShadow: "none" } : fieldStyle;
  const dirty =
    !task ||
    title.trim() !== task.title ||
    (description.trim() || "") !== (task.description ?? "") ||
    due !== (task.dueDate ?? "") ||
    priority !== task.priority ||
    projectId !== (task.projectId ?? "") ||
    estimate !== (task.estimateMin ? String(task.estimateMin) : "") ||
    tags.join("|") !== task.tags.join("|");
  const save = () => {
    if (!title.trim()) return;
    const est = Math.max(0, Math.round(Number(estimate)));
    const fields = {
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: due || undefined,
      priority,
      projectId: projectId || undefined,
      estimateMin: est || undefined,
      tags,
    };
    if (task) m.actions.update(task.id, fields);
    else m.actions.create({ ...fields, subtaskTitles: newSubs });
    onSaved?.();
    onClose?.();
  };
  const subs = task ? task.subtasks : newSubs.map((s, i) => ({ id: String(i), title: s, done: false }));
  const subDone = subs.filter((s) => s.done).length;
  return (
    <div className="flex flex-col gap-5">
      <input
        autoFocus={autoFocus}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="w-full bg-transparent outline-none placeholder:text-[#5E6068]"
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
        <div className="flex min-w-0 flex-col">
          <label htmlFor="task-form-due" style={labelStyle}>
            Срок
          </label>
          <DatePicker id="task-form-due" value={due} onChange={setDue} weekStartsMonday={m.weekStartsMonday} surface={surface} />
        </div>
        <label className="flex min-w-0 flex-col">
          <span style={labelStyle}>Оценка, мин</span>
          <input type="number" min={0} step={15} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="—" className="min-w-0 outline-none placeholder:text-[#5E6068]" style={field} />
        </label>
      </div>
      <div className="flex flex-col">
        <span style={labelStyle}>Приоритет</span>
        <div className="flex flex-wrap gap-1.5">
          {PRIOS.map(({ p, label }) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className="inline-flex items-center gap-2 px-3.5 transition-colors"
              style={{
                height: 36,
                borderRadius: 999,
                fontSize: 14,
                background: priority === p ? tint : "transparent",
                boxShadow: priority === p ? "none" : `inset 0 0 0 1px ${C.line}`,
                color: priority === p ? C.text : C.text2,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[p] }} />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="flex items-baseline justify-between gap-2" style={labelStyle}>
          <label htmlFor="task-form-project">Проект</label>
          {projectId && m.projectName.has(projectId) && (
            <button
              type="button"
              onClick={() => {
                onClose?.();
                navigate(`/projects/${projectId}`);
              }}
              className="inline-flex items-center gap-1 transition-colors hover:text-[#F4F5F7]"
              style={{ color: C.text2 }}
            >
              Открыть
              <ArrowUpRight size={12} strokeWidth={1.75} />
            </button>
          )}
        </div>
        <Select
          id="task-form-project"
          ariaLabel="Проект"
          value={projectId}
          onChange={setProjectId}
          surface={surface}
          options={[{ value: "", label: "Без проекта" }, ...m.projects.map((pr) => ({ value: pr.id, label: pr.name }))]}
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <label htmlFor="task-form-tags" style={labelStyle}>
          Теги
        </label>
        <TagInput id="task-form-tags" value={tags} onChange={setTags} suggestions={m.allTags} surface={surface} />
      </div>

      <div className="flex flex-col">
        <div className="flex items-baseline justify-between" style={labelStyle}>
          <span>Подзадачи</span>
          {subs.length > 0 && task && (
            <span style={{ ...T.num, fontWeight: 400 }}>
              {subDone}/{subs.length}
            </span>
          )}
        </div>
        <div className="flex flex-col" style={{ borderRadius: 12, background: surface === "card" ? C.raise : C.card, overflow: "hidden" }}>
          {subs.map((s, i) => (
            <div key={s.id} className="group flex items-center gap-3 pl-3.5 pr-1.5" style={{ minHeight: 44, ...dashed }}>
              {task ? (
                <RoundCheckBtn size={18} done={s.done} onChange={() => m.actions.toggleSub(task.id, s.id)} />
              ) : (
                <span className="shrink-0" style={{ width: 18, height: 18, borderRadius: 999, boxShadow: `inset 0 0 0 1.5px ${C.line2}` }} />
              )}
              <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: s.done ? C.text3 : C.text, textDecorationLine: s.done ? "line-through" : "none" }}>
                {s.title}
              </span>
              <button
                type="button"
                aria-label="Удалить подзадачу"
                onClick={() => (task ? m.actions.deleteSub(task.id, s.id) : setNewSubs((xs) => xs.filter((_, j) => j !== i)))}
                className="grid h-8 w-8 place-items-center rounded-full opacity-0 transition-opacity hover:text-[#FF6B63] focus-visible:opacity-100 group-hover:opacity-100"
                style={{ color: C.text3 }}
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
          ))}
          <form
            className="flex items-center gap-3 pl-3.5 pr-1.5"
            style={{ minHeight: 44 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!sub.trim()) return;
              if (task) m.actions.addSub(task.id, sub.trim());
              else setNewSubs((xs) => [...xs, sub.trim()]);
              setSub("");
            }}
          >
            <Plus size={16} strokeWidth={1.75} color={C.text3} />
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              placeholder="Добавить подзадачу"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
              style={{ fontSize: 14, color: C.text }}
            />
          </form>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        {task ? (
          <button
            type="button"
            onClick={() => m.actions.remove(task)}
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
          {onClose && (
            <Btn kind="ghost" onClick={onClose}>
              Отмена
            </Btn>
          )}
          <Btn onClick={save} disabled={!title.trim() || (!onClose && !dirty)}>
            {creating ? "Создать" : "Сохранить"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/**
 * Dialog around TaskForm — the main screen's TaskEditor shell (panel 24, blurred backdrop, Esc).
 * `taskId` edits a task; `taskId={null}` creates one from `draft`.
 */
export function TaskEditor({ taskId, draft, m, onClose }: { taskId: string | null; draft?: TaskDraft; m: TasksModel; onClose: () => void }) {
  const exists = taskId === null || m.tasks.some((t) => t.id === taskId);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  useEffect(() => {
    if (!exists) onClose();
  }, [exists, onClose]);
  if (!exists) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <div
        role="dialog"
        data-lab-block="editor"
        aria-label={taskId ? "Задача" : "Новая задача"}
        className="flex w-full max-w-[580px] flex-col gap-5 p-6"
        style={{ background: C.panel, borderRadius: R.page, boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span style={T.h2}>{taskId ? "Задача" : "Новая задача"}</span>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
        <TaskForm key={taskId ?? "new"} taskId={taskId ?? undefined} draft={draft} m={m} onClose={onClose} />
      </div>
    </div>
  );
}

/** «Новая задача» in the topbar — solid blue pill. */
export function NewTaskBtn({ onClick }: { onClick: () => void }) {
  return (
    <Btn icon={<Plus size={16} strokeWidth={2} />} onClick={onClick}>
      Новая задача
    </Btn>
  );
}

// ── Встреча вручную — добавление и правка, в том же окне, что редактор задачи ──────────────────

const DURATIONS = [15, 30, 45, 60, 90, 120].map((n) => ({ value: String(n), label: formatDuration(n) }));
const RECURRENCE: { value: Meeting["recurrence"]; label: string }[] = [
  { value: "none", label: "Не повторять" },
  { value: "weekly", label: "Каждую неделю" },
  { value: "monthly", label: "Каждый месяц" },
];

/** Next round half-hour from now — the default start of a new meeting. */
function nextSlot(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Встреча вручную — то, что раньше приходило только из календаря или Telegram. Без `meetingId` —
 * новая (addMeeting), с ним — правка и удаление. Задача-двойник на её день следует за встречей сама
 * (lib/meetingTasks.ts).
 */
export function MeetingEditor({ meetingId, date, onClose }: { meetingId?: string; date?: string; onClose: () => void }) {
  const { clients, meetings, settings, addMeeting, updateMeeting, deleteMeeting, restoreMeeting } = useData();
  const { toast } = useToast();
  const mt = meetingId ? meetings.find((x) => x.id === meetingId) : undefined;
  const [title, setTitle] = useState(mt?.title ?? "");
  const [day, setDay] = useState(mt?.date ?? date ?? todayStr());
  const [time, setTime] = useState(() => mt?.time ?? nextSlot());
  const [duration, setDuration] = useState(String(mt?.durationMin ?? 60));
  const [url, setUrl] = useState(mt?.url ?? "");
  const [clientId, setClientId] = useState(mt?.clientId ?? "");
  const [recurrence, setRecurrence] = useState<Meeting["recurrence"]>(mt?.recurrence ?? "none");
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const editing = !!meetingId;
  useEffect(() => {
    if (editing && !mt) onClose();
  }, [editing, mt, onClose]);
  if (editing && !mt) return null;
  // Встречи без времени (весь день из календаря) правятся без него; новой время нужно.
  const ready = !!title.trim() && !!day && (/^\d{2}:\d{2}$/.test(time) || (editing && !time));
  const save = () => {
    if (!ready) return;
    const fields = {
      title: title.trim(),
      date: day,
      time,
      durationMin: Number(duration),
      recurrence,
      url: url.trim() || undefined,
      clientId: clientId || undefined,
    };
    if (mt) {
      updateMeeting(mt.id, fields);
      toast("Встреча сохранена");
    } else {
      addMeeting(fields);
      toast(`Встреча добавлена · ${formatDate(day)}, ${time}`);
    }
    onClose();
  };
  const remove = () => {
    if (!mt) return;
    deleteMeeting(mt.id);
    toast("Встреча удалена", { actionLabel: "Вернуть", onAction: () => restoreMeeting(mt) });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <form
        role="dialog"
        data-lab-block="meeting-editor"
        aria-label={editing ? "Встреча" : "Новая встреча"}
        className="flex w-full max-w-[580px] flex-col gap-5 p-6"
        style={{ background: C.panel, borderRadius: R.page, boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex items-center justify-between">
          <span style={T.h2}>{editing ? "Встреча" : "Новая встреча"}</span>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-transparent outline-none placeholder:text-[#5E6068]"
          style={{ ...fieldStyle, height: 52, fontSize: 16 }}
          placeholder="Название встречи"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 flex min-w-0 flex-col sm:col-span-1">
            <label htmlFor="meeting-form-date" style={labelStyle}>
              Дата
            </label>
            <DatePicker id="meeting-form-date" ariaLabel="Дата" value={day} onChange={setDay} weekStartsMonday={settings.weekStartsMonday} />
          </div>
          <label className="flex min-w-0 flex-col">
            <span style={labelStyle}>Время</span>
            <input type="time" required={!editing} value={time} onChange={(e) => setTime(e.target.value)} className="min-w-0 outline-none" style={{ ...fieldStyle, colorScheme: "dark" }} />
          </label>
          <div className="flex min-w-0 flex-col">
            <span style={labelStyle}>Длительность</span>
            <Select
              ariaLabel="Длительность"
              value={duration}
              onChange={setDuration}
              options={DURATIONS.some((o) => o.value === duration) ? DURATIONS : [...DURATIONS, { value: duration, label: formatDuration(Number(duration)) }]}
            />
          </div>
        </div>
        <label className="flex min-w-0 flex-col">
          <span style={labelStyle}>Ссылка на звонок</span>
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Zoom, Google Meet, Telegram…"
            className="min-w-0 outline-none placeholder:text-[#5E6068]"
            style={fieldStyle}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col">
            <span style={labelStyle}>Клиент</span>
            <Select
              ariaLabel="Клиент"
              value={clientId}
              onChange={setClientId}
              options={[{ value: "", label: "Без клиента" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span style={labelStyle}>Повтор</span>
            <Select ariaLabel="Повтор" value={recurrence} onChange={setRecurrence} options={RECURRENCE} />
          </div>
        </div>
        {mt?.source === "gcal" && (
          <div style={{ ...T.foot, color: C.text3 }}>Из Google Календаря — при следующей синхронизации календарь может вернуть свою версию.</div>
        )}
        <div className="flex items-center gap-2">
          {mt && (
            <button
              type="button"
              onClick={remove}
              className="inline-flex items-center gap-2 px-4 transition-colors hover:bg-[#2A1A1A]"
              style={{ height: 44, borderRadius: 999, color: TONE.red.fg, fontSize: 14 }}
            >
              <Trash2 size={16} strokeWidth={1.75} />
              Удалить
            </button>
          )}
          <span className="flex-1" />
          <Btn kind="ghost" onClick={onClose}>
            Отмена
          </Btn>
          <Btn type="submit" disabled={!ready}>
            {mt ? "Сохранить" : "Добавить встречу"}
          </Btn>
        </div>
      </form>
    </div>
  );
}

/** «Встреча» in the topbar — outline pill next to «Новая задача». */
export function NewMeetingBtn({ onClick }: { onClick: () => void }) {
  return (
    <Btn kind="outline" icon={<CalendarClock size={16} strokeWidth={1.75} />} onClick={onClick}>
      Встреча
    </Btn>
  );
}

export function focusInput(ref: React.RefObject<HTMLInputElement>) {
  ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  ref.current?.focus({ preventScroll: true });
}
