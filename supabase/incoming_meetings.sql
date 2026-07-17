-- Safe to run in full, any number of times (idempotent) — paste this whole file into
-- Supabase Dashboard → SQL Editor → New query → Run. Never errors on "already exists".
--
-- Inbox for calendar invites. Hermes Agent parses an invite (forwarded to the Telegram bot, or
-- read from the mailbox via IMAP) and writes a row here with the service_role key. The CRM polls
-- the table and imports new rows into its local Meetings — same pipeline as knowledge_cards,
-- no OAuth and no backend of our own.
--
-- Zoom needs no separate integration: when a call is created through Google Calendar, the join
-- link is already in the invite body, so it lands here in `url` like any other link.

create table if not exists incoming_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- YYYY-MM-DD / HH:MM in the user's local time, matching the CRM's Meeting shape exactly.
  date text not null,
  time text not null default '12:00',
  duration_min int not null default 30,
  -- Join link (Zoom/Meet/…), pulled straight out of the invite body.
  url text,
  -- Where it came from ("telegram" | "email") — shown in the CRM so the origin is never a mystery.
  source text,
  created_at timestamptz not null default now()
);

alter table incoming_meetings enable row level security;

-- The browser app uses the anon/publishable key — read-only, like knowledge_cards.
drop policy if exists "Public read access" on incoming_meetings;
create policy "Public read access" on incoming_meetings
  for select
  using (true);

-- The CRM deletes a row once it has imported it into local storage, so the inbox drains itself
-- and an invite can't be imported twice. Writes still only ever come from Hermes via
-- service_role, which bypasses RLS and must never reach the browser.
drop policy if exists "Public delete access" on incoming_meetings;
create policy "Public delete access" on incoming_meetings
  for delete
  using (true);
