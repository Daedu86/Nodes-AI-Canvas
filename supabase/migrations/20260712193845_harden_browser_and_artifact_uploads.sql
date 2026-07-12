create table if not exists public.artifact_upload_usage_state (
  owner_id text primary key,
  minute_window_start timestamptz not null,
  minute_count integer not null default 0,
  minute_bytes bigint not null default 0,
  hour_window_start timestamptz not null,
  hour_count integer not null default 0,
  hour_bytes bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint artifact_upload_minute_count_nonnegative_check check (minute_count >= 0),
  constraint artifact_upload_minute_bytes_nonnegative_check check (minute_bytes >= 0),
  constraint artifact_upload_hour_count_nonnegative_check check (hour_count >= 0),
  constraint artifact_upload_hour_bytes_nonnegative_check check (hour_bytes >= 0)
);

alter table public.artifact_upload_usage_state enable row level security;
revoke all on table public.artifact_upload_usage_state from anon, authenticated;
grant select, insert, update on table public.artifact_upload_usage_state to service_role;

create or replace function public.reserve_artifact_upload_usage(
  p_owner_id text,
  p_request_bytes bigint,
  p_minute_request_limit integer,
  p_minute_byte_limit bigint,
  p_hour_request_limit integer,
  p_hour_byte_limit bigint,
  p_now timestamptz default timezone('utc', now())
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  minute_count integer,
  minute_bytes bigint,
  hour_count integer,
  hour_bytes bigint
)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_state public.artifact_upload_usage_state%rowtype;
  v_minute_start timestamptz := date_trunc('minute', p_now);
  v_hour_start timestamptz := date_trunc('hour', p_now);
  v_minute_blocked boolean;
  v_hour_blocked boolean;
  v_allowed boolean;
  v_retry_after integer := 0;
begin
  if p_owner_id is null or length(btrim(p_owner_id)) = 0 then
    raise exception using errcode = '22023', message = 'owner id is required';
  end if;
  if p_request_bytes < 1 then
    raise exception using errcode = '22023', message = 'request bytes must be positive';
  end if;
  if p_minute_request_limit < 1 or p_hour_request_limit < 1
     or p_minute_byte_limit < 1 or p_hour_byte_limit < 1 then
    raise exception using errcode = '22023', message = 'upload limits must be positive';
  end if;

  insert into public.artifact_upload_usage_state (
    owner_id,
    minute_window_start,
    minute_count,
    minute_bytes,
    hour_window_start,
    hour_count,
    hour_bytes,
    created_at,
    updated_at
  ) values (
    p_owner_id,
    v_minute_start,
    0,
    0,
    v_hour_start,
    0,
    0,
    p_now,
    p_now
  )
  on conflict (owner_id) do nothing;

  select * into v_state
  from public.artifact_upload_usage_state
  where owner_id = p_owner_id
  for update;

  if v_state.minute_window_start is distinct from v_minute_start then
    v_state.minute_window_start := v_minute_start;
    v_state.minute_count := 0;
    v_state.minute_bytes := 0;
  end if;
  if v_state.hour_window_start is distinct from v_hour_start then
    v_state.hour_window_start := v_hour_start;
    v_state.hour_count := 0;
    v_state.hour_bytes := 0;
  end if;

  v_minute_blocked :=
    v_state.minute_count + 1 > p_minute_request_limit
    or v_state.minute_bytes + p_request_bytes > p_minute_byte_limit;
  v_hour_blocked :=
    v_state.hour_count + 1 > p_hour_request_limit
    or v_state.hour_bytes + p_request_bytes > p_hour_byte_limit;
  v_allowed := not v_minute_blocked and not v_hour_blocked;

  if v_allowed then
    v_state.minute_count := v_state.minute_count + 1;
    v_state.minute_bytes := v_state.minute_bytes + p_request_bytes;
    v_state.hour_count := v_state.hour_count + 1;
    v_state.hour_bytes := v_state.hour_bytes + p_request_bytes;
  else
    v_retry_after := greatest(
      case when v_minute_blocked then
        greatest(1, ceil(extract(epoch from (v_minute_start + interval '1 minute' - p_now)))::integer)
      else 0 end,
      case when v_hour_blocked then
        greatest(1, ceil(extract(epoch from (v_hour_start + interval '1 hour' - p_now)))::integer)
      else 0 end
    );
  end if;

  update public.artifact_upload_usage_state
  set
    minute_window_start = v_state.minute_window_start,
    minute_count = v_state.minute_count,
    minute_bytes = v_state.minute_bytes,
    hour_window_start = v_state.hour_window_start,
    hour_count = v_state.hour_count,
    hour_bytes = v_state.hour_bytes,
    updated_at = p_now
  where owner_id = p_owner_id;

  return query select
    v_allowed,
    v_retry_after,
    v_state.minute_count,
    v_state.minute_bytes,
    v_state.hour_count,
    v_state.hour_bytes;
end;
$$;

revoke all on function public.reserve_artifact_upload_usage(
  text, bigint, integer, bigint, integer, bigint, timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_artifact_upload_usage(
  text, bigint, integer, bigint, integer, bigint, timestamptz
) to service_role;

create or replace function public.register_session_blob_upload(
  p_blob_ref text,
  p_session_id uuid,
  p_owner_id text,
  p_bucket_id text,
  p_content_hash text,
  p_byte_size bigint,
  p_mime_type text,
  p_original_file_name text,
  p_owner_quota_bytes bigint,
  p_max_blob_bytes bigint,
  p_now timestamptz default timezone('utc', now())
)
returns table (
  registered_blob_ref text,
  registered_state text,
  storage_used_bytes bigint
)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_existing public.session_blobs%rowtype;
  v_had_existing boolean := false;
  v_used bigint;
  v_mime_type text := lower(btrim(coalesce(p_mime_type, '')));
  v_file_name text := btrim(coalesce(p_original_file_name, ''));
begin
  if p_owner_id is null or length(btrim(p_owner_id)) = 0 then
    raise exception using errcode = '22023', message = 'owner id is required';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{24}$' then
    raise exception using errcode = '22023', message = 'content hash is invalid';
  end if;
  if p_blob_ref is distinct from (p_session_id::text || '/' || p_content_hash) then
    raise exception using errcode = '22023', message = 'blob reference must match the session and content hash';
  end if;
  if p_byte_size < 1 or p_max_blob_bytes < 1 or p_byte_size > p_max_blob_bytes then
    raise exception using errcode = '22023', message = 'blob size is outside the allowed range';
  end if;
  if p_owner_quota_bytes < 1 then
    raise exception using errcode = '22023', message = 'storage quota must be positive';
  end if;
  if not exists (
    select 1 from storage.buckets
    where id = p_bucket_id and public = false
  ) then
    raise exception using errcode = '22023', message = 'artifact bucket must exist and remain private';
  end if;
  if v_mime_type not in (
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif',
    'application/pdf',
    'application/json',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) then
    raise exception using errcode = '22023', message = 'artifact mime type is not allowed';
  end if;
  if v_file_name = ''
     or char_length(v_file_name) > 180
     or octet_length(v_file_name) > 255
     or left(v_file_name, 1) = '.'
     or v_file_name ~ '[\\/]'
     or v_file_name ~ '[[:cntrl:]]'
     or lower(v_file_name) ~ '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)' then
    raise exception using errcode = '22023', message = 'artifact file name is unsafe';
  end if;
  if not (
    (v_mime_type = 'image/png' and lower(v_file_name) ~ '\.png$')
    or (v_mime_type = 'image/jpeg' and lower(v_file_name) ~ '\.(jpg|jpeg)$')
    or (v_mime_type = 'image/webp' and lower(v_file_name) ~ '\.webp$')
    or (v_mime_type = 'image/gif' and lower(v_file_name) ~ '\.gif$')
    or (v_mime_type = 'image/avif' and lower(v_file_name) ~ '\.avif$')
    or (v_mime_type = 'application/pdf' and lower(v_file_name) ~ '\.pdf$')
    or (v_mime_type = 'application/json' and lower(v_file_name) ~ '\.json$')
    or (v_mime_type = 'text/plain' and lower(v_file_name) ~ '\.txt$')
    or (v_mime_type = 'text/markdown' and lower(v_file_name) ~ '\.md$')
    or (v_mime_type = 'text/csv' and lower(v_file_name) ~ '\.csv$')
    or (v_mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and lower(v_file_name) ~ '\.docx$')
    or (v_mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and lower(v_file_name) ~ '\.xlsx$')
    or (v_mime_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' and lower(v_file_name) ~ '\.pptx$')
  ) then
    raise exception using errcode = '22023', message = 'artifact file extension does not match its mime type';
  end if;
  if not exists (
    select 1 from public.sessions
    where id = p_session_id and owner_id = p_owner_id
  ) then
    raise exception using errcode = 'P0002', message = 'session not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id, 17));

  select * into v_existing
  from public.session_blobs
  where blob_ref = p_blob_ref;
  v_had_existing := found;

  if v_had_existing and (
    v_existing.session_id is distinct from p_session_id
    or v_existing.owner_id is distinct from p_owner_id
  ) then
    raise exception using errcode = '23505', message = 'blob reference belongs to another session';
  end if;

  select coalesce(sum(byte_size), 0)::bigint
  into v_used
  from public.session_blobs
  where owner_id = p_owner_id
    and state in ('pending', 'active')
    and blob_ref <> p_blob_ref;

  if v_used + p_byte_size > p_owner_quota_bytes then
    raise exception using errcode = 'P0001', message = 'storage quota exceeded';
  end if;

  insert into public.session_blobs (
    blob_ref,
    session_id,
    owner_id,
    bucket_id,
    content_hash,
    byte_size,
    mime_type,
    original_file_name,
    state,
    reference_count,
    delete_after,
    last_error,
    created_at,
    updated_at
  ) values (
    p_blob_ref,
    p_session_id,
    p_owner_id,
    p_bucket_id,
    p_content_hash,
    p_byte_size,
    v_mime_type,
    v_file_name,
    case when v_had_existing and v_existing.state = 'active' then 'active' else 'pending' end,
    case when v_had_existing and v_existing.state = 'active' then v_existing.reference_count else 0 end,
    null,
    null,
    p_now,
    p_now
  )
  on conflict (blob_ref) do update set
    bucket_id = excluded.bucket_id,
    content_hash = excluded.content_hash,
    byte_size = excluded.byte_size,
    mime_type = excluded.mime_type,
    original_file_name = excluded.original_file_name,
    state = case when public.session_blobs.state = 'active' then 'active' else 'pending' end,
    reference_count = case when public.session_blobs.state = 'active' then public.session_blobs.reference_count else 0 end,
    delete_after = null,
    last_error = null,
    updated_at = excluded.updated_at;

  delete from public.session_blob_delete_queue where blob_ref = p_blob_ref;

  return query
  select
    b.blob_ref,
    b.state,
    (v_used + b.byte_size)::bigint
  from public.session_blobs b
  where b.blob_ref = p_blob_ref;
end;
$$;

revoke all on function public.register_session_blob_upload(
  text, uuid, text, text, text, bigint, text, text, bigint, bigint, timestamptz
) from public, anon, authenticated;
grant execute on function public.register_session_blob_upload(
  text, uuid, text, text, text, bigint, text, text, bigint, bigint, timestamptz
) to service_role;
