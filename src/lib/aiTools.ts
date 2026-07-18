import type { ToolDef, ParsedToolCall } from "@/lib/ai";
import { pushUndo } from "@/lib/undoStack";
import { blockingTasks } from "@/lib/dependencies";
import type { Task, Project, Priority } from "@/types";

/**
 * Lets the AI assistant act on the user's data instead of only advising — "создавать задачи,
 * проекты и тд" (explicit product decision, see UX-ROADMAP.md P6). Every mutation here is pushed
 * onto the same global undo stack every other action in the app uses (Ctrl+Z / toast "Вернуть"),
 * so an AI action is exactly as safe to make as a manual one.
 *
 * Deliberately bounded to 5 tools (create/complete/reschedule a task, create a project, create a
 * note) rather than exposing every store action — depth over breadth, and each one maps to a
 * genuinely common request instead of a mechanical 1:1 wrapper over the whole API surface. Client
 * creation is intentionally excluded from this first pass — it's a money-bearing entity, higher
 * stakes to let a model create unsupervised.
 */

// Minimal shape of what a tool executor needs from the store — narrower than the full
// DataContextValue so this file doesn't need to import the whole provider type.
export interface AiToolContext {
  tasks: Task[];
  projects: Project[];
  addTask: (input: {
    title: string;
    done: boolean;
    dueDate?: string;
    priority?: Priority;
    projectId?: string;
    tags?: string[];
    important?: boolean;
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
          due_date: { type: "string", description: "Срок в формате YYYY-MM-DD, необязательно" },
          priority: { type: "integer", enum: [0, 1, 2, 3], description: "0=без приоритета, 1=высокий, 2=средний, 3=низкий" },
          project_name: { type: "string", description: "Название существующего проекта, к которому привязать задачу — необязательно" },
          tags: { type: "array", items: { type: "string" }, description: "Теги задачи, необязательно" },
          important: { type: "boolean", description: "Пометить как важную" },
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
      const id = ctx.addTask({
        title,
        done: false,
        dueDate: typeof a.due_date === "string" && a.due_date ? a.due_date : undefined,
        priority,
        projectId,
        tags: Array.isArray(a.tags) ? a.tags.filter((t): t is string => typeof t === "string") : undefined,
        important: a.important === true,
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
