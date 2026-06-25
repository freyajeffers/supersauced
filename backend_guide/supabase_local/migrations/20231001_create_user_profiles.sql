create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_uid uuid not null unique,
  email text not null,
  name text,
  avatar_url text,
  sauce_log jsonb default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table public.user_profiles enable row level security;

-- Owner can read/write own rows
create policy "owner_rw" on public.user_profiles
  for all using (auth.uid() = auth_uid)
  with check (auth.uid() = auth_uid);

-- GIN index on sauce_log for JSONB queries
create index idx_user_profiles_sauce_log on public.user_profiles using gin (sauce_log);
