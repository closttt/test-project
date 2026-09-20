import { describe, it, expect } from "vitest";
import { placeTask, placeInColumn } from "@/lib/taskOrder";
import type { Task } from "@/types";

function task(id: string, order: number): Task {
  return {
    id, title: id, done: false, important: false, priority: 0, links: [], comments: [],
    recurrence: "none", spentMin: 0, tags: [], subtasks: [], attachments: [], order, createdAt: "",
  };
}

const tasks = [task("a", 0), task("b", 1), task("c", 2), task("d", 3)];

describe("placeTask", () => {
  it("moves before an anchor", () => {
    expect(placeTask(tasks, "d", { beforeId: "b" })).toEqual(["a", "d", "b", "c"]);
  });
  it("moves after an anchor", () => {
    expect(placeTask(tasks, "a", { afterId: "c" })).toEqual(["b", "c", "a", "d"]);
  });
  it("appends to the end", () => {
    expect(placeTask(tasks, "b", { end: true })).toEqual(["a", "c", "d", "b"]);
  });
  it("ignores unknown ids and self-anchors", () => {
    expect(placeTask(tasks, "zzz", { beforeId: "a" })).toEqual(["a", "b", "c", "d"]);
    expect(placeTask(tasks, "a", { beforeId: "zzz" })).toEqual(["a", "b", "c", "d"]);
    expect(placeTask(tasks, "a", { beforeId: "a" })).toEqual(["a", "b", "c", "d"]);
  });
});

describe("placeInColumn", () => {
  it("drops above the card below it", () => {
    expect(placeInColumn(tasks, "d", ["d", "b"], "b")).toEqual(["a", "d", "b", "c"]);
  });
  it("drops at the bottom of a column: goes after the column's last card", () => {
    // column shows [a, d] in some other order; dragging d to the bottom → after a globally
    expect(placeInColumn(tasks, "d", ["a", "d"], null)).toEqual(["a", "d", "b", "c"]);
  });
  it("dropping into an empty column sends the task to the global end", () => {
    expect(placeInColumn(tasks, "a", ["a"], null)).toEqual(["b", "c", "d", "a"]);
  });
});
