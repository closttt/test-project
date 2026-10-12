/**
 * Design-lab network guard. Imported FIRST by the lab frame, before anything can create a
 * Supabase client (supabase-js captures `fetch` at createClient time).
 *
 * The lab renders the real app on a read-only snapshot of production data, so it must be
 * physically unable to write anywhere:
 *  - Supabase REST reads are answered from the local snapshot (design-lab/.data/snapshot.json) —
 *    the lab never even talks to the production database after the snapshot is taken.
 *  - Every non-read request to Supabase or to /api/* is refused.
 *  - Push subscriptions can't be stored (their Supabase writes are refused like any other).
 */

type Row = Record<string, unknown>;
export type Snapshot = {
  takenAt: string;
  app_state: { data: unknown; updated_at: string }[];
  [table: string]: unknown;
};

let snapshot: Snapshot | null = null;
export function setSnapshot(s: Snapshot) {
  snapshot = s;
}

const realFetch = window.fetch.bind(window);

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

function applyFilters(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows;
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const val = rest.join(".");
    if (op === "eq") out = out.filter((r) => String(r[key]) === val);
    else if (op === "in") {
      const set = new Set(val.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, "")));
      out = out.filter((r) => set.has(String(r[key])));
    }
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    out = [...out].sort((a, b) => {
      const x = a[col] as string | number;
      const y = b[col] as string | number;
      const c = x < y ? -1 : x > y ? 1 : 0;
      return dir === "desc" ? -c : c;
    });
  }
  return out;
}

function answerRest(url: URL, init: RequestInit | undefined, method: string): Response {
  const table = url.pathname.replace(/^.*\/rest\/v1\//, "").split("/")[0];
  if (method !== "GET" && method !== "HEAD") {
    console.warn(`[design-lab] blocked ${method} ${table} — sandbox is read-only`);
    return json({ message: "Песочница дизайн-лаборатории: запись отключена", code: "LAB_READ_ONLY" }, 403);
  }
  const source = (snapshot?.[table] as Row[] | undefined) ?? [];
  const rows = applyFilters(Array.isArray(source) ? source : [], url.searchParams);
  const accept = new Headers(init?.headers).get("Accept") ?? "";
  const range = { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` };
  if (method === "HEAD") return new Response(null, { status: 200, headers: range });
  if (accept.includes("vnd.pgrst.object")) {
    return rows[0] ? json(rows[0], 200, range) : json({ message: "no rows", code: "PGRST116" }, 406);
  }
  return json(rows, 200, range);
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

  if (url.hostname.endsWith(".supabase.co")) {
    if (url.pathname.includes("/rest/v1/")) return answerRest(url, init, method);
    if (method !== "GET") {
      console.warn(`[design-lab] blocked ${method} ${url.pathname}`);
      return json({ message: "Песочница: запись отключена" }, 403);
    }
    // Storage images (covers) are public reads — let them through.
    return realFetch(input, init);
  }
  if (url.origin === location.origin && url.pathname.startsWith("/api/") && method !== "GET") {
    console.warn(`[design-lab] blocked ${method} ${url.pathname}`);
    return json({ error: "Песочница: запись отключена" }, 403);
  }
  return realFetch(input, init);
};

// Supabase realtime would open a websocket to production — refuse it.
const RealWS = window.WebSocket;
window.WebSocket = class extends RealWS {
  constructor(url: string | URL, protocols?: string | string[]) {
    if (String(url).includes("supabase.co")) throw new Error("[design-lab] realtime disabled");
    super(url, protocols);
  }
} as typeof WebSocket;
