import type { ToolDef } from "@/lib/ai";
import { pushUndo } from "@/lib/undoStack";
import { extractLinks, prettyDomain } from "@/lib/links";
import {
  LIBRARY_STATUSES,
  LIBRARY_TYPES,
  LIBRARY_TYPE_ORDER,
  addLibraryItem,
  detectType,
  ensureLibrary,
  librarySnapshot,
  libraryTagCounts,
  matchesLibraryQuery,
  noteTemplate,
  removeLibraryItem,
  restoreLibraryItem,
  unfurl,
  updateLibraryItem,
  type LibraryDraft,
  type LibraryItem,
  type LibraryStatus,
  type LibraryType,
} from "@/lib/library";

/**
 * The assistant's hands on «Библиотека». The headline case is bulk capture: the user pastes ten
 * links in one message and everything lands filled in — so `library_add` takes a LIST (and even
 * raw text to pull links out of), never one item per call. The assistant gets a single round of
 * tool calls per message, so ten separate calls would be both slower and less reliable.
 *
 * Each link is unfurled through /api/unfurl for its real title, description and cover, the type is
 * guessed from the host, and the notes field is seeded from the per-type template so an entry is
 * never a bare bookmark. Already-saved URLs are skipped rather than duplicated, and the whole
 * batch undoes as one action.
 */

export interface LibraryToolResult {
  resultText: string;
  toastLabel?: string;
  undoRun?: () => void;
}

const TYPE_VALUES = LIBRARY_TYPE_ORDER as readonly string[];
const STATUS_VALUES = ["want", "doing", "done"] as const;

export const LIBRARY_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "library_add",
      description:
        "Добавить материалы в Библиотеку (база знаний): книги, статьи, видео, подкасты, курсы, инструменты. " +
        "Принимает СПИСОК — если пользователь прислал несколько ссылок, добавляй все одним вызовом. " +
        "Название, описание и обложку по ссылке система подтянет сама, их можно не указывать.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Материалы. Для ссылки достаточно поля url.",
            items: {
              type: "object",
              properties: {
                url: { type: "string", description: "Ссылка на материал" },
                title: { type: "string", description: "Название; если не указано — берётся со страницы" },
                type: { type: "string", enum: [...TYPE_VALUES], description: "Тип; если не указан — определяется по ссылке" },
                author: { type: "string", description: "Автор, канал, издание" },
                description: { type: "string", description: "О чём это, пара строк" },
                notes: { type: "string", description: "Заметки пользователя в markdown; если не указано — подставится шаблон по типу" },
                tags: { type: "array", items: { type: "string" }, description: "Теги" },
                status: { type: "string", enum: [...STATUS_VALUES], description: "want=хочу, doing=в процессе, done=готово" },
                favorite: { type: "boolean" },
                rating: { type: "integer", description: "Оценка 1–5" },
              },
            },
          },
          text: {
            type: "string",
            description: "Альтернатива items: сырой текст пользователя, из него будут вынуты все ссылки",
          },
          tags: { type: "array", items: { type: "string" }, description: "Теги, которые проставить ВСЕМ добавляемым материалам" },
          status: { type: "string", enum: [...STATUS_VALUES], description: "Статус для всех; по умолчанию want" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "library_search",
      description:
        "Найти материалы в Библиотеке по названию, автору, тегам, заметкам или домену. " +
        "Используй перед добавлением, если нужно проверить, есть ли уже такое, и чтобы отвечать на вопросы о библиотеке.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Поисковая строка; пустая — вернуть последние" },
          type: { type: "string", enum: [...TYPE_VALUES] },
          status: { type: "string", enum: [...STATUS_VALUES] },
          favorite: { type: "boolean", description: "Только избранное" },
          limit: { type: "integer", description: "Сколько вернуть, по умолчанию 15" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "library_update",
      description:
        "Изменить материал в Библиотеке: статус (прочитал/смотрю), теги, оценку, избранное, заметки. " +
        "Материал находится по части названия.",
      parameters: {
        type: "object",
        properties: {
          title_query: { type: "string", description: "Название материала или его часть" },
          status: { type: "string", enum: [...STATUS_VALUES] },
          favorite: { type: "boolean" },
          rating: { type: "integer", description: "Оценка 1–5" },
          add_tags: { type: "array", items: { type: "string" } },
          notes: { type: "string", description: "Заменить заметки" },
          append_notes: { type: "string", description: "Дописать к заметкам" },
        },
        required: ["title_query"],
      },
    },
  },
];

export const LIBRARY_TOOL_NAMES = new Set(LIBRARY_TOOLS.map((t) => t.function.name));

export async function runLibraryTool(name: string, a: Record<string, unknown>): Promise<LibraryToolResult> {
  switch (name) {
    case "library_add":
      return addTool(a);
    case "library_search":
      return searchTool(a);
    case "library_update":
      return updateTool(a);
    default:
      return { resultText: `Неизвестный инструмент библиотеки: ${name}.` };
  }
}

// ── add ──────────────────────────────────────────────────────────────────────────────────────

interface RawItem {
  url?: unknown;
  title?: unknown;
  type?: unknown;
  author?: unknown;
  description?: unknown;
  notes?: unknown;
  tags?: unknown;
  status?: unknown;
  favorite?: unknown;
  rating?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().replace(/^#/, "").toLowerCase()).filter(Boolean) : [];
const asType = (v: unknown): LibraryType | undefined => (typeof v === "string" && TYPE_VALUES.includes(v) ? (v as LibraryType) : undefined);
const asStatus = (v: unknown): LibraryStatus | undefined =>
  typeof v === "string" && (STATUS_VALUES as readonly string[]).includes(v) ? (v as LibraryStatus) : undefined;
const asRating = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : undefined;
};

/** Unfurl this many links at a time: ten links resolve in ~2 rounds without hammering the proxy. */
const UNFURL_CONCURRENCY = 4;

async function addTool(a: Record<string, unknown>): Promise<LibraryToolResult> {
  const sharedTags = strArr(a.tags);
  const sharedStatus = asStatus(a.status) ?? "want";

  const raw: RawItem[] = Array.isArray(a.items) ? (a.items as RawItem[]) : [];
  // `text` is the escape hatch: the model can forward the user's message verbatim and every link
  // in it becomes an item, which is exactly the «вот 10 ссылок» case.
  const fromText = extractLinks(str(a.text) ?? "").map((l) => ({ url: l.url } as RawItem));
  const wanted = [...raw, ...fromText.filter((f) => !raw.some((r) => str(r.url) === f.url))];

  if (wanted.length === 0) return { resultText: "Ошибка: не передано ни одного материала (items или text со ссылками)." };

  const existing = await ensureLibrary();
  const known = new Set(existing.map((i) => i.url).filter((u): u is string => !!u));
  const skipped: string[] = [];
  const queue: RawItem[] = [];
  for (const item of wanted) {
    const url = str(item.url);
    if (url && known.has(url)) {
      skipped.push(url);
      continue;
    }
    if (url) known.add(url);
    if (!url && !str(item.title)) continue; // nothing identifiable
    queue.push(item);
  }
  if (queue.length === 0) {
    return { resultText: `Ничего не добавлено — всё уже есть в библиотеке (${skipped.length}): ${skipped.join(", ")}` };
  }

  const drafts = await mapLimited(queue, UNFURL_CONCURRENCY, (item) => buildDraft(item, sharedTags, sharedStatus));

  const created: LibraryItem[] = [];
  const failures: string[] = [];
  let list = existing;
  for (const draft of drafts) {
    try {
      const out = await addLibraryItem(list, draft);
      list = out.items;
      created.push(out.item);
    } catch (e) {
      failures.push(`${draft.title || draft.url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (created.length === 0) {
    return { resultText: `Не удалось добавить: ${failures.join("; ")}` };
  }

  // The whole batch is one undo step — «верни как было» after ten links should not mean ten clicks.
  const undoRun = pushUndo(`Добавлено в библиотеку через AI: ${created.length}`, () => {
    void (async () => {
      let cur = librarySnapshot();
      for (const item of created) cur = await removeLibraryItem(cur, item.id).catch(() => cur);
    })();
  });

  const lines = created.map((i) => `- ${LIBRARY_TYPES[i.type].label}: «${i.title}»${i.author ? ` — ${i.author}` : ""}${i.domain ? ` (${i.domain})` : ""}`);
  const tail = [
    skipped.length ? `Пропущено как уже сохранённое: ${skipped.length}.` : null,
    failures.length ? `Не добавилось: ${failures.join("; ")}` : null,
  ].filter(Boolean);

  return {
    resultText: [`Добавлено в библиотеку: ${created.length}.`, ...lines, ...tail].join("\n"),
    toastLabel: created.length === 1 ? `AI добавил в библиотеку: ${created[0].title}` : `AI добавил в библиотеку: ${created.length} материалов`,
    undoRun,
  };
}

/** One draft: unfurl fills whatever the caller left out; the notes template fills the rest. */
async function buildDraft(item: RawItem, sharedTags: string[], sharedStatus: LibraryStatus): Promise<LibraryDraft> {
  const url = str(item.url);
  let title = str(item.title);
  let description = str(item.description);
  let author = str(item.author);
  let coverUrl: string | undefined;

  if (url && (!title || !description)) {
    const meta = await unfurl(url);
    title = title ?? (meta.title || undefined);
    description = description ?? (meta.description || undefined);
    author = author ?? (meta.author || meta.siteName || undefined);
    coverUrl = meta.image || undefined;
  }

  const type = asType(item.type) ?? detectType(url);
  const tags = [...new Set([...sharedTags, ...strArr(item.tags)])];

  return {
    type,
    title: title ?? (url ? prettyDomain(url) : "Без названия"),
    author,
    url,
    domain: url ? prettyDomain(url) : undefined,
    coverUrl,
    description,
    // A blank notes field turns the library back into a bookmark list — seed the per-type skeleton.
    notes: str(item.notes) ?? noteTemplate(type),
    tags,
    status: asStatus(item.status) ?? sharedStatus,
    favorite: item.favorite === true,
    rating: asRating(item.rating),
  };
}

/** Promise.all with a ceiling on how many run at once, preserving input order. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ── search / update ──────────────────────────────────────────────────────────────────────────

async function searchTool(a: Record<string, unknown>): Promise<LibraryToolResult> {
  const items = await ensureLibrary();
  const query = str(a.query) ?? "";
  const type = asType(a.type);
  const status = asStatus(a.status);
  const limitRaw = Number(a.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(50, Math.round(limitRaw)) : 15;

  const found = items
    .filter((i) => (!type || i.type === type) && (!status || i.status === status) && (a.favorite !== true || i.favorite) && matchesLibraryQuery(i, query))
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));

  if (found.length === 0) return { resultText: `В библиотеке ничего не найдено${query ? ` по «${query}»` : ""}. Всего материалов: ${items.length}.` };

  const lines = found.slice(0, limit).map((i) => describe(i));
  return {
    resultText: [`Найдено: ${found.length}${found.length > limit ? ` (показаны ${limit})` : ""}.`, ...lines].join("\n"),
  };
}

function describe(i: LibraryItem): string {
  const bits = [
    LIBRARY_TYPES[i.type].label,
    LIBRARY_STATUSES[i.status].label,
    i.favorite ? "избранное" : null,
    i.rating ? `оценка ${i.rating}` : null,
    i.tags.length ? i.tags.map((t) => `#${t}`).join(" ") : null,
  ].filter(Boolean);
  return `- «${i.title}»${i.author ? ` — ${i.author}` : ""} [${bits.join(", ")}]${i.url ? ` ${i.url}` : ""}`;
}

async function updateTool(a: Record<string, unknown>): Promise<LibraryToolResult> {
  const query = str(a.title_query) ?? "";
  if (!query) return { resultText: "Ошибка: не указано название материала." };
  const items = await ensureLibrary();
  const lower = query.toLowerCase();
  const matches = items.filter((i) => i.title.toLowerCase().includes(lower));
  if (matches.length === 0) return { resultText: `В библиотеке нет материала по «${query}».` };
  if (matches.length > 1) {
    const exact = matches.find((i) => i.title.toLowerCase() === lower);
    if (!exact) {
      return { resultText: `Несколько совпадений по «${query}»: ${matches.slice(0, 5).map((i) => i.title).join("; ")}. Уточните название.` };
    }
  }
  const item = matches.find((i) => i.title.toLowerCase() === lower) ?? matches[0];

  const patch: Partial<LibraryDraft> = {};
  const status = asStatus(a.status);
  if (status) patch.status = status;
  if (typeof a.favorite === "boolean") patch.favorite = a.favorite;
  const rating = asRating(a.rating);
  if (rating) patch.rating = rating;
  const addTags = strArr(a.add_tags);
  if (addTags.length) patch.tags = [...new Set([...item.tags, ...addTags])];
  const notes = str(a.notes);
  if (notes) patch.notes = notes;
  const append = str(a.append_notes);
  if (append) patch.notes = `${(patch.notes ?? item.notes).trimEnd()}\n\n${append}`;

  if (Object.keys(patch).length === 0) return { resultText: "Нечего менять — не передано ни одного поля." };

  const before: Partial<LibraryDraft> = {
    status: item.status,
    favorite: item.favorite,
    rating: item.rating,
    tags: item.tags,
    notes: item.notes,
  };
  await updateLibraryItem(items, item.id, patch);
  const undoRun = pushUndo(`Изменено в библиотеке через AI: ${item.title}`, () => {
    void updateLibraryItem(librarySnapshot(), item.id, before).catch(() => undefined);
  });

  const changed = Object.keys(patch)
    .map((k) => (k === "status" ? `статус → ${LIBRARY_STATUSES[patch.status!].label}` : k === "tags" ? `теги → ${patch.tags!.map((t) => `#${t}`).join(" ")}` : k))
    .join(", ");
  return {
    resultText: `Обновлено «${item.title}»: ${changed}.`,
    toastLabel: `AI обновил в библиотеке: ${item.title}`,
    undoRun,
  };
}

// ── context for the system prompt ─────────────────────────────────────────────────────────────

/**
 * Compact picture of the library for the system prompt: totals, what is in progress, the tag
 * vocabulary (so new items reuse the user's own tags instead of inventing synonyms) and the most
 * recent entries.
 */
export function describeLibrary(items = librarySnapshot()): string {
  if (items.length === 0) {
    return "Библиотека пуста. Инструмент library_add добавляет в неё книги, статьи, видео, подкасты, курсы и инструменты — по ссылке достаточно передать url.";
  }
  const byStatus = STATUS_VALUES.map((s) => `${LIBRARY_STATUSES[s].label.toLowerCase()} — ${items.filter((i) => i.status === s).length}`);
  const byType = LIBRARY_TYPE_ORDER.map((t) => ({ t, n: items.filter((i) => i.type === t).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${LIBRARY_TYPES[x.t].plural.toLowerCase()} — ${x.n}`);
  const tags = libraryTagCounts(items).slice(0, 20).map(([t, n]) => `#${t} (${n})`);
  const doing = items.filter((i) => i.status === "doing").slice(0, 5).map((i) => `- «${i.title}»${i.author ? ` — ${i.author}` : ""}`);
  const recent = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((i) => describe(i));

  return [
    `Всего материалов: ${items.length}. По статусу: ${byStatus.join(", ")}. По типу: ${byType.join(", ")}.`,
    tags.length ? `Теги в ходу: ${tags.join(", ")} — используй их, а не придумывай синонимы.` : "",
    doing.length ? `Сейчас в процессе:\n${doing.join("\n")}` : "",
    recent.length ? `Последние добавленные:\n${recent.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}
