alter table public.sessions
  add column if not exists version bigint not null default 1;

alter table public.sessions
  add constraint sessions_version_positive_check check (version > 0) not valid;

alter table public.sessions
  validate constraint sessions_version_positive_check;
