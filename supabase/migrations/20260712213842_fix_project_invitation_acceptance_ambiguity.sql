create or replace function public.accept_project_invitation(
  p_token_hash text,
  p_user_id text,
  p_user_email text,
  p_now timestamptz default timezone('utc', now())
)
returns table(project_id uuid, role text)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_invitation public.project_invitations%rowtype;
  v_email text := lower(btrim(coalesce(p_user_email, '')));
begin
  if p_user_id is null or length(btrim(p_user_id)) = 0 or v_email = '' then
    raise exception using errcode = '22023', message = 'authenticated user id and email are required';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid invitation token hash';
  end if;

  select pi.* into v_invitation
  from public.project_invitations pi
  where pi.token_hash = p_token_hash
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'invitation not found';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'invitation is no longer pending';
  end if;
  if v_invitation.expires_at <= p_now then
    raise exception using errcode = 'P0001', message = 'invitation has expired';
  end if;
  if v_invitation.invitee_email <> v_email then
    raise exception using errcode = '42501', message = 'invitation email does not match authenticated user';
  end if;

  delete from public.project_members pm
  where pm.project_id = v_invitation.project_id
    and pm.user_id = p_user_id
    and pm.user_email <> v_email;

  insert into public.project_members (
    project_id, user_email, role, user_id, accepted_at, invitation_id, created_at
  ) values (
    v_invitation.project_id, v_email, v_invitation.role, p_user_id,
    p_now, v_invitation.id, v_invitation.created_at
  )
  on conflict (project_id, user_email) do update set
    role = excluded.role,
    user_id = excluded.user_id,
    accepted_at = excluded.accepted_at,
    invitation_id = excluded.invitation_id;

  update public.project_invitations pi
  set status = 'accepted', accepted_at = p_now,
      accepted_by_user_id = p_user_id, updated_at = p_now
  where pi.id = v_invitation.id;

  return query select v_invitation.project_id, v_invitation.role;
end;
$$;

revoke all on function public.accept_project_invitation(text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.accept_project_invitation(text,text,text,timestamptz) to service_role;
