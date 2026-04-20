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

create trigger user_plans_set_updated_at
before update on public.user_plans
for each row
execute function public.set_updated_at();

create trigger chat_usage_state_set_updated_at
before update on public.chat_usage_state
for each row
execute function public.set_updated_at();

alter table public.user_plans enable row level security;
alter table public.chat_usage_state enable row level security;
