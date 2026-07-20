import { describe, it, expect, beforeEach } from "vitest";
import { loadLinks, addLinks, removeLink, groupLinksByDomain } from "@/lib/knowledgeLinks";

beforeEach(() => localStorage.clear());

describe("addLinks", () => {
  it("saves a single pasted link with its domain", () => {
    const links = addLinks([], "https://example.com/article");
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://example.com/article");
    expect(links[0].domain).toBe("example.com");
    expect(loadLinks()).toHaveLength(1);
  });

  it("saves every link when a whole block is pasted at once", () => {
    const links = addLinks([], "https://a.com\nhttps://b.org/x  https://c.net");
    expect(links.map((l) => l.domain)).toEqual(["a.com", "b.org", "c.net"]);
  });

  it("skips URLs that are already saved", () => {
    const first = addLinks([], "https://a.com");
    const second = addLinks(first, "https://a.com");
    expect(second).toHaveLength(1);
  });

  it("adds newest first", () => {
    const first = addLinks([], "https://old.com");
    const second = addLinks(first, "https://new.com");
    expect(second[0].domain).toBe("new.com");
  });

  it("applies a title only when exactly one link was pasted", () => {
    expect(addLinks([], "https://a.com", "Моя ссылка")[0].title).toBe("Моя ссылка");
    const many = addLinks([], "https://a.com https://b.com", "Общий");
    expect(many.every((l) => l.title === undefined)).toBe(true);
  });

  it("returns the list unchanged when the input has no links", () => {
    const existing = addLinks([], "https://a.com");
    expect(addLinks(existing, "просто текст без ссылок")).toBe(existing);
  });
});

describe("removeLink", () => {
  it("removes by id and persists", () => {
    const links = addLinks([], "https://a.com");
    const after = removeLink(links, links[0].id);
    expect(after).toHaveLength(0);
    expect(loadLinks()).toHaveLength(0);
  });
});

describe("groupLinksByDomain", () => {
  it("groups by domain, biggest group first", () => {
    const links = addLinks([], "https://a.com/1 https://b.com/1 https://a.com/2");
    const groups = groupLinksByDomain(links);
    expect(groups[0].domain).toBe("a.com");
    expect(groups[0].links).toHaveLength(2);
    expect(groups[1].domain).toBe("b.com");
  });
});
