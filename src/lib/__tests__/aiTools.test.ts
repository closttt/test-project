import { describe, it, expect, beforeEach } from "vitest";

import { dispatchToolCall, type AiToolContext } from "@/lib/aiTools";
import type { Task, Project, Priority } from "@/types";
import type { ParsedToolCall } from "@/lib/ai";

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: "t",
    done: false,
    important: false,
    priority: 0,
    links: [],
    comments: [],
    attachments: [],
    recurrence: "none",
    spentMin: 0,
    tags: [],
    subtasks: [],
    order: 0,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

function makeProject(over: Partial<Project> = {}): Project {
  return { id: Math.random().toString(36).slice(2), name: "p", status: "active", createdAt: new Date().toISOString(), ...over };
}

/** A minimal fake store — records every mutating call so tests can assert on them directly. */
function fakeCtx(tasks: Task[] = [], projects: Project[] = []) {
  const created: { tasks: unknown[]; projects: unknown[]; notes: unknown[] } = { tasks: [], projects: [], notes: [] };
  const deleted: { tasks: string[]; projects: string[]; notes: string[] } = { tasks: [], projects: [], notes: [] };
  const toggled: string[] = [];
  const updated: { id: string; patch: Partial<Task> }[] = [];

  const ctx: AiToolContext = {
    tasks,
    projects,
    addTask: (input) => {
      const id = `new-task-${created.tasks.length}`;
      created.tasks.push({ id, ...input });
      return id;
    },
    updateTask: (id, patch) => updated.push({ id, patch }),
    toggleTask: (id) => toggled.push(id),
    deleteTask: (id) => deleted.tasks.push(id),
    addProject: (input) => {
      const id = `new-project-${created.projects.length}`;
      created.projects.push({ id, ...input });
      return id;
    },
    deleteProject: (id) => deleted.projects.push(id),
    addNote: (input) => {
      const id = `new-note-${created.notes.length}`;
      created.notes.push({ id, ...input });
      return id;
    },
    deleteNote: (id) => deleted.notes.push(id),
  };
  return { ctx, created, deleted, toggled, updated };
}

function call(name: string, args: Record<string, unknown>): ParsedToolCall {
  return { id: "call-1", name, arguments: args };
}

describe("dispatchToolCall — create_task", () => {
  it("creates a task and registers an undo that deletes it", () => {
    const { ctx, created, deleted } = fakeCtx();
    const result = dispatchToolCall(ctx, call("create_task", { title: "Позвонить клиенту" }));
    expect(result.resultText).toContain("Позвонить клиенту");
    expect(created.tasks).toHaveLength(1);
    expect(result.undoRun).toBeTypeOf("function");
    result.undoRun!();
    expect(deleted.tasks).toEqual(["new-task-0"]);
  });

  it("resolves project_name by fuzzy match and links the task", () => {
    const { ctx, created } = fakeCtx([], [makeProject({ id: "p1", name: "Редизайн сайта" })]);
    dispatchToolCall(ctx, call("create_task", { title: "Собрать макет", project_name: "редизайн" }));
    expect(created.tasks[0]).toMatchObject({ projectId: "p1" });
  });

  it("creates unlinked and notes the miss when project_name doesn't match anything", () => {
    const { ctx, created } = fakeCtx([], [makeProject({ name: "Другой проект" })]);
    const result = dispatchToolCall(ctx, call("create_task", { title: "Задача", project_name: "несуществующий" }));
    expect(created.tasks[0]).toMatchObject({ projectId: undefined });
    expect(result.resultText).toContain("не найден");
  });

  it("rejects an empty title without touching the store", () => {
    const { ctx, created } = fakeCtx();
    const result = dispatchToolCall(ctx, call("create_task", { title: "  " }));
    expect(result.resultText).toMatch(/ошибка/i);
    expect(created.tasks).toHaveLength(0);
  });

  it("clamps an out-of-range priority to 0 instead of passing it through raw", () => {
    const { ctx, created } = fakeCtx();
    dispatchToolCall(ctx, call("create_task", { title: "x", priority: 99 }));
    expect((created.tasks[0] as { priority: Priority }).priority).toBe(0);
  });
});

describe("dispatchToolCall — complete_task / reschedule_task fuzzy matching", () => {
  let tasks: Task[];
  beforeEach(() => {
    tasks = [makeTask({ id: "t1", title: "Написать отчёт клиенту" }), makeTask({ id: "t2", title: "Отчёт по продажам" })];
  });

  it("acts on a unique substring match", () => {
    const { ctx, toggled } = fakeCtx(tasks);
    const result = dispatchToolCall(ctx, call("complete_task", { title_query: "клиенту" }));
    expect(toggled).toEqual(["t1"]);
    expect(result.resultText).toContain("выполненной");
  });

  it("reports ambiguity instead of guessing when multiple tasks match", () => {
    const { ctx, toggled } = fakeCtx(tasks);
    const result = dispatchToolCall(ctx, call("complete_task", { title_query: "отчёт" }));
    expect(toggled).toHaveLength(0);
    expect(result.resultText).toMatch(/несколько/i);
  });

  it("reports not-found instead of silently no-op-ing", () => {
    const { ctx, toggled } = fakeCtx(tasks);
    const result = dispatchToolCall(ctx, call("complete_task", { title_query: "чего-то-нет" }));
    expect(toggled).toHaveLength(0);
    expect(result.resultText).toMatch(/не найдено/i);
  });

  it("refuses to complete a task blocked by another open task", () => {
    const blocker = makeTask({ id: "b1", title: "Блокирующая задача" });
    const blocked = makeTask({ id: "t3", title: "Заблокированная задача", blockedBy: ["b1"] });
    const { ctx, toggled } = fakeCtx([blocker, blocked]);
    const result = dispatchToolCall(ctx, call("complete_task", { title_query: "заблокированная" }));
    expect(toggled).toHaveLength(0);
    expect(result.resultText).toMatch(/заблокирована/i);
  });

  it("reschedules a matched task and undo restores the previous due date", () => {
    const t = makeTask({ id: "t9", title: "Согласовать бюджет", dueDate: "2026-01-01" });
    const { ctx, updated } = fakeCtx([t]);
    const result = dispatchToolCall(ctx, call("reschedule_task", { title_query: "бюджет", due_date: "2026-02-02" }));
    expect(updated).toEqual([{ id: "t9", patch: { dueDate: "2026-02-02" } }]);
    result.undoRun!();
    expect(updated[1]).toEqual({ id: "t9", patch: { dueDate: "2026-01-01" } });
  });

  it("clears the due date when reschedule_task is called with no due_date", () => {
    const t = makeTask({ id: "t9", title: "Задача со сроком", dueDate: "2026-01-01" });
    const { ctx, updated } = fakeCtx([t]);
    dispatchToolCall(ctx, call("reschedule_task", { title_query: "со сроком" }));
    expect(updated).toEqual([{ id: "t9", patch: { dueDate: undefined } }]);
  });

  it("only matches open (not done) tasks", () => {
    const done = makeTask({ id: "d1", title: "Готовая задача", done: true });
    const { ctx, toggled } = fakeCtx([done]);
    const result = dispatchToolCall(ctx, call("complete_task", { title_query: "готовая" }));
    expect(toggled).toHaveLength(0);
    expect(result.resultText).toMatch(/не найдено/i);
  });
});

describe("dispatchToolCall — create_project / create_note", () => {
  it("creates a project with an undo that deletes it", () => {
    const { ctx, created, deleted } = fakeCtx();
    const result = dispatchToolCall(ctx, call("create_project", { name: "Новый проект" }));
    expect(created.projects).toHaveLength(1);
    result.undoRun!();
    expect(deleted.projects).toEqual(["new-project-0"]);
  });

  it("creates a note only when both title and body are present", () => {
    const { ctx, created } = fakeCtx();
    const missing = dispatchToolCall(ctx, call("create_note", { title: "Заголовок" }));
    expect(missing.resultText).toMatch(/ошибка/i);
    expect(created.notes).toHaveLength(0);

    const ok = dispatchToolCall(ctx, call("create_note", { title: "Заголовок", body: "Текст" }));
    expect(created.notes).toHaveLength(1);
    expect(ok.undoRun).toBeTypeOf("function");
  });
});

describe("dispatchToolCall — unknown tool", () => {
  it("reports an error instead of throwing", () => {
    const { ctx } = fakeCtx();
    const result = dispatchToolCall(ctx, call("delete_everything", {}));
    expect(result.resultText).toMatch(/неизвестный/i);
  });
});
