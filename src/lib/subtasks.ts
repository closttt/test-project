import { isToday, isOverdue } from "@/lib/format";
import { isSnoozed } from "@/lib/taskGrouping";
import type { Priority, Subtask, Task } from "@/types";

/**
 * Subtasks that carry their own due date behave like small tasks: they land in «Задачи на сегодня»
 * individually, so a parent with 20 subtasks doesn't dump the whole thing into today — only the
 * pieces actually scheduled for today (or overdue) show up.
 */
export interface SubtaskRow {
  parent: Task;
  sub: Subtask;
}

/** Priority of a subtask, defaulting old data (no field) to «без приоритета». */
export function subPriority(sub: Subtask): Priority {
  return sub.priority ?? 0;
}

/** Sort key for priority: 1 (высокий) first, 0 (без приоритета) last — same order as the task list. */
function priorityRank(sub: Subtask): number {
  const p = subPriority(sub);
  return p === 0 ? 4 : p;
}

/**
 * Open subtasks due today or overdue, from tasks that are themselves open and not snoozed.
 * Sorted overdue-first, then by date, then by priority — same "what needs doing" ordering as the
 * task list, so a high-priority piece doesn't hide under low-priority ones sharing its date.
 */
export function todaySubtaskRows(tasks: Task[]): SubtaskRow[] {
  const rows: SubtaskRow[] = [];
  for (const parent of tasks) {
    // A done or snoozed parent shouldn't surface its pieces — the whole thing is settled/deferred.
    if (parent.done || parent.archivedAt || isSnoozed(parent)) continue;
    for (const sub of parent.subtasks) {
      if (sub.done || !sub.dueDate) continue;
      if (isToday(sub.dueDate) || isOverdue(sub.dueDate)) rows.push({ parent, sub });
    }
  }
  return rows.sort((a, b) => {
    const byDate = (a.sub.dueDate ?? "").localeCompare(b.sub.dueDate ?? "");
    if (byDate !== 0) return byDate;
    return priorityRank(a.sub) - priorityRank(b.sub);
  });
}

/** How many open subtasks of this task are scheduled (have a date) — used for the row hint. */
export function scheduledSubtaskCount(task: Task): number {
  return task.subtasks.filter((s) => !s.done && s.dueDate).length;
}

/**
 * Open subtasks whose reminder has come due — the subtask equivalent of a task's `remindAt`.
 * Same guards as `todaySubtaskRows`: a settled or deferred parent stays quiet.
 */
export function dueSubtaskReminders(tasks: Task[], now: number, staleMs: number): SubtaskRow[] {
  const rows: SubtaskRow[] = [];
  for (const parent of tasks) {
    if (parent.done || parent.archivedAt || isSnoozed(parent)) continue;
    for (const sub of parent.subtasks) {
      if (sub.done || !sub.remindAt) continue;
      const at = new Date(sub.remindAt).getTime();
      if (Number.isNaN(at)) continue;
      if (at <= now && now - at < staleMs) rows.push({ parent, sub });
    }
  }
  return rows;
}
