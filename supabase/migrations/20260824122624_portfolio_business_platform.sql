create extension if not exists vector with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_cron;

alter table public.lead_requests
  add column if not exists owner_id uuid references public.admin_users(user_id),
  add column if not exists pipeline_stage text not null default 'inbox'
    check (pipeline_stage in ('inbox','qualified','discovery','proposal','negotiation','won','lost','archived')),
  add column if not exists estimated_value bigint check (estimated_value is null or estimated_value >= 0),
  add column if not exists value_currency text not null default 'USD' check (value_currency ~ '^[A-Z]{3}$'),
  add column if not exists lost_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists referral_source text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

create index if not exists lead_requests_pipeline_followup_idx
  on public.lead_requests (pipeline_stage, next_follow_up_at, created_at desc);
create index if not exists lead_requests_owner_idx
  on public.lead_requests (owner_id, pipeline_stage) where owner_id is not null;

alter table public.services
  add column if not exists variable_pricing jsonb not null default '{}',
  add column if not exists revision_allowance smallint not null default 1 check (revision_allowance between 0 and 20),
  add column if not exists contingency_percent numeric(5,2) not null default 10 check (contingency_percent between 0 and 100),
  add column if not exists minimum_engagement bigint check (minimum_engagement is null or minimum_engagement >= 0);

alter table public.projects
  add column if not exists budget bigint check (budget is null or budget >= 0),
  add column if not exists direct_cost bigint not null default 0 check (direct_cost >= 0),
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','changes_requested','not_required')),
  add column if not exists dependencies text[] not null default '{}',
  add column if not exists deliverables jsonb not null default '[]',
  add column if not exists change_log jsonb not null default '[]';

create table public.pricing_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_currency text not null default 'USD' check (base_currency ~ '^[A-Z]{3}$'),
  target_annual_income bigint not null default 0 check (target_annual_income >= 0),
  annual_overhead bigint not null default 0 check (annual_overhead >= 0),
  annual_billable_hours integer not null default 1000 check (annual_billable_hours between 1 and 8760),
  tax_reserve_percent numeric(5,2) not null default 25 check (tax_reserve_percent between 0 and 100),
  target_margin_percent numeric(5,2) not null default 35 check (target_margin_percent between 0 and 100),
  usd_inr_rate numeric(12,4) not null default 83.5 check (usd_inr_rate > 0),
  fiscal_year_start_month smallint not null default 4 check (fiscal_year_start_month between 1 and 12),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pricing_profiles_one_default_idx on public.pricing_profiles (is_default) where is_default;

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  lead_request_id uuid references public.lead_requests(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  pricing_profile_id uuid references public.pricing_profiles(id) on delete set null,
  estimate_number text not null unique,
  title text not null,
  client_name text,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal bigint not null default 0 check (subtotal >= 0),
  contingency bigint not null default 0 check (contingency >= 0),
  pass_through_cost bigint not null default 0 check (pass_through_cost >= 0),
  tax_amount bigint not null default 0 check (tax_amount >= 0),
  total bigint not null default 0 check (total >= 0),
  margin_percent numeric(6,2),
  below_floor boolean not null default false,
  assumptions text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','approved','converted','expired','archived')),
  valid_until date,
  created_by uuid not null references public.admin_users(user_id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index estimates_status_created_idx on public.estimates (status, created_at desc);
create index estimates_lead_idx on public.estimates (lead_request_id) where lead_request_id is not null;

create table public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  pricing_mode text not null check (pricing_mode in ('fixed','hourly','retainer','variable','pass_through')),
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  unit_amount bigint not null default 0 check (unit_amount >= 0),
  cost_amount bigint not null default 0 check (cost_amount >= 0),
  total_amount bigint not null default 0 check (total_amount >= 0),
  sort_order integer not null default 0
);
create index estimate_items_estimate_order_idx on public.estimate_items (estimate_id, sort_order, id);

create table public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null default 1 check (version > 0),
  sections jsonb not null default '[]',
  default_terms jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version)
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid references public.estimates(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  template_id uuid references public.proposal_templates(id) on delete set null,
  proposal_number text not null,
  version integer not null default 1 check (version > 0),
  title text not null,
  client_name text not null,
  content jsonb not null default '{}',
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total bigint not null default 0 check (total >= 0),
  status text not null default 'draft' check (status in ('draft','sent','viewed','accepted','declined','expired','archived')),
  storage_path text,
  idempotency_key text unique,
  created_by uuid not null references public.admin_users(user_id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_number, version)
);
create index proposals_status_created_idx on public.proposals (status, created_at desc);

create table public.lead_source_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null default 'company_site' check (source_type in ('company_site','careers_page','sitemap','manual')),
  start_urls text[] not null default '{}',
  allowed_domains text[] not null default '{}',
  service_keywords text[] not null default '{}',
  exclusion_keywords text[] not null default '{}',
  respect_robots boolean not null default true check (respect_robots),
  requests_per_minute smallint not null default 6 check (requests_per_minute between 1 and 30),
  is_enabled boolean not null default false,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lead_source_runs (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references public.lead_source_configs(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  pages_scanned integer not null default 0,
  records_found integer not null default 0,
  error_summary text,
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index lead_source_runs_config_time_idx on public.lead_source_runs (config_id, created_at desc);

create table public.discovered_leads (
  id uuid primary key default gen_random_uuid(),
  source_run_id uuid references public.lead_source_runs(id) on delete set null,
  lead_request_id uuid references public.lead_requests(id) on delete set null,
  company_name text not null,
  normalized_domain text not null,
  source_url text not null,
  evidence text not null,
  matched_service text,
  score smallint not null default 0 check (score between 0 and 100),
  score_reasons jsonb not null default '[]',
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected','deferred','archived','duplicate')),
  reviewed_by uuid references public.admin_users(user_id),
  reviewed_at timestamptz,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_domain, source_url)
);
create index discovered_leads_review_score_idx on public.discovered_leads (review_status, score desc, discovered_at desc);
create index discovered_leads_domain_idx on public.discovered_leads (normalized_domain);

create table public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft','enabled','paused','completed','archived')),
  daily_draft_limit smallint not null default 20 check (daily_draft_limit between 1 and 100),
  sequence jsonb not null default '[]',
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outreach_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  lead_request_id uuid references public.lead_requests(id) on delete set null,
  discovered_lead_id uuid references public.discovered_leads(id) on delete set null,
  email text,
  normalized_domain text,
  legal_basis text,
  status text not null default 'pending' check (status in ('pending','eligible','drafted','sent','replied','opted_out','disqualified','completed','paused')),
  current_step smallint not null default 0 check (current_step between 0 and 4),
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, email)
);
create index outreach_recipients_due_idx on public.outreach_recipients (status, next_action_at) where next_action_at is not null;

create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.outreach_recipients(id) on delete cascade,
  sequence_step smallint not null check (sequence_step between 1 and 4),
  subject text not null,
  body_text text not null,
  grounding jsonb not null default '{}',
  model_id text,
  status text not null default 'generated' check (status in ('generated','approved','gmail_draft','sent','cancelled','failed')),
  gmail_draft_id text,
  approved_by uuid references public.admin_users(user_id),
  approved_at timestamptz,
  sent_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  unique (recipient_id, sequence_step)
);
create index outreach_messages_status_time_idx on public.outreach_messages (status, created_at desc);

create table public.outreach_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text,
  normalized_domain text,
  reason text not null,
  source text not null default 'admin',
  created_at timestamptz not null default now(),
  check (email is not null or normalized_domain is not null)
);
create unique index outreach_suppressions_email_idx on public.outreach_suppressions (lower(email)) where email is not null;
create unique index outreach_suppressions_domain_idx on public.outreach_suppressions (normalized_domain) where normalized_domain is not null;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null,
  invoice_number text not null unique,
  client_name text not null,
  client_email text,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal bigint not null default 0 check (subtotal >= 0),
  tax_amount bigint not null default 0 check (tax_amount >= 0),
  total bigint not null default 0 check (total >= 0),
  amount_paid bigint not null default 0 check (amount_paid >= 0 and amount_paid <= total),
  issued_on date not null default current_date,
  due_on date,
  paid_on date,
  status text not null default 'draft' check (status in ('draft','issued','partial','paid','overdue','void')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_status_due_idx on public.invoices (status, due_on, created_at desc);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  unit_amount bigint not null default 0 check (unit_amount >= 0),
  total_amount bigint not null default 0 check (total_amount >= 0),
  sort_order integer not null default 0
);
create index invoice_items_invoice_order_idx on public.invoice_items (invoice_id, sort_order, id);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  transaction_date date not null,
  transaction_type text not null check (transaction_type in ('income','expense','transfer','tax_reserve')),
  category text not null,
  description text not null,
  amount bigint not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reporting_amount bigint not null check (reporting_amount >= 0),
  reporting_currency text not null default 'USD' check (reporting_currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(16,6) not null default 1 check (exchange_rate > 0),
  is_business boolean not null default true,
  is_pass_through boolean not null default false,
  receipt_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index financial_transactions_date_type_idx on public.financial_transactions (transaction_date desc, transaction_type);
create index financial_transactions_project_idx on public.financial_transactions (project_id) where project_id is not null;

create table public.referral_requests (
  id uuid primary key default gen_random_uuid(),
  lead_request_id uuid references public.lead_requests(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  referrer_name text not null,
  referrer_email text,
  referred_name text,
  referred_contact text,
  status text not null default 'planned' check (status in ('planned','requested','introduced','qualified','won','lost','thanked','archived')),
  reward_description text,
  reward_status text not null default 'not_assigned' check (reward_status in ('not_assigned','promised','paid','waived')),
  requested_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index referral_requests_status_followup_idx on public.referral_requests (status, next_follow_up_at);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  pillar text not null check (pillar in ('ai_systems','rag_evaluation','production_engineering')),
  content_type text not null default 'short_post' check (content_type in ('short_post','case_study','tutorial','release_note')),
  source_notes text,
  linkedin_content text,
  github_content text,
  status text not null default 'idea' check (status in ('idea','draft','review','approved','scheduled','published','archived')),
  scheduled_at timestamptz,
  published_at timestamptz,
  linkedin_url text,
  github_url text,
  utm_campaign text,
  publishing_attempts jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_items_status_schedule_idx on public.content_items (status, scheduled_at, created_at desc);

create table public.sop_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  version integer not null default 1 check (version > 0),
  purpose text not null,
  owner_label text not null default 'Kaushik',
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  review_due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug, version)
);

create table public.sop_steps (
  id uuid primary key default gen_random_uuid(),
  sop_document_id uuid not null references public.sop_documents(id) on delete cascade,
  stage text not null,
  title text not null,
  instructions text not null,
  entry_criteria text,
  completion_rule text not null,
  linked_resource text,
  sort_order integer not null default 0
);
create index sop_steps_document_order_idx on public.sop_steps (sop_document_id, sort_order, id);

create table public.sop_runs (
  id uuid primary key default gen_random_uuid(),
  sop_document_id uuid not null references public.sop_documents(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  run_name text not null,
  checklist jsonb not null default '[]',
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text
);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  document_type text not null check (document_type in ('resume','service','project','process','faq','case_study')),
  content text not null,
  source_url text,
  is_published boolean not null default false,
  checksum text,
  embedding_status text not null default 'pending' check (embedding_status in ('pending','processing','ready','failed')),
  embedding_model text,
  last_embedded_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_documents_publish_status_idx on public.knowledge_documents (is_published, embedding_status);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  heading text,
  content text not null,
  token_count integer check (token_count is null or token_count >= 0),
  embedding extensions.halfvec(3072),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
create index knowledge_chunks_document_idx on public.knowledge_chunks (document_id, chunk_index);
create index knowledge_chunks_embedding_hnsw_idx on public.knowledge_chunks using hnsw (embedding halfvec_cosine_ops) where embedding is not null;

create table public.rag_query_metrics (
  id bigint generated always as identity primary key,
  session_id uuid,
  query_hash text not null,
  answer_supported boolean not null,
  cited_chunk_ids uuid[] not null default '{}',
  model_id text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms integer not null default 0,
  estimated_cost_micros bigint not null default 0,
  feedback text check (feedback is null or feedback in ('helpful','not_helpful')),
  created_at timestamptz not null default now()
);
create index rag_query_metrics_created_idx on public.rag_query_metrics (created_at desc);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('gmail','github','linkedin','gemini','vercel','railway')),
  status text not null default 'not_connected' check (status in ('not_connected','pending','connected','error','disabled')),
  account_label text,
  scopes text[] not null default '{}',
  encrypted_secret jsonb,
  last_checked_at timestamptz,
  error_message text,
  updated_at timestamptz not null default now()
);

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('lead_scan','knowledge_embed','outreach_draft','analytics_rollup','reminder','content_prepare')),
  entity_id uuid,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','leased','completed','failed','dead_letter','cancelled')),
  due_at timestamptz not null default now(),
  lease_token uuid,
  leased_until timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 10),
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_runs_due_idx on public.job_runs (due_at, created_at) where status in ('queued','failed');
create index job_runs_lease_idx on public.job_runs (leased_until) where status = 'leased';

create or replace function public.claim_portfolio_jobs(worker_token uuid, batch_size integer default 10)
returns setof public.job_runs
language plpgsql security definer set search_path = '' as $$
begin
  if current_user <> 'service_role' then raise exception 'service role required'; end if;
  return query
  with candidates as (
    select id from public.job_runs
    where (status in ('queued','failed') and due_at <= now() and attempts < 10)
       or (status = 'leased' and leased_until < now())
    order by due_at, created_at
    for update skip locked
    limit least(greatest(batch_size,1),25)
  )
  update public.job_runs j set status='leased', lease_token=worker_token,
    leased_until=now()+interval '10 minutes', attempts=j.attempts+1, updated_at=now()
  from candidates c where j.id=c.id returning j.*;
end;
$$;
revoke all on function public.claim_portfolio_jobs(uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_portfolio_jobs(uuid,integer) to service_role;

create or replace function public.match_knowledge(
  query_embedding extensions.halfvec(3072),
  match_count integer default 6,
  match_threshold double precision default 0.45
)
returns table (chunk_id uuid, document_id uuid, title text, heading text, content text, source_url text, similarity double precision)
language sql stable security definer set search_path = '' as $$
  select kc.id, kd.id, kd.title, kc.heading, kc.content, kd.source_url,
    1 - (kc.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.knowledge_chunks kc
  join public.knowledge_documents kd on kd.id = kc.document_id
  where kd.is_published and kd.embedding_status = 'ready' and kc.embedding is not null
    and 1 - (kc.embedding operator(extensions.<=>) query_embedding) >= match_threshold
  order by kc.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 12);
$$;
revoke all on function public.match_knowledge(extensions.halfvec, integer, double precision) from public, anon, authenticated;
grant execute on function public.match_knowledge(extensions.halfvec, integer, double precision) to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'pricing_profiles','estimates','estimate_items','proposal_templates','proposals',
    'lead_source_configs','lead_source_runs','discovered_leads','outreach_campaigns',
    'outreach_recipients','outreach_messages','outreach_suppressions','invoices','invoice_items',
    'financial_transactions','referral_requests','content_items','sop_documents','sop_steps','sop_runs',
    'knowledge_documents','knowledge_chunks','rag_query_metrics','integration_connections','job_runs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('create policy %I on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', table_name || '_admin_all', table_name);
  end loop;
end $$;
grant usage, select on all sequences in schema public to authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'pricing_profiles','estimates','proposal_templates','proposals','lead_source_configs','discovered_leads',
    'outreach_campaigns','outreach_recipients','invoices','financial_transactions','referral_requests',
    'content_items','sop_documents','knowledge_documents','integration_connections','job_runs'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', table_name || '_updated_at', table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-private','portfolio-private',false,10485760,array['application/pdf','image/png','image/jpeg','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy portfolio_private_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'portfolio-private' and (select private.is_admin()));
create policy portfolio_private_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portfolio-private' and (select private.is_admin()));
create policy portfolio_private_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'portfolio-private' and (select private.is_admin()))
  with check (bucket_id = 'portfolio-private' and (select private.is_admin()));
create policy portfolio_private_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio-private' and (select private.is_admin()));

insert into public.site_settings (setting_key, setting_value, is_public) values
  ('api_base_url','""',true),
  ('feature_rag_chat','false',true),
  ('feature_lead_scanner','false',false),
  ('feature_gmail_drafts','false',false),
  ('feature_content_publish','false',false),
  ('reporting_currency','"USD"',false),
  ('usd_inr_rate','83.5',false),
  ('tax_reserve_percent','25',false),
  ('fiscal_year_start_month','4',false)
on conflict (setting_key) do nothing;

insert into public.pricing_profiles (name, base_currency, target_annual_income, annual_overhead, annual_billable_hours, tax_reserve_percent, target_margin_percent, usd_inr_rate, is_default)
values ('Freelance default','USD',6000000,1200000,1000,25,35,83.5,true)
on conflict do nothing;

insert into public.proposal_templates (name, version, sections, default_terms)
values ('AI Services Proposal',1,
  '[{"key":"summary","title":"Executive summary"},{"key":"outcomes","title":"Outcomes"},{"key":"scope","title":"Scope and deliverables"},{"key":"timeline","title":"Timeline and milestones"},{"key":"investment","title":"Investment"},{"key":"assumptions","title":"Assumptions and exclusions"},{"key":"acceptance","title":"Acceptance criteria"},{"key":"next_steps","title":"Next steps"}]'::jsonb,
  '{"payment":"Defined per proposal","revisions":"Limited to the included revision allowance","ownership":"Transferred after full payment, excluding reusable tools and third-party materials","cancellation":"Fees apply to completed work and committed costs"}'::jsonb)
on conflict (name, version) do nothing;

with ideas(title,pillar,content_type) as (values
  ('Why production RAG fails after the demo','rag_evaluation','short_post'),('A practical RAG evaluation scorecard','rag_evaluation','tutorial'),('Chunking is a product decision, not a magic number','rag_evaluation','short_post'),('How to keep live prices out of embeddings','rag_evaluation','case_study'),('Five retrieval failures worth testing','rag_evaluation','short_post'),('When semantic search needs metadata filters','rag_evaluation','tutorial'),('Designing citations users can verify','rag_evaluation','short_post'),('RAG latency: where the milliseconds go','rag_evaluation','short_post'),('A safe fallback for unsupported AI questions','rag_evaluation','short_post'),('Building a reusable RAG test set','rag_evaluation','tutorial'),
  ('From AI idea to smallest useful workflow','ai_systems','short_post'),('Human approval points in agentic systems','ai_systems','short_post'),('What an AI architecture audit should deliver','ai_systems','short_post'),('Separating model confidence from business risk','ai_systems','tutorial'),('Why tool permissions matter more than prompts','ai_systems','short_post'),('A decision log for AI product teams','ai_systems','short_post'),('Turning a manual operation into an AI-assisted workflow','ai_systems','case_study'),('When not to use an agent','ai_systems','short_post'),('Designing recoverable AI workflows','ai_systems','tutorial'),('The evidence-over-theater AI checklist','ai_systems','short_post'),
  ('Async APIs for slow model workloads','production_engineering','tutorial'),('Idempotency for AI jobs and webhooks','production_engineering','short_post'),('What belongs in an AI service health dashboard','production_engineering','short_post'),('Keeping service keys out of browser code','production_engineering','short_post'),('Cost budgets for public AI demos','production_engineering','tutorial'),('How queues make AI systems recoverable','production_engineering','short_post'),('An additive migration strategy for live products','production_engineering','case_study'),('Testing a portfolio contact flow end to end','production_engineering','short_post'),('Why analytics should avoid unnecessary identity','production_engineering','short_post'),('Shipping one system across GitHub Pages, Vercel, Railway, and Supabase','production_engineering','case_study')
)
insert into public.content_items (title,pillar,content_type,status,utm_campaign)
select title,pillar,content_type,'idea',lower(regexp_replace(title,'[^a-zA-Z0-9]+','-','g')) from ideas
where not exists (select 1 from public.content_items c where c.title = ideas.title);

with inserted as (
  insert into public.sop_documents (title,slug,version,purpose,status,review_due_on)
  values ('Freelance Client Lifecycle','freelance-client-lifecycle',1,'Run every client engagement consistently from qualification through access removal.','approved',current_date + 90)
  on conflict (slug,version) do update set title=excluded.title
  returning id
), doc as (select id from inserted union all select id from public.sop_documents where slug='freelance-client-lifecycle' and version=1 limit 1),
steps(stage,title,instructions,entry_criteria,completion_rule,sort_order) as (values
  ('Qualification','Qualify the inquiry','Confirm fit, authority, urgency, budget range, data readiness and disqualifiers.','A lead has submitted or been approved.','Fit decision and next action are recorded.',10),
  ('Discovery','Run discovery','Document the user, decision, current workflow, data, constraints, risks and success measure.','Lead is qualified.','Discovery notes and agreed outcomes exist.',20),
  ('Proposal','Prepare estimate and proposal','Use the pricing calculator, define deliverables, acceptance, exclusions, timeline and payment triggers.','Discovery is complete.','Versioned proposal is ready for review.',30),
  ('Agreement','Confirm contract and deposit checkpoint','Record acceptance and confirm any required agreement and deposit externally.','Proposal is accepted in principle.','Approval and start authorization are recorded.',40),
  ('Kickoff','Run kickoff','Confirm people, access, communication cadence, milestones, dependencies and risks.','Start authorization exists.','Project board and first milestone are active.',50),
  ('Delivery','Deliver in milestones','Implement against acceptance criteria and keep decisions, risks and next actions current.','Kickoff is complete.','All scoped deliverables reach review.',60),
  ('Review','Collect review and approvals','Present evidence, record feedback and distinguish defects from scope changes.','A deliverable is reviewable.','Approval or a bounded change request is recorded.',70),
  ('Change control','Price scope changes','Document impact on scope, cost and timeline before additional work starts.','Requested work exceeds agreed scope.','Change is approved, declined or deferred.',80),
  ('Quality assurance','Run QA','Verify functionality, accessibility, security, data handling, performance and recovery paths.','Delivery candidate exists.','QA evidence has no unresolved release blocker.',90),
  ('Launch','Release and verify','Back up, release, smoke test, observe and keep a rollback path.','QA passes.','Production verification succeeds.',100),
  ('Invoice','Issue and reconcile invoice','Create the invoice, record payment status and follow up on overdue amounts.','A payment trigger is reached.','Payment state reconciles with cash records.',110),
  ('Offboarding','Complete handoff','Transfer approved assets, documentation and operational knowledge.','Final delivery is approved.','Handoff checklist is complete.',120),
  ('Social proof','Request testimonial and referral','Ask after demonstrated value and make the introduction easy.','A positive outcome is confirmed.','Requests and outcomes are tracked.',130),
  ('Access removal','Remove sensitive access','Remove temporary credentials, revoke unnecessary access and archive records safely.','Handoff is complete.','Access-removal evidence is recorded.',140)
)
insert into public.sop_steps (sop_document_id,stage,title,instructions,entry_criteria,completion_rule,sort_order)
select doc.id,steps.stage,steps.title,steps.instructions,steps.entry_criteria,steps.completion_rule,steps.sort_order from doc cross join steps
where not exists (select 1 from public.sop_steps s where s.sop_document_id=doc.id and s.sort_order=steps.sort_order);

insert into public.knowledge_documents (title,slug,document_type,content,source_url,is_published) values
('Kaushik Aadhithya — profile','kaushik-profile','resume','Kaushik Aadhithya Chiratanagandla is a Generative AI and AI/ML engineer in India working worldwide. He builds production AI applications, RAG and document intelligence, agentic workflows, evaluation and safety systems, secure AI APIs, and deployment infrastructure. His work emphasizes evidence, reliability, security, uncertainty, cost and human control.','https://mosshead-marimo.github.io/#about',true),
('Services and engagement','services-and-engagement','service','Services include AI product architecture, RAG and document intelligence, agentic workflow automation, AI and ML systems, LLM evaluation and safety, AI APIs and deployment, technical audits, and ongoing AI support. Current prices must always be read from the live service catalog rather than this document.','https://mosshead-marimo.github.io/#services',true),
('Delivery process','delivery-process','process','The delivery process frames the user and decision, builds the smallest useful workflow, evaluates grounding quality safety latency and cost, then deploys with monitoring, documentation, handoff and human checkpoints.','https://mosshead-marimo.github.io/#process',true),
('Portfolio business platform','portfolio-business-platform','case_study','The portfolio business platform combines a public service portfolio, secure lead intake, an admin operations dashboard, project tracking, dual-currency pricing, proposals, finance, lead discovery, content operations, referrals, SOPs and a grounded RAG demonstration. GitHub Pages serves the public experience, Supabase stores protected data and vectors, Vercel serves Gemini APIs, and Railway executes scheduled jobs.','https://mosshead-marimo.github.io/#work',true)
on conflict (slug) do update set content=excluded.content, source_url=excluded.source_url, is_published=excluded.is_published;

select pgmq.create('portfolio_jobs')
where not exists (select 1 from pgmq.meta where queue_name = 'portfolio_jobs');
