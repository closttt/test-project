import { describe, it, expect } from "vitest";
import {
  snap,
  startFromOffset,
  resizeDuration,
  durationForTask,
  formatClock,
  formatRange,
  formatDuration,
  totalMinutes,
  layoutDay,
  dayShort,
  defaultTemplates,
  autoPlaceDay,
  isAutoBlock,
  DAY_MIN,
} from "@/lib/planner";
import { migrate } from "@/lib/storage";
import { seedData } from "@/lib/seed";
import type { AppData, PlanBlock } from "@/types";

function block(id: string, startMin: number, durationMin: number): PlanBlock {
  return { id, date: "2026-10-05", startMin, durationMin, title: id, color: "blue" };
}

describe("snapping a pointer to the grid", () => {
  it("rounds to the nearest half hour", () => {
    expect(snap(14)).toBe(0);
    expect(snap(16)).toBe(30);
    expect(snap(451)).toBe(450);
  });
  it("keeps the whole block inside the day", () => {
    expect(startFromOffset(-40, 60)).toBe(0);
    expect(startFromOffset(23 * 60 + 50, 60)).toBe(23 * 60);
    expect(startFromOffset(7 * 60 + 10, 90)).toBe(7 * 60);
  });
});

describe("stretching a block", () => {
  it("grows and shrinks in half-hour steps — 1,5 / 2 / 2,5 / 3 hours", () => {
    expect(resizeDuration(480, 60, 30)).toBe(90);
    expect(resizeDuration(480, 60, 62)).toBe(120);
    expect(resizeDuration(480, 60, 88)).toBe(150);
    expect(resizeDuration(480, 60, -10)).toBe(60);
  });
  it("never shrinks below half an hour or runs past midnight", () => {
    expect(resizeDuration(480, 60, -500)).toBe(30);
    expect(resizeDuration(22 * 60, 60, 600)).toBe(120);
  });
});

describe("task length", () => {
  it("rounds the estimate up to a slot, an hour when there is none", () => {
    expect(durationForTask(undefined)).toBe(60);
    expect(durationForTask(20)).toBe(30);
    expect(durationForTask(45)).toBe(60);
    expect(durationForTask(100)).toBe(120);
  });
});

describe("labels", () => {
  it("formats clock, range and length the way they are said", () => {
    expect(formatClock(450)).toBe("07:30");
    expect(formatRange(450, 90)).toBe("07:30–09:00");
    expect(formatRange(23 * 60, 60)).toBe("23:00–24:00");
    expect(formatDuration(30)).toBe("30 мин");
    expect(formatDuration(60)).toBe("1 ч");
    expect(formatDuration(90)).toBe("1,5 ч");
    expect(formatDuration(210)).toBe("3,5 ч");
  });
  it("names the weekday from a local date", () => {
    expect(dayShort("2026-10-05")).toBe("Пн");
    expect(dayShort("2026-10-11")).toBe("Вс");
  });
  it("sums a day", () => {
    expect(totalMinutes([block("a", 0, 60), block("b", 60, 90)])).toBe(150);
  });
});

describe("layoutDay", () => {
  it("gives a lone block the full width", () => {
    expect(layoutDay([block("a", 60, 60)])).toEqual([{ block: block("a", 60, 60), lane: 0, lanes: 1 }]);
  });
  it("puts overlapping blocks side by side", () => {
    const out = layoutDay([block("a", 60, 120), block("b", 90, 60)]);
    expect(out.map((p) => [p.block.id, p.lane, p.lanes])).toEqual([["a", 0, 2], ["b", 1, 2]]);
  });
  it("reuses a lane once it is free, and back-to-back blocks don't overlap", () => {
    const out = layoutDay([block("a", 0, 60), block("b", 30, 60), block("c", 60, 30)]);
    expect(out.map((p) => [p.block.id, p.lane, p.lanes])).toEqual([["a", 0, 2], ["b", 1, 2], ["c", 0, 2]]);
    const apart = layoutDay([block("x", 0, 60), block("y", 60, 60)]);
    expect(apart.map((p) => p.lanes)).toEqual([1, 1]);
  });
});

describe("planner data", () => {
  it("starts with the three routines the owner named", () => {
    expect(defaultTemplates().map((t) => t.title)).toEqual(["Тренировка", "Английский", "Созвон"]);
    expect(seedData().planTemplates).toHaveLength(3);
  });
  it("backfills old saves without touching ones that already have a planner", () => {
    const old = seedData() as AppData;
    delete old.planBlocks;
    delete old.planTemplates;
    const migrated = migrate(old);
    expect(migrated.planBlocks).toEqual([]);
    expect(migrated.planTemplates).toHaveLength(3);
    const kept = migrate({ ...seedData(), planTemplates: [] });
    expect(kept.planTemplates).toEqual([]);
  });
});

describe("autoPlaceDay — kanban tasks mirrored onto the grid", () => {
  const t = (taskId: string, durationMin: number, priority = 0) => ({ taskId, title: taskId, durationMin, priority });
  it("stacks the day's tasks from 09:00 in the given order", () => {
    const out = autoPlaceDay("2026-10-05", [t("a", 60, 1), t("b", 90, 2), t("c", 30)], []);
    expect(out.map((b) => [b.taskId, b.startMin, b.durationMin])).toEqual([["a", 540, 60], ["b", 600, 90], ["c", 690, 30]]);
    expect(out[0]).toMatchObject({ id: "auto:a", color: "rose", date: "2026-10-05" });
    expect(isAutoBlock(out[0])).toBe(true);
  });
  it("flows around what is already planned", () => {
    const out = autoPlaceDay("2026-10-05", [t("a", 60), t("b", 60)], [{ startMin: 540, durationMin: 90 }]);
    expect(out.map((b) => b.startMin)).toEqual([630, 690]);
  });
  it("falls back to 09:00 rather than hiding a task that doesn't fit", () => {
    const out = autoPlaceDay("2026-10-05", [t("a", 60)], [{ startMin: 540, durationMin: DAY_MIN - 540 }]);
    expect(out[0].startMin).toBe(540);
  });
});
