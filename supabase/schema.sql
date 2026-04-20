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

create table if not exists public.llm_settings (
  owner_id text primary key,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_plans (
  owner_id text primary key,
  plan text not null default 'free',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_plans_plan_check check (
    plan in ('free', 'paid')
  )
);

create table if not exists public.chat_usage_state (
  owner_id text primary key,
  minute_window_start timestamptz not null,
  minute_count integer not null default 0,
  hour_window_start timestamptz not null,
  hour_count integer not null default 0,
  day_window_start timestamptz not null,
  day_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.project_memory_links (
  project_id uuid not null references public.projects (id) on delete cascade,
  memory_id uuid not null references public.memory_items (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (project_id, memory_id)
);

create index if not exists project_memory_links_memory_idx
  on public.project_memory_links (memory_id);

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

create or replace function public.reserve_chat_usage(
  p_owner_id text,
  p_now timestamptz,
  p_minute_limit integer,
  p_hour_limit integer,
  p_day_limit integer
)
returns table (
  allowed boolean,
  minute_window_start timestamptz,
  minute_count integer,
  hour_window_start timestamptz,
  hour_count integer,
  day_window_start timestamptz,
  day_count integer,
  retry_after_seconds integer,
  retry_scope text
)
language plpgsql
as $$
declare
  v_record public.chat_usage_state%rowtype;
  v_minute_window_start timestamptz := timezone('utc', date_trunc('minute', timezone('utc', p_now)));
  v_hour_window_start timestamptz := timezone('utc', date_trunc('hour', timezone('utc', p_now)));
  v_day_window_start timestamptz := timezone('utc', date_trunc('day', timezone('utc', p_now)));
  v_retry_after_seconds integer := 0;
  v_retry_scope text := null;
begin
  insert into public.chat_usage_state (
    owner_id,
    minute_window_start,
    minute_count,
    hour_window_start,
    hour_count,
    day_window_start,
    day_count
  )
  values (
    p_owner_id,
    v_minute_window_start,
    0,
    v_hour_window_start,
    0,
    v_day_window_start,
    0
  )
  on conflict (owner_id) do nothing;

  select *
  into v_record
  from public.chat_usage_state
  where owner_id = p_owner_id
  for update;

  if v_record.minute_window_start < v_minute_window_start then
    v_record.minute_window_start := v_minute_window_start;
    v_record.minute_count := 0;
  end if;

  if v_record.hour_window_start < v_hour_window_start then
    v_record.hour_window_start := v_hour_window_start;
    v_record.hour_count := 0;
  end if;

  if v_record.day_window_start < v_day_window_start then
    v_record.day_window_start := v_day_window_start;
    v_record.day_count := 0;
  end if;

  if v_record.minute_count >= p_minute_limit then
    v_retry_scope := 'minute';
    v_retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from ((v_record.minute_window_start + interval '1 minute') - p_now)))::integer
    );
  elsif v_record.hour_count >= p_hour_limit then
    v_retry_scope := 'hour';
    v_retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from ((v_record.hour_window_start + interval '1 hour') - p_now)))::integer
    );
  elsif v_record.day_count >= p_day_limit then
    v_retry_scope := 'day';
    v_retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from ((v_record.day_window_start + interval '1 day') - p_now)))::integer
    );
  end if;

  if v_retry_scope is null then
    v_record.minute_count := v_record.minute_count + 1;
    v_record.hour_count := v_record.hour_count + 1;
    v_record.day_count := v_record.day_count + 1;

    update public.chat_usage_state
    set minute_window_start = v_record.minute_window_start,
        minute_count = v_record.minute_count,
        hour_window_start = v_record.hour_window_start,
        hour_count = v_record.hour_count,
        day_window_start = v_record.day_window_start,
        day_count = v_record.day_count
    where owner_id = p_owner_id;

    return query
    select
      true,
      v_record.minute_window_start,
      v_record.minute_count,
      v_record.hour_window_start,
      v_record.hour_count,
      v_record.day_window_start,
      v_record.day_count,
      0,
      null::text;
    return;
  end if;

  update public.chat_usage_state
  set minute_window_start = v_record.minute_window_start,
      minute_count = v_record.minute_count,
      hour_window_start = v_record.hour_window_start,
      hour_count = v_record.hour_count,
      day_window_start = v_record.day_window_start,
      day_count = v_record.day_count
  where owner_id = p_owner_id;

  return query
  select
    false,
    v_record.minute_window_start,
    v_record.minute_count,
    v_record.hour_window_start,
    v_record.hour_count,
    v_record.day_window_start,
    v_record.day_count,
    v_retry_after_seconds,
    v_retry_scope;
end;
$$;

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

create trigger llm_settings_set_updated_at
before update on public.llm_settings
for each row
execute function public.set_updated_at();

create trigger user_plans_set_updated_at
before update on public.user_plans
for each row
execute function public.set_updated_at();

create trigger chat_usage_state_set_updated_at
before update on public.chat_usage_state
for each row
execute function public.set_updated_at();

alter table public.sessions enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_sessions enable row level security;
alter table public.memory_items enable row level security;
alter table public.llm_settings enable row level security;
alter table public.user_plans enable row level security;
alter table public.chat_usage_state enable row level security;
alter table public.project_memory_links enable row level security;
alter table public.agent_tokens enable row level security;
alter table public.agent_events enable row level security;

insert into storage.buckets (id, name, public)
values ('session-artifacts', 'session-artifacts', false)
on conflict (id) do nothing;
