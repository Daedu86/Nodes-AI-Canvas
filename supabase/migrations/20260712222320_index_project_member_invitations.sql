create index if not exists project_members_invitation_idx
  on public.project_members(invitation_id)
  where invitation_id is not null;
