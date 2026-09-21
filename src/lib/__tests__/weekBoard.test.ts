import { describe, it, expect } from "vitest";
import { weekStart, weekDays, weekRangeLabel, weekColumnOf, BACKLOG_KEY } from "@/lib/weekBoard";
import type { Task } from "@/types";

function task(over: Partial<Task>): Task {
  return {
    id: "t", title: "t", done: false, important: false, priority: 0, links: [], comments: [],
    recurrence: "none", spentMin: 0, tags: [], subtasks: [], attachments: [], order: 0, createdAt: "", ...over,
  };
}

// 2026-09-23 is a Wednesday.
const WED = "2026-09-23";

describe("weekStart", () => {
  it("walks back to Monday", () => {
    expect(weekStart(0, true, WED)).toBe("2026-09-21");
    expect(weekStart(0, true, "2026-09-21")).toBe("2026-09-21"); // Monday stays put
    expect(weekStart(0, true, "2026-09-27")).toBe("2026-09-21"); // Sunday belongs to the week before
  });
  it("walks back to Sunday when the week starts there", () => {
    expect(weekStart(0, false, WED)).toBe("2026-09-20");
    expect(weekStart(0, false, "2026-09-20")).toBe("2026-09-20");
  });
  it("offsets by whole weeks, across a month boundary", () => {
    expect(weekStart(1, true, WED)).toBe("2026-09-28");
    expect(weekStart(-1, true, WED)).toBe("2026-09-14");
    expect(weekStart(2, true, WED)).toBe("2026-10-05");
  });
});

describe("weekDays", () => {
  const days = weekDays(0, true, WED);
  it("is Monday → Sunday with dates and Russian names", () => {
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.label)).toEqual([
      "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье",
    ]);
    expect(days[0].date).toBe("2026-09-21");
    expect(days[6].date).toBe("2026-09-27");
    expect(days[0].short).toBe("21 сент.");
  });
  it("marks today, and only today", () => {
    expect(days.filter((d) => d.isToday).map((d) => d.date)).toEqual([WED]);
    expect(weekDays(1, true, WED).some((d) => d.isToday)).toBe(false);
  });
  it("starts on Sunday when asked", () => {
    expect(weekDays(0, false, WED)[0].label).toBe("Воскресенье");
  });
});

describe("weekRangeLabel", () => {
  it("drops the repeated month, keeps it across a boundary", () => {
    expect(weekRangeLabel(weekDays(0, true, WED))).toBe("21–27 сент.");
    expect(weekRangeLabel(weekDays(1, true, WED))).toBe("28 сент.–4 окт.");
  });
});

describe("weekColumnOf", () => {
  const days = weekDays(0, true, WED);

  it("puts a dateless task in the backlog", () => {
    expect(weekColumnOf(task({}), days, WED)).toBe(BACKLOG_KEY);
  });
  it("puts a dated task on its own day", () => {
    expect(weekColumnOf(task({ dueDate: "2026-09-25" }), days, WED)).toBe("2026-09-25");
  });
  it("collects overdue tasks in today's column instead of hiding them", () => {
    expect(weekColumnOf(task({ dueDate: "2026-09-10" }), days, WED)).toBe(WED);
    expect(weekColumnOf(task({ dueDate: "2026-09-20" }), days, WED)).toBe(WED); // the day before this week
  });
  it("hides tasks from other weeks, and does not fake an overdue pile on those weeks", () => {
    expect(weekColumnOf(task({ dueDate: "2026-10-08" }), days, WED)).toBeNull();
    const next = weekDays(1, true, WED);
    expect(weekColumnOf(task({ dueDate: "2026-09-10" }), next, WED)).toBeNull();
    expect(weekColumnOf(task({ dueDate: "2026-09-30" }), next, WED)).toBe("2026-09-30");
  });
});
