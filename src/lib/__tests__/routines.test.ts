import { describe, expect, it } from "vitest";

import type { AppData } from "@/types";
import { addRoutine, daysLabel, deleteRoutine, isoWeekday, spawnRoutineTasks, spawnWindow, starterRoutines, updateRoutine } from "@/lib/routines";

const base = (over: Partial<AppData> = {}): AppData =>
  ({ tasks: [], routines: starterRoutines("2026-11-14T00:00:00Z"), ...over }) as unknown as AppData;
let n = 0;
const id = () => `t${++n}`;
// 2026-11-14 is a Saturday.
const SAT = "2026-11-14";

describe("routines", () => {
  it("knows weekdays and the window", () => {
    expect(isoWeekday(SAT)).toBe(6);
    expect(isoWeekday("2026-11-15")).toBe(7);
    expect(spawnWindow(SAT)).toEqual(["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(daysLabel([6, 2, 4])).toBe("Вт · Чт · Сб");
    expect(daysLabel([1, 2, 3, 4, 5])).toBe("Будни");
  });

  it("spawns today and ahead only, once", () => {
    const d = spawnRoutineTasks(base(), SAT, id);
    const got = d.tasks.map((t) => `${t.title}@${t.dueDate}`).sort();
    expect(got).toEqual(["Английский@2026-11-18", "Тренировка@2026-11-14", "Тренировка@2026-11-17", "Тренировка@2026-11-19", "Тренировка@2026-11-21"]);
    expect(d.tasks.every((t) => t.priority === 1 && !t.done)).toBe(true);
    expect(spawnRoutineTasks(d, SAT, id)).toBe(d);
  });

  it("does not bring back a day deleted by hand", () => {
    const d = spawnRoutineTasks(base(), SAT, id);
    const gone = { ...d, tasks: d.tasks.filter((t) => t.dueDate !== "2026-11-17") };
    expect(spawnRoutineTasks(gone, SAT, id).tasks.some((t) => t.dueDate === "2026-11-17")).toBe(false);
  });

  it("fills the next week when the day turns", () => {
    const d = spawnRoutineTasks(base(), SAT, id);
    const mon = spawnRoutineTasks(d, "2026-11-23", id);
    expect(mon.tasks.filter((t) => t.dueDate! >= "2026-11-23").map((t) => t.dueDate).sort()).toEqual(["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-28", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-05"]);
  });

  it("edit moves open tasks ahead, keeps done ones", () => {
    let d = spawnRoutineTasks(base(), SAT, id);
    d = { ...d, tasks: d.tasks.map((t) => (t.dueDate === SAT ? { ...t, done: true } : t)) };
    d = updateRoutine(d, "routine-training", { days: [1, 6], title: "Зал" }, SAT);
    d = spawnRoutineTasks(d, SAT, id);
    const tr = d.tasks.filter((t) => t.routineId === "routine-training").map((t) => `${t.title}@${t.dueDate}${t.done ? "✓" : ""}`).sort();
    expect(tr).toEqual(["Зал@2026-11-16", "Зал@2026-11-21", "Тренировка@2026-11-14✓"]);
  });

  it("delete stops repeating and clears open tasks ahead", () => {
    let d = spawnRoutineTasks(base(), SAT, id);
    d = { ...d, tasks: d.tasks.map((t) => (t.dueDate === SAT ? { ...t, done: true } : t)) };
    d = deleteRoutine(d, "routine-training", SAT);
    d = spawnRoutineTasks(d, SAT, id);
    expect(d.tasks.filter((t) => t.routineId === "routine-training").map((t) => t.dueDate)).toEqual([SAT]);
    expect(d.routines!.map((r) => r.id)).toEqual(["routine-english"]);
  });

  it("a new routine starts from today", () => {
    let d = addRoutine(base({ routines: [] }), { title: "Лонг", days: [5, 7], priority: 2 }, "r1");
    d = spawnRoutineTasks(d, SAT, id);
    expect(d.tasks.map((t) => t.dueDate).sort()).toEqual(["2026-11-15", "2026-11-20", "2026-11-22"]);
  });
});
