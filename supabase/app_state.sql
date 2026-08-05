-- Cloud sync for the WHOLE app (tasks, projects, notes, clients, students, meetings, settings,
-- gamification, pomodoro history) — everything the CRM keeps in its single AppData object.
-- Safe to run in full, any number of times (idempotent) — paste this whole file into
-- Supabase Dashboard → SQL Editor → New query → Run. Never errors on "already exists".

-- One row holds the entire state as JSONB.
--
-- Why a document and not a table per entity: the app's single source of truth is ONE immutable
-- AppData object (see src/store/DataProvider.tsx) that every action replaces wholesale. Mirroring
-- that shape one-to-one keeps the sync honest and atomic — a save can't half-apply and leave
-- tasks pointing at a project that didn't make it. Normalising into ten tables would mean
-- rewriting every store action into async row writes, with a real risk of losing data in the
-- process; for a single-owner tool that trade is not worth it.
create table if not exists app_state (
  -- Fixed key: this deployment has exactly one owner and one state document.
  id text primary key default 'main',
  data jsonb not null,
  -- Bumped on every write by the trigger below; the client compares it to decide whether the
  -- cloud has changes it hasn't seen (i.e. another device wrote) before adopting anything.
  updated_at timestamptz not null default now()
);

create or replace function app_state_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists app_state_set_updated_at on app_state;
create trigger app_state_set_updated_at
  before update on app_state
  for each row execute function app_state_touch_updated_at();

alter table app_state enable row level security;

-- Same single-user trade-off as knowledge_cards/knowledge_links: personal tool, the publishable
-- key is public by design, and the browser needs full read/write on its own state.
--
-- If this app ever gains a second user, THIS is the policy to replace first: swap the fixed 'main'
-- id for auth.uid() and scope the policy to `auth.uid() = id`.
drop policy if exists "Public full access" on app_state;
create policy "Public full access" on app_state
  for all
  using (true)
  with check (true);
