import { describe, it, expect } from "vitest";
import { todaySubtaskRows, scheduledSubtaskCount } from "@/lib/subtasks";
import { todayStr, addDays } from "@/lib/format";
import type { Task, Subtask } from "@/types";

function sub(id: string, over: Partial<Subtask> = {}): Subtask {
  return { id, title: "sub " + id, done: false, ...over };
}

function task(id: string, subtasks: Subtask[], over: Partial<Task> = {}): Task {
  return {
    id,
    title: "task " + id,
    done: false,
    tags: [],
    important: false,
    priority: 0,
    spentMin: 0,
    links: [],
    comments: [],
    attachments: [],
    recurrence: "none",
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    subtasks,
    ...over,
  } as Task;
}

const TODAY = todayStr();
const YESTERDAY = addDays(new Date(), -1);
const TOMORROW = addDays(new Date(), 1);

describe("todaySubtaskRows", () => {
  it("returns subtasks due today, with their parent", () => {
    const t = task("t1", [sub("s1", { dueDate: TODAY })]);
    const rows = todaySubtaskRows([t]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sub.id).toBe("s1");
    expect(rows[0].parent.id).toBe("t1");
  });

  it("includes overdue subtasks", () => {
    const rows = todaySubtaskRows([task("t1", [sub("s1", { dueDate: YESTERDAY })])]);
    expect(rows).toHaveLength(1);
  });

  it("skips subtasks with no date, future dates, or already done", () => {
    const t = task("t1", [
      sub("none"),
      sub("future", { dueDate: TOMORROW }),
      sub("finished", { dueDate: TODAY, done: true }),
    ]);
    expect(todaySubtaskRows([t])).toEqual([]);
  });

  it("does not surface pieces of a done, archived or snoozed parent", () => {
    const done = task("d", [sub("s", { dueDate: TODAY })], { done: true });
    const archived = task("a", [sub("s", { dueDate: TODAY })], { archivedAt: "2026-01-02T00:00:00.000Z" });
    const snoozed = task("z", [sub("s", { dueDate: TODAY })], { snoozedUntil: TOMORROW });
    expect(todaySubtaskRows([done, archived, snoozed])).toEqual([]);
  });

  it("sorts overdue before today", () => {
    const t = task("t1", [sub("today", { dueDate: TODAY }), sub("late", { dueDate: YESTERDAY })]);
    expect(todaySubtaskRows([t]).map((r) => r.sub.id)).toEqual(["late", "today"]);
  });

  it("collects across several parents", () => {
    const rows = todaySubtaskRows([
      task("t1", [sub("a", { dueDate: TODAY })]),
      task("t2", [sub("b", { dueDate: TODAY })]),
    ]);
    expect(rows).toHaveLength(2);
  });
});

describe("scheduledSubtaskCount", () => {
  it("counts only open subtasks that have a date", () => {
    const t = task("t1", [
      sub("a", { dueDate: TODAY }),
      sub("b", { dueDate: TOMORROW }),
      sub("c"),
      sub("d", { dueDate: TODAY, done: true }),
    ]);
    expect(scheduledSubtaskCount(t)).toBe(2);
  });
});
