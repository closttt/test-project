import type { Task } from "@/types";

/** Still-open tasks that `task` is waiting on (blocks/waits-for relationship). */
export function blockingTasks(task: Task, all: Task[]): Task[] {
  const ids = task.blockedBy ?? [];
  if (ids.length === 0) return [];
  const set = new Set(ids);
  return all.filter((t) => set.has(t.id) && !t.done);
}

export function isBlocked(task: Task, all: Task[]): boolean {
  return blockingTasks(task, all).length > 0;
}

/** Tasks that list `task` as a blocker (the reverse direction — "what does this unblock"). */
export function blockedByThis(task: Task, all: Task[]): Task[] {
  return all.filter((t) => (t.blockedBy ?? []).includes(task.id));
}
