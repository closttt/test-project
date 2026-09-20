/**
 * Markdown → Notion block objects (plan B2). Pure and dependency-free so the assistant's
 * markdown, a note's body, or a Library item's notes all become the same Notion page structure.
 *
 * Covers what our own `lib/markdown.tsx` renders: #/##/### headings, - / * bullets, 1. numbered,
 * - [ ] / - [x] to-dos, > quotes, ``` code fences, --- dividers, paragraphs; inline **bold**,
 * *italic*, ~~strike~~, `code`, [text](url). Anything fancier stays literal text — Notion
 * would rather see plain characters than a rejected request.
 */

export interface RichText {
  type: "text";
  text: { content: string; link?: { url: string } };
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; code?: boolean };
}

export type NotionBlock = Record<string, unknown> & { object: "block"; type: string };

/** Notion caps a single rich_text item at 2000 chars and an array at 100 items. */
const TEXT_LIMIT = 2000;
export const BLOCKS_PER_REQUEST = 100;

export function markdownToBlocks(markdown: string): NotionBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: NotionBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text) blocks.push(block("paragraph", { rich_text: richText(text) }));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code fence — collect until the closing fence (or the end).
    const fence = trimmed.match(/^```\s*([\w+-]*)\s*$/);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) code.push(lines[i++]);
      blocks.push(
        block("code", {
          rich_text: plainText(code.join("\n")),
          language: normaliseLanguage(fence[1]),
        })
      );
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      blocks.push(block("divider", {}));
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push(block(`heading_${level}`, { rich_text: richText(heading[2]) }));
      continue;
    }

    const todo = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (todo) {
      flushParagraph();
      blocks.push(block("to_do", { rich_text: richText(todo[2]), checked: todo[1] !== " " }));
      continue;
    }

    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      blocks.push(block("bulleted_list_item", { rich_text: richText(bullet[1]) }));
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      blocks.push(block("numbered_list_item", { rich_text: richText(numbered[1]) }));
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      blocks.push(block("quote", { rich_text: richText(quote[1]) }));
      continue;
    }

    paragraph.push(trimmed);
  }
  flushParagraph();
  return blocks;
}

function block(type: string, body: Record<string, unknown>): NotionBlock {
  return { object: "block", type, [type]: body };
}

/** Split long plain text into ≤2000-char rich_text items (no formatting). */
export function plainText(text: string): RichText[] {
  const out: RichText[] = [];
  for (let i = 0; i < text.length; i += TEXT_LIMIT) {
    out.push({ type: "text", text: { content: text.slice(i, i + TEXT_LIMIT) } });
  }
  return out.length ? out : [{ type: "text", text: { content: "" } }];
}

// Inline tokens in priority order. A link is matched first so `[**x**](url)` keeps its URL; the
// inner markers inside a link label are left literal (Notion links are single-annotation anyway).
const INLINE_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|`([^`]+)`|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_/g;

/** Inline markdown → Notion rich_text array. */
export function richText(text: string): RichText[] {
  const out: RichText[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) pushPlain(out, text.slice(last, idx));
    const [, linkLabel, linkUrl, bold, strike, code, italicStar, italicUnderscore] = m;
    if (linkLabel !== undefined) out.push({ type: "text", text: { content: linkLabel, link: { url: linkUrl } } });
    else if (bold !== undefined) out.push({ type: "text", text: { content: bold }, annotations: { bold: true } });
    else if (strike !== undefined) out.push({ type: "text", text: { content: strike }, annotations: { strikethrough: true } });
    else if (code !== undefined) out.push({ type: "text", text: { content: code }, annotations: { code: true } });
    else out.push({ type: "text", text: { content: (italicStar ?? italicUnderscore) as string }, annotations: { italic: true } });
    last = idx + m[0].length;
  }
  if (last < text.length) pushPlain(out, text.slice(last));
  return out.length ? out : [{ type: "text", text: { content: "" } }];
}

function pushPlain(out: RichText[], s: string) {
  for (const piece of plainText(s)) if (piece.text.content) out.push(piece);
}

const LANGS = new Set([
  "bash", "c", "c++", "c#", "css", "diff", "docker", "go", "graphql", "html", "java", "javascript", "json",
  "kotlin", "markdown", "php", "plain text", "powershell", "python", "ruby", "rust", "scss", "shell",
  "sql", "swift", "typescript", "xml", "yaml",
]);
const LANG_ALIASES: Record<string, string> = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", sh: "shell", zsh: "shell",
  py: "python", md: "markdown", yml: "yaml", cpp: "c++", cs: "c#", txt: "plain text", ps1: "powershell",
};

function normaliseLanguage(raw: string): string {
  const l = raw.toLowerCase();
  const mapped = LANG_ALIASES[l] ?? l;
  return LANGS.has(mapped) ? mapped : "plain text";
}

/** Notion accepts at most 100 children per request — split for `blocks.children.append`. */
export function chunkBlocks(blocks: NotionBlock[]): NotionBlock[][] {
  const out: NotionBlock[][] = [];
  for (let i = 0; i < blocks.length; i += BLOCKS_PER_REQUEST) out.push(blocks.slice(i, i + BLOCKS_PER_REQUEST));
  return out;
}
