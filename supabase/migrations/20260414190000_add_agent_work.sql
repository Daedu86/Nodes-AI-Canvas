create table if not exists public.agent_tokens (
  token_id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  label text null,
  revoked boolean not null default false,
  expires_at timestamptz null,
  last_used_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists agent_tokens_owner_created_idx
  on public.agent_tokens (owner_id, created_at desc);

create table if not exists public.agent_events (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  token_id uuid null references public.agent_tokens (token_id) on delete set null,
  event_type text not null,
  method text not null,
  route text not null,
  session_id uuid null references public.sessions (id) on delete set null,
  project_id uuid null references public.projects (id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists agent_events_owner_created_idx
  on public.agent_events (owner_id, created_at desc);

create index if not exists agent_events_token_created_idx
  on public.agent_events (token_id, created_at desc);

alter table public.agent_tokens enable row level security;
alter table public.agent_events enable row level security;

