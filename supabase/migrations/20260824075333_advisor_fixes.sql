drop policy lead_requests_deny_public on public.lead_requests;
create index analytics_events_service_idx on public.analytics_events (service_id) where service_id is not null;
