import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  issueToken,
  verifyToken,
  checkPassword,
  authRequired,
  isAuthenticated,
  requireSession,
  readCookie,
  setSessionCookie,
  SESSION_COOKIE,
} from "../../../api/_lib/session";
import loginHandler from "../../../api/auth/login";
import statusHandler from "../../../api/auth/status";

/** Just enough of Vercel's req/res for the auth functions. */
function fakeReq(over: { method?: string; body?: unknown; cookie?: string; https?: boolean } = {}) {
  return {
    method: over.method ?? "GET",
    body: over.body,
    headers: {
      ...(over.cookie ? { cookie: over.cookie } : {}),
      ...(over.https ? { "x-forwarded-proto": "https" } : {}),
    },
  } as unknown as Parameters<typeof loginHandler>[0];
}

function fakeRes() {
  const out = { status: 200, headers: {} as Record<string, string>, body: undefined as unknown };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; return res; },
    setHeader(k: string, v: string) { out.headers[k] = v; return res; },
    end() { return res; },
  };
  return { res: res as unknown as Parameters<typeof loginHandler>[1], out };
}

describe("app session (plan B0)", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.APP_PASSWORD = "secret-pass";
    delete process.env.APP_SECRET;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("is off entirely when APP_PASSWORD is not set", () => {
    delete process.env.APP_PASSWORD;
    expect(authRequired()).toBe(false);
    expect(isAuthenticated(fakeReq())).toBe(true);
  });

  it("round-trips a token and rejects tampering / expiry", () => {
    const t = issueToken();
    expect(verifyToken(t)).toBe(true);
    expect(verifyToken(t + "x")).toBe(false);
    expect(verifyToken("1." + t.split(".")[1])).toBe(false);
    expect(verifyToken(issueToken(Date.now() - 400 * 24 * 3600 * 1000))).toBe(false);
    expect(verifyToken(undefined)).toBe(false);
    expect(verifyToken("nodot")).toBe(false);
  });

  it("invalidates every token when the secret rotates", () => {
    const t = issueToken();
    process.env.APP_SECRET = "rotated";
    expect(verifyToken(t)).toBe(false);
  });

  it("checks the password in constant-time shape without leaking on type", () => {
    expect(checkPassword("secret-pass")).toBe(true);
    expect(checkPassword("secret-pasS")).toBe(false);
    expect(checkPassword(123)).toBe(false);
    expect(checkPassword(undefined)).toBe(false);
  });

  it("reads the session cookie out of a header with other cookies", () => {
    const req = fakeReq({ cookie: `a=1; ${SESSION_COOKIE}=${encodeURIComponent("12.ab=")}; b=2` });
    expect(readCookie(req, SESSION_COOKIE)).toBe("12.ab=");
  });

  it("sets Secure only behind https", () => {
    const a = fakeRes();
    setSessionCookie(fakeReq({ https: true }), a.res, "t");
    expect(a.out.headers["Set-Cookie"]).toContain("Secure");
    expect(a.out.headers["Set-Cookie"]).toContain("HttpOnly");
    const b = fakeRes();
    setSessionCookie(fakeReq(), b.res, "t");
    expect(b.out.headers["Set-Cookie"]).not.toContain("Secure");
  });

  it("login: wrong password → 401, right password → cookie; status reflects it", async () => {
    const bad = fakeRes();
    await loginHandler(fakeReq({ method: "POST", body: { password: "nope" } }), bad.res);
    expect(bad.out.status).toBe(401);
    expect(bad.out.headers["Set-Cookie"]).toBeUndefined();

    const good = fakeRes();
    await loginHandler(fakeReq({ method: "POST", body: JSON.stringify({ password: "secret-pass" }) }), good.res);
    expect(good.out.status).toBe(200);
    const cookie = good.out.headers["Set-Cookie"].split(";")[0];

    const st = fakeRes();
    statusHandler(fakeReq({ cookie }), st.res);
    expect(st.out.body).toEqual({ required: true, authenticated: true });

    const anon = fakeRes();
    statusHandler(fakeReq(), anon.res);
    expect(anon.out.body).toEqual({ required: true, authenticated: false });
  });

  it("requireSession sends the 401 marker the client relocks on", () => {
    const r = fakeRes();
    expect(requireSession(fakeReq(), r.res)).toBe(false);
    expect(r.out.status).toBe(401);
    expect((r.out.body as { code: string }).code).toBe("unauthenticated");
  });
});
