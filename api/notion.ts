import type { VercelRequest, VercelResponse } from "@vercel/node";

import { jsonBody, requireSession } from "./_lib/session";

/**
 * Notion proxy (plan B2). One Internal Integration token lives in `NOTION_TOKEN` on the server;
 * the browser never sees it and only ever asks for a handful of named actions. This is exactly
 * what the Notion MCP server does under the hood — plain REST calls — so "закинь это в Notion"
 * from the assistant works without any MCP plumbing in the web app.
 *
 * Actions (POST { action, ... }):
 *  - status                      → { connected, name }         who the integration is
 *  - search { query, kind? }     → { results: [{ id, kind, title, url }] }
 *  - create_page { parent, title, children } → { id, url }
 *  - append { pageId, children } → { blockIds }                for undo (delete_blocks)
 *  - archive_page { pageId }     → { ok }                      undo for create_page
 *  - delete_blocks { ids }       → { ok }                      undo for append
 *
 * Block objects are built client-side (`src/lib/notionBlocks.ts`) so the converter stays
 * unit-tested with the rest of the app and this function is a thin, dumb relay.
 */

const NOTION = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

type Json = Record<string, unknown>;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!requireSession(req, res)) return;

  const token = process.env.NOTION_TOKEN;
  const body = jsonBody(req);
  const action = typeof body.action === "string" ? body.action : "";

  if (!token) {
    // `status` must answer cleanly so Settings can explain what's missing instead of erroring.
    if (action === "status") {
      res.status(200).json({ connected: false, reason: "NOTION_TOKEN не задан в переменных окружения Vercel." });
      return;
    }
    res.status(503).json({ error: "Notion не подключён — задайте NOTION_TOKEN в Vercel." });
    return;
  }

  try {
    switch (action) {
      case "status": {
        const me = await notion(token, "GET", "/users/me");
        const name = (me.name as string) || ((me.bot as Json | undefined)?.owner as Json | undefined)?.type || "integration";
        res.status(200).json({ connected: true, name });
        return;
      }
      case "search": {
        const query = typeof body.query === "string" ? body.query.trim() : "";
        const kind = body.kind === "page" || body.kind === "database" ? body.kind : undefined;
        const out = await notion(token, "POST", "/search", {
          ...(query ? { query } : {}),
          ...(kind ? { filter: { property: "object", value: kind } } : {}),
          sort: { direction: "descending", timestamp: "last_edited_time" },
          page_size: 12,
        });
        const results = ((out.results as Json[]) ?? []).map(describeObject).filter(Boolean);
        res.status(200).json({ results });
        return;
      }
      case "create_page": {
        const parent = body.parent as { type?: string; id?: string } | undefined;
        const title = typeof body.title === "string" ? body.title.trim() : "";
        const children = Array.isArray(body.children) ? (body.children as Json[]) : [];
        if (!parent?.id || (parent.type !== "page_id" && parent.type !== "database_id")) {
          res.status(400).json({ error: "Не указана родительская страница или база Notion." });
          return;
        }
        if (!title) {
          res.status(400).json({ error: "Не указан заголовок страницы." });
          return;
        }
        // In a database the title property is user-named ("Name", "Название", …); look it up.
        let titleProp = "title";
        if (parent.type === "database_id") {
          const db = await notion(token, "GET", `/databases/${parent.id}`);
          const props = (db.properties as Record<string, Json>) ?? {};
          titleProp = Object.keys(props).find((k) => props[k].type === "title") ?? "title";
        }
        const first = children.slice(0, 100);
        const rest = children.slice(100);
        const page = await notion(token, "POST", "/pages", {
          parent: { [parent.type]: parent.id },
          properties: { [titleProp]: { title: [{ type: "text", text: { content: title.slice(0, 2000) } }] } },
          ...(first.length ? { children: first } : {}),
        });
        const pageId = page.id as string;
        for (let i = 0; i < rest.length; i += 100) {
          await notion(token, "PATCH", `/blocks/${pageId}/children`, { children: rest.slice(i, i + 100) });
        }
        res.status(200).json({ id: pageId, url: page.url as string });
        return;
      }
      case "append": {
        const pageId = typeof body.pageId === "string" ? body.pageId : "";
        const children = Array.isArray(body.children) ? (body.children as Json[]) : [];
        if (!pageId || children.length === 0) {
          res.status(400).json({ error: "Нужны страница и хотя бы один блок." });
          return;
        }
        const blockIds: string[] = [];
        for (let i = 0; i < children.length; i += 100) {
          const out = await notion(token, "PATCH", `/blocks/${pageId}/children`, { children: children.slice(i, i + 100) });
          for (const b of (out.results as Json[]) ?? []) if (typeof b.id === "string") blockIds.push(b.id);
        }
        res.status(200).json({ blockIds });
        return;
      }
      case "archive_page": {
        const pageId = typeof body.pageId === "string" ? body.pageId : "";
        if (!pageId) {
          res.status(400).json({ error: "Не указана страница." });
          return;
        }
        await notion(token, "PATCH", `/pages/${pageId}`, { archived: true });
        res.status(200).json({ ok: true });
        return;
      }
      case "delete_blocks": {
        const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
        for (const id of ids) await notion(token, "DELETE", `/blocks/${id}`);
        res.status(200).json({ ok: true });
        return;
      }
      default:
        res.status(400).json({ error: `Неизвестное действие Notion: «${action}».` });
    }
  } catch (e) {
    if (e instanceof NotionError) {
      res.status(e.status >= 500 ? 502 : e.status).json({ error: e.message });
      return;
    }
    res.status(502).json({ error: `Notion недоступен: ${e instanceof Error ? e.message : String(e)}` });
  }
}

class NotionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function notion(token: string, method: string, path: string, payload?: Json): Promise<Json> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${NOTION}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": VERSION,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    const json = text ? (safeParse(text) as Json) : {};
    if (!res.ok) throw new NotionError(res.status, describeNotionError(res.status, json));
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function describeNotionError(status: number, j: Json): string {
  const msg = typeof j.message === "string" ? j.message : "";
  if (status === 401) return "Notion отклонил токен — проверьте NOTION_TOKEN.";
  if (status === 404) return "Страница не найдена или не расшарена интеграции (страница → ⋯ → Connections).";
  if (status === 429) return "Notion: слишком много запросов, попробуйте через минуту.";
  return `Notion ${status}${msg ? `: ${msg}` : ""}`;
}

/** Flatten a search hit into what the picker / assistant needs. */
function describeObject(o: Json): { id: string; kind: "page" | "database"; title: string; url: string } | null {
  if (o.object !== "page" && o.object !== "database") return null;
  const kind = o.object as "page" | "database";
  let title = "";
  if (kind === "database") {
    title = plain(o.title as Json[]);
  } else {
    const props = (o.properties as Record<string, Json>) ?? {};
    const tp = Object.values(props).find((p) => p.type === "title");
    title = plain((tp?.title as Json[]) ?? []);
  }
  return { id: o.id as string, kind, title: title || "Без названия", url: (o.url as string) ?? "" };
}

function plain(rich: Json[] | undefined): string {
  return (rich ?? []).map((r) => (typeof r.plain_text === "string" ? r.plain_text : "")).join("");
}
