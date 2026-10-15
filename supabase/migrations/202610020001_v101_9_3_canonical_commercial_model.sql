-- RealTalent CRM V101.9.3 — Person / Company / Opportunity Canonical Model
-- ContactRecord (Pessoa), CompanyRecord (Empresa) e OpportunityRecord (Oportunidade)
-- passam a ser autoridades canônicas. leads permanece como projection de compatibilidade.

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
  v_owner_name text;
begin
  if not public.can_write_organization(p_organization_id) then
    raise exception 'Sem permissão para sincronizar esta organização.';
  end if;

  update public.companies c
     set lead_ids = coalesce((select array_agg(l.id) from public.leads l where l.organization_id=p_organization_id and l.id=any(c.lead_ids)), '{}'::uuid[])
   where c.organization_id=p_organization_id;

  update public.contacts c
     set lead_ids = coalesce((select array_agg(l.id) from public.leads l where l.organization_id=p_organization_id and l.id=any(c.lead_ids)), '{}'::uuid[])
   where c.organization_id=p_organization_id;

  delete from public.social_profiles sp
   where sp.organization_id=p_organization_id
     and ((sp.entity_type='company' and not exists(select 1 from public.companies c where c.id=sp.entity_id and c.organization_id=p_organization_id))
       or (sp.entity_type='contact' and not exists(select 1 from public.contacts c where c.id=sp.entity_id and c.organization_id=p_organization_id)));

  for v_lead in select * from public.leads where organization_id=p_organization_id order by created_at loop
    select coalesce(p.display_name,'') into v_owner_name from public.profiles p where p.id=v_lead.owner_id;
    v_owner_name := coalesce(v_owner_name,'');
    v_domain := lower(regexp_replace(regexp_replace(coalesce(v_lead.website,''), '^https?://', '', 'i'), '/.*$', ''));

    -- Empresa: vínculo explícito > identidade. Se existir, o cadastro mestre vence o Lead.
    v_company_id := v_lead.company_id;
    if v_company_id is not null and not exists(
      select 1 from public.companies c where c.id=v_company_id and c.organization_id=p_organization_id
    ) then
      v_company_id := null;
    end if;

    if v_company_id is null then
      select id into v_company_id
        from public.companies
       where organization_id=p_organization_id
         and (
           (regexp_replace(coalesce(v_lead.cnpj,''), '\D', '', 'g') <> '' and regexp_replace(cnpj, '\D', '', 'g') = regexp_replace(v_lead.cnpj, '\D', '', 'g'))
           or (v_domain <> '' and lower(domain)=v_domain)
           or (lower(trim(name))=lower(trim(coalesce(nullif(v_lead.company,''),v_lead.name))) and lower(trim(city))=lower(trim(v_lead.city)))
         )
       order by updated_at desc
       limit 1;
    end if;

    if v_company_id is null then
      insert into public.companies(organization_id,name,cnpj,domain,website,segment,phone,city,state,status,lead_ids,created_at,updated_at)
      values (
        p_organization_id,coalesce(nullif(trim(v_lead.company),''),trim(v_lead.name)),v_lead.cnpj,v_domain,v_lead.website,coalesce(v_lead.tags[1],''),v_lead.phone,v_lead.city,v_lead.state,
        case when v_lead.status='won' then 'customer' when v_lead.status='archived' then 'inactive' else 'prospect' end,
        array[v_lead.id],v_lead.created_at,v_lead.updated_at
      ) returning id into v_company_id;
      v_companies := v_companies + 1;
    else
      update public.companies
         set name=coalesce(nullif(trim(name),''),coalesce(nullif(trim(v_lead.company),''),trim(v_lead.name))),
             cnpj=coalesce(nullif(cnpj,''),nullif(v_lead.cnpj,''),''),
             domain=coalesce(nullif(domain,''),nullif(v_domain,''),''),
             website=coalesce(nullif(website,''),nullif(v_lead.website,''),''),
             phone=coalesce(nullif(phone,''),nullif(v_lead.phone,''),''),
             city=coalesce(nullif(city,''),nullif(v_lead.city,''),''),
             state=coalesce(nullif(state,''),nullif(v_lead.state,''),''),
             lead_ids=(select array_agg(distinct x) from unnest(lead_ids || v_lead.id) x)
       where id=v_company_id;
    end if;

    -- Pessoa: cadastro mestre é autoridade de identidade; Lead apenas preenche lacunas.
    v_contact_id := v_lead.primary_contact_id;
    if v_contact_id is not null and not exists(
      select 1 from public.contacts c where c.id=v_contact_id and c.organization_id=p_organization_id
    ) then
      v_contact_id := null;
    end if;

    if v_contact_id is null then
      select id into v_contact_id
        from public.contacts
       where organization_id=p_organization_id
         and ((v_lead.email<>'' and lower(email)=lower(v_lead.email))
           or (v_lead.phone<>'' and regexp_replace(phone,'\D','','g')=regexp_replace(v_lead.phone,'\D','','g'))
           or (company_id=v_company_id and lower(trim(name))=lower(trim(v_lead.name))))
       order by is_primary desc, updated_at desc
       limit 1;
    end if;

    if v_contact_id is null then
      insert into public.contacts(organization_id,company_id,name,job_title,phone,email,decision_role,influence_level,relationship_strength,relationship_score,stance,relationship_owner_id,relationship_owner_name,last_contact_at,next_action_at,notes,is_primary,consent_status,do_not_contact,do_not_contact_reason,lead_ids,created_at,updated_at)
      values (p_organization_id,v_company_id,v_lead.name,v_lead.job_title,v_lead.phone,v_lead.email,v_lead.decision_role,v_lead.influence_level,'unknown',0,'unknown',v_lead.owner_id,v_owner_name,v_lead.last_contact_at,v_lead.next_action_at,'',true,v_lead.consent_status,v_lead.do_not_contact,v_lead.do_not_contact_reason,array[v_lead.id],v_lead.created_at,v_lead.updated_at)
      returning id into v_contact_id;
      v_contacts := v_contacts + 1;
    else
      update public.contacts
         set company_id=coalesce(company_id,v_company_id),
             name=coalesce(nullif(trim(name),''),v_lead.name),
             job_title=coalesce(nullif(job_title,''),nullif(v_lead.job_title,''),''),
             phone=coalesce(nullif(phone,''),nullif(v_lead.phone,''),''),
             email=coalesce(nullif(email,''),nullif(v_lead.email,''),''),
             decision_role=case when decision_role='unknown' then v_lead.decision_role else decision_role end,
             influence_level=case when influence_level<=0 then v_lead.influence_level else influence_level end,
             relationship_owner_id=coalesce(relationship_owner_id,v_lead.owner_id),
             relationship_owner_name=coalesce(nullif(relationship_owner_name,''),v_owner_name,''),
             last_contact_at=greatest(last_contact_at,v_lead.last_contact_at),
             next_action_at=coalesce(next_action_at,v_lead.next_action_at),
             is_primary=true,
             consent_status=case when consent_status='unknown' then v_lead.consent_status else consent_status end,
             do_not_contact=do_not_contact or v_lead.do_not_contact,
             do_not_contact_reason=case when do_not_contact_reason<>'' then do_not_contact_reason else v_lead.do_not_contact_reason end,
             lead_ids=(select array_agg(distinct x) from unnest(lead_ids || v_lead.id) x)
       where id=v_contact_id;
    end if;

    -- Oportunidade: vínculo explícito > lead_id. Campos comerciais existentes são canônicos.
    v_opportunity_id := v_lead.opportunity_id;
    if v_opportunity_id is not null and not exists(
      select 1 from public.opportunities o where o.id=v_opportunity_id and o.organization_id=p_organization_id
    ) then
      v_opportunity_id := null;
    end if;

    if v_opportunity_id is null then
      select id into v_opportunity_id
        from public.opportunities
       where organization_id=p_organization_id and lead_id=v_lead.id
       order by updated_at desc
       limit 1;
    end if;

    if v_opportunity_id is null then
      insert into public.opportunities(organization_id,company_id,primary_contact_id,lead_id,title,stage_id,status,value,owner_id,expected_close_at,created_at,updated_at)
      values (p_organization_id,v_company_id,v_contact_id,v_lead.id,coalesce(nullif(v_lead.company,''),v_lead.name)||' — oportunidade',v_lead.stage_id,v_lead.status,v_lead.value,v_lead.owner_id,v_lead.expected_close_at,v_lead.created_at,v_lead.updated_at)
      returning id into v_opportunity_id;
      v_opportunities := v_opportunities + 1;
    else
      update public.opportunities
         set company_id=coalesce(company_id,v_company_id),
             primary_contact_id=coalesce(primary_contact_id,v_contact_id),
             lead_id=v_lead.id,
             title=coalesce(nullif(trim(title),''),coalesce(nullif(v_lead.company,''),v_lead.name)||' — oportunidade')
       where id=v_opportunity_id;
    end if;

    if v_lead.company_id is distinct from v_company_id
       or v_lead.primary_contact_id is distinct from v_contact_id
       or v_lead.opportunity_id is distinct from v_opportunity_id then
      v_links := v_links + 1;
    end if;

    -- Lead passa a ser projection legada, reconstruída das três autoridades canônicas.
    update public.leads l
       set company_id=v_company_id,
           primary_contact_id=v_contact_id,
           opportunity_id=v_opportunity_id,
           company=coalesce(nullif(trim(c.name),''),l.company),
           cnpj=coalesce(c.cnpj,''),
           website=coalesce(c.website,''),
           city=coalesce(c.city,''),
           state=coalesce(c.state,''),
           name=coalesce(nullif(trim(p.name),''),l.name),
           phone=coalesce(p.phone,''),
           email=lower(coalesce(p.email,'')),
           job_title=coalesce(p.job_title,''),
           decision_role=coalesce(p.decision_role,'unknown'),
           influence_level=coalesce(p.influence_level,0),
           consent_status=coalesce(p.consent_status,'unknown'),
           do_not_contact=coalesce(p.do_not_contact,false),
           do_not_contact_reason=coalesce(p.do_not_contact_reason,''),
           last_contact_at=coalesce(p.last_contact_at,l.last_contact_at),
           stage_id=o.stage_id,
           status=o.status,
           value=o.value,
           owner_id=o.owner_id,
           expected_close_at=o.expected_close_at
      from public.companies c, public.contacts p, public.opportunities o
     where l.id=v_lead.id
       and c.id=v_company_id
       and p.id=v_contact_id
       and o.id=v_opportunity_id;

    foreach v_network in array array['instagram','linkedin','facebook','website']::public.social_network[] loop
      v_url := case v_network when 'instagram' then v_lead.instagram_url when 'linkedin' then v_lead.linkedin_url when 'facebook' then v_lead.facebook_url else v_lead.website end;
      if coalesce(trim(v_url),'')<>'' then
        insert into public.social_profiles(organization_id,entity_type,entity_id,network,username,url,source,confidence,created_at,updated_at)
        values (p_organization_id,'company',v_company_id,v_network,'',regexp_replace(trim(v_url),'/$',''),coalesce(nullif(v_lead.source_detail,''),v_lead.source),case when v_lead.source_url<>'' and regexp_replace(v_lead.source_url,'/$','')=regexp_replace(v_url,'/$','') then 95 else 80 end,v_lead.created_at,v_lead.updated_at)
        on conflict (organization_id,network,url) do update
          set entity_type='company',entity_id=v_company_id,source=excluded.source,confidence=greatest(public.social_profiles.confidence,excluded.confidence),updated_at=now();
        if found then v_profiles := v_profiles + 1; end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'companiesCreated',v_companies,
    'contactsCreated',v_contacts,
    'opportunitiesCreated',v_opportunities,
    'socialProfilesCreated',v_profiles,
    'leadsLinked',v_links,
    'canonicalModel','101.9.3'
  );
end;
$$;

comment on function public.sync_commercial_structure(uuid) is
  'V101.9.3: reconcilia Pessoa/Empresa/Oportunidade como autoridades canônicas e Lead como projection de compatibilidade.';

revoke all on function public.sync_commercial_structure(uuid) from public, anon;
grant execute on function public.sync_commercial_structure(uuid) to authenticated;
