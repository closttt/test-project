/** Level/XP math + achievement definitions. Pure, local, from existing data. */

export function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

/** Cumulative XP required to reach the start of `level`. */
export function xpAtLevelStart(level: number): number {
  return (level - 1) * (level - 1) * 100;
}

export function levelProgress(xp: number): { level: number; inLevel: number; span: number; pct: number; toNext: number } {
  const level = levelFromXp(xp);
  const start = xpAtLevelStart(level);
  const next = xpAtLevelStart(level + 1);
  const span = next - start;
  const inLevel = xp - start;
  return { level, inLevel, span, pct: (inLevel / span) * 100, toNext: next - xp };
}

/** XP awarded for completing a task, scaled by its priority. */
export function xpForTaskCompletion(priority: number): number {
  const base = 10;
  const bonus = priority === 1 ? 10 : priority === 2 ? 5 : priority === 3 ? 2 : 0;
  return base + bonus;
}

export interface GameStats {
  lifetimeDone: number;
  streak: number;
  clients: number;
  paidPayments: number;
  minutesToday: number;
  openTasks: number;
  totalTasks: number;
  level: number;
  /** Completed pomodoro work sessions (all time). */
  pomodoros: number;
  /** Total focus minutes from pomodoro sessions (all time). */
  focusMinTotal: number;
  /** Most tasks completed in a single calendar day (from completionLog). */
  maxTasksInDay: number;
  /** Most focus minutes logged in a single calendar day. */
  maxFocusMinInDay: number;
  /** Most pomodoro work sessions finished in a single calendar day. */
  maxPomodorosInDay: number;
  /** Longest single pomodoro work session, in minutes. */
  longestFocusSession: number;
  /** Tasks completed late at night (23:00–02:59 local time). */
  nightOwlDone: number;
  /** Tasks completed early in the morning (04:00–06:59 local time). */
  earlyBirdDone: number;
  /** Distinct projects with at least one completed task. */
  projectsTouched: number;
  /** Currently open tasks whose due date has already passed. */
  overdueTasks: number;
  /** Currently open tasks that have a due date at all. */
  tasksWithDueDate: number;
  /** True if the current streak (3+ days) resumed after a prior break. */
  comeback: boolean;
}

export interface Achievement {
  id: string;
  icon: string; // emoji
  title: string;
  desc: string;
  test: (s: GameStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-task", icon: "✅", title: "Первый шаг", desc: "Закрыть первую задачу", test: (s) => s.lifetimeDone >= 1 },
  { id: "ten-tasks", icon: "🔟", title: "Разгон", desc: "Закрыть 10 задач", test: (s) => s.lifetimeDone >= 10 },
  { id: "fifty-tasks", icon: "🚀", title: "На потоке", desc: "Закрыть 50 задач", test: (s) => s.lifetimeDone >= 50 },
  { id: "hundred-tasks", icon: "💯", title: "Сотка", desc: "Закрыть 100 задач", test: (s) => s.lifetimeDone >= 100 },
  { id: "streak-3", icon: "🔥", title: "Три подряд", desc: "Стрик 3 дня", test: (s) => s.streak >= 3 },
  { id: "streak-7", icon: "🗓️", title: "Неделя силы", desc: "Стрик 7 дней", test: (s) => s.streak >= 7 },
  { id: "streak-30", icon: "🏆", title: "Железная дисциплина", desc: "Стрик 30 дней", test: (s) => s.streak >= 30 },
  { id: "inbox-zero", icon: "🧘", title: "Чистый список", desc: "Ни одной открытой задачи", test: (s) => s.totalTasks > 0 && s.openTasks === 0 },
  { id: "focus-2h", icon: "⏱️", title: "Глубокая работа", desc: "2 часа трекинга за день", test: (s) => s.minutesToday >= 120 },
  { id: "level-5", icon: "⭐", title: "Опытный", desc: "Достичь 5 уровня", test: (s) => s.level >= 5 },
  { id: "first-pomodoro", icon: "🍅", title: "Первый помидор", desc: "Завершить первую помодоро-сессию", test: (s) => s.pomodoros >= 1 },
  { id: "ten-pomodoros", icon: "🍅", title: "Разгон фокуса", desc: "10 помодоро-сессий", test: (s) => s.pomodoros >= 10 },
  { id: "fifty-pomodoros", icon: "🌶️", title: "Мастер фокуса", desc: "50 помодоро-сессий", test: (s) => s.pomodoros >= 50 },
  { id: "focus-10h", icon: "⏳", title: "Десять часов", desc: "10 часов фокуса всего", test: (s) => s.focusMinTotal >= 600 },
  { id: "level-10", icon: "👑", title: "Гуру потока", desc: "Достичь 10 уровня", test: (s) => s.level >= 10 },

  // --- Records, milestones & curveballs ---
  { id: "milestone-250", icon: "🎯", title: "Четверть тысячи", desc: "Закрыть 250 задач", test: (s) => s.lifetimeDone >= 250 },
  { id: "milestone-500", icon: "🏔️", title: "Полтысячи", desc: "Закрыть 500 задач", test: (s) => s.lifetimeDone >= 500 },
  { id: "pomodoro-100", icon: "🔥", title: "Сотня помидоров", desc: "100 помодоро-сессий", test: (s) => s.pomodoros >= 100 },
  { id: "pomodoro-200", icon: "🌋", title: "Помидорный марафон", desc: "200 помодоро-сессий", test: (s) => s.pomodoros >= 200 },
  { id: "big-focus-day", icon: "🧠", title: "День глубокого фокуса", desc: "4+ часа фокуса за один день", test: (s) => s.maxFocusMinInDay >= 240 },
  { id: "long-session-90", icon: "🎧", title: "В потоке", desc: "Одна фокус-сессия длиной 90+ минут", test: (s) => s.longestFocusSession >= 90 },
  { id: "multi-project", icon: "🗂️", title: "Мультизадачник", desc: "Закрыть задачи в 5+ разных проектах", test: (s) => s.projectsTouched >= 5 },
  { id: "night-owl", icon: "🦉", title: "Ночная сова", desc: "Закрыть 5 задач после 23:00", test: (s) => s.nightOwlDone >= 5 },
  { id: "early-bird", icon: "🐦", title: "Жаворонок", desc: "Закрыть 5 задач до 7 утра", test: (s) => s.earlyBirdDone >= 5 },
  { id: "perfectionist", icon: "✨", title: "Перфекционист", desc: "Ни одной просроченной задачи среди активных со сроком", test: (s) => s.tasksWithDueDate >= 3 && s.overdueTasks === 0 },
  { id: "comeback", icon: "🔄", title: "Возвращение", desc: "Новый стрик 3+ дня после перерыва", test: (s) => s.comeback },
  { id: "record-day", icon: "⚡", title: "Ударный день", desc: "8+ задач закрыто за один день", test: (s) => s.maxTasksInDay >= 8 },
  { id: "pomodoro-day", icon: "🎇", title: "День помидоров", desc: "6+ помодоро-сессий за один день", test: (s) => s.maxPomodorosInDay >= 6 },
  { id: "level-15", icon: "🌠", title: "Легенда потока", desc: "Достичь 15 уровня", test: (s) => s.level >= 15 },
  { id: "level-20", icon: "🪐", title: "Абсолют", desc: "Достичь 20 уровня", test: (s) => s.level >= 20 },
];
