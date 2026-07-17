-- Safe to run in full, any number of times (idempotent) — paste this whole file into
-- Supabase Dashboard → SQL Editor → New query → Run. Never errors on "already exists".

create table if not exists knowledge_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  source_url text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Backfills these columns if the table already existed before this file's first run.
alter table knowledge_cards add column if not exists image_url text;
alter table knowledge_cards add column if not exists source_url text;

alter table knowledge_cards enable row level security;

-- The browser app uses the anon/publishable key — read-only.
drop policy if exists "Public read access" on knowledge_cards;
create policy "Public read access" on knowledge_cards
  for select
  using (true);

-- Lets the CRM UI delete a card (its own "×" button). Trade-off, accepted for a personal,
-- single-user tool: the publishable key is public by design, so anyone holding it could delete
-- rows directly via the REST API, not just through the UI. No insert/update policy for
-- anon — new cards only ever come from the bot/Hermes Agent skill via the service_role key,
-- which bypasses RLS entirely and must never reach the browser.
drop policy if exists "Public delete access" on knowledge_cards;
create policy "Public delete access" on knowledge_cards
  for delete
  using (true);

-- Lets the CRM UI attach a source link by hand. Needed because Telegram exposes no public t.me
-- link for posts forwarded from PRIVATE channels — the bot correctly leaves source_url null
-- there, and the user fills it in from the card. Same single-user trade-off as the delete policy.
drop policy if exists "Public update access" on knowledge_cards;
create policy "Public update access" on knowledge_cards
  for update
  using (true)
  with check (true);

-- Public storage bucket for card images. The bot downloads the Telegram photo and uploads it
-- here (service_role key), then stores THIS permanent public URL as image_url — never the
-- Telegram file URL directly, since that embeds the bot token and expires.
insert into storage.buckets (id, name, public)
values ('knowledge-images', 'knowledge-images', true)
on conflict (id) do nothing;
