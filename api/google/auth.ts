import type { VercelRequest, VercelResponse } from "@vercel/node";

import { requireSession } from "../_lib/session";
import { GOOGLE_SCOPES, googleConfigured, issueState, redirectUri } from "../_lib/google";

/** GET → bounce the signed-in user to Google's consent screen (plan B1). */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (!requireSession(req, res)) return;
  const cfg = googleConfigured();
  if (!cfg.ok) {
    res.status(503).json({ error: cfg.reason });
    return;
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    // `consent` forces Google to return a refresh token even when the user granted access before.
    prompt: "consent",
    include_granted_scopes: "true",
    state: issueState(),
  });
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
