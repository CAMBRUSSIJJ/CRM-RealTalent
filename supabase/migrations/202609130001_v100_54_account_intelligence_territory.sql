-- RealTalent CRM V100.54 — Account Intelligence & Territory
-- Amplia pessoas/decisores e cria relações entre stakeholders sem quebrar o modelo legado de leads.

alter type public.decision_role add value if not exists 'economic_buyer';
alter type public.decision_role add value if not exists 'champion';
alter type public.decision_role add value if not exists 'technical_evaluator';
alter type public.decision_role add value if not exists 'finance';
alter type public.decision_role add value if not exists 'procurement';
alter type public.decision_role add value if not exists 'gatekeeper';
alter type public.decision_role add value if not exists 'blocker';
alter type public.decision_role add value if not exists 'operational';

alter table public.contacts
  add column if not exists relationship_strength text not null default 'unknown' check (relationship_strength in ('unknown','weak','developing','strong','trusted')),
  add column if not exists relationship_score integer not null default 0 check (relationship_score between 0 and 100),
  add column if not exists stance text not null default 'unknown' check (stance in ('unknown','supportive','neutral','opposed')),
  add column if not exists relationship_owner_id uuid references auth.users(id) on delete set null,
  add column if not exists relationship_owner_name text not null default '',
  add column if not exists last_contact_at timestamptz,
  add column if not exists next_action_at timestamptz,
  add column if not exists notes text not null default '',
  add column if not exists is_primary boolean not null default false;

create table if not exists public.contact_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  from_contact_id uuid not null references public.contacts(id) on delete cascade,
  to_contact_id uuid not null references public.contacts(id) on delete cascade,
  relationship_type text not null default 'other' check (relationship_type in ('reports_to','partner','co_owner','referred_by','works_with','influences','other')),
  strength integer not null default 50 check (strength between 0 and 100),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_contact_id <> to_contact_id)
);

create unique index if not exists contact_relationships_unique_v10054_idx
  on public.contact_relationships(organization_id, from_contact_id, to_contact_id, relationship_type);
create index if not exists contact_relationships_org_company_v10054_idx
  on public.contact_relationships(organization_id, company_id);
create index if not exists contacts_org_role_v10054_idx
  on public.contacts(organization_id, decision_role, relationship_score desc);

create trigger contact_relationships_touch_updated_at
  before update on public.contact_relationships
  for each row execute function public.touch_updated_at();

alter table public.contact_relationships enable row level security;
create policy contact_relationships_select_v10054 on public.contact_relationships for select to authenticated
  using (public.is_organization_member(organization_id));
create policy contact_relationships_insert_v10054 on public.contact_relationships for insert to authenticated
  with check (public.can_write_organization(organization_id));
create policy contact_relationships_update_v10054 on public.contact_relationships for update to authenticated
  using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy contact_relationships_delete_v10054 on public.contact_relationships for delete to authenticated
  using (public.can_write_organization(organization_id));
grant select,insert,update,delete on public.contact_relationships to authenticated;

-- A estrutura comercial passa a tratar contacts como cadastro mestre: sincronizar um lead
-- não deve apagar nome/papel/relacionamento enriquecido manualmente no Account 360.
create or replace function public.sync_commercial_structure(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_company_id uuid;
  v_contact_id uuid;
  v_opportunity_id uuid;
  v_companies integer := 0;
  v_contacts integer := 0;
  v_opportunities integer := 0;
  v_profiles integer := 0;
  v_links integer := 0;
  v_domain text;
  v_url text;
  v_network public.social_network;
begin
  if not public.can_write_organization(p_organization_id) then
    raise exception 'Sem permissão para sincronizar esta organização.';
  end if;

  update public.companies c set lead_ids = coalesce((select array_agg(l.id) from public.leads l where l.organization_id=p_organization_id and l.id=any(c.lead_ids)), '{}'::uuid[]) where c.organization_id=p_organization_id;
  update public.contacts c set lead_ids = coalesce((select array_agg(l.id) from public.leads l where l.organization_id=p_organization_id and l.id=any(c.lead_ids)), '{}'::uuid[]) where c.organization_id=p_organization_id;
  delete from public.social_profiles sp where sp.organization_id=p_organization_id and ((sp.entity_type='company' and not exists(select 1 from public.companies c where c.id=sp.entity_id and c.organization_id=p_organization_id)) or (sp.entity_type='contact' and not exists(select 1 from public.contacts c where c.id=sp.entity_id and c.organization_id=p_organization_id)));
  -- Contatos adicionais do Account 360 são cadastros mestres e não devem ser removidos
  -- apenas por não estarem ligados diretamente a um Lead.
  delete from public.companies c where c.organization_id=p_organization_id and cardinality(c.lead_ids)=0 and not exists(select 1 from public.contacts ct where ct.company_id=c.id) and not exists(select 1 from public.opportunities o where o.company_id=c.id) and not exists(select 1 from public.leads l where l.company_id=c.id);

  for v_lead in select * from public.leads where organization_id = p_organization_id order by created_at loop
    v_domain := lower(regexp_replace(regexp_replace(coalesce(v_lead.website,''), '^https?://', '', 'i'), '/.*$', ''));
    v_company_id := v_lead.company_id;
    if v_company_id is null then
      select id into v_company_id from public.companies
      where organization_id = p_organization_id
        and (
          (regexp_replace(coalesce(v_lead.cnpj,''), '\D', '', 'g') <> '' and regexp_replace(cnpj, '\D', '', 'g') = regexp_replace(v_lead.cnpj, '\D', '', 'g'))
          or (v_domain <> '' and lower(domain) = v_domain)
          or (lower(trim(name)) = lower(trim(coalesce(nullif(v_lead.company,''),v_lead.name))) and lower(trim(city)) = lower(trim(v_lead.city)))
        )
      order by
        case when regexp_replace(coalesce(v_lead.cnpj,''), '\D', '', 'g') <> '' and regexp_replace(cnpj, '\D', '', 'g') = regexp_replace(v_lead.cnpj, '\D', '', 'g') then 0
             when v_domain <> '' and lower(domain) = v_domain then 1 else 2 end,
        updated_at desc
      limit 1;
    end if;
    if v_company_id is null then
      insert into public.companies(organization_id,name,cnpj,domain,website,segment,phone,city,state,status,lead_ids,created_at,updated_at)
      values (p_organization_id,coalesce(nullif(trim(v_lead.company),''),trim(v_lead.name)),v_lead.cnpj,v_domain,v_lead.website,coalesce(v_lead.tags[1],''),v_lead.phone,v_lead.city,v_lead.state,
        case when v_lead.status='won' then 'customer' when v_lead.status='archived' then 'inactive' else 'prospect' end,array[v_lead.id],v_lead.created_at,v_lead.updated_at)
      returning id into v_company_id;
      v_companies := v_companies + 1;
    else
      update public.companies set
        name=coalesce(nullif(trim(name),''),coalesce(nullif(trim(v_lead.company),''),trim(v_lead.name))), cnpj=coalesce(nullif(cnpj,''),nullif(v_lead.cnpj,''),''), domain=coalesce(nullif(domain,''),nullif(v_domain,''),''), website=coalesce(nullif(website,''),nullif(v_lead.website,''),''),
        phone=coalesce(nullif(phone,''),nullif(v_lead.phone,''),''), city=coalesce(nullif(city,''),nullif(v_lead.city,''),''), state=coalesce(nullif(state,''),nullif(v_lead.state,''),''),
        status=case when v_lead.status='won' then 'customer' when v_lead.status='archived' then 'inactive' else 'prospect' end,
        lead_ids=(select array_agg(distinct x) from unnest(lead_ids || v_lead.id) x)
      where id=v_company_id;
    end if;

    v_contact_id := v_lead.primary_contact_id;
    if v_contact_id is null then
      select id into v_contact_id from public.contacts
      where organization_id=p_organization_id and (
        (v_lead.email<>'' and lower(email)=lower(v_lead.email)) or
        (v_lead.phone<>'' and regexp_replace(phone,'\D','','g')=regexp_replace(v_lead.phone,'\D','','g')) or
        (company_id=v_company_id and lower(trim(name))=lower(trim(v_lead.name)))
      ) order by updated_at desc limit 1;
    end if;
    if v_contact_id is null then
      insert into public.contacts(organization_id,company_id,name,job_title,phone,email,decision_role,influence_level,relationship_strength,relationship_score,stance,relationship_owner_id,relationship_owner_name,last_contact_at,next_action_at,notes,is_primary,consent_status,do_not_contact,do_not_contact_reason,lead_ids,created_at,updated_at)
      values (p_organization_id,v_company_id,v_lead.name,v_lead.job_title,v_lead.phone,v_lead.email,v_lead.decision_role,v_lead.influence_level,'unknown',0,'unknown',v_lead.owner_id,v_lead.owner_name,v_lead.last_contact_at,v_lead.next_action_at,'',true,v_lead.consent_status,v_lead.do_not_contact,v_lead.do_not_contact_reason,array[v_lead.id],v_lead.created_at,v_lead.updated_at)
      returning id into v_contact_id;
      v_contacts := v_contacts + 1;
    else
      update public.contacts set
        company_id=v_company_id,
        name=coalesce(nullif(trim(name),''),v_lead.name),
        job_title=coalesce(nullif(job_title,''),nullif(v_lead.job_title,''),''),
        phone=coalesce(nullif(phone,''),nullif(v_lead.phone,''),''),
        email=coalesce(nullif(email,''),nullif(v_lead.email,''),''),
        decision_role=case when decision_role='unknown' then v_lead.decision_role else decision_role end,
        influence_level=greatest(influence_level,v_lead.influence_level),
        relationship_owner_id=coalesce(relationship_owner_id,v_lead.owner_id),
        relationship_owner_name=coalesce(nullif(relationship_owner_name,''),v_lead.owner_name,''),
        last_contact_at=greatest(last_contact_at,v_lead.last_contact_at),
        next_action_at=coalesce(next_action_at,v_lead.next_action_at),
        is_primary=true,
        consent_status=case when consent_status='unknown' then v_lead.consent_status else consent_status end,
        do_not_contact=do_not_contact or v_lead.do_not_contact,
        do_not_contact_reason=case when do_not_contact_reason<>'' then do_not_contact_reason else v_lead.do_not_contact_reason end,
        lead_ids=(select array_agg(distinct x) from unnest(lead_ids || v_lead.id) x)
      where id=v_contact_id;
    end if;

    select id into v_opportunity_id from public.opportunities where lead_id=v_lead.id;
    if v_opportunity_id is null then
      insert into public.opportunities(organization_id,company_id,primary_contact_id,lead_id,title,stage_id,status,value,owner_id,expected_close_at,created_at,updated_at)
      values (p_organization_id,v_company_id,v_contact_id,v_lead.id,coalesce(nullif(v_lead.company,''),v_lead.name)||' — oportunidade',v_lead.stage_id,v_lead.status,v_lead.value,v_lead.owner_id,v_lead.expected_close_at,v_lead.created_at,v_lead.updated_at)
      returning id into v_opportunity_id;
      v_opportunities := v_opportunities + 1;
    else
      update public.opportunities set company_id=v_company_id,primary_contact_id=v_contact_id,title=coalesce(nullif(v_lead.company,''),v_lead.name)||' — oportunidade',stage_id=v_lead.stage_id,status=v_lead.status,value=v_lead.value,owner_id=v_lead.owner_id,expected_close_at=v_lead.expected_close_at where id=v_opportunity_id;
    end if;

    if v_lead.company_id is distinct from v_company_id or v_lead.primary_contact_id is distinct from v_contact_id or v_lead.opportunity_id is distinct from v_opportunity_id then v_links := v_links + 1; end if;
    update public.leads set company_id=v_company_id,primary_contact_id=v_contact_id,opportunity_id=v_opportunity_id where id=v_lead.id;

    foreach v_network in array array['instagram','linkedin','facebook','website']::public.social_network[] loop
      v_url := case v_network when 'instagram' then v_lead.instagram_url when 'linkedin' then v_lead.linkedin_url when 'facebook' then v_lead.facebook_url else v_lead.website end;
      if coalesce(trim(v_url),'')<>'' then
        insert into public.social_profiles(organization_id,entity_type,entity_id,network,username,url,source,confidence,created_at,updated_at)
        values (p_organization_id,'company',v_company_id,v_network,'',regexp_replace(trim(v_url),'/$',''),coalesce(nullif(v_lead.source_detail,''),v_lead.source),case when v_lead.source_url<>'' and regexp_replace(v_lead.source_url,'/$','')=regexp_replace(v_url,'/$','') then 95 else 80 end,v_lead.created_at,v_lead.updated_at)
        on conflict (organization_id,network,url) do update set entity_type='company',entity_id=v_company_id,source=excluded.source,confidence=greatest(public.social_profiles.confidence,excluded.confidence),updated_at=now();
        if found then v_profiles := v_profiles + 1; end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('companiesCreated',v_companies,'contactsCreated',v_contacts,'opportunitiesCreated',v_opportunities,'socialProfilesCreated',v_profiles,'leadsLinked',v_links);
end;
$$;

grant execute on function public.sync_commercial_structure(uuid) to authenticated;


do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='contact_relationships') then
    alter publication supabase_realtime add table public.contact_relationships;
  end if;
end $$;


-- V100.54: identifica a pessoa real envolvida em cada interação da conta.
alter table public.activities add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.calls add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.calendar_events add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists activities_org_contact_v10054_idx on public.activities(organization_id, contact_id, created_at desc);
create index if not exists calls_org_contact_v10054_idx on public.calls(organization_id, contact_id, started_at desc);
create index if not exists calendar_events_org_contact_v10054_idx on public.calendar_events(organization_id, contact_id, starts_at desc);

create or replace function public.resolve_interaction_contact_v10054()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.contact_id is null and new.lead_id is not null then
    select l.primary_contact_id into new.contact_id
      from public.leads l
     where l.id = new.lead_id
       and l.organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists activities_resolve_contact_v10054 on public.activities;
create trigger activities_resolve_contact_v10054
  before insert or update of lead_id, contact_id on public.activities
  for each row execute function public.resolve_interaction_contact_v10054();

drop trigger if exists calls_resolve_contact_v10054 on public.calls;
create trigger calls_resolve_contact_v10054
  before insert or update of lead_id, contact_id on public.calls
  for each row execute function public.resolve_interaction_contact_v10054();

drop trigger if exists calendar_events_resolve_contact_v10054 on public.calendar_events;
create trigger calendar_events_resolve_contact_v10054
  before insert or update of lead_id, contact_id on public.calendar_events
  for each row execute function public.resolve_interaction_contact_v10054();

update public.activities a set contact_id = l.primary_contact_id
from public.leads l
where a.contact_id is null and a.lead_id = l.id and a.organization_id = l.organization_id and l.primary_contact_id is not null;
update public.calls c set contact_id = l.primary_contact_id
from public.leads l
where c.contact_id is null and c.lead_id = l.id and c.organization_id = l.organization_id and l.primary_contact_id is not null;
update public.calendar_events e set contact_id = l.primary_contact_id
from public.leads l
where e.contact_id is null and e.lead_id = l.id and e.organization_id = l.organization_id and l.primary_contact_id is not null;
