import type { Meeting } from "@/types";

/** Minutes before a meeting's start when the «скоро» alert fires. */
export const MEETING_LEAD_MIN = 5;

const MIN = 60 * 1000;

export function meetingStart(m: Pick<Meeting, "date" | "time">): number {
  return new Date(`${m.date}T${m.time || "00:00"}`).getTime();
}

export interface MeetingAlert {
  meeting: Meeting;
  kind: "soon" | "now";
  /** Dedup key for lib/reminders hasFired/markFired. */
  key: string;
  /** Whole minutes left until the start (0 for «now»). */
  minutesLeft: number;
}

/**
 * Alerts due at `now`: «soon» inside the lead window before the start, «now» from the start for
 * 30 minutes. A closed meeting stays quiet. Keys are stable per meeting slot, so each alert fires once.
 */
export function dueMeetingAlerts(meetings: Meeting[], now: number, leadMin = MEETING_LEAD_MIN): MeetingAlert[] {
  const out: MeetingAlert[] = [];
  for (const m of meetings) {
    if (m.done || !m.time) continue;
    const at = meetingStart(m);
    if (Number.isNaN(at)) continue;
    const slot = `${m.id}:${m.date}${m.time}`;
    if (at > now && at - now <= leadMin * MIN) {
      out.push({ meeting: m, kind: "soon", key: `meet-soon:${slot}`, minutesLeft: Math.max(1, Math.ceil((at - now) / MIN)) });
    } else if (at <= now && now - at < 30 * MIN) {
      out.push({ meeting: m, kind: "now", key: `meet:${slot}`, minutesLeft: 0 });
    }
  }
  return out;
}
