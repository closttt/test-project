import { apiFetch } from "@/lib/auth";
import { markdownToBlocks } from "@/lib/notionBlocks";

/**
 * Client for our Notion relay (`api/notion.ts`, plan B2). The token is server-side; here we keep
 * only the user's choice of a default target («Инбокс» page or database) and a cached
 * "connected" flag so the assistant knows whether to offer the Notion tools at all without a
 * network round-trip on every message.
 */

export type NotionParentKind = "page" | "database";

export interface NotionTarget {
  id: string;
  kind: NotionParentKind;
  title: string;
  url: string;
}

export interface NotionStatus {
  connected: boolean;
  name?: string;
  reason?: string;
}

const TARGET_KEY = "crm-notion-target-v1";
const CONNECTED_KEY = "crm-notion-connected-v1";

export function loadNotionTarget(): NotionTarget | null {
  try {
    const raw = localStorage.getItem(TARGET_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as NotionTarget;
    return t && t.id && (t.kind === "page" || t.kind === "database") ? t : null;
  } catch {
    return null;
  }
}

export function saveNotionTarget(target: NotionTarget | null): void {
  if (target) localStorage.setItem(TARGET_KEY, JSON.stringify(target));
  else localStorage.removeItem(TARGET_KEY);
}

/** Last known connection state — refreshed by Settings / the first tool call. */
export function isNotionConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberConnected(v: boolean) {
  try {
    if (v) localStorage.setItem(CONNECTED_KEY, "1");
    else localStorage.removeItem(CONNECTED_KEY);
  } catch {
    // storage unavailable — the flag is only an optimisation
  }
}

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  return apiFetch<T>("/api/notion", { method: "POST", json: payload });
}

export async function notionStatus(): Promise<NotionStatus> {
  try {
    const s = await call<NotionStatus>({ action: "status" });
    rememberConnected(s.connected);
    return s;
  } catch (e) {
    rememberConnected(false);
    return { connected: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function notionSearch(query: string, kind?: NotionParentKind): Promise<NotionTarget[]> {
  const out = await call<{ results: NotionTarget[] }>({ action: "search", query, kind });
  return out.results;
}

export interface CreatedPage {
  id: string;
  url: string;
}

/**
 * New page under `parent` (defaults to the saved target). Throws a readable error when there is
 * no target at all — callers surface it as "выберите страницу в Настройках".
 */
export async function notionCreatePage(input: { title: string; markdown: string; parent?: NotionTarget | null }): Promise<CreatedPage> {
  const parent = input.parent ?? loadNotionTarget();
  if (!parent) throw new Error("Не выбрана страница Notion по умолчанию — задайте её в Настройках → Интеграции.");
  return call<CreatedPage>({
    action: "create_page",
    parent: { type: parent.kind === "database" ? "database_id" : "page_id", id: parent.id },
    title: input.title,
    children: markdownToBlocks(input.markdown),
  });
}

/** Append markdown to an existing page; returns the new block ids so the caller can undo. */
export async function notionAppend(pageId: string, markdown: string): Promise<string[]> {
  const blocks = markdownToBlocks(markdown);
  if (blocks.length === 0) return [];
  const out = await call<{ blockIds: string[] }>({ action: "append", pageId, children: blocks });
  return out.blockIds;
}

export async function notionArchivePage(pageId: string): Promise<void> {
  await call({ action: "archive_page", pageId });
}

export async function notionDeleteBlocks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await call({ action: "delete_blocks", ids });
}
