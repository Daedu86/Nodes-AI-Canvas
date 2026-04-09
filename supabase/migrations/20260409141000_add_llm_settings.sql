create table if not exists public.llm_settings (
  owner_id text primary key,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger llm_settings_set_updated_at
before update on public.llm_settings
for each row
execute function public.set_updated_at();

alter table public.llm_settings enable row level security;
