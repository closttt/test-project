import type { VercelRequest, VercelResponse } from "@vercel/node";

import { jsonBody, requireSession } from "../_lib/session.js";
import { NotConnectedError, describeGmailFailure, getAccessToken, gmail, googleConfigured } from "../_lib/google.js";
import { parseMessage, type GmailMessage } from "../_lib/mail.js";

/**
 * Every Gmail endpoint in ONE serverless function: /api/gmail/status, /threads, /thread, /modify,
 * /attachment. Merged to stay under the Hobby plan's 12-function ceiling (see
 * api/auth/[action].ts); the URLs the client calls are unchanged.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireSession(req, res)) return;
  const raw = req.query.action;
  const action = (Array.isArray(raw) ? raw[0] : raw) ?? "";

  try {
    switch (action) {
      case "status":
        return await status(res);
      case "threads":
        return await threads(req, res);
      case "thread":
        return await thread(req, res);
      case "modify":
        return await modify(req, res);
      case "attachment":
        return await attachment(req, res);
      default:
        res.status(404).json({ error: `Неизвестный метод почты: ${action}` });
    }
  } catch (e) {
    const f = describeGmailFailure(e);
    res.status(f.status).json({ error: f.error, code: f.code });
  }
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * GET → { connected, email, unread, configured, reason? }. Also the sidebar's unread-badge poll,
 * so it stays cheap: one labels.get (1 quota unit).
 */
async function status(res: VercelResponse): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const cfg = googleConfigured();
  if (!cfg.ok) {
    res.status(200).json({ connected: false, configured: false, reason: cfg.reason });
    return;
  }
  try {
    const { token, email } = await getAccessToken();
    const inbox = await gmail<{ messagesUnread?: number; threadsUnread?: number }>(token, "/labels/INBOX");
    res.status(200).json({ connected: true, configured: true, email, unread: inbox.threadsUnread ?? inbox.messagesUnread ?? 0 });
  } catch (e) {
    if (e instanceof NotConnectedError) {
      res.status(200).json({ connected: false, configured: true, reason: e.message });
      return;
    }
    throw e;
  }
}

/**
 * GET ?box=inbox|starred|sent&q=&pageToken= → { threads, nextPageToken }.
 * One threads.list + one metadata threads.get per row (20 rows ≈ 210 quota units, under the
 * 250/s per-user ceiling). Gmail's own search syntax in `q` passes straight through.
 */
const BOXES: Record<string, string> = { inbox: "INBOX", starred: "STARRED", sent: "SENT" };
const PAGE = 20;

export interface ThreadSummary {
  id: string;
  subject: string;
  from: { name: string; email: string };
  snippet: string;
  date: string;
  unread: boolean;
  starred: boolean;
  messageCount: number;
  hasAttachments: boolean;
}

async function threads(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query as Record<string, string | string[] | undefined>;
  const label = BOXES[one(q.box).toLowerCase()] ?? "INBOX";
  const search = one(q.q).trim();
  const pageToken = one(q.pageToken);

  const { token } = await getAccessToken();
  const params = new URLSearchParams({ maxResults: String(PAGE) });
  // With a search query Gmail already scopes by the label via `in:`; keep the label filter too
  // unless the user typed their own `in:` / `label:` — otherwise their scope would be ANDed away.
  if (!/\b(in|label):/i.test(search)) params.append("labelIds", label);
  if (search) params.set("q", search);
  if (pageToken) params.set("pageToken", pageToken);
  const list = await gmail<{ threads?: { id: string }[]; nextPageToken?: string }>(token, `/threads?${params}`);
  const ids = (list.threads ?? []).map((t) => t.id);

  const rows = await Promise.all(
    ids.map(async (id): Promise<ThreadSummary> => {
      const t = await gmail<{ id: string; messages: GmailMessage[] }>(
        token,
        `/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
      );
      const msgs = t.messages ?? [];
      const parsed = msgs.map((m) => parseMessage(m, false));
      // Subject from the first message (the thread's real topic); sender/snippet from the latest
      // that isn't a draft.
      const first = parsed[0];
      const last = parsed[parsed.length - 1] ?? first;
      return {
        id: t.id,
        subject: first?.subject ?? "(без темы)",
        from: last?.from ?? { name: "", email: "" },
        snippet: last?.snippet ?? "",
        date: last?.date ?? new Date().toISOString(),
        unread: parsed.some((m) => m.unread),
        starred: parsed.some((m) => m.starred),
        messageCount: parsed.length,
        hasAttachments: msgs.some((m) => hasAttachment(m)),
      };
    })
  );
  rows.sort((a, b) => b.date.localeCompare(a.date));
  res.status(200).json({ threads: rows, nextPageToken: list.nextPageToken ?? null });
}

/** Metadata format still carries the part tree (without bodies) — enough to spot a filename. */
function hasAttachment(m: GmailMessage): boolean {
  const walk = (p: typeof m.payload): boolean =>
    !!p && ((!!p.filename && !!p.body?.attachmentId) || (p.parts ?? []).some(walk));
  return walk(m.payload);
}

/** GET ?id → the full thread: every message with sanitised HTML, attachments, call links, .ics. */
async function thread(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const id = one(req.query.id);
  if (!id) {
    res.status(400).json({ error: "Не указан id цепочки." });
    return;
  }
  const { token } = await getAccessToken();
  const t = await gmail<{ id: string; messages: GmailMessage[] }>(token, `/threads/${encodeURIComponent(id)}?format=full`);
  const messages = (t.messages ?? []).map((m) => parseMessage(m, true));
  res.status(200).json({
    id: t.id,
    subject: messages[0]?.subject ?? "(без темы)",
    messages,
  });
}

/**
 * POST { threadId, add?: string[], remove?: string[] } → threads.modify.
 * Only the labels the UI actually toggles are allowed through: read state, star, archive.
 */
const ALLOWED = new Set(["UNREAD", "STARRED", "INBOX"]);

async function modify(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const body = jsonBody(req);
  const threadId = typeof body.threadId === "string" ? body.threadId : "";
  const pick = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ALLOWED.has(x)) : []);
  const add = pick(body.add);
  const remove = pick(body.remove);
  if (!threadId || (add.length === 0 && remove.length === 0)) {
    res.status(400).json({ error: "Нужны threadId и хотя бы одна метка." });
    return;
  }
  const { token } = await getAccessToken();
  await gmail(token, `/threads/${encodeURIComponent(threadId)}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
  res.status(200).json({ ok: true });
}

/**
 * GET ?messageId&id&name&type → the attachment bytes as a download. Plain `<a href>` from the
 * Mail page: the session cookie rides along, so no token ever reaches the browser.
 */
async function attachment(req: VercelRequest, res: VercelResponse): Promise<void> {
  const q = req.query as Record<string, string | string[] | undefined>;
  const messageId = one(q.messageId);
  const id = one(q.id);
  const name = one(q.name) || "attachment";
  const type = one(q.type) || "application/octet-stream";
  if (!messageId || !id) {
    res.status(400).json({ error: "Нужны messageId и id вложения." });
    return;
  }
  const { token } = await getAccessToken();
  const part = await gmail<{ data?: string; size?: number }>(
    token,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(id)}`
  );
  const bytes = Buffer.from((part.data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
  // Never let a browser render an attachment inline as HTML/SVG on our origin.
  const safeType = /^(text\/html|image\/svg\+xml|application\/xhtml)/i.test(type) ? "application/octet-stream" : type;
  res.setHeader("Content-Type", safeType);
  res.setHeader("Content-Length", String(bytes.length));
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).end(bytes);
}
