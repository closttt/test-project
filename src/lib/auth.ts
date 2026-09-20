/**
 * Client half of the app sign-in (plan B0). The server issues a signed httpOnly cookie; the
 * browser never sees the token, so all this module does is ask "am I in?", send the password,
 * and route every integration request through `apiFetch` so a lapsed session flips the app back
 * to the login screen instead of surfacing as a dozen unrelated errors.
 */

export interface AuthStatus {
  /** APP_PASSWORD is set on the server — a login is needed at all. */
  required: boolean;
  authenticated: boolean;
}

/** Fired (on `window`) when any API call comes back 401 — AuthGate listens and shows the login. */
export const AUTH_REQUIRED_EVENT = "crm-auth-required";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Нужен вход в приложение.");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Status probe. Anything that isn't a clean JSON answer (Vite dev without `vercel dev`, a
 * missing function, offline) is treated as "no lock" in development and as "locked, retry" in
 * production — the deployed site must never fall open because the status call failed.
 */
export async function fetchAuthStatus(): Promise<AuthStatus | null> {
  try {
    const res = await fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const ct = res.headers.get("Content-Type") ?? "";
    if (!ct.includes("application/json")) throw new Error("not json");
    const j = (await res.json()) as Partial<AuthStatus>;
    return { required: Boolean(j.required), authenticated: Boolean(j.authenticated) };
  } catch {
    return import.meta.env.PROD ? null : { required: false, authenticated: true };
  }
}

export async function login(password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
}

/**
 * `fetch` for our own `/api/*` functions: same-origin cookie, JSON in/out, and a 401 with
 * `code: "unauthenticated"` is turned into the login screen rather than a generic error.
 * Throws an Error with the server's Russian message on any non-2xx.
 */
export async function apiFetch<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    credentials: "same-origin",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  }).catch(() => {
    throw new Error("Нет связи с сервером приложения.");
  });
  if (res.status === 401) {
    const body = await res.clone().json().catch(() => ({}));
    if ((body as { code?: string }).code === "unauthenticated") {
      window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
      throw new UnauthenticatedError();
    }
  }
  if (!res.ok) throw new Error(await readError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function readError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const j = JSON.parse(raw);
    const err = j?.error ?? j;
    const msg = typeof err === "string" ? err : err?.message;
    if (msg) return String(msg);
  } catch {
    // not JSON
  }
  return raw ? raw.slice(0, 300) : `Сервер вернул ${res.status}`;
}
