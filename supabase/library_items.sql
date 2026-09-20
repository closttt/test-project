-- Knowledge → «Библиотека»: the catalogue of books / articles / videos / podcasts / courses / tools
-- with the owner's notes. Safe to run in full, any number of times (idempotent) — paste this whole
-- file into Supabase Dashboard → SQL Editor → New query → Run. Never errors on "already exists".

create table if not exists library_items (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'article',          -- book | article | video | podcast | course | tool | other
  title text not null,
  author text,
  url text,
  domain text,
  cover_url text,
  description text,
  notes text not null default '',
  tags text[] not null default '{}',
  status text not null default 'want',           -- want | doing | done
  favorite boolean not null default false,
  rating smallint,                               -- 1..5
  source_card_id uuid,                           -- knowledge_cards.id this item was made from
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_items_created_idx on library_items (created_at desc);
create index if not exists library_items_status_idx on library_items (status);

alter table library_items enable row level security;

-- Same single-user trade-off as knowledge_links: personal tool, publishable key is public by
-- design, the browser gets full read/write on its OWN library.
drop policy if exists "Public full access" on library_items;
create policy "Public full access" on library_items
  for all
  using (true)
  with check (true);

-- Public bucket for cover images uploaded from the browser (anon key).
insert into storage.buckets (id, name, public)
values ('library-covers', 'library-covers', true)
on conflict (id) do nothing;

drop policy if exists "library covers public read" on storage.objects;
create policy "library covers public read" on storage.objects
  for select using (bucket_id = 'library-covers');

drop policy if exists "library covers anon upload" on storage.objects;
create policy "library covers anon upload" on storage.objects
  for insert with check (bucket_id = 'library-covers');
