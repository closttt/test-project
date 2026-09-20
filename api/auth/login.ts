import type { VercelRequest, VercelResponse } from "@vercel/node";

import { authRequired, checkPassword, issueToken, jsonBody, setSessionCookie } from "../_lib/session";

/** POST { password } → sets the session cookie for a year on this device. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
}
