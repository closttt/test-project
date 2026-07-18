import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { parseNaturalInput } from "@/lib/nlp";

// Pinned to a known Wednesday so weekday/offset assertions are deterministic.
const FIXED_NOW = new Date(2026, 6, 15, 12, 0, 0); // Wed 2026-07-15, local time

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseNaturalInput — Cyrillic date words", () => {
  // Regression test: JS `\b` never matches next to Cyrillic letters, so a naive `\bзавтра\b`
  // silently fails to match at all — the date word was neither parsed nor stripped from the title.
  it("parses 'завтра' and strips it from the title", () => {
    const r = parseNaturalInput("написать завтра");
    expect(r.dueDate).toBe("2026-07-16");
    expect(r.title).toBe("написать");
  });

  it("parses 'сегодня' and strips it from the title", () => {
    const r = parseNaturalInput("написать сегодня клиенту");
    expect(r.dueDate).toBe("2026-07-15");
    expect(r.title).toBe("написать клиенту");
  });

  it("parses 'послезавтра' and strips it from the title", () => {
    const r = parseNaturalInput("написать послезавтра");
    expect(r.dueDate).toBe("2026-07-17");
    expect(r.title).toBe("написать");
  });

  it("does not confuse 'завтра' inside 'послезавтра'", () => {
    const r = parseNaturalInput("написать послезавтра");
    // Should hit the послезавтра branch (+2), not fall through to завтра (+1).
    expect(r.dueDate).toBe("2026-07-17");
  });

  it("parses a weekday name ('в пятницу') to its next occurrence", () => {
    const r = parseNaturalInput("позвонить в пятницу");
    expect(r.dueDate).toBe("2026-07-17"); // next Friday after Wed 2026-07-15
    expect(r.title).toBe("позвонить");
  });

  it("still parses a date word at the very start/end of the string", () => {
    expect(parseNaturalInput("завтра позвонить").dueDate).toBe("2026-07-16");
    expect(parseNaturalInput("позвонить завтра").dueDate).toBe("2026-07-16");
  });
});

describe("parseNaturalInput — tags and importance (unaffected by the \\b bug)", () => {
  it("extracts #tags and strips them", () => {
    const r = parseNaturalInput("сделать #работа отчёт");
    expect(r.tags).toEqual(["работа"]);
    expect(r.title).toBe("сделать отчёт");
  });

  it("extracts !важно and marks important", () => {
    const r = parseNaturalInput("сделать !важно отчёт");
    expect(r.important).toBe(true);
    expect(r.title).toBe("сделать отчёт");
  });
});

describe("parseNaturalInput — time → remindAt", () => {
  it("parses 'в HH:MM' and combines with today when no date word is present", () => {
    const r = parseNaturalInput("позвонить в 15:00");
    expect(r.remindAt).toBe("2026-07-15T15:00");
    expect(r.title).toBe("позвонить");
  });

  it("combines a parsed time with a parsed date word", () => {
    const r = parseNaturalInput("написать завтра в 9:30");
    expect(r.dueDate).toBe("2026-07-16");
    expect(r.remindAt).toBe("2026-07-16T09:30");
    expect(r.title).toBe("написать");
  });

  it("accepts a bare HH:MM without 'в'", () => {
    const r = parseNaturalInput("созвон 9:05");
    expect(r.remindAt).toBe("2026-07-15T09:05");
  });

  it("leaves remindAt undefined when no time is present", () => {
    expect(parseNaturalInput("написать завтра").remindAt).toBeUndefined();
  });
});

describe("parseNaturalInput — duration → estimateMin", () => {
  it("parses minutes-only shorthand '~30м'", () => {
    const r = parseNaturalInput("собрать макет ~30м");
    expect(r.estimateMin).toBe(30);
    expect(r.title).toBe("собрать макет");
  });

  it("parses the spelled-out 'мин'", () => {
    expect(parseNaturalInput("созвон ~45мин").estimateMin).toBe(45);
  });

  it("parses hours-only '~2ч'", () => {
    expect(parseNaturalInput("ревью ~2ч").estimateMin).toBe(120);
  });

  it("parses combined hours+minutes '~1ч30м'", () => {
    const r = parseNaturalInput("сделать отчёт ~1ч30м");
    expect(r.estimateMin).toBe(90);
    expect(r.title).toBe("сделать отчёт");
  });

  it("leaves estimateMin undefined when no duration hint is present", () => {
    expect(parseNaturalInput("написать завтра").estimateMin).toBeUndefined();
  });
});

describe("parseNaturalInput — recurrence words", () => {
  it("parses 'каждый день' as daily", () => {
    const r = parseNaturalInput("зарядка каждый день");
    expect(r.recurrence).toBe("daily");
    expect(r.title).toBe("зарядка");
  });

  it("parses 'по будням' as weekdays", () => {
    expect(parseNaturalInput("стендап по будням").recurrence).toBe("weekdays");
  });

  it("parses 'каждую неделю' as weekly", () => {
    expect(parseNaturalInput("отчёт каждую неделю").recurrence).toBe("weekly");
  });

  it("parses 'каждый месяц' as monthly", () => {
    expect(parseNaturalInput("инвойс каждый месяц").recurrence).toBe("monthly");
  });

  it("leaves recurrence undefined when no recurrence word is present", () => {
    expect(parseNaturalInput("написать завтра").recurrence).toBeUndefined();
  });
});

describe("parseNaturalInput — combined hints", () => {
  it("parses date + time + duration + tag + importance together, title fully cleaned", () => {
    const r = parseNaturalInput("созвон с клиентом завтра в 15:00 ~30м #клиент !важно");
    expect(r.dueDate).toBe("2026-07-16");
    expect(r.remindAt).toBe("2026-07-16T15:00");
    expect(r.estimateMin).toBe(30);
    expect(r.tags).toEqual(["клиент"]);
    expect(r.important).toBe(true);
    expect(r.title).toBe("созвон с клиентом");
  });
});
