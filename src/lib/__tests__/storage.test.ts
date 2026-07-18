import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { loadData, saveData, migrate, createDebouncedSaver } from "@/lib/storage";
import { seedData } from "@/lib/seed";
import type { AppData } from "@/types";

const STORAGE_KEY = "crm-taskmanager-data-v1";
const CORRUPT_BACKUP_KEY = "crm-taskmanager-data-v1-corrupt-backup";

beforeEach(() => {
  localStorage.clear();
});

describe("saveData / loadData round trip", () => {
  it("loads back exactly what was saved", () => {
    const data = seedData();
    saveData(data);
    const loaded = loadData();
    expect(loaded).not.toBeNull();
    expect(loaded!.tasks.length).toBe(data.tasks.length);
    expect(loaded!.settings).toEqual(data.settings);
  });

  it("returns null when nothing has been saved yet", () => {
    expect(loadData()).toBeNull();
  });
});

describe("loadData — malformed record handling", () => {
  it("returns null (not a throw) on unparseable JSON, and backs up the raw string", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    const result = loadData();
    expect(result).toBeNull();
    expect(localStorage.getItem(CORRUPT_BACKUP_KEY)).toBe("{not valid json");
  });

  it("returns null (not a throw) when migrate() itself throws on an unexpected shape, and backs up the raw string", () => {
    // `tasks` as a non-array makes migrate()'s `(data.tasks ?? []).filter(...)` throw
    // "filter is not a function" instead of silently coercing.
    const raw = JSON.stringify({ tasks: "not-an-array", settings: { trashPurgeDays: 30 } });
    localStorage.setItem(STORAGE_KEY, raw);
    const result = loadData();
    expect(result).toBeNull();
    expect(localStorage.getItem(CORRUPT_BACKUP_KEY)).toBe(raw);
  });

  it("saveData does not throw on a value that fails to serialize (e.g. a circular reference)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => saveData(circular as unknown as AppData)).not.toThrow();
    expect(saveData(circular as unknown as AppData)).toBe(false);
  });
});

describe("migrate — trash auto-purge", () => {
  function baseData(): AppData {
    const d = seedData();
    d.tasks = [];
    d.projects = [];
    d.notes = [];
    d.settings.trashPurgeDays = 30;
    return d;
  }

  it("drops an archived task older than the purge window", () => {
    const d = baseData();
    const old = new Date();
    old.setDate(old.getDate() - 40);
    d.tasks = [{ ...seedData().tasks[0], id: "t1", archivedAt: old.toISOString() }];
    const migrated = migrate(d);
    expect(migrated.tasks.find((t) => t.id === "t1")).toBeUndefined();
  });

  it("keeps an archived task within the purge window", () => {
    const d = baseData();
    const recent = new Date();
    recent.setDate(recent.getDate() - 5);
    d.tasks = [{ ...seedData().tasks[0], id: "t1", archivedAt: recent.toISOString() }];
    const migrated = migrate(d);
    expect(migrated.tasks.find((t) => t.id === "t1")).toBeDefined();
  });

  it("keeps a task with a malformed archivedAt instead of treating it as expired", () => {
    // Regression test: `new Date("garbage").getTime()` is NaN, and `NaN >= cutoff` is false —
    // the old code treated that as "not kept" and silently dropped the record.
    const d = baseData();
    d.tasks = [{ ...seedData().tasks[0], id: "t1", archivedAt: "not-a-real-date" }];
    const migrated = migrate(d);
    expect(migrated.tasks.find((t) => t.id === "t1")).toBeDefined();
  });

  it("keeps a task with no archivedAt at all", () => {
    const d = baseData();
    d.tasks = [{ ...seedData().tasks[0], id: "t1", archivedAt: undefined }];
    const migrated = migrate(d);
    expect(migrated.tasks.find((t) => t.id === "t1")).toBeDefined();
  });
});

describe("createDebouncedSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not write to localStorage until the delay elapses", () => {
    const saver = createDebouncedSaver(400);
    saver.schedule(seedData());
    expect(loadData()).toBeNull();
    vi.advanceTimersByTime(399);
    expect(loadData()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(loadData()).not.toBeNull();
  });

  it("collapses rapid-fire schedule() calls (e.g. a drag-reorder) into a single write of the LATEST value", () => {
    const saver = createDebouncedSaver(400);
    const spy = vi.spyOn(Storage.prototype, "setItem"); // calls through to the real implementation
    for (let i = 0; i < 20; i++) {
      const d = seedData();
      d.settings.riskAttentionDays = i; // distinguishing marker for the final value
      saver.schedule(d);
      vi.advanceTimersByTime(50); // well under the 400ms delay each time — never lets it fire
    }
    expect(spy).not.toHaveBeenCalled(); // every call re-armed the timer, nothing written yet
    vi.advanceTimersByTime(400);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(loadData()!.settings.riskAttentionDays).toBe(19); // the LAST scheduled value, not the first
    spy.mockRestore();
  });

  it("flush() writes immediately, bypassing the delay", () => {
    const saver = createDebouncedSaver(5000);
    const d = seedData();
    saver.schedule(d);
    expect(loadData()).toBeNull();
    saver.flush();
    expect(loadData()).not.toBeNull();
  });

  it("flush() prevents the still-pending timer from firing a second, redundant write", () => {
    const saver = createDebouncedSaver(400);
    const d = seedData();
    d.settings.riskAttentionDays = 7;
    saver.schedule(d);
    saver.flush();
    // A later schedule()+no-flush should be the only thing the still-running fake timers can fire.
    const d2 = seedData();
    d2.settings.riskAttentionDays = 42;
    saver.schedule(d2);
    vi.advanceTimersByTime(400);
    expect(loadData()!.settings.riskAttentionDays).toBe(42); // not overwritten back by a stale timer
  });

  it("flush() with nothing scheduled is a no-op — does not throw, does not write", () => {
    const saver = createDebouncedSaver(400);
    expect(() => saver.flush()).not.toThrow();
    expect(loadData()).toBeNull();
    saver.flush(); // calling twice in a row must also be safe
    expect(loadData()).toBeNull();
  });

  it("simulates the tab-close scenario: a rapid edit right before close must not be lost", () => {
    // This is the exact regression AUDIT.md flagged debouncing as risky for — a debounced write
    // in flight when the tab closes silently drops the user's last edit unless something flushes it.
    const saver = createDebouncedSaver(400);
    const edited = seedData();
    edited.settings.riskAttentionDays = 99;
    saver.schedule(edited); // e.g. the last frame of a drag, 400ms write still pending…
    // …tab closes before the timer would have fired — caller MUST flush on pagehide/visibilitychange.
    saver.flush();
    expect(loadData()!.settings.riskAttentionDays).toBe(99);
  });
});
