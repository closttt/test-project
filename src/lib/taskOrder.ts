import type { Task } from "@/types";

/**
 * Pure helpers for manual task ordering. `Task.order` is one GLOBAL sequence — every list and every
 * kanban column sorts by it — so "move this card above that one" is always "re-sequence the whole
 * list with the dragged task slotted in". Doing it globally keeps every other task's relative
 * order intact no matter which view the drag happened in.
 */

export type PlaceTarget =
  | { beforeId: string }
  | { afterId: string }
  /** Append to the very end of the global order. */
  | { end: true };

/** Returns the full ordered id list with `draggedId` moved to sit at `target`. Unknown ids → unchanged order. */
export function placeTask(tasks: Task[], draggedId: string, target: PlaceTarget): string[] {
  const ordered = [...tasks].sort((a, b) => a.order - b.order).map((t) => t.id);
  if (!ordered.includes(draggedId)) return ordered;
  const without = ordered.filter((id) => id !== draggedId);
  if ("end" in target) return [...without, draggedId];
  const anchor = "beforeId" in target ? target.beforeId : target.afterId;
  if (anchor === draggedId) return ordered;
  const idx = without.indexOf(anchor);
  if (idx === -1) return ordered;
  without.splice("beforeId" in target ? idx : idx + 1, 0, draggedId);
  return without;
}

/**
 * Kanban drop: `columnIds` is the column's visible order AFTER the drop (dragged already inside),
 * `beforeId` the card now directly below it (null = dropped at the bottom). Translates that into a
 * global placement: before the card below, or after the last other card of the column, or — for an
 * otherwise empty column — at the end of everything.
 */
export function placeInColumn(tasks: Task[], draggedId: string, columnIds: string[], beforeId: string | null): string[] {
  if (beforeId && beforeId !== draggedId) return placeTask(tasks, draggedId, { beforeId });
  const others = columnIds.filter((id) => id !== draggedId);
  const last = others[others.length - 1];
  return last ? placeTask(tasks, draggedId, { afterId: last }) : placeTask(tasks, draggedId, { end: true });
}
