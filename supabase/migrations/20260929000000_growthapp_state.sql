-- GrowthApp sync backup — applied automatically by the Supabase GitHub
-- integration on pushes to main (or run manually in the SQL Editor).
-- api/sync.js dual-writes every sync snapshot into this table and reads from
-- it whenever the primary Upstash KV store misses.

create table if not exists public.growthapp_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.growthapp_state enable row level security;

-- Recommended: configure SUPABASE_SERVICE_ROLE_KEY in Vercel. The service role
-- bypasses RLS, so you are done — the table is now writable only by the server.
--
-- Only if you instead configure the public ANON key in Vercel, uncomment:
-- drop policy if exists "anon read growthapp_state" on public.growthapp_state;
-- drop policy if exists "anon upsert growthapp_state" on public.growthapp_state;
-- drop policy if exists "anon update growthapp_state" on public.growthapp_state;
-- create policy "anon read growthapp_state" on public.growthapp_state for select using (true);
-- create policy "anon upsert growthapp_state" on public.growthapp_state for insert with check (true);
-- create policy "anon update growthapp_state" on public.growthapp_state for update using (true) with check (true);
