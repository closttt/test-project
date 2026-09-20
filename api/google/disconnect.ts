import type { VercelRequest, VercelResponse } from "@vercel/node";

import { requireSession } from "../_lib/session";
import { revokeAndForget } from "../_lib/google";

/** POST → revoke the Google grant and drop the stored tokens. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!requireSession(req, res)) return;
  try {
    await revokeAndForget();
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
