import type { AppData } from "@/types";

/**
 * Daily quests + a seasonal (monthly) challenge — the "fantasy pack" on top of achievements.
 *
 * Achievements are lifetime one-offs; quests are the short loop: 3 small goals that rotate every
 * day and pay XP. Everything is DERIVED from data the app already stores (completionLog, tasks,
 * pomodoroSessions) — no new tracking, nothing to keep in sync.
 */

export interface Quest {
  id: string;
  icon: string;
  title: string;
  /** Target count and how far the user got today. */
  target: number;
  progress: (d: AppData, today: string) => number;
  xp: number;
}

function doneToday(d: AppData, today: string): number {
  return d.completionLog[today] ?? 0;
}

function completedTodayTasks(d: AppData, today: string) {
  return d.tasks.filter((t) => t.done && (t.completedAt ?? "").slice(0, 10) === today);
}

/** The pool a day's quests are drawn from. Keep each one checkable from existing data. */
export const QUEST_POOL: Quest[] = [
  {
    id: "close-3", icon: "✅", title: "Закрыть 3 задачи", target: 3, xp: 15,
    progress: (d, today) => doneToday(d, today),
  },
  {
    id: "close-5", icon: "🔥", title: "Закрыть 5 задач", target: 5, xp: 25,
    progress: (d, today) => doneToday(d, today),
  },
  {
    id: "high-priority", icon: "🎯", title: "Закрыть важную задачу", target: 1, xp: 20,
    progress: (d, today) => completedTodayTasks(d, today).filter((t) => t.priority === 1).length,
  },
  {
    id: "clear-overdue", icon: "🧹", title: "Разобрать просроченное", target: 1, xp: 20,
    progress: (d, today) =>
      completedTodayTasks(d, today).filter((t) => !!t.dueDate && t.dueDate < today).length,
  },
  {
    id: "focus-session", icon: "🍅", title: "Провести фокус-сессию", target: 1, xp: 15,
    progress: (d, today) =>
      (d.pomodoroSessions ?? []).filter((p) => p.kind === "work" && p.date === today).length,
  },
  {
    id: "focus-50", icon: "🧠", title: "50 минут фокуса", target: 50, xp: 25,
    progress: (d, today) =>
      (d.pomodoroSessions ?? [])
        .filter((p) => p.kind === "work" && p.date === today)
        .reduce((s, p) => s + p.minutes, 0),
  },
  {
    id: "early-start", icon: "🐦", title: "Закрыть задачу до 12:00", target: 1, xp: 15,
    progress: (d, today) =>
      completedTodayTasks(d, today).filter((t) => new Date(t.completedAt!).getHours() < 12).length,
  },
  {
    id: "project-progress", icon: "🗂️", title: "Продвинуть проект", target: 1, xp: 15,
    progress: (d, today) => completedTodayTasks(d, today).filter((t) => !!t.projectId).length,
  },
  {
    id: "meeting-done", icon: "🤝", title: "Закрыть встречу", target: 1, xp: 10,
    progress: (d, today) =>
      d.meetings.filter((m) => m.done && (m.completedAt ?? "").slice(0, 10) === today).length,
  },
];

/** Stable per-day shuffle seed — same 3 quests all day, a new set tomorrow. */
function hashDate(date: string): number {
  let h = 0;
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The 3 quests for `date`. Deterministic: no storage needed, and it can't reshuffle mid-day. */
export function questsForDay(date: string, count = 3): Quest[] {
  const seed = hashDate(date);
  const pool = [...QUEST_POOL];
  const picked: Quest[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    picked.push(pool.splice((seed + i * 7) % pool.length, 1)[0]);
  }
  return picked;
}

export function questDone(q: Quest, d: AppData, today: string): boolean {
  return q.progress(d, today) >= q.target;
}

// ── Seasonal challenge ────────────────────────────────────────────────────────────────────

export interface Season {
  key: string;
  icon: string;
  title: string;
  target: number;
  done: number;
}

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const SEASON_ICONS = ["❄️", "🌨️", "🌱", "🌸", "🌿", "☀️", "🏖️", "🌻", "🍂", "🎃", "🌧️", "🎄"];

/**
 * This month's challenge: close ~2 tasks per day of the month. Scales with month length so
 * February isn't easier than July, and reads straight off completionLog.
 */
export function currentSeason(now = new Date()): Season {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return {
    key: prefix,
    icon: SEASON_ICONS[month],
    title: `${MONTHS[month]}: марафон месяца`,
    target: daysInMonth * 2,
    done: 0, // filled by seasonProgress — kept separate so this stays data-free
  };
}

export function seasonProgress(d: AppData, now = new Date()): Season {
  const s = currentSeason(now);
  const done = Object.entries(d.completionLog)
    .filter(([day]) => day.startsWith(s.key))
    .reduce((sum, [, n]) => sum + n, 0);
  return { ...s, done };
}
