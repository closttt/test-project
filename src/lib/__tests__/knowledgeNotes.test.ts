import { describe, it, expect } from "vitest";

import {
  childrenOf,
  subtreeIds,
  pathOf,
  canMoveInto,
  plainText,
  snippet,
  matchesNoteQuery,
  entriesFromFiles,
  type NoteEntry,
} from "@/lib/knowledgeNotes";

const at = "2026-10-01T10:00:00.000Z";
const e = (id: string, kind: NoteEntry["kind"], parentId: string | null, title: string, content = ""): NoteEntry => ({
  id, kind, parentId, title, content, createdAt: at, updatedAt: at,
});

const vault: NoteEntry[] = [
  e("n0", "note", null, "Входящие"),
  e("f1", "folder", null, "Курсы"),
  e("f2", "folder", "f1", "AI"),
  e("n1", "note", "f2", "Урок 2"),
  e("n2", "note", "f2", "Урок 10"),
  e("f3", "folder", null, "Архив"),
];

describe("knowledgeNotes tree", () => {
  it("lists folders first, then notes, in natural name order", () => {
    expect(childrenOf(vault, null).map((x) => x.id)).toEqual(["f3", "f1", "n0"]);
    expect(childrenOf(vault, "f2").map((x) => x.title)).toEqual(["Урок 2", "Урок 10"]);
  });

  it("collects a folder's whole subtree", () => {
    expect([...subtreeIds(vault, "f1")].sort()).toEqual(["f1", "f2", "n1", "n2"]);
  });

  it("builds the folder path of a note", () => {
    expect(pathOf(vault, "n1").map((x) => x.title)).toEqual(["Курсы", "AI"]);
    expect(pathOf(vault, "n0")).toEqual([]);
  });

  it("refuses to move a folder into itself or its descendants, or into a note", () => {
    expect(canMoveInto(vault, "f1", "f2")).toBe(false);
    expect(canMoveInto(vault, "f1", "f1")).toBe(false);
    expect(canMoveInto(vault, "n1", "n0")).toBe(false);
    expect(canMoveInto(vault, "f2", "f3")).toBe(true);
    expect(canMoveInto(vault, "n1", null)).toBe(true);
  });
});

describe("knowledgeNotes text", () => {
  it("strips markdown to plain text", () => {
    expect(plainText("## Идея\n\n- [ ] **сделать** [ссылку](https://x.y)\n> цитата [[Заметка|алиас]]")).toBe("Идея сделать ссылку цитата алиас");
  });

  it("centres the snippet on the hit", () => {
    const md = "a ".repeat(100) + "рекурсивный брифинг" + " b".repeat(100);
    const s = snippet(md, "брифинг", 60);
    expect(s.startsWith("…")).toBe(true);
    expect(s).toContain("брифинг");
  });

  it("matches title and body, case-insensitively", () => {
    const n = e("x", "note", null, "Урок", "Про РЕКУРСИВНЫЙ бриф");
    expect(matchesNoteQuery(n, "рекурсивный")).toBe(true);
    expect(matchesNoteQuery(n, "урок")).toBe(true);
    expect(matchesNoteQuery(n, "нет")).toBe(false);
  });
});

describe("Obsidian import", () => {
  it("recreates the folder structure, reuses existing folders, skips config and non-md", () => {
    const added = entriesFromFiles(vault, [
      { path: "Vault/Курсы/AI/Урок 3.md", content: "# 3\r\ntext" },
      { path: "Vault/Курсы/Новый/Урок 1.md", content: "x" },
      { path: "Vault/.obsidian/app.json", content: "{}" },
      { path: "Vault/img.png", content: "" },
    ], null);
    const notes = added.filter((x) => x.kind === "note");
    const folders = added.filter((x) => x.kind === "folder");
    expect(notes.map((n) => n.title).sort()).toEqual(["Урок 1", "Урок 3"]);
    expect(folders.map((f) => f.title).sort()).toEqual(["AI", "Vault", "Курсы", "Новый"]);
    expect(notes.find((n) => n.title === "Урок 3")!.content).toBe("# 3\ntext");
  });

  it("drops loose files straight into the target folder", () => {
    const added = entriesFromFiles(vault, [{ path: "Заметка.md", content: "hi" }], "f2");
    expect(added).toHaveLength(1);
    expect(added[0].parentId).toBe("f2");
  });
});
