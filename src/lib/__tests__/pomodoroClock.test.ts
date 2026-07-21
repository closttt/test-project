import { describe, it, expect, beforeEach } from "vitest";

import {
  remainingSec,
  elapsedSec,
  creditedMinutes,
  loadPomodoro,
  savePomodoro,
  clearPomodoro,
  type PomodoroSnapshot,
} from "@/lib/pomodoroClock";

const NOW = new Date("2026-07-20T12:00:00.000Z").getTime();

function snap(over: Partial<PomodoroSnapshot> = {}): PomodoroSnapshot {
  return {
    phase: "work",
    running: true,
    endsAt: NOW + 25 * 60 * 1000,
    pausedRemaining: 25 * 60,
    total: 25 * 60,
    round: 0,
    startedAt: "2026-07-20T12:00:00.000Z",
    ...over,
  };
}

describe("remainingSec", () => {
  it("counts down against the wall clock, not against ticks", () => {
    const s = snap();
    expect(remainingSec(s, NOW)).toBe(25 * 60);
    // Ten minutes of a minimised window: no tick ran, yet ten minutes are gone.
    expect(remainingSec(s, NOW + 10 * 60_000)).toBe(15 * 60);
  });

  it("never goes below zero, however long the tab was away", () => {
    expect(remainingSec(snap(), NOW + 5 * 3600_000)).toBe(0);
  });

  it("uses the frozen value while paused, so time away does not drain it", () => {
    const s = snap({ running: false, endsAt: null, pausedRemaining: 600 });
    expect(remainingSec(s, NOW)).toBe(600);
    expect(remainingSec(s, NOW + 60 * 60_000)).toBe(600);
  });
});

describe("elapsedSec", () => {
  it("is the mirror of what is left", () => {
    expect(elapsedSec(snap(), NOW + 3 * 60_000)).toBe(3 * 60);
  });

  it("is capped at the phase length", () => {
    expect(elapsedSec(snap(), NOW + 99 * 60_000)).toBe(25 * 60);
  });
});

describe("creditedMinutes", () => {
  it("rounds to the nearest minute", () => {
    expect(creditedMinutes(600)).toBe(10);
    expect(creditedMinutes(100)).toBe(2);
  });

  it("never rounds real focus time down to nothing", () => {
    expect(creditedMinutes(5)).toBe(1);
    expect(creditedMinutes(29)).toBe(1);
  });

  it("credits nothing when no time passed", () => {
    expect(creditedMinutes(0)).toBe(0);
    expect(creditedMinutes(-5)).toBe(0);
  });
});

describe("persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a running session", () => {
    const s = snap();
    savePomodoro(s);
    expect(loadPomodoro()).toEqual(s);
  });

  it("keeps the deadline, so a reload resumes at the right second", () => {
    savePomodoro(snap());
    expect(remainingSec(loadPomodoro()!, NOW + 60_000)).toBe(24 * 60);
  });

  it("stores nothing for an idle timer", () => {
    savePomodoro(snap({ phase: "idle" }));
    expect(loadPomodoro()).toBeNull();
  });

  it("drops a malformed or truncated snapshot instead of trusting it", () => {
    localStorage.setItem("crm-pomodoro-v1", "{not json");
    expect(loadPomodoro()).toBeNull();
    localStorage.setItem("crm-pomodoro-v1", JSON.stringify({ phase: "work" }));
    expect(loadPomodoro()).toBeNull();
    localStorage.setItem("crm-pomodoro-v1", JSON.stringify(snap({ phase: "nonsense" as never })));
    expect(loadPomodoro()).toBeNull();
  });

  it("clears on demand", () => {
    savePomodoro(snap());
    clearPomodoro();
    expect(loadPomodoro()).toBeNull();
  });
});
