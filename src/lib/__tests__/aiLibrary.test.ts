import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import { LIBRARY_TOOLS, LIBRARY_TOOL_NAMES, runLibraryTool, describeLibrary } from "@/lib/aiLibrary";
import { fetchLibrary, librarySnapshot, noteTemplate, type LibraryItem } from "@/lib/library";

/**
 * The bulk-capture path: «вот 10 ссылок» must land as one call that unfurls, de-duplicates and
 * fills the notes template. Storage falls back to localStorage here (no Supabase keys in tests),
 * so these run against the real add/update code, not a mock of it.
 */

function stubUnfurl() {
  // /api/unfurl doesn't exist in jsdom — answer it ourselves so the drafts get real titles.
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const target = decodeURIComponent(url.split("url=")[1] ?? "");
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ title: `Заголовок ${target}`, description: "Описание со страницы", image: "https://img/x.png", author: "Автор" }),
    } as unknown as Response;
  }));
}

describe("library tools for the assistant", () => {
  beforeEach(async () => {
    localStorage.clear();
    stubUnfurl();
    // .env.local makes Supabase look configured even here; the stubbed fetch means the first call
    // fails and the module falls back to localStorage for the rest of the run, which is what we
    // want to exercise — the offline path every user has before running the SQL.
    await fetchLibrary().catch(() => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("exposes exactly the three tools, and library_add takes a list", () => {
    expect([...LIBRARY_TOOL_NAMES].sort()).toEqual(["library_add", "library_search", "library_update"]);
    const add = LIBRARY_TOOLS.find((t) => t.function.name === "library_add")!;
    const props = add.function.parameters.properties as Record<string, { type?: string }>;
    expect(props.items.type).toBe("array");
    expect(props.text.type).toBe("string");
  });

  it("adds ten links in one call, pulling titles from the page", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ url: `https://example.com/a${i}` }));
    const res = await runLibraryTool("library_add", { items, tags: ["входящее"] });

    expect(res.resultText).toContain("Добавлено в библиотеку: 10");
    const saved = librarySnapshot();
    expect(saved).toHaveLength(10);
    expect(saved.every((i: LibraryItem) => i.title.startsWith("Заголовок"))).toBe(true);
    expect(saved.every((i: LibraryItem) => i.tags.includes("входящее"))).toBe(true);
    expect(res.toastLabel).toContain("10");
  });

  it("pulls links out of raw text when the model forwards the message", async () => {
    const res = await runLibraryTool("library_add", {
      text: "глянь https://youtube.com/watch?v=1 и ещё https://github.com/foo/bar потом",
    });
    expect(res.resultText).toContain("Добавлено в библиотеку: 2");
    const types = librarySnapshot().map((i) => i.type).sort();
    expect(types).toEqual(["tool", "video"]);
  });

  it("skips URLs already in the library instead of duplicating them", async () => {
    await runLibraryTool("library_add", { items: [{ url: "https://example.com/one" }] });
    const res = await runLibraryTool("library_add", {
      items: [{ url: "https://example.com/one" }, { url: "https://example.com/two" }],
    });
    expect(res.resultText).toContain("Добавлено в библиотеку: 1");
    expect(res.resultText).toContain("Пропущено как уже сохранённое: 1");
    expect(librarySnapshot()).toHaveLength(2);
  });

  it("seeds the per-type notes template, and keeps the user's own notes when given", async () => {
    await runLibraryTool("library_add", {
      items: [{ url: "https://litres.ru/book/1" }, { url: "https://example.com/x", notes: "моя мысль" }],
    });
    const book = librarySnapshot().find((i) => i.type === "book")!;
    expect(book.notes).toBe(noteTemplate("book"));
    expect(librarySnapshot().find((i) => i.url === "https://example.com/x")!.notes).toBe("моя мысль");
  });

  it("undoes the whole batch as one action", async () => {
    const res = await runLibraryTool("library_add", {
      items: [{ url: "https://a.com/1" }, { url: "https://a.com/2" }, { url: "https://a.com/3" }],
    });
    expect(librarySnapshot()).toHaveLength(3);
    res.undoRun!();
    await vi.waitFor(() => expect(librarySnapshot()).toHaveLength(0));
  });

  it("searches, and reports the total when nothing matches", async () => {
    await runLibraryTool("library_add", { items: [{ url: "https://a.com/1", title: "Атомные привычки", type: "book" }] });
    const hit = await runLibraryTool("library_search", { query: "привычки" });
    expect(hit.resultText).toContain("Атомные привычки");
    const miss = await runLibraryTool("library_search", { query: "обсидиан" });
    expect(miss.resultText).toContain("Всего материалов: 1");
  });

  it("updates status by a partial title and can be undone", async () => {
    await runLibraryTool("library_add", { items: [{ url: "https://a.com/1", title: "Атомные привычки", type: "book" }] });
    const res = await runLibraryTool("library_update", { title_query: "атомные", status: "done", add_tags: ["#Прочитано"] });
    expect(res.resultText).toContain("статус → Готово");
    const item = librarySnapshot()[0];
    expect(item.status).toBe("done");
    expect(item.tags).toContain("прочитано");
    res.undoRun!();
    await vi.waitFor(() => expect(librarySnapshot()[0].status).toBe("want"));
  });

  it("asks to disambiguate when several titles match", async () => {
    await runLibraryTool("library_add", {
      items: [
        { url: "https://a.com/1", title: "Курс по React" },
        { url: "https://a.com/2", title: "Курс по Vue" },
      ],
    });
    const res = await runLibraryTool("library_update", { title_query: "курс", status: "doing" });
    expect(res.resultText).toContain("Несколько совпадений");
    expect(librarySnapshot().every((i) => i.status === "want")).toBe(true);
  });

  it("describes the library for the system prompt, including the tag vocabulary", async () => {
    expect(describeLibrary([])).toContain("Библиотека пуста");
    await runLibraryTool("library_add", { items: [{ url: "https://a.com/1", title: "Книга", type: "book" }], tags: ["ии"] });
    const text = describeLibrary();
    expect(text).toContain("Всего материалов: 1");
    expect(text).toContain("#ии");
  });
});
