import { localDayStr } from "@/lib/format";
import type { Task } from "@/types";

/**
 * The «По неделям» kanban: one column per day of a week plus a backlog, so a week is planned by
 * dragging cards onto days instead of opening a date picker per task.
 *
 * Pure date maths lives here rather than in the page, because the fiddly parts — which Monday a
 * given offset lands on, where an overdue task goes — are exactly what is worth testing.
 */

export interface WeekDay {
  /** Stable column key, also the date it stands for: YYYY-MM-DD. */
  date: string;
  /** «Понедельник» */
  label: string;
  /** «22 сент.» */
  short: string;
  isToday: boolean;
}

/** Column id for tasks with no due date. Not a date, so it can never collide with one. */
export const BACKLOG_KEY = "backlog";

const DAY_NAMES = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const MONTHS = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];

/** Midnight-local Date for a YYYY-MM-DD string — never `new Date(str)`, which parses as UTC. */
function fromDayStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** First day of the week `offset` weeks away from the one containing `today`. */
export function weekStart(offset = 0, weekStartsMonday = true, today = localDayStr()): string {
  const d = fromDayStr(today);
  const dow = d.getDay(); // 0 = Sunday
  const back = weekStartsMonday ? (dow + 6) % 7 : dow;
  d.setDate(d.getDate() - back + offset * 7);
  return localDayStr(d);
}

/** The seven columns of that week, in order. */
export function weekDays(offset = 0, weekStartsMonday = true, today = localDayStr()): WeekDay[] {
  const start = fromDayStr(weekStart(offset, weekStartsMonday, today));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const date = localDayStr(d);
    return {
      date,
      label: DAY_NAMES[d.getDay()],
      short: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
      isToday: date === today,
    };
  });
}

/** «22–28 сент.» — the heading above the board. */
export function weekRangeLabel(days: WeekDay[]): string {
  if (days.length === 0) return "";
  const first = fromDayStr(days[0].date);
  const last = fromDayStr(days[days.length - 1].date);
  const tail = `${last.getDate()} ${MONTHS[last.getMonth()]}`;
  const head = first.getMonth() === last.getMonth() ? String(first.getDate()) : `${first.getDate()} ${MONTHS[first.getMonth()]}`;
  return `${head}–${tail}`;
}

/**
 * Which column a task belongs to, or null when it falls outside the shown week.
 *
 * Overdue tasks are the one special case: on the CURRENT week they collect in today's column
 * rather than disappearing off the left edge, because a weekly planner that quietly hides what
 * you already missed is worse than useless. On other weeks they are simply out of view.
 */
export function weekColumnOf(task: Task, days: WeekDay[], today = localDayStr()): string | null {
  if (!task.dueDate) return BACKLOG_KEY;
  const hit = days.find((d) => d.date === task.dueDate);
  if (hit) return hit.date;
  const todayCol = days.find((d) => d.date === today);
  if (todayCol && task.dueDate < days[0].date) return todayCol.date;
  return null;
}
