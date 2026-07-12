alter table public.sessions
  add column if not exists schema_version smallint not null default 1;

alter table public.sessions
  add column if not exists message_count integer
  generated always as (
    case
      when jsonb_typeof(snapshot_json) = 'object'
       and jsonb_typeof(snapshot_json -> 'messages') = 'array'
      then jsonb_array_length(snapshot_json -> 'messages')
      else 0
    end
  ) stored;

alter table public.sessions
  add constraint sessions_schema_version_positive_check
  check (schema_version > 0) not valid;

alter table public.sessions
  add constraint sessions_schema_v1_shape_check
  check (
    schema_version <> 1
    or (
      jsonb_typeof(snapshot_json) = 'object'
      and jsonb_typeof(snapshot_json -> 'messages') = 'array'
      and jsonb_typeof(artifacts_json) = 'array'
      and jsonb_typeof(context_links_json) = 'array'
    )
  ) not valid;

alter table public.sessions
  validate constraint sessions_schema_version_positive_check;

alter table public.sessions
  validate constraint sessions_schema_v1_shape_check;

comment on column public.sessions.schema_version is
  'Version of the JSONB session document shape. Version 1 stores snapshot_json as an object with a messages array and stores artifacts/context links as arrays.';

comment on column public.sessions.message_count is
  'Stored generated count derived from snapshot_json.messages for summary queries.';

create table if not exists public.session_changes (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  owner_id text not null,
  session_version bigint not null,
  schema_version smallint not null,
  change_kind text not null,
  changed_fields text[] not null default '{}'::text[],
  message_count integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint session_changes_session_version_key unique (session_id, session_version),
  constraint session_changes_session_version_positive_check check (session_version > 0),
  constraint session_changes_schema_version_positive_check check (schema_version > 0),
  constraint session_changes_message_count_nonnegative_check check (message_count >= 0),
  constraint session_changes_kind_check check (change_kind in ('baseline', 'created', 'updated'))
);

alter table public.session_changes enable row level security;
revoke all on table public.session_changes from anon, authenticated;
grant select, insert on table public.session_changes to service_role;
grant usage, select on sequence public.session_changes_id_seq to service_role;

create index if not exists session_changes_owner_created_idx
  on public.session_changes(owner_id, created_at desc);

create index if not exists session_changes_session_created_idx
  on public.session_changes(session_id, created_at desc);

create or replace function public.record_session_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_changed_fields text[] := array[]::text[];
  v_change_kind text;
begin
  if tg_op = 'INSERT' then
    v_change_kind := 'created';
    v_changed_fields := array[
      'title',
      'archived',
      'snapshot',
      'artifacts',
      'contextLinks',
      'schemaVersion'
    ];
  else
    if new.version is not distinct from old.version then
      return new;
    end if;

    v_change_kind := 'updated';
    if new.title is distinct from old.title then
      v_changed_fields := array_append(v_changed_fields, 'title');
    end if;
    if new.archived is distinct from old.archived then
      v_changed_fields := array_append(v_changed_fields, 'archived');
    end if;
    if new.snapshot_json is distinct from old.snapshot_json then
      v_changed_fields := array_append(v_changed_fields, 'snapshot');
    end if;
    if new.artifacts_json is distinct from old.artifacts_json then
      v_changed_fields := array_append(v_changed_fields, 'artifacts');
    end if;
    if new.context_links_json is distinct from old.context_links_json then
      v_changed_fields := array_append(v_changed_fields, 'contextLinks');
    end if;
    if new.schema_version is distinct from old.schema_version then
      v_changed_fields := array_append(v_changed_fields, 'schemaVersion');
    end if;
  end if;

  insert into public.session_changes (
    session_id,
    owner_id,
    session_version,
    schema_version,
    change_kind,
    changed_fields,
    message_count,
    created_at
  )
  values (
    new.id,
    new.owner_id,
    new.version,
    new.schema_version,
    v_change_kind,
    v_changed_fields,
    new.message_count,
    new.updated_at
  )
  on conflict (session_id, session_version) do nothing;

  return new;
end;
$$;

revoke all on function public.record_session_change() from public, anon, authenticated;
grant execute on function public.record_session_change() to service_role;

drop trigger if exists sessions_record_change on public.sessions;
create trigger sessions_record_change
after insert or update on public.sessions
for each row execute function public.record_session_change();

insert into public.session_changes (
  session_id,
  owner_id,
  session_version,
  schema_version,
  change_kind,
  changed_fields,
  message_count,
  created_at
)
select
  id,
  owner_id,
  version,
  schema_version,
  'baseline',
  array['title', 'archived', 'snapshot', 'artifacts', 'contextLinks', 'schemaVersion'],
  message_count,
  updated_at
from public.sessions
on conflict (session_id, session_version) do nothing;

create or replace function public.patch_session_with_blob_reconciliation(
  p_session_id uuid,
  p_owner_id text,
  p_expected_version bigint,
  p_patch jsonb,
  p_now timestamptz default timezone('utc', now())
)
returns setof public.sessions
language plpgsql
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

  if not found or v_current.version <> p_expected_version then
    return;
  end if;

  v_artifacts := case
    when p_patch ? 'artifacts' then coalesce(p_patch->'artifacts', '[]'::jsonb)
    else v_current.artifacts_json
  end;

  if jsonb_typeof(v_artifacts) <> 'array' then
    raise exception using errcode = '22023', message = 'artifacts must be a JSON array';
  end if;

  if p_patch ? 'artifacts' then
    select r.blob_ref into v_invalid_ref
    from public.session_blob_refs(v_artifacts) r
    left join public.session_blobs b
      on b.blob_ref = r.blob_ref
    left join public.session_blob_delete_queue q
      on q.blob_ref = r.blob_ref
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
    title = case
      when p_patch ? 'title' then nullif(btrim(p_patch->>'title'), '')
      else s.title
    end,
    archived = case
      when p_patch ? 'archived' then coalesce((p_patch->>'archived')::boolean, false)
      else s.archived
    end,
    snapshot_json = case
      when p_patch ? 'snapshot' then coalesce(p_patch->'snapshot', s.snapshot_json)
      else s.snapshot_json
    end,
    artifacts_json = v_artifacts,
    context_links_json = case
      when p_patch ? 'contextLinks' then coalesce(p_patch->'contextLinks', '[]'::jsonb)
      else s.context_links_json
    end,
    schema_version = case
      when p_patch ? 'schemaVersion'
      then coalesce((p_patch->>'schemaVersion')::smallint, s.schema_version)
      else s.schema_version
    end,
    version = s.version + 1,
    updated_at = p_now
  where s.id = p_session_id
    and s.owner_id = p_owner_id
    and s.version = p_expected_version
  returning s.* into v_updated;

  if not found then
    return;
  end if;

  if p_patch ? 'artifacts' then
    with refs as (
      select * from public.session_blob_refs(v_artifacts)
    )
    update public.session_blobs b
    set
      state = 'active',
      reference_count = refs.reference_count,
      delete_after = null,
      last_error = null,
      updated_at = p_now
    from refs
    where b.blob_ref = refs.blob_ref;

    delete from public.session_blob_delete_queue q
    using public.session_blob_refs(v_artifacts) refs
    where q.blob_ref = refs.blob_ref
      and q.status <> 'processing';

    with refs as (
      select * from public.session_blob_refs(v_artifacts)
    ), stale as (
      update public.session_blobs b
      set
        state = 'deleting',
        reference_count = 0,
        delete_after = p_now,
        updated_at = p_now
      where b.session_id = p_session_id
        and b.owner_id = p_owner_id
        and b.state in ('pending', 'active', 'delete_failed')
        and not exists (select 1 from refs where refs.blob_ref = b.blob_ref)
      returning b.blob_ref
    )
    insert into public.session_blob_delete_queue (
      blob_ref, status, attempts, available_at, locked_at, completed_at, last_error, updated_at
    )
    select blob_ref, 'pending', 0, p_now, null, null, null, p_now
    from stale
    on conflict (blob_ref) do update set
      status = case
        when public.session_blob_delete_queue.status = 'processing' then 'processing'
        else 'pending'
      end,
      attempts = case
        when public.session_blob_delete_queue.status = 'processing' then public.session_blob_delete_queue.attempts
        else 0
      end,
      available_at = case
        when public.session_blob_delete_queue.status = 'processing' then public.session_blob_delete_queue.available_at
        else excluded.available_at
      end,
      locked_at = case
        when public.session_blob_delete_queue.status = 'processing' then public.session_blob_delete_queue.locked_at
        else null
      end,
      completed_at = null,
      last_error = null,
      updated_at = excluded.updated_at;
  end if;

  return next v_updated;
end;
$$;
