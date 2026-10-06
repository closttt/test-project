-- Knowledge → «Конспекты»: an Obsidian-style vault inside the CRM — folders (any depth) and notes
-- written in a rich-text editor, stored as markdown. Safe to run in full, any number of times
-- (idempotent) — paste this whole file into Supabase Dashboard → SQL Editor → New query → Run.

create table if not exists knowledge_notes (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'note',             -- note | folder
  -- Folder this entry lives in; null = vault root. Deleting a folder deletes what's inside.
  parent_id uuid references knowledge_notes(id) on delete cascade,
  title text not null default '',
  content text not null default '',              -- markdown (folders keep it empty)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_notes_parent_idx on knowledge_notes (parent_id);
create index if not exists knowledge_notes_updated_idx on knowledge_notes (updated_at desc);

alter table knowledge_notes enable row level security;

-- Same single-user trade-off as library_items / knowledge_links: personal tool, the publishable
-- key is public by design, the browser gets full read/write on its OWN notes.
drop policy if exists "Public full access" on knowledge_notes;
create policy "Public full access" on knowledge_notes
  for all
  using (true)
  with check (true);
