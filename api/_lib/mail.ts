/**
 * Pure helpers for turning Gmail API payloads into what the Mail page renders (plan B1):
 * header parsing, MIME part walking, HTML sanitising for the sandboxed iframe, call-link and
 * .ics extraction for «→ Встреча». No I/O here — everything is unit-testable.
 */

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export interface Address {
  name: string;
  email: string;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface CalendarInvite {
  summary: string;
  /** ISO instants (UTC). `end` may be missing for all-day / open-ended events. */
  start: string;
  end?: string;
  location?: string;
  url?: string;
  allDay: boolean;
}

export interface ParsedMessage {
  id: string;
  threadId: string;
  from: Address;
  to: Address[];
  cc: Address[];
  subject: string;
  date: string;
  unread: boolean;
  starred: boolean;
  snippet: string;
  html?: string;
  text?: string;
  attachments: AttachmentMeta[];
  /** Video-call links found in the body — the «→ Встреча» prefill. */
  callLinks: string[];
  invite?: CalendarInvite;
}

export function header(headers: GmailHeader[] | undefined, name: string): string {
  const n = name.toLowerCase();
  return headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
}

/** `"Иван Петров" <ivan@x.ru>, bob@y.com` → [{name, email}, …]. */
export function parseAddresses(raw: string): Address[] {
  if (!raw) return [];
  const out: Address[] = [];
  // Split on commas that are outside quotes and angle brackets.
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of raw) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") depth++;
    else if (!quoted && ch === ">") depth = Math.max(0, depth - 1);
    if (ch === "," && !quoted && depth === 0) {
      out.push(parseOne(cur));
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(parseOne(cur));
  return out.filter((a) => a.email || a.name);
}

function parseOne(s: string): Address {
  const t = s.trim();
  const m = t.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"');
    return { name: name || m[2].trim(), email: m[2].trim() };
  }
  return { name: t.replace(/^"(.*)"$/, "$1"), email: t.includes("@") ? t : "" };
}

export function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

/** Depth-first walk collecting the first text/html and text/plain bodies, attachments and any text/calendar part. */
export function walkParts(root: GmailPart | undefined): {
  html?: string;
  text?: string;
  ics?: string;
  attachments: AttachmentMeta[];
} {
  const out: { html?: string; text?: string; ics?: string; attachments: AttachmentMeta[] } = { attachments: [] };
  const visit = (p: GmailPart | undefined) => {
    if (!p) return;
    const mime = (p.mimeType ?? "").toLowerCase();
    if (p.parts && p.parts.length) {
      for (const child of p.parts) visit(child);
      return;
    }
    const data = p.body?.data ? decodeBase64Url(p.body.data) : "";
    if (p.filename && p.body?.attachmentId) {
      out.attachments.push({ id: p.body.attachmentId, filename: p.filename, mimeType: p.mimeType ?? "application/octet-stream", size: p.body.size ?? 0 });
      if (mime === "text/calendar" && !out.ics && data) out.ics = data;
      return;
    }
    if (mime === "text/html" && !out.html && data) out.html = data;
    else if (mime === "text/plain" && !out.text && data) out.text = data;
    else if (mime === "text/calendar" && !out.ics && data) out.ics = data;
  };
  visit(root);
  return out;
}

/**
 * Make email HTML safe enough for a `sandbox` iframe without scripts: drop script/iframe/object/
 * embed/form/meta/link, inline event handlers and javascript: URLs. Images stay but the iframe's
 * CSP decides whether they load (the client toggles that per thread). Defence in depth — the
 * sandbox already blocks scripts; this keeps the document from even asking.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|iframe|object|embed|form|meta|link|base|frame|frameset|applet|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|form|meta|link|base|frame|applet|input|button|textarea|select)\b[^>]*\/?>/gi, "")
    .replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src|action|formaction|background|xlink:href)\s*=\s*(["']?)\s*(javascript|vbscript|data:text\/html)[^"'\s>]*\2/gi, ' $1="#"')
    .replace(/(<a\b)(?![^>]*\btarget=)/gi, '$1 target="_blank" rel="noopener noreferrer"');
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text → paragraphs with linkified URLs, so a text-only mail still reads like a document. */
export function textToHtml(text: string): string {
  const linked = escapeHtml(text).replace(
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return `<pre style="white-space:pre-wrap;word-wrap:break-word;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0">${linked}</pre>`;
}

const CALL_LINK_RE =
  /https?:\/\/(?:[\w-]+\.)?(?:zoom\.us\/(?:j|my|w)\/[^\s"'<>)]+|meet\.google\.com\/[a-z-]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s"'<>)]+|whereby\.com\/[^\s"'<>)]+|meet\.jit\.si\/[^\s"'<>)]+|telemost\.yandex\.ru\/[^\s"'<>)]+|us\d*web\.zoom\.us\/[^\s"'<>)]+|calendly\.com\/[^\s"'<>)]+)/gi;

/** Distinct video-call URLs in the message body (html + text). */
export function extractCallLinks(...sources: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const s of sources) {
    if (!s) continue;
    for (const m of s.matchAll(CALL_LINK_RE)) {
      const url = m[0].replace(/&amp;/g, "&").replace(/[.,;:!?)]+$/, "");
      seen.add(url);
    }
  }
  return [...seen];
}

// ── iCalendar ───────────────────────────────────────────────────────────────────────────────

/** Minimal VEVENT reader: SUMMARY, DTSTART/DTEND (UTC, TZID, or DATE), LOCATION, URL. */
export function parseIcs(ics: string): CalendarInvite | null {
  // Unfold continuation lines (RFC 5545 §3.1).
  const lines = ics.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const inEvent = lines.slice(lines.indexOf("BEGIN:VEVENT") + 1);
  const end = inEvent.indexOf("END:VEVENT");
  const body = end === -1 ? inEvent : inEvent.slice(0, end);
  if (lines.indexOf("BEGIN:VEVENT") === -1) return null;

  const props = new Map<string, { params: Record<string, string>; value: string }>();
  for (const line of body) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const [name, ...paramParts] = line.slice(0, colon).split(";");
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"(.*)"$/, "$1");
    }
    props.set(name.toUpperCase(), { params, value: line.slice(colon + 1) });
  }
  const start = props.get("DTSTART");
  if (!start) return null;
  const startIso = icsDateToIso(start.value, start.params);
  if (!startIso) return null;
  const endProp = props.get("DTEND");
  const endIso = endProp ? icsDateToIso(endProp.value, endProp.params) ?? undefined : undefined;
  const allDay = start.params.VALUE === "DATE" || /^\d{8}$/.test(start.value);
  const unescape = (s: string) => s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
  const description = props.get("DESCRIPTION")?.value ?? "";
  const location = props.get("LOCATION")?.value;
  const url = props.get("URL")?.value || extractCallLinks(unescape(description), location)[0];
  return {
    summary: unescape(props.get("SUMMARY")?.value ?? "").trim() || "Встреча",
    start: startIso,
    end: endIso,
    location: location ? unescape(location) : undefined,
    url,
    allDay,
  };
}

/**
 * `20260921T100000Z` → that instant; `20260921T130000` + TZID → converted through Intl;
 * `20260921` (DATE) → midnight UTC of that day. Returns null on anything unparseable.
 */
export function icsDateToIso(value: string, params: Record<string, string> = {}): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)] as const;
  if (z || !m[4] || !params.TZID) return new Date(Date.UTC(...parts)).toISOString();
  return zonedToUtc(parts, params.TZID)?.toISOString() ?? new Date(Date.UTC(...parts)).toISOString();
}

/** Wall-clock time in an IANA zone → UTC Date, via Intl (no tz database in the bundle). */
export function zonedToUtc(parts: readonly [number, number, number, number, number, number], timeZone: string): Date | null {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return null; // unknown zone id (Windows names like "Russian Standard Time")
  }
  const asUtc = Date.UTC(...parts);
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return wall - t;
  };
  // Two passes handle DST edges: guess with the offset at the naive instant, then re-check.
  let guess = asUtc - offsetAt(asUtc);
  guess = asUtc - offsetAt(guess);
  return new Date(guess);
}

/** The Mail page's view of one message. `includeBody` false = list metadata only. */
export function parseMessage(msg: GmailMessage, includeBody: boolean): ParsedMessage {
  const h = msg.payload?.headers;
  const labels = msg.labelIds ?? [];
  const from = parseAddresses(header(h, "From"))[0] ?? { name: "", email: "" };
  const base: ParsedMessage = {
    id: msg.id,
    threadId: msg.threadId,
    from,
    to: parseAddresses(header(h, "To")),
    cc: parseAddresses(header(h, "Cc")),
    subject: header(h, "Subject") || "(без темы)",
    date: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString(),
    unread: labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    snippet: decodeEntities(msg.snippet ?? ""),
    attachments: [],
    callLinks: [],
  };
  if (!includeBody) return base;
  const walked = walkParts(msg.payload);
  base.attachments = walked.attachments;
  if (walked.html) base.html = sanitizeHtml(walked.html);
  if (walked.text) base.text = walked.text;
  if (!base.html && base.text) base.html = textToHtml(base.text);
  base.callLinks = extractCallLinks(walked.html, walked.text);
  if (walked.ics) base.invite = parseIcs(walked.ics) ?? undefined;
  return base;
}

/** Gmail snippets arrive HTML-escaped (`&#39;`, `&amp;`) — undo that for plain rendering. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
