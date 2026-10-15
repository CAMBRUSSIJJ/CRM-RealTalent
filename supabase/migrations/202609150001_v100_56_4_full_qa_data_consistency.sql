-- RealTalent CRM V100.56.4 — Full QA & Data Consistency
-- Hardening corretivo: referências entre workspaces, histórico comercial, mesclagem e sincronização.
begin;

-- Novas gravações passam a respeitar intervalos coerentes sem invalidar dados legados já existentes.
alter table public.calendar_events drop constraint if exists calendar_events_v100564_valid_range;
alter table public.calendar_events add constraint calendar_events_v100564_valid_range check (ends_at > starts_at) not valid;
alter table public.sales_proposals drop constraint if exists sales_proposals_v100564_contract_range;
alter table public.sales_proposals add constraint sales_proposals_v100564_contract_range check (contract_start_at is null or contract_end_at is null or contract_end_at >= contract_start_at) not valid;
alter table public.revenue_entries drop constraint if exists revenue_entries_v100564_service_range;
alter table public.revenue_entries add constraint revenue_entries_v100564_service_range check (service_period_start is null or service_period_end is null or service_period_end >= service_period_start) not valid;
alter table public.goals drop constraint if exists goals_v100564_positive_target;
alter table public.goals add constraint goals_v100564_positive_target check (target_value > 0) not valid;

create or replace function public.assert_workspace_references_v100564()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare
  v jsonb := to_jsonb(new);
  v_org uuid := nullif(v->>'organization_id','')::uuid;
  v_id uuid;
  v_lead uuid;
  v_opp uuid;
begin
  if v_org is null then return new; end if;

  if v ? 'stage_id' and nullif(v->>'stage_id','') is not null then
    v_id := (v->>'stage_id')::uuid;
    if not exists(select 1 from public.pipeline_stages x where x.id=v_id and x.organization_id=v_org) then raise exception 'Etapa pertence a outro workspace ou não existe'; end if;
  end if;
  if v ? 'lead_id' and nullif(v->>'lead_id','') is not null then
    v_lead := (v->>'lead_id')::uuid;
    if not exists(select 1 from public.leads x where x.id=v_lead and x.organization_id=v_org) then raise exception 'Lead pertence a outro workspace ou não existe'; end if;
  end if;
  if v ? 'company_id' and nullif(v->>'company_id','') is not null then
    v_id := (v->>'company_id')::uuid;
    if not exists(select 1 from public.companies x where x.id=v_id and x.organization_id=v_org) then raise exception 'Empresa pertence a outro workspace ou não existe'; end if;
  end if;
  if v ? 'contact_id' and nullif(v->>'contact_id','') is not null then
    v_id := (v->>'contact_id')::uuid;
    if not exists(select 1 from public.contacts x where x.id=v_id and x.organization_id=v_org) then raise exception 'Contato pertence a outro workspace ou não existe'; end if;
  end if;
  if v ? 'primary_contact_id' and nullif(v->>'primary_contact_id','') is not null then
    v_id := (v->>'primary_contact_id')::uuid;
    if not exists(select 1 from public.contacts x where x.id=v_id and x.organization_id=v_org) then raise exception 'Contato principal pertence a outro workspace ou não existe'; end if;
  end if;
  if v ? 'from_contact_id' and nullif(v->>'from_contact_id','') is not null then
    v_id := (v->>'from_contact_id')::uuid;
    if not exists(select 1 from public.contacts x where x.id=v_id and x.organization_id=v_org) then raise exception 'Contato de origem pertence a outro workspace ou não existe'; end if;
  end if;
  if v ? 'to_contact_id' and nullif(v->>'to_contact_id','') is not null then
    v_id := (v->>'to_contact_id')::uuid;
    if not exists(select 1 from public.contacts x where x.id=v_id and x.organization_id=v_org) then raise exception 'Contato de destino pertence a outro workspace ou não existe'; end if;
  end if;
  if v ? 'opportunity_id' and nullif(v->>'opportunity_id','') is not null then
    v_opp := (v->>'opportunity_id')::uuid;
    if not exists(select 1 from public.opportunities x where x.id=v_opp and x.organization_id=v_org) then raise exception 'Oportunidade pertence a outro workspace ou não existe'; end if;
  end if;
  if v ? 'proposal_id' and nullif(v->>'proposal_id','') is not null then
    v_id := (v->>'proposal_id')::uuid;
    if not exists(select 1 from public.sales_proposals x where x.id=v_id and x.organization_id=v_org) then raise exception 'Proposta pertence a outro workspace ou não existe'; end if;
  end if;

  if tg_table_name in ('companies','contacts') and v ? 'lead_ids' and jsonb_typeof(v->'lead_ids')='array' then
    if exists(
      select 1 from jsonb_array_elements_text(v->'lead_ids') e(id)
      where not exists(select 1 from public.leads l where l.id=e.id::uuid and l.organization_id=v_org)
    ) then raise exception 'A lista de leads contém referência de outro workspace ou inexistente'; end if;
  end if;

  if tg_table_name='contact_relationships' then
    if (v->>'from_contact_id')=(v->>'to_contact_id') then raise exception 'Um contato não pode se relacionar consigo mesmo'; end if;
  end if;

  if tg_table_name='opportunities' and v_lead is not null then
    if not exists(select 1 from public.leads l where l.id=v_lead and l.organization_id=v_org) then raise exception 'Oportunidade sem lead válido'; end if;
  end if;

  if tg_table_name='sales_proposals' and v_opp is not null and v_lead is not null then
    if not exists(select 1 from public.opportunities o where o.id=v_opp and o.organization_id=v_org and o.lead_id=v_lead) then raise exception 'A oportunidade da proposta não pertence ao mesmo lead'; end if;
  end if;

  if tg_table_name='revenue_entries' then
    if v_opp is not null and v_lead is not null and not exists(select 1 from public.opportunities o where o.id=v_opp and o.organization_id=v_org and o.lead_id=v_lead) then raise exception 'A oportunidade da receita não pertence ao mesmo lead'; end if;
    if nullif(v->>'proposal_id','') is not null and v_lead is not null and not exists(select 1 from public.sales_proposals p where p.id=(v->>'proposal_id')::uuid and p.organization_id=v_org and p.lead_id=v_lead) then raise exception 'A proposta da receita não pertence ao mesmo lead'; end if;
  end if;

  if tg_table_name='social_profiles' then
    if v->>'entity_type'='company' and not exists(select 1 from public.companies c where c.id=(v->>'entity_id')::uuid and c.organization_id=v_org) then raise exception 'Empresa do perfil social é inválida'; end if;
    if v->>'entity_type'='contact' and not exists(select 1 from public.contacts c where c.id=(v->>'entity_id')::uuid and c.organization_id=v_org) then raise exception 'Contato do perfil social é inválido'; end if;
  end if;
  return new;
end; $$;

-- A validação é aplicada nas entidades que carregam referências comerciais entre módulos.
do $$
declare t text;
begin
  foreach t in array array['leads','companies','contacts','contact_relationships','opportunities','social_profiles','activities','calls','calendar_events','sales_proposals','revenue_entries'] loop
    execute format('drop trigger if exists assert_workspace_refs_v100564 on public.%I',t);
    execute format('create trigger assert_workspace_refs_v100564 before insert or update on public.%I for each row execute function public.assert_workspace_references_v100564()',t);
  end loop;
end $$;

create or replace function public.protect_lead_history_v100564()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_setting('realtalent.lead_merge',true)='on' then return old; end if;
  if old.status='won' then raise exception 'Lead ganho não pode ser excluído; preserve o histórico comercial'; end if;
  if exists(select 1 from public.sales_proposals p where p.lead_id=old.id and (p.status='accepted' or p.closed_won_at is not null)) then raise exception 'Lead com proposta aceita/fechada não pode ser excluído'; end if;
  if exists(select 1 from public.revenue_entries r where r.lead_id=old.id and r.status<>'cancelled') then raise exception 'Lead com receita reconhecida/prevista não pode ser excluído'; end if;
  return old;
end; $$;

drop trigger if exists protect_lead_history_v100564 on public.leads;
create trigger protect_lead_history_v100564 before delete on public.leads for each row execute function public.protect_lead_history_v100564();

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

  update public.companies c set lead_ids = coalesce((select array_agg(l.id) from public.leads l where l.organization_id=p_organization_id and l.id=any(c.lead_ids)), '{}'::uuid[]) where c.organization_id=p_organization_id;
  update public.contacts c set lead_ids = coalesce((select array_agg(l.id) from public.leads l where l.organization_id=p_organization_id and l.id=any(c.lead_ids)), '{}'::uuid[]) where c.organization_id=p_organization_id;
  delete from public.social_profiles sp where sp.organization_id=p_organization_id and ((sp.entity_type='company' and not exists(select 1 from public.companies c where c.id=sp.entity_id and c.organization_id=p_organization_id)) or (sp.entity_type='contact' and not exists(select 1 from public.contacts c where c.id=sp.entity_id and c.organization_id=p_organization_id)));
  -- Contatos adicionais do Account 360 são cadastros mestres e não devem ser removidos
  -- apenas por não estarem ligados diretamente a um Lead.

  for v_lead in select * from public.leads where organization_id = p_organization_id order by created_at loop
    select coalesce(p.display_name,'') into v_owner_name from public.profiles p where p.id=v_lead.owner_id;
    v_owner_name := coalesce(v_owner_name,'');
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
      values (p_organization_id,v_company_id,v_lead.name,v_lead.job_title,v_lead.phone,v_lead.email,v_lead.decision_role,v_lead.influence_level,'unknown',0,'unknown',v_lead.owner_id,v_owner_name,v_lead.last_contact_at,v_lead.next_action_at,'',true,v_lead.consent_status,v_lead.do_not_contact,v_lead.do_not_contact_reason,array[v_lead.id],v_lead.created_at,v_lead.updated_at)
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

create or replace function public.set_sales_proposal_status(p_organization_id uuid,p_proposal_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_proposal public.sales_proposals; v_now timestamptz:=now(); v_proposal_stage uuid; v_allowed boolean:=false; v_was_official boolean:=false;
begin
  if auth.uid() is null or not public.can_write_organization(p_organization_id) then raise exception 'Acesso negado'; end if;
  if p_status not in ('draft','sent','viewed','accepted','rejected','expired','cancelled') then raise exception 'Status inválido'; end if;
  select * into v_proposal from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id for update;
  if v_proposal.id is null then raise exception 'Proposta não encontrada'; end if;
  if not v_proposal.is_current_version then raise exception 'Altere apenas a revisão vigente'; end if;
  if v_proposal.closed_won_at is not null or exists(select 1 from public.opportunities o where o.id=v_proposal.opportunity_id and (o.status='won' or o.closed_won_at is not null)) then raise exception 'O status de uma proposta vinculada a negócio ganho não pode ser alterado'; end if;
  if v_proposal.status=p_status then return v_proposal.id; end if;
  v_allowed := (v_proposal.status='draft' and p_status in ('sent','cancelled'))
    or (v_proposal.status='sent' and p_status in ('viewed','accepted','rejected','expired','cancelled'))
    or (v_proposal.status='viewed' and p_status in ('accepted','rejected','expired','cancelled'))
    or (v_proposal.status='accepted' and p_status='cancelled');
  if not v_allowed then raise exception 'Transição de status inválida'; end if;
  v_was_official:=v_proposal.is_official;

  if p_status='accepted' then
    perform public.set_official_sales_proposal(p_organization_id,p_proposal_id);
  end if;
  update public.sales_proposals set status=p_status,
    sent_at=case when p_status in ('sent','viewed') then coalesce(sent_at,v_now) else sent_at end,
    viewed_at=case when p_status='viewed' then v_now else viewed_at end,
    accepted_at=case when p_status='accepted' then v_now else accepted_at end,
    rejected_at=case when p_status='rejected' then v_now else rejected_at end,
    is_official=case when p_status in ('rejected','expired','cancelled') then false else is_official end,
    forecast_category=case when p_status='accepted' then 'commit' when p_status in ('rejected','expired','cancelled') then 'omitted' else forecast_category end,
    probability=case when p_status='accepted' then 100 when p_status in ('rejected','expired','cancelled') then 0 else probability end
  where id=p_proposal_id returning * into v_proposal;

  if p_status='sent' then
    select id into v_proposal_stage from public.pipeline_stages where organization_id=p_organization_id and lower(name) like '%proposta%' order by stage_order limit 1;
    if v_proposal_stage is not null then
      update public.leads set stage_id=v_proposal_stage,status='active',updated_at=v_now where id=v_proposal.lead_id and organization_id=p_organization_id and status<>'archived';
      update public.opportunities o set stage_id=v_proposal_stage,status='active',probability=coalesce((select ps.probability from public.pipeline_stages ps where ps.id=v_proposal_stage),o.probability),closed_won_at=null,updated_at=v_now
      where o.id=v_proposal.opportunity_id and o.organization_id=p_organization_id;
    end if;
    insert into public.activities(organization_id,lead_id,activity_type,title,description,completed_at,assigned_to,source_type,source_id)
    values(p_organization_id,v_proposal.lead_id,'note','Proposta enviada — '||v_proposal.proposal_number,v_proposal.title,v_now,v_proposal.owner_id,'system',v_proposal.id::text);
  elsif p_status='accepted' then
    update public.leads set value=v_proposal.total_contract_value,expected_close_at=v_proposal.expected_close_at where id=v_proposal.lead_id;
    update public.opportunities set official_proposal_id=v_proposal.id,value=v_proposal.total_contract_value,expected_close_at=v_proposal.expected_close_at,forecast_category='commit',probability=100 where id=v_proposal.opportunity_id;
    insert into public.activities(organization_id,lead_id,activity_type,title,description,completed_at,assigned_to,source_type,source_id)
    values(p_organization_id,v_proposal.lead_id,'note','Aceite registrado — '||v_proposal.proposal_number,'Aceite comercial registrado. Fechamento e reconhecimento de receita permanecem pendentes.',v_now,v_proposal.owner_id,'system',v_proposal.id::text);
  elsif p_status in ('rejected','expired','cancelled') and v_was_official then
    perform public.reassign_official_sales_proposal_v10044(p_organization_id,v_proposal.lead_id);
  end if;
  return v_proposal.id;
end; $$;

create or replace function public.close_opportunity_from_proposal(p_organization_id uuid,p_proposal_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_proposal public.sales_proposals; v_now timestamptz:=now(); v_won_stage uuid; v_due timestamptz;
begin
  if auth.uid() is null or not public.can_write_organization(p_organization_id) then raise exception 'Acesso negado'; end if;
  select * into v_proposal from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id for update;
  if v_proposal.id is null then raise exception 'Proposta não encontrada'; end if;
  if not v_proposal.is_current_version or not v_proposal.is_official or v_proposal.status<>'accepted' then raise exception 'Aceite e oficialize a revisão vigente antes de fechar'; end if;
  if v_proposal.closed_won_at is not null then return v_proposal.id; end if;
  select id into v_won_stage from public.pipeline_stages where organization_id=p_organization_id and is_won=true order by stage_order limit 1;
  if v_won_stage is null then raise exception 'Configure uma etapa marcada como ganha antes de fechar a oportunidade'; end if;
  update public.sales_proposals set forecast_category='closed',probability=100,closed_won_at=v_now where id=v_proposal.id returning * into v_proposal;
  update public.leads set status='won',stage_id=v_won_stage,value=v_proposal.total_contract_value where id=v_proposal.lead_id;
  update public.opportunities set status='won',stage_id=v_won_stage,value=v_proposal.total_contract_value,forecast_category='closed',probability=100,official_proposal_id=v_proposal.id,closed_won_at=v_now where id=v_proposal.opportunity_id;
  insert into public.activities(organization_id,lead_id,activity_type,title,description,completed_at,assigned_to,source_type,source_id)
  values(p_organization_id,v_proposal.lead_id,'note','Oportunidade ganha — '||v_proposal.proposal_number,'Contrato confirmado. Receita ainda deve ser reconhecida na competência correta.',v_now,v_proposal.owner_id,'system',v_proposal.id::text);
  v_due:=coalesce(v_proposal.post_sale_start_at::timestamptz,v_now);
  insert into public.activities(organization_id,lead_id,activity_type,title,description,due_at,assigned_to,source_type,source_id)
  values(p_organization_id,v_proposal.lead_id,'followup','Iniciar pós-venda — '||coalesce(nullif(v_proposal.post_sale_cadence_name,''),'Onboarding padrão'),'Cadência criada após o fechamento; a data pode ser ajustada.',v_due,v_proposal.owner_id,'system',v_proposal.id::text);
  return v_proposal.id;
end; $$;

create or replace function public.merge_duplicate_leads(
  p_organization_id uuid,
  p_primary_lead_id uuid,
  p_duplicate_lead_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_primary public.leads%rowtype;
  v_duplicate public.leads%rowtype;
  v_primary_opp public.opportunities%rowtype;
  v_duplicate_opp public.opportunities%rowtype;
begin
  if not public.can_write_organization(p_organization_id) then raise exception 'Sem permissão para alterar este workspace.'; end if;
  if p_primary_lead_id = p_duplicate_lead_id then raise exception 'Selecione dois leads diferentes.'; end if;

  select * into v_primary from public.leads where id=p_primary_lead_id and organization_id=p_organization_id for update;
  select * into v_duplicate from public.leads where id=p_duplicate_lead_id and organization_id=p_organization_id for update;
  if v_primary.id is null or v_duplicate.id is null then raise exception 'Lead não encontrado neste workspace.'; end if;
  if v_duplicate.status='won' then raise exception 'O lead duplicado já está ganho. Use-o como registro principal para preservar o histórico.'; end if;

  perform set_config('realtalent.lead_merge','on',true);
  perform set_config('realtalent.proposal_revision','on',true);

  update public.leads set
    company=coalesce(nullif(v_primary.company,''),v_duplicate.company),
    phone=coalesce(nullif(v_primary.phone,''),v_duplicate.phone),
    email=coalesce(nullif(v_primary.email,''),v_duplicate.email),
    city=coalesce(nullif(v_primary.city,''),v_duplicate.city),
    source=coalesce(nullif(v_primary.source,''),v_duplicate.source),
    source_detail=coalesce(nullif(v_primary.source_detail,''),v_duplicate.source_detail),
    source_url=coalesce(nullif(v_primary.source_url,''),v_duplicate.source_url),
    captured_at=coalesce(v_primary.captured_at,v_duplicate.captured_at),
    cnpj=coalesce(nullif(v_primary.cnpj,''),v_duplicate.cnpj),
    website=coalesce(nullif(v_primary.website,''),v_duplicate.website),
    instagram_url=coalesce(nullif(v_primary.instagram_url,''),v_duplicate.instagram_url),
    linkedin_url=coalesce(nullif(v_primary.linkedin_url,''),v_duplicate.linkedin_url),
    facebook_url=coalesce(nullif(v_primary.facebook_url,''),v_duplicate.facebook_url),
    job_title=coalesce(nullif(v_primary.job_title,''),v_duplicate.job_title),
    decision_role=case when v_primary.decision_role='unknown' then v_duplicate.decision_role else v_primary.decision_role end,
    influence_level=greatest(v_primary.influence_level,v_duplicate.influence_level),
    consent_status=case when v_primary.consent_status='unknown' then v_duplicate.consent_status else v_primary.consent_status end,
    do_not_contact=v_primary.do_not_contact or v_duplicate.do_not_contact,
    do_not_contact_reason=coalesce(nullif(v_primary.do_not_contact_reason,''),v_duplicate.do_not_contact_reason),
    owner_id=coalesce(v_primary.owner_id,v_duplicate.owner_id),
    value=greatest(v_primary.value,v_duplicate.value),
    expected_close_at=coalesce(v_primary.expected_close_at,v_duplicate.expected_close_at),
    last_contact_at=case when v_primary.last_contact_at is null then v_duplicate.last_contact_at when v_duplicate.last_contact_at is null then v_primary.last_contact_at else greatest(v_primary.last_contact_at,v_duplicate.last_contact_at) end,
    next_action_at=case when v_primary.next_action_at is null then v_duplicate.next_action_at when v_duplicate.next_action_at is null then v_primary.next_action_at else least(v_primary.next_action_at,v_duplicate.next_action_at) end,
    priority=case when array_position(array['low','medium','high','urgent'],v_duplicate.priority::text)>array_position(array['low','medium','high','urgent'],v_primary.priority::text) then v_duplicate.priority else v_primary.priority end,
    temperature=case when array_position(array['cold','warm','hot'],v_duplicate.temperature::text)>array_position(array['cold','warm','hot'],v_primary.temperature::text) then v_duplicate.temperature else v_primary.temperature end,
    tags=coalesce((select array_agg(distinct tag) from unnest(v_primary.tags||v_duplicate.tags) tag),'{}'::text[]),
    notes=concat_ws(E'\n\n',nullif(trim(v_primary.notes),''),case when trim(v_duplicate.notes)='' then null else 'Conteúdo incorporado de '||v_duplicate.name||E':\n'||trim(v_duplicate.notes) end),
    created_at=least(v_primary.created_at,v_duplicate.created_at),updated_at=now()
  where id=p_primary_lead_id;

  select * into v_primary_opp from public.opportunities where organization_id=p_organization_id and lead_id=p_primary_lead_id for update;
  select * into v_duplicate_opp from public.opportunities where organization_id=p_organization_id and lead_id=p_duplicate_lead_id for update;

  -- Evita colisão do índice de proposta oficial durante a consolidação.
  update public.sales_proposals set is_official=false where organization_id=p_organization_id and lead_id=p_duplicate_lead_id and is_official;

  if v_primary_opp.id is not null and v_duplicate_opp.id is not null then
    update public.sales_proposals set lead_id=p_primary_lead_id,opportunity_id=v_primary_opp.id where organization_id=p_organization_id and opportunity_id=v_duplicate_opp.id;
    update public.revenue_entries set lead_id=p_primary_lead_id,opportunity_id=v_primary_opp.id where organization_id=p_organization_id and opportunity_id=v_duplicate_opp.id;
    update public.opportunities set
      value=greatest(v_primary_opp.value,v_duplicate_opp.value),
      expected_close_at=coalesce(v_primary_opp.expected_close_at,v_duplicate_opp.expected_close_at),
      company_id=coalesce(v_primary_opp.company_id,v_duplicate_opp.company_id),
      primary_contact_id=coalesce(v_primary_opp.primary_contact_id,v_duplicate_opp.primary_contact_id),
      owner_id=coalesce(v_primary_opp.owner_id,v_duplicate_opp.owner_id),
      updated_at=now()
    where id=v_primary_opp.id;
    delete from public.opportunities where id=v_duplicate_opp.id;
  elsif v_primary_opp.id is null and v_duplicate_opp.id is not null then
    update public.opportunities set lead_id=p_primary_lead_id,updated_at=now() where id=v_duplicate_opp.id;
    v_primary_opp:=v_duplicate_opp;
  end if;

  update public.sales_proposals set lead_id=p_primary_lead_id,opportunity_id=coalesce(v_primary_opp.id,opportunity_id) where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.revenue_entries set lead_id=p_primary_lead_id,opportunity_id=coalesce(v_primary_opp.id,opportunity_id) where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.activities set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.calls set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.calendar_events set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.lead_stage_history set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.prospecting_leads set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.prospecting_leads set duplicate_lead_id=p_primary_lead_id where organization_id=p_organization_id and duplicate_lead_id=p_duplicate_lead_id;
  update public.automation_events set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.seller_notifications set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.contact_drafts set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.webhook_deliveries set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.communication_threads set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.communication_events set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.communication_outbox set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  update public.realtalent_connect_call_commands set lead_id=p_primary_lead_id where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;

  update public.companies set lead_ids=(select array_agg(distinct x) from unnest(array_append(array_remove(lead_ids,p_duplicate_lead_id),p_primary_lead_id)) x) where organization_id=p_organization_id and p_duplicate_lead_id=any(lead_ids);
  update public.contacts set lead_ids=(select array_agg(distinct x) from unnest(array_append(array_remove(lead_ids,p_duplicate_lead_id),p_primary_lead_id)) x) where organization_id=p_organization_id and p_duplicate_lead_id=any(lead_ids);

  if v_primary_opp.id is not null then update public.leads set opportunity_id=v_primary_opp.id where id=p_primary_lead_id; end if;
  delete from public.leads where id=p_duplicate_lead_id and organization_id=p_organization_id;

  perform public.sync_commercial_structure(p_organization_id);
  perform public.reassign_official_sales_proposal_v10044(p_organization_id,p_primary_lead_id);
  update public.leads set next_action_at=case
    when (select min(due_at) from public.activities where organization_id=p_organization_id and lead_id=p_primary_lead_id and completed_at is null and due_at is not null) is null then next_action_at
    when next_action_at is null then (select min(due_at) from public.activities where organization_id=p_organization_id and lead_id=p_primary_lead_id and completed_at is null and due_at is not null)
    else least(next_action_at,(select min(due_at) from public.activities where organization_id=p_organization_id and lead_id=p_primary_lead_id and completed_at is null and due_at is not null)) end,
    updated_at=now() where id=p_primary_lead_id;

  insert into public.audit_logs(organization_id,action,entity_type,entity_id,before_data,after_data)
  values(p_organization_id,'lead_merged','lead',p_primary_lead_id::text,jsonb_build_object('duplicateLeadId',p_duplicate_lead_id,'duplicateName',v_duplicate.name),jsonb_build_object('primaryLeadId',p_primary_lead_id,'commercialDataMigrated',true));
  return p_primary_lead_id;
end;
$$;

revoke all on function public.merge_duplicate_leads(uuid,uuid,uuid) from public,anon;
grant execute on function public.merge_duplicate_leads(uuid,uuid,uuid) to authenticated;


revoke all on function public.sync_commercial_structure(uuid) from public,anon;
grant execute on function public.sync_commercial_structure(uuid) to authenticated;
revoke all on function public.set_sales_proposal_status(uuid,uuid,text) from public,anon;
grant execute on function public.set_sales_proposal_status(uuid,uuid,text) to authenticated;
revoke all on function public.close_opportunity_from_proposal(uuid,uuid) from public,anon;
grant execute on function public.close_opportunity_from_proposal(uuid,uuid) to authenticated;

commit;
