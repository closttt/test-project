-- OAuth tokens for server-side integrations (plan B1: Gmail). Paste into Supabase → SQL Editor → Run.
-- Idempotent — safe to re-run.
--
-- SECURITY: this table is read/written ONLY from Vercel functions using SUPABASE_SERVICE_ROLE_KEY
-- (which bypasses RLS). RLS is enabled with NO policies, so the browser's anon/publishable key —
-- which is public by design — gets nothing here, unlike the app's other single-user tables.

create table if not exists integration_tokens (
  provider text primary key,            -- 'google'
  account_email text,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,               -- when access_token lapses
  scope text,
  updated_at timestamptz not null default now()
);

alter table integration_tokens enable row level security;
-- Deliberately no policies: anon has zero access. service_role bypasses RLS.
drop policy if exists "Public full access" on integration_tokens;
