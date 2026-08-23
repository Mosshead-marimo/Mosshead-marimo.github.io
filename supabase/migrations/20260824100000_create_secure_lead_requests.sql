create table public.lead_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed', 'spam')),
  service text not null check (char_length(service) between 2 and 80),
  project_stage text not null check (char_length(project_stage) between 2 and 80),
  project_name text check (project_name is null or char_length(project_name) <= 160),
  problem text not null check (char_length(problem) between 20 and 5000),
  budget text not null check (char_length(budget) between 2 and 80),
  timeline text not null check (char_length(timeline) between 2 and 80),
  needs text[] not null default '{}' check (cardinality(needs) <= 12),
  contact_name text not null check (char_length(contact_name) between 2 and 160),
  contact_email text not null check (char_length(contact_email) <= 320 and contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  company text check (company is null or char_length(company) <= 160),
  relevant_link text check (relevant_link is null or char_length(relevant_link) <= 2048),
  consent boolean not null check (consent is true),
  source text not null default 'portfolio' check (char_length(source) between 2 and 80),
  ip_hash text check (ip_hash is null or char_length(ip_hash) = 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  referrer text check (referrer is null or char_length(referrer) <= 2048)
);

comment on table public.lead_requests is
  'Service requests submitted through Kaushik Aadhithya portfolio. Direct client access is denied; writes go through the submit-lead Edge Function.';
create index lead_requests_created_at_idx on public.lead_requests (created_at desc);
create index lead_requests_ip_hash_created_at_idx on public.lead_requests (ip_hash, created_at desc) where ip_hash is not null;
alter table public.lead_requests enable row level security;
revoke all on table public.lead_requests from anon, authenticated;
grant all on table public.lead_requests to service_role;
create policy lead_requests_deny_public on public.lead_requests
  for all to anon, authenticated using (false) with check (false);
