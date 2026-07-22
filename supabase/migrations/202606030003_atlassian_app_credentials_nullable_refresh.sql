alter table public.app_atlassian_credentials
  alter column refresh_token drop not null;
