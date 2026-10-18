-- Supabase: SQL Editor, вставить и нажать Run (один раз).
create table if not exists public.planner (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.planner enable row level security;
create policy "own row" on public.planner
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
