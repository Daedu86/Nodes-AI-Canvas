create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_email text not null,
  role text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (project_id, user_email),
  constraint project_member_role_check check (
    role in ('editor', 'viewer')
  )
);

create index if not exists project_members_email_idx
  on public.project_members (user_email);

alter table public.project_members enable row level security;
