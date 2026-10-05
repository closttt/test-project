import { describe, it, expect } from "vitest";
import { parseIcs, parseDuration, zonedToUtc, occurrences, callLink, mergeCalendarMeetings, type CalOccurrence } from "@/lib/ical";
import { localDayStr } from "@/lib/format";
import type { Meeting } from "@/types";

const utc = (s: string) => Date.parse(s);

// Shaped like Google's export: folded lines, a weekly series with one moved and one skipped
// instance, a one-off UTC event, an all-day event and a cancelled one.
const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "DTSTART;TZID=Europe/Moscow:20260921T111500",
  "DTEND;TZID=Europe/Moscow:20260921T121500",
  "RRULE:FREQ=WEEKLY;BYDAY=MO",
  "EXDATE;TZID=Europe/Moscow:20261012T111500",
  "UID:sync@google.com",
  "SUMMARY:Web & Growth Sync",
  "X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij",
  "BEGIN:VALARM",
  "TRIGGER:-PT10M",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=Europe/Moscow:20261026T121500",
  "DTEND;TZID=Europe/Moscow:20261026T131500",
  "RECURRENCE-ID;TZID=Europe/Moscow:20261026T111500",
  "UID:sync@google.com",
  "SUMMARY:Web & Growth Sync (перенос)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261007T130000Z",
  "DURATION:PT1H30M",
  "UID:oneoff@google.com",
  "SUMMARY:Созвон\\, клиент",
  "DESCRIPTION:Ссылка: https://us02web.zoom.us/j/123456?pwd=x.",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261008",
  "UID:allday@google.com",
  "SUMMARY:Отпуск",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261009T100000Z",
  "DTEND:20261009T110000Z",
  "UID:gone@google.com",
  "STATUS:CANCELLED",
  "SUMMARY:Отменили",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261010T100000Z",
  "DTEND:20261010T110000Z",
  "UID:long@google.com",
  "SUMMARY:Очень длинное назв",
  " ание встречи",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs", () => {
  const events = parseIcs(ICS);
  it("reads every VEVENT, ignoring nested alarms", () => {
    expect(events).toHaveLength(6);
    expect(events[0]).toMatchObject({ uid: "sync@google.com", summary: "Web & Growth Sync", rrule: { FREQ: "WEEKLY", BYDAY: "MO" } });
  });
  it("unescapes text and unfolds long lines", () => {
    expect(events[2].summary).toBe("Созвон, клиент");
    expect(events[5].summary).toBe("Очень длинное название встречи");
  });
  it("parses durations", () => {
    expect(parseDuration("PT1H30M")).toBe(90);
    expect(parseDuration("P1D")).toBe(1440);
    expect(parseDuration("PT45M")).toBe(45);
  });
});

describe("time zones", () => {
  it("converts Moscow wall time (UTC+3, no DST)", () => {
    expect(zonedToUtc(2026, 10, 5, 11, 15, 0, "Europe/Moscow")).toBe(utc("2026-10-05T08:15:00Z"));
  });
  it("follows DST in zones that have it", () => {
    expect(zonedToUtc(2026, 7, 1, 9, 0, 0, "America/New_York")).toBe(utc("2026-07-01T13:00:00Z"));
    expect(zonedToUtc(2026, 12, 1, 9, 0, 0, "America/New_York")).toBe(utc("2026-12-01T14:00:00Z"));
  });
});

describe("occurrences", () => {
  const events = parseIcs(ICS);
  const list = occurrences(events, utc("2026-10-01T00:00:00Z"), utc("2026-11-03T00:00:00Z"));
  const titles = list.map((o) => [new Date(o.startMs).toISOString(), o.title]);

  it("expands the weekly series, skips the EXDATE and applies the moved instance", () => {
    expect(titles.filter(([, t]) => t.startsWith("Web"))).toEqual([
      ["2026-10-05T08:15:00.000Z", "Web & Growth Sync"],
      ["2026-10-19T08:15:00.000Z", "Web & Growth Sync"],
      ["2026-10-26T09:15:00.000Z", "Web & Growth Sync (перенос)"],
      ["2026-11-02T08:15:00.000Z", "Web & Growth Sync"],
    ]);
  });
  it("keeps one-offs, drops all-day and cancelled events", () => {
    const oneoff = list.find((o) => o.title === "Созвон, клиент")!;
    expect(oneoff).toMatchObject({ durationMin: 90, url: "https://us02web.zoom.us/j/123456?pwd=x" });
    expect(list.some((o) => o.title === "Отпуск" || o.title === "Отменили")).toBe(false);
  });
  it("gives the same occurrence the same key every sync, the moved one keeps its original key", () => {
    const moved = list.find((o) => o.title.includes("перенос"))!;
    expect(moved.key).toBe(`sync@google.com#${utc("2026-10-26T08:15:00Z")}`);
    expect(list.find((o) => o.title === "Web & Growth Sync")!.url).toBe("https://meet.google.com/abc-defg-hij");
  });
  it("respects COUNT and UNTIL", () => {
    const ev = parseIcs("BEGIN:VEVENT\nUID:c\nDTSTART:20261001T100000Z\nRRULE:FREQ=DAILY;COUNT=3\nEND:VEVENT\nBEGIN:VEVENT\nUID:u\nDTSTART:20261001T100000Z\nRRULE:FREQ=WEEKLY;UNTIL=20261015T235959Z\nEND:VEVENT");
    const out = occurrences(ev, utc("2026-09-01T00:00:00Z"), utc("2026-12-01T00:00:00Z"));
    expect(out.filter((o) => o.key.startsWith("c#"))).toHaveLength(3);
    expect(out.filter((o) => o.key.startsWith("u#"))).toHaveLength(3);
  });
  it("expands monthly «first Monday»", () => {
    const ev = parseIcs("BEGIN:VEVENT\nUID:m\nDTSTART:20261005T090000Z\nRRULE:FREQ=MONTHLY;BYDAY=1MO\nEND:VEVENT");
    const out = occurrences(ev, utc("2026-10-01T00:00:00Z"), utc("2027-01-01T00:00:00Z"));
    expect(out.map((o) => new Date(o.startMs).toISOString().slice(0, 10))).toEqual(["2026-10-05", "2026-11-02", "2026-12-07"]);
  });
});

describe("callLink", () => {
  it("prefers Google's Meet field, then a call link in place or notes", () => {
    expect(callLink({ conference: "https://meet.google.com/x" })).toBe("https://meet.google.com/x");
    expect(callLink({ location: "Офис", description: "join https://teams.microsoft.com/l/meetup-join/1 please" })).toBe("https://teams.microsoft.com/l/meetup-join/1");
    expect(callLink({ description: "https://example.com" })).toBeUndefined();
  });
});

describe("mergeCalendarMeetings", () => {
  let n = 0;
  const id = () => `m${++n}`;
  const occ = (key: string, iso: string, title = key): CalOccurrence => ({ key, title, startMs: utc(iso), durationMin: 60 });
  const local = (iso: string) => {
    const d = new Date(utc(iso));
    return { date: localDayStr(d), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
  };

  it("adds new occurrences as calendar meetings", () => {
    const r = mergeCalendarMeetings([], [occ("a#1", "2026-10-05T08:15:00Z")], "2026-10-04", id);
    expect(r.added).toBe(1);
    expect(r.meetings[0]).toMatchObject({ source: "gcal", externalId: "a#1", title: "a#1", durationMin: 60, ...local("2026-10-05T08:15:00Z") });
  });

  it("moves a rescheduled meeting in place, keeping done/priority", () => {
    const old: Meeting = { id: "x", title: "a", date: "2026-10-05", time: "11:15", durationMin: 60, recurrence: "none", source: "gcal", externalId: "a#1", priority: 1, done: true };
    const r = mergeCalendarMeetings([old], [occ("a#1", "2026-10-06T09:00:00Z", "a")], "2026-10-04", id);
    expect(r.updated).toBe(1);
    expect(r.meetings[0]).toMatchObject({ id: "x", priority: 1, done: true, ...local("2026-10-06T09:00:00Z") });
  });

  it("drops upcoming calendar meetings that vanished, keeps past ones and hand-made ones", () => {
    const mk = (id: string, date: string, source?: "gcal"): Meeting => ({ id, title: id, date, time: "10:00", durationMin: 30, recurrence: "none", source, externalId: source ? `${id}#1` : undefined });
    const r = mergeCalendarMeetings([mk("past", "2026-09-01", "gcal"), mk("gone", "2026-10-10", "gcal"), mk("mine", "2026-10-10")], [], "2026-10-04", id);
    expect(r.removed).toBe(1);
    expect(r.meetings.map((m) => m.id)).toEqual(["past", "mine"]);
  });

  it("returns the same array when nothing changed", () => {
    const m: Meeting = { id: "x", title: "a", ...local("2026-10-05T08:15:00Z"), durationMin: 60, recurrence: "none", source: "gcal", externalId: "a#1" };
    const list = [m];
    expect(mergeCalendarMeetings(list, [occ("a#1", "2026-10-05T08:15:00Z", "a")], "2026-10-04", id).meetings).toBe(list);
  });
});
