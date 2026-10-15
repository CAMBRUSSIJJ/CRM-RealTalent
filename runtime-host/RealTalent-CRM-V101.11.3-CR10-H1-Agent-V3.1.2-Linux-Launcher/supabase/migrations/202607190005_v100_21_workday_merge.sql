-- RealTalent CRM V100.21 — mesclagem transacional e auditável de duplicados
begin;

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
begin
  if not public.can_write_organization(p_organization_id) then raise exception 'Sem permissão para alterar este workspace.'; end if;
  if p_primary_lead_id = p_duplicate_lead_id then raise exception 'Selecione dois leads diferentes.'; end if;

  select * into v_primary from public.leads where id = p_primary_lead_id and organization_id = p_organization_id for update;
  select * into v_duplicate from public.leads where id = p_duplicate_lead_id and organization_id = p_organization_id for update;
  if v_primary.id is null or v_duplicate.id is null then raise exception 'Lead não encontrado neste workspace.'; end if;

  update public.leads set
    company = coalesce(nullif(v_primary.company, ''), v_duplicate.company),
    phone = coalesce(nullif(v_primary.phone, ''), v_duplicate.phone),
    email = coalesce(nullif(v_primary.email, ''), v_duplicate.email),
    city = coalesce(nullif(v_primary.city, ''), v_duplicate.city),
    source = coalesce(nullif(v_primary.source, ''), v_duplicate.source),
    owner_id = coalesce(v_primary.owner_id, v_duplicate.owner_id),
    value = greatest(v_primary.value, v_duplicate.value),
    next_action_at = case when v_primary.next_action_at is null then v_duplicate.next_action_at when v_duplicate.next_action_at is null then v_primary.next_action_at else least(v_primary.next_action_at, v_duplicate.next_action_at) end,
    priority = case when array_position(array['low','medium','high','urgent'], v_duplicate.priority::text) > array_position(array['low','medium','high','urgent'], v_primary.priority::text) then v_duplicate.priority else v_primary.priority end,
    temperature = case when array_position(array['cold','warm','hot'], v_duplicate.temperature::text) > array_position(array['cold','warm','hot'], v_primary.temperature::text) then v_duplicate.temperature else v_primary.temperature end,
    tags = coalesce((select array_agg(distinct tag) from unnest(v_primary.tags || v_duplicate.tags) tag), '{}'::text[]),
    notes = concat_ws(E'\n\n', nullif(trim(v_primary.notes), ''), case when trim(v_duplicate.notes) = '' then null else 'Conteúdo incorporado de ' || v_duplicate.name || E':\n' || trim(v_duplicate.notes) end),
    created_at = least(v_primary.created_at, v_duplicate.created_at), updated_at = now()
  where id = p_primary_lead_id;

  update public.activities set lead_id = p_primary_lead_id where organization_id = p_organization_id and lead_id = p_duplicate_lead_id;
  update public.calls set lead_id = p_primary_lead_id where organization_id = p_organization_id and lead_id = p_duplicate_lead_id;
  update public.calendar_events set lead_id = p_primary_lead_id where organization_id = p_organization_id and lead_id = p_duplicate_lead_id;
  update public.lead_stage_history set lead_id = p_primary_lead_id where organization_id = p_organization_id and lead_id = p_duplicate_lead_id;
  update public.prospecting_leads set lead_id = p_primary_lead_id where organization_id = p_organization_id and lead_id = p_duplicate_lead_id;
  update public.prospecting_leads set duplicate_lead_id = p_primary_lead_id where organization_id = p_organization_id and duplicate_lead_id = p_duplicate_lead_id;
  delete from public.leads where id = p_duplicate_lead_id and organization_id = p_organization_id;

  update public.leads set next_action_at = case
    when (select min(due_at) from public.activities where organization_id = p_organization_id and lead_id = p_primary_lead_id and completed_at is null and due_at is not null) is null then next_action_at
    when next_action_at is null then (select min(due_at) from public.activities where organization_id = p_organization_id and lead_id = p_primary_lead_id and completed_at is null and due_at is not null)
    else least(next_action_at, (select min(due_at) from public.activities where organization_id = p_organization_id and lead_id = p_primary_lead_id and completed_at is null and due_at is not null))
  end where id = p_primary_lead_id;

  insert into public.audit_logs(organization_id, action, entity_type, entity_id, before_data, after_data)
  values (p_organization_id, 'lead_merged', 'lead', p_primary_lead_id::text, jsonb_build_object('duplicateLeadId', p_duplicate_lead_id, 'duplicateName', v_duplicate.name), jsonb_build_object('primaryLeadId', p_primary_lead_id));
  return p_primary_lead_id;
end;
$$;

revoke all on function public.merge_duplicate_leads(uuid, uuid, uuid) from public, anon;
grant execute on function public.merge_duplicate_leads(uuid, uuid, uuid) to authenticated;

commit;
