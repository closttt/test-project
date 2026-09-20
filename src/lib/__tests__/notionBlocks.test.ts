import { describe, it, expect } from "vitest";

import { markdownToBlocks, richText, chunkBlocks } from "@/lib/notionBlocks";

describe("markdownToBlocks", () => {
  it("maps the block types our markdown renderer knows", () => {
    const md = [
      "# Title",
      "",
      "Plain paragraph",
      "continues here.",
      "",
      "- bullet",
      "* star bullet",
      "1. one",
      "2) two",
      "- [ ] open",
      "- [x] done",
      "> quoted",
      "---",
      "```ts",
      "const a = 1;",
      "```",
      "#### deep heading",
    ].join("\n");
    const types = markdownToBlocks(md).map((b) => b.type);
    expect(types).toEqual([
      "heading_1", "paragraph", "bulleted_list_item", "bulleted_list_item", "numbered_list_item",
      "numbered_list_item", "to_do", "to_do", "quote", "divider", "code", "heading_3",
    ]);
  });

  it("joins consecutive lines into one paragraph and keeps to-do state", () => {
    const blocks = markdownToBlocks("a\nb\n\n- [X] shout");
    expect(blocks).toHaveLength(2);
    const p = blocks[0].paragraph as { rich_text: { text: { content: string } }[] };
    expect(p.rich_text[0].text.content).toBe("a\nb");
    expect((blocks[1].to_do as { checked: boolean }).checked).toBe(true);
  });

  it("code block keeps verbatim content and maps the language", () => {
    const [code] = markdownToBlocks("```js\nlet **x** = 1;\n```");
    const body = code.code as { language: string; rich_text: { text: { content: string } }[] };
    expect(body.language).toBe("javascript");
    expect(body.rich_text[0].text.content).toBe("let **x** = 1;");
    const [unknown] = markdownToBlocks("```whatever\nx\n```");
    expect((unknown.code as { language: string }).language).toBe("plain text");
  });

  it("splits text longer than Notion's 2000-char item limit", () => {
    const [p] = markdownToBlocks("x".repeat(4500));
    expect((p.paragraph as { rich_text: unknown[] }).rich_text).toHaveLength(3);
  });
});

describe("richText", () => {
  it("parses inline bold / italic / code / strike / links", () => {
    const rt = richText("see **bold**, *it*, `c`, ~~s~~ and [site](https://x.y/z) end");
    expect(rt.map((r) => r.text.content)).toEqual(["see ", "bold", ", ", "it", ", ", "c", ", ", "s", " and ", "site", " end"]);
    expect(rt[1].annotations).toEqual({ bold: true });
    expect(rt[3].annotations).toEqual({ italic: true });
    expect(rt[5].annotations).toEqual({ code: true });
    expect(rt[7].annotations).toEqual({ strikethrough: true });
    expect(rt[9].text.link).toEqual({ url: "https://x.y/z" });
  });

  it("never returns an empty array (Notion rejects it)", () => {
    expect(richText("")).toEqual([{ type: "text", text: { content: "" } }]);
  });
});

describe("chunkBlocks", () => {
  it("splits into groups of 100", () => {
    const many = markdownToBlocks(Array.from({ length: 250 }, (_, i) => `- ${i}`).join("\n"));
    const chunks = chunkBlocks(many);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
  });
});
