import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/notion", () => ({
  isNotionConnected: vi.fn(() => false),
  loadNotionTarget: vi.fn(() => null),
  notionSearch: vi.fn(),
  notionCreatePage: vi.fn(),
  notionAppend: vi.fn(),
  notionArchivePage: vi.fn(async () => undefined),
  notionDeleteBlocks: vi.fn(async () => undefined),
}));
vi.mock("@/lib/gmail", () => ({
  isGmailConnected: vi.fn(() => false),
  listThreads: vi.fn(),
  getThread: vi.fn(),
  gmailWebUrl: (id: string) => `https://mail.google.com/mail/u/0/#all/${id}`,
  displayName: (a: { name: string; email: string }) => a.name || a.email,
  htmlToText: (h: string) => h.replace(/<[^>]+>/g, ""),
}));

import * as notion from "@/lib/notion";
import * as gmail from "@/lib/gmail";
import { getAiTools, runToolCall, AI_TOOLS, type AiToolContext } from "@/lib/aiTools";

const ctx: AiToolContext = {
  tasks: [],
  projects: [],
  addTask: vi.fn(() => "t-1"),
  updateTask: vi.fn(),
  toggleTask: vi.fn(),
  deleteTask: vi.fn(),
  addProject: vi.fn(() => "p-1"),
  deleteProject: vi.fn(),
  addNote: vi.fn(() => "n-1"),
  deleteNote: vi.fn(),
};

const page = { id: "pg", kind: "page" as const, title: "Инбокс", url: "https://notion.so/pg" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAiTools", () => {
  it("offers integration tools only when the integration is connected", () => {
    expect(getAiTools().map((t) => t.function.name)).toEqual(AI_TOOLS.map((t) => t.function.name));
    vi.mocked(notion.isNotionConnected).mockReturnValue(true);
    vi.mocked(gmail.isGmailConnected).mockReturnValue(true);
    const names = getAiTools().map((t) => t.function.name);
    expect(names).toContain("notion_create_page");
    expect(names).toContain("search_mail");
    expect(names).toContain("read_thread");
  });
});

describe("runToolCall — local tools still go through dispatch", () => {
  it("create_task passes link + description through", async () => {
    const r = await runToolCall(ctx, {
      id: "c",
      name: "create_task",
      arguments: { title: "Ответить Анне", link: "https://mail.google.com/mail/u/0/#all/abc", description: "из письма" },
    });
    expect(r.toastLabel).toContain("Ответить Анне");
    expect(ctx.addTask).toHaveBeenCalledWith(expect.objectContaining({ links: ["https://mail.google.com/mail/u/0/#all/abc"], description: "из письма" }));
  });

  it("drops a non-http link instead of attaching junk", async () => {
    await runToolCall(ctx, { id: "c", name: "create_task", arguments: { title: "x", link: "javascript:alert(1)" } });
    expect(ctx.addTask).toHaveBeenCalledWith(expect.objectContaining({ links: undefined }));
  });
});

describe("runToolCall — Notion", () => {
  it("creates a page under the default target and undo archives it", async () => {
    vi.mocked(notion.loadNotionTarget).mockReturnValue(page);
    vi.mocked(notion.notionCreatePage).mockResolvedValue({ id: "new", url: "https://notion.so/new" });
    const r = await runToolCall(ctx, { id: "c", name: "notion_create_page", arguments: { title: "Итоги", markdown: "- a" } });
    expect(notion.notionCreatePage).toHaveBeenCalledWith({ title: "Итоги", markdown: "- a", parent: page });
    expect(r.resultText).toContain("https://notion.so/new");
    r.undoRun!();
    expect(notion.notionArchivePage).toHaveBeenCalledWith("new");
  });

  it("explains a missing default target instead of failing", async () => {
    vi.mocked(notion.loadNotionTarget).mockReturnValue(null);
    const r = await runToolCall(ctx, { id: "c", name: "notion_create_page", arguments: { title: "Итоги", markdown: "" } });
    expect(r.resultText).toMatch(/по умолчанию/);
    expect(notion.notionCreatePage).not.toHaveBeenCalled();
  });

  it("resolves parent_query by exact title, then unique partial, and reports ambiguity", async () => {
    vi.mocked(notion.notionSearch).mockResolvedValue([
      { id: "1", kind: "page", title: "Проекты 2026", url: "u1" },
      { id: "2", kind: "page", title: "Проекты", url: "u2" },
    ]);
    vi.mocked(notion.notionCreatePage).mockResolvedValue({ id: "n", url: "u" });
    await runToolCall(ctx, { id: "c", name: "notion_create_page", arguments: { title: "t", markdown: "m", parent_query: "проекты" } });
    expect(vi.mocked(notion.notionCreatePage).mock.calls[0][0].parent?.id).toBe("2");

    vi.mocked(notion.notionSearch).mockResolvedValue([
      { id: "1", kind: "page", title: "План А", url: "u1" },
      { id: "2", kind: "page", title: "План Б", url: "u2" },
    ]);
    const r = await runToolCall(ctx, { id: "c", name: "notion_append", arguments: { page_query: "план", markdown: "x" } });
    expect(r.resultText).toMatch(/несколько совпадений/);
    expect(notion.notionAppend).not.toHaveBeenCalled();
  });

  it("append returns block ids and undo deletes them", async () => {
    vi.mocked(notion.notionSearch).mockResolvedValue([page]);
    vi.mocked(notion.notionAppend).mockResolvedValue(["b1", "b2"]);
    const r = await runToolCall(ctx, { id: "c", name: "notion_append", arguments: { page_query: "Инбокс", markdown: "hi" } });
    expect(r.resultText).toContain("2 блоков");
    r.undoRun!();
    expect(notion.notionDeleteBlocks).toHaveBeenCalledWith(["b1", "b2"]);
  });

  it("turns a thrown API error into result text, never a rejection", async () => {
    vi.mocked(notion.notionSearch).mockRejectedValue(new Error("Notion отклонил токен"));
    const r = await runToolCall(ctx, { id: "c", name: "notion_search", arguments: { query: "x" } });
    expect(r.resultText).toContain("Notion отклонил токен");
  });
});

describe("runToolCall — Gmail", () => {
  it("search_mail lists thread ids the model can pass to read_thread", async () => {
    vi.mocked(gmail.listThreads).mockResolvedValue({
      threads: [
        { id: "th1", subject: "Счёт", from: { name: "Анна", email: "a@x.ru" }, snippet: "прикладываю", date: "2026-09-20T10:00:00.000Z", unread: true, starred: false, messageCount: 1, hasAttachments: true },
      ],
      nextPageToken: null,
    });
    const r = await runToolCall(ctx, { id: "c", name: "search_mail", arguments: { query: "from:a@x.ru", box: "starred" } });
    expect(gmail.listThreads).toHaveBeenCalledWith("starred", "from:a@x.ru");
    expect(r.resultText).toContain("id=th1");
    expect(r.resultText).toContain("непрочитано");
  });

  it("read_thread renders bodies (html → text), attachments, call links and the mail link", async () => {
    vi.mocked(gmail.getThread).mockResolvedValue({
      id: "th1",
      subject: "Созвон",
      messages: [
        {
          id: "m1", threadId: "th1", from: { name: "Анна", email: "a@x.ru" }, to: [{ name: "", email: "me@x.ru" }], cc: [],
          subject: "Созвон", date: "2026-09-20T10:00:00.000Z", unread: false, starred: false, snippet: "s",
          html: "<p>Встретимся <b>завтра</b></p>", attachments: [{ id: "a", filename: "agenda.pdf", mimeType: "application/pdf", size: 10 }],
          callLinks: ["https://meet.google.com/abc"], invite: { summary: "Созвон", start: "2026-09-21T09:00:00.000Z", allDay: false },
        },
      ],
    });
    const r = await runToolCall(ctx, { id: "c", name: "read_thread", arguments: { thread_id: "th1" } });
    expect(r.resultText).toContain("Встретимся завтра");
    expect(r.resultText).toContain("agenda.pdf");
    expect(r.resultText).toContain("https://meet.google.com/abc");
    expect(r.resultText).toContain("https://mail.google.com/mail/u/0/#all/th1");
    expect(r.resultText).toContain("Приглашение: Созвон");
  });
});
