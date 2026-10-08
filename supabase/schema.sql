-- Shared class board for the BBA Section H organizer
-- Run once in the Supabase SQL editor. One row holds the whole class document,
-- which matches how the organizer already works: the board, the logins and the
-- class code are always saved and replaced as a unit.

create table if not exists public.class_state (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Locked down on purpose. The browser never talks to Supabase directly; it calls
-- the serverless functions under /api, which use the service role key and bypass
-- RLS. With no anon policy here, the anon key cannot read or write this table.
alter table public.class_state enable row level security;

-- Sanity check: run this after creating the table. Both should say zero rows.
select count(*) from public.class_state;
select count(*) from pg_policies where tablename = 'class_state';

-- ---------------------------------------------------------------------------
-- Server side sessions (required before deploying the cookie sign in).
--
-- The browser holds a random token in an HttpOnly cookie; this table stores
-- only its SHA-256, so a database dump cannot be replayed as a login. Rows
-- carry no password. The API creates, reads and deletes these rows with the
-- service role key; expired sessions are removed on use, and an occasional
-- manual cleanup can delete rows whose expires_at is in the past.
-- ---------------------------------------------------------------------------

create table if not exists public.class_sessions (
  id         uuid primary key default gen_random_uuid(),
  account_id text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text,
  ip         text
);

create index if not exists class_sessions_account_idx
  on public.class_sessions (account_id);

create index if not exists class_sessions_expiry_idx
  on public.class_sessions (expires_at);

-- Same lockdown as class_state: no anon policies exist, so the publishable key
-- can neither read nor write session rows; only the server side key reaches them.
alter table public.class_sessions enable row level security;

-- Lockdown check: zero policy rows is correct AFTER the table exists, but it
-- also returns zero when the table is missing entirely, so it can never prove
-- the table was created. Use the existence check at the bottom of this file.
select count(*) from pg_policies where tablename = 'class_sessions';

-- Reload PostgREST schema cache. Without this a freshly created table can stay
-- invisible to the API until the cache refreshes on its own, which surfaces as
-- "Could not find the table ... in the schema cache".
notify pgrst, 'reload schema';

-- Decisive existence check. This returns the column list when class_sessions is
-- really there, and raises a missing-relation error when it is not. Unlike a
-- pg_policies count, it cannot return an innocent zero for a table that was
-- never created.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'class_sessions'
order by ordinal_position;
