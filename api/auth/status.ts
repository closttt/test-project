import type { VercelRequest, VercelResponse } from "@vercel/node";

import { authRequired, isAuthenticated } from "../_lib/session";

/** GET → { required, authenticated }. `required: false` means APP_PASSWORD isn't set and the app is open. */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ required: authRequired(), authenticated: isAuthenticated(req) });
}
