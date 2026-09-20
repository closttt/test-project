import type { VercelRequest, VercelResponse } from "@vercel/node";

import { isAuthenticated, requireSession } from "../_lib/session";
import {
  GOOGLE_SCOPES,
  exchangeCode,
  gmail,
  googleConfigured,
  issueState,
  redirectUri,
  revokeAndForget,
  saveTokens,
  verifyState,
} from "../_lib/google";

/**
 * The Google OAuth dance in ONE serverless function: /api/google/auth, /callback, /disconnect.
 * Merged to stay under the Hobby plan's 12-function ceiling (see api/auth/[action].ts). The URLs
 * are unchanged, which matters most for `/api/google/callback` — it is registered verbatim as the
 * redirect URI in the Google Cloud console.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const raw = req.query.action;
  const action = (Array.isArray(raw) ? raw[0] : raw) ?? "";

  switch (action) {
    case "auth":
      return start(req, res);
    case "callback":
      return callback(req, res);
    case "disconnect":
      return disconnect(req, res);
    default:
      res.status(404).json({ error: `Неизвестное действие Google: ${action}` });
  }
}

/** GET → bounce the signed-in user to Google's consent screen (plan B1). */
function start(req: VercelRequest, res: VercelResponse): void {
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

/**
 * GET ?code&state → exchange for tokens, remember which mailbox this is, send the user back to
 * Settings. Errors land on Settings too, as a query param the Integrations card shows — a bare
 * JSON error page after a Google round-trip is a dead end.
 */
async function callback(req: VercelRequest, res: VercelResponse): Promise<void> {
  const back = (q: string) => {
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, `/settings?${q}`);
  };
  if (!isAuthenticated(req)) {
    back("gmail=error&reason=" + encodeURIComponent("Сессия приложения истекла — войдите и повторите."));
    return;
  }
  const q = req.query as Record<string, string | string[] | undefined>;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  if (one(q.error)) {
    back("gmail=error&reason=" + encodeURIComponent(`Google: ${one(q.error)}`));
    return;
  }
  const code = one(q.code);
  if (!code || !verifyState(one(q.state))) {
    back("gmail=error&reason=" + encodeURIComponent("Недействительный ответ Google (state) — попробуйте подключить ещё раз."));
    return;
  }
  try {
    const tok = await exchangeCode(code, redirectUri(req));
    if (!tok.refresh_token) {
      throw new Error("Google не вернул refresh-токен. Отзовите доступ приложения в аккаунте Google и подключите заново.");
    }
    const profile = await gmail<{ emailAddress?: string }>(tok.access_token, "/profile");
    await saveTokens({
      account_email: profile.emailAddress ?? null,
      refresh_token: tok.refresh_token,
      access_token: tok.access_token,
      expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
      scope: tok.scope ?? null,
    });
    back("gmail=connected");
  } catch (e) {
    back("gmail=error&reason=" + encodeURIComponent(e instanceof Error ? e.message : String(e)));
  }
}

/** POST → revoke the Google grant and drop the stored tokens. */
async function disconnect(req: VercelRequest, res: VercelResponse): Promise<void> {
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
