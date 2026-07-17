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
