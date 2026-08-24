drop policy services_public_read on public.services;
drop policy settings_public_read on public.site_settings;

create policy services_anon_read on public.services for select to anon using (is_published);
create policy services_authenticated_read on public.services for select to authenticated using (is_published or (select private.is_admin()));
create policy settings_anon_read on public.site_settings for select to anon using (is_public);
create policy settings_authenticated_read on public.site_settings for select to authenticated using (is_public or (select private.is_admin()));

grant all on public.admin_users, public.services, public.site_settings, public.lead_contact_activity,
  public.projects, public.project_milestones, public.project_tasks, public.analytics_events,
  public.analytics_daily, public.admin_audit_log to service_role;
grant usage, select on all sequences in schema public to service_role;
