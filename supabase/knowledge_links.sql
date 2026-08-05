-- Knowledge → «Ссылки»: user-made link shelf with sections (like project sections).
-- Safe to run in full, any number of times (idempotent) — paste this whole file into
-- Supabase Dashboard → SQL Editor → New query → Run. Never errors on "already exists".

-- Sections ("Анимации", "Шрифты", …). Links with section_id = null sit in the unsorted area.
create table if not exists knowledge_link_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Manual order of the sections themselves (drag to reorder).
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists knowledge_links (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  title text,
  domain text not null,
  -- Dropping a section keeps its links: they fall back to the unsorted area.
  section_id uuid references knowledge_link_sections (id) on delete set null,
  -- Manual order within a section. Doubles (not ints) so a card dropped between two
  -- neighbours is just the midpoint — no renumbering of the whole list on every drag.
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

-- Backfills for a table created by an earlier version of this file.
alter table knowledge_links add column if not exists section_id uuid references knowledge_link_sections (id) on delete set null;
alter table knowledge_links add column if not exists position double precision not null default 0;

create index if not exists knowledge_links_section_idx on knowledge_links (section_id, position);

alter table knowledge_link_sections enable row level security;
alter table knowledge_links enable row level security;

-- Same single-user trade-off as knowledge_cards: this is a personal tool and the publishable
-- key is public by design, so the browser gets full read/write on its OWN shelf. Nothing here
-- is secret — it's a list of links the user saved themselves.
drop policy if exists "Public full access" on knowledge_link_sections;
create policy "Public full access" on knowledge_link_sections
  for all
  using (true)
  with check (true);

drop policy if exists "Public full access" on knowledge_links;
create policy "Public full access" on knowledge_links
  for all
  using (true)
  with check (true);
