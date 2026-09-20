import type { VercelRequest, VercelResponse } from "@vercel/node";

import { requireSession } from "../_lib/session";
import { describeGmailFailure, getAccessToken, gmail } from "../_lib/google";

/**
 * GET ?messageId&id&name&type → the attachment bytes as a download. Plain `<a href>` from the
 * Mail page: the session cookie rides along, so no token ever reaches the browser.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireSession(req, res)) return;
  const q = req.query as Record<string, string | string[] | undefined>;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const messageId = one(q.messageId);
  const id = one(q.id);
  const name = one(q.name) || "attachment";
  const type = one(q.type) || "application/octet-stream";
  if (!messageId || !id) {
    res.status(400).json({ error: "Нужны messageId и id вложения." });
    return;
  }
  try {
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
  } catch (e) {
    const f = describeGmailFailure(e);
    res.status(f.status).json({ error: f.error, code: f.code });
  }
}
