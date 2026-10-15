-- RealTalent CRM V100.84 — Calendar Integration 2.0
begin;

create or replace function public.update_calendar_integration_settings(
  p_organization_id uuid,
  p_account_id uuid,
  p_calendar_id text,
  p_calendar_name text default '',
  p_sync_direction text default 'two_way',
  p_sync_enabled boolean default true
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account public.integration_connected_accounts; v_metadata jsonb; v_previous_calendar text;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if p_sync_direction not in ('two_way','crm_to_provider','provider_to_crm') then raise exception 'Direção de sincronização inválida'; end if;
  select * into v_account from public.integration_connected_accounts where id=p_account_id and organization_id=p_organization_id and provider in ('google','microsoft');
  if v_account.id is null then raise exception 'Conta de calendário não encontrada'; end if;
  if not public.is_organization_admin(p_organization_id) and v_account.connected_by_user_id is distinct from auth.uid() then raise exception 'Somente o proprietário da conta ou um administrador pode alterar o calendário'; end if;
  if length(trim(coalesce(p_calendar_id,'')))=0 or length(p_calendar_id)>1000 then raise exception 'Calendário inválido'; end if;
  v_previous_calendar := coalesce(v_account.metadata->>'calendar_id', case when v_account.provider='google' then 'primary' else 'default' end);
  v_metadata := coalesce(v_account.metadata,'{}'::jsonb) || jsonb_build_object(
    'calendar_id', left(trim(p_calendar_id),1000),
    'calendar_name', left(trim(coalesce(p_calendar_name,'')),300),
    'calendar_sync_direction', p_sync_direction,
    'calendar_sync_enabled', coalesce(p_sync_enabled,true),
    'calendar_settings_updated_at', now()
  );
  update public.integration_connected_accounts set metadata=v_metadata, updated_at=now() where id=p_account_id;
  if v_previous_calendar is distinct from trim(p_calendar_id) then
    update public.communication_subscriptions
      set sync_cursor=null, cursor_kind=null, status=case when status='active' then 'renewal_required' else status end,
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('calendar_changed_at',now(),'previous_calendar_id',v_previous_calendar), updated_at=now()
      where account_id=p_account_id and resource_type=case when v_account.provider='google' then 'google_calendar' else 'outlook_calendar' end;
  end if;
  insert into public.integration_audit_events(organization_id,account_id,provider,event_type,severity,actor_user_id,message,metadata)
  values(p_organization_id,p_account_id,v_account.provider,'calendar_settings_updated','info',auth.uid(),'Configuração de calendário externo atualizada',jsonb_build_object('calendar_id',left(trim(p_calendar_id),1000),'sync_direction',p_sync_direction,'sync_enabled',p_sync_enabled));
  return v_metadata;
end; $$;

create or replace function public.enqueue_calendar_backfill(
  p_organization_id uuid,
  p_account_id uuid,
  p_limit integer default 200
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account public.integration_connected_accounts; v_event record; v_count integer:=0; v_job_type text; v_limit integer;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  select * into v_account from public.integration_connected_accounts where id=p_account_id and organization_id=p_organization_id and provider in ('google','microsoft') and status='connected' and has_credential=true;
  if v_account.id is null or not public.can_use_integration_account(p_account_id) then raise exception 'Conta de calendário indisponível'; end if;
  if coalesce((v_account.metadata->>'calendar_sync_enabled')::boolean,true)=false then raise exception 'A sincronização desta conta está desativada'; end if;
  if coalesce(v_account.metadata->>'calendar_sync_direction','two_way')='provider_to_crm' then raise exception 'Esta conta está configurada somente para receber eventos externos'; end if;
  v_job_type:=case when v_account.provider='google' then 'google_calendar_push' else 'microsoft_calendar_push' end;
  v_limit:=greatest(1,least(coalesce(p_limit,200),500));
  for v_event in
    select e.* from public.calendar_events e
    where e.organization_id=p_organization_id and e.status<>'cancelled'
      and not exists(select 1 from public.calendar_external_links l where l.event_id=e.id and l.account_id=p_account_id)
    order by e.updated_at desc limit v_limit
  loop
    perform public.enqueue_integration_sync_job(
      p_organization_id,p_account_id,v_job_type,
      'calendar-backfill:'||p_account_id||':'||v_event.id||':'||extract(epoch from v_event.updated_at)::bigint,
      jsonb_build_object('eventId',v_event.id,'mutation','create','eventVersion',v_event.updated_at,'source','calendar_backfill')
    );
    v_count:=v_count+1;
  end loop;
  insert into public.integration_audit_events(organization_id,account_id,provider,event_type,severity,actor_user_id,message,metadata)
  values(p_organization_id,p_account_id,v_account.provider,'calendar_backfill_queued','info',auth.uid(),'Publicação inicial da agenda local enfileirada',jsonb_build_object('queued',v_count));
  return v_count;
end; $$;

revoke all on function public.update_calendar_integration_settings(uuid,uuid,text,text,text,boolean) from public,anon;
revoke all on function public.enqueue_calendar_backfill(uuid,uuid,integer) from public,anon;
grant execute on function public.update_calendar_integration_settings(uuid,uuid,text,text,text,boolean) to authenticated;
grant execute on function public.enqueue_calendar_backfill(uuid,uuid,integer) to authenticated;

comment on function public.update_calendar_integration_settings(uuid,uuid,text,text,text,boolean) is 'Configura calendário alvo e direção da sincronização Google/Microsoft.';
comment on function public.enqueue_calendar_backfill(uuid,uuid,integer) is 'Enfileira eventos locais ainda não vinculados para publicação no calendário externo.';

commit;
