create table if not exists public.chat_run_leases (
  lease_id uuid primary key,
  owner_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chat_run_leases_expiry_check check (expires_at > created_at)
);

create index if not exists chat_run_leases_owner_expiry_idx
  on public.chat_run_leases (owner_id, expires_at);

alter table public.chat_run_leases enable row level security;

revoke all on table public.chat_run_leases from anon, authenticated;
grant select, insert, update, delete on table public.chat_run_leases to service_role;

create or replace function public.reserve_chat_run_lease(
  p_owner_id text,
  p_lease_id uuid,
  p_now timestamptz,
  p_expires_at timestamptz,
  p_concurrent_limit integer
)
returns table (
  granted boolean,
  active_count integer,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_active_count integer;
  v_earliest_expiry timestamptz;
begin
  if p_owner_id is null or length(btrim(p_owner_id)) = 0 then
    raise exception using errcode = '22023', message = 'owner id is required';
  end if;
  if p_concurrent_limit < 1 then
    raise exception using errcode = '22023', message = 'concurrent limit must be positive';
  end if;
  if p_expires_at <= p_now then
    raise exception using errcode = '22023', message = 'lease expiry must be in the future';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id, 0));

  delete from public.chat_run_leases
  where owner_id = p_owner_id
    and expires_at <= p_now;

  if exists (
    select 1
    from public.chat_run_leases
    where lease_id = p_lease_id
      and owner_id = p_owner_id
  ) then
    update public.chat_run_leases
    set expires_at = p_expires_at
    where lease_id = p_lease_id
      and owner_id = p_owner_id;

    select count(*)::integer
    into v_active_count
    from public.chat_run_leases
    where owner_id = p_owner_id;

    return query select true, v_active_count, 0;
    return;
  end if;

  select count(*)::integer, min(expires_at)
  into v_active_count, v_earliest_expiry
  from public.chat_run_leases
  where owner_id = p_owner_id;

  if v_active_count >= p_concurrent_limit then
    return query
    select
      false,
      v_active_count,
      greatest(
        1,
        ceil(extract(epoch from (v_earliest_expiry - p_now)))::integer
      );
    return;
  end if;

  insert into public.chat_run_leases (lease_id, owner_id, expires_at)
  values (p_lease_id, p_owner_id, p_expires_at);

  return query select true, v_active_count + 1, 0;
end;
$$;

create or replace function public.release_chat_run_lease(
  p_owner_id text,
  p_lease_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer;
begin
  if p_owner_id is null or length(btrim(p_owner_id)) = 0 then
    raise exception using errcode = '22023', message = 'owner id is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id, 0));

  delete from public.chat_run_leases
  where lease_id = p_lease_id
    and owner_id = p_owner_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.reserve_chat_run_lease(text, uuid, timestamptz, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.release_chat_run_lease(text, uuid)
  from public, anon, authenticated;

grant execute on function public.reserve_chat_run_lease(text, uuid, timestamptz, timestamptz, integer)
  to service_role;
grant execute on function public.release_chat_run_lease(text, uuid)
  to service_role;
