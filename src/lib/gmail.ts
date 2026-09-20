import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/auth";
import { localDayStr } from "@/lib/format";

/**
 * Client for the Gmail relay (`api/gmail/*`, plan B1). Tokens never leave the server; this module
 * types the responses, caches the "connected" flag and the unread count (sidebar badge + AI
 * context) and converts a parsed .ics invite into the CRM's Meeting shape.
 */

export type MailBox = "inbox" | "starred" | "sent";

export interface MailAddress {
  name: string;
  email: string;
}

export interface ThreadSummary {
  id: string;
  subject: string;
  from: MailAddress;
  snippet: string;
  date: string;
  unread: boolean;
  starred: boolean;
  messageCount: number;
  hasAttachments: boolean;
}

export interface MailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface CalendarInvite {
  summary: string;
  start: string;
  end?: string;
  location?: string;
  url?: string;
  allDay: boolean;
}

export interface MailMessage {
  id: string;
  threadId: string;
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  date: string;
  unread: boolean;
  starred: boolean;
  snippet: string;
  html?: string;
  text?: string;
  attachments: MailAttachment[];
  callLinks: string[];
  invite?: CalendarInvite;
}

export interface MailThread {
  id: string;
  subject: string;
  messages: MailMessage[];
}

export interface GmailStatus {
  connected: boolean;
  /** Server has the Google + Supabase env vars at all. */
  configured: boolean;
  email?: string | null;
  unread?: number;
  reason?: string;
}

const CONNECTED_KEY = "crm-gmail-connected-v1";
const EMAIL_KEY = "crm-gmail-email-v1";
/** Fired on `window` whenever a status probe finishes — Sidebar badge and AI context listen. */
export const GMAIL_STATUS_EVENT = "crm-gmail-status";

let unreadCache: number | null = null;

export function isGmailConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function gmailAccountEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

/** Last unread count a status probe returned; null until the first probe (or when not connected). */
export function cachedUnread(): number | null {
  return isGmailConnected() ? unreadCache : null;
}

function remember(s: GmailStatus) {
  try {
    if (s.connected) {
      localStorage.setItem(CONNECTED_KEY, "1");
      if (s.email) localStorage.setItem(EMAIL_KEY, s.email);
    } else {
      localStorage.removeItem(CONNECTED_KEY);
      localStorage.removeItem(EMAIL_KEY);
    }
  } catch {
    // storage unavailable — flags are only an optimisation
  }
  unreadCache = s.connected ? s.unread ?? null : null;
  window.dispatchEvent(new Event(GMAIL_STATUS_EVENT));
}

export async function gmailStatus(): Promise<GmailStatus> {
  try {
    const s = await apiFetch<GmailStatus>("/api/gmail/status");
    remember(s);
    return s;
  } catch (e) {
    const s: GmailStatus = { connected: false, configured: true, reason: e instanceof Error ? e.message : String(e) };
    remember(s);
    return s;
  }
}

/** Full-page navigation — Google's consent screen can't live in a fetch. */
export function gmailConnectUrl(): string {
  return "/api/google/auth";
}

export async function gmailDisconnect(): Promise<void> {
  await apiFetch("/api/google/disconnect", { method: "POST" });
  remember({ connected: false, configured: true });
}

export async function listThreads(box: MailBox, q = "", pageToken = ""): Promise<{ threads: ThreadSummary[]; nextPageToken: string | null }> {
  const params = new URLSearchParams({ box });
  if (q) params.set("q", q);
  if (pageToken) params.set("pageToken", pageToken);
  return apiFetch(`/api/gmail/threads?${params}`);
}

export async function getThread(id: string): Promise<MailThread> {
  return apiFetch(`/api/gmail/thread?id=${encodeURIComponent(id)}`);
}

export type MailLabel = "UNREAD" | "STARRED" | "INBOX";

export async function modifyThread(threadId: string, change: { add?: MailLabel[]; remove?: MailLabel[] }): Promise<void> {
  await apiFetch("/api/gmail/modify", { method: "POST", json: { threadId, ...change } });
}

export function attachmentUrl(messageId: string, att: MailAttachment): string {
  const p = new URLSearchParams({ messageId, id: att.id, name: att.filename, type: att.mimeType });
  return `/api/gmail/attachment?${p}`;
}

/** Deep link into Gmail's web UI — what a task created from a mail carries in `links`. */
export function gmailWebUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

/** `{name, email}` → "Имя" or the bare address. */
export function displayName(a: MailAddress): string {
  return a.name || a.email || "—";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

/** Local date/time + duration for `addMeeting` from a parsed invite (instants are UTC). */
export function inviteToMeeting(invite: CalendarInvite): { title: string; date: string; time: string; durationMin: number; url?: string } {
  const start = new Date(invite.start);
  const end = invite.end ? new Date(invite.end) : null;
  const durationMin = end ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)) : 30;
  return {
    title: invite.summary,
    date: localDayStr(start),
    time: invite.allDay ? "09:00" : `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
    durationMin: invite.allDay ? 60 : Math.min(durationMin, 24 * 60),
    url: invite.url,
  };
}

/**
 * Unread badge for the sidebar: polls only while Gmail is known to be connected, refreshes on
 * tab focus, and re-reads whenever any other status probe fires (Settings, the Mail page).
 */
export function useGmailUnread(): number | null {
  const [unread, setUnread] = useState<number | null>(() => cachedUnread());
  useEffect(() => {
    const sync = () => setUnread(cachedUnread());
    window.addEventListener(GMAIL_STATUS_EVENT, sync);
    if (!isGmailConnected()) return () => window.removeEventListener(GMAIL_STATUS_EVENT, sync);
    const probe = () => { if (document.visibilityState === "visible") gmailStatus(); };
    probe();
    const id = setInterval(probe, 2 * 60 * 1000);
    window.addEventListener("focus", probe);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", probe);
      window.removeEventListener(GMAIL_STATUS_EVENT, sync);
    };
  }, []);
  return unread;
}

/** Strip tags for a plain-text view of an HTML-only mail (assistant tools, previews). */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
