-- RealTalent CRM V100.34 — Motor Comercial Unificado
-- Consolida o resultado da ligação, histórico, próxima ação, Pipeline, Agenda e cadências em uma transação.

begin;

create index if not exists calls_org_lead_started_idx
  on public.calls(organization_id, lead_id, started_at desc);

create or replace function public.register_commercial_call_outcome(
  p_organization_id uuid,
  p_call_id uuid,
  p_lead_id uuid,
  p_outcome text,
  p_duration_seconds integer,
  p_notes text,
  p_transcript text,
  p_recording_path text,
  p_consent_at timestamptz,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_schedule_next boolean,
  p_next_at timestamptz,
  p_meeting_duration_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_lead public.leads;
  v_call public.calls;
  v_stage public.pipeline_stages;
  v_activity_id uuid;
  v_next_activity_id uuid;
  v_event_id uuid;
  v_label text;
  v_requires_next boolean;
  v_existing boolean := false;
  v_now timestamptz := now();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not public.can_write_organization(p_organization_id) then raise exception 'Write permission required'; end if;
  if p_call_id is null then raise exception 'Call id is required'; end if;
  if p_started_at is null then raise exception 'Call start is required'; end if;
  if coalesce(p_duration_seconds, 0) < 0 then raise exception 'Invalid call duration'; end if;

  if p_outcome not in (
    'answered','no_answer','busy','voicemail','callback_requested','interested','meeting_scheduled',
    'proposal_requested','proposal_sent','wrong_person','invalid_number','not_interested','sale_completed','other'
  ) then raise exception 'Invalid call outcome'; end if;

  v_requires_next := p_outcome in (
    'no_answer','busy','voicemail','callback_requested','interested','meeting_scheduled',
    'proposal_requested','proposal_sent','wrong_person'
  );
  if v_requires_next and (not coalesce(p_schedule_next, false) or p_next_at is null) then
    raise exception 'This outcome requires a scheduled next step';
  end if;

  -- Impede duplo clique e reenvio concorrente do mesmo atendimento.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_lead_id::text || ':' || p_started_at::text, 0));

  select * into v_lead
  from public.leads
  where id = p_lead_id and organization_id = p_organization_id
  for update;
  if v_lead.id is null then raise exception 'Lead not found in organization'; end if;

  select * into v_call
  from public.calls
  where organization_id = p_organization_id and (id = p_call_id or (lead_id = p_lead_id and started_at = p_started_at))
  order by created_at
  limit 1;

  if v_call.id is not null then
    v_existing := true;
    select id into v_activity_id from public.activities where organization_id = p_organization_id and source_type = 'call' and source_id = v_call.id::text limit 1;
    select id into v_next_activity_id from public.activities where organization_id = p_organization_id and source_type = 'system' and source_id = ('commercial:' || v_call.id::text || ':next') limit 1;
    select id into v_event_id from public.calendar_events where organization_id = p_organization_id and description like ('%[[CRM_COMMERCIAL_ACTION:' || v_call.id::text || ']]%') limit 1;
    return jsonb_build_object(
      'call_id', v_call.id, 'activity_id', v_activity_id, 'next_activity_id', v_next_activity_id,
      'calendar_event_id', v_event_id, 'lead_id', v_lead.id, 'idempotent', true
    );
  end if;

  v_label := case p_outcome
    when 'answered' then 'Atendeu'
    when 'no_answer' then 'Não atendeu'
    when 'busy' then 'Ocupado'
    when 'voicemail' then 'Caixa postal'
    when 'callback_requested' then 'Pediu retorno'
    when 'interested' then 'Demonstrou interesse'
    when 'meeting_scheduled' then 'Reunião marcada'
    when 'proposal_requested' then 'Solicitou proposta'
    when 'proposal_sent' then 'Proposta enviada'
    when 'wrong_person' then 'Pessoa errada'
    when 'invalid_number' then 'Número inválido'
    when 'not_interested' then 'Sem interesse'
    when 'sale_completed' then 'Venda concluída'
    else 'Outro resultado'
  end;

  insert into public.calls(
    id, organization_id, lead_id, user_id, outcome, duration_seconds, notes, transcript, recording_path,
    consent_at, consent_text, consent_by, started_at, ended_at
  ) values (
    p_call_id, p_organization_id, p_lead_id, v_user, p_outcome, greatest(coalesce(p_duration_seconds,0),0),
    coalesce(p_notes,''), coalesce(p_transcript,''), p_recording_path,
    p_consent_at, case when p_recording_path is not null then 'O participante foi informado e consentiu com a gravação.' else null end,
    case when p_recording_path is not null then v_user else null end, p_started_at, p_ended_at
  ) returning * into v_call;

  insert into public.activities(
    organization_id, lead_id, activity_type, title, description, due_at, completed_at, assigned_to, source_type, source_id
  ) values (
    p_organization_id, p_lead_id, 'call', 'Ligação — ' || v_label, coalesce(p_notes,''), p_started_at,
    coalesce(p_ended_at,p_started_at), v_user, 'call', v_call.id::text
  ) returning id into v_activity_id;

  -- Pausa ou encerra pendências da prospecção conforme o resultado.
  if p_outcome = 'invalid_number' then
    update public.activities set completed_at = v_now
    where organization_id = p_organization_id and lead_id = p_lead_id and completed_at is null and activity_type = 'call';
  elsif p_outcome in ('meeting_scheduled','not_interested','sale_completed') then
    update public.activities set completed_at = v_now
    where organization_id = p_organization_id and lead_id = p_lead_id and completed_at is null and activity_type in ('call','followup');
  end if;

  if p_outcome = 'invalid_number' and not ('telefone-invalido' = any(coalesce(v_lead.tags,'{}'::text[]))) then
    v_lead.tags := array_append(coalesce(v_lead.tags,'{}'::text[]), 'telefone-invalido');
  elsif p_outcome = 'wrong_person' and not ('buscar-decisor' = any(coalesce(v_lead.tags,'{}'::text[]))) then
    v_lead.tags := array_append(coalesce(v_lead.tags,'{}'::text[]), 'buscar-decisor');
  end if;

  if p_outcome in ('proposal_requested','proposal_sent') then
    select * into v_stage from public.pipeline_stages
    where organization_id = p_organization_id and lower(name) like '%proposta%'
    order by stage_order limit 1;
  elsif p_outcome = 'sale_completed' then
    select * into v_stage from public.pipeline_stages
    where organization_id = p_organization_id and is_won = true
    order by stage_order limit 1;
  elsif p_outcome = 'not_interested' then
    select * into v_stage from public.pipeline_stages
    where organization_id = p_organization_id and is_lost = true
    order by stage_order limit 1;
  end if;

  if v_stage.id is not null and v_stage.id is distinct from v_lead.stage_id then
    update public.leads
    set stage_id = v_stage.id,
        status = case when v_stage.is_won then 'won' when v_stage.is_lost then 'lost' else 'active' end,
        tags = v_lead.tags,
        last_contact_at = greatest(coalesce(last_contact_at,'-infinity'::timestamptz), coalesce(p_ended_at,p_started_at)),
        updated_at = v_now
    where id = p_lead_id
    returning * into v_lead;

    insert into public.activities(
      organization_id, lead_id, activity_type, title, description, completed_at, assigned_to, source_type, source_id
    ) values (
      p_organization_id, p_lead_id, 'stage_change', 'Lead movido para ' || v_stage.name,
      'Movimentação automática pelo resultado “' || v_label || '”.', v_now, v_user, 'system', 'commercial:' || v_call.id::text || ':stage'
    );
  else
    update public.leads
    set status = case when p_outcome = 'sale_completed' then 'won' when p_outcome = 'not_interested' then 'lost' else status end,
        tags = v_lead.tags,
        last_contact_at = greatest(coalesce(last_contact_at,'-infinity'::timestamptz), coalesce(p_ended_at,p_started_at)),
        updated_at = v_now
    where id = p_lead_id
    returning * into v_lead;
  end if;

  if coalesce(p_schedule_next,false) and p_next_at is not null and p_outcome = 'meeting_scheduled' then
    insert into public.calendar_events(
      organization_id, lead_id, title, description, starts_at, ends_at, all_day, location, status, assigned_to
    ) values (
      p_organization_id, p_lead_id, 'Reunião — ' || v_lead.name,
      trim(coalesce(p_notes,'') || E'\n[[CRM_COMMERCIAL_ACTION:' || v_call.id::text || ']]'),
      p_next_at, p_next_at + make_interval(mins => greatest(15,coalesce(p_meeting_duration_minutes,30))), false, '', 'confirmed', v_user
    ) returning id into v_event_id;

    insert into public.activities(
      organization_id, lead_id, activity_type, title, description, due_at, completed_at, assigned_to, source_type, source_id
    ) select organization_id, lead_id, 'meeting', title, description, starts_at, null, assigned_to, 'calendar', id::text
      from public.calendar_events where id = v_event_id
    returning id into v_next_activity_id;
  elsif coalesce(p_schedule_next,false) and p_next_at is not null and p_outcome not in ('not_interested','sale_completed','invalid_number') then
    insert into public.activities(
      organization_id, lead_id, activity_type, title, description, due_at, completed_at, assigned_to, source_type, source_id
    ) values (
      p_organization_id, p_lead_id, 'call', 'Próxima ligação — ' || v_lead.name,
      trim(v_label || '. ' || coalesce(p_notes,'')), p_next_at, null, v_user, 'system', 'commercial:' || v_call.id::text || ':next'
    ) returning id into v_next_activity_id;
  end if;

  perform public.refresh_lead_next_action(p_lead_id);
  select * into v_lead from public.leads where id = p_lead_id;

  insert into public.audit_logs(organization_id, user_id, action, entity_type, entity_id, after_data)
  values (
    p_organization_id, v_user, 'commercial_call_registered', 'call', v_call.id::text,
    jsonb_build_object('outcome',p_outcome,'next_activity_id',v_next_activity_id,'calendar_event_id',v_event_id,'lead_status',v_lead.status,'stage_id',v_lead.stage_id)
  );

  return jsonb_build_object(
    'call_id', v_call.id, 'activity_id', v_activity_id, 'next_activity_id', v_next_activity_id,
    'calendar_event_id', v_event_id, 'lead_id', v_lead.id, 'idempotent', v_existing
  );
end;
$$;


create or replace function public.register_commercial_activity_outcome(
  p_organization_id uuid,
  p_activity_id uuid,
  p_outcome text,
  p_result_title text,
  p_result_description text,
  p_create_next boolean,
  p_next_type text,
  p_next_title text,
  p_next_description text,
  p_next_at timestamptz,
  p_stage_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_activity public.activities;
  v_lead public.leads;
  v_stage public.pipeline_stages;
  v_result_activity_id uuid;
  v_next_activity_id uuid;
  v_now timestamptz := now();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not public.can_write_organization(p_organization_id) then raise exception 'Write permission required'; end if;
  if p_outcome not in ('answered','no_response','callback_requested','interested','proposal_requested','meeting_scheduled','not_decision_maker','invalid_contact','not_interested','won','lost') then
    raise exception 'Invalid commercial activity outcome';
  end if;
  if coalesce(p_create_next,false) and (p_next_type is null or trim(coalesce(p_next_title,'')) = '' or p_next_at is null) then
    raise exception 'A complete next step is required';
  end if;
  if p_next_type is not null and p_next_type not in ('call','followup','meeting','note','stage_change') then
    raise exception 'Invalid next activity type';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':activity:' || p_activity_id::text, 0));

  select * into v_activity from public.activities
  where id = p_activity_id and organization_id = p_organization_id
  for update;
  if v_activity.id is null then raise exception 'Activity not found'; end if;
  if v_activity.lead_id is null then raise exception 'Activity must be linked to a lead'; end if;

  select * into v_lead from public.leads
  where id = v_activity.lead_id and organization_id = p_organization_id
  for update;
  if v_lead.id is null then raise exception 'Lead not found'; end if;

  select id into v_result_activity_id from public.activities
  where organization_id = p_organization_id and source_type = 'system' and source_id = ('commercial:' || p_activity_id::text || ':result')
  limit 1;
  if v_result_activity_id is not null then
    select id into v_next_activity_id from public.activities
    where organization_id = p_organization_id and source_type = 'system' and source_id = ('commercial:' || p_activity_id::text || ':next')
    limit 1;
    return jsonb_build_object('activity_id',v_activity.id,'lead_id',v_lead.id,'result_activity_id',v_result_activity_id,'next_activity_id',v_next_activity_id,'idempotent',true);
  end if;

  update public.activities set completed_at = v_now where id = v_activity.id returning * into v_activity;

  if p_outcome = 'invalid_contact' then
    update public.activities set completed_at = v_now
    where organization_id = p_organization_id and lead_id = v_lead.id and completed_at is null and activity_type = 'call';
  elsif p_outcome in ('meeting_scheduled','not_interested','won','lost') then
    update public.activities set completed_at = v_now
    where organization_id = p_organization_id and lead_id = v_lead.id and completed_at is null and activity_type in ('call','followup');
  end if;

  insert into public.activities(
    organization_id, lead_id, activity_type, title, description, completed_at, assigned_to, source_type, source_id
  ) values (
    p_organization_id, v_lead.id, 'note', trim(p_result_title), coalesce(p_result_description,''), v_now,
    coalesce(v_user,v_activity.assigned_to), 'system', 'commercial:' || p_activity_id::text || ':result'
  ) returning id into v_result_activity_id;

  if p_stage_id is not null and p_stage_id is distinct from v_lead.stage_id then
    select * into v_stage from public.pipeline_stages where id = p_stage_id and organization_id = p_organization_id;
    if v_stage.id is null then raise exception 'Invalid stage for organization'; end if;
    update public.leads set
      stage_id = v_stage.id,
      status = case when v_stage.is_won then 'won' when v_stage.is_lost then 'lost' else 'active' end,
      last_contact_at = greatest(coalesce(last_contact_at,'-infinity'::timestamptz),v_now),
      updated_at = v_now
    where id = v_lead.id returning * into v_lead;
    insert into public.activities(organization_id,lead_id,activity_type,title,description,completed_at,assigned_to,source_type,source_id)
    values (p_organization_id,v_lead.id,'stage_change','Lead movido para ' || v_stage.name,'Movimentação automática após “' || trim(p_result_title) || '”.',v_now,v_user,'system','commercial:' || p_activity_id::text || ':stage');
  else
    update public.leads set
      status = case when p_outcome = 'won' then 'won' when p_outcome in ('lost','not_interested') then 'lost' else status end,
      tags = case
        when p_outcome = 'invalid_contact' and not ('telefone-invalido' = any(coalesce(tags,'{}'::text[]))) then array_append(coalesce(tags,'{}'::text[]),'telefone-invalido')
        when p_outcome = 'not_decision_maker' and not ('buscar-decisor' = any(coalesce(tags,'{}'::text[]))) then array_append(coalesce(tags,'{}'::text[]),'buscar-decisor')
        else tags end,
      last_contact_at = greatest(coalesce(last_contact_at,'-infinity'::timestamptz),v_now),
      updated_at = v_now
    where id = v_lead.id returning * into v_lead;
  end if;

  if coalesce(p_create_next,false) then
    insert into public.activities(
      organization_id,lead_id,activity_type,title,description,due_at,completed_at,assigned_to,source_type,source_id
    ) values (
      p_organization_id,v_lead.id,p_next_type,trim(p_next_title),coalesce(p_next_description,''),p_next_at,null,
      coalesce(v_user,v_activity.assigned_to),'system','commercial:' || p_activity_id::text || ':next'
    ) returning id into v_next_activity_id;
  end if;

  perform public.refresh_lead_next_action(v_lead.id);
  select * into v_lead from public.leads where id = v_lead.id;
  insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,after_data)
  values (p_organization_id,v_user,'commercial_activity_result_registered','activity',p_activity_id::text,jsonb_build_object('outcome',p_outcome,'next_activity_id',v_next_activity_id,'stage_id',v_lead.stage_id,'status',v_lead.status));

  return jsonb_build_object('activity_id',v_activity.id,'lead_id',v_lead.id,'result_activity_id',v_result_activity_id,'next_activity_id',v_next_activity_id,'idempotent',false);
end;
$$;

revoke all on function public.register_commercial_activity_outcome(uuid,uuid,text,text,text,boolean,text,text,text,timestamptz,uuid) from public;
grant execute on function public.register_commercial_activity_outcome(uuid,uuid,text,text,text,boolean,text,text,text,timestamptz,uuid) to authenticated;

revoke all on function public.register_commercial_call_outcome(uuid,uuid,uuid,text,integer,text,text,text,timestamptz,timestamptz,timestamptz,boolean,timestamptz,integer) from public;
grant execute on function public.register_commercial_call_outcome(uuid,uuid,uuid,text,integer,text,text,text,timestamptz,timestamptz,timestamptz,boolean,timestamptz,integer) to authenticated;

commit;
