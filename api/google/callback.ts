import type { VercelRequest, VercelResponse } from "@vercel/node";

import { isAuthenticated } from "../_lib/session";
import { exchangeCode, gmail, redirectUri, saveTokens, verifyState } from "../_lib/google";

/**
 * GET ?code&state → exchange for tokens, remember which mailbox this is, send the user back to
 * Settings. Errors land on Settings too, as a query param the Integrations card shows — a bare
 * JSON error page after a Google round-trip is a dead end.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
