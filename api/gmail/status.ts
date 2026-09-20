import type { VercelRequest, VercelResponse } from "@vercel/node";

import { requireSession } from "../_lib/session";
import { NotConnectedError, describeGmailFailure, getAccessToken, gmail, googleConfigured } from "../_lib/google";

/**
 * GET → { connected, email, unread, configured, reason? }. Also the sidebar's unread-badge poll,
 * so it stays cheap: one labels.get (1 quota unit).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireSession(req, res)) return;
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
    const f = describeGmailFailure(e);
    res.status(f.status).json({ error: f.error, code: f.code });
  }
}
