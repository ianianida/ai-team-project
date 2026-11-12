-- Read-only connectivity check. This function returns no application data.
create function public.team_project_health_check()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select true; $$;

revoke all on function public.team_project_health_check()
  from public, anon, authenticated, service_role;
grant execute on function public.team_project_health_check() to anon;
