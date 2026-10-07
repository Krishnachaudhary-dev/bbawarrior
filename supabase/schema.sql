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

-- Sanity check: this should say zero rows of policies on class_sessions too.
select count(*) from pg_policies where tablename = 'class_sessions';
