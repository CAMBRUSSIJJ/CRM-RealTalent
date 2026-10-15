-- RealTalent CRM V100.52.0 — Architecture & Production Hardening
-- Realtime coverage and indexes used by paged snapshot reads.

create index if not exists companies_org_name_id_v10052_idx on public.companies(organization_id, name, id);
create index if not exists contacts_org_name_id_v10052_idx on public.contacts(organization_id, name, id);
create index if not exists opportunities_org_updated_id_v10052_idx on public.opportunities(organization_id, updated_at desc, id);
create index if not exists social_profiles_org_network_id_v10052_idx on public.social_profiles(organization_id, network, id);
create index if not exists activities_org_due_id_v10052_idx on public.activities(organization_id, due_at, id);
create index if not exists calendar_events_org_starts_id_v10052_idx on public.calendar_events(organization_id, starts_at, id);
create index if not exists playbooks_org_title_id_v10052_idx on public.playbooks(organization_id, title, id);
create index if not exists products_org_name_id_v10052_idx on public.products(organization_id, name, id);
create index if not exists sales_proposals_org_updated_id_v10052_idx on public.sales_proposals(organization_id, updated_at desc, id);
create index if not exists sales_proposal_items_org_order_id_v10052_idx on public.sales_proposal_items(organization_id, item_order, id);
create index if not exists revenue_entries_org_competence_id_v10052_idx on public.revenue_entries(organization_id, competence_date desc, id);
create index if not exists goals_org_period_id_v10052_idx on public.goals(organization_id, period_start desc, id);
create index if not exists automation_rules_org_name_id_v10052_idx on public.automation_rules(organization_id, name, id);

-- The frontend now refreshes only the domain slice affected by a Realtime event.
-- Ensure every subscribed commercial table is part of the Supabase publication.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'companies', 'contacts', 'opportunities', 'social_profiles',
      'products', 'sales_proposals', 'sales_proposal_items', 'revenue_entries'
    ] loop
      if to_regclass(format('public.%I', table_name)) is not null
         and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = table_name
         ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
