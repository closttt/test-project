import { describe, it, expect, beforeEach, vi } from "vitest";

// Force the localStorage path: without this the suite picks up a real VITE_SUPABASE_URL from
// .env.local and starts talking to the live database — tests must never depend on the network.
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: () => null }));

import {
  fetchShelf,
  addLinks,
  removeLink,
  moveLink,
  addSection,
  renameSection,
  removeSection,
  linksOfSection,
  parseNewLinks,
  positionBetween,
  nextPosition,
  type LinkShelf,
} from "@/lib/knowledgeLinks";

// Supabase isn't configured in tests, so every call below exercises the localStorage path —
// the same code the app runs on a machine with no keys set.
beforeEach(() => localStorage.clear());

const EMPTY: LinkShelf = { sections: [], links: [] };

describe("parseNewLinks", () => {
  it("saves a single pasted link with its domain", () => {
    const drafts = parseNewLinks("https://example.com/article", []);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].url).toBe("https://example.com/article");
    expect(drafts[0].domain).toBe("example.com");
  });

  it("takes every link when a whole block is pasted at once", () => {
    const drafts = parseNewLinks("https://a.com\nhttps://b.org/x  https://c.net", []);
    expect(drafts.map((l) => l.domain)).toEqual(["a.com", "b.org", "c.net"]);
  });

  it("skips URLs that are already saved", async () => {
    const shelf = await addLinks(EMPTY, "https://a.com");
    expect(parseNewLinks("https://a.com", shelf.links)).toHaveLength(0);
  });

  it("applies a title only when exactly one link was pasted", () => {
    expect(parseNewLinks("https://a.com", [], { title: "Моя ссылка" })[0].title).toBe("Моя ссылка");
    const many = parseNewLinks("https://a.com https://b.com", [], { title: "Общий" });
    expect(many.every((l) => l.title === undefined)).toBe(true);
  });

  it("returns nothing when the input has no links", () => {
    expect(parseNewLinks("просто текст без ссылок", [])).toEqual([]);
  });
});

describe("positionBetween", () => {
  it("returns the midpoint between two neighbours", () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
  });

  it("goes before the first and after the last", () => {
    expect(positionBetween(undefined, 1000)).toBeLessThan(1000);
    expect(positionBetween(1000, undefined)).toBeGreaterThan(1000);
  });

  it("handles an empty list", () => {
    expect(positionBetween(undefined, undefined)).toBeGreaterThan(0);
  });

  it("keeps splitting without collapsing onto a neighbour", () => {
    let lo = 1000;
    const hi = 2000;
    for (let i = 0; i < 10; i++) {
      const mid = positionBetween(lo, hi);
      expect(mid).toBeGreaterThan(lo);
      expect(mid).toBeLessThan(hi);
      lo = mid;
    }
  });
});

describe("nextPosition", () => {
  it("appends after the current maximum", () => {
    expect(nextPosition([{ position: 10 }, { position: 30 }])).toBeGreaterThan(30);
  });
});

describe("addLinks / removeLink", () => {
  it("persists across a reload", async () => {
    const shelf = await addLinks(EMPTY, "https://a.com");
    expect(shelf.links).toHaveLength(1);
    expect((await fetchShelf()).links).toHaveLength(1);
  });

  it("adds new links unsorted (no section)", async () => {
    const shelf = await addLinks(EMPTY, "https://a.com");
    expect(shelf.links[0].sectionId).toBeNull();
  });

  it("returns the shelf unchanged when nothing parses", async () => {
    const shelf = await addLinks(EMPTY, "https://a.com");
    expect(await addLinks(shelf, "текст без ссылок")).toBe(shelf);
  });

  it("removes by id and persists", async () => {
    const shelf = await addLinks(EMPTY, "https://a.com");
    const after = await removeLink(shelf, shelf.links[0].id);
    expect(after.links).toHaveLength(0);
    expect((await fetchShelf()).links).toHaveLength(0);
  });
});

describe("sections", () => {
  it("creates a section and moves a link into it", async () => {
    let shelf = await addLinks(EMPTY, "https://a.com");
    shelf = await addSection(shelf, "Анимации");
    const sectionId = shelf.sections[0].id;
    shelf = await moveLink(shelf, shelf.links[0].id, sectionId, 1000);

    expect(linksOfSection(shelf.links, sectionId)).toHaveLength(1);
    expect(linksOfSection(shelf.links, null)).toHaveLength(0);
    // …and it survives a reload.
    expect(linksOfSection((await fetchShelf()).links, sectionId)).toHaveLength(1);
  });

  it("orders links inside a section by position", async () => {
    let shelf = await addLinks(EMPTY, "https://a.com https://b.com https://c.com");
    const [a, b, c] = shelf.links;
    shelf = await moveLink(shelf, c.id, null, positionBetween(undefined, a.position));
    expect(linksOfSection(shelf.links, null).map((l) => l.domain)).toEqual([
      c.domain,
      a.domain,
      b.domain,
    ]);
  });

  it("renames a section", async () => {
    let shelf = await addSection(EMPTY, "Шрифты");
    shelf = await renameSection(shelf, shelf.sections[0].id, "Типографика");
    expect(shelf.sections[0].name).toBe("Типографика");
  });

  it("ignores a blank section name", async () => {
    expect(await addSection(EMPTY, "   ")).toBe(EMPTY);
  });

  it("keeps the links when its section is deleted — they fall back to unsorted", async () => {
    let shelf = await addLinks(EMPTY, "https://a.com");
    shelf = await addSection(shelf, "Анимации");
    const sectionId = shelf.sections[0].id;
    shelf = await moveLink(shelf, shelf.links[0].id, sectionId, 1000);

    shelf = await removeSection(shelf, sectionId);
    expect(shelf.sections).toHaveLength(0);
    expect(shelf.links).toHaveLength(1);
    expect(linksOfSection(shelf.links, null)).toHaveLength(1);
  });
});
