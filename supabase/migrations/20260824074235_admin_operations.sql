create schema if not exists private;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_-]{3,40}$'),
  created_at timestamptz not null default now()
);

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 100),
  short_description text not null check (char_length(short_description) between 10 and 500),
  full_description text,
  pricing_type text not null check (pricing_type in ('fixed','starting_at','range','hourly','monthly','custom')),
  price_min bigint check (price_min is null or price_min >= 0),
  price_max bigint check (price_max is null or price_max >= price_min),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  billing_unit text check (billing_unit is null or billing_unit in ('project','hour','day','month')),
  delivery_time text,
  included_items text[] not null default '{}',
  excluded_items text[] not null default '{}',
  cta_label text not null default 'Start a project',
  sort_order integer not null default 0,
  is_featured boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_published_sort_idx on public.services (sort_order, id) where is_published;
create trigger services_updated_at before update on public.services for each row execute function private.set_updated_at();

create table public.site_settings (
  setting_key text primary key check (setting_key ~ '^[a-z0-9_]+$'),
  setting_value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger site_settings_updated_at before update on public.site_settings for each row execute function private.set_updated_at();

alter table public.lead_requests
  add column last_contacted_at timestamptz,
  add column next_follow_up_at timestamptz,
  add column qualification_notes text;
create index lead_requests_status_created_idx on public.lead_requests (status, created_at desc);
create index lead_requests_follow_up_idx on public.lead_requests (next_follow_up_at, id) where next_follow_up_at is not null and status not in ('closed','spam');

create table public.lead_contact_activity (
  id uuid primary key default gen_random_uuid(),
  lead_request_id uuid not null references public.lead_requests(id) on delete cascade,
  contact_method text not null check (contact_method in ('email','call','meeting','linkedin','note')),
  direction text not null check (direction in ('outbound','inbound','internal')),
  subject text,
  notes text not null check (char_length(notes) between 1 and 5000),
  contacted_at timestamptz not null default now(),
  next_follow_up_at timestamptz,
  outcome text,
  created_by uuid not null references public.admin_users(user_id),
  created_at timestamptz not null default now()
);
create index lead_contact_activity_lead_time_idx on public.lead_contact_activity (lead_request_id, contacted_at desc);
create index lead_contact_activity_created_by_idx on public.lead_contact_activity (created_by);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  lead_request_id uuid references public.lead_requests(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  client_name text not null,
  client_email text,
  project_name text not null,
  scope text,
  agreed_price bigint check (agreed_price is null or agreed_price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  start_date date,
  expected_completion_date date,
  actual_completion_date date,
  status text not null default 'planned' check (status in ('planned','active','waiting','at_risk','completed','cancelled')),
  progress smallint not null default 0 check (progress between 0 and 100),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  risk_notes text,
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_status_due_idx on public.projects (status, expected_completion_date, id);
create index projects_lead_request_idx on public.projects (lead_request_id) where lead_request_id is not null;
create index projects_service_idx on public.projects (service_id) where service_id is not null;
create trigger projects_updated_at before update on public.projects for each row execute function private.set_updated_at();

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  expected_date date,
  completed_date date,
  status text not null default 'not_started' check (status in ('not_started','in_progress','blocked','completed')),
  progress smallint not null default 0 check (progress between 0 and 100),
  sort_order integer not null default 0,
  acceptance_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_milestones_project_order_idx on public.project_milestones (project_id, sort_order, id);
create index project_milestones_due_idx on public.project_milestones (expected_date, id) where status <> 'completed';
create trigger project_milestones_updated_at before update on public.project_milestones for each row execute function private.set_updated_at();

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_id uuid references public.project_milestones(id) on delete set null,
  title text not null,
  notes text,
  due_at timestamptz,
  completed_at timestamptz,
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','completed')),
  estimated_hours numeric(8,2) check (estimated_hours is null or estimated_hours >= 0),
  actual_hours numeric(8,2) check (actual_hours is null or actual_hours >= 0),
  next_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_tasks_project_status_due_idx on public.project_tasks (project_id, status, due_at, id);
create index project_tasks_milestone_idx on public.project_tasks (milestone_id) where milestone_id is not null;
create trigger project_tasks_updated_at before update on public.project_tasks for each row execute function private.set_updated_at();

create table public.analytics_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  session_id uuid not null,
  event_type text not null check (event_type in ('page_view','section_view','service_view','cta_click','form_start','form_step','form_submit','outbound_click')),
  page_path text not null default '/',
  section text,
  service_id uuid references public.services(id) on delete set null,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_category text check (device_category is null or device_category in ('desktop','tablet','mobile')),
  ip_hash text check (ip_hash is null or char_length(ip_hash) = 64),
  metadata jsonb not null default '{}'
);
create index analytics_events_time_idx on public.analytics_events (occurred_at desc, id desc);
create index analytics_events_type_time_idx on public.analytics_events (event_type, occurred_at desc);
create index analytics_events_session_time_idx on public.analytics_events (session_id, occurred_at desc);
create index analytics_events_ip_time_idx on public.analytics_events (ip_hash, occurred_at desc) where ip_hash is not null;

create table public.analytics_daily (
  analytics_date date primary key,
  page_views bigint not null default 0,
  unique_sessions bigint not null default 0,
  cta_clicks bigint not null default 0,
  form_starts bigint not null default 0,
  form_submissions bigint not null default 0,
  top_pages jsonb not null default '[]',
  top_services jsonb not null default '[]',
  top_referrers jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references public.admin_users(user_id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_admin_time_idx on public.admin_audit_log (admin_user_id, created_at desc);
create index admin_audit_log_entity_idx on public.admin_audit_log (entity_type, entity_id, created_at desc);

alter table public.admin_users enable row level security;
alter table public.services enable row level security;
alter table public.site_settings enable row level security;
alter table public.lead_contact_activity enable row level security;
alter table public.projects enable row level security;
alter table public.project_milestones enable row level security;
alter table public.project_tasks enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_daily enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.admin_users, public.services, public.site_settings, public.lead_contact_activity,
  public.projects, public.project_milestones, public.project_tasks, public.analytics_events,
  public.analytics_daily, public.admin_audit_log from anon, authenticated;

grant select on public.services, public.site_settings to anon;
grant select on public.services, public.site_settings to authenticated;
grant select on public.admin_users to authenticated;
grant select, insert, update, delete on public.services, public.site_settings, public.lead_contact_activity,
  public.projects, public.project_milestones, public.project_tasks to authenticated;
grant select, update on public.lead_requests to authenticated;
grant select on public.analytics_events, public.analytics_daily to authenticated;
grant select, insert on public.admin_audit_log to authenticated;

create policy services_public_read on public.services for select to anon, authenticated using (is_published or (select private.is_admin()));
create policy services_admin_insert on public.services for insert to authenticated with check ((select private.is_admin()));
create policy services_admin_update on public.services for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy services_admin_delete on public.services for delete to authenticated using ((select private.is_admin()));
create policy settings_public_read on public.site_settings for select to anon, authenticated using (is_public or (select private.is_admin()));
create policy settings_admin_insert on public.site_settings for insert to authenticated with check ((select private.is_admin()));
create policy settings_admin_update on public.site_settings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy settings_admin_delete on public.site_settings for delete to authenticated using ((select private.is_admin()));
create policy admin_users_self_read on public.admin_users for select to authenticated using (user_id = (select auth.uid()));

create policy leads_admin_read on public.lead_requests for select to authenticated using ((select private.is_admin()));
create policy leads_admin_update on public.lead_requests for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy activity_admin_all on public.lead_contact_activity for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy projects_admin_all on public.projects for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy milestones_admin_all on public.project_milestones for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy tasks_admin_all on public.project_tasks for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy analytics_events_admin_read on public.analytics_events for select to authenticated using ((select private.is_admin()));
create policy analytics_daily_admin_read on public.analytics_daily for select to authenticated using ((select private.is_admin()));
create policy audit_admin_read on public.admin_audit_log for select to authenticated using ((select private.is_admin()));
create policy audit_admin_insert on public.admin_audit_log for insert to authenticated with check ((select private.is_admin()) and admin_user_id = (select auth.uid()));

insert into public.services (slug,name,short_description,pricing_type,price_min,price_max,currency,billing_unit,delivery_time,included_items,cta_label,sort_order,is_featured,is_published) values
('rag-document-ai','RAG / Document AI','Searchable knowledge assistants with ingestion, retrieval, grounding and citations.','range',250000,750000,'USD','project','4–8 weeks',array['Discovery and architecture','Document ingestion','Retrieval and citations','Evaluation and deployment'],'Request RAG system',10,true,true),
('agentic-workflow','Agentic Workflow','Tool-using AI workflows with approvals, recovery paths and measurable outcomes.','range',350000,1000000,'USD','project','5–10 weeks',array['Workflow design','Tool integrations','Human checkpoints','Monitoring and handover'],'Automate a workflow',20,true,true),
('ai-ml-system','AI / ML System','Production NLP, classification, anomaly detection and decision-support systems.','range',300000,1200000,'USD','project','6–12 weeks',array['Data assessment','Model or pipeline','API integration','Evaluation and deployment'],'Scope an AI system',30,false,true),
('llm-evaluation-safety','LLM Evaluation / Safety','Evidence-driven evaluation for grounding, quality, safety, latency and cost.','fixed',150000,null,'USD','project','2–4 weeks',array['Evaluation plan','Test dataset','Metrics dashboard','Findings and recommendations'],'Evaluate an LLM',40,false,true),
('ai-backend-api','AI Backend / API','Secure FastAPI inference services, integrations and cloud-ready AI backends.','starting_at',200000,null,'USD','project','3–6 weeks',array['API design','Implementation','Documentation','Deployment handover'],'Build an AI API',50,false,true),
('ai-discovery-audit','AI Discovery / Technical Audit','A focused technical review that turns an AI idea or troubled system into an actionable plan.','fixed',50000,null,'USD','project','3–5 business days',array['Discovery session','Architecture review','Risk and cost assessment','Written roadmap'],'Book an audit',60,false,true),
('ongoing-support','Ongoing AI Support','Monthly maintenance, evaluation, iteration and technical guidance after launch.','range',100000,300000,'USD','month','Monthly',array['Monitoring review','Bug fixes','Evaluation updates','Priority advisory time'],'Discuss support',70,false,true)
on conflict (slug) do nothing;

insert into public.site_settings (setting_key,setting_value,is_public) values
('contact_email','"ckaushikaadhithya@gmail.com"',true),
('availability_message','"Available for select AI builds and technical audits"',true),
('default_currency','"USD"',true),
('analytics_retention_days','90',false)
on conflict (setting_key) do nothing;
