import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { KnowledgeCard, Meeting } from "@/types";

/**
 * Official Supabase JS client. The browser only ever needs READ access (anon/publishable key +
 * a read-only RLS policy); writes come from the bot/Hermes Agent skill server-side using the
 * service_role key, which never ships to the client.
 */

let client: SupabaseClient | null | undefined; // undefined = not yet resolved, null = not configured

function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  client = url && anonKey ? createClient(url, anonKey) : null;
  return client;
}

export function isSupabaseConfigured(): boolean {
  return getClient() !== null;
}

/** Raw client for callers that need their own tables (push subscriptions/reminders). */
export function getSupabaseClient(): SupabaseClient | null {
  return getClient();
}

interface KnowledgeCardRow {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  source_url: string | null;
  tags: string[] | null;
  created_at: string;
}

function fromRow(row: KnowledgeCardRow): KnowledgeCard {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    imageUrl: row.image_url ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    tags: row.tags ?? [],
    createdAt: row.created_at,
  };
}

/** Fetches knowledge cards newest-first. Throws if Supabase isn't configured or the request fails. */
export async function fetchKnowledgeCards(): Promise<KnowledgeCard[]> {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase не настроен — задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.");
  const { data, error } = await supabase
    .from("knowledge_cards")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as KnowledgeCardRow[]).map(fromRow);
}

/** Deletes a knowledge card. Requires the "Public delete" RLS policy (see supabase/knowledge_cards.sql). */
export async function deleteKnowledgeCard(id: string): Promise<void> {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase не настроен.");
  const { error } = await supabase.from("knowledge_cards").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Sets a card's source link by hand. Needed because Telegram gives no public t.me link for posts
 * forwarded from PRIVATE channels — Hermes correctly leaves source_url null there, and this is the
 * manual fallback. Requires an update RLS policy alongside the delete one.
 */
export async function updateKnowledgeCardSource(id: string, sourceUrl: string | null): Promise<void> {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase не настроен.");
  const { error } = await supabase
    .from("knowledge_cards")
    .update({ source_url: sourceUrl })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Calendar-invite inbox (see supabase/incoming_meetings.sql) ────────────────────────────

/** A calendar invite Hermes parsed and dropped into the inbox, not yet imported by the CRM. */
export interface IncomingMeeting {
  id: string;
  meeting: Omit<Meeting, "id">;
  source?: string;
}

interface IncomingMeetingRow {
  id: string;
  title: string;
  date: string;
  time: string | null;
  duration_min: number | null;
  url: string | null;
  source: string | null;
}

/** Reads pending invites oldest-first. Returns [] when Supabase isn't configured — the inbox is optional. */
export async function fetchIncomingMeetings(): Promise<IncomingMeeting[]> {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("incoming_meetings")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as IncomingMeetingRow[]).map((r) => ({
    id: r.id,
    source: r.source ?? undefined,
    meeting: {
      title: r.title,
      date: r.date,
      time: r.time ?? "12:00",
      durationMin: r.duration_min ?? 30,
      url: r.url ?? undefined,
      recurrence: "none",
    },
  }));
}

/**
 * Drops an invite from the inbox once the CRM has imported it. Draining the row (rather than
 * flagging it) is what keeps imports idempotent: nothing to re-import, and a meeting the user
 * later deletes locally can never come back.
 */
export async function deleteIncomingMeeting(id: string): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;
  const { error } = await supabase.from("incoming_meetings").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
