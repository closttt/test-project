import { describe, it, expect, beforeEach } from "vitest";

import { loadData, saveData, migrate } from "@/lib/storage";
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
