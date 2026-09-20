import { describe, it, expect } from "vitest";

import {
  parseAddresses,
  sanitizeHtml,
  extractCallLinks,
  parseIcs,
  icsDateToIso,
  zonedToUtc,
  walkParts,
  parseMessage,
  decodeEntities,
  type GmailMessage,
} from "../../../api/_lib/mail";
import { issueState, verifyState } from "../../../api/_lib/google";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("parseAddresses", () => {
  it("handles quoted names, bare addresses and commas inside quotes", () => {
    expect(parseAddresses('"Петров, Иван" <ivan@x.ru>, bob@y.com, Ann <ann@z.io>')).toEqual([
      { name: "Петров, Иван", email: "ivan@x.ru" },
      { name: "bob@y.com", email: "bob@y.com" },
      { name: "Ann", email: "ann@z.io" },
    ]);
    expect(parseAddresses("")).toEqual([]);
  });
});

describe("sanitizeHtml", () => {
  it("strips scripts, handlers and javascript: urls, forces target=_blank", () => {
    const dirty =
      '<div onclick="x()"><script>alert(1)</script><a href="javascript:evil()">a</a><a href="https://ok.com">b</a>' +
      '<iframe src="https://x"></iframe><img src="https://img" onerror="p()"></div>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/<script|<iframe|onclick|onerror|javascript:/i);
    expect(clean).toContain('href="#"');
    expect(clean).toContain('<a target="_blank" rel="noopener noreferrer" href="https://ok.com">b</a>');
    expect(clean).toContain('<img src="https://img">');
  });
});

describe("extractCallLinks", () => {
  it("finds distinct zoom / meet / teams links across html and text", () => {
    const html = 'Join <a href="https://us02web.zoom.us/j/123?pwd=abc&amp;x=1">here</a>';
    const text = "Or https://meet.google.com/abc-defg-hij. Also https://teams.microsoft.com/l/meetup-join/19%3ameeting";
    expect(extractCallLinks(html, text, html)).toEqual([
      "https://us02web.zoom.us/j/123?pwd=abc&x=1",
      "https://meet.google.com/abc-defg-hij",
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting",
    ]);
  });
});

describe("ics parsing", () => {
  it("reads UTC, TZID and DATE forms", () => {
    expect(icsDateToIso("20260921T100000Z")).toBe("2026-09-21T10:00:00.000Z");
    expect(icsDateToIso("20260921")).toBe("2026-09-21T00:00:00.000Z");
    // Moscow is UTC+3 all year.
    expect(icsDateToIso("20260921T130000", { TZID: "Europe/Moscow" })).toBe("2026-09-21T10:00:00.000Z");
    expect(icsDateToIso("garbage")).toBeNull();
  });

  it("zonedToUtc handles DST zones and rejects unknown ids", () => {
    // 2026-07-01 12:00 Berlin (CEST, +2) → 10:00Z; 2026-01-15 12:00 Berlin (CET, +1) → 11:00Z.
    expect(zonedToUtc([2026, 6, 1, 12, 0, 0], "Europe/Berlin")?.toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(zonedToUtc([2026, 0, 15, 12, 0, 0], "Europe/Berlin")?.toISOString()).toBe("2026-01-15T11:00:00.000Z");
    expect(zonedToUtc([2026, 0, 15, 12, 0, 0], "Not/AZone")).toBeNull();
  });

  it("parses a VEVENT with folded lines and escaped text, pulling the call link from DESCRIPTION", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:Созвон\\, обсуждение",
      "DTSTART;TZID=Europe/Moscow:20260922T150000",
      "DTEND;TZID=Europe/Moscow:20260922T154500",
      "DESCRIPTION:Ссылка: https://meet.google.com/abc-defg-hij",
      " \\nдо встречи",
      "LOCATION:Офис",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseIcs(ics)).toEqual({
      summary: "Созвон, обсуждение",
      start: "2026-09-22T12:00:00.000Z",
      end: "2026-09-22T12:45:00.000Z",
      location: "Офис",
      url: "https://meet.google.com/abc-defg-hij",
      allDay: false,
    });
    expect(parseIcs("BEGIN:VCALENDAR\nEND:VCALENDAR")).toBeNull();
  });
});

describe("walkParts / parseMessage", () => {
  const msg: GmailMessage = {
    id: "m1",
    threadId: "t1",
    labelIds: ["UNREAD", "INBOX"],
    snippet: "Hello &amp; welcome &#39;x&#39;",
    internalDate: "1789000000000",
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "Ann <ann@z.io>" },
        { name: "To", value: "me@x.ru" },
        { name: "Subject", value: "Invite" },
      ],
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64url("plain https://zoom.us/j/555") } },
            { mimeType: "text/html", body: { data: b64url("<p onclick=x>hi <script>1</script></p>") } },
          ],
        },
        { mimeType: "text/calendar", filename: "invite.ics", body: { attachmentId: "att-ics", size: 10, data: b64url("BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Call\nDTSTART:20260922T120000Z\nEND:VEVENT\nEND:VCALENDAR") } },
        { mimeType: "application/pdf", filename: "doc.pdf", body: { attachmentId: "att-1", size: 1234 } },
      ],
    },
  };

  it("collects bodies, attachments and the calendar part", () => {
    const w = walkParts(msg.payload);
    expect(w.html).toContain("hi");
    expect(w.text).toContain("plain");
    expect(w.ics).toContain("BEGIN:VEVENT");
    expect(w.attachments.map((a) => a.filename)).toEqual(["invite.ics", "doc.pdf"]);
  });

  it("parseMessage(full) sanitises html, finds call links and the invite; metadata-only skips bodies", () => {
    const full = parseMessage(msg, true);
    expect(full.from).toEqual({ name: "Ann", email: "ann@z.io" });
    expect(full.unread).toBe(true);
    expect(full.snippet).toBe("Hello & welcome 'x'");
    expect(full.html).not.toMatch(/<script|onclick/);
    expect(full.callLinks).toEqual(["https://zoom.us/j/555"]);
    expect(full.invite?.summary).toBe("Call");
    expect(full.date).toBe(new Date(1789000000000).toISOString());

    const meta = parseMessage(msg, false);
    expect(meta.html).toBeUndefined();
    expect(meta.attachments).toEqual([]);
  });

  it("falls back to linkified plain text when there is no html", () => {
    const textOnly: GmailMessage = {
      id: "m2", threadId: "t2",
      payload: { mimeType: "text/plain", headers: [], body: { data: b64url("see https://a.b/c <tag>") } },
    };
    const p = parseMessage(textOnly, true);
    expect(p.html).toContain('<a href="https://a.b/c"');
    expect(p.html).toContain("&lt;tag&gt;");
  });

  it("decodeEntities covers numeric and named forms", () => {
    expect(decodeEntities("&#1055;&#x440;&quot;&nbsp;&lt;&gt;&amp;")).toBe('Пр" <>&');
  });
});

describe("oauth state", () => {
  it("round-trips and expires", () => {
    process.env.APP_PASSWORD = "p";
    const s = issueState();
    expect(verifyState(s)).toBe(true);
    expect(verifyState(s + "x")).toBe(false);
    expect(verifyState(issueState(Date.now() - 11 * 60 * 1000))).toBe(false);
    expect(verifyState(undefined)).toBe(false);
  });
});
