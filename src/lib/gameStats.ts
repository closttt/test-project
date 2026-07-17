import type { AppData } from "@/types";
import { levelFromXp, type GameStats } from "@/lib/gamification";
import { localDayStr, todayStr, isOverdue } from "@/lib/format";

/** Consecutive days with completions, ending today or yesterday. */
export function computeStreak(completionLog: Record<string, number>): number {
  let count = 0;
  const d = new Date();
  if (!completionLog[localDayStr(d)]) d.setDate(d.getDate() - 1);
  while (completionLog[localDayStr(d)]) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

/** Resumed a streak of `streak` days (3+) after at least one empty day, with prior activity in the last 60 days before that gap. */
function computeComeback(completionLog: Record<string, number>, streak: number): boolean {
  if (streak < 3) return false;
  const d = new Date();
  if (!completionLog[localDayStr(d)]) d.setDate(d.getDate() - 1);
  d.setDate(d.getDate() - streak); // the first empty day right before the current streak began
  for (let i = 0; i < 60; i++) {
    d.setDate(d.getDate() - 1);
    if (completionLog[localDayStr(d)]) return true;
  }
  return false;
}

export function computeGameStats(d: AppData): GameStats {
  const lifetimeDone = Object.values(d.completionLog).reduce((s, n) => s + n, 0);
  const openTasks = d.tasks.filter((t) => !t.done && !(t.snoozedUntil && t.snoozedUntil > todayStr())).length;
  const minutesToday = d.tasks.reduce((s, t) => s + (t.spentMin ?? 0), 0);
  const work = (d.pomodoroSessions ?? []).filter((p) => p.kind === "work");

  const maxTasksInDay = Object.values(d.completionLog).reduce((m, n) => Math.max(m, n), 0);

  const focusMinByDay: Record<string, number> = {};
  const pomodorosByDay: Record<string, number> = {};
  let longestFocusSession = 0;
  for (const p of work) {
    focusMinByDay[p.date] = (focusMinByDay[p.date] ?? 0) + p.minutes;
    pomodorosByDay[p.date] = (pomodorosByDay[p.date] ?? 0) + 1;
    if (p.minutes > longestFocusSession) longestFocusSession = p.minutes;
  }
  const maxFocusMinInDay = Object.values(focusMinByDay).reduce((m, v) => Math.max(m, v), 0);
  const maxPomodorosInDay = Object.values(pomodorosByDay).reduce((m, v) => Math.max(m, v), 0);

  const doneTasks = d.tasks.filter((t) => t.done);
  let nightOwlDone = 0;
  let earlyBirdDone = 0;
  for (const t of doneTasks) {
    if (!t.completedAt) continue;
    const hour = new Date(t.completedAt).getHours();
    if (hour >= 23 || hour < 3) nightOwlDone++;
    if (hour >= 4 && hour < 7) earlyBirdDone++;
  }
  const projectsTouched = new Set(doneTasks.filter((t) => t.projectId).map((t) => t.projectId)).size;

  const openWithDue = d.tasks.filter((t) => !t.done && t.dueDate);
  const overdueTasks = openWithDue.filter((t) => isOverdue(t.dueDate)).length;

  const streak = computeStreak(d.completionLog);

  return {
    lifetimeDone,
    streak,
    clients: d.clients.length,
    paidPayments: d.clients.reduce((s, c) => s + c.payments.filter((p) => p.status === "paid").length, 0),
    minutesToday,
    openTasks,
    totalTasks: d.tasks.length,
    level: levelFromXp(d.gamification.xp),
    pomodoros: work.length,
    focusMinTotal: work.reduce((s, p) => s + p.minutes, 0),
    maxTasksInDay,
    maxFocusMinInDay,
    maxPomodorosInDay,
    longestFocusSession,
    nightOwlDone,
    earlyBirdDone,
    projectsTouched,
    overdueTasks,
    tasksWithDueDate: openWithDue.length,
    comeback: computeComeback(d.completionLog, streak),
  };
}
