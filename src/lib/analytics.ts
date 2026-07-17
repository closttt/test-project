import type { AppData, Task, PomodoroSession } from "@/types";
import { localDayStr } from "@/lib/format";

export type RangeDays = 7 | 30 | 90;

export interface Series {
  label: string;
  value: number;
}

export interface ProjectShare {
  label: string;
  value: number; // percentage 0..100
}

export interface PrioritySlice {
  label: string;
  value: number;
  color: string;
}

export interface AnalyticsResult {
  days: RangeDays;
  /** Tasks closed per day across the range. */
  completionsSeries: Series[];
  /** Focus minutes (pomodoro work) per day across the range. */
  focusSeries: Series[];
  /** Pomodoro sessions per day — feeds the contribution heatmap. */
  focusCountByDate: Record<string, number>;
  totalClosed: number;
  totalFocusMin: number;
  /** Average focus minutes per calendar day in the range. */
  avgFocusMin: number;
  /** Days in range with any completion. */
  activeDays: number;
  /** Focus minutes by weekday, Monday-first. */
  byWeekday: Series[];
  /** Open active tasks grouped by priority. */
  priorityOpen: PrioritySlice[];
  /** Share of focus time by project (top 6). */
  topProjects: ProjectShare[];
  /** Average estimate accuracy over done+estimated tasks (0..100), or null. */
  estimateAccuracy: number | null;
  /** Lifetime tracked minutes across all tasks (manual timer + pomodoro credited). */
  lifetimeTrackedMin: number;
}

function dateKey(d: Date): string {
  return localDayStr(d);
}

function labelFor(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Convert JS getDay() (0=Sun) to a Monday-first index (0=Mon). */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function computeAnalytics(data: AppData, days: RangeDays): AnalyticsResult {
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const startKey = dateKey(start);

  const workSessions = data.pomodoroSessions.filter(
    (s) => s.kind === "work" && s.date >= startKey
  );

  // Per-day series (fixed length = days, oldest → newest).
  const completionsSeries: Series[] = [];
  const focusSeries: Series[] = [];
  const focusCountByDate: Record<string, number> = {};
  const minutesByDate = new Map<string, number>();
  const countByDate = new Map<string, number>();

  workSessions.forEach((s) => {
    minutesByDate.set(s.date, (minutesByDate.get(s.date) ?? 0) + s.minutes);
    countByDate.set(s.date, (countByDate.get(s.date) ?? 0) + 1);
  });

  let totalClosed = 0;
  let totalFocusMin = 0;
  let activeDays = 0;
  const byWeekdayMin = [0, 0, 0, 0, 0, 0, 0];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const closed = data.completionLog[key] ?? 0;
    const focusMin = minutesByDate.get(key) ?? 0;
    const cnt = countByDate.get(key) ?? 0;
    completionsSeries.push({ label: labelFor(d), value: closed });
    focusSeries.push({ label: labelFor(d), value: focusMin });
    if (cnt) focusCountByDate[key] = cnt;
    totalClosed += closed;
    totalFocusMin += focusMin;
    if (closed > 0) activeDays++;
    byWeekdayMin[mondayIndex(d)] += focusMin;
  }

  const byWeekday: Series[] = WEEKDAYS.map((label, i) => ({ label, value: byWeekdayMin[i] }));

  // Open tasks by priority (active, not done).
  const open = data.tasks.filter((t) => !t.done && !t.archivedAt);
  const priorityOpen: PrioritySlice[] = [
    { label: "Высокий", value: open.filter((t) => t.priority === 1).length, color: "hsl(var(--risk))" },
    { label: "Средний", value: open.filter((t) => t.priority === 2).length, color: "hsl(38 92% 55%)" },
    { label: "Низкий", value: open.filter((t) => t.priority === 3).length, color: "hsl(var(--brand))" },
    { label: "Без приоритета", value: open.filter((t) => t.priority === 0).length, color: "hsl(var(--muted-foreground))" },
  ].filter((s) => s.value > 0);

  // Focus time share by project.
  const taskById = new Map<string, Task>(data.tasks.map((t) => [t.id, t]));
  const projById = new Map(data.projects.map((p) => [p.id, p.name]));
  const projMinutes = new Map<string, number>();
  workSessions.forEach((s) => {
    const t = s.taskId ? taskById.get(s.taskId) : undefined;
    const name = t?.projectId ? projById.get(t.projectId) ?? "Без проекта" : "Без проекта";
    projMinutes.set(name, (projMinutes.get(name) ?? 0) + s.minutes);
  });
  const projTotal = Array.from(projMinutes.values()).reduce((a, b) => a + b, 0);
  const topProjects: ProjectShare[] = Array.from(projMinutes.entries())
    .map(([label, min]) => ({ label, value: projTotal ? Math.round((min / projTotal) * 100) : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Estimate accuracy over done tasks that had an estimate and tracked time.
  const estimated = data.tasks.filter((t) => t.done && (t.estimateMin ?? 0) > 0 && t.spentMin > 0);
  const estimateAccuracy = estimated.length
    ? Math.round(
        estimated.reduce((s, t) => {
          const est = t.estimateMin!;
          const acc = 100 - (Math.abs(t.spentMin - est) / est) * 100;
          return s + Math.max(0, Math.min(100, acc));
        }, 0) / estimated.length
      )
    : null;

  const lifetimeTrackedMin = data.tasks.reduce((s, t) => s + (t.spentMin ?? 0), 0);

  return {
    days,
    completionsSeries,
    focusSeries,
    focusCountByDate,
    totalClosed,
    totalFocusMin,
    avgFocusMin: Math.round(totalFocusMin / days),
    activeDays,
    byWeekday,
    priorityOpen,
    topProjects,
    estimateAccuracy,
    lifetimeTrackedMin,
  };
}

/** Best focus weekday label, for a friendly summary line. */
export function peakWeekday(r: AnalyticsResult): string | null {
  const max = Math.max(...r.byWeekday.map((w) => w.value));
  if (max <= 0) return null;
  return r.byWeekday.find((w) => w.value === max)?.label ?? null;
}

export type { PomodoroSession };
