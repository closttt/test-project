import type { VercelRequest, VercelResponse } from "@vercel/node";

import { clearSessionCookie } from "../_lib/session";

/** POST → drops the session cookie on this device only (the token is stateless, nothing to revoke server-side). */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  clearSessionCookie(req, res);
  res.status(200).json({ ok: true });
}
