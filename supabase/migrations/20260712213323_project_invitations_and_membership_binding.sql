create table if not exists public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  inviter_id text not null,
  invitee_email text not null,
  role text not null,
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id text,
  revoked_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_invitations_role_check check (role in ('editor', 'viewer')),
  constraint project_invitations_status_check check (status in ('pending', 'accepted', 'revoked', 'declined')),
  constraint project_invitations_email_normalized_check check (
    invitee_email = lower(btrim(invitee_email))
    and char_length(invitee_email) between 3 and 254
  ),
  constraint project_invitations_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint project_invitations_expiry_check check (expires_at > created_at),
  constraint project_invitations_terminal_fields_check check (
    (status = 'pending' and accepted_at is null and revoked_at is null and declined_at is null)
    or (status = 'accepted' and accepted_at is not null and accepted_by_user_id is not null and revoked_at is null and declined_at is null)
    or (status = 'revoked' and revoked_at is not null and accepted_at is null and declined_at is null)
    or (status = 'declined' and declined_at is not null and accepted_at is null and revoked_at is null)
  )
);

create unique index if not exists project_invitations_pending_email_key
  on public.project_invitations(project_id, invitee_email)
  where status = 'pending';

create index if not exists project_invitations_project_created_idx
  on public.project_invitations(project_id, created_at desc);

create index if not exists project_invitations_invitee_status_idx
  on public.project_invitations(invitee_email, status, expires_at desc);

alter table public.project_invitations enable row level security;
revoke all on table public.project_invitations from anon, authenticated;
grant select, insert, update, delete on table public.project_invitations to service_role;

alter table public.project_members
  add column if not exists user_id text,
  add column if not exists accepted_at timestamptz,
  add column if not exists invitation_id uuid references public.project_invitations(id) on delete set null;

update public.project_members
set accepted_at = created_at
where accepted_at is null
  and invitation_id is null;

alter table public.project_members
  add constraint project_members_email_normalized_check
  check (
    user_email = lower(btrim(user_email))
    and char_length(user_email) between 3 and 254
  ) not valid;

alter table public.project_members
  add constraint project_members_acceptance_state_check
  check (
    (accepted_at is null and user_id is null and invitation_id is not null)
    or accepted_at is not null
  ) not valid;

alter table public.project_members
  validate constraint project_members_email_normalized_check;

alter table public.project_members
  validate constraint project_members_acceptance_state_check;

create unique index if not exists project_members_project_user_key
  on public.project_members(project_id, user_id)
  where user_id is not null;

create index if not exists project_members_user_id_idx
  on public.project_members(user_id)
  where user_id is not null;

create or replace function public.create_project_invitation(
  p_project_id uuid,
  p_owner_id text,
  p_inviter_id text,
  p_invitee_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_now timestamptz default timezone('utc', now())
)
returns setof public.project_invitations
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_email text := lower(btrim(coalesce(p_invitee_email, '')));
  v_invitation public.project_invitations%rowtype;
begin
  if p_owner_id is null or length(btrim(p_owner_id)) = 0
     or p_inviter_id is null or length(btrim(p_inviter_id)) = 0 then
    raise exception using errcode = '22023', message = 'owner and inviter ids are required';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception using errcode = '22023', message = 'invalid invitation role';
  end if;
  if v_email = '' or char_length(v_email) > 254 or position('@' in v_email) < 2 then
    raise exception using errcode = '22023', message = 'invalid invitation email';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid invitation token hash';
  end if;
  if p_expires_at <= p_now or p_expires_at > p_now + interval '30 days' then
    raise exception using errcode = '22023', message = 'invalid invitation expiry';
  end if;

  perform 1
  from public.projects
  where id = p_project_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'project not found';
  end if;

  if exists (
    select 1
    from public.project_members
    where project_id = p_project_id
      and user_email = v_email
      and accepted_at is not null
  ) then
    raise exception using errcode = '23505', message = 'user is already a project member';
  end if;

  update public.project_invitations
  set status = 'revoked', revoked_at = p_now, updated_at = p_now
  where project_id = p_project_id
    and invitee_email = v_email
    and status = 'pending';

  insert into public.project_invitations (
    project_id,
    inviter_id,
    invitee_email,
    role,
    token_hash,
    status,
    expires_at,
    created_at,
    updated_at
  ) values (
    p_project_id,
    p_inviter_id,
    v_email,
    p_role,
    p_token_hash,
    'pending',
    p_expires_at,
    p_now,
    p_now
  )
  returning * into v_invitation;

  insert into public.project_members (
    project_id,
    user_email,
    role,
    user_id,
    accepted_at,
    invitation_id,
    created_at
  ) values (
    p_project_id,
    v_email,
    p_role,
    null,
    null,
    v_invitation.id,
    p_now
  )
  on conflict (project_id, user_email) do update set
    role = excluded.role,
    user_id = null,
    accepted_at = null,
    invitation_id = excluded.invitation_id,
    created_at = excluded.created_at;

  return next v_invitation;
end;
$$;

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

  select * into v_invitation
  from public.project_invitations
  where token_hash = p_token_hash
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

  delete from public.project_members
  where project_id = v_invitation.project_id
    and user_id = p_user_id
    and user_email <> v_email;

  insert into public.project_members (
    project_id,
    user_email,
    role,
    user_id,
    accepted_at,
    invitation_id,
    created_at
  ) values (
    v_invitation.project_id,
    v_email,
    v_invitation.role,
    p_user_id,
    p_now,
    v_invitation.id,
    v_invitation.created_at
  )
  on conflict (project_id, user_email) do update set
    role = excluded.role,
    user_id = excluded.user_id,
    accepted_at = excluded.accepted_at,
    invitation_id = excluded.invitation_id;

  update public.project_invitations
  set
    status = 'accepted',
    accepted_at = p_now,
    accepted_by_user_id = p_user_id,
    updated_at = p_now
  where id = v_invitation.id;

  return query select v_invitation.project_id, v_invitation.role;
end;
$$;

create or replace function public.revoke_project_invitation(
  p_project_id uuid,
  p_invitation_id uuid,
  p_owner_id text,
  p_now timestamptz default timezone('utc', now())
)
returns boolean
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id and owner_id = p_owner_id
  ) then
    return false;
  end if;

  update public.project_invitations
  set status = 'revoked', revoked_at = p_now, updated_at = p_now
  where id = p_invitation_id
    and project_id = p_project_id
    and status = 'pending';
  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    delete from public.project_members
    where project_id = p_project_id
      and invitation_id = p_invitation_id
      and accepted_at is null;
  end if;

  return v_updated > 0;
end;
$$;

create or replace function public.decline_project_invitation(
  p_token_hash text,
  p_user_id text,
  p_user_email text,
  p_now timestamptz default timezone('utc', now())
)
returns boolean
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_invitation public.project_invitations%rowtype;
  v_email text := lower(btrim(coalesce(p_user_email, '')));
begin
  select * into v_invitation
  from public.project_invitations
  where token_hash = p_token_hash
  for update;

  if not found or v_invitation.status <> 'pending' then
    return false;
  end if;
  if p_user_id is null or length(btrim(p_user_id)) = 0
     or v_email = '' or v_invitation.invitee_email <> v_email then
    raise exception using errcode = '42501', message = 'invitation email does not match authenticated user';
  end if;

  update public.project_invitations
  set status = 'declined', declined_at = p_now, updated_at = p_now
  where id = v_invitation.id;

  delete from public.project_members
  where project_id = v_invitation.project_id
    and invitation_id = v_invitation.id
    and accepted_at is null;

  return true;
end;
$$;

revoke all on function public.create_project_invitation(uuid,text,text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.accept_project_invitation(text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_project_invitation(uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.decline_project_invitation(text,text,text,timestamptz) from public, anon, authenticated;

grant execute on function public.create_project_invitation(uuid,text,text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.accept_project_invitation(text,text,text,timestamptz) to service_role;
grant execute on function public.revoke_project_invitation(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.decline_project_invitation(text,text,text,timestamptz) to service_role;
