import type { VercelRequest, VercelResponse } from "@vercel/node";

import { requireSession } from "../_lib/session";
import { describeGmailFailure, getAccessToken, gmail } from "../_lib/google";
import { parseMessage, type GmailMessage } from "../_lib/mail";

/** GET ?id → the full thread: every message with sanitised HTML, attachments, call links, .ics. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireSession(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  const raw = req.query.id;
  const id = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  if (!id) {
    res.status(400).json({ error: "Не указан id цепочки." });
    return;
  }
  try {
    const { token } = await getAccessToken();
    const t = await gmail<{ id: string; messages: GmailMessage[] }>(token, `/threads/${encodeURIComponent(id)}?format=full`);
    const messages = (t.messages ?? []).map((m) => parseMessage(m, true));
    res.status(200).json({
      id: t.id,
      subject: messages[0]?.subject ?? "(без темы)",
      messages,
    });
  } catch (e) {
    const f = describeGmailFailure(e);
    res.status(f.status).json({ error: f.error, code: f.code });
  }
}
