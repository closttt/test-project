/**
 * «Задачи» · Craft Dark — pieces of the chosen screen (v1): the task model (same filters, counts and
 * store actions as pages/Tasks.tsx), the list row (draggable onto a day of the week board), quick
 * add, pill tabs and the task editor (the main screen's TaskEditor, extended with tags and subtasks).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpRight, CalendarClock, CalendarDays, Check, Clock3, CornerUpRight, FolderKanban, ListChecks, Plus, Trash2, X } from "lucide-react";

import { Btn, C, IconBtn, PRIO_TONE, R, T, TONE, dashed } from "@/design-lab/screens/_kit/craft";
import { CalendarPanel, DatePicker, Floating, Select, TagChips, TagInput, metaChip } from "@/design-lab/screens/_kit/controls";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { addDays, dueLabel, formatDate, formatDuration, isOverdue, isToday, isUpcoming, todayStr } from "@/lib/format";
import { isSnoozed } from "@/lib/taskGrouping";
import { hasRange, rangeLabel, weekStart } from "@/lib/weekBoard";
import { blockingTasks } from "@/lib/dependencies";
import { parseNaturalInput } from "@/lib/nlp";
import { pushUndo } from "@/lib/undoStack";
import { FIXED_TAGS } from "@/lib/tags";
import type { Meeting, Priority, Subtask, Task } from "@/types";

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

/**
 * Порядок задач везде — по приоритету (владелец, 16.11.2026: «все чисто по
 * приоритетам: высокие, и потом от высокого к низкому»): высокий → средний →
 * низкий → без приоритета, внутри — по сроку. Закрытые — в конце.
 */
export const byPriority = (a: Task, b: Task) => {
  if (a.done !== b.done) return Number(a.done) - Number(b.done);
  return PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿");
};

/** Right-hand date text: «с 05 окт.» when overdue, «до …» when snoozed, «готово 05 окт.» when done. */
export function dueText(t: Task): { text: string; late: boolean } {
  if (t.done) return { text: t.completedAt ? `готово ${formatDate(t.completedAt)}` : "готово", late: false };
  if (isSnoozed(t)) return { text: `до ${dueLabel(t.snoozedUntil!)}`, late: false };
  if (!t.dueDate) return { text: "без срока", late: false };
  if (isOverdue(t.dueDate)) return { text: `с ${dueLabel(t.dueDate)}`, late: true };
  if (hasRange(t)) return { text: rangeLabel(t.startDate!, t.dueDate), late: false };
  return { text: dueLabel(t.dueDate), late: false };
}

/**
 * Priority typed in a quick-add line: «п1» / «p1» = высокий, «п2» = средний, «п3» = низкий. The token
 * is cut out of the title, so a task added from a line lands on its place straight away.
 */
export function takePrio(raw: string): { text: string; priority?: Priority } {
  const hit = raw.match(/(^|\s)[pPпП]([1-3])(?=\s|$)/);
  if (!hit) return { text: raw };
  return { text: raw.replace(hit[0], " ").replace(/\s+/g, " ").trim(), priority: Number(hit[2]) as Priority };
}

/** A pasted or typed block → subtask titles: one per line, list markers («- », «• », «1. », «[ ] ») cut. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-–—•*]|\d+[.)]|\[[ xX]?\])\s+/, "").trim())
    .filter(Boolean);
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
  const { toggleTask, addTask, deleteTask, restoreTask, updateTask, toggleSubtask, addSubtask, updateSubtask, deleteSubtask } = data;
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
    // Без «свежих сверху»: новая задача сразу встаёт на место своего приоритета.
    return out.sort(byPriority);
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
      const typed = takePrio(raw.trim());
      const title = typed.text;
      if (!title) return "";
      const parsed = parseNaturalInput(title);
      const id = addTask({
        title: parsed.title.trim() || title,
        done: false,
        dueDate: parsed.dueDate ?? extra.dueDate,
        projectId: extra.projectId,
        priority: typed.priority ?? extra.priority ?? 0,
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
    /** A new due date before (or without) the period's start ends the period. */
    update: (id: string, patch: Partial<Task>) => {
      const t = tasks.find((x) => x.id === id);
      if (t?.startDate && "dueDate" in patch && !("startDate" in patch) && (!patch.dueDate || t.startDate >= patch.dueDate)) patch = { ...patch, startDate: undefined };
      updateTask(id, patch);
    },
    /** Dropped on a day: a single date moves there; a period keeps its length and starts there. */
    moveToDay: (id: string, date: string) => {
      const t = tasks.find((x) => x.id === id);
      if (t && hasRange(t)) {
        const len = Math.round((new Date(t.dueDate!).getTime() - new Date(t.startDate!).getTime()) / 86400000);
        updateTask(id, { startDate: date, dueDate: addDays(date, len) });
      } else updateTask(id, { dueDate: date, startDate: undefined });
    },
    toggleSub: toggleSubtask,
    addSub: addSubtask,
    deleteSub: deleteSubtask,
    updateSub: updateSubtask,
    /** One line or a pasted list → subtasks (one per line). */
    addSubs: (taskId: string, text: string) => splitLines(text).forEach((line) => addSubtask(taskId, line)),
    moveSub: (t: Task, subId: string, dir: -1 | 1) => {
      const xs = [...t.subtasks];
      const i = xs.findIndex((s) => s.id === subId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= xs.length) return;
      [xs[i], xs[j]] = [xs[j], xs[i]];
      updateTask(t.id, { subtasks: xs });
    },
    /** A subtask that outgrew its parent becomes a task of the same project (date and priority kept). */
    subToTask: (t: Task, sub: Subtask) => {
      addTask({
        title: sub.title,
        description: sub.description,
        done: false,
        projectId: t.projectId,
        section: t.section,
        priority: sub.priority ?? t.priority,
        dueDate: sub.dueDate ?? t.dueDate,
        tags: t.tags,
      });
      deleteSubtask(t.id, sub.id);
      const where = t.projectId ? projectName.get(t.projectId) : undefined;
      toast(`«${sub.title}» — теперь отдельная задача${where ? ` в «${where}»` : ""}${sub.dueDate ?? t.dueDate ? `, ${dueLabel((sub.dueDate ?? t.dueDate)!)}` : ""}`);
    },
    bulkReschedule: (ids: string[], offset: number) => {
      const before = ids.map((id) => [id, tasks.find((t) => t.id === id)?.dueDate] as const);
      ids.forEach((id) => updateTask(id, { dueDate: addDays(new Date(), offset) }));
      toast(`Перенесено: ${ids.length}`, { actionLabel: "Вернуть", onAction: () => before.forEach(([id, d]) => updateTask(id, { dueDate: d })) });
    },
  };

  return { tasks, projects, projectName, allTags, counts, filter, freshFirst, goal, closedToday, weekStartsMonday: settings.weekStartsMonday, dayLimit: settings.dailyFocusLimit || 0, actions };
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

/** Subtasks on a card: progress bar + done/total; click folds the list under the card's meta line. */
export function SubToggle({ t, open, onToggle }: { t: Task; open: boolean; onToggle: () => void }) {
  if (!t.subtasks.length) return null;
  const done = t.subtasks.filter((s) => s.done).length;
  const all = done === t.subtasks.length;
  return (
    <button
      type="button"
      title={open ? "Свернуть подзадачи" : "Показать подзадачи"}
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="inline-flex shrink-0 items-center gap-1.5 transition-colors duration-150 hover:text-[#F4F5F7]"
      style={{ ...T.num, height: 22, fontWeight: 400, fontSize: 12, color: all ? TONE.green.fg : open ? C.text2 : C.text3 }}
    >
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={t.subtasks.length}
        aria-valuenow={done}
        aria-label="Готово подзадач"
        className="block overflow-hidden"
        style={{ width: 40, height: 4, borderRadius: 999, background: C.line2 }}
      >
        <span className="block h-full transition-[width] duration-300" style={{ width: `${(done / t.subtasks.length) * 100}%`, borderRadius: 999, background: all ? C.green : C.accent }} />
      </span>
      {done}/{t.subtasks.length}
    </button>
  );
}

/** The card's subtasks — compact rows with a check; ticking one doesn't open the card. */
export function CardSubs({ t, m, adding, onAddClose }: { t: Task; m: TasksModel; adding?: boolean; onAddClose?: () => void }) {
  const [menu, setMenu] = useState<{ s: Subtask; at: { x: number; y: number } } | null>(null);
  const closeMenu = () => setMenu(null);
  return (
    <div className="flex min-w-0 flex-col" style={{ paddingLeft: 28 }}>
      {menu && <SubMenu at={menu.at} t={t} s={menu.s} m={m} onClose={closeMenu} />}
      {t.subtasks.map((s) => (
        <div
          key={s.id}
          className="flex min-w-0 items-center gap-2"
          style={{ minHeight: 26 }}
          title="Правый клик — сделать отдельной задачей или удалить"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({ s, at: { x: e.clientX, y: e.clientY } });
          }}
        >
          <RoundCheckBtn size={14} done={s.done} onChange={() => m.actions.toggleSub(t.id, s.id)} />
          {!!s.priority && !s.done && <span className="shrink-0" style={{ width: 5, height: 5, borderRadius: 9, background: PRIO_DOT[s.priority] }} title={PRIO_LABEL[s.priority]} />}
          <span
            className="min-w-0 flex-1 truncate"
            title={s.title}
            style={{ fontSize: 13, lineHeight: 1.35, color: s.done ? C.text3 : C.text2, textDecorationLine: s.done ? "line-through" : "none", textDecorationColor: C.text3 }}
          >
            {s.title}
          </span>
          {s.dueDate && !s.done && (
            <span className="shrink-0 whitespace-nowrap" style={{ fontSize: 12, color: isOverdue(s.dueDate) ? TONE.amber.fg : C.text3 }}>
              {dueLabel(s.dueDate)}
            </span>
          )}
        </div>
      ))}
      {adding && <SubAdd onAdd={(v) => m.actions.addSubs(t.id, v)} onClose={onAddClose} />}
    </div>
  );
}

/** One-line «+ подзадача» right on a card or a row: Enter adds and stays for the next one, Esc / blur closes. A pasted list adds every line. */
export function SubAdd({ onAdd, onClose }: { onAdd: (v: string) => void; onClose?: () => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex min-w-0 items-center gap-2" style={{ minHeight: 28 }} onClick={(e) => e.stopPropagation()}>
      <Plus size={14} strokeWidth={1.75} color={C.text3} className="shrink-0" />
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v.trim()) onAdd(v);
          onClose?.();
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (!/\n/.test(text.trim())) return;
          e.preventDefault();
          onAdd(text);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && v.trim()) {
            onAdd(v);
            setV("");
          }
          if (e.key === "Escape") {
            setV("");
            onClose?.();
          }
        }}
        placeholder="Подзадача — Enter"
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 13, color: C.text }}
      />
    </div>
  );
}

// ── Right-click menu ──────────────────────────────────────────────────────────────────────────

const menuItem = "flex w-full items-center gap-2.5 px-3 text-left transition-colors duration-150 hover:bg-[#202025]";

/** A row of the right-click menu. */
export function MenuRow({ children, onClick, danger, hint }: { children: ReactNode; onClick: () => void; danger?: boolean; hint?: string }) {
  return (
    <button type="button" onClick={onClick} className={menuItem} style={{ minHeight: 34, borderRadius: 8, fontSize: 13, color: danger ? TONE.red.fg : C.text }}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span style={{ fontSize: 12, color: C.text3 }}>{hint}</span>}
    </button>
  );
}

const PRIO_SHORT: Record<number, string> = { 1: "Высокий", 2: "Средний", 3: "Низкий", 0: "Нет" };

/** The right-click popup itself: at the cursor, kept inside the window, closes on a click outside, Esc or scroll. */
export function PopMenu({ at, onClose, children, width = 236, label }: { at: { x: number; y: number }; onClose: () => void; children: ReactNode; width?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)) });
  }, [at.x, at.y, width, children]);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    const scroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [onClose]);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="fixed z-[70] flex flex-col gap-0.5 p-1.5"
      style={{ left: pos.left, top: pos.top, width, background: C.panel, borderRadius: 14, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 18px 50px rgba(0,0,0,0.6)` }}
      onClick={stop}
      onMouseDown={stop}
      onKeyDown={stop}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>,
    document.body
  );
}

const MenuLine = () => <div className="mx-2 my-0.5" style={{ height: 1, background: C.line }} />;

/**
 * Right-click on a task (card or row): priority in one click, the date without opening the card
 * (сегодня / завтра / следующая неделя / без срока), a period «с … по …» picked as two days,
 * «+ подзадача», delete. `extra` = rows of the screen that opened it (the project page adds its
 * sections). Closes on any choice, a click outside or Esc.
 */
export function TaskMenu({ at, t, m, onClose, onAddSub, extra }: { at: { x: number; y: number }; t: Task; m: TasksModel; onClose: () => void; onAddSub?: () => void; extra?: ReactNode }) {
  /** Period picking: first the start day, then the end day. */
  const [range, setRange] = useState<null | { start?: string }>(null);
  const set = (patch: Partial<Task>) => {
    m.actions.update(t.id, patch);
    onClose();
  };
  const today = todayStr();
  const tomorrow = addDays(new Date(), 1);
  const ranged = hasRange(t);
  if (range)
    return (
      <PopMenu at={at} onClose={onClose} width={300} label="Период задачи">
        <div className="flex items-baseline justify-between gap-2 px-2.5 pt-1.5" style={{ fontSize: 13 }}>
          <span style={{ color: C.text }}>{range.start ? "По какое число?" : "С какого числа?"}</span>
          {range.start && <span style={{ color: C.text3 }}>с {dueLabel(range.start)}</span>}
        </div>
        <CalendarPanel
          key={range.start ?? "start"}
          value={range.start ? "" : t.startDate ?? t.dueDate ?? ""}
          allowNone={false}
          weekStartsMonday={m.weekStartsMonday}
          onPick={(d) => {
            if (!d) return;
            if (!range.start) return setRange({ start: d });
            const [a, b] = d < range.start ? [d, range.start] : [range.start, d];
            set(a === b ? { dueDate: a, startDate: undefined } : { startDate: a, dueDate: b });
          }}
        />
        <MenuRow onClick={() => setRange(null)}>Назад</MenuRow>
      </PopMenu>
    );
  return (
    <PopMenu at={at} onClose={onClose} label="Действия с задачей">
      <div className="grid grid-cols-4 gap-1 p-1">
        {([1, 2, 3, 0] as Priority[]).map((p) => {
          const on = t.priority === p;
          return (
            <button
              key={p}
              type="button"
              title={`Приоритет: ${PRIO_LABEL[p]}`}
              onClick={() => set({ priority: p })}
              className="flex flex-col items-center justify-center gap-1 transition-colors duration-150 hover:bg-[#202025]"
              style={{ height: 44, borderRadius: 8, fontSize: 11, background: on ? tint : "transparent", color: on ? C.text : C.text2 }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 9, background: PRIO_DOT[p] }} />
              {PRIO_SHORT[p]}
            </button>
          );
        })}
      </div>
      <MenuLine />
      {(ranged || t.dueDate !== today) && <MenuRow onClick={() => set({ dueDate: today, startDate: undefined })}>На сегодня</MenuRow>}
      {(ranged || t.dueDate !== tomorrow) && <MenuRow onClick={() => set({ dueDate: tomorrow, startDate: undefined })}>На завтра</MenuRow>}
      <MenuRow onClick={() => set({ dueDate: weekStart(1, m.weekStartsMonday), startDate: undefined })} hint={m.weekStartsMonday ? "пн" : "вс"}>
        На следующую неделю
      </MenuRow>
      <MenuRow onClick={() => setRange({})} hint={ranged ? rangeLabel(t.startDate!, t.dueDate!) : undefined}>
        {ranged ? "Изменить период…" : "Период: с … по …"}
      </MenuRow>
      {ranged && <MenuRow onClick={() => set({ startDate: undefined })} hint={`до ${dueLabel(t.dueDate!)}`}>Убрать период</MenuRow>}
      {t.dueDate && <MenuRow onClick={() => set({ dueDate: undefined, startDate: undefined })}>В бэклог — без срока</MenuRow>}
      {(onAddSub || extra) && <MenuLine />}
      {onAddSub && (
        <MenuRow
          onClick={() => {
            onAddSub();
            onClose();
          }}
        >
          Добавить подзадачу
        </MenuRow>
      )}
      {extra}
      <MenuLine />
      <MenuRow
        danger
        onClick={() => {
          m.actions.remove(t);
          onClose();
        }}
      >
        Удалить
      </MenuRow>
    </PopMenu>
  );
}

/** Right-click on a subtask (card or project row): make it a task of its own, or delete it. */
export function SubMenu({ at, t, s, m, onClose }: { at: { x: number; y: number }; t: Task; s: Subtask; m: TasksModel; onClose: () => void }) {
  return (
    <PopMenu at={at} onClose={onClose} label="Действия с подзадачей">
      <MenuRow
        onClick={() => {
          m.actions.subToTask(t, s);
          onClose();
        }}
      >
        Сделать отдельной задачей
      </MenuRow>
      <MenuRow
        danger
        onClick={() => {
          m.actions.deleteSub(t.id, s.id);
          onClose();
        }}
      >
        Удалить подзадачу
      </MenuRow>
    </PopMenu>
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
  saveRef,
}: {
  /** Filled with «save what changed» — the dialog calls it when it closes by Esc, × or a click outside. */
  saveRef?: MutableRefObject<(() => void) | null>;
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
  const [start, setStart] = useState(task?.startDate ?? "");
  const [priority, setPriority] = useState<Priority>(task ? task.priority : draft?.priority ?? 0);
  const [projectId, setProjectId] = useState(task ? task.projectId ?? "" : draft?.projectId ?? "");
  const [estimate, setEstimate] = useState(task?.estimateMin ? String(task.estimateMin) : "");
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [section, setSection] = useState(task?.section ?? "");
  const [sub, setSub] = useState("");
  /** Subtasks typed while creating — handed to addTask together with the task. */
  const [newSubs, setNewSubs] = useState<string[]>([]);
  if (!creating && !task) return null;
  const sections = m.projects.find((pr) => pr.id === projectId)?.sections ?? [];
  const sectionOk = sections.includes(section);
  const field: CSSProperties = surface === "card" ? { ...fieldStyle, background: C.raise, boxShadow: "none" } : fieldStyle;
  const dirty =
    !task ||
    title.trim() !== task.title ||
    (description.trim() || "") !== (task.description ?? "") ||
    due !== (task.dueDate ?? "") ||
    (start && due && start < due ? start : "") !== (task.startDate && task.dueDate && task.startDate < task.dueDate ? task.startDate : "") ||
    priority !== task.priority ||
    projectId !== (task.projectId ?? "") ||
    estimate !== (task.estimateMin ? String(task.estimateMin) : "") ||
    tags.join("|") !== task.tags.join("|") ||
    (sectionOk ? section : "") !== (task.section ?? "");
  const collect = () => {
    const est = Math.max(0, Math.round(Number(estimate)));
    return {
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: due || undefined,
      startDate: start && due && start < due ? start : undefined,
      priority,
      projectId: projectId || undefined,
      section: sectionOk && section ? section : undefined,
      estimateMin: est || undefined,
      tags,
    };
  };
  const save = () => {
    if (!title.trim()) return;
    const { section: sec, ...fields } = collect();
    if (task) m.actions.update(task.id, { ...fields, section: sec });
    else {
      const id = m.actions.create({ ...fields, subtaskTitles: newSubs });
      if (id && sec) m.actions.update(id, { section: sec });
    }
    onSaved?.();
    onClose?.();
  };
  // Closing an open task never drops what was typed: Esc, × and a click outside save the changes.
  if (saveRef)
    saveRef.current = () => {
      if (task && dirty && title.trim()) m.actions.update(task.id, collect());
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col">
          <label htmlFor="task-form-start" style={labelStyle} title="С какого числа задача идёт — вместе со сроком это период">
            Начало
          </label>
          <DatePicker id="task-form-start" value={start} onChange={setStart} weekStartsMonday={m.weekStartsMonday} surface={surface} />
          {start && due && start >= due && <span style={{ ...T.foot, color: TONE.amber.fg, marginTop: 4 }}>Позже срока — не сохранится</span>}
        </div>
        <div className="flex min-w-0 flex-col">
          <label htmlFor="task-form-due" style={labelStyle}>
            {start ? "Срок — до" : "Срок"}
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
      {sections.length > 0 && (
        <div className="flex min-w-0 flex-col">
          <label htmlFor="task-form-section" style={labelStyle}>
            Секция проекта
          </label>
          <Select
            id="task-form-section"
            ariaLabel="Секция проекта"
            value={sectionOk ? section : ""}
            onChange={setSection}
            surface={surface}
            options={[{ value: "", label: "Без секции" }, ...sections.map((x) => ({ value: x, label: x }))]}
          />
        </div>
      )}
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
          {subs.map((s, i) =>
            task ? (
              <SubEditRow key={s.id} task={task} s={s} first={i === 0} last={i === subs.length - 1} m={m} />
            ) : (
              <div key={s.id} className="group flex items-center gap-3 pl-3.5 pr-1.5" style={{ minHeight: 44, ...dashed }}>
                <span className="shrink-0" style={{ width: 18, height: 18, borderRadius: 999, boxShadow: `inset 0 0 0 1.5px ${C.line2}` }} />
                <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>
                  {s.title}
                </span>
                <button
                  type="button"
                  aria-label="Удалить подзадачу"
                  onClick={() => setNewSubs((xs) => xs.filter((_, j) => j !== i))}
                  className="grid h-8 w-8 place-items-center rounded-full opacity-0 transition-opacity hover:text-[#FF6B63] focus-visible:opacity-100 group-hover:opacity-100"
                  style={{ color: C.text3 }}
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              </div>
            )
          )}
          <form
            className="flex items-center gap-3 pl-3.5 pr-1.5"
            style={{ minHeight: 44 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!sub.trim()) return;
              if (task) m.actions.addSubs(task.id, sub);
              else setNewSubs((xs) => [...xs, ...splitLines(sub)]);
              setSub("");
            }}
          >
            <Plus size={16} strokeWidth={1.75} color={C.text3} />
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (!/\n/.test(text.trim())) return;
                e.preventDefault();
                if (task) m.actions.addSubs(task.id, text);
                else setNewSubs((xs) => [...xs, ...splitLines(text)]);
              }}
              placeholder="Добавить подзадачу — можно вставить список строк"
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
 * A subtask inside the open task: tick, priority dot (click = next priority), the title edited in
 * place, own date, ↑ ↓ order, «сделать задачей», delete. Everything applies at once.
 */
function SubEditRow({ task, s, first, last, m }: { task: Task; s: Subtask; first: boolean; last: boolean; m: TasksModel }) {
  const [v, setV] = useState(s.title);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => setV(s.title), [s.title]);
  const p = s.priority ?? 0;
  const commit = () => {
    const x = v.trim();
    if (!x) setV(s.title);
    else if (x !== s.title) m.actions.updateSub(task.id, s.id, { title: x });
  };
  const late = !s.done && isOverdue(s.dueDate);
  const icon = "grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-[#202025] hover:text-[#F4F5F7] disabled:opacity-30";
  return (
    <div className="group flex items-center gap-2 pl-3.5 pr-1.5" style={{ minHeight: 44, ...dashed }}>
      <RoundCheckBtn size={18} done={s.done} onChange={() => m.actions.toggleSub(task.id, s.id)} />
      <button
        type="button"
        title={`Приоритет: ${PRIO_LABEL[p]} — клик меняет`}
        aria-label={`Приоритет подзадачи: ${PRIO_LABEL[p]}`}
        onClick={() => m.actions.updateSub(task.id, s.id, { priority: ((p + 1) % 4) as Priority })}
        className="grid h-6 w-5 shrink-0 place-items-center"
      >
        <span style={{ width: 7, height: 7, borderRadius: 9, background: PRIO_DOT[p] }} />
      </button>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.stopPropagation();
            setV(s.title);
          }
        }}
        aria-label="Название подзадачи"
        className="min-w-0 flex-1 bg-transparent outline-none"
        style={{ fontSize: 14, color: s.done ? C.text3 : C.text, textDecorationLine: s.done ? "line-through" : "none" }}
      />
      <button
        type="button"
        title={s.dueDate ? "Изменить срок подзадачи" : "Срок подзадачи"}
        onClick={(e) => {
          const el = e.currentTarget;
          setAnchor((a) => (a ? null : el));
        }}
        className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-opacity hover:brightness-125 ${s.dueDate || anchor ? "" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"}`}
        style={{ ...metaChip, padding: s.dueDate ? "0 8px" : 0, width: s.dueDate ? undefined : 26, background: late ? TONE.amber.bg : s.dueDate ? C.line2 : "transparent", color: late ? TONE.amber.fg : C.text2 }}
      >
        {s.dueDate ? dueLabel(s.dueDate) : <CalendarDays size={14} strokeWidth={1.75} />}
      </button>
      <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100" style={{ color: C.text3 }}>
        <button type="button" title="Выше" aria-label="Выше" disabled={first} onClick={() => m.actions.moveSub(task, s.id, -1)} className={icon}>
          <ArrowUp size={14} strokeWidth={1.75} />
        </button>
        <button type="button" title="Ниже" aria-label="Ниже" disabled={last} onClick={() => m.actions.moveSub(task, s.id, 1)} className={icon}>
          <ArrowDown size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Вынести в отдельную задачу (проект, срок и приоритет сохранятся)"
          onClick={() => m.actions.subToTask(task, s)}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 transition-colors hover:bg-[#202025] hover:text-[#F4F5F7]"
          style={{ fontSize: 12 }}
        >
          <CornerUpRight size={13} strokeWidth={1.75} />в задачу
        </button>
        <button type="button" title="Удалить подзадачу" aria-label="Удалить подзадачу" onClick={() => m.actions.deleteSub(task.id, s.id)} className={`${icon} hover:!text-[#FF6B63]`}>
          <X size={14} strokeWidth={1.75} />
        </button>
      </span>
      {anchor && <DatePop anchor={anchor} value={s.dueDate} weekStartsMonday={m.weekStartsMonday} onPick={(d) => m.actions.updateSub(task.id, s.id, { dueDate: d })} onClose={() => setAnchor(null)} />}
    </div>
  );
}

/**
 * Dialog around TaskForm — the main screen's TaskEditor shell (panel 24, blurred backdrop, Esc).
 * `taskId` edits a task; `taskId={null}` creates one from `draft`.
 */
export function TaskEditor({ taskId, draft, m, onClose }: { taskId: string | null; draft?: TaskDraft; m: TasksModel; onClose: () => void }) {
  const exists = taskId === null || m.tasks.some((t) => t.id === taskId);
  const saveRef = useRef<(() => void) | null>(null);
  /** Esc, × and a click outside keep the changes of an open task («Отмена» is the way to drop them). */
  const close = () => {
    saveRef.current?.();
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!exists) onClose();
  }, [exists, onClose]);
  if (!exists) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={close}>
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
          <IconBtn title={taskId ? "Сохранить и закрыть" : "Закрыть"} onClick={close}>
            <X {...ICON} />
          </IconBtn>
        </div>
        <TaskForm key={taskId ?? "new"} taskId={taskId ?? undefined} draft={draft} m={m} onClose={onClose} saveRef={saveRef} />
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
