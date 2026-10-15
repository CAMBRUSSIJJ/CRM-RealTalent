-- RealTalent CRM V101.8.4 — Official Communications
-- Fecha o vínculo de mensagens oficiais com ContactRecord/Lead e melhora a caixa omnichannel.
begin;

alter table public.communication_events
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

alter table public.communication_threads
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists communication_events_org_contact_time_idx
  on public.communication_events(organization_id, contact_id, occurred_at desc);
create index if not exists communication_threads_org_contact_channel_idx
  on public.communication_threads(organization_id, contact_id, channel, updated_at desc);

create or replace function public.upsert_inbound_communication(
  p_organization_id uuid,p_account_id uuid,p_channel text,p_external_message_id text,p_sender text,p_recipients text[],p_subject text,p_body text,p_occurred_at timestamptz,p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_lead_id uuid;
  v_contact_id uuid;
  v_thread_id uuid;
  v_event_id uuid;
  v_sender_digits text;
  v_contact_lead_ids uuid[];
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required'; end if;
  if p_channel not in ('email','whatsapp','calendar') then raise exception 'Canal inválido'; end if;
  if not exists(select 1 from public.integration_connected_accounts where id=p_account_id and organization_id=p_organization_id) then raise exception 'Conta inválida'; end if;

  if p_channel='email' then
    select id into v_lead_id
      from public.leads
     where organization_id=p_organization_id and lower(email)=lower(trim(p_sender))
     order by updated_at desc limit 1;

    select id, lead_ids into v_contact_id, v_contact_lead_ids
      from public.contacts
     where organization_id=p_organization_id and lower(email)=lower(trim(p_sender))
     order by updated_at desc limit 1;
  elsif p_channel='whatsapp' then
    v_sender_digits:=regexp_replace(coalesce(p_sender,''),'\D','','g');
    select id into v_lead_id
      from public.leads
     where organization_id=p_organization_id
       and right(regexp_replace(coalesce(phone,''),'\D','','g'),11)=right(v_sender_digits,11)
     order by updated_at desc limit 1;

    select id, lead_ids into v_contact_id, v_contact_lead_ids
      from public.contacts
     where organization_id=p_organization_id
       and right(regexp_replace(coalesce(phone,''),'\D','','g'),11)=right(v_sender_digits,11)
     order by updated_at desc limit 1;
  end if;

  if v_lead_id is null and v_contact_id is not null then
    select l.id into v_lead_id
      from public.leads l
     where l.organization_id=p_organization_id
       and l.id = any(coalesce(v_contact_lead_ids,'{}'::uuid[]))
     order by l.updated_at desc limit 1;
  end if;

  if v_lead_id is null and v_contact_id is not null then
    select o.lead_id into v_lead_id
      from public.opportunities o
     where o.organization_id=p_organization_id and o.primary_contact_id=v_contact_id
     order by o.updated_at desc limit 1;
  end if;

  select id into v_event_id
    from public.communication_events
   where organization_id=p_organization_id and channel=p_channel and external_message_id=p_external_message_id;
  if v_event_id is not null then
    update public.communication_events
       set lead_id=coalesce(lead_id,v_lead_id), contact_id=coalesce(contact_id,v_contact_id)
     where id=v_event_id;
    return v_event_id;
  end if;

  select id into v_thread_id
    from public.communication_threads
   where organization_id=p_organization_id and account_id=p_account_id and channel=p_channel
     and ((v_lead_id is null and lead_id is null) or lead_id=v_lead_id)
     and ((v_contact_id is null and contact_id is null) or contact_id=v_contact_id)
     and status='open'
   order by updated_at desc limit 1;

  if v_thread_id is null then
    insert into public.communication_threads(organization_id,lead_id,contact_id,account_id,channel,external_thread_id,subject,last_message_at)
    values(p_organization_id,v_lead_id,v_contact_id,p_account_id,p_channel,null,left(coalesce(p_subject,''),300),coalesce(p_occurred_at,now()))
    returning id into v_thread_id;
  end if;

  insert into public.communication_events(organization_id,thread_id,lead_id,contact_id,account_id,channel,direction,event_type,status,external_message_id,sender_address,recipient_addresses,subject,body_text,occurred_at,metadata)
  values(p_organization_id,v_thread_id,v_lead_id,v_contact_id,p_account_id,p_channel,'inbound',case when p_channel='email' then 'email' when p_channel='calendar' then 'calendar_event' else 'message' end,'received',left(p_external_message_id,500),left(coalesce(p_sender,''),320),coalesce(p_recipients,'{}'),left(coalesce(p_subject,''),500),left(coalesce(p_body,''),50000),coalesce(p_occurred_at,now()),coalesce(p_metadata,'{}'))
  returning id into v_event_id;

  update public.communication_threads
     set last_message_at=coalesce(p_occurred_at,now()), lead_id=coalesce(lead_id,v_lead_id), contact_id=coalesce(contact_id,v_contact_id), updated_at=now()
   where id=v_thread_id;
  return v_event_id;
end; $$;

revoke all on function public.upsert_inbound_communication(uuid,uuid,text,text,text,text[],text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.upsert_inbound_communication(uuid,uuid,text,text,text,text[],text,text,timestamptz,jsonb) to service_role;

comment on column public.communication_events.contact_id is 'Pessoa estruturada vinculada à mensagem quando o remetente/destinatário pode ser resolvido.';
comment on column public.communication_threads.contact_id is 'Pessoa estruturada principal da conversa, quando conhecida.';

commit;
