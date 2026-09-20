import type { VercelRequest, VercelResponse } from "@vercel/node";

import { jsonBody, requireSession } from "../_lib/session";
import { describeGmailFailure, getAccessToken, gmail } from "../_lib/google";

/**
 * POST { threadId, add?: string[], remove?: string[] } → threads.modify.
 * Only the labels the UI actually toggles are allowed through: read state, star, archive.
 */
const ALLOWED = new Set(["UNREAD", "STARRED", "INBOX"]);

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!requireSession(req, res)) return;
  const body = jsonBody(req);
  const threadId = typeof body.threadId === "string" ? body.threadId : "";
  const pick = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ALLOWED.has(x)) : []);
  const add = pick(body.add);
  const remove = pick(body.remove);
  if (!threadId || (add.length === 0 && remove.length === 0)) {
    res.status(400).json({ error: "Нужны threadId и хотя бы одна метка." });
    return;
  }
  try {
    const { token } = await getAccessToken();
    await gmail(token, `/threads/${encodeURIComponent(threadId)}/modify`, {
      method: "POST",
      body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    const f = describeGmailFailure(e);
    res.status(f.status).json({ error: f.error, code: f.code });
  }
}
