import { describe, it, expect } from "vitest";

import { projectHealth } from "@/lib/projectHealth";
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

/** Yesterday / tomorrow as YYYY-MM-DD, so tests don't rot as the calendar moves. */
function offset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("projectHealth", () => {
  it("no tasks → empty (badge renders nothing)", () => {
    expect(projectHealth([])).toBe("empty");
  });

  it("every task done → done, even if they were overdue", () => {
    expect(projectHealth([task({ done: true, dueDate: offset(-5) })])).toBe("done");
  });

  it("open tasks, none overdue → on-track", () => {
    expect(projectHealth([task({ dueDate: offset(3) }), task()])).toBe("on-track");
  });

  it("1-2 overdue → at-risk", () => {
    expect(projectHealth([task({ dueDate: offset(-1) })])).toBe("at-risk");
    expect(projectHealth([task({ dueDate: offset(-1) }), task({ dueDate: offset(-2) })])).toBe("at-risk");
  });

  it("3+ overdue → off-track", () => {
    const overdue = [offset(-1), offset(-2), offset(-3)].map((dueDate) => task({ dueDate }));
    expect(projectHealth(overdue)).toBe("off-track");
  });

  it("done tasks never count as overdue", () => {
    // Three long-overdue but CLOSED tasks + one healthy open one — must not read as off-track.
    const tasks = [
      task({ done: true, dueDate: offset(-9) }),
      task({ done: true, dueDate: offset(-8) }),
      task({ done: true, dueDate: offset(-7) }),
      task({ dueDate: offset(2) }),
    ];
    expect(projectHealth(tasks)).toBe("on-track");
  });
});
