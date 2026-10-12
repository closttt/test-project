/**
 * Планер · Craft Dark — pieces the five concepts share: the week model on the real store (same rules
 * as src/pages/Planner.tsx: week days, meetings on the grid, the kanban mirror, stored blocks), the
 * actions, a pointer drag that drops on any [data-drop-day] target, the move-to-day popover, list
 * rows / board cards, and the two editors (task, block) drawn like the main screen's TaskEditor.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, LayoutGrid, Minus, Plus, Trash2, Video, X } from "lucide-react";

import { Btn, C, IconBtn, R, RoundCheck, T, TONE, dashed, plural } from "@/design-lab/screens/_kit/craft";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { pushUndo } from "@/lib/undoStack";
import { PRIORITY_RANK, sortByPriority } from "@/lib/taskOrder";
import { BACKLOG_KEY, weekColumnOf, weekDays, weekRangeLabel, type WeekDay } from "@/lib/weekBoard";
import { localDayStr } from "@/lib/format";
import { parseNaturalInput } from "@/lib/nlp";
import {
  DAY_MIN,
  SLOT_MIN,
  PLAN_COLOR_ORDER,
  autoPlaceDay,
  dayShort,
  durationForTask,
  formatClock,
  formatDuration,
  formatRange,
  isAutoBlock,
  startFromOffset,
  totalMinutes,
} from "@/lib/planner";
import type { Meeting, PlanBlock, PlanColor, Priority, Task } from "@/types";

// ── Tokens & helpers ─────────────────────────────────────────────────────────────────────────

export const ICON = { size: 18, strokeWidth: 1.75 } as const;
export const PRIO_DOT: Record<number, string> = { 0: "#4A4C54", 1: C.red, 2: C.amber, 3: C.accent };

/** Plan colours on the dark canvas — quiet tints, the hue only as a thin bar / dot. */
export const PLAN_HEX: Record<PlanColor, string> = {
  blue: "#0A84FF",
  green: "#34D399",
  violet: "#9B8AFB",
  orange: "#F5B544",
  rose: "#FF6B8B",
  slate: "#8A8C94",
};
export const PLAN_LABEL: Record<PlanColor, string> = { blue: "Синий", green: "Зелёный", violet: "Фиолетовый", orange: "Оранжевый", rose: "Розовый", slate: "Серый" };

export function tint(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const MEET_PREFIX = "meet:";
export const isMeetingBlock = (b: Pick<PlanBlock, "id">) => b.id.startsWith(MEET_PREFIX);
const KANBAN_MIRROR_KEY = "crm-planner-kanban-v1";

export function minutesNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function useNowMin() {
  const [n, setN] = useState(minutesNow);
  useEffect(() => {
    const id = setInterval(() => setN(minutesNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  return n;
}

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

export function useWide(px: number) {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= px);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= px);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [px]);
  return wide;
}

const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
/** «5 октября» */
export function dayLong(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_GEN[(m ?? 1) - 1]}`;
}
export function dayNum(date: string) {
  return Number(date.split("-")[2]);
}

function parseTime(t?: string): number | undefined {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return undefined;
  const [h, mi] = t.split(":").map(Number);
  return Math.min(DAY_MIN - 15, h * 60 + mi);
}

// ── Model ──────────────────────────────────────────────────────────────────────────────────────

export type ItemKind = "task" | "meeting" | "routine";

/** Anything that sits on a day: a task (maybe with a stored block), a meeting, a pinned routine. */
export interface DayItem {
  key: string;
  kind: ItemKind;
  title: string;
  date: string;
  /** Fixed time — a meeting or a stored block. */
  startMin?: number;
  durationMin: number;
  done: boolean;
  priority: Priority;
  color: PlanColor;
  task?: Task;
  block?: PlanBlock;
  meeting?: Meeting;
  /** Overdue task collected on today's column. */
  overdue?: boolean;
  projectName?: string;
}

export interface DayStats {
  tasks: number;
  done: number;
  meetings: number;
  minutes: number;
}

/** Grid drag source — a routine or a task carried from a panel onto the hours. */
export interface Source {
  title: string;
  durationMin: number;
  color: PlanColor;
  taskId?: string;
  templateId?: string;
}

export function itemTime(it: DayItem): string {
  if (it.kind === "meeting") return it.meeting?.time ?? "";
  if (it.startMin !== undefined) return formatRange(it.startMin, it.durationMin);
  // A task without an estimate has no length of its own — don't print the planner's default hour.
  if (it.kind === "task" && !it.task?.estimateMin) return "";
  return formatDuration(it.durationMin);
}

export function usePlanner() {
  const data = useData();
  const {
    tasks, meetings, projects, planBlocks, planTemplates, planDismissed, settings, gamification,
    addPlanBlock, updatePlanBlock, deletePlanBlock, restorePlanBlock, setPlanDismissed,
    addPlanTemplate, deletePlanTemplate, updateTask, toggleTask, toggleMeeting, addTask, deleteTask, restoreTask,
  } = data;
  const { toast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => weekDays(weekOffset, settings.weekStartsMonday), [weekOffset, settings.weekStartsMonday]);
  const dates = useMemo(() => new Set(days.map((d) => d.date)), [days]);
  const today = localDayStr();
  const [mirror, setMirror] = useState(() => {
    try {
      return localStorage.getItem(KANBAN_MIRROR_KEY) !== "off";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KANBAN_MIRROR_KEY, mirror ? "on" : "off");
    } catch {
      /* private mode */
    }
  }, [mirror]);

  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editBlockId, setEditBlockId] = useState<string | null>(null);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p.name] as const)), [projects]);
  const storedWeek = useMemo(() => planBlocks.filter((b) => dates.has(b.date)), [planBlocks, dates]);

  /** Meetings on their day and hour — read-only blocks, as on the real page. */
  const meetingBlocks = useMemo<PlanBlock[]>(
    () =>
      meetings
        .filter((m) => dates.has(m.date) && parseTime(m.time) !== undefined)
        .map((m) => {
          const startMin = parseTime(m.time)!;
          return {
            id: `${MEET_PREFIX}${m.id}`,
            date: m.date,
            startMin,
            durationMin: Math.max(15, Math.min(m.durationMin || 30, DAY_MIN - startMin)),
            title: m.title,
            color: "slate" as PlanColor,
            done: m.done,
          };
        }),
    [meetings, dates]
  );
  const meetingById = useMemo(() => new Map<string, Meeting>(meetings.map((m) => [`${MEET_PREFIX}${m.id}`, m])), [meetings]);

  /** The kanban mirrored as draft blocks from 09:00 (same rule as the real page). */
  const autoBlocks = useMemo(() => {
    if (!mirror) return [];
    const placed = new Set(planBlocks.map((b) => b.taskId).filter(Boolean));
    const hidden = new Set(planDismissed);
    const open = tasks.filter((t) => !t.done && !placed.has(t.id) && !(t.snoozedUntil && t.snoozedUntil > today));
    return days.flatMap((d) => {
      const dayTasks = sortByPriority(open.filter((t) => weekColumnOf(t, days) === d.date && !hidden.has(`${t.id}@${d.date}`)));
      return autoPlaceDay(
        d.date,
        dayTasks.map((t) => ({ taskId: t.id, title: t.title, durationMin: durationForTask(t.estimateMin), priority: t.priority })),
        [...storedWeek, ...meetingBlocks].filter((b) => b.date === d.date)
      );
    });
  }, [mirror, planBlocks, planDismissed, tasks, days, storedWeek, meetingBlocks, today]);

  const weekBlocks = useMemo(() => [...meetingBlocks, ...storedWeek, ...autoBlocks], [meetingBlocks, storedWeek, autoBlocks]);

  /** Day → items (tasks of the kanban column, meetings, stored blocks), time first, then priority. */
  const byDay = useMemo(() => {
    const map = new Map<string, DayItem[]>(days.map((d) => [d.date, []]));
    for (const m of meetings) {
      if (!dates.has(m.date)) continue;
      map.get(m.date)!.push({
        key: `m:${m.id}`,
        kind: "meeting",
        title: m.title,
        date: m.date,
        startMin: parseTime(m.time),
        durationMin: m.durationMin || 30,
        done: !!m.done,
        priority: m.priority ?? 0,
        color: "slate",
        meeting: m,
      });
    }
    const withBlock = new Set<string>();
    for (const b of storedWeek) {
      const t = b.taskId ? taskById.get(b.taskId) : undefined;
      if (t) withBlock.add(t.id);
      map.get(b.date)!.push({
        key: `b:${b.id}`,
        kind: t ? "task" : "routine",
        title: t?.title ?? b.title,
        date: b.date,
        startMin: b.startMin,
        durationMin: b.durationMin,
        done: t ? t.done : !!b.done,
        priority: t?.priority ?? 0,
        color: b.color,
        task: t,
        block: b,
        projectName: t?.projectId ? projectById.get(t.projectId) : undefined,
      });
    }
    for (const t of tasks) {
      if (withBlock.has(t.id)) continue;
      if (!t.done && t.snoozedUntil && t.snoozedUntil > today) continue;
      const col = t.done ? (t.dueDate && dates.has(t.dueDate) ? t.dueDate : null) : weekColumnOf(t, days);
      if (!col || col === BACKLOG_KEY) continue;
      map.get(col)!.push({
        key: `t:${t.id}`,
        kind: "task",
        title: t.title,
        date: col,
        durationMin: durationForTask(t.estimateMin),
        done: t.done,
        priority: t.priority,
        color: "blue",
        task: t,
        overdue: !t.done && !!t.dueDate && t.dueDate < today,
        projectName: t.projectId ? projectById.get(t.projectId) : undefined,
      });
    }
    for (const xs of map.values()) {
      xs.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const at = a.startMin ?? Infinity;
        const bt = b.startMin ?? Infinity;
        if (at !== bt) return at - bt;
        return (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || (a.task?.order ?? 0) - (b.task?.order ?? 0);
      });
    }
    return map;
  }, [days, dates, meetings, storedWeek, tasks, taskById, projectById, today]);

  const stats = (date: string): DayStats => {
    const xs = byDay.get(date) ?? [];
    return {
      tasks: xs.filter((x) => x.kind === "task").length,
      done: xs.filter((x) => x.kind === "task" && x.done).length,
      meetings: xs.filter((x) => x.kind === "meeting").length,
      minutes: totalMinutes(xs.map((x) => ({ durationMin: x.durationMin }) as PlanBlock)),
    };
  };

  const backlog = useMemo(
    () => sortByPriority(tasks.filter((t) => !t.done && !t.dueDate && !(t.snoozedUntil && t.snoozedUntil > today))),
    [tasks, today]
  );
  const openTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.done)
        .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.order - b.order),
    [tasks]
  );
  const plannedTaskIds = useMemo(() => new Set(weekBlocks.map((b) => b.taskId).filter(Boolean) as string[]), [weekBlocks]);

  const week = useMemo(() => {
    let t = 0, d = 0, m = 0, min = 0;
    for (const day of days) {
      const s = stats(day.date);
      t += s.tasks;
      d += s.done;
      m += s.meetings;
      min += s.minutes;
    }
    return { tasks: t, done: d, meetings: m, minutes: min };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDay, days]);

  // ── Actions ──────────────────────────────────────────────────────────────────────────────

  const blockTitle = (b: PlanBlock) => (b.taskId && taskById.get(b.taskId)?.title) || b.title;
  const blockDone = (b: PlanBlock) => (b.taskId ? taskById.get(b.taskId)?.done ?? !!b.done : !!b.done);

  function removeBlock(block: PlanBlock) {
    deletePlanBlock(block.id);
    setEditBlockId(null);
    const key = block.taskId ? `${block.taskId}@${block.date}` : null;
    if (key) setPlanDismissed(key, true);
    const run = pushUndo(`Убрано из планера: ${blockTitle(block)}`, () => {
      restorePlanBlock(block);
      if (key) setPlanDismissed(key, false);
    });
    toast(`Убрано: ${blockTitle(block)}`, { actionLabel: "Вернуть", onAction: run });
  }

  function removeTask(t: Task) {
    setEditTaskId(null);
    deleteTask(t.id);
    const run = pushUndo("Задача удалена", () => restoreTask(t));
    toast("Задача удалена", { actionLabel: "Вернуть", onAction: run });
  }

  function meetingNote(m: Meeting) {
    if (m.url) window.open(m.url, "_blank", "noopener");
    else toast(`${m.title} · ${m.time} — встреча, время меняется в календаре`);
  }

  const actions = {
    /** Moves a task (its due date — the kanban follows) or a routine block to another day. */
    move(it: DayItem, to: string) {
      if (it.date === to) return;
      if (it.kind === "meeting") {
        toast("Встреча переносится в календаре");
        return;
      }
      if (to === BACKLOG_KEY) {
        if (it.task) updateTask(it.task.id, { dueDate: undefined });
        if (it.block) deletePlanBlock(it.block.id);
        toast(`${it.title} → без даты`);
        return;
      }
      if (it.task) updateTask(it.task.id, { dueDate: to });
      if (it.block) updatePlanBlock(it.block.id, { date: to });
      toast(`${it.title} → ${dayShort(to)}, ${dayLong(to)}`);
    },
    /** A backlog task onto a day. */
    schedule(t: Task, to: string) {
      updateTask(t.id, { dueDate: to });
      toast(`${t.title} → ${dayShort(to)}, ${dayLong(to)}`);
    },
    /** A pinned routine onto a day (at the first free half-hour from 09:00 when no time is given). */
    placeRoutine(tplId: string, date: string, startMin?: number) {
      const tpl = planTemplates.find((x) => x.id === tplId);
      if (!tpl) return;
      let start = startMin;
      if (start === undefined) {
        const busy = weekBlocks.filter((b) => b.date === date && !isAutoBlock(b));
        start = 9 * 60;
        for (;;) {
          const s: number = start;
          const clash: PlanBlock | undefined = busy.find((b) => s < b.startMin + b.durationMin && s + tpl.durationMin > b.startMin);
          if (!clash) break;
          start = Math.ceil((clash.startMin + clash.durationMin) / SLOT_MIN) * SLOT_MIN;
        }
        if (start + tpl.durationMin > DAY_MIN) start = 9 * 60;
      }
      addPlanBlock({ date, startMin: start, durationMin: tpl.durationMin, title: tpl.title, color: tpl.color, templateId: tpl.id });
      toast(`${tpl.title} · ${dayShort(date)} ${formatRange(start, tpl.durationMin)}`);
    },
    toggle(it: DayItem) {
      if (it.kind === "meeting" && it.meeting) toggleMeeting(it.meeting.id);
      else if (it.task) toggleTask(it.task.id);
      else if (it.block) updatePlanBlock(it.block.id, { done: !it.block.done });
    },
    remove(it: DayItem) {
      if (it.kind === "meeting") return;
      if (it.kind === "routine" && it.block) removeBlock(it.block);
      else if (it.task) removeTask(it.task);
    },
    open(it: DayItem) {
      if (it.kind === "meeting" && it.meeting) meetingNote(it.meeting);
      else if (it.task) setEditTaskId(it.task.id);
      else if (it.block) setEditBlockId(it.block.id);
    },
    addToDay(raw: string, date: string) {
      if (!raw.trim()) return;
      const parsed = parseNaturalInput(raw);
      addTask({
        title: parsed.title.trim() || raw.trim(),
        done: false,
        dueDate: parsed.dueDate || date,
        priority: 0,
        tags: parsed.tags,
        important: parsed.important,
        remindAt: parsed.remindAt,
        estimateMin: parsed.estimateMin,
        recurrence: parsed.recurrence,
      });
    },
    // grid
    dropNew(source: Source, target: { date: string; startMin: number }) {
      addPlanBlock({ date: target.date, startMin: target.startMin, durationMin: source.durationMin, title: source.title, color: source.color, taskId: source.taskId, templateId: source.templateId });
      if (source.taskId && taskById.get(source.taskId)?.dueDate !== target.date) updateTask(source.taskId, { dueDate: target.date });
      toast(`${source.title} · ${dayShort(target.date)} ${formatRange(target.startMin, source.durationMin)}`);
    },
    dropMove(block: PlanBlock, target: { date: string; startMin: number }) {
      if (block.date === target.date && block.startMin === target.startMin) return;
      if (isAutoBlock(block)) materialize(block, { date: target.date, startMin: target.startMin });
      else updatePlanBlock(block.id, { date: target.date, startMin: target.startMin });
      if (block.taskId && taskById.has(block.taskId) && block.date !== target.date) updateTask(block.taskId, { dueDate: target.date });
    },
    resize(block: PlanBlock, durationMin: number) {
      if (durationMin === block.durationMin) return;
      if (isAutoBlock(block)) materialize(block, { durationMin });
      else updatePlanBlock(block.id, { durationMin });
    },
    openBlock(block: PlanBlock) {
      if (isMeetingBlock(block)) {
        const m = meetingById.get(block.id);
        if (m) meetingNote(m);
        return;
      }
      setEditBlockId(isAutoBlock(block) ? materialize(block) : block.id);
    },
    toggleBlock(block: PlanBlock) {
      if (isMeetingBlock(block)) {
        const m = meetingById.get(block.id);
        if (m) toggleMeeting(m.id);
      } else if (block.taskId && taskById.has(block.taskId)) toggleTask(block.taskId);
      else updatePlanBlock(block.id, { done: !block.done });
    },
    removeBlock,
    removeTask,
    addTemplate: addPlanTemplate,
    deleteTemplate: deletePlanTemplate,
  };

  function materialize(block: PlanBlock, patch: Partial<PlanBlock> = {}): string {
    const { id: _draft, ...rest } = block;
    void _draft;
    return addPlanBlock({ ...rest, ...patch });
  }

  return {
    days,
    dates,
    today,
    todayCol: days.find((d) => d.isToday)?.date,
    weekOffset,
    setWeekOffset,
    rangeLabel: weekRangeLabel(days),
    mirror,
    setMirror,
    byDay,
    stats,
    week,
    backlog,
    openTasks,
    plannedTaskIds,
    weekBlocks,
    autoBlocks,
    meetingById,
    templates: planTemplates,
    taskById,
    blockTitle,
    blockDone,
    goal: Math.max(1, gamification?.dailyGoal || 3),
    actions,
    editTaskId,
    setEditTaskId,
    editBlockId,
    setEditBlockId,
  };
}

export type Planner = ReturnType<typeof usePlanner>;

// ── Drag onto a day (list / board concepts) ────────────────────────────────────────────────────

export interface DayDragState<P> {
  p: P;
  x: number;
  y: number;
  over: string | null;
}

/**
 * Pointer drag onto any element with data-drop-day="YYYY-MM-DD" (or "backlog"). A press without
 * travel is a click. Presses on inner buttons/inputs are left alone.
 */
export function useDayDrag<P>(onDrop: (p: P, day: string) => void, onClick?: (p: P) => void) {
  const [drag, setDrag] = useState<DayDragState<P> | null>(null);
  const dropRef = useRef(onDrop);
  const clickRef = useRef(onClick);
  dropRef.current = onDrop;
  clickRef.current = onClick;

  function begin(e: ReactPointerEvent, p: P) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, textarea, select, a, [data-no-drag]")) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;
    let over: string | null = null;
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        started = true;
      }
      // Nudge the page while the pointer rests near the top / bottom edge.
      if (ev.clientY < 64) window.scrollBy(0, -16);
      else if (ev.clientY > window.innerHeight - 64) window.scrollBy(0, 16);
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-drop-day]");
      over = el?.dataset.dropDay ?? null;
      setDrag({ p, x: ev.clientX, y: ev.clientY, over });
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDrag(null);
      if (!started) {
        if (ev.type === "pointerup") clickRef.current?.(p);
        return;
      }
      if (ev.type === "pointerup" && over) dropRef.current(p, over);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return { drag, begin };
}

/** The thing in flight, under the pointer. */
export function DragGhost({ x, y, title, target }: { x: number; y: number; title: string; target?: string | null }) {
  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] flex max-w-[280px] -translate-x-1/2 -translate-y-full items-center gap-2 truncate px-3.5"
      style={{
        left: x,
        top: y - 10,
        height: 36,
        borderRadius: 999,
        background: C.raise,
        boxShadow: `inset 0 0 0 1px ${C.line2}, 0 16px 40px rgba(0,0,0,0.55)`,
        fontSize: 13,
        color: C.text,
        fontFamily: `"Inter Tight", "Inter", system-ui, sans-serif`,
      }}
    >
      <span className="truncate">{title}</span>
      {target && <span style={{ color: "#5AA9FF", flexShrink: 0 }}>{target}</span>}
    </div>,
    document.body
  );
}

export function dropLabel(day: string | null | undefined) {
  if (!day) return null;
  if (day === BACKLOG_KEY) return "без даты";
  return `${dayShort(day)}, ${dayNum(day)}`;
}

/** Soft blue tint for a drop target being hovered. */
export const dropOver: CSSProperties = { background: "rgba(10,132,255,0.08)", boxShadow: "inset 0 0 0 1px rgba(10,132,255,0.28)" };

// ── Controls ───────────────────────────────────────────────────────────────────────────────────

export function WeekNav({ p }: { p: Planner }) {
  return (
    <div className="flex items-center gap-1.5">
      <IconBtn title="Предыдущая неделя" onClick={() => p.setWeekOffset((n) => n - 1)}>
        <ChevronLeft {...ICON} />
      </IconBtn>
      <span className="grid place-items-center whitespace-nowrap px-4" style={{ height: 40, minWidth: 128, borderRadius: 999, background: C.raise, ...T.body, ...T.num, color: C.text }}>
        {p.rangeLabel}
      </span>
      <IconBtn title="Следующая неделя" onClick={() => p.setWeekOffset((n) => n + 1)}>
        <ChevronRight {...ICON} />
      </IconBtn>
      {p.weekOffset !== 0 && (
        <button
          type="button"
          onClick={() => p.setWeekOffset(0)}
          className="whitespace-nowrap px-3.5 transition-colors hover:bg-[#1E1E22]"
          style={{ height: 40, borderRadius: 999, fontSize: 14, color: C.text2 }}
        >
          Эта неделя
        </button>
      )}
    </div>
  );
}

/** «Задачи с канбана» — on = soft blue tint, no outline. */
export function MirrorToggle({ p }: { p: Planner }) {
  const on = p.mirror;
  return (
    <button
      type="button"
      aria-pressed={on}
      title="Показывать задачи недели с канбана черновиками на сетке"
      onClick={() => p.setMirror((v) => !v)}
      className="inline-flex items-center gap-2 whitespace-nowrap px-4 transition-colors duration-150"
      style={{ height: 40, borderRadius: 999, background: on ? "rgba(10,132,255,0.14)" : C.raise, color: on ? C.text : C.text2, fontSize: 14 }}
    >
      <LayoutGrid size={16} strokeWidth={1.75} color={on ? C.accent : C.text2} />
      Задачи с канбана
      {on && p.autoBlocks.length > 0 && <span style={{ ...T.num, color: "#5AA9FF" }}>{p.autoBlocks.length}</span>}
    </button>
  );
}

/** Inline add for one day: plain input, Enter adds; «завтра 15:00 #тег» is parsed. */
export function DayAdd({
  onAdd,
  placeholder = "Добавить задачу",
  height = 40,
  solid,
  inputRef,
}: {
  onAdd: (v: string) => void;
  placeholder?: string;
  height?: number;
  solid?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [v, setV] = useState("");
  return (
    <form
      data-no-drag
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v);
        setV("");
      }}
      className={`flex items-center gap-2 ${solid ? "pl-5 pr-1.5" : "px-3"}`}
      style={{ height, borderRadius: solid ? R.inner : 12, boxShadow: `inset 0 0 0 1px ${C.line}` }}
    >
      {!solid && <Plus size={15} strokeWidth={2} color={C.text3} className="shrink-0" />}
      <input
        ref={inputRef}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
      {solid && (
        <Btn type="submit" icon={<Plus size={16} strokeWidth={2} />}>
          Добавить
        </Btn>
      )}
    </form>
  );
}

/** Small icon button revealed on hover (move / delete). */
export function HoverAct({ title, onClick, danger, children }: { title: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full opacity-0 transition-[opacity,background,color] duration-150 focus-visible:opacity-100 group-hover:opacity-100 ${danger ? "hover:bg-[#2A1A1A] hover:text-[#FF7A73]" : "hover:bg-[#26262C] hover:text-[#F4F5F7]"}`}
      style={{ color: C.text3 }}
    >
      {children}
    </button>
  );
}

/** «Перенести» — a day picker for the shown week + «Без даты», opened from a hover button. */
export function MoveMenu({ p, item, compact }: { p: Planner; item: DayItem; compact?: boolean }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, !!at, () => setAt(null));
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);
  if (item.kind === "meeting") return compact ? null : <span className="h-8 w-8 shrink-0" />;
  const W = 232;
  return (
    <>
      <HoverAct
        title="Перенести на другой день"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const H = 40 * (p.days.length + 1) + 24;
          const top = r.bottom + 6 + H > window.innerHeight ? Math.max(8, r.top - 6 - H) : r.bottom + 6;
          setAt({ top, left: Math.max(8, Math.min(window.innerWidth - W - 8, r.right - W)) });
        }}
      >
        <CalendarDays size={16} strokeWidth={1.75} />
      </HoverAct>
      {at &&
        createPortal(
          <div
            ref={ref}
            data-no-drag
            className="fixed z-[55] flex flex-col p-2"
            style={{ top: at.top, left: at.left, width: W, background: C.panel, borderRadius: R.inner, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 24px 60px rgba(0,0,0,0.55)`, fontFamily: `"Inter Tight", "Inter", system-ui, sans-serif` }}
          >
            {p.days.map((d) => {
              const here = d.date === item.date;
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={here}
                  onClick={() => {
                    p.actions.move(item, d.date);
                    setAt(null);
                  }}
                  className="flex items-center justify-between px-3 text-left transition-colors hover:bg-[#1E1E22] disabled:cursor-default disabled:hover:bg-transparent"
                  style={{ height: 40, borderRadius: 10, fontSize: 14, color: here ? C.text3 : C.text, background: here ? "rgba(10,132,255,0.10)" : undefined }}
                >
                  <span>
                    {dayShort(d.date)}
                    <span style={{ color: C.text3 }}> · {d.short}</span>
                  </span>
                  <span style={{ ...T.foot, color: d.isToday ? "#5AA9FF" : C.text3 }}>{here ? "сейчас здесь" : d.isToday ? "сегодня" : ""}</span>
                </button>
              );
            })}
            {item.task && (
              <>
                <div className="mx-3 my-1" style={{ height: 1, ...dashed }} />
                <button
                  type="button"
                  onClick={() => {
                    p.actions.move(item, BACKLOG_KEY);
                    setAt(null);
                  }}
                  className="flex items-center px-3 text-left transition-colors hover:bg-[#1E1E22]"
                  style={{ height: 40, borderRadius: 10, fontSize: 14, color: C.text2 }}
                >
                  Без даты
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

// ── Items ──────────────────────────────────────────────────────────────────────────────────────

/** Leading mark of an item: priority dot for tasks, colour bar for routines, camera for meetings. */
export function ItemMark({ it }: { it: DayItem }) {
  if (it.kind === "meeting") return <Video size={14} strokeWidth={1.75} color={C.text2} className="shrink-0" />;
  if (it.kind === "routine") return <span className="shrink-0" style={{ width: 3, height: 14, borderRadius: 9, background: PLAN_HEX[it.color] }} />;
  if (it.priority > 0) return <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[it.priority] }} />;
  return null;
}

/** Plain list row: check · mark · title (+ project) · time on the right · hover move + delete. */
export function ItemRow({
  p,
  it,
  onPointerDown,
  dragging,
  showDay,
  pad = 24,
}: {
  p: Planner;
  it: DayItem;
  onPointerDown?: (e: ReactPointerEvent) => void;
  dragging?: boolean;
  showDay?: boolean;
  pad?: number;
}) {
  /** Overdue reads as such only when it was collected onto another day (today). */
  const late = it.overdue && !it.done && it.task?.dueDate !== it.date;
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={onPointerDown ? undefined : () => p.actions.open(it)}
      onKeyDown={(e) => e.key === "Enter" && p.actions.open(it)}
      className={`group grid items-center gap-3 outline-none transition-colors duration-150 hover:bg-[#1C1C20] focus-visible:bg-[#1C1C20] ${onPointerDown ? "cursor-grab touch-none" : "cursor-pointer"}`}
      style={{ gridTemplateColumns: "22px minmax(0,1fr) auto auto", minHeight: 56, paddingLeft: pad, paddingRight: pad - 12, ...dashed, opacity: dragging ? 0.35 : 1 }}
    >
      <RoundCheck done={it.done} onChange={() => p.actions.toggle(it)} />
      <div className="flex min-w-0 items-center gap-2">
        <ItemMark it={it} />
        <span className="truncate" style={{ ...T.cell, fontSize: 15, color: it.done ? C.text3 : C.text, textDecorationLine: it.done ? "line-through" : "none", textDecorationColor: C.text3 }}>
          {it.title}
        </span>
        {it.projectName && (
          <span className="shrink-0 truncate" style={{ ...T.body, color: C.text3, maxWidth: 160 }}>
            · {it.projectName}
          </span>
        )}
      </div>
      <span className="whitespace-nowrap text-right" style={{ ...T.body, ...(it.startMin !== undefined ? T.num : {}), fontWeight: 400, color: late ? TONE.amber.fg : it.startMin !== undefined ? C.text2 : C.text3 }}>
        {late && it.task?.dueDate ? `с ${dayNum(it.task.dueDate)} ${dayLong(it.task.dueDate).split(" ")[1].slice(0, 3)}.` : showDay ? `${dayShort(it.date)} · ${itemTime(it)}` : itemTime(it)}
      </span>
      <span className="flex items-center">
        <MoveMenu p={p} item={it} />
        {it.kind === "meeting" ? (
          <span className="h-8 w-8" />
        ) : (
          <HoverAct title={it.kind === "routine" ? "Убрать из планера" : "Удалить задачу"} danger onClick={() => p.actions.remove(it)}>
            <Trash2 size={16} strokeWidth={1.75} />
          </HoverAct>
        )}
      </span>
    </div>
  );
}

/** Board card (inner item on C.raise): mark + time line with the check, title below; hover delete. */
export function ItemCard({ p, it, onPointerDown, dragging }: { p: Planner; it: DayItem; onPointerDown?: (e: ReactPointerEvent) => void; dragging?: boolean }) {
  /** Overdue only reads as such when it was collected onto another day (today). */
  const late = it.overdue && !it.done && it.task?.dueDate !== it.date;
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => e.key === "Enter" && p.actions.open(it)}
      className="group relative flex cursor-grab touch-none flex-col gap-1.5 py-2.5 pl-3 pr-2 outline-none transition-colors duration-150 hover:bg-[#232328] focus-visible:bg-[#232328]"
      style={{
        borderRadius: 14,
        background: it.kind === "meeting" ? "rgba(10,132,255,0.08)" : C.raise,
        opacity: dragging ? 0.35 : it.done ? 0.55 : 1,
      }}
    >
      <div className="flex items-center gap-1.5" style={{ height: 20 }}>
        <ItemMark it={it} />
        <span className="min-w-0 flex-1 truncate" style={{ ...T.foot, ...(it.startMin !== undefined ? T.num : {}), fontWeight: 400, color: late ? TONE.amber.fg : it.kind === "meeting" ? "#5AA9FF" : C.text3 }}>
          {late && it.task?.dueDate ? `с ${dayNum(it.task.dueDate)} ${dayLong(it.task.dueDate).split(" ")[1].slice(0, 3)}.` : itemTime(it) || it.projectName || ""}
        </span>
        {it.kind !== "meeting" && (
          <span className="-my-1.5 hidden group-hover:block group-focus-visible:block">
            <HoverAct title={it.kind === "routine" ? "Убрать из планера" : "Удалить задачу"} danger onClick={() => p.actions.remove(it)}>
              <Trash2 size={14} strokeWidth={1.75} />
            </HoverAct>
          </span>
        )}
        <RoundCheck done={it.done} onChange={() => p.actions.toggle(it)} size={18} />
      </div>
      <span
        lang="ru"
        style={{
          fontSize: 14,
          lineHeight: 1.3,
          color: it.done ? C.text3 : C.text,
          textDecorationLine: it.done ? "line-through" : "none",
          textDecorationColor: C.text3,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          hyphens: "auto",
          overflowWrap: "break-word",
        }}
      >
        {it.title}
      </span>
    </div>
  );
}

// ── Editors ────────────────────────────────────────────────────────────────────────────────────

const PRIOS: { p: Priority; label: string }[] = [
  { p: 1, label: "Высокий" },
  { p: 2, label: "Средний" },
  { p: 3, label: "Низкий" },
  { p: 0, label: "Без приоритета" },
];

const fieldStyle = { height: 44, borderRadius: 12, background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}`, padding: "0 14px", fontSize: 14, color: C.text } as const;
const labelStyle = { ...T.foot, color: C.text3, marginBottom: 6 } as const;

function useEsc(onClose: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
}

function DialogFrame({ title, onClose, children, head }: { title: string; onClose: () => void; children: ReactNode; head?: ReactNode }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", fontFamily: `"Inter Tight", "Inter", system-ui, sans-serif`, color: C.text }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className="flex w-full max-w-[560px] flex-col gap-5 p-6"
        style={{ background: C.panel, borderRadius: R.page, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 30px 80px rgba(0,0,0,0.6)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {head}
            <span style={T.h2}>{title}</span>
          </div>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function DangerBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 px-4 transition-colors hover:bg-[#2A1A1A]" style={{ height: 44, borderRadius: 999, color: TONE.red.fg, fontSize: 14 }}>
      <Trash2 size={16} strokeWidth={1.75} />
      {children}
    </button>
  );
}

export function TaskEditor({ task, onClose, onDelete }: { task: Task; onClose: () => void; onDelete: () => void }) {
  const { projects, updateTask } = useData();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [due, setDue] = useState(task.dueDate ?? "");
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [estimate, setEstimate] = useState(task.estimateMin ? String(task.estimateMin) : "");
  useEsc(onClose);
  const save = () => {
    if (!title.trim()) return;
    const est = Math.max(0, Math.round(Number(estimate)));
    updateTask(task.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: due || undefined,
      priority,
      projectId: projectId || undefined,
      estimateMin: est || undefined,
    });
    onClose();
  };
  return (
    <DialogFrame title="Задача" onClose={onClose}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className="w-full bg-transparent outline-none" style={{ ...fieldStyle, height: 52, fontSize: 16 }} placeholder="Название задачи" />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="Описание, ссылки, детали…"
        className="w-full resize-none bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ ...fieldStyle, height: "auto", padding: "12px 14px", lineHeight: 1.45 }}
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col">
          <span style={labelStyle}>День</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="outline-none [color-scheme:dark]" style={fieldStyle} />
        </label>
        <label className="flex flex-col">
          <span style={labelStyle}>Оценка, мин</span>
          <input type="number" min={0} step={15} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="—" className="outline-none" style={fieldStyle} />
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
              style={{ height: 36, borderRadius: 999, fontSize: 14, background: priority === p ? C.raise : "transparent", boxShadow: `inset 0 0 0 1px ${priority === p ? C.line2 : C.line}`, color: priority === p ? C.text : C.text2 }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[p] }} />
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col">
        <span style={labelStyle}>Проект</span>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="outline-none [color-scheme:dark]" style={fieldStyle}>
          <option value="">Без проекта</option>
          {projects.map((pr) => (
            <option key={pr.id} value={pr.id}>
              {pr.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-between pt-1">
        <DangerBtn onClick={onDelete}>Удалить</DangerBtn>
        <div className="flex gap-2">
          <Btn kind="ghost" onClick={onClose}>
            Отмена
          </Btn>
          <Btn onClick={save} disabled={!title.trim()}>
            Сохранить
          </Btn>
        </div>
      </div>
    </DialogFrame>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex flex-col">
      <span style={labelStyle}>{label}</span>
      <div className="flex items-center justify-between px-1.5" style={{ ...fieldStyle, padding: "0 6px" }}>
        <button type="button" aria-label={`${label}: меньше`} onClick={onMinus} className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-[#26262C]" style={{ color: C.text2 }}>
          <Minus size={16} strokeWidth={1.75} />
        </button>
        <span style={{ ...T.body, ...T.num, fontWeight: 400 }}>{value}</span>
        <button type="button" aria-label={`${label}: больше`} onClick={onPlus} className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-[#26262C]" style={{ color: C.text2 }}>
          <Plus size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

/** A block on the planner: name, day, start, length, colour, done; «Убрать» takes it off the grid. */
export function BlockEditor({ p, block, onClose }: { p: Planner; block: PlanBlock; onClose: () => void }) {
  const { updatePlanBlock, updateTask, toggleTask } = useData();
  const task = block.taskId ? p.taskById.get(block.taskId) : undefined;
  const [title, setTitle] = useState(p.blockTitle(block));
  const [date, setDate] = useState(block.date);
  const [start, setStart] = useState(block.startMin);
  const [dur, setDur] = useState(block.durationMin);
  const [color, setColor] = useState<PlanColor>(block.color);
  const done = p.blockDone(block);
  useEsc(onClose);
  const save = () => {
    const t = title.trim();
    if (!t) return;
    if (task) {
      if (t !== task.title) updateTask(task.id, { title: t });
      if (date !== block.date) updateTask(task.id, { dueDate: date });
    }
    updatePlanBlock(block.id, { title: task ? block.title : t, date: date || block.date, startMin: startFromOffset(start, dur), durationMin: dur, color });
    onClose();
  };
  return (
    <DialogFrame
      title={task ? "Задача в плане" : "Блок"}
      onClose={onClose}
      head={<RoundCheck done={done} onChange={() => (task ? toggleTask(task.id) : updatePlanBlock(block.id, { done: !block.done }))} size={26} />}
    >
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className="w-full bg-transparent outline-none" style={{ ...fieldStyle, height: 52, fontSize: 16 }} placeholder="Название" />
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col">
          <span style={labelStyle}>День</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="outline-none [color-scheme:dark]" style={fieldStyle} />
        </label>
        <Stepper label="Начало" value={formatClock(startFromOffset(start, dur))} onMinus={() => setStart((s) => startFromOffset(s - SLOT_MIN, dur))} onPlus={() => setStart((s) => startFromOffset(s + SLOT_MIN, dur))} />
        <Stepper label="Длительность" value={formatDuration(dur)} onMinus={() => setDur((d) => Math.max(SLOT_MIN, d - SLOT_MIN))} onPlus={() => setDur((d) => Math.min(DAY_MIN - start, d + SLOT_MIN))} />
      </div>
      <div style={{ ...T.body, color: C.text3, marginTop: -8 }}>
        {dayShort(date)}, {dayLong(date)} · {formatRange(startFromOffset(start, dur), dur)}
      </div>
      <div className="flex flex-col">
        <span style={labelStyle}>Цвет</span>
        <div className="flex flex-wrap gap-1.5">
          {PLAN_COLOR_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="inline-flex items-center gap-2 px-3.5 transition-colors"
              style={{ height: 36, borderRadius: 999, fontSize: 14, background: color === c ? C.raise : "transparent", boxShadow: `inset 0 0 0 1px ${color === c ? C.line2 : C.line}`, color: color === c ? C.text : C.text2 }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 9, background: PLAN_HEX[c] }} />
              {PLAN_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <DangerBtn onClick={() => p.actions.removeBlock(block)}>Убрать</DangerBtn>
        <div className="flex gap-2">
          {task && (
            <Btn
              kind="ghost"
              icon={<ExternalLink size={16} strokeWidth={1.75} />}
              onClick={() => {
                onClose();
                p.setEditTaskId(task.id);
              }}
            >
              Задача
            </Btn>
          )}
          <Btn kind="ghost" onClick={onClose}>
            Отмена
          </Btn>
          <Btn onClick={save} disabled={!title.trim()}>
            Сохранить
          </Btn>
        </div>
      </div>
    </DialogFrame>
  );
}

/** Mount once per concept: whichever editor is open. */
export function PlannerDialogs({ p }: { p: Planner }) {
  const { tasks, planBlocks } = useData();
  const task = p.editTaskId ? tasks.find((t) => t.id === p.editTaskId) : undefined;
  const block = p.editBlockId ? planBlocks.find((b) => b.id === p.editBlockId) : undefined;
  return (
    <>
      {task && <TaskEditor key={task.id} task={task} onClose={() => p.setEditTaskId(null)} onDelete={() => p.actions.removeTask(task)} />}
      {block && <BlockEditor key={block.id} p={p} block={block} onClose={() => p.setEditBlockId(null)} />}
    </>
  );
}

// ── Small shared bits ──────────────────────────────────────────────────────────────────────────

/** Routine form (title, length, colour) — «Закрепить». */
export function RoutineForm({ onAdd, onCancel }: { onAdd: (v: { title: string; durationMin: number; color: PlanColor }) => void; onCancel?: () => void }) {
  const [title, setTitle] = useState("");
  const [min, setMin] = useState(60);
  const [color, setColor] = useState<PlanColor>("blue");
  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), durationMin: min, color });
    setTitle("");
  };
  return (
    <div data-no-drag className="flex flex-col gap-3 p-3" style={{ background: C.raise, borderRadius: R.inner }}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel?.();
        }}
        placeholder="Тренировка, английский, созвон…"
        className="w-full bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ ...fieldStyle, height: 40 }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Короче" onClick={() => setMin((m) => Math.max(SLOT_MIN, m - SLOT_MIN))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[#26262C]" style={{ color: C.text2 }}>
            <Minus size={15} strokeWidth={1.75} />
          </button>
          <span className="text-center" style={{ ...T.body, ...T.num, fontWeight: 400, minWidth: 52 }}>
            {formatDuration(min)}
          </span>
          <button type="button" aria-label="Длиннее" onClick={() => setMin((m) => Math.min(DAY_MIN, m + SLOT_MIN))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[#26262C]" style={{ color: C.text2 }}>
            <Plus size={15} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex gap-1.5">
          {PLAN_COLOR_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={PLAN_LABEL[c]}
              title={PLAN_LABEL[c]}
              onClick={() => setColor(c)}
              className="h-4 w-4 rounded-full transition-opacity"
              style={{ background: PLAN_HEX[c], opacity: color === c ? 1 : 0.35, boxShadow: color === c ? `0 0 0 2px ${C.raise}, 0 0 0 3.5px ${tint(PLAN_HEX[c], 0.6)}` : undefined }}
            />
          ))}
        </div>
      </div>
      <Btn size={36} onClick={submit} disabled={!title.trim()} full>
        Закрепить
      </Btn>
    </div>
  );
}

export function countLabel(n: number) {
  return `${n} ${plural(n, "задача", "задачи", "задач")}`;
}

export type { WeekDay };
export { BACKLOG_KEY, dayShort, formatDuration, formatRange, formatClock, durationForTask, isAutoBlock, startFromOffset };
