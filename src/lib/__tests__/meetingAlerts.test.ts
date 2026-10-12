import { describe, expect, it } from "vitest";

import { dueMeetingAlerts } from "@/lib/meetingAlerts";
import type { Meeting } from "@/types";

const meet = (over: Partial<Meeting>): Meeting =>
  ({ id: "m1", title: "Созвон", date: "2026-10-12", time: "15:00", durationMin: 30, recurrence: "none", ...over }) as Meeting;
const at = (hhmm: string) => new Date(`2026-10-12T${hhmm}`).getTime();

describe("dueMeetingAlerts", () => {
  it("fires «soon» inside the 5-minute lead", () => {
    const [a] = dueMeetingAlerts([meet({})], at("14:56"));
    expect(a.kind).toBe("soon");
    expect(a.minutesLeft).toBe(4);
    expect(a.key).toBe("meet-soon:m1:2026-10-1215:00");
  });
  it("is quiet earlier than the lead", () => {
    expect(dueMeetingAlerts([meet({})], at("14:54"))).toEqual([]);
  });
  it("fires «now» from the start and keeps the old key", () => {
    const [a] = dueMeetingAlerts([meet({})], at("15:10"));
    expect(a.kind).toBe("now");
    expect(a.key).toBe("meet:m1:2026-10-1215:00");
  });
  it("skips closed meetings and stale ones", () => {
    expect(dueMeetingAlerts([meet({ done: true })], at("14:58"))).toEqual([]);
    expect(dueMeetingAlerts([meet({})], at("15:40"))).toEqual([]);
  });
});
