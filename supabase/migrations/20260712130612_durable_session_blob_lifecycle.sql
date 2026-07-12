create table if not exists public.session_blobs (
  blob_ref text primary key,
  session_id uuid,
  owner_id text,
  bucket_id text not null default 'session-artifacts',
  content_hash text not null,
  byte_size bigint not null default 0 check (byte_size >= 0),
  mime_type text,
  original_file_name text,
  state text not null default 'pending'
    check (state in ('pending', 'active', 'deleting', 'delete_failed')),
  reference_count integer not null default 0 check (reference_count >= 0),
  delete_after timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists session_blobs_owner_state_idx
  on public.session_blobs (owner_id, state);
create index if not exists session_blobs_session_state_idx
  on public.session_blobs (session_id, state);
create index if not exists session_blobs_delete_after_idx
  on public.session_blobs (delete_after)
  where state in ('deleting', 'delete_failed');

create table if not exists public.session_blob_delete_queue (
  id bigint generated always as identity primary key,
  blob_ref text not null unique
    references public.session_blobs(blob_ref) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'failed', 'completed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists session_blob_delete_queue_claim_idx
  on public.session_blob_delete_queue (status, available_at, id);

alter table public.session_blobs enable row level security;
alter table public.session_blob_delete_queue enable row level security;
revoke all on table public.session_blobs from anon, authenticated;
revoke all on table public.session_blob_delete_queue from anon, authenticated;
grant select, insert, update, delete on table public.session_blobs to service_role;
grant select, insert, update, delete on table public.session_blob_delete_queue to service_role;
grant usage, select on sequence public.session_blob_delete_queue_id_seq to service_role;

create or replace function public.session_blob_refs(p_artifacts jsonb)
returns table (blob_ref text, reference_count integer)
language sql
immutable
security invoker
set search_path = pg_catalog, public
as $$
  select btrim(item->>'blobRef'), count(*)::integer
  from jsonb_array_elements(
    case when jsonb_typeof(p_artifacts) = 'array'
      then p_artifacts else '[]'::jsonb end
  ) item
  where nullif(btrim(item->>'blobRef'), '') is not null
  group by btrim(item->>'blobRef');
$$;

create or replace function public.list_session_artifact_storage_objects(p_bucket_id text)
returns table (
  blob_ref text,
  byte_size bigint,
  created_at timestamptz,
  updated_at timestamptz,
  mime_type text
)
language sql
stable
security invoker
set search_path = pg_catalog, public, storage
as $$
  select
    o.name,
    case when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
      then (o.metadata->>'size')::bigint else 0::bigint end,
    o.created_at,
    o.updated_at,
    coalesce(o.metadata->>'mimetype', o.metadata->>'contentType')
  from storage.objects o
  where o.bucket_id = p_bucket_id
  order by o.name;
$$;

create or replace function public.get_session_blob_usage(p_owner_id text)
returns bigint
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(sum(byte_size), 0)::bigint
  from public.session_blobs
  where owner_id = p_owner_id and state in ('pending', 'active');
$$;

create or replace function public.patch_session_with_blob_reconciliation(
  p_session_id uuid,
  p_owner_id text,
  p_expected_version bigint,
  p_patch jsonb,
  p_now timestamptz default timezone('utc', now())
)
returns setof public.sessions
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_current public.sessions%rowtype;
  v_updated public.sessions%rowtype;
  v_artifacts jsonb;
  v_invalid_ref text;
begin
  select * into v_current
  from public.sessions
  where id = p_session_id and owner_id = p_owner_id
  for update;

  if not found or v_current.version <> p_expected_version then return; end if;

  v_artifacts := case when p_patch ? 'artifacts'
    then coalesce(p_patch->'artifacts', '[]'::jsonb)
    else v_current.artifacts_json end;
  if jsonb_typeof(v_artifacts) <> 'array' then
    raise exception using errcode = '22023', message = 'artifacts must be a JSON array';
  end if;

  if p_patch ? 'artifacts' then
    select r.blob_ref into v_invalid_ref
    from public.session_blob_refs(v_artifacts) r
    left join public.session_blobs b on b.blob_ref = r.blob_ref
    left join public.session_blob_delete_queue q on q.blob_ref = r.blob_ref
    where b.blob_ref is null
       or b.session_id is distinct from p_session_id
       or b.owner_id is distinct from p_owner_id
       or q.status = 'processing'
    limit 1;
    if v_invalid_ref is not null then
      raise exception using errcode = '23514', message = 'invalid or unavailable session blob reference';
    end if;
  end if;

  update public.sessions s
  set
    title = case when p_patch ? 'title'
      then nullif(btrim(p_patch->>'title'), '') else s.title end,
    archived = case when p_patch ? 'archived'
      then coalesce((p_patch->>'archived')::boolean, false) else s.archived end,
    snapshot_json = case when p_patch ? 'snapshot'
      then coalesce(p_patch->'snapshot', s.snapshot_json) else s.snapshot_json end,
    artifacts_json = v_artifacts,
    context_links_json = case when p_patch ? 'contextLinks'
      then coalesce(p_patch->'contextLinks', '[]'::jsonb) else s.context_links_json end,
    version = s.version + 1,
    updated_at = p_now
  where s.id = p_session_id and s.owner_id = p_owner_id
    and s.version = p_expected_version
  returning s.* into v_updated;
  if not found then return; end if;

  if p_patch ? 'artifacts' then
    with refs as (select * from public.session_blob_refs(v_artifacts))
    update public.session_blobs b
    set state = 'active', reference_count = refs.reference_count,
        delete_after = null, last_error = null, updated_at = p_now
    from refs where b.blob_ref = refs.blob_ref;

    delete from public.session_blob_delete_queue q
    using public.session_blob_refs(v_artifacts) refs
    where q.blob_ref = refs.blob_ref and q.status <> 'processing';

    with refs as (select * from public.session_blob_refs(v_artifacts)),
    stale as (
      update public.session_blobs b
      set state = 'deleting', reference_count = 0,
          delete_after = p_now, updated_at = p_now
      where b.session_id = p_session_id and b.owner_id = p_owner_id
        and b.state in ('pending', 'active', 'delete_failed')
        and not exists (select 1 from refs where refs.blob_ref = b.blob_ref)
      returning b.blob_ref
    )
    insert into public.session_blob_delete_queue (
      blob_ref, status, attempts, available_at, locked_at,
      completed_at, last_error, updated_at
    )
    select blob_ref, 'pending', 0, p_now, null, null, null, p_now
    from stale
    on conflict on constraint session_blob_delete_queue_blob_ref_key do update set
      status = case when public.session_blob_delete_queue.status = 'processing'
        then 'processing' else 'pending' end,
      attempts = case when public.session_blob_delete_queue.status = 'processing'
        then public.session_blob_delete_queue.attempts else 0 end,
      available_at = case when public.session_blob_delete_queue.status = 'processing'
        then public.session_blob_delete_queue.available_at else excluded.available_at end,
      locked_at = case when public.session_blob_delete_queue.status = 'processing'
        then public.session_blob_delete_queue.locked_at else null end,
      completed_at = null, last_error = null, updated_at = excluded.updated_at;
  end if;

  return next v_updated;
end;
$$;

create or replace function public.delete_session_with_blob_reconciliation(
  p_session_id uuid,
  p_owner_id text,
  p_now timestamptz default timezone('utc', now())
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform 1 from public.sessions
  where id = p_session_id and owner_id = p_owner_id for update;
  if not found then return false; end if;

  with stale as (
    update public.session_blobs b
    set state = 'deleting', reference_count = 0,
        delete_after = p_now, updated_at = p_now
    where b.session_id = p_session_id and b.owner_id = p_owner_id
    returning b.blob_ref
  )
  insert into public.session_blob_delete_queue (
    blob_ref, status, attempts, available_at, locked_at,
    completed_at, last_error, updated_at
  )
  select blob_ref, 'pending', 0, p_now, null, null, null, p_now from stale
  on conflict on constraint session_blob_delete_queue_blob_ref_key do update set
    status = case when public.session_blob_delete_queue.status = 'processing'
      then 'processing' else 'pending' end,
    attempts = case when public.session_blob_delete_queue.status = 'processing'
      then public.session_blob_delete_queue.attempts else 0 end,
    available_at = case when public.session_blob_delete_queue.status = 'processing'
      then public.session_blob_delete_queue.available_at else excluded.available_at end,
    locked_at = case when public.session_blob_delete_queue.status = 'processing'
      then public.session_blob_delete_queue.locked_at else null end,
    completed_at = null, last_error = null, updated_at = excluded.updated_at;

  delete from public.sessions where id = p_session_id and owner_id = p_owner_id;
  return true;
end;
$$;

create or replace function public.complete_session_blob_deletion(
  p_blob_ref text,
  p_success boolean,
  p_error text default null,
  p_retry_seconds integer default 300,
  p_now timestamptz default timezone('utc', now())
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_attempts integer;
  v_delay_seconds integer;
begin
  if p_success then
    delete from public.session_blobs where blob_ref = p_blob_ref;
    return;
  end if;
  select attempts into v_attempts
  from public.session_blob_delete_queue where blob_ref = p_blob_ref;
  v_delay_seconds := greatest(60, p_retry_seconds)
    * (2 ^ greatest(0, least(coalesce(v_attempts, 1), 6) - 1));
  update public.session_blobs
  set state = 'delete_failed',
      delete_after = p_now + make_interval(secs => v_delay_seconds),
      last_error = left(coalesce(p_error, 'Storage deletion failed'), 2000),
      updated_at = p_now
  where blob_ref = p_blob_ref;
  update public.session_blob_delete_queue
  set status = 'failed',
      available_at = p_now + make_interval(secs => v_delay_seconds),
      locked_at = null,
      last_error = left(coalesce(p_error, 'Storage deletion failed'), 2000),
      updated_at = p_now
  where blob_ref = p_blob_ref;
end;
$$;

insert into public.session_blobs (
  blob_ref, session_id, owner_id, bucket_id, content_hash,
  byte_size, mime_type, state, reference_count, created_at, updated_at
)
select refs.blob_ref, s.id, s.owner_id,
  coalesce(o.bucket_id, 'session-artifacts'),
  split_part(refs.blob_ref, '/', 2),
  case when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
    then (o.metadata->>'size')::bigint else 0::bigint end,
  coalesce(o.metadata->>'mimetype', o.metadata->>'contentType'),
  'active', refs.reference_count,
  coalesce(o.created_at, s.created_at), timezone('utc', now())
from public.sessions s
cross join lateral public.session_blob_refs(s.artifacts_json) refs
left join storage.objects o
  on o.bucket_id = 'session-artifacts' and o.name = refs.blob_ref
on conflict (blob_ref) do update set
  session_id = excluded.session_id,
  owner_id = excluded.owner_id,
  state = 'active',
  reference_count = excluded.reference_count,
  updated_at = excluded.updated_at;

revoke all on function public.session_blob_refs(jsonb) from public, anon, authenticated;
revoke all on function public.list_session_artifact_storage_objects(text) from public, anon, authenticated;
revoke all on function public.get_session_blob_usage(text) from public, anon, authenticated;
revoke all on function public.patch_session_with_blob_reconciliation(uuid, text, bigint, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.delete_session_with_blob_reconciliation(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_session_blob_deletion(text, boolean, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.session_blob_refs(jsonb) to service_role;
grant execute on function public.list_session_artifact_storage_objects(text) to service_role;
grant execute on function public.get_session_blob_usage(text) to service_role;
grant execute on function public.patch_session_with_blob_reconciliation(uuid, text, bigint, jsonb, timestamptz) to service_role;
grant execute on function public.delete_session_with_blob_reconciliation(uuid, text, timestamptz) to service_role;
grant execute on function public.complete_session_blob_deletion(text, boolean, text, integer, timestamptz) to service_role;
