import { isOverdue, isToday, todayStr, addDays } from "@/lib/format";
import type { Task } from "@/types";

/**
 * Time-based sections for task lists — Things/TickTick-style buckets with a dedicated
 * «Позже» section. Pure and reusable so every list surface groups the same way.
 */
export type TimeBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "nodate";

export interface TaskGroup {
  key: TimeBucket;
  label: string;
  /** HSL token ref for the section accent dot (via var()). */
  accent: string;
  items: Task[];
}

const BUCKET_META: Record<TimeBucket, { label: string; accent: string }> = {
  overdue: { label: "Просрочено", accent: "hsl(var(--risk))" },
  today: { label: "Сегодня", accent: "hsl(var(--brand))" },
  tomorrow: { label: "Завтра", accent: "hsl(var(--brand))" },
  week: { label: "На этой неделе", accent: "hsl(var(--muted-foreground))" },
  later: { label: "Позже", accent: "hsl(var(--muted-foreground))" },
  nodate: { label: "Без срока", accent: "hsl(var(--muted-foreground))" },
};

const ORDER: TimeBucket[] = ["overdue", "today", "tomorrow", "week", "later", "nodate"];

function offset(days: number): string {
  return addDays(new Date(), days);
}

/** Anything with a date and a priority can be bucketed — tasks and meetings alike. */
export interface TimeGroupable {
  dueDate?: string;
  priority: number;
}

/** Which time bucket a dated item belongs to (done items are never bucketed — caller filters). */
export function bucketOfDate(dueDate?: string): TimeBucket {
  if (!dueDate) return "nodate";
  if (isOverdue(dueDate)) return "overdue";
  if (isToday(dueDate)) return "today";
  const tomorrow = offset(1);
  if (dueDate === tomorrow) return "tomorrow";
  const weekEnd = offset(7);
  if (dueDate > tomorrow && dueDate <= weekEnd) return "week";
  return "later"; // strictly beyond 7 days out
}

export function bucketOf(task: Task): TimeBucket {
  return bucketOfDate(task.dueDate);
}

/**
 * Group dated items into ordered, non-empty time sections. Within each section they're
 * sorted by date then priority so the soonest / most-important float up.
 *
 * Generic on purpose: the Tasks page feeds it BOTH tasks and meetings, so a meeting lands in
 * «Сегодня» next to the tasks due today instead of living in a separate world.
 */
export function groupByTime<T extends TimeGroupable>(
  items: T[]
): { key: TimeBucket; label: string; accent: string; items: T[] }[] {
  const byBucket = new Map<TimeBucket, T[]>();
  for (const it of items) {
    const b = bucketOfDate(it.dueDate);
    const arr = byBucket.get(b) ?? [];
    arr.push(it);
    byBucket.set(b, arr);
  }
  const rank: Record<number, number> = { 1: 0, 2: 1, 3: 2, 0: 3 };
  return ORDER.filter((k) => (byBucket.get(k)?.length ?? 0) > 0).map((key) => ({
    key,
    label: BUCKET_META[key].label,
    accent: BUCKET_META[key].accent,
    items: byBucket.get(key)!.sort((a, b) => {
      const da = a.dueDate ?? todayStr();
      const db = b.dueDate ?? todayStr();
      if (da !== db) return da.localeCompare(db);
      return rank[a.priority] - rank[b.priority];
    }),
  }));
}

export function groupTasksByTime(tasks: Task[]): TaskGroup[] {
  return groupByTime(tasks);
}
