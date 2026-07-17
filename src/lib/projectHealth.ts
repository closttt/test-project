import { isOverdue } from "@/lib/format";
import type { Task } from "@/types";

/**
 * Derived project health — a Linear-style «на треке / риск / сорвано» signal computed from
 * the project's tasks, deliberately SEPARATE from the manually-set project priority.
 * Priority answers "how much do I care"; health answers "is this actually slipping".
 */
export type HealthLevel = "on-track" | "at-risk" | "off-track" | "done" | "empty";

export const HEALTH_META: Record<Exclude<HealthLevel, "empty">, { label: string; dot: string; text: string }> = {
  "on-track": { label: "На треке", dot: "bg-success", text: "text-success" },
  "at-risk": { label: "Риск", dot: "bg-amber-400", text: "text-amber-400" },
  "off-track": { label: "Сорвано", dot: "bg-risk", text: "text-risk" },
  "done": { label: "Готов", dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

/** Health from a project's (non-archived) tasks. 1-2 overdue → риск, 3+ → сорвано. */
export function projectHealth(tasks: Task[]): HealthLevel {
  if (tasks.length === 0) return "empty";
  const open = tasks.filter((t) => !t.done);
  if (open.length === 0) return "done";
  const overdue = open.filter((t) => isOverdue(t.dueDate)).length;
  if (overdue >= 3) return "off-track";
  if (overdue >= 1) return "at-risk";
  return "on-track";
}
