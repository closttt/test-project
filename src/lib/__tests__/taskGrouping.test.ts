import { describe, it, expect } from "vitest";

import { bucketOf, groupTasksByTime, isSnoozed } from "@/lib/taskGrouping";
import { addDays } from "@/lib/format";
import type { Task } from "@/types";

function task(over: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: "t",
    done: false,
    important: false,
    priority: 0,
    links: [],
    comments: [],
    attachments: [],
    recurrence: "none",
    spentMin: 0,
    tags: [],
    subtasks: [],
    order: 0,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

// Uses the same local-day helper as the implementation (taskGrouping.ts itself calls `addDays`) —
// a bare `d.toISOString().slice(0, 10)` reads the UTC day, which silently diverges from the
// implementation's correct local-day math within a few hours of local midnight.
function offset(days: number): string {
  return addDays(new Date(), days);
}

describe("bucketOf", () => {
  it("no due date → nodate", () => {
    expect(bucketOf(task())).toBe("nodate");
  });

  it("past → overdue, today → today, tomorrow → tomorrow", () => {
    expect(bucketOf(task({ dueDate: offset(-1) }))).toBe("overdue");
    expect(bucketOf(task({ dueDate: offset(0) }))).toBe("today");
    expect(bucketOf(task({ dueDate: offset(1) }))).toBe("tomorrow");
  });

  it("2..7 days out → week; the 7-day edge stays in week", () => {
    expect(bucketOf(task({ dueDate: offset(2) }))).toBe("week");
    expect(bucketOf(task({ dueDate: offset(7) }))).toBe("week");
  });

  it("beyond 7 days → later (the «Позже» bucket)", () => {
    expect(bucketOf(task({ dueDate: offset(8) }))).toBe("later");
    expect(bucketOf(task({ dueDate: offset(60) }))).toBe("later");
  });
});

describe("groupTasksByTime", () => {
  it("returns sections in fixed order and skips empty ones", () => {
    const groups = groupTasksByTime([
      task({ dueDate: offset(30) }),  // later
      task({ dueDate: offset(-1) }),  // overdue
      task({ dueDate: offset(0) }),   // today
    ]);
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "later"]);
  });

  it("sorts by due date, then by priority within the same day", () => {
    const soonest = task({ dueDate: offset(3) });
    const lowPr = task({ dueDate: offset(5), priority: 3 });
    const highPr = task({ dueDate: offset(5), priority: 1 });
    const [week] = groupTasksByTime([lowPr, soonest, highPr]);
    expect(week.items.map((t) => t.id)).toEqual([soonest.id, highPr.id, lowPr.id]);
  });

  it("labels the far-future bucket «Позже»", () => {
    const [g] = groupTasksByTime([task({ dueDate: offset(20) })]);
    expect(g.label).toBe("Позже");
  });

  // Regression: groupTasksByTime previously ignored `snoozedUntil` entirely — a task explicitly
  // postponed via the snooze menu still cluttered "Сегодня"/"Просрочено" in every date-bucketed
  // view except the Tasks page's own smart lists (which had their own separate isSnoozed check).
  it("excludes a snoozed task from every bucket, even if its due date is today/overdue", () => {
    const snoozedToday = task({ dueDate: offset(0), snoozedUntil: offset(3) });
    const snoozedOverdue = task({ dueDate: offset(-2), snoozedUntil: offset(1) });
    const visible = task({ dueDate: offset(0) });
    const groups = groupTasksByTime([snoozedToday, snoozedOverdue, visible]);
    const allIds = groups.flatMap((g) => g.items.map((t) => t.id));
    expect(allIds).toEqual([visible.id]);
  });

  it("re-includes a task once its snooze date has passed", () => {
    const noLongerSnoozed = task({ dueDate: offset(0), snoozedUntil: offset(-1) });
    const groups = groupTasksByTime([noLongerSnoozed]);
    expect(groups.flatMap((g) => g.items.map((t) => t.id))).toEqual([noLongerSnoozed.id]);
  });
});

describe("isSnoozed", () => {
  it("is true only while snoozedUntil is strictly in the future", () => {
    expect(isSnoozed(task({ snoozedUntil: offset(1) }))).toBe(true);
    expect(isSnoozed(task({ snoozedUntil: offset(0) }))).toBe(false);
    expect(isSnoozed(task({ snoozedUntil: offset(-1) }))).toBe(false);
    expect(isSnoozed(task({}))).toBe(false);
  });
});
