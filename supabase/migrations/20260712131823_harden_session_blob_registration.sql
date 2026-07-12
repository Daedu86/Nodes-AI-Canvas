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
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_existing public.session_blobs%rowtype;
  v_had_existing boolean := false;
  v_used bigint;
begin
  if p_owner_id is null or length(btrim(p_owner_id)) = 0 then
    raise exception using errcode = '22023', message = 'owner id is required';
  end if;
  if p_blob_ref is null or p_blob_ref not like p_session_id::text || '/%' then
    raise exception using errcode = '22023', message = 'blob reference must be scoped to the session';
  end if;
  if p_byte_size < 0 or p_byte_size > p_max_blob_bytes then
    raise exception using errcode = '22023', message = 'blob size is outside the allowed range';
  end if;
  if p_owner_quota_bytes < 1 then
    raise exception using errcode = '22023', message = 'storage quota must be positive';
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
    blob_ref, session_id, owner_id, bucket_id, content_hash,
    byte_size, mime_type, original_file_name, state, reference_count,
    delete_after, last_error, created_at, updated_at
  ) values (
    p_blob_ref, p_session_id, p_owner_id, p_bucket_id, p_content_hash,
    p_byte_size, nullif(btrim(p_mime_type), ''),
    nullif(btrim(p_original_file_name), ''),
    case when v_had_existing and v_existing.state = 'active'
      then 'active' else 'pending' end,
    case when v_had_existing and v_existing.state = 'active'
      then v_existing.reference_count else 0 end,
    null, null, p_now, p_now
  )
  on conflict (blob_ref) do update set
    bucket_id = excluded.bucket_id,
    content_hash = excluded.content_hash,
    byte_size = excluded.byte_size,
    mime_type = excluded.mime_type,
    original_file_name = excluded.original_file_name,
    state = case when public.session_blobs.state = 'active'
      then 'active' else 'pending' end,
    reference_count = case when public.session_blobs.state = 'active'
      then public.session_blobs.reference_count else 0 end,
    delete_after = null,
    last_error = null,
    updated_at = excluded.updated_at;

  delete from public.session_blob_delete_queue where blob_ref = p_blob_ref;

  return query
  select b.blob_ref, b.state, (v_used + b.byte_size)::bigint
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
