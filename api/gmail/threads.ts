import type { VercelRequest, VercelResponse } from "@vercel/node";

import { requireSession } from "../_lib/session";
import { describeGmailFailure, getAccessToken, gmail } from "../_lib/google";
import { parseMessage, type GmailMessage } from "../_lib/mail";

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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireSession(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  const q = req.query as Record<string, string | string[] | undefined>;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const label = BOXES[one(q.box).toLowerCase()] ?? "INBOX";
  const search = one(q.q).trim();
  const pageToken = one(q.pageToken);

  try {
    const { token } = await getAccessToken();
    const params = new URLSearchParams({ maxResults: String(PAGE) });
    // With a search query Gmail already scopes by the label via `in:`; keep the label filter too
    // unless the user typed their own `in:` / `label:` — otherwise their scope would be ANDed away.
    if (!/\b(in|label):/i.test(search)) params.append("labelIds", label);
    if (search) params.set("q", search);
    if (pageToken) params.set("pageToken", pageToken);
    const list = await gmail<{ threads?: { id: string }[]; nextPageToken?: string }>(token, `/threads?${params}`);
    const ids = (list.threads ?? []).map((t) => t.id);

    const threads = await Promise.all(
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
    threads.sort((a, b) => b.date.localeCompare(a.date));
    res.status(200).json({ threads, nextPageToken: list.nextPageToken ?? null });
  } catch (e) {
    const f = describeGmailFailure(e);
    res.status(f.status).json({ error: f.error, code: f.code });
  }
}

/** Metadata format still carries the part tree (without bodies) — enough to spot a filename. */
function hasAttachment(m: GmailMessage): boolean {
  const walk = (p: typeof m.payload): boolean =>
    !!p && ((!!p.filename && !!p.body?.attachmentId) || (p.parts ?? []).some(walk));
  return walk(m.payload);
}
