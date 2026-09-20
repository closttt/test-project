import { describe, it, expect } from "vitest";
import { detectType, matchesLibraryQuery, sortLibrary, libraryTagCounts, newDraft, type LibraryItem } from "@/lib/library";

function item(over: Partial<LibraryItem>): LibraryItem {
  return {
    id: over.id ?? "x", type: "article", title: "t", notes: "", tags: [], status: "want", favorite: false,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...over,
  };
}

describe("detectType", () => {
  it("guesses from the host", () => {
    expect(detectType("https://www.youtube.com/watch?v=abc")).toBe("video");
    expect(detectType("https://youtu.be/abc")).toBe("video");
    expect(detectType("https://open.spotify.com/episode/1")).toBe("podcast");
    expect(detectType("https://www.litres.ru/book/123")).toBe("book");
    expect(detectType("https://www.coursera.org/learn/ml")).toBe("course");
    expect(detectType("https://github.com/foo/bar")).toBe("tool");
    expect(detectType("https://habr.com/ru/articles/1/")).toBe("article");
  });
  it("defaults to book without a link (a book is the common thing with no URL)", () => {
    expect(detectType(undefined)).toBe("book");
  });
});

describe("matchesLibraryQuery", () => {
  const i = item({ title: "Атомные привычки", author: "Джеймс Клир", tags: ["продуктивность"], notes: "глава 3 про среду", domain: "litres.ru" });
  it("searches title, author, tags, notes and domain, case-insensitively", () => {
    expect(matchesLibraryQuery(i, "атомные")).toBe(true);
    expect(matchesLibraryQuery(i, "клир")).toBe(true);
    expect(matchesLibraryQuery(i, "продукт")).toBe(true);
    expect(matchesLibraryQuery(i, "среду")).toBe(true);
    expect(matchesLibraryQuery(i, "litres")).toBe(true);
    expect(matchesLibraryQuery(i, "обсидиан")).toBe(false);
  });
  it("empty query matches everything", () => {
    expect(matchesLibraryQuery(i, "  ")).toBe(true);
  });
});

describe("sortLibrary", () => {
  const a = item({ id: "a", title: "Б", createdAt: "2026-01-02T00:00:00Z", rating: 3 });
  const b = item({ id: "b", title: "А", createdAt: "2026-01-03T00:00:00Z" });
  const c = item({ id: "c", title: "В", createdAt: "2026-01-01T00:00:00Z", rating: 5 });
  it("newest / oldest / title / rating", () => {
    expect(sortLibrary([a, b, c], "newest").map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(sortLibrary([a, b, c], "oldest").map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(sortLibrary([a, b, c], "title").map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(sortLibrary([a, b, c], "rating").map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
});

describe("libraryTagCounts / newDraft", () => {
  it("counts tags most-used first", () => {
    const items = [item({ tags: ["x", "y"] }), item({ tags: ["x"] })];
    expect(libraryTagCounts(items)).toEqual([["x", 2], ["y", 1]]);
  });
  it("pre-fills url, domain and type from pasted text", () => {
    const d = newDraft("смотри https://www.youtube.com/watch?v=1 потом");
    expect(d.url).toBe("https://www.youtube.com/watch?v=1");
    expect(d.domain).toBe("youtube.com");
    expect(d.type).toBe("video");
    expect(d.status).toBe("want");
  });
});
