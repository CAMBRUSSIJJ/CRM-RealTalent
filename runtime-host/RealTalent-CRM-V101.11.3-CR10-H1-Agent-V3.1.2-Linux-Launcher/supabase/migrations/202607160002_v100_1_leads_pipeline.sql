-- RealTalent CRM V100.1 — Leads e Pipeline
-- Execute depois da migration V100.0.

begin;

create index if not exists leads_org_status_priority_idx on public.leads(organization_id, status, priority);
create index if not exists leads_org_temperature_idx on public.leads(organization_id, temperature);
create index if not exists leads_org_source_idx on public.leads(organization_id, source);
create index if not exists leads_org_city_idx on public.leads(organization_id, city);
create index if not exists leads_org_phone_normalized_idx on public.leads(organization_id, regexp_replace(phone, '\D', '', 'g')) where phone <> '';
create index if not exists leads_org_email_lower_idx on public.leads(organization_id, lower(email)) where email <> '';


do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads') then
    alter publication supabase_realtime add table public.leads;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pipeline_stages') then
    alter publication supabase_realtime add table public.pipeline_stages;
  end if;
end $$;

commit;
