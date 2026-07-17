import { describe, it, expect } from "vitest";

import { bucketOf, groupTasksByTime } from "@/lib/taskGrouping";
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

function offset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
});
