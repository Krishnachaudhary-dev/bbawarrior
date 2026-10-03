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
