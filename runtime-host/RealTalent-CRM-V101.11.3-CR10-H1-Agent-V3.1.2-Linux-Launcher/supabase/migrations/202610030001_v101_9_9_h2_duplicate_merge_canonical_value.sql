begin;

-- V101.9.9-H2 — Duplicate Merge Canonical Value Hotfix
-- Mantém Lead e Opportunity em paridade após merge, inclusive quando a proposta
-- oficial vigente possui total inferior ao maior valor comercial consolidado.

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
  v_consolidated_value numeric:=0;
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

  -- V101.9.9-H2: Opportunity é a fonte canônica de receita. Preserve o maior
  -- valor conhecido ANTES de reatribuir propostas oficiais, pois uma proposta
  -- antiga pode ter total inferior ao valor comercial consolidado do merge.
  v_consolidated_value:=greatest(
    coalesce(v_primary.value,0),
    coalesce(v_duplicate.value,0),
    coalesce(v_primary_opp.value,0),
    coalesce(v_duplicate_opp.value,0)
  );

  -- Evita colisão do índice de proposta oficial durante a consolidação.
  update public.sales_proposals set is_official=false where organization_id=p_organization_id and lead_id=p_duplicate_lead_id and is_official;

  if v_primary_opp.id is not null and v_duplicate_opp.id is not null then
    update public.sales_proposals set lead_id=p_primary_lead_id,opportunity_id=v_primary_opp.id where organization_id=p_organization_id and opportunity_id=v_duplicate_opp.id;
    update public.revenue_entries set lead_id=p_primary_lead_id,opportunity_id=v_primary_opp.id where organization_id=p_organization_id and opportunity_id=v_duplicate_opp.id;
    update public.opportunities set
      value=greatest(coalesce(v_primary_opp.value,0),coalesce(v_duplicate_opp.value,0),v_consolidated_value),
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

  -- Reaplica o piso comercial consolidado depois da proposta oficial. A proposta
  -- pode elevar o negócio, mas não reduzir um valor válido preservado no merge.
  update public.leads
     set value=greatest(coalesce(value,0),v_consolidated_value),updated_at=now()
   where id=p_primary_lead_id and organization_id=p_organization_id;
  update public.opportunities
     set value=greatest(coalesce(value,0),v_consolidated_value),updated_at=now()
   where organization_id=p_organization_id and lead_id=p_primary_lead_id;

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

commit;
