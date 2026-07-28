-- RealTalent CRM V100.45 — Fundação de Integrações
-- Fonte única, acesso por conta, PKCE/estado de uso único, filas com lease e diagnóstico operacional.
begin;

alter table public.integration_connected_accounts
  add column if not exists access_mode text not null default 'personal',
  add column if not exists allowed_user_ids uuid[] not null default '{}',
  add column if not exists allowed_roles text[] not null default '{}',
  add column if not exists capabilities jsonb not null default '{}'::jsonb,
  add column if not exists connection_mode text not null default 'live',
  add column if not exists credential_version integer not null default 0,
  add column if not exists token_refreshed_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_test_status text,
  add column if not exists last_test_latency_ms integer;

alter table public.integration_connected_accounts drop constraint if exists integration_connected_accounts_access_mode_check;
alter table public.integration_connected_accounts add constraint integration_connected_accounts_access_mode_check
  check (access_mode in ('personal','shared','organization','restricted'));
alter table public.integration_connected_accounts drop constraint if exists integration_connected_accounts_connection_mode_check;
alter table public.integration_connected_accounts add constraint integration_connected_accounts_connection_mode_check
  check (connection_mode in ('live','demo'));
alter table public.integration_connected_accounts drop constraint if exists integration_connected_accounts_last_test_status_check;
alter table public.integration_connected_accounts add constraint integration_connected_accounts_last_test_status_check
  check (last_test_status is null or last_test_status in ('pass','warn','fail'));
alter table public.integration_connected_accounts drop constraint if exists integration_connected_accounts_latency_check;
alter table public.integration_connected_accounts add constraint integration_connected_accounts_latency_check
  check (last_test_latency_ms is null or last_test_latency_ms >= 0);

update public.integration_connected_accounts
   set access_mode = case when connected_by_user_id is null then 'organization' else 'personal' end,
       connection_mode = 'live',
       capabilities = case provider
         when 'google' then '{"email_send":true,"email_read":true,"calendar_read":true,"calendar_write":true,"incremental_sync":true,"webhooks":true}'::jsonb
         when 'microsoft' then '{"email_send":true,"email_read":true,"calendar_read":true,"calendar_write":true,"incremental_sync":true,"webhooks":true}'::jsonb
         when 'meta' then '{"lead_ads":true,"pages":true,"instagram":true,"webhooks":true}'::jsonb
         when 'whatsapp_cloud' then '{"messages":true,"templates":true,"delivery_status":true,"webhooks":true}'::jsonb
         else '{}'::jsonb end
 where capabilities = '{}'::jsonb;

update public.integration_connected_accounts
   set credential_version=1
 where has_credential=true and credential_version=0;

alter table public.integration_sync_jobs
  add column if not exists worker_key text,
  add column if not exists locked_by text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists recovered_count integer not null default 0;

alter table public.integration_sync_jobs drop constraint if exists integration_sync_jobs_worker_key_check;
alter table public.integration_sync_jobs add constraint integration_sync_jobs_worker_key_check
  check (worker_key is null or worker_key in ('google-sync','microsoft-sync','meta-sync','whatsapp-sync','token-refresh','integration-health'));
alter table public.integration_sync_jobs drop constraint if exists integration_sync_jobs_recovered_count_check;
alter table public.integration_sync_jobs add constraint integration_sync_jobs_recovered_count_check check (recovered_count >= 0);

create table if not exists public.integration_diagnostics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.integration_connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft','meta','whatsapp_cloud','extension','framework')),
  run_id uuid not null,
  check_key text not null,
  status text not null check (status in ('pass','warn','fail')),
  message text not null,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.integration_connected_accounts(id) on delete set null,
  provider text not null,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','error','security')),
  actor_user_id uuid references auth.users(id) on delete set null,
  correlation_id text,
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  source_table text,
  source_id uuid,
  created_at timestamptz not null default now(),
  unique (source_table, source_id)
);

create index if not exists integration_accounts_access_idx on public.integration_connected_accounts(organization_id,access_mode,connected_by_user_id);
create index if not exists integration_jobs_worker_queue_idx on public.integration_sync_jobs(worker_key,status,priority desc,available_at) where status in ('queued','retry');
create index if not exists integration_jobs_lease_idx on public.integration_sync_jobs(status,lease_expires_at) where status='processing';
create index if not exists integration_diagnostics_org_created_idx on public.integration_diagnostics(organization_id,created_at desc);
create index if not exists integration_diagnostics_account_created_idx on public.integration_diagnostics(account_id,created_at desc);
create index if not exists integration_audit_org_created_idx on public.integration_audit_events(organization_id,created_at desc);

alter table public.integration_diagnostics enable row level security;
alter table public.integration_audit_events enable row level security;

drop policy if exists integration_diagnostics_select on public.integration_diagnostics;
create policy integration_diagnostics_select on public.integration_diagnostics for select to authenticated
  using (public.is_organization_member(organization_id));
drop policy if exists integration_audit_events_select on public.integration_audit_events;
create policy integration_audit_events_select on public.integration_audit_events for select to authenticated
  using (public.is_organization_member(organization_id));

revoke insert,update,delete on public.integration_diagnostics from authenticated;
revoke insert,update,delete on public.integration_audit_events from authenticated;


-- Converte trabalhos antigos antes de ativar a allowlist estrita.
update public.integration_sync_jobs set job_type=case job_type
  when 'gmail_pull' then 'google_mail_pull'
  when 'outlook_mail_pull' then 'microsoft_mail_pull'
  when 'outlook_calendar_pull' then 'microsoft_calendar_pull'
  when 'calendar_push' then case provider when 'google' then 'google_calendar_push' when 'microsoft' then 'microsoft_calendar_push' else job_type end
  when 'full_sync' then 'account_health_check'
  else job_type end
where job_type in ('gmail_pull','outlook_mail_pull','outlook_calendar_pull','calendar_push','full_sync');

create or replace function public.integration_provider_job_types(p_provider text)
returns text[] language sql immutable set search_path=public,pg_temp as $$
  select case p_provider
    when 'google' then array['google_mail_pull','google_calendar_pull','google_calendar_push','google_subscription_renew','credential_refresh','account_health_check']::text[]
    when 'microsoft' then array['microsoft_mail_pull','microsoft_calendar_pull','microsoft_calendar_push','microsoft_subscription_renew','credential_refresh','account_health_check']::text[]
    when 'meta' then array['meta_leads_pull','meta_account_sync','credential_refresh','account_health_check']::text[]
    when 'whatsapp_cloud' then array['whatsapp_template_sync','whatsapp_account_sync','credential_refresh','account_health_check']::text[]
    else array[]::text[] end;
$$;

create or replace function public.integration_worker_for_job(p_provider text,p_job_type text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case
    when p_job_type='credential_refresh' then 'token-refresh'
    when p_job_type='account_health_check' then 'integration-health'
    when p_provider='google' and p_job_type like 'google_%' then 'google-sync'
    when p_provider='microsoft' and p_job_type like 'microsoft_%' then 'microsoft-sync'
    when p_provider='meta' and p_job_type like 'meta_%' then 'meta-sync'
    when p_provider='whatsapp_cloud' and p_job_type like 'whatsapp_%' then 'whatsapp-sync'
    else null end;
$$;

create or replace function public.can_use_integration_account(p_account_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_account public.integration_connected_accounts; v_role text;
begin
  if auth.uid() is null then return false; end if;
  select * into v_account from public.integration_connected_accounts where id=p_account_id;
  if v_account.id is null or v_account.status <> 'connected' or not v_account.has_credential then return false; end if;
  select role into v_role from public.organization_members where organization_id=v_account.organization_id and user_id=auth.uid();
  if v_role is null then return false; end if;
  -- Administrar uma integração não concede automaticamente o direito de enviar por uma conta pessoal.
  if v_account.access_mode='organization' then return true; end if;
  if v_account.access_mode='personal' then return v_account.connected_by_user_id=auth.uid(); end if;
  if v_account.access_mode='shared' then return v_account.connected_by_user_id=auth.uid() or auth.uid()=any(v_account.allowed_user_ids) or v_role=any(v_account.allowed_roles); end if;
  if v_account.access_mode='restricted' then return auth.uid()=any(v_account.allowed_user_ids); end if;
  return false;
end; $$;

create or replace function public.update_integration_account_access(
  p_account_id uuid,p_access_mode text,p_allowed_user_ids uuid[] default '{}',p_allowed_roles text[] default '{}'
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.integration_connected_accounts where id=p_account_id;
  if v_org is null or auth.uid() is null or not public.is_organization_admin(v_org) then raise exception 'Acesso negado'; end if;
  if p_access_mode not in ('personal','shared','organization','restricted') then raise exception 'Modo de acesso inválido'; end if;
  if exists(select 1 from unnest(coalesce(p_allowed_user_ids,'{}'::uuid[])) u where not exists(select 1 from public.organization_members m where m.organization_id=v_org and m.user_id=u)) then raise exception 'Usuário permitido fora da organização'; end if;
  update public.integration_connected_accounts
     set access_mode=p_access_mode,
         allowed_user_ids=case when p_access_mode in ('shared','restricted') then coalesce(p_allowed_user_ids,'{}'::uuid[]) else '{}'::uuid[] end,
         allowed_roles=case when p_access_mode='shared' then array(select distinct r from unnest(coalesce(p_allowed_roles,'{}'::text[])) r where r in ('member','viewer')) else '{}'::text[] end,
         updated_at=now()
   where id=p_account_id;
  insert into public.integration_audit_events(organization_id,account_id,provider,event_type,severity,actor_user_id,message,metadata)
  select organization_id,id,provider,'account_access_updated','security',auth.uid(),'Permissões de uso da conta atualizadas',jsonb_build_object('access_mode',p_access_mode,'allowed_users',coalesce(array_length(p_allowed_user_ids,1),0))
    from public.integration_connected_accounts where id=p_account_id;
  return true;
end; $$;

create or replace function public.enqueue_integration_sync_job(
  p_organization_id uuid,p_account_id uuid,p_job_type text,p_idempotency_key text,p_payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.integration_sync_jobs; v_provider text; v_worker text;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  select provider into v_provider from public.integration_connected_accounts where id=p_account_id and organization_id=p_organization_id;
  if v_provider is null or not public.can_use_integration_account(p_account_id) then raise exception 'Conta indisponível para este usuário'; end if;
  if not (left(trim(p_job_type),80)=any(public.integration_provider_job_types(v_provider))) then raise exception 'Tipo de trabalho não permitido para o provedor'; end if;
  v_worker:=public.integration_worker_for_job(v_provider,left(trim(p_job_type),80));
  if v_worker is null then raise exception 'Worker não definido para o trabalho'; end if;
  insert into public.integration_sync_jobs(organization_id,account_id,provider,job_type,worker_key,idempotency_key,payload)
  values(p_organization_id,p_account_id,v_provider,left(trim(p_job_type),80),v_worker,left(trim(p_idempotency_key),180),coalesce(p_payload,'{}'::jsonb))
  on conflict(organization_id,idempotency_key) do update set updated_at=now()
  returning * into v_job;
  return v_job.id;
end; $$;

-- Enfileiramento interno para manutenção e webhooks. Não fica exposto ao frontend.
create or replace function public.enqueue_integration_sync_job_system(
  p_organization_id uuid,p_account_id uuid,p_job_type text,p_idempotency_key text,p_payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.integration_sync_jobs; v_provider text; v_worker text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
  select provider into v_provider from public.integration_connected_accounts
   where id=p_account_id and organization_id=p_organization_id and status='connected' and has_credential=true;
  if v_provider is null then raise exception 'Conta conectada não encontrada'; end if;
  if not (left(trim(p_job_type),80)=any(public.integration_provider_job_types(v_provider))) then raise exception 'Tipo de trabalho não permitido para o provedor'; end if;
  v_worker:=public.integration_worker_for_job(v_provider,left(trim(p_job_type),80));
  if v_worker is null then raise exception 'Worker não definido para o trabalho'; end if;
  insert into public.integration_sync_jobs(organization_id,account_id,provider,job_type,worker_key,idempotency_key,payload)
  values(p_organization_id,p_account_id,v_provider,left(trim(p_job_type),80),v_worker,left(trim(p_idempotency_key),180),coalesce(p_payload,'{}'::jsonb))
  on conflict(organization_id,idempotency_key) do update
    set updated_at=now(),
        status=case when public.integration_sync_jobs.status in ('failed','dead_letter','cancelled') then 'retry' else public.integration_sync_jobs.status end,
        available_at=case when public.integration_sync_jobs.status in ('failed','dead_letter','cancelled') then now() else public.integration_sync_jobs.available_at end,
        worker_key=excluded.worker_key
  returning * into v_job;
  return v_job.id;
end; $$;

create or replace function public.recover_stale_integration_jobs(p_lock_timeout_seconds integer default 600)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required'; end if;
  update public.integration_sync_jobs
     set status=case when attempts>=max_attempts then 'dead_letter' else 'retry' end,
         available_at=case when attempts>=max_attempts then available_at else now() end,
         locked_at=null,locked_by=null,lease_expires_at=null,
         recovered_count=recovered_count+1,
         last_error=left(coalesce(last_error||' · ','')||'Lease expirado; trabalho recuperado automaticamente',1000),
         updated_at=now()
   where status='processing'
     and coalesce(lease_expires_at,locked_at + make_interval(secs=>greatest(60,p_lock_timeout_seconds))) < now();
  get diagnostics v_count=row_count;
  return v_count;
end; $$;

create or replace function public.claim_integration_sync_jobs(
  p_worker_key text,p_job_types text[],p_limit integer default 20,p_lease_seconds integer default 300
) returns setof public.integration_sync_jobs language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required'; end if;
  if p_worker_key not in ('google-sync','microsoft-sync','meta-sync','whatsapp-sync','token-refresh','integration-health') then raise exception 'Worker inválido'; end if;
  if exists(select 1 from unnest(coalesce(p_job_types,'{}'::text[])) jt where public.integration_worker_for_job(
      case when jt like 'google_%' then 'google' when jt like 'microsoft_%' then 'microsoft' when jt like 'meta_%' then 'meta' when jt like 'whatsapp_%' then 'whatsapp_cloud' else 'google' end,jt) is distinct from p_worker_key
      and not (jt in ('credential_refresh','account_health_check') and public.integration_worker_for_job('google',jt)=p_worker_key)) then raise exception 'Allowlist incompatível com o worker'; end if;
  perform public.recover_stale_integration_jobs(greatest(60,p_lease_seconds));
  return query
    with candidates as (
      select j.id from public.integration_sync_jobs j
       where j.status in ('queued','retry') and j.available_at<=now() and j.worker_key=p_worker_key and j.job_type=any(coalesce(p_job_types,'{}'::text[]))
       order by j.priority desc,j.available_at,j.created_at
       for update skip locked limit greatest(1,least(coalesce(p_limit,20),100))
    )
    update public.integration_sync_jobs j
       set status='processing',attempts=j.attempts+1,locked_at=now(),locked_by=p_worker_key,
           lease_expires_at=now()+make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,300),3600))),updated_at=now()
      from candidates c where j.id=c.id returning j.*;
end; $$;

create or replace function public.create_integration_oauth_state(
  p_state_hash text,p_organization_id uuid,p_provider text,p_user_id uuid,p_redirect_uri text,p_code_verifier text,p_encryption_key text,p_ttl_seconds integer default 600
) returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required'; end if;
  if length(coalesce(p_encryption_key,''))<32 or length(coalesce(p_code_verifier,''))<43 then raise exception 'PKCE configuration invalid'; end if;
  delete from public.integration_oauth_states where expires_at<now()-interval '1 hour' or consumed_at is not null;
  insert into public.integration_oauth_states(state_hash,organization_id,provider,user_id,redirect_uri,code_verifier_encrypted,expires_at)
  values(left(p_state_hash,128),p_organization_id,p_provider,p_user_id,left(p_redirect_uri,1000),pgp_sym_encrypt(p_code_verifier,p_encryption_key,'cipher-algo=aes256'),now()+make_interval(secs=>greatest(120,least(coalesce(p_ttl_seconds,600),900))));
  return true;
end; $$;

create or replace function public.consume_integration_oauth_state(p_state_hash text,p_encryption_key text)
returns table(organization_id uuid,provider text,user_id uuid,redirect_uri text,code_verifier text)
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_state public.integration_oauth_states;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required'; end if;
  if length(coalesce(p_encryption_key,''))<32 then raise exception 'Invalid encryption key'; end if;
  update public.integration_oauth_states set consumed_at=now()
   where state_hash=left(p_state_hash,128) and consumed_at is null and expires_at>now()
   returning * into v_state;
  if v_state.state_hash is null then raise exception 'OAuth state expired, invalid or already consumed'; end if;
  return query select v_state.organization_id,v_state.provider,v_state.user_id,v_state.redirect_uri,pgp_sym_decrypt(v_state.code_verifier_encrypted,p_encryption_key);
end; $$;

create or replace function public.store_integration_oauth_token(
  p_account_id uuid,p_access_token text,p_refresh_token text,p_token_type text,p_expires_at timestamptz,p_encryption_key text
) returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_org uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required'; end if;
  if length(coalesce(p_encryption_key,''))<32 then raise exception 'Invalid encryption key'; end if;
  select organization_id into v_org from public.integration_connected_accounts where id=p_account_id;
  if v_org is null then raise exception 'Account not found'; end if;
  insert into public.integration_token_vault(account_id,organization_id,access_token_encrypted,refresh_token_encrypted,token_type,expires_at)
  values(p_account_id,v_org,pgp_sym_encrypt(p_access_token,p_encryption_key,'cipher-algo=aes256'),case when coalesce(p_refresh_token,'')='' then null else pgp_sym_encrypt(p_refresh_token,p_encryption_key,'cipher-algo=aes256') end,p_token_type,p_expires_at)
  on conflict(account_id) do update set access_token_encrypted=excluded.access_token_encrypted,refresh_token_encrypted=coalesce(excluded.refresh_token_encrypted,public.integration_token_vault.refresh_token_encrypted),token_type=excluded.token_type,expires_at=excluded.expires_at,updated_at=now();
  update public.integration_connected_accounts set has_credential=true,token_expires_at=p_expires_at,status='connected',last_error=null,token_refreshed_at=now(),credential_version=credential_version+1,revoked_at=null where id=p_account_id;
  return true;
end; $$;

create or replace function public.update_integration_account_status(p_account_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_status text;
begin
  select organization_id into v_org from public.integration_connected_accounts where id=p_account_id;
  if v_org is null or auth.uid() is null or not public.is_organization_admin(v_org) then raise exception 'Acesso negado'; end if;
  v_status:=case p_action when 'pause' then 'paused' when 'resume' then 'connected' when 'disconnect' then 'revoked' else null end;
  if v_status is null then raise exception 'Ação inválida'; end if;
  if p_action='resume' and not exists(select 1 from public.integration_token_vault where account_id=p_account_id) then raise exception 'Reconecte a conta para restaurar a credencial'; end if;
  update public.integration_connected_accounts set status=v_status,
    has_credential=case when p_action='disconnect' then false else has_credential end,
    revoked_at=case when p_action='disconnect' then now() else null end,
    credential_version=case when p_action='disconnect' then credential_version+1 else credential_version end,
    last_error=case when p_action='disconnect' then 'Credencial revogada pelo administrador' else null end
  where id=p_account_id;
  if p_action in ('pause','disconnect') then
    update public.integration_sync_jobs
       set status='cancelled',locked_at=null,locked_by=null,lease_expires_at=null,completed_at=now(),
           last_error=case when p_action='pause' then 'Cancelado porque a conta foi pausada' else 'Cancelado porque a conta foi desconectada' end,
           updated_at=now()
     where account_id=p_account_id and status in ('queued','retry','processing');
  end if;
  if p_action='disconnect' then delete from public.integration_token_vault where account_id=p_account_id; end if;
  insert into public.integration_audit_events(organization_id,account_id,provider,event_type,severity,actor_user_id,message,metadata)
  select organization_id,id,provider,'account_'||p_action,case when p_action='disconnect' then 'security' else 'info' end,auth.uid(),'Estado da conta atualizado',jsonb_build_object('action',p_action)
    from public.integration_connected_accounts where id=p_account_id;
  return true;
end; $$;

create or replace function public.integration_foundation_health(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_organization_admin(p_organization_id) then raise exception 'Acesso negado'; end if;
  select jsonb_build_object(
    'accounts',count(*),
    'connected',count(*) filter(where status='connected'),
    'credentials',count(*) filter(where has_credential),
    'attention',count(*) filter(where status in ('attention','expired','error')),
    'personal',count(*) filter(where access_mode='personal'),
    'shared',count(*) filter(where access_mode='shared'),
    'staleJobs',(select count(*) from public.integration_sync_jobs where organization_id=p_organization_id and status='processing' and coalesce(lease_expires_at,locked_at)<now()),
    'deadLetter',(select count(*) from public.integration_sync_jobs where organization_id=p_organization_id and status='dead_letter'),
    'oauthStatesReusable',(select count(*) from public.integration_oauth_states where organization_id=p_organization_id and consumed_at is null and expires_at<now()),
    'legacyWritesDisabled',true
  ) into v_result from public.integration_connected_accounts where organization_id=p_organization_id;
  return v_result;
end; $$;

-- A conta selecionada para comunicação deve estar autorizada para o usuário que enfileira o envio.
create or replace function public.enqueue_official_communication(
  p_organization_id uuid,p_lead_id uuid,p_account_id uuid,p_channel text,p_recipient text,p_subject text,p_body text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account public.integration_connected_accounts; v_lead public.leads; v_thread_id uuid; v_event_id uuid;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if p_channel not in ('email','whatsapp') then raise exception 'Canal não suportado'; end if;
  select * into v_lead from public.leads where id=p_lead_id and organization_id=p_organization_id;
  if v_lead.id is null then raise exception 'Lead não encontrado'; end if;
  if coalesce(v_lead.do_not_contact,false) then raise exception 'Este lead está bloqueado para contato'; end if;
  select * into v_account from public.integration_connected_accounts where id=p_account_id and organization_id=p_organization_id and status='connected' and has_credential=true;
  if v_account.id is null or not public.can_use_integration_account(p_account_id) then raise exception 'Conta oficial indisponível para este usuário'; end if;
  if p_channel='email' and v_account.provider not in ('google','microsoft') then raise exception 'A conta selecionada não envia e-mail'; end if;
  if p_channel='whatsapp' and v_account.provider<>'whatsapp_cloud' then raise exception 'A conta selecionada não envia WhatsApp'; end if;
  if length(trim(coalesce(p_recipient,'')))<3 or length(trim(coalesce(p_body,'')))<1 then raise exception 'Destinatário ou mensagem inválidos'; end if;
  select id into v_event_id from public.communication_events where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
  if v_event_id is not null then return v_event_id; end if;
  select id into v_thread_id from public.communication_threads where organization_id=p_organization_id and lead_id=p_lead_id and account_id=p_account_id and channel=p_channel and status='open' order by updated_at desc limit 1;
  if v_thread_id is null then
    insert into public.communication_threads(organization_id,lead_id,account_id,channel,subject,last_message_at)
    values(p_organization_id,p_lead_id,p_account_id,p_channel,left(coalesce(p_subject,''),300),now()) returning id into v_thread_id;
  end if;
  insert into public.communication_events(organization_id,thread_id,lead_id,account_id,channel,direction,event_type,status,idempotency_key,recipient_addresses,subject,body_text,metadata)
  values(p_organization_id,v_thread_id,p_lead_id,p_account_id,p_channel,'outbound',case when p_channel='email' then 'email' else 'message' end,'queued',left(p_idempotency_key,180),array[left(trim(p_recipient),320)],left(coalesce(p_subject,''),500),left(p_body,50000),jsonb_build_object('queued_by',auth.uid(),'account_access_mode',v_account.access_mode))
  returning id into v_event_id;
  insert into public.communication_outbox(organization_id,event_id,account_id,lead_id,channel,idempotency_key,payload)
  values(p_organization_id,v_event_id,p_account_id,p_lead_id,p_channel,left(p_idempotency_key,180),jsonb_build_object('recipient',left(trim(p_recipient),320),'subject',left(coalesce(p_subject,''),500),'body',left(p_body,50000),'queued_by',auth.uid()));
  update public.communication_threads set last_message_at=now() where id=v_thread_id;
  return v_event_id;
end; $$;

-- Migração imutável do histórico antigo para a fonte de auditoria nova.
insert into public.integration_audit_events(organization_id,provider,event_type,severity,correlation_id,message,metadata,source_table,source_id,created_at)
select organization_id,provider,event_type,case status when 'failed' then 'error' when 'partial' then 'warning' else 'info' end,
       external_id,coalesce(error_message,''),coalesce(metadata,'{}'::jsonb)||jsonb_build_object('legacy_status',status,'direction',direction,'item_count',item_count),
       'integration_events',id,created_at
  from public.integration_events
on conflict(source_table,source_id) do nothing;

-- Contas conectadas são alteradas somente por RPCs e Edge Functions auditáveis.
revoke insert,update,delete on public.integration_connected_accounts from authenticated;

comment on table public.integration_connections is 'LEGADO V100.23: leitura e escrita pelo frontend desativadas na V100.45. Use integration_connected_accounts, extension_installations e integration_audit_events.';
comment on table public.integration_events is 'LEGADO V100.23: histórico migrado para integration_audit_events na V100.45.';
revoke select,insert,update,delete on public.integration_connections from authenticated;
revoke select,insert,update,delete on public.integration_events from authenticated;

-- A credencial de extensão continua em integration_credentials, mas o estado deixa de depender da central antiga.
create or replace function public.rotate_extension_ingest_token(p_organization_id uuid)
returns text language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_token text;
begin
  if auth.uid() is null or not public.is_organization_admin(p_organization_id) then raise exception 'Somente administradores podem gerar credenciais'; end if;
  v_token:='rt_live_'||encode(gen_random_bytes(32),'hex');
  update public.integration_credentials set revoked_at=now() where organization_id=p_organization_id and provider='extension' and revoked_at is null;
  insert into public.integration_credentials(organization_id,provider,token_hash,token_hint,created_by)
  values(p_organization_id,'extension',encode(digest(v_token,'sha256'),'hex'),right(v_token,6),auth.uid());
  insert into public.integration_audit_events(organization_id,provider,event_type,severity,actor_user_id,message,metadata)
  values(p_organization_id,'extension','extension_token_rotated','security',auth.uid(),'Token da extensão rotacionado',jsonb_build_object('token_hint',right(v_token,6)));
  return v_token;
end; $$;

create or replace function public.revoke_extension_ingest_token(p_organization_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.is_organization_admin(p_organization_id) then raise exception 'Somente administradores podem revogar credenciais'; end if;
  update public.integration_credentials set revoked_at=now() where organization_id=p_organization_id and provider='extension' and revoked_at is null;
  insert into public.integration_audit_events(organization_id,provider,event_type,severity,actor_user_id,message)
  values(p_organization_id,'extension','extension_token_revoked','security',auth.uid(),'Token da extensão revogado');
  return true;
end; $$;

revoke all on function public.integration_provider_job_types(text) from public,anon;
revoke all on function public.integration_worker_for_job(text,text) from public,anon;
revoke all on function public.can_use_integration_account(uuid) from public,anon;
revoke all on function public.update_integration_account_access(uuid,text,uuid[],text[]) from public,anon;
revoke all on function public.enqueue_integration_sync_job_system(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.recover_stale_integration_jobs(integer) from public,anon,authenticated;
revoke all on function public.claim_integration_sync_jobs(text,text[],integer,integer) from public,anon,authenticated;
revoke all on function public.create_integration_oauth_state(text,uuid,text,uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.consume_integration_oauth_state(text,text) from public,anon,authenticated;
revoke all on function public.integration_foundation_health(uuid) from public,anon;
revoke all on function public.update_integration_account_access(uuid,text,uuid[],text[]) from public,anon;
grant execute on function public.integration_provider_job_types(text) to authenticated,service_role;
grant execute on function public.integration_worker_for_job(text,text) to authenticated,service_role;
grant execute on function public.can_use_integration_account(uuid) to authenticated;
grant execute on function public.update_integration_account_access(uuid,text,uuid[],text[]) to authenticated;
grant execute on function public.enqueue_integration_sync_job_system(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.recover_stale_integration_jobs(integer) to service_role;
grant execute on function public.claim_integration_sync_jobs(text,text[],integer,integer) to service_role;
grant execute on function public.create_integration_oauth_state(text,uuid,text,uuid,text,text,text,integer) to service_role;
grant execute on function public.consume_integration_oauth_state(text,text) to service_role;
grant execute on function public.integration_foundation_health(uuid) to authenticated;

commit;
