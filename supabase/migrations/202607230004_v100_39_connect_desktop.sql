-- RealTalent CRM V100.39.1 — Integração nativa com RealTalent Connect Desktop v1.6
begin;

alter table public.integration_connections drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections add constraint integration_connections_provider_check
  check (provider in ('extension','supabase','whatsapp','instagram','email','google_calendar','outlook','telephony','webhook','google','microsoft','meta','whatsapp_cloud','realtalent_connect'));

create table if not exists public.realtalent_connect_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_key text not null,
  device_name text not null,
  platform text not null default 'windows',
  app_version text not null,
  status text not null default 'connected' check (status in ('connected','paused','revoked','error')),
  last_seen_at timestamptz not null default now(),
  last_sync_at timestamptz,
  pending_items integer not null default 0 check (pending_items >= 0),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, device_key)
);

create index if not exists realtalent_connect_devices_org_status_idx
  on public.realtalent_connect_devices(organization_id,status,last_seen_at desc);
create index if not exists realtalent_connect_devices_user_idx
  on public.realtalent_connect_devices(user_id,last_seen_at desc);

alter table public.realtalent_connect_devices enable row level security;

create policy realtalent_connect_devices_select on public.realtalent_connect_devices
  for select to authenticated
  using (public.is_organization_member(organization_id) and (user_id = auth.uid() or public.is_organization_admin(organization_id)));

create policy realtalent_connect_devices_update on public.realtalent_connect_devices
  for update to authenticated
  using (public.is_organization_member(organization_id) and (user_id = auth.uid() or public.is_organization_admin(organization_id)))
  with check (public.is_organization_member(organization_id) and (user_id = auth.uid() or public.is_organization_admin(organization_id)));

create trigger realtalent_connect_devices_touch before update on public.realtalent_connect_devices
  for each row execute function public.touch_updated_at();

create or replace function public.register_realtalent_connect_device(
  p_organization_id uuid,
  p_device_key text,
  p_device_name text,
  p_platform text,
  p_app_version text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_device public.realtalent_connect_devices; v_user uuid := auth.uid(); v_existing_status text;
begin
  if v_user is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if length(trim(coalesce(p_device_key,''))) < 12 then raise exception 'Identificador de dispositivo inválido'; end if;
  select status into v_existing_status from public.realtalent_connect_devices where organization_id=p_organization_id and device_key=left(trim(p_device_key),180);
  if v_existing_status='revoked' then raise exception 'Este dispositivo foi revogado pelo administrador'; end if;
  if v_existing_status='paused' then raise exception 'Este dispositivo está pausado pelo administrador'; end if;
  insert into public.realtalent_connect_devices(
    organization_id,user_id,device_key,device_name,platform,app_version,status,last_seen_at,last_error,metadata
  ) values (
    p_organization_id,v_user,left(trim(p_device_key),180),left(trim(coalesce(p_device_name,'Computador')),120),
    left(trim(coalesce(p_platform,'windows')),40),left(trim(coalesce(p_app_version,'desconhecida')),40),'connected',now(),null,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(organization_id,device_key) do update set
    user_id=excluded.user_id,device_name=excluded.device_name,platform=excluded.platform,app_version=excluded.app_version,
    status='connected',last_seen_at=now(),last_error=null,metadata=excluded.metadata,updated_at=now()
  returning * into v_device;

  insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,after_data)
  values(p_organization_id,v_user,'connect_device_registered','realtalent_connect_device',v_device.id::text,
    jsonb_build_object('device_name',v_device.device_name,'platform',v_device.platform,'app_version',v_device.app_version));

  return jsonb_build_object(
    'id',v_device.id,'organization_id',v_device.organization_id,'user_id',v_device.user_id,'device_name',v_device.device_name,
    'platform',v_device.platform,'app_version',v_device.app_version,'status',v_device.status,'last_seen_at',v_device.last_seen_at
  );
end; $$;

create or replace function public.heartbeat_realtalent_connect_device(
  p_organization_id uuid,
  p_device_id uuid,
  p_pending_items integer default 0,
  p_last_error text default null
) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_device public.realtalent_connect_devices; v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  update public.realtalent_connect_devices set
    last_seen_at=now(),last_sync_at=case when coalesce(p_pending_items,0)=0 then now() else last_sync_at end,
    pending_items=greatest(coalesce(p_pending_items,0),0),last_error=nullif(trim(coalesce(p_last_error,'')),''),
    status=case when nullif(trim(coalesce(p_last_error,'')),'') is null then 'connected' else 'error' end,updated_at=now()
  where id=p_device_id and organization_id=p_organization_id and status not in ('paused','revoked') and (user_id=v_user or public.is_organization_admin(p_organization_id))
  returning * into v_device;
  if v_device.id is null then raise exception 'Dispositivo não encontrado'; end if;
  return jsonb_build_object('id',v_device.id,'status',v_device.status,'last_seen_at',v_device.last_seen_at,'last_sync_at',v_device.last_sync_at,'pending_items',v_device.pending_items,'last_error',v_device.last_error);
end; $$;

create or replace function public.get_realtalent_connect_queue(
  p_organization_id uuid,
  p_limit integer default 250
) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_user uuid := auth.uid(); v_admin boolean; v_result jsonb;
begin
  if v_user is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  v_admin := public.is_organization_admin(p_organization_id);

  with base as (
    select
      l.id,l.name,l.company,l.phone,l.email,l.city,l.priority,l.temperature,l.status,l.owner_id,l.value,
      l.next_action_at,l.last_contact_at,l.notes,l.tags,l.created_at,l.updated_at,l.stage_id,ps.name as stage_name,coalesce(pr.display_name,'') as owner_name,
      count(c.id)::integer as attempts,
      max(c.ended_at) as last_call_at,
      (
        case l.priority when 'urgent' then 35 when 'high' then 27 when 'medium' then 17 else 7 end +
        case l.temperature when 'hot' then 25 when 'warm' then 15 else 5 end +
        case when l.next_action_at < now() then 25 when l.next_action_at <= now()+interval '24 hours' then 16 when l.next_action_at is null then 8 else 2 end +
        case when l.value >= 10000 then 15 when l.value >= 3000 then 9 when l.value > 0 then 4 else 0 end
      )::integer as lead_score
    from public.leads l
    left join public.pipeline_stages ps on ps.id=l.stage_id and ps.organization_id=l.organization_id
    left join public.profiles pr on pr.id=l.owner_id
    left join public.calls c on c.lead_id=l.id and c.organization_id=l.organization_id
    where l.organization_id=p_organization_id and l.status='active' and trim(coalesce(l.phone,''))<>'' and coalesce(l.do_not_contact,false)=false
      and (v_admin or l.owner_id=v_user or l.owner_id is null)
    group by l.id,ps.name,pr.display_name
  ), ranked as (
    select *, least(100,greatest(0,lead_score)) as score,
      case when next_action_at < now() then 'Retornar agora'
           when next_action_at is null then 'Realizar primeira ligação'
           when next_action_at <= now()+interval '24 hours' then 'Executar próxima ação hoje'
           else 'Preparar próxima abordagem' end as next_best_action,
      array_remove(array[
        case when priority in ('urgent','high') then 'prioridade comercial alta' end,
        case when temperature='hot' then 'lead quente' end,
        case when next_action_at < now() then 'ação vencida' end,
        case when next_action_at is null then 'sem próxima ação' end,
        case when value >= 3000 then 'valor relevante' end
      ],null) as score_reasons
    from base
    order by least(100,greatest(0,lead_score)) desc,coalesce(next_action_at,'9999-12-31'::timestamptz),updated_at desc
    limit greatest(1,least(coalesce(p_limit,250),1000))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'company',company,'phone',phone,'email',email,'city',city,'priority',priority,'temperature',temperature,
    'status',status,'owner_id',owner_id,'owner_name',owner_name,'value',value,'next_action_at',next_action_at,'last_contact_at',last_contact_at,
    'notes',notes,'tags',tags,'stage_id',stage_id,'stage_name',stage_name,'attempts',attempts,'lead_score',score,
    'score_reasons',to_jsonb(score_reasons),'next_best_action',next_best_action,'created_at',created_at,'updated_at',updated_at
  ) order by score desc,coalesce(next_action_at,'9999-12-31'::timestamptz)), '[]'::jsonb) into v_result from ranked;
  return v_result;
end; $$;

revoke all on function public.register_realtalent_connect_device(uuid,text,text,text,text,jsonb) from public,anon;
revoke all on function public.heartbeat_realtalent_connect_device(uuid,uuid,integer,text) from public,anon;
revoke all on function public.get_realtalent_connect_queue(uuid,integer) from public,anon;
grant execute on function public.register_realtalent_connect_device(uuid,text,text,text,text,jsonb) to authenticated;
grant execute on function public.heartbeat_realtalent_connect_device(uuid,uuid,integer,text) to authenticated;
grant execute on function public.get_realtalent_connect_queue(uuid,integer) to authenticated;

comment on table public.realtalent_connect_devices is 'Dispositivos oficiais do RealTalent Connect, isolados por organização e usuário.';
comment on function public.get_realtalent_connect_queue(uuid,integer) is 'Fila oficial de ligações com prioridade, score e próxima melhor ação para o Connect Desktop.';

commit;
