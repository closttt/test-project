/**
 * «Задачи» · Craft Dark — pieces of the chosen screen (v1): the task model (same filters, counts and
 * store actions as pages/Tasks.tsx), the list row (draggable onto a day of the week board), quick
 * add, pill tabs and the task editor (the main screen's TaskEditor, extended with tags and subtasks).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Check, Plus, Trash2, X } from "lucide-react";

import { Btn, C, IconBtn, R, T, TONE, dashed, font } from "@/design-lab/screens/_kit/craft";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { addDays, dueLabel, formatDate, isOverdue, isToday, isUpcoming, todayStr } from "@/lib/format";
import { isSnoozed } from "@/lib/taskGrouping";
import { weekStart } from "@/lib/weekBoard";
import { blockingTasks } from "@/lib/dependencies";
import { parseNaturalInput } from "@/lib/nlp";
import { pushUndo } from "@/lib/undoStack";
import { FIXED_TAGS } from "@/lib/tags";
import type { Priority, Task } from "@/types";

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

  return { tasks, projects, projectName, counts, filter, freshFirst, goal, closedToday, weekStartsMonday: settings.weekStartsMonday, actions };
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
            className={`inline-flex items-center gap-2 whitespace-nowrap px-4 transition-colors duration-150 ${on ? "" : "hover:bg-[#1B1B1F]"}`}
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
      className="grid shrink-0 place-items-center rounded-full opacity-0 transition-[opacity,background,color] duration-150 hover:bg-[#2A1A1A] hover:text-[#FF7A73] focus-visible:opacity-100 group-hover:opacity-100"
      style={{ width: size, height: size, color: C.text3 }}
    >
      <Trash2 size={16} strokeWidth={1.75} />
    </button>
  );
}

function PrioDot({ p, size = 6 }: { p: number; size?: number }) {
  if (!p) return null;
  return <span className="shrink-0" style={{ width: size, height: size, borderRadius: 9, background: PRIO_DOT[p] }} />;
}

/** The main screen's task line: check · dot · title · project · subtasks … date · trash. */
export function TaskLine({
  t,
  m,
  onOpen,
  active,
  showProject = true,
  pad = 24,
  height = 56,
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
  const subDone = t.subtasks.filter((s) => s.done).length;
  const pname = t.projectId ? m.projectName.get(t.projectId) : undefined;
  const navigate = useNavigate();
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
      className="group grid cursor-pointer items-center gap-4 outline-none transition-colors duration-150 hover:bg-[#1C1C20] focus-visible:bg-[#1C1C20]"
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
        <PrioDot p={t.priority} />
        <span
          className="truncate"
          style={{ ...T.cell, fontSize: 15, color: t.done ? C.text3 : C.text, textDecorationLine: t.done ? "line-through" : "none", textDecorationColor: C.text3 }}
        >
          {t.title}
        </span>
        {showProject && pname && (
          <button
            type="button"
            title={`Открыть проект «${pname}»`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/projects/${t.projectId}`);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className="shrink-0 truncate text-left transition-colors hover:text-[#9A9CA3]"
            style={{ ...T.body, color: C.text3, maxWidth: 180 }}
          >
            · {pname}
          </button>
        )}
        {t.subtasks.length > 0 && (
          <span className="shrink-0" style={{ ...T.foot, ...T.num, fontWeight: 400, color: C.text3 }}>
            {subDone}/{t.subtasks.length}
          </span>
        )}
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

/** Midnight-local Date for YYYY-MM-DD (never `new Date(str)`, which parses as UTC). */
function fromDay(s: string): Date {
  const [y, mo, d] = s.split("-").map(Number);
  return new Date(y, (mo ?? 1) - 1, d ?? 1);
}

/** «пн, 13 окт.» */
export function dayShort(s: string): string {
  return fromDay(s).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
}

/** One-tap dates offered on cards and in the editor: today, tomorrow, start of next week. */
export function quickDates(weekStartsMonday: boolean): { label: string; date: string }[] {
  return [
    { label: "Сегодня", date: todayStr() },
    { label: "Завтра", date: addDays(new Date(), 1) },
    { label: "След. неделя", date: weekStart(1, weekStartsMonday) },
  ];
}

/** A native date input only commits a complete, plausible date (typing the year passes through «0002»…). */
const validDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= "2000-01-01";

const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * Small date popover anchored to a card's date chip: quick dates, «Без срока», and any date.
 * Portaled to <body> with fixed positioning so it never widens a narrow column or the page;
 * React events still bubble through the portal, so every handler stops them from reaching the card.
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
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const W = 240;
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 220;
    const left = Math.min(Math.max(8, r.right - W), window.innerWidth - W - 8);
    const below = r.bottom + 6 + h <= window.innerHeight - 8;
    setPos({ left, top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - h) });
  }, [anchor]);
  useEffect(() => {
    const outside = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && (ref.current?.contains(t) || anchor.contains(t))) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("scroll", outside, true);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      document.removeEventListener("scroll", outside, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);
  const pick = (d: string | undefined) => {
    onPick(d);
    onClose();
  };
  const row = "flex w-full items-center justify-between gap-3 px-3 text-left transition-colors";
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Срок"
      onClick={stop}
      onMouseDown={stop}
      onKeyDown={stop}
      onDragStart={stop}
      className="flex flex-col gap-0.5 p-1.5"
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
        zIndex: 60,
        width: W,
        background: C.panel,
        borderRadius: R.inner,
        boxShadow: `inset 0 0 0 1px ${C.line2}, 0 18px 50px rgba(0,0,0,0.55)`,
        fontFamily: font,
        color: C.text,
      }}
    >
      {quickDates(weekStartsMonday).map((q) => {
        const on = value === q.date;
        return (
          <button
            key={q.label}
            type="button"
            onClick={() => pick(q.date)}
            className={`${row} ${on ? "" : "hover:bg-[#1E1E22]"}`}
            style={{ height: 36, borderRadius: 10, background: on ? tint : undefined, fontSize: 14 }}
          >
            <span>{q.label}</span>
            <span style={{ ...T.foot, color: on ? "#5AA9FF" : C.text3 }}>{dayShort(q.date)}</span>
          </button>
        );
      })}
      {value && (
        <button type="button" onClick={() => pick(undefined)} className={`${row} hover:bg-[#1E1E22]`} style={{ height: 36, borderRadius: 10, fontSize: 14, color: C.text2 }}>
          Без срока
        </button>
      )}
      <div className="mt-1 pt-1.5" style={dashed}>
        <input
          type="date"
          aria-label="Выбрать дату"
          defaultValue={value ?? ""}
          onChange={(e) => validDay(e.target.value) && pick(e.target.value)}
          className="w-full outline-none [color-scheme:dark]"
          style={{ height: 40, borderRadius: 10, background: C.raise, padding: "0 12px", fontSize: 14, color: C.text }}
        />
      </div>
    </div>,
    document.body
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
  const chip = (on: boolean): CSSProperties => ({
    height: 32,
    borderRadius: 999,
    fontSize: 13,
    background: on ? tint : "transparent",
    boxShadow: on ? "none" : `inset 0 0 0 1px ${C.line}`,
    color: on ? C.text : C.text2,
  });
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
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col">
            <span style={labelStyle}>Срок</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="outline-none [color-scheme:dark]" style={field} />
          </label>
          <label className="flex flex-col">
            <span style={labelStyle}>Оценка, мин</span>
            <input type="number" min={0} step={15} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="—" className="outline-none" style={field} />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quickDates(m.weekStartsMonday).map((q) => (
            <button key={q.label} type="button" onClick={() => setDue(q.date)} className="whitespace-nowrap px-3 transition-colors" style={chip(due === q.date)}>
              {q.label}
            </button>
          ))}
          <button type="button" onClick={() => setDue("")} className="whitespace-nowrap px-3 transition-colors" style={chip(due === "")}>
            Без срока
          </button>
        </div>
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
      <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
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
          <select id="task-form-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="outline-none [color-scheme:dark]" style={field}>
            <option value="">Без проекта</option>
            {m.projects.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <span style={labelStyle}>Теги</span>
          <div className="flex gap-1.5" style={{ height: 44, alignItems: "center" }}>
            {FIXED_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTags((xs) => (on ? xs.filter((x) => x !== tag) : [...xs, tag]))}
                  className="whitespace-nowrap px-3.5 transition-colors"
                  style={{ height: 36, borderRadius: 999, fontSize: 14, background: on ? tint : "transparent", boxShadow: on ? "none" : `inset 0 0 0 1px ${C.line}`, color: on ? C.text : C.text2 }}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </div>
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
                className="grid h-8 w-8 place-items-center rounded-full opacity-0 transition-opacity hover:text-[#FF7A73] focus-visible:opacity-100 group-hover:opacity-100"
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
        style={{ background: C.panel, borderRadius: R.page, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 30px 80px rgba(0,0,0,0.6)` }}
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

export function focusInput(ref: React.RefObject<HTMLInputElement>) {
  ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  ref.current?.focus({ preventScroll: true });
}
