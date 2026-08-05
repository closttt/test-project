import { describe, it, expect } from "vitest";

import { decideSync, countEntries, isPlausibleAppData, describeSyncError, remoteMovedOn } from "@/lib/cloudSync";
import { DEFAULT_SETTINGS, DEFAULT_GAMIFICATION, type AppData } from "@/types";

function state(over: Partial<AppData> = {}): AppData {
  return {
    clients: [],
    students: [],
    projects: [],
    tasks: [],
    notes: [],
    meetings: [],
    settings: DEFAULT_SETTINGS,
    completionLog: {},
    gamification: DEFAULT_GAMIFICATION,
    pomodoroSessions: [],
    ...over,
  };
}

/** n throwaway task-shaped objects — only the count matters to the guard being tested. */
const tasks = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}` })) as AppData["tasks"];

const NEWER = "2026-08-05T12:00:00.000Z";
const OLDER = "2026-08-05T10:00:00.000Z";

describe("countEntries", () => {
  it("counts the content-bearing collections", () => {
    expect(countEntries(state())).toBe(0);
    expect(countEntries(state({ tasks: tasks(3) }))).toBe(3);
  });

  it("treats a missing state as empty rather than throwing", () => {
    expect(countEntries(null)).toBe(0);
    expect(countEntries(undefined)).toBe(0);
  });
});

describe("isPlausibleAppData", () => {
  it("accepts a real state", () => {
    expect(isPlausibleAppData(state())).toBe(true);
  });

  it("rejects junk that could otherwise overwrite the app", () => {
    expect(isPlausibleAppData(null)).toBe(false);
    expect(isPlausibleAppData("{}")).toBe(false);
    expect(isPlausibleAppData({})).toBe(false);
    expect(isPlausibleAppData({ tasks: [], projects: [] })).toBe(false);
    // Right keys, wrong types — a half-written row must not pass.
    expect(isPlausibleAppData({ tasks: {}, projects: [], notes: [], meetings: [], settings: {} })).toBe(false);
  });
});

describe("decideSync", () => {
  it("seeds an empty cloud from this device", () => {
    const d = decideSync({ local: state({ tasks: tasks(2) }), remote: null, remoteUpdatedAt: null });
    expect(d).toEqual({ action: "push", reason: "empty-remote" });
  });

  it("pushes when the cloud holds nothing newer than we last saw", () => {
    const d = decideSync({
      local: state({ tasks: tasks(2) }),
      remote: state({ tasks: tasks(2) }),
      remoteUpdatedAt: OLDER,
      lastSeenRemoteAt: OLDER,
    });
    expect(d.action).toBe("push");
  });

  it("pulls when another device wrote something newer", () => {
    const d = decideSync({
      local: state({ tasks: tasks(2) }),
      remote: state({ tasks: tasks(5) }),
      remoteUpdatedAt: NEWER,
      lastSeenRemoteAt: OLDER,
    });
    expect(d).toEqual({ action: "pull", reason: "remote-newer" });
  });

  it("pulls on a first sync against an existing cloud (nothing seen yet)", () => {
    const d = decideSync({
      local: state(),
      remote: state({ tasks: tasks(4) }),
      remoteUpdatedAt: NEWER,
    });
    expect(d.action).toBe("pull");
  });

  // The guard that protects the user's data — the single most important rule in this module.
  it("refuses to adopt a newer-but-emptier cloud copy", () => {
    const d = decideSync({
      local: state({ tasks: tasks(40) }),
      remote: state({ tasks: tasks(1) }),
      remoteUpdatedAt: NEWER,
      lastSeenRemoteAt: OLDER,
    });
    expect(d).toEqual({
      action: "conflict",
      reason: "remote-would-lose-data",
      localCount: 40,
      remoteCount: 1,
    });
  });

  it("refuses an empty cloud copy over a full local one", () => {
    const d = decideSync({
      local: state({ tasks: tasks(12) }),
      remote: state(),
      remoteUpdatedAt: NEWER,
      lastSeenRemoteAt: OLDER,
    });
    expect(d.action).toBe("conflict");
  });

  it("still pulls when the counts merely tie", () => {
    const d = decideSync({
      local: state({ tasks: tasks(3) }),
      remote: state({ notes: [{ id: "n1" }, { id: "n2" }, { id: "n3" }] as AppData["notes"] }),
      remoteUpdatedAt: NEWER,
      lastSeenRemoteAt: OLDER,
    });
    expect(d.action).toBe("pull");
  });

  it("skips a corrupt cloud row instead of applying it", () => {
    const d = decideSync({
      local: state({ tasks: tasks(2) }),
      remote: { nonsense: true },
      remoteUpdatedAt: NEWER,
      lastSeenRemoteAt: OLDER,
    });
    expect(d).toEqual({ action: "skip", reason: "remote-invalid" });
  });
});

// The check that stops a tab left open on one device from overwriting work done on another.
describe("remoteMovedOn", () => {
  it("flags a cloud row written after this device last synced", () => {
    expect(remoteMovedOn(NEWER, OLDER)).toBe(true);
  });

  it("stays quiet when the cloud is exactly where we left it", () => {
    expect(remoteMovedOn(OLDER, OLDER)).toBe(false);
  });

  it("stays quiet on a first sync (nothing seen yet) and on an empty cloud", () => {
    expect(remoteMovedOn(NEWER, undefined)).toBe(false);
    expect(remoteMovedOn(null, OLDER)).toBe(false);
  });
});

describe("describeSyncError", () => {
  it("explains a missing table as a pending migration", () => {
    const msg = describeSyncError(new Error("Could not find the table 'public.app_state' in the schema cache"));
    expect(msg).toContain("app_state.sql");
  });

  it("passes other failures through", () => {
    expect(describeSyncError(new Error("network down"))).toBe("network down");
  });
});
