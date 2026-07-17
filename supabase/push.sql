-- Safe to run in full, any number of times (idempotent) — paste into
-- Supabase Dashboard → SQL Editor → New query → Run.
--
-- WEB PUSH: what it costs architecturally, in plain terms.
--
-- A reminder can only fire with the tab closed if SOMETHING outside the browser knows it's due.
-- The app is local-first (tasks live in localStorage), so we ship the bare minimum off-device:
-- the reminder's title and its time — nothing else. No task bodies, no projects, no clients.
-- That is far short of full cloud-sync (explicitly not wanted), but it is not zero either:
-- a task title leaves the machine for any task with a reminder set.
--
-- Rows delete themselves once sent, so the table is a queue, not a mirror.

-- Browser push subscriptions (one per browser/device).
create table if not exists push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- Single-user tool: the browser manages its own subscription with the publishable key.
drop policy if exists "Public manage subscriptions" on push_subscriptions;
create policy "Public manage subscriptions" on push_subscriptions
  for all
  using (true)
  with check (true);

-- The reminder queue. The client upserts a row when a task gets a reminder and deletes it when
-- the reminder is cleared / the task is closed.
create table if not exists push_reminders (
  -- The task's own id: re-setting a reminder overwrites instead of duplicating.
  id text primary key,
  title text not null,
  remind_at timestamptz not null,
  url text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table push_reminders enable row level security;

drop policy if exists "Public manage reminders" on push_reminders;
create policy "Public manage reminders" on push_reminders
  for all
  using (true)
  with check (true);

-- Lets the sender find "due and not yet sent" without a full scan.
create index if not exists push_reminders_due_idx on push_reminders (remind_at) where sent_at is null;
