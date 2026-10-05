import { localDayStr } from "@/lib/format";
import type { Meeting } from "@/types";

/**
 * Google Calendar → «Встречи» through the calendar's secret iCal address. No OAuth: the owner
 * pastes the private `.ics` link once, our serverless function fetches the file (browsers can't —
 * CORS), and everything below turns it into meetings: parse, expand repeating events into
 * concrete occurrences in a date window, convert time zones, merge with what is already there.
 *
 * Pure and dependency-free so all of it is tested: RRULE expansion and time zones are exactly the
 * places where a calendar import silently shows a call at the wrong hour.
 */

/** A DATE or DATE-TIME value as written in the file — wall-clock parts plus how to read them. */
export interface IcsTime {
  y: number;
  m: number; // 1–12
  d: number;
  h: number;
  mi: number;
  s: number;
  /** Ends in `Z`. */
  utc: boolean;
  /** `TZID=` parameter (IANA name, e.g. Europe/Moscow). */
  tz?: string;
  /** `VALUE=DATE` — an all-day event. */
  dateOnly: boolean;
}

export interface IcsEvent {
  uid: string;
  summary: string;
  start: IcsTime;
  end?: IcsTime;
  /** DURATION, in minutes, when there is no DTEND. */
  durationMin?: number;
  rrule?: Record<string, string>;
  /** EXDATE instants, as UTC ms. */
  exdates: number[];
  /** Set on an edited/cancelled single occurrence of a repeating event: which one it replaces. */
  recurrenceId?: number;
  status?: string;
  location?: string;
  description?: string;
  /** X-GOOGLE-CONFERENCE — the Meet link Google attaches. */
  conference?: string;
}

/** One concrete meeting in time. `key` is stable across syncs for the same occurrence. */
export interface CalOccurrence {
  key: string;
  title: string;
  startMs: number;
  durationMin: number;
  url?: string;
}

// ── Parsing ────────────────────────────────────────────────────────────────────────────────

function unescapeText(v: string): string {
  return v.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

export function parseIcsTime(value: string, params: Record<string, string>): IcsTime | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const dateOnly = params.VALUE === "DATE" || m[4] === undefined;
  return {
    y: Number(m[1]), m: Number(m[2]), d: Number(m[3]),
    h: dateOnly ? 0 : Number(m[4]), mi: dateOnly ? 0 : Number(m[5]), s: dateOnly ? 0 : Number(m[6] ?? 0),
    utc: m[7] === "Z",
    tz: params.TZID?.replace(/^"|"$/g, ""),
    dateOnly,
  };
}

/** «PT1H30M» / «P1D» / «PT45M» → minutes. */
export function parseDuration(v: string): number | undefined {
  const m = v.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return undefined;
  const [, , w, d, h, mi] = m;
  return (Number(w ?? 0) * 7 + Number(d ?? 0)) * 1440 + Number(h ?? 0) * 60 + Number(mi ?? 0);
}

/** Every VEVENT in the file. Malformed ones are skipped, never thrown on. */
export function parseIcs(text: string): IcsEvent[] {
  // RFC 5545 folding: a line starting with a space or tab continues the previous one.
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: IcsEvent[] = [];
  let cur: Partial<IcsEvent> & { exdates: number[] } | null = null;
  let depth = 0; // nested VALARM etc. inside a VEVENT

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; depth = 0; continue; }
    if (!cur) continue;
    if (line.startsWith("BEGIN:")) { depth++; continue; }
    if (line.startsWith("END:") && depth > 0) { depth--; continue; }
    if (line === "END:VEVENT") {
      if (cur.uid && cur.start) out.push({ summary: "", ...cur } as IcsEvent);
      cur = null;
      continue;
    }
    if (depth > 0) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [rawName, ...paramParts] = line.slice(0, colon).split(";");
    const name = rawName.toUpperCase();
    const value = line.slice(colon + 1);
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }
    switch (name) {
      case "UID": cur.uid = value.trim(); break;
      case "SUMMARY": cur.summary = unescapeText(value).trim(); break;
      case "DTSTART": cur.start = parseIcsTime(value, params) ?? undefined; break;
      case "DTEND": cur.end = parseIcsTime(value, params) ?? undefined; break;
      case "DURATION": cur.durationMin = parseDuration(value); break;
      case "RRULE":
        cur.rrule = Object.fromEntries(value.split(";").map((kv) => { const [k, v] = kv.split("="); return [k.toUpperCase(), v ?? ""]; }));
        break;
      case "EXDATE":
        for (const v of value.split(",")) { const t = parseIcsTime(v, params); if (t) cur.exdates.push(toUtcMs(t)); }
        break;
      case "RECURRENCE-ID": { const t = parseIcsTime(value, params); if (t) cur.recurrenceId = toUtcMs(t); break; }
      case "STATUS": cur.status = value.trim().toUpperCase(); break;
      case "LOCATION": cur.location = unescapeText(value); break;
      case "DESCRIPTION": cur.description = unescapeText(value); break;
      case "X-GOOGLE-CONFERENCE": cur.conference = value.trim(); break;
    }
  }
  return out;
}

// ── Time zones ─────────────────────────────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat | null>();

function zoneFormat(tz: string): Intl.DateTimeFormat | null {
  if (!fmtCache.has(tz)) {
    try {
      fmtCache.set(tz, new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      }));
    } catch {
      fmtCache.set(tz, null); // not an IANA name — the time is read as local instead
    }
  }
  return fmtCache.get(tz)!;
}

/** Wall clock in `tz` minus UTC, at instant `ms`. */
function zoneOffset(ms: number, f: Intl.DateTimeFormat): number {
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return wall - Math.floor(ms / 1000) * 1000;
}

/** The instant a wall-clock time in an IANA zone stands for (DST-correct, one refinement pass). */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const f = zoneFormat(tz);
  if (!f) return new Date(y, m - 1, d, h, mi, s).getTime();
  const naive = Date.UTC(y, m - 1, d, h, mi, s);
  let ms = naive - zoneOffset(naive, f);
  ms = naive - zoneOffset(ms, f);
  return ms;
}

export function toUtcMs(t: IcsTime): number {
  if (t.utc) return Date.UTC(t.y, t.m - 1, t.d, t.h, t.mi, t.s);
  if (t.tz && !t.dateOnly) return zonedToUtc(t.y, t.m, t.d, t.h, t.mi, t.s, t.tz);
  return new Date(t.y, t.m - 1, t.d, t.h, t.mi, t.s).getTime();
}

// ── Recurrence ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Wall-clock parts of a "naive" timestamp (UTC fields used as plain calendar arithmetic). */
function parts(naive: number) {
  const d = new Date(naive);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
}

/** Occurrence start instants of a repeating event (by wall clock in its own zone), up to `untilMs`. */
export function expandRrule(ev: IcsEvent, windowEndMs: number): number[] {
  const r = ev.rrule!;
  const st = ev.start;
  const freq = r.FREQ;
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const untilT = r.UNTIL ? parseIcsTime(r.UNTIL, {}) : null;
  const untilMs = untilT ? (untilT.dateOnly ? toUtcMs({ ...untilT, h: 23, mi: 59, s: 59 }) : toUtcMs(untilT)) : Infinity;
  const stop = Math.min(untilMs, windowEndMs);
  const byDay = (r.BYDAY ?? "").split(",").filter(Boolean).map((x) => {
    const mm = x.match(/^([+-]?\d+)?([A-Z]{2})$/);
    return mm ? { n: mm[1] ? Number(mm[1]) : 0, dow: WEEKDAYS.indexOf(mm[2]) } : null;
  }).filter((x): x is { n: number; dow: number } => !!x && x.dow >= 0);
  const byMonthDay = (r.BYMONTHDAY ?? "").split(",").filter(Boolean).map(Number);

  const startNaive = Date.UTC(st.y, st.m - 1, st.d);
  const toInstant = (y: number, m: number, d: number) => toUtcMs({ ...st, y, m, d });
  const firstMs = toUtcMs(st);
  const out: number[] = [];
  let emitted = 0;

  /** Feeds one period's candidate dates (sorted) through COUNT/UNTIL; false = stop expanding. */
  const take = (dates: number[]): boolean => {
    for (const naive of dates.sort((a, b) => a - b)) {
      if (naive < startNaive) continue;
      const { y, m, d } = parts(naive);
      const ms = toInstant(y, m, d);
      if (ms < firstMs) continue;
      if (ms > stop || emitted >= count) return false;
      emitted++;
      out.push(ms);
    }
    return true;
  };

  const MAX_PERIODS = 20_000;
  if (freq === "DAILY") {
    for (let i = 0; i < MAX_PERIODS; i++) {
      const naive = startNaive + i * interval * DAY_MS;
      const p = parts(naive);
      if (toInstant(p.y, p.m, p.d) > stop) break;
      if (byDay.length && !byDay.some((b) => b.dow === p.dow)) continue;
      if (!take([naive])) break;
    }
  } else if (freq === "WEEKLY") {
    const wkst = WEEKDAYS.indexOf(r.WKST ?? "MO");
    const startDow = parts(startNaive).dow;
    const weekStart = startNaive - ((startDow - wkst + 7) % 7) * DAY_MS;
    const days = byDay.length ? byDay.map((b) => b.dow) : [startDow];
    for (let i = 0; i < MAX_PERIODS; i++) {
      const base = weekStart + i * interval * 7 * DAY_MS;
      if (!take(days.map((dow) => base + ((dow - wkst + 7) % 7) * DAY_MS))) break;
      if (toInstant(parts(base).y, parts(base).m, parts(base).d) > stop) break;
    }
  } else if (freq === "MONTHLY" || freq === "YEARLY") {
    const step = freq === "MONTHLY" ? interval : interval * 12;
    for (let i = 0; i < MAX_PERIODS; i++) {
      const monthIdx = st.m - 1 + i * step;
      const y = st.y + Math.floor(monthIdx / 12);
      const m = (monthIdx % 12) + 1;
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const dates: number[] = [];
      if (byDay.length) {
        for (const b of byDay) {
          const all: number[] = [];
          for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === b.dow) all.push(d);
          const pick = b.n === 0 ? all : [b.n > 0 ? all[b.n - 1] : all[all.length + b.n]];
          pick.filter(Boolean).forEach((d) => dates.push(Date.UTC(y, m - 1, d)));
        }
      } else if (byMonthDay.length) {
        byMonthDay.forEach((md) => { const d = md > 0 ? md : dim + md + 1; if (d >= 1 && d <= dim) dates.push(Date.UTC(y, m - 1, d)); });
      } else if (st.d <= dim) {
        dates.push(Date.UTC(y, m - 1, st.d));
      }
      if (!take(dates)) break;
      if (toInstant(y, m, 1) > stop) break;
    }
  } else {
    out.push(firstMs); // unknown FREQ — keep the first one rather than drop the event
  }
  return out;
}

function eventMinutes(ev: IcsEvent): number {
  if (ev.end) {
    const mins = Math.round((toUtcMs(ev.end) - toUtcMs(ev.start)) / 60_000);
    if (mins > 0) return mins;
  }
  return ev.durationMin && ev.durationMin > 0 ? ev.durationMin : 30;
}

const CALL_LINK = /https?:\/\/[^\s<>"]*(?:zoom\.us\/[jw]\/|meet\.google\.com\/|teams\.microsoft\.com\/|teams\.live\.com\/|telemost\.yandex\.ru\/|meet\.jit\.si\/)[^\s<>"]*/i;

/** The join link: Google's own Meet field, else a Zoom/Meet/Teams/Телемост link in the place or notes. */
export function callLink(ev: Pick<IcsEvent, "conference" | "location" | "description">): string | undefined {
  if (ev.conference) return ev.conference;
  for (const s of [ev.location, ev.description]) {
    const m = s?.match(CALL_LINK);
    if (m) return m[0].replace(/[).,;]+$/, "");
  }
  return undefined;
}

/**
 * Concrete timed occurrences inside [fromMs, toMs]. Repeating events are expanded, EXDATEs and
 * cancelled events dropped, single-occurrence edits (RECURRENCE-ID) replace the instance they
 * override. All-day events are left out — a meeting needs a time.
 */
export function occurrences(events: IcsEvent[], fromMs: number, toMs: number): CalOccurrence[] {
  const overrides = new Map<string, IcsEvent>();
  for (const ev of events) if (ev.recurrenceId !== undefined) overrides.set(`${ev.uid}#${ev.recurrenceId}`, ev);

  const out: CalOccurrence[] = [];
  const push = (ev: IcsEvent, key: string, startMs: number) => {
    if (ev.status === "CANCELLED" || ev.start.dateOnly) return;
    const durationMin = eventMinutes(ev);
    if (startMs + durationMin * 60_000 < fromMs || startMs > toMs) return;
    out.push({ key, title: ev.summary || "Без названия", startMs, durationMin, url: callLink(ev) });
  };

  for (const ev of events) {
    if (ev.recurrenceId !== undefined) continue; // emitted through its master below
    if (!ev.rrule) {
      push(ev, `${ev.uid}#${toUtcMs(ev.start)}`, toUtcMs(ev.start));
      continue;
    }
    const ex = new Set(ev.exdates);
    for (const ms of expandRrule(ev, toMs)) {
      if (ex.has(ms)) continue;
      const key = `${ev.uid}#${ms}`;
      const o = overrides.get(key);
      if (o) push(o, key, toUtcMs(o.start));
      else push(ev, key, ms);
    }
  }
  // Edits of instances whose master isn't in the file (rare, but Google does export them).
  const masters = new Set(events.filter((e) => e.recurrenceId === undefined).map((e) => e.uid));
  for (const [key, o] of overrides) if (!masters.has(o.uid)) push(o, key, toUtcMs(o.start));

  return out.sort((a, b) => a.startMs - b.startMs);
}

// ── Merge into «Встречи» ───────────────────────────────────────────────────────────────────

export interface MergeResult {
  meetings: Meeting[];
  added: number;
  updated: number;
  removed: number;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Brings the calendar's occurrences into the meeting list. A meeting imported earlier is matched
 * by its occurrence key and updated in place — a rescheduled call moves, its done/priority/tags
 * stay. Calendar meetings from `windowFrom` on that are no longer in the feed were cancelled or
 * deleted and go; older ones stay as history. Hand-made meetings are never touched.
 */
export function mergeCalendarMeetings(existing: Meeting[], occ: CalOccurrence[], windowFrom: string, newId: () => string): MergeResult {
  const byKey = new Map(occ.map((o) => [o.key, o] as const));
  const seen = new Set<string>();
  let updated = 0;
  let removed = 0;
  const kept: Meeting[] = [];

  for (const m of existing) {
    if (m.source !== "gcal" || !m.externalId) { kept.push(m); continue; }
    const o = byKey.get(m.externalId);
    if (!o) {
      if (m.date < windowFrom) kept.push(m);
      else removed++;
      continue;
    }
    seen.add(o.key);
    const start = new Date(o.startMs);
    const next = { title: o.title, date: localDayStr(start), time: hhmm(start), durationMin: o.durationMin, url: o.url };
    const changed = next.title !== m.title || next.date !== m.date || next.time !== m.time || next.durationMin !== m.durationMin || next.url !== m.url;
    if (changed) updated++;
    kept.push(changed ? { ...m, ...next } : m);
  }

  let added = 0;
  for (const o of occ) {
    if (seen.has(o.key)) continue;
    const start = new Date(o.startMs);
    kept.push({
      id: newId(),
      title: o.title,
      date: localDayStr(start),
      time: hhmm(start),
      durationMin: o.durationMin,
      recurrence: "none",
      url: o.url,
      source: "gcal",
      externalId: o.key,
    });
    added++;
  }

  return { meetings: added || updated || removed ? kept : existing, added, updated, removed };
}
