import type { ToolDef, ParsedToolCall } from "@/lib/ai";
import { pushUndo } from "@/lib/undoStack";
import { blockingTasks } from "@/lib/dependencies";
import {
  isNotionConnected,
  loadNotionTarget,
  notionAppend,
  notionArchivePage,
  notionCreatePage,
  notionDeleteBlocks,
  notionSearch,
  type NotionTarget,
} from "@/lib/notion";
import { getThread, gmailWebUrl, htmlToText, isGmailConnected, listThreads, displayName, type MailBox } from "@/lib/gmail";
import { LIBRARY_TOOLS, LIBRARY_TOOL_NAMES, runLibraryTool } from "@/lib/aiLibrary";
import type { Task, Project, Priority } from "@/types";

/**
 * Lets the AI assistant act on the user's data instead of only advising — "создавать задачи,
 * проекты и тд" (explicit product decision, see UX-ROADMAP.md P6). Every mutation here is pushed
 * onto the same global undo stack every other action in the app uses (Ctrl+Z / toast "Вернуть"),
 * so an AI action is exactly as safe to make as a manual one.
 *
 * Two tiers (plan B2/B3):
 *  - LOCAL tools (task / project / note) run synchronously against the store — `dispatchToolCall`.
 *  - INTEGRATION tools (Notion, Gmail) go through our `/api/*` functions with the session cookie —
 *    async, and only offered when the integration is known to be connected (`getAiTools`), so the
 *    model never sees a tool it can't use. Their undo is a compensating remote call (archive the
 *    page, delete the appended blocks). `runToolCall` is the one entry point for both tiers.
 *
 * Client creation is intentionally excluded — it's a money-bearing entity, higher stakes to let a
 * model create unsupervised.
 */

// Minimal shape of what a tool executor needs from the store — narrower than the full
// DataContextValue so this file doesn't need to import the whole provider type.
export interface AiToolContext {
  tasks: Task[];
  projects: Project[];
  addTask: (input: {
    title: string;
    done: boolean;
    description?: string;
    dueDate?: string;
    priority?: Priority;
    projectId?: string;
    tags?: string[];
    important?: boolean;
    links?: string[];
  }) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  addProject: (input: { name: string; status: Project["status"]; clientId?: string }) => string;
  deleteProject: (id: string) => void;
  addNote: (input: { title: string; body: string; pinned: boolean }) => string;
  deleteNote: (id: string) => void;
}

export const AI_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Создать новую задачу пользователя.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Название задачи" },
          description: { type: "string", description: "Описание/контекст задачи, необязательно" },
          due_date: { type: "string", description: "Срок в формате YYYY-MM-DD, необязательно" },
          priority: { type: "integer", enum: [0, 1, 2, 3], description: "0=без приоритета, 1=высокий, 2=средний, 3=низкий" },
          project_name: { type: "string", description: "Название существующего проекта, к которому привязать задачу — необязательно" },
          tags: { type: "array", items: { type: "string" }, description: "Теги задачи, необязательно" },
          important: { type: "boolean", description: "Пометить как важную" },
          link: { type: "string", description: "Ссылка, которую прикрепить к задаче (например, на письмо из read_thread), необязательно" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Отметить существующую открытую задачу выполненной, по названию или его части.",
      parameters: {
        type: "object",
        properties: { title_query: { type: "string", description: "Название задачи или его часть — для поиска" } },
        required: ["title_query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_task",
      description: "Перенести срок существующей открытой задачи (или снять срок совсем).",
      parameters: {
        type: "object",
        properties: {
          title_query: { type: "string", description: "Название задачи или его часть — для поиска" },
          due_date: { type: "string", description: "Новый срок YYYY-MM-DD; передайте null или пустую строку, чтобы снять срок" },
        },
        required: ["title_query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description: "Создать новый проект.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Название проекта" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Создать новую заметку.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Заголовок заметки" },
          body: { type: "string", description: "Текст заметки" },
        },
        required: ["title", "body"],
      },
    },
  },
];

/** Offered only while Notion is connected (plan B2). */
export const NOTION_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "notion_create_page",
      description:
        "Создать страницу в Notion с заголовком и содержимым в markdown. Без parent_query страница создаётся в месте по умолчанию («Инбокс»), выбранном в настройках.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Заголовок страницы" },
          markdown: { type: "string", description: "Содержимое в markdown (заголовки, списки, чекбоксы, код)" },
          parent_query: { type: "string", description: "Название родительской страницы или базы, если нужно не место по умолчанию" },
        },
        required: ["title", "markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notion_append",
      description: "Дописать markdown в конец существующей страницы Notion, найденной по названию.",
      parameters: {
        type: "object",
        properties: {
          page_query: { type: "string", description: "Название страницы или его часть" },
          markdown: { type: "string", description: "Что дописать, в markdown" },
        },
        required: ["page_query", "markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notion_search",
      description: "Найти страницы и базы в Notion по названию. Возвращает список с ссылками.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Поисковый запрос" } },
        required: ["query"],
      },
    },
  },
];

/** Offered only while Gmail is connected (plan B3). */
export const MAIL_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_mail",
      description:
        "Найти письма в Gmail. Поддерживает синтаксис поиска Gmail (from:, subject:, newer_than:7d, has:attachment, is:unread). Возвращает до 10 цепочек с id для read_thread.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Поисковый запрос Gmail; пустая строка = последние письма" },
          box: { type: "string", enum: ["inbox", "starred", "sent"], description: "Папка, по умолчанию inbox" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_thread",
      description: "Прочитать цепочку писем целиком по id из search_mail: отправители, даты, текст, вложения, ссылки на созвоны, приглашения.",
      parameters: {
        type: "object",
        properties: { thread_id: { type: "string", description: "id цепочки из search_mail" } },
        required: ["thread_id"],
      },
    },
  },
];

/**
 * The tool list for this request: local tools and the library always (the library works offline
 * in localStorage too), integration tools only when connected — the model should never see a tool
 * it cannot use.
 */
export function getAiTools(): ToolDef[] {
  return [
    ...AI_TOOLS,
    ...LIBRARY_TOOLS,
    ...(isNotionConnected() ? NOTION_TOOLS : []),
    ...(isGmailConnected() ? MAIL_TOOLS : []),
  ];
}

export interface ToolExecResult {
  /** Fed back to the model as the tool's result message. */
  resultText: string;
  /** Shown to the user as a toast with a "Вернуть" undo action, if the call actually mutated something. */
  toastLabel?: string;
  /** The SAME wrapped runner `pushUndo` returned (idempotent — Ctrl+Z and the toast button share
   * one, so whichever fires first wins and the other becomes a no-op). Hand this to the toast's
   * `onAction`, don't build a second independent undo action. */
  undoRun?: () => void;
}

/** Case-insensitive substring match. Ambiguous (>1) or empty results are reported back to the
 * model as text, so it can ask the user to be more specific instead of guessing wrong. */
function fuzzyFindOne<T>(items: T[], query: string, getTitle: (t: T) => string): { item: T } | { error: string } {
  const q = query.trim().toLowerCase();
  if (!q) return { error: "Пустой поисковый запрос." };
  const matches = items.filter((i) => getTitle(i).toLowerCase().includes(q));
  if (matches.length === 0) return { error: `Не найдено ни одной подходящей задачи по «${query}».` };
  if (matches.length > 1) {
    const names = matches.slice(0, 5).map(getTitle).join("; ");
    return { error: `Нашлось несколько задач по «${query}»: ${names}. Уточните название точнее.` };
  }
  return { item: matches[0] };
}

const LOCAL_TOOL_NAMES = new Set(AI_TOOLS.map((t) => t.function.name));

export function dispatchToolCall(ctx: AiToolContext, call: ParsedToolCall): ToolExecResult {
  const a = call.arguments;
  switch (call.name) {
    case "create_task": {
      const title = typeof a.title === "string" ? a.title.trim() : "";
      if (!title) return { resultText: "Ошибка: не указано название задачи." };
      let projectId: string | undefined;
      let projectNote = "";
      if (typeof a.project_name === "string" && a.project_name.trim()) {
        const found = fuzzyFindOne(ctx.projects, a.project_name, (p) => p.name);
        if ("item" in found) projectId = found.item.id;
        else projectNote = ` (проект «${a.project_name}» не найден, создано без привязки)`;
      }
      const priority = ([0, 1, 2, 3] as const).includes(a.priority as Priority) ? (a.priority as Priority) : 0;
      const link = typeof a.link === "string" && /^https?:\/\//.test(a.link.trim()) ? a.link.trim() : undefined;
      const id = ctx.addTask({
        title,
        done: false,
        description: typeof a.description === "string" && a.description.trim() ? a.description.trim() : undefined,
        dueDate: typeof a.due_date === "string" && a.due_date ? a.due_date : undefined,
        priority,
        projectId,
        tags: Array.isArray(a.tags) ? a.tags.filter((t): t is string => typeof t === "string") : undefined,
        important: a.important === true,
        links: link ? [link] : undefined,
      });
      const undoRun = pushUndo(`Задача создана через AI: ${title}`, () => ctx.deleteTask(id));
      return { resultText: `Задача создана: «${title}»${projectNote}.`, toastLabel: `AI создал задачу: ${title}`, undoRun };
    }
    case "complete_task": {
      const query = typeof a.title_query === "string" ? a.title_query : "";
      const found = fuzzyFindOne(ctx.tasks.filter((t) => !t.done), query, (t) => t.title);
      if ("error" in found) return { resultText: found.error };
      const task = found.item;
      const blockers = blockingTasks(task, ctx.tasks);
      if (blockers.length > 0) {
        return { resultText: `Задача «${task.title}» заблокирована незавершённой задачей «${blockers[0].title}» — сначала закройте её.` };
      }
      ctx.toggleTask(task.id);
      const undoRun = pushUndo(`Задача завершена через AI: ${task.title}`, () => ctx.toggleTask(task.id));
      return { resultText: `Задача «${task.title}» отмечена выполненной.`, toastLabel: `AI завершил задачу: ${task.title}`, undoRun };
    }
    case "reschedule_task": {
      const query = typeof a.title_query === "string" ? a.title_query : "";
      const found = fuzzyFindOne(ctx.tasks.filter((t) => !t.done), query, (t) => t.title);
      if ("error" in found) return { resultText: found.error };
      const task = found.item;
      const prevDue = task.dueDate;
      const nextDue = typeof a.due_date === "string" && a.due_date ? a.due_date : undefined;
      ctx.updateTask(task.id, { dueDate: nextDue });
      const undoRun = pushUndo(`Срок изменён через AI: ${task.title}`, () => ctx.updateTask(task.id, { dueDate: prevDue }));
      return {
        resultText: nextDue ? `Срок задачи «${task.title}» перенесён на ${nextDue}.` : `Срок задачи «${task.title}» снят.`,
        toastLabel: `AI перенёс срок: ${task.title}`,
        undoRun,
      };
    }
    case "create_project": {
      const name = typeof a.name === "string" ? a.name.trim() : "";
      if (!name) return { resultText: "Ошибка: не указано название проекта." };
      const id = ctx.addProject({ name, status: "active" });
      const undoRun = pushUndo(`Проект создан через AI: ${name}`, () => ctx.deleteProject(id));
      return { resultText: `Проект создан: «${name}».`, toastLabel: `AI создал проект: ${name}`, undoRun };
    }
    case "create_note": {
      const title = typeof a.title === "string" ? a.title.trim() : "";
      const body = typeof a.body === "string" ? a.body.trim() : "";
      if (!title || !body) return { resultText: "Ошибка: нужны и заголовок, и текст заметки." };
      const id = ctx.addNote({ title, body, pinned: false });
      const undoRun = pushUndo(`Заметка создана через AI: ${title}`, () => ctx.deleteNote(id));
      return { resultText: `Заметка создана: «${title}».`, toastLabel: `AI создал заметку: ${title}`, undoRun };
    }
    default:
      return { resultText: `Неизвестный инструмент: ${call.name}.` };
  }
}

/**
 * One entry point for the assistant: local tools synchronously, integration tools via the API.
 * Never throws — a failed remote call comes back as `resultText` so the model can tell the user
 * what went wrong instead of the whole reply erroring out.
 */
export async function runToolCall(ctx: AiToolContext, call: ParsedToolCall): Promise<ToolExecResult> {
  if (LOCAL_TOOL_NAMES.has(call.name)) return dispatchToolCall(ctx, call);
  try {
    if (LIBRARY_TOOL_NAMES.has(call.name)) return await runLibraryTool(call.name, call.arguments);
    switch (call.name) {
      case "notion_create_page":
        return await notionCreatePageTool(call.arguments);
      case "notion_append":
        return await notionAppendTool(call.arguments);
      case "notion_search":
        return await notionSearchTool(call.arguments);
      case "search_mail":
        return await searchMailTool(call.arguments);
      case "read_thread":
        return await readThreadTool(call.arguments);
      default:
        return { resultText: `Неизвестный инструмент: ${call.name}.` };
    }
  } catch (e) {
    return { resultText: `Ошибка инструмента ${call.name}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── Notion ──────────────────────────────────────────────────────────────────────────────────

/** Best single match for a page/database name, or an explanatory error for the model. */
async function resolveNotionTarget(query: string, kind?: "page" | "database"): Promise<{ target: NotionTarget } | { error: string }> {
  const q = query.trim();
  if (!q) return { error: "Пустое название страницы." };
  const results = await notionSearch(q, kind);
  if (results.length === 0) return { error: `В Notion не найдено «${q}». Возможно, страница не расшарена интеграции.` };
  const lower = q.toLowerCase();
  const exact = results.find((r) => r.title.toLowerCase() === lower);
  const partial = results.filter((r) => r.title.toLowerCase().includes(lower));
  if (exact) return { target: exact };
  if (partial.length === 1) return { target: partial[0] };
  if (partial.length > 1) {
    return { error: `В Notion несколько совпадений по «${q}»: ${partial.slice(0, 5).map((r) => r.title).join("; ")}. Уточните название.` };
  }
  return { target: results[0] };
}

async function notionCreatePageTool(a: Record<string, unknown>): Promise<ToolExecResult> {
  const title = typeof a.title === "string" ? a.title.trim() : "";
  const markdown = typeof a.markdown === "string" ? a.markdown : "";
  if (!title) return { resultText: "Ошибка: не указан заголовок страницы." };
  let parent: NotionTarget | null = null;
  if (typeof a.parent_query === "string" && a.parent_query.trim()) {
    const found = await resolveNotionTarget(a.parent_query);
    if ("error" in found) return { resultText: found.error };
    parent = found.target;
  } else {
    parent = loadNotionTarget();
    if (!parent) {
      return { resultText: "В настройках не выбрана страница Notion по умолчанию. Попросите пользователя выбрать её в Настройках → Интеграции или назвать родительскую страницу." };
    }
  }
  const page = await notionCreatePage({ title, markdown, parent });
  const undoRun = pushUndo(`Страница Notion создана через AI: ${title}`, () => {
    void notionArchivePage(page.id).catch(() => undefined);
  });
  return {
    resultText: `Страница «${title}» создана в Notion (${parent.title}): ${page.url}`,
    toastLabel: `AI создал страницу в Notion: ${title}`,
    undoRun,
  };
}

async function notionAppendTool(a: Record<string, unknown>): Promise<ToolExecResult> {
  const query = typeof a.page_query === "string" ? a.page_query : "";
  const markdown = typeof a.markdown === "string" ? a.markdown.trim() : "";
  if (!markdown) return { resultText: "Ошибка: нечего дописывать — пустой markdown." };
  const found = await resolveNotionTarget(query, "page");
  if ("error" in found) return { resultText: found.error };
  const blockIds = await notionAppend(found.target.id, markdown);
  const undoRun = pushUndo(`Дописано в Notion через AI: ${found.target.title}`, () => {
    void notionDeleteBlocks(blockIds).catch(() => undefined);
  });
  return {
    resultText: `Дописано в страницу «${found.target.title}» (${blockIds.length} блоков): ${found.target.url}`,
    toastLabel: `AI дописал в Notion: ${found.target.title}`,
    undoRun,
  };
}

async function notionSearchTool(a: Record<string, unknown>): Promise<ToolExecResult> {
  const query = typeof a.query === "string" ? a.query.trim() : "";
  const results = await notionSearch(query);
  if (results.length === 0) return { resultText: `В Notion ничего не найдено по «${query}».` };
  return {
    resultText: results.map((r) => `- ${r.kind === "database" ? "[база] " : ""}${r.title} — ${r.url}`).join("\n"),
  };
}

// ── Gmail ───────────────────────────────────────────────────────────────────────────────────

async function searchMailTool(a: Record<string, unknown>): Promise<ToolExecResult> {
  const query = typeof a.query === "string" ? a.query.trim() : "";
  const box: MailBox = a.box === "starred" || a.box === "sent" ? a.box : "inbox";
  const { threads } = await listThreads(box, query);
  if (threads.length === 0) return { resultText: `Писем не найдено${query ? ` по запросу «${query}»` : ""}.` };
  const lines = threads.slice(0, 10).map((t) => {
    const flags = [t.unread ? "непрочитано" : null, t.starred ? "★" : null, t.hasAttachments ? "вложения" : null].filter(Boolean).join(", ");
    return `- id=${t.id} · ${t.date.slice(0, 16).replace("T", " ")} · ${displayName(t.from)} <${t.from.email}> · «${t.subject}»${flags ? ` [${flags}]` : ""}\n  ${t.snippet}`;
  });
  return { resultText: `Найдено цепочек: ${threads.length}${threads.length > 10 ? " (показаны 10)" : ""}.\n${lines.join("\n")}` };
}

const THREAD_TEXT_LIMIT = 6000;

async function readThreadTool(a: Record<string, unknown>): Promise<ToolExecResult> {
  const id = typeof a.thread_id === "string" ? a.thread_id.trim() : "";
  if (!id) return { resultText: "Ошибка: не указан thread_id." };
  const t = await getThread(id);
  const parts: string[] = [`Тема: ${t.subject}`, `Ссылка на письмо (для create_task.link): ${gmailWebUrl(t.id)}`];
  let budget = THREAD_TEXT_LIMIT;
  for (const m of t.messages) {
    const body = (m.text?.trim() || (m.html ? htmlToText(m.html) : "") || m.snippet).trim();
    const slice = body.slice(0, Math.max(0, Math.min(budget, 2500)));
    budget -= slice.length;
    const extras = [
      m.attachments.length ? `Вложения: ${m.attachments.map((x) => x.filename).join(", ")}` : null,
      m.callLinks.length ? `Ссылки на созвон: ${m.callLinks.join(", ")}` : null,
      m.invite ? `Приглашение: ${m.invite.summary}, ${m.invite.start}${m.invite.end ? ` – ${m.invite.end}` : ""}${m.invite.location ? `, ${m.invite.location}` : ""}` : null,
    ].filter((x): x is string => Boolean(x));
    parts.push(
      `--- ${displayName(m.from)} <${m.from.email}> → ${m.to.map((x) => x.email).join(", ") || "—"} · ${m.date.slice(0, 16).replace("T", " ")}${m.unread ? " · непрочитано" : ""}`,
      slice + (body.length > slice.length ? " …" : ""),
      ...extras
    );
    if (budget <= 0) {
      parts.push("(текст обрезан — цепочка длинная)");
      break;
    }
  }
  return { resultText: parts.join("\n") };
}
