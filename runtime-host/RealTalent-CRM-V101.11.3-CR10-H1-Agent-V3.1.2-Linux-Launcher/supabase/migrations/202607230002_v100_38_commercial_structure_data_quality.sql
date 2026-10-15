-- RealTalent CRM V100.38 — Estrutura Comercial e Qualidade de Dados
-- Separa empresa, pessoa, oportunidade e perfis sociais sem quebrar o cadastro legado de leads.
begin;

create type public.decision_role as enum ('decision_maker','influencer','user','unknown');
create type public.consent_status as enum ('unknown','legitimate_interest','consented','opted_out');
create type public.social_network as enum ('instagram','linkedin','facebook','whatsapp','website','google_business','other');
create type public.social_entity_type as enum ('company','contact');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  legal_name text not null default '',
  cnpj text not null default '',
  domain text not null default '',
  website text not null default '',
  segment text not null default '',
  phone text not null default '',
  city text not null default '',
  state text not null default '',
  status text not null default 'prospect' check (status in ('prospect','customer','inactive')),
  lead_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  job_title text not null default '',
  phone text not null default '',
  email text not null default '',
  decision_role public.decision_role not null default 'unknown',
  influence_level integer not null default 0 check (influence_level between 0 and 100),
  consent_status public.consent_status not null default 'unknown',
  do_not_contact boolean not null default false,
  do_not_contact_reason text not null default '',
  lead_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  title text not null,
  stage_id uuid not null references public.pipeline_stages(id),
  status text not null default 'active' check (status in ('active','won','lost','archived')),
  value numeric(14,2) not null default 0,
  owner_id uuid references auth.users(id) on delete set null,
  expected_close_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.social_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type public.social_entity_type not null,
  entity_id uuid not null,
  network public.social_network not null,
  username text not null default '',
  url text not null,
  external_id text,
  verified boolean not null default false,
  source text not null default '',
  confidence integer not null default 0 check (confidence between 0 and 100),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, network, url)
);

alter table public.leads
  add column company_id uuid references public.companies(id) on delete set null,
  add column primary_contact_id uuid references public.contacts(id) on delete set null,
  add column opportunity_id uuid references public.opportunities(id) on delete set null,
  add column source_detail text not null default '',
  add column source_url text not null default '',
  add column captured_at timestamptz,
  add column consent_status public.consent_status not null default 'unknown',
  add column do_not_contact boolean not null default false,
  add column do_not_contact_reason text not null default '',
  add column cnpj text not null default '',
  add column website text not null default '',
  add column instagram_url text not null default '',
  add column linkedin_url text not null default '',
  add column facebook_url text not null default '',
  add column job_title text not null default '',
  add column decision_role public.decision_role not null default 'unknown',
  add column influence_level integer not null default 0 check (influence_level between 0 and 100);

create index companies_org_name_city_idx on public.companies(organization_id, lower(name), lower(city));
create unique index companies_org_cnpj_unique on public.companies(organization_id, regexp_replace(cnpj, '\D', '', 'g')) where cnpj <> '';
create index companies_org_domain_idx on public.companies(organization_id, lower(domain)) where domain <> '';
create index contacts_org_company_idx on public.contacts(organization_id, company_id);
create index contacts_org_phone_idx on public.contacts(organization_id, regexp_replace(phone, '\D', '', 'g')) where phone <> '';
create index contacts_org_email_idx on public.contacts(organization_id, lower(email)) where email <> '';
create index opportunities_org_stage_status_idx on public.opportunities(organization_id, stage_id, status);
create index social_profiles_org_entity_idx on public.social_profiles(organization_id, entity_type, entity_id);
create index social_profiles_org_network_idx on public.social_profiles(organization_id, network);
create index leads_org_company_contact_idx on public.leads(organization_id, company_id, primary_contact_id);
create index leads_org_do_not_contact_idx on public.leads(organization_id, do_not_contact) where do_not_contact;

create trigger companies_touch_updated_at before update on public.companies for each row execute function public.touch_updated_at();
create trigger contacts_touch_updated_at before update on public.contacts for each row execute function public.touch_updated_at();
create trigger opportunities_touch_updated_at before update on public.opportunities for each row execute function public.touch_updated_at();
create trigger social_profiles_touch_updated_at before update on public.social_profiles for each row execute function public.touch_updated_at();

alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.opportunities enable row level security;
alter table public.social_profiles enable row level security;

create policy companies_select on public.companies for select to authenticated using (public.is_organization_member(organization_id));
create policy companies_insert on public.companies for insert to authenticated with check (public.can_write_organization(organization_id));
create policy companies_update on public.companies for update to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy companies_delete on public.companies for delete to authenticated using (public.can_write_organization(organization_id));
create policy contacts_select on public.contacts for select to authenticated using (public.is_organization_member(organization_id));
create policy contacts_insert on public.contacts for insert to authenticated with check (public.can_write_organization(organization_id));
create policy contacts_update on public.contacts for update to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy contacts_delete on public.contacts for delete to authenticated using (public.can_write_organization(organization_id));
create policy opportunities_select on public.opportunities for select to authenticated using (public.is_organization_member(organization_id));
create policy opportunities_insert on public.opportunities for insert to authenticated with check (public.can_write_organization(organization_id));
create policy opportunities_update on public.opportunities for update to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy opportunities_delete on public.opportunities for delete to authenticated using (public.can_write_organization(organization_id));
create policy social_profiles_select on public.social_profiles for select to authenticated using (public.is_organization_member(organization_id));
create policy social_profiles_insert on public.social_profiles for insert to authenticated with check (public.can_write_organization(organization_id));
create policy social_profiles_update on public.social_profiles for update to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy social_profiles_delete on public.social_profiles for delete to authenticated using (public.can_write_organization(organization_id));

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
  delete from public.contacts c where c.organization_id=p_organization_id and cardinality(c.lead_ids)=0 and not exists(select 1 from public.opportunities o where o.primary_contact_id=c.id) and not exists(select 1 from public.leads l where l.primary_contact_id=c.id);
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
        name=coalesce(nullif(trim(v_lead.company),''),trim(v_lead.name)), cnpj=coalesce(nullif(v_lead.cnpj,''),cnpj), domain=coalesce(nullif(v_domain,''),domain), website=coalesce(nullif(v_lead.website,''),website),
        phone=coalesce(nullif(v_lead.phone,''),phone), city=coalesce(nullif(v_lead.city,''),city), state=coalesce(nullif(v_lead.state,''),state),
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
      insert into public.contacts(organization_id,company_id,name,job_title,phone,email,decision_role,influence_level,consent_status,do_not_contact,do_not_contact_reason,lead_ids,created_at,updated_at)
      values (p_organization_id,v_company_id,v_lead.name,v_lead.job_title,v_lead.phone,v_lead.email,v_lead.decision_role,v_lead.influence_level,v_lead.consent_status,v_lead.do_not_contact,v_lead.do_not_contact_reason,array[v_lead.id],v_lead.created_at,v_lead.updated_at)
      returning id into v_contact_id;
      v_contacts := v_contacts + 1;
    else
      update public.contacts set company_id=v_company_id,name=v_lead.name,job_title=coalesce(nullif(v_lead.job_title,''),job_title),phone=coalesce(nullif(v_lead.phone,''),phone),email=coalesce(nullif(v_lead.email,''),email),
        decision_role=v_lead.decision_role,influence_level=v_lead.influence_level,consent_status=v_lead.consent_status,do_not_contact=v_lead.do_not_contact,do_not_contact_reason=v_lead.do_not_contact_reason,
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

grant select,insert,update,delete on public.companies,public.contacts,public.opportunities,public.social_profiles to authenticated;
grant execute on function public.sync_commercial_structure(uuid) to authenticated;

commit;
