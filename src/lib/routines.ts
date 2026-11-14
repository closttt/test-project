import type { AppData, Priority, Routine, Task } from "@/types";

/**
 * Повторяющиеся задачи (owner, 2026-11-14): «создаём задачу, выбираем дни, приоритет — и она
 * повторяется из недели в неделю, пока я сам её не удалю».
 *
 * A Routine is only the rule. spawnRoutineTasks() turns it into ordinary Tasks — one per chosen
 * weekday, from today through the end of next week — so they sit on the week board like any task:
 * tick, drag, edit, delete. Every spawned day is remembered in `routineSpawned`, so deleting one
 * day's task by hand skips that day instead of bringing it back. Days before the routine existed
 * (or before today) are never filled in.
 */

export const WEEKDAYS: { d: number; short: string }[] = [
  { d: 1, short: "Пн" },
  { d: 2, short: "Вт" },
  { d: 3, short: "Ср" },
  { d: 4, short: "Чт" },
  { d: 5, short: "Пт" },
  { d: 6, short: "Сб" },
  { d: 7, short: "Вс" },
];

/** Keys older than this many days are dropped — they can never be spawned again anyway. */
const KEEP_DAYS = 28;

function parseDay(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** YYYY-MM-DD shifted by n days, in local time (DST-safe: works on calendar dates, not ms). */
export function shiftDay(date: string, n: number): string {
  const d = parseDay(date);
  d.setDate(d.getDate() + n);
  return fmtDay(d);
}

/** ISO weekday of a YYYY-MM-DD: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const w = parseDay(date).getDay();
  return w === 0 ? 7 : w;
}

/** The days a routine fills ahead: today through Sunday of next week. */
export function spawnWindow(today: string): string[] {
  const n = 7 - isoWeekday(today) + 7;
  return Array.from({ length: n + 1 }, (_, i) => shiftDay(today, i));
}

/** «Вт · Чт · Сб», «Каждый день», «Будни». */
export function daysLabel(days: number[]): string {
  const s = [...new Set(days)].sort((a, b) => a - b);
  if (s.length === 7) return "Каждый день";
  if (s.join() === "1,2,3,4,5") return "Будни";
  if (s.join() === "6,7") return "Выходные";
  return s.map((d) => WEEKDAYS[d - 1]?.short).filter(Boolean).join(" · ");
}

const keyOf = (routineId: string, date: string) => `${routineId}@${date}`;
const dateOfKey = (key: string) => key.slice(key.lastIndexOf("@") + 1);

export function routineTask(r: Routine, date: string, id: string, createdAt: string): Task {
  return {
    id,
    title: r.title,
    done: false,
    important: false,
    priority: r.priority,
    links: [],
    comments: [],
    dueDate: date,
    recurrence: "none",
    spentMin: 0,
    tags: [],
    subtasks: [],
    attachments: [],
    projectId: r.projectId,
    routineId: r.id,
    order: 0,
    createdAt,
  };
}

/**
 * Put every routine's task on each of its weekdays in the window that hasn't had one yet. Returns
 * the same object when there is nothing to do, so it is safe to call on every change.
 */
export function spawnRoutineTasks(d: AppData, today: string, newId: () => string): AppData {
  const routines = d.routines ?? [];
  const before = d.routineSpawned ?? [];
  const cutoff = shiftDay(today, -KEEP_DAYS);
  const spawned = new Set(before.filter((k) => dateOfKey(k) >= cutoff));
  const existing = new Set(d.tasks.filter((t) => t.routineId && t.dueDate).map((t) => keyOf(t.routineId!, t.dueDate!)));
  const fresh: Task[] = [];
  const createdAt = new Date().toISOString();
  const window = spawnWindow(today);
  for (const r of routines) {
    if (!r.title.trim() || r.days.length === 0) continue;
    for (const date of window) {
      if (!r.days.includes(isoWeekday(date))) continue;
      const key = keyOf(r.id, date);
      if (existing.has(key)) {
        spawned.add(key);
        continue;
      }
      if (spawned.has(key)) continue;
      spawned.add(key);
      fresh.push(routineTask(r, date, newId(), createdAt));
    }
  }
  const keys = [...spawned];
  if (fresh.length === 0 && keys.length === before.length && keys.every((k, i) => k === before[i])) return d;
  return {
    ...d,
    routineSpawned: keys,
    tasks: fresh.length ? [...fresh, ...d.tasks].map((t, i) => ({ ...t, order: i })) : d.tasks,
  };
}

/** An open task of this routine still ahead (today or later) — the ones a routine edit/delete touches. */
const isOpenAhead = (t: Task, routineId: string, today: string) =>
  t.routineId === routineId && !t.done && !t.archivedAt && !!t.dueDate && t.dueDate >= today;

export function addRoutine(
  d: AppData,
  input: { title: string; days: number[]; priority: Priority; projectId?: string },
  id: string
): AppData {
  const r: Routine = {
    id,
    title: input.title.trim(),
    days: [...new Set(input.days)].sort((a, b) => a - b),
    priority: input.priority,
    projectId: input.projectId,
    createdAt: new Date().toISOString(),
  };
  return { ...d, routines: [...(d.routines ?? []), r] };
}

/**
 * Edit a routine. Its open tasks from today on follow: a removed weekday loses its task, the rest get
 * the new title and priority. Past and closed tasks stay as they were — that's history.
 */
export function updateRoutine(d: AppData, id: string, patch: Partial<Omit<Routine, "id" | "createdAt">>, today: string): AppData {
  const old = (d.routines ?? []).find((r) => r.id === id);
  if (!old) return d;
  const r: Routine = {
    ...old,
    ...patch,
    title: (patch.title ?? old.title).trim(),
    days: [...new Set(patch.days ?? old.days)].sort((a, b) => a - b),
  };
  const tasks = d.tasks
    .filter((t) => !(isOpenAhead(t, id, today) && !r.days.includes(isoWeekday(t.dueDate!))))
    .map((t) => (isOpenAhead(t, id, today) ? { ...t, title: r.title, priority: r.priority, projectId: r.projectId } : t));
  // Days ahead with no task left (just removed, or deleted by hand) are forgotten, so a weekday
  // added back gets its task again.
  const kept = new Set(tasks.filter((t) => t.routineId === id && t.dueDate).map((t) => t.dueDate!));
  const routineSpawned = (d.routineSpawned ?? []).filter(
    (k) => !(k.startsWith(`${id}@`) && dateOfKey(k) >= today && !kept.has(dateOfKey(k)))
  );
  return { ...d, routines: (d.routines ?? []).map((x) => (x.id === id ? r : x)), tasks, routineSpawned };
}

/** Delete a routine: it stops repeating and its open tasks from today on go too; history stays. */
export function deleteRoutine(d: AppData, id: string, today: string): AppData {
  return {
    ...d,
    routines: (d.routines ?? []).filter((r) => r.id !== id),
    tasks: d.tasks.filter((t) => !isOpenAhead(t, id, today)),
    routineSpawned: (d.routineSpawned ?? []).filter((k) => !k.startsWith(`${id}@`)),
  };
}

/**
 * The owner's starter set (2026-11-14), seeded once by migrate(): «Тренировки: вторник, четверг,
 * суббота, высокий приоритет»; «Английский: среда, высокий приоритет». Fixed ids so two devices
 * seeding before their first sync end up with the same routines, not doubles.
 */
export function starterRoutines(createdAt: string): Routine[] {
  return [
    { id: "routine-training", title: "Тренировка", days: [2, 4, 6], priority: 1, createdAt },
    { id: "routine-english", title: "Английский", days: [3], priority: 1, createdAt },
  ];
}
