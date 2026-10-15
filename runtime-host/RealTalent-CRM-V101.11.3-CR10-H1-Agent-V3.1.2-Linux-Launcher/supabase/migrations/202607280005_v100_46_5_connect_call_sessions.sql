-- RealTalent CRM V100.46.5 — Central de Ligações Profissional e comandos do RealTalent Connect
begin;

create table if not exists public.realtalent_connect_call_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.realtalent_connect_devices(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  phone text not null,
  lead_name text not null default '',
  status text not null default 'queued' check (status in ('queued','claimed','dialing','connected','completed','failed','cancelled','expired')),
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists realtalent_connect_call_commands_device_idx
  on public.realtalent_connect_call_commands(device_id,status,requested_at);
create index if not exists realtalent_connect_call_commands_org_idx
  on public.realtalent_connect_call_commands(organization_id,requested_by,requested_at desc);
create unique index if not exists realtalent_connect_call_commands_active_unique
  on public.realtalent_connect_call_commands(device_id)
  where status in ('queued','claimed','dialing','connected');

alter table public.realtalent_connect_call_commands enable row level security;

drop policy if exists realtalent_connect_call_commands_select on public.realtalent_connect_call_commands;
create policy realtalent_connect_call_commands_select on public.realtalent_connect_call_commands
  for select to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      requested_by = auth.uid()
      or public.is_organization_admin(organization_id)
      or exists (
        select 1 from public.realtalent_connect_devices d
        where d.id=device_id and d.organization_id=organization_id and d.user_id=auth.uid()
      )
    )
  );

revoke insert,update,delete on public.realtalent_connect_call_commands from authenticated;

create trigger realtalent_connect_call_commands_touch before update on public.realtalent_connect_call_commands
  for each row execute function public.touch_updated_at();

create or replace function public.enqueue_realtalent_connect_call(
  p_organization_id uuid,
  p_device_id uuid,
  p_lead_id uuid,
  p_phone text,
  p_lead_name text default '',
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_device public.realtalent_connect_devices;
  v_command public.realtalent_connect_call_commands;
  v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');
begin
  if v_user is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if length(v_phone) < 8 then raise exception 'Telefone inválido'; end if;

  select * into v_device from public.realtalent_connect_devices
   where id=p_device_id and organization_id=p_organization_id;
  if v_device.id is null then raise exception 'Dispositivo não encontrado'; end if;
  if v_device.user_id<>v_user and not public.is_organization_admin(p_organization_id) then raise exception 'Este dispositivo pertence a outro usuário'; end if;
  if v_device.status<>'connected' then raise exception 'O dispositivo não está conectado'; end if;
  if v_device.last_seen_at < now()-interval '3 minutes' then raise exception 'O dispositivo está offline ou sem heartbeat recente'; end if;

  update public.realtalent_connect_call_commands
     set status='expired', ended_at=now(), failure_reason='Substituído por uma nova solicitação', updated_at=now()
   where device_id=p_device_id and status in ('queued','claimed','dialing') and expires_at<=now();

  if exists(select 1 from public.realtalent_connect_call_commands where device_id=p_device_id and status in ('queued','claimed','dialing','connected')) then
    raise exception 'O dispositivo já possui uma chamada ativa';
  end if;

  insert into public.realtalent_connect_call_commands(
    organization_id,device_id,requested_by,lead_id,phone,lead_name,status,metadata
  ) values (
    p_organization_id,p_device_id,v_user,p_lead_id,v_phone,left(trim(coalesce(p_lead_name,'')),160),'queued',coalesce(p_metadata,'{}'::jsonb)
  ) returning * into v_command;

  update public.realtalent_connect_devices
     set pending_items=pending_items+1,updated_at=now()
   where id=p_device_id;

  insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,after_data)
  values(p_organization_id,v_user,'connect_call_queued','realtalent_connect_call_command',v_command.id::text,
    jsonb_build_object('device_id',p_device_id,'lead_id',p_lead_id,'phone_tail',right(v_phone,4)));

  return jsonb_build_object(
    'id',v_command.id,'device_id',v_command.device_id,'status',v_command.status,
    'requested_at',v_command.requested_at,'expires_at',v_command.expires_at
  );
end; $$;

create or replace function public.claim_realtalent_connect_call_commands(
  p_organization_id uuid,
  p_device_id uuid,
  p_limit integer default 5
) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_device public.realtalent_connect_devices;
  v_result jsonb;
begin
  if v_user is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  select * into v_device from public.realtalent_connect_devices where id=p_device_id and organization_id=p_organization_id;
  if v_device.id is null or (v_device.user_id<>v_user and not public.is_organization_admin(p_organization_id)) then raise exception 'Dispositivo não autorizado'; end if;
  if v_device.status<>'connected' then raise exception 'Dispositivo indisponível'; end if;

  update public.realtalent_connect_call_commands
     set status='expired',ended_at=now(),failure_reason='Tempo de coleta excedido',updated_at=now()
   where device_id=p_device_id and status='queued' and expires_at<=now();

  with claimed as (
    select id from public.realtalent_connect_call_commands
     where device_id=p_device_id and organization_id=p_organization_id and status='queued' and expires_at>now()
     order by requested_at
     for update skip locked
     limit greatest(1,least(coalesce(p_limit,5),20))
  ), updated as (
    update public.realtalent_connect_call_commands c
       set status='claimed',claimed_at=now(),updated_at=now()
      from claimed
     where c.id=claimed.id
     returning c.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'lead_id',lead_id,'phone',phone,'lead_name',lead_name,'status',status,
    'requested_at',requested_at,'expires_at',expires_at,'metadata',metadata
  ) order by requested_at),'[]'::jsonb) into v_result from updated;

  update public.realtalent_connect_devices set
    last_seen_at=now(),pending_items=(select count(*) from public.realtalent_connect_call_commands where device_id=p_device_id and status in ('queued','claimed','dialing','connected')),updated_at=now()
  where id=p_device_id;

  return v_result;
end; $$;

create or replace function public.update_realtalent_connect_call_command(
  p_organization_id uuid,
  p_device_id uuid,
  p_command_id uuid,
  p_status text,
  p_failure_reason text default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_device public.realtalent_connect_devices;
  v_command public.realtalent_connect_call_commands;
begin
  if v_user is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if p_status not in ('claimed','dialing','connected','completed','failed','cancelled') then raise exception 'Status inválido'; end if;
  select * into v_device from public.realtalent_connect_devices where id=p_device_id and organization_id=p_organization_id;
  if v_device.id is null or (v_device.user_id<>v_user and not public.is_organization_admin(p_organization_id)) then raise exception 'Dispositivo não autorizado'; end if;

  update public.realtalent_connect_call_commands set
    status=p_status,
    claimed_at=case when p_status='claimed' then coalesce(claimed_at,now()) else claimed_at end,
    started_at=case when p_status in ('dialing','connected') then coalesce(started_at,now()) else started_at end,
    ended_at=case when p_status in ('completed','failed','cancelled') then now() else ended_at end,
    failure_reason=nullif(trim(coalesce(p_failure_reason,'')),''),
    metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),
    updated_at=now()
  where id=p_command_id and organization_id=p_organization_id and device_id=p_device_id
  returning * into v_command;
  if v_command.id is null then raise exception 'Comando não encontrado'; end if;

  update public.realtalent_connect_devices set
    last_seen_at=now(),last_sync_at=case when p_status in ('completed','failed','cancelled') then now() else last_sync_at end,
    pending_items=(select count(*) from public.realtalent_connect_call_commands where device_id=p_device_id and status in ('queued','claimed','dialing','connected')),
    last_error=case when p_status='failed' then v_command.failure_reason else null end,
    updated_at=now()
  where id=p_device_id;

  return jsonb_build_object('id',v_command.id,'status',v_command.status,'started_at',v_command.started_at,'ended_at',v_command.ended_at,'failure_reason',v_command.failure_reason,'metadata',v_command.metadata);
end; $$;

revoke all on function public.enqueue_realtalent_connect_call(uuid,uuid,uuid,text,text,jsonb) from public,anon;
revoke all on function public.claim_realtalent_connect_call_commands(uuid,uuid,integer) from public,anon;
revoke all on function public.update_realtalent_connect_call_command(uuid,uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.enqueue_realtalent_connect_call(uuid,uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.claim_realtalent_connect_call_commands(uuid,uuid,integer) to authenticated;
grant execute on function public.update_realtalent_connect_call_command(uuid,uuid,uuid,text,text,jsonb) to authenticated;

comment on table public.realtalent_connect_call_commands is 'Comandos de chamada entre o CRM e o RealTalent Connect, isolados por organização, usuário e dispositivo.';
comment on function public.enqueue_realtalent_connect_call(uuid,uuid,uuid,text,text,jsonb) is 'Coloca uma chamada na fila do RealTalent Connect e impede duas chamadas simultâneas no mesmo dispositivo.';

commit;
