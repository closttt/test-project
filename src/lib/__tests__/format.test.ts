import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { todayStr, isToday, localDayStr, addDays } from "@/lib/format";

describe("todayStr / isToday — local day, not UTC day", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays on the same local calendar day even when UTC has already rolled to the next day", () => {
    // 2026-07-15 23:30 in a UTC+3 zone == 2026-07-15 20:30 UTC — still the 15th either way,
    // so this alone wouldn't catch the bug; the real regression is the opposite direction below.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 23, 30, 0));
    expect(todayStr()).toBe("2026-07-15");
    expect(isToday("2026-07-15")).toBe(true);
  });

  it("does not roll over to tomorrow just after local midnight", () => {
    // The historical bug used `toISOString().slice(0,10)`, which reads the UTC calendar day.
    // At 00:30 local in any positive UTC-offset zone, UTC is still on the PREVIOUS day — so the
    // buggy version would have returned yesterday's date here instead of today's.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 0, 30, 0));
    expect(todayStr()).toBe("2026-07-15");
  });

  it("localDayStr matches getFullYear/getMonth/getDate, not toISOString", () => {
    const d = new Date(2026, 0, 1, 1, 0, 0); // Jan 1, 01:00 local
    expect(localDayStr(d)).toBe("2026-01-01");
  });
});

describe("addDays", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("subtracts days with a negative n", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("accepts a Date object as the base", () => {
    expect(addDays(new Date(2026, 6, 15), 1)).toBe("2026-07-16");
  });
});
