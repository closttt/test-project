import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveCategory,
  allCategories,
  groupByCategory,
  setCategoryOverride,
  loadCategoryOverrides,
  UNSORTED,
} from "@/lib/knowledgeCategory";
import type { KnowledgeCard } from "@/types";

function card(id: string, tags: string[]): KnowledgeCard {
  return { id, title: "c" + id, tags, createdAt: "2026-01-01T00:00:00.000Z" };
}

beforeEach(() => localStorage.clear());

describe("resolveCategory", () => {
  it("prefers an explicit override", () => {
    expect(resolveCategory(card("1", ["дизайн"]), { "1": "Инструменты" })).toBe("Инструменты");
  });
  it("falls back to the first tag", () => {
    expect(resolveCategory(card("1", ["дизайн", "ux"]), {})).toBe("дизайн");
  });
  it("falls back to «Без раздела» when there are no tags", () => {
    expect(resolveCategory(card("1", []), {})).toBe(UNSORTED);
  });
});

describe("allCategories", () => {
  it("lists distinct categories sorted, with «Без раздела» last", () => {
    const cards = [card("1", ["дизайн"]), card("2", []), card("3", ["анимация"]), card("4", ["дизайн"])];
    expect(allCategories(cards, {})).toEqual(["анимация", "дизайн", UNSORTED]);
  });
});

describe("groupByCategory", () => {
  it("groups cards under their resolved category, dropping empty groups", () => {
    const cards = [card("1", ["дизайн"]), card("2", ["анимация"]), card("3", ["дизайн"])];
    const groups = groupByCategory(cards, {});
    expect(groups.map((g) => g.category)).toEqual(["анимация", "дизайн"]);
    expect(groups.find((g) => g.category === "дизайн")!.cards.map((c) => c.id)).toEqual(["1", "3"]);
  });

  it("respects overrides when grouping", () => {
    const cards = [card("1", ["дизайн"]), card("2", ["дизайн"])];
    const groups = groupByCategory(cards, { "2": "Инструменты" });
    // Alphabetical (Russian): «дизайн» (д) before «Инструменты» (и); the point is card 2 moved out.
    expect(groups.map((g) => g.category)).toEqual(["дизайн", "Инструменты"]);
    expect(groups.find((g) => g.category === "Инструменты")!.cards.map((c) => c.id)).toEqual(["2"]);
  });
});

describe("setCategoryOverride persistence", () => {
  it("stores an override and reads it back", () => {
    const next = setCategoryOverride({}, "1", "Инструменты");
    expect(next["1"]).toBe("Инструменты");
    expect(loadCategoryOverrides()).toEqual({ "1": "Инструменты" });
  });

  it("clears the override when given null/empty (falls back to tag again)", () => {
    let map = setCategoryOverride({}, "1", "Инструменты");
    map = setCategoryOverride(map, "1", null);
    expect(map["1"]).toBeUndefined();
    expect(loadCategoryOverrides()).toEqual({});
    expect(resolveCategory(card("1", ["дизайн"]), map)).toBe("дизайн");
  });

  it("trims whitespace and treats a blank string as a clear", () => {
    expect(setCategoryOverride({}, "1", "  Инструменты  ")["1"]).toBe("Инструменты");
    expect(setCategoryOverride({ "1": "x" }, "1", "   ")["1"]).toBeUndefined();
  });
});
