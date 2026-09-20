import type { VercelRequest, VercelResponse } from "@vercel/node";

import { authRequired, checkPassword, clearSessionCookie, isAuthenticated, issueToken, jsonBody, setSessionCookie } from "../_lib/session";

/**
 * All three session endpoints in ONE serverless function: /api/auth/login, /logout, /status.
 *
 * Why merged: Vercel's Hobby plan allows 12 serverless functions per deployment, and one file per
 * endpoint put this project at 14 — the build succeeded and the deploy then failed at "Deploying
 * outputs". A dynamic segment keeps the public URLs byte-identical while collapsing three
 * functions into one, so nothing on the client changes.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const raw = req.query.action;
  const action = (Array.isArray(raw) ? raw[0] : raw) ?? "";

  switch (action) {
    case "status":
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ required: authRequired(), authenticated: isAuthenticated(req) });
      return;

    case "login": {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }
      if (!authRequired()) {
        res.status(200).json({ ok: true, required: false });
        return;
      }
      const { password } = jsonBody(req);
      if (!checkPassword(password)) {
        // Small fixed delay: makes online guessing slower without any shared state to rate-limit on.
        await new Promise((r) => setTimeout(r, 400));
        res.status(401).json({ error: "Неверный пароль." });
        return;
      }
      setSessionCookie(req, res, issueToken());
      res.status(200).json({ ok: true, required: true });
      return;
    }

    case "logout":
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }
      // The token is stateless, so there is nothing to revoke server-side — this drops the cookie
      // on THIS device only.
      clearSessionCookie(req, res);
      res.status(200).json({ ok: true });
      return;

    default:
      res.status(404).json({ error: `Неизвестный метод авторизации: ${action}` });
  }
}
