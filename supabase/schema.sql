create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  title text null,
  archived boolean not null default false,
  snapshot_json jsonb not null default '{"headId": null, "messages": []}'::jsonb,
  artifacts_json jsonb not null default '[]'::jsonb,
  context_links_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists sessions_owner_updated_idx
  on public.sessions (owner_id, updated_at desc);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  title text null,
  global_context text not null default '',
  arena_winner_session_id uuid null references public.sessions (id) on delete set null,
  arena_winner_branch_key text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists projects_owner_updated_idx
  on public.projects (owner_id, updated_at desc);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_email text not null,
  role text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (project_id, user_email),
  constraint project_member_role_check check (
    role in ('editor', 'viewer')
  )
);

create index if not exists project_members_email_idx
  on public.project_members (user_email);

create table if not exists public.project_sessions (
  project_id uuid not null references public.projects (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (project_id, session_id)
);

create index if not exists project_sessions_session_idx
  on public.project_sessions (session_id);

create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  title text not null,
  content text not null,
  type text not null,
  source_project_id uuid null references public.projects (id) on delete set null,
  source_session_id uuid null references public.sessions (id) on delete set null,
  source_kind text null,
  source_keys jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint memory_type_check check (
    type in ('question', 'draft', 'critique', 'decision', 'summary', 'evidence', 'merge')
  ),
  constraint memory_source_kind_check check (
    source_kind is null or source_kind in ('session', 'branch')
  )
);

create index if not exists memory_owner_updated_idx
  on public.memory_items (owner_id, updated_at desc);

create table if not exists public.project_memory_links (
  project_id uuid not null references public.projects (id) on delete cascade,
  memory_id uuid not null references public.memory_items (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (project_id, memory_id)
);

create index if not exists project_memory_links_memory_idx
  on public.project_memory_links (memory_id);

create trigger sessions_set_updated_at
before update on public.sessions
for each row
execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

create trigger memory_items_set_updated_at
before update on public.memory_items
for each row
execute function public.set_updated_at();

alter table public.sessions enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_sessions enable row level security;
alter table public.memory_items enable row level security;
alter table public.project_memory_links enable row level security;

insert into storage.buckets (id, name, public)
values ('session-artifacts', 'session-artifacts', false)
on conflict (id) do nothing;
