import { isToday, isOverdue } from "@/lib/format";
import { isSnoozed } from "@/lib/taskGrouping";
import type { Subtask, Task } from "@/types";

/**
 * Subtasks that carry their own due date behave like small tasks: they land in «Задачи на сегодня»
 * individually, so a parent with 20 subtasks doesn't dump the whole thing into today — only the
 * pieces actually scheduled for today (or overdue) show up.
 */
export interface SubtaskRow {
  parent: Task;
  sub: Subtask;
}

/**
 * Open subtasks due today or overdue, from tasks that are themselves open and not snoozed.
 * Sorted overdue-first, then by date — same "what needs doing" ordering as the task list.
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
  return rows.sort((a, b) => (a.sub.dueDate ?? "").localeCompare(b.sub.dueDate ?? ""));
}

/** How many open subtasks of this task are scheduled (have a date) — used for the row hint. */
export function scheduledSubtaskCount(task: Task): number {
  return task.subtasks.filter((s) => !s.done && s.dueDate).length;
}
