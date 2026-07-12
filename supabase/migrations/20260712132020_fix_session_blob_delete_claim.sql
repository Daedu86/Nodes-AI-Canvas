create or replace function public.claim_session_blob_deletions(
  p_bucket_id text,
  p_limit integer default 100,
  p_scan_storage boolean default false,
  p_pending_grace_seconds integer default 3600,
  p_processing_timeout_seconds integer default 600,
  p_now timestamptz default timezone('utc', now())
)
returns table (
  blob_ref text,
  bucket_id text,
  byte_size bigint,
  attempt integer
)
language plpgsql
security invoker
set search_path = pg_catalog, public, storage
as $$
begin
  if p_scan_storage then
    insert into public.session_blobs (
      blob_ref, session_id, owner_id, bucket_id, content_hash,
      byte_size, mime_type, original_file_name, state,
      reference_count, delete_after, created_at, updated_at
    )
    select
      o.name,
      s.id,
      s.owner_id,
      o.bucket_id,
      split_part(o.name, '/', 2),
      case when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
        then (o.metadata->>'size')::bigint else 0::bigint end,
      coalesce(o.metadata->>'mimetype', o.metadata->>'contentType'),
      null,
      'deleting',
      0,
      p_now,
      o.created_at,
      p_now
    from storage.objects o
    left join public.sessions s
      on s.id::text = split_part(o.name, '/', 1)
    where o.bucket_id = p_bucket_id
      and o.created_at <= p_now
        - make_interval(secs => greatest(60, p_pending_grace_seconds))
      and not exists (
        select 1
        from public.sessions referenced_session
        cross join lateral public.session_blob_refs(
          referenced_session.artifacts_json
        ) refs
        where refs.blob_ref = o.name
      )
    on conflict on constraint session_blobs_pkey do nothing;
  end if;

  update public.session_blob_delete_queue
  set status = 'failed',
      available_at = p_now,
      locked_at = null,
      last_error = 'processing lease expired',
      updated_at = p_now
  where status = 'processing'
    and locked_at <= p_now
      - make_interval(secs => greatest(60, p_processing_timeout_seconds));

  update public.session_blobs b
  set state = 'deleting',
      reference_count = 0,
      delete_after = p_now,
      updated_at = p_now
  where b.bucket_id = p_bucket_id
    and (
      (
        b.state = 'pending'
        and b.created_at <= p_now
          - make_interval(secs => greatest(60, p_pending_grace_seconds))
      )
      or b.state = 'active'
      or (
        b.state = 'delete_failed'
        and coalesce(b.delete_after, p_now) <= p_now
      )
    )
    and not exists (
      select 1
      from public.sessions referenced_session
      cross join lateral public.session_blob_refs(
        referenced_session.artifacts_json
      ) refs
      where refs.blob_ref = b.blob_ref
    );

  insert into public.session_blob_delete_queue (
    blob_ref, status, attempts, available_at, locked_at,
    completed_at, last_error, updated_at
  )
  select b.blob_ref, 'pending', 0, p_now, null, null, null, p_now
  from public.session_blobs b
  where b.bucket_id = p_bucket_id and b.state = 'deleting'
  on conflict on constraint session_blob_delete_queue_blob_ref_key do update set
    status = case
      when public.session_blob_delete_queue.status = 'processing'
        then 'processing'
      else 'pending'
    end,
    available_at = case
      when public.session_blob_delete_queue.status = 'processing'
        then public.session_blob_delete_queue.available_at
      else least(
        public.session_blob_delete_queue.available_at,
        excluded.available_at
      )
    end,
    completed_at = null,
    updated_at = excluded.updated_at;

  return query
  with candidates as (
    select q.id
    from public.session_blob_delete_queue q
    join public.session_blobs b on b.blob_ref = q.blob_ref
    where b.bucket_id = p_bucket_id
      and q.status in ('pending', 'failed')
      and q.available_at <= p_now
    order by q.available_at, q.id
    for update of q skip locked
    limit greatest(1, least(p_limit, 1000))
  ),
  claimed as (
    update public.session_blob_delete_queue q
    set status = 'processing',
        attempts = q.attempts + 1,
        locked_at = p_now,
        last_error = null,
        updated_at = p_now
    from candidates c
    where q.id = c.id
    returning q.blob_ref, q.attempts
  )
  select b.blob_ref, b.bucket_id, b.byte_size, c.attempts
  from claimed c
  join public.session_blobs b on b.blob_ref = c.blob_ref;
end;
$$;

revoke all on function public.claim_session_blob_deletions(
  text, integer, boolean, integer, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_session_blob_deletions(
  text, integer, boolean, integer, integer, timestamptz
) to service_role;
