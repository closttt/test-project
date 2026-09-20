import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * App-level sign-in (plan B0). The app used to be readable by anyone holding the URL; now that it
 * proxies the user's mailbox and Notion workspace, every integration function checks a signed
 * httpOnly cookie before touching a token.
 *
 * Env:
 *  - APP_PASSWORD — the one password. When it's NOT set, auth is OFF (local dev without a
 *    `.env`, or a deliberately open deployment) and every check here passes.
 *  - APP_SECRET   — HMAC key for the cookie. Optional; falls back to a hash of APP_PASSWORD so a
 *    single env var is enough to get going. Rotating either one logs every device out.
 *
 * Deliberately no user table, no Supabase auth: single-user tool, one password, one cookie.
 * The Supabase anon data stays as it was (accepted trade-off, see docs/PLAN-ecosystem.md).
 */

export const SESSION_COOKIE = "crm_session";
const MAX_AGE_S = 365 * 24 * 60 * 60;

export function authRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

function secret(): Buffer {
  const raw = process.env.APP_SECRET || process.env.APP_PASSWORD || "";
  return createHash("sha256").update(`crm-session:${raw}`).digest();
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** `<expiresAtMs>.<hmac>` — nothing secret inside, only proof it was minted by us and when it lapses. */
export function issueToken(now = Date.now()): string {
  const exp = String(now + MAX_AGE_S * 1000);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token: string | undefined | null, now = Date.now()): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < now) return false;
  const expected = sign(exp);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Constant-time password check (both sides hashed so lengths never leak). */
export function checkPassword(input: unknown): boolean {
  const want = process.env.APP_PASSWORD;
  if (!want || typeof input !== "string") return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(want).digest();
  return timingSafeEqual(a, b);
}

export function readCookie(req: VercelRequest, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function isHttps(req: VercelRequest): boolean {
  const proto = req.headers["x-forwarded-proto"];
  return (Array.isArray(proto) ? proto[0] : proto) === "https";
}

export function setSessionCookie(req: VercelRequest, res: VercelResponse, token: string): void {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_S}`,
  ];
  // `vercel dev` serves plain http — a Secure cookie would never come back there.
  if (isHttps(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(req: VercelRequest, res: VercelResponse): void {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isHttps(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function isAuthenticated(req: VercelRequest): boolean {
  if (!authRequired()) return true;
  return verifyToken(readCookie(req, SESSION_COOKIE));
}

/**
 * Gate for every integration function. Returns false (and has already sent a 401) when the
 * caller must sign in first; the client's `apiFetch` recognises `code: "unauthenticated"` and
 * flips the app back to the login screen.
 */
export function requireSession(req: VercelRequest, res: VercelResponse): boolean {
  if (isAuthenticated(req)) return true;
  res.status(401).json({ error: "Нужен вход в приложение.", code: "unauthenticated" });
  return false;
}

/** Body helper shared by the JSON endpoints — Vercel hands us a parsed object or a raw string. */
export function jsonBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body;
  if (b && typeof b === "object") return b as Record<string, unknown>;
  if (typeof b === "string") {
    try {
      const parsed = JSON.parse(b);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}
