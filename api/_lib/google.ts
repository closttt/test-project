import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";

/**
 * Google OAuth + token storage for the Gmail integration (plan B1).
 *
 * Env (server-only, Vercel project settings):
 *  - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — OAuth client of type "Web application". Add
 *    `<origin>/api/google/callback` to its authorised redirect URIs. In a Google Workspace project
 *    set the consent screen to Internal: no verification, refresh tokens don't expire.
 *  - SUPABASE_URL (falls back to VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY — the token row
 *    lives in `integration_tokens` (see supabase/integrations.sql), reachable only with the
 *    service key. Never ship that key to the browser.
 *  - APP_SECRET / APP_PASSWORD — signs the OAuth `state` (CSRF), same key as the session cookie.
 */

export const GOOGLE_SCOPES = [
  // Read + label/star/archive + (later) reply. Restricted scope → Internal app or verification.
  "https://www.googleapis.com/auth/gmail.modify",
];

const PROVIDER = "google";

export interface TokenRow {
  provider: string;
  account_email: string | null;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
  scope: string | null;
}

export function googleConfigured(): { ok: true } | { ok: false; reason: string } {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return { ok: false, reason: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET не заданы в Vercel." };
  }
  if (!supabaseUrl() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не заданы — некуда сохранить токен." };
  }
  return { ok: true };
}

function supabaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
}

/** The site's own origin as seen by the browser — the OAuth redirect must come back to the same host. */
export function requestOrigin(req: VercelRequest): string {
  const fromEnv = process.env.APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const host = first(req.headers["x-forwarded-host"]) ?? first(req.headers.host) ?? "localhost:3000";
  const proto = first(req.headers["x-forwarded-proto"]) ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function redirectUri(req: VercelRequest): string {
  return `${requestOrigin(req)}/api/google/callback`;
}

// ── CSRF state ──────────────────────────────────────────────────────────────────────────────

function stateSecret(): string {
  return `oauth-state:${process.env.APP_SECRET || process.env.APP_PASSWORD || process.env.GOOGLE_CLIENT_SECRET || ""}`;
}

/** `<nonce>.<ts>.<hmac>` — valid for 10 minutes, verifiable without server state. */
export function issueState(now = Date.now()): string {
  const payload = `${randomBytes(12).toString("base64url")}.${now}`;
  return `${payload}.${createHmac("sha256", stateSecret()).update(payload).digest("base64url")}`;
}

export function verifyState(state: string | undefined, now = Date.now()): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, ts, mac] = parts;
  if (!/^\d+$/.test(ts) || now - Number(ts) > 10 * 60 * 1000) return false;
  const expected = createHmac("sha256", stateSecret()).update(`${nonce}.${ts}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Token storage (PostgREST with the service key — no supabase-js in the function bundle) ─

async function rest<T>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const { prefer, headers, ...rest } = init;
  const res = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...rest,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...(headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function loadTokens(): Promise<TokenRow | null> {
  const rows = await rest<TokenRow[]>(`integration_tokens?provider=eq.${PROVIDER}&select=*`);
  return rows[0] ?? null;
}

export async function saveTokens(row: Omit<TokenRow, "provider">): Promise<void> {
  await rest(`integration_tokens?on_conflict=provider`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify([{ provider: PROVIDER, ...row, updated_at: new Date().toISOString() }]),
  });
}

export async function deleteTokens(): Promise<void> {
  await rest(`integration_tokens?provider=eq.${PROVIDER}`, { method: "DELETE", prefer: "return=minimal" });
}

// ── OAuth exchange / refresh ────────────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...params,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(`Google OAuth: ${json.error ?? res.status}${json.error_description ? ` — ${json.error_description}` : ""}`);
  }
  return json;
}

export async function exchangeCode(code: string, redirect: string): Promise<TokenResponse> {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirect });
}

export class NotConnectedError extends Error {
  constructor(msg = "Gmail не подключён — нажмите «Подключить» в Настройках → Интеграции.") {
    super(msg);
    this.name = "NotConnectedError";
  }
}

/** A live access token, refreshed (and persisted) when it has under a minute left. */
export async function getAccessToken(): Promise<{ token: string; email: string | null }> {
  const row = await loadTokens();
  if (!row) throw new NotConnectedError();
  const fresh = row.access_token && row.expires_at && new Date(row.expires_at).getTime() - Date.now() > 60_000;
  if (fresh) return { token: row.access_token as string, email: row.account_email };
  let refreshed: TokenResponse;
  try {
    refreshed = await tokenRequest({ refresh_token: row.refresh_token, grant_type: "refresh_token" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // invalid_grant = revoked / expired (7-day Testing-mode refresh tokens) → must reconnect.
    if (/invalid_grant/.test(msg)) {
      await deleteTokens().catch(() => undefined);
      throw new NotConnectedError("Доступ к Gmail истёк или отозван — подключите почту заново в Настройках.");
    }
    throw e;
  }
  await saveTokens({
    account_email: row.account_email,
    refresh_token: refreshed.refresh_token ?? row.refresh_token,
    access_token: refreshed.access_token,
    expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    scope: refreshed.scope ?? row.scope,
  });
  return { token: refreshed.access_token, email: row.account_email };
}

export async function revokeAndForget(): Promise<void> {
  const row = await loadTokens();
  if (row) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.refresh_token)}`, { method: "POST" }).catch(
      () => undefined
    );
  }
  await deleteTokens();
}

// ── Gmail REST ──────────────────────────────────────────────────────────────────────────────

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GmailError";
  }
}

export async function gmail<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GMAIL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = j.error?.message ?? res.statusText;
    if (res.status === 401) throw new GmailError(401, "Gmail отклонил токен — переподключите почту в Настройках.");
    if (res.status === 403 && /insufficient|scope/i.test(msg)) {
      throw new GmailError(403, "Недостаточно прав у токена — переподключите почту, чтобы выдать доступ заново.");
    }
    if (res.status === 429) throw new GmailError(429, "Gmail: слишком много запросов, попробуйте через минуту.");
    throw new GmailError(res.status, `Gmail ${res.status}: ${msg}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Turn any error from this module into the right HTTP status + Russian message. */
export function describeGmailFailure(e: unknown): { status: number; error: string; code?: string } {
  if (e instanceof NotConnectedError) return { status: 409, error: e.message, code: "not_connected" };
  if (e instanceof GmailError) return { status: e.status >= 500 ? 502 : e.status, error: e.message };
  return { status: 502, error: `Почта недоступна: ${e instanceof Error ? e.message : String(e)}` };
}
