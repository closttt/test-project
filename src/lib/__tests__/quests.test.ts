import { describe, it, expect } from "vitest";

import { questsForDay, questDone, QUEST_POOL, seasonProgress } from "@/lib/quests";
import type { AppData } from "@/types";
import { DEFAULT_SETTINGS, DEFAULT_GAMIFICATION } from "@/types";

function appData(over: Partial<AppData> = {}): AppData {
  return {
    clients: [],
    projects: [],
    tasks: [],
    notes: [],
    meetings: [],
    completionLog: {},
    pomodoroSessions: [],
    settings: DEFAULT_SETTINGS,
    gamification: DEFAULT_GAMIFICATION,
    ...over,
  } as AppData;
}

describe("questsForDay", () => {
  it("is stable for a given day — the set can't reshuffle mid-day", () => {
    expect(questsForDay("2026-07-15").map((q) => q.id)).toEqual(
      questsForDay("2026-07-15").map((q) => q.id)
    );
  });

  it("returns 3 distinct quests from the pool", () => {
    const ids = questsForDay("2026-07-15").map((q) => q.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    ids.forEach((id) => expect(QUEST_POOL.some((q) => q.id === id)).toBe(true));
  });

  it("rotates between days", () => {
    const week = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17"]
      .map((d) => questsForDay(d).map((q) => q.id).join("|"));
    // Not every day must differ from every other, but the week can't be one frozen set.
    expect(new Set(week).size).toBeGreaterThan(1);
  });
});

describe("questDone", () => {
  const closeThree = QUEST_POOL.find((q) => q.id === "close-3")!;

  it("false below target, true at target", () => {
    const today = "2026-07-15";
    expect(questDone(closeThree, appData({ completionLog: { [today]: 2 } }), today)).toBe(false);
    expect(questDone(closeThree, appData({ completionLog: { [today]: 3 } }), today)).toBe(true);
  });

  it("only counts the given day", () => {
    const today = "2026-07-15";
    const data = appData({ completionLog: { "2026-07-14": 9 } });
    expect(questDone(closeThree, data, today)).toBe(false);
  });
});

describe("seasonProgress", () => {
  it("counts only the current month and scales the target to its length", () => {
    const now = new Date(2026, 6, 15); // July 2026 — 31 days
    const data = appData({
      completionLog: { "2026-07-01": 4, "2026-07-02": 2, "2026-06-30": 100 },
    });
    const s = seasonProgress(data, now);
    expect(s.done).toBe(6);          // June's 100 must not leak in
    expect(s.target).toBe(31 * 2);
    expect(s.key).toBe("2026-07");
  });

  it("February gets a smaller target than July — the month-length scaling works", () => {
    const feb = seasonProgress(appData(), new Date(2026, 1, 10));
    const jul = seasonProgress(appData(), new Date(2026, 6, 10));
    expect(feb.target).toBeLessThan(jul.target);
  });
});
