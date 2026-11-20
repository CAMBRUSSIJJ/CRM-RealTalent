-- RealTalent CRM V101 — Fase 2 (Comunicação): cada pessoa conecta o próprio Gmail.
--  1. Quem conectou uma conta pessoal pode pausá-la, reativá-la e desconectá-la.
--  2. Verificação periódica do Gmail (funciona sem Pub/Sub).
--  3. pg_cron chama os workers só quando há trabalho, com segredos lidos do Vault.
--     Sem os segredos no Vault os agendamentos não fazem nada (ver supabase/cron/CONFIGURAR-GMAIL.sql).

begin;

create extension if not exists pg_net with schema extensions;

create or replace function public.update_integration_account_status(p_account_id uuid, p_action text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_account public.integration_connected_accounts; v_status text; v_is_owner boolean;
begin
  select * into v_account from public.integration_connected_accounts where id = p_account_id;
  if v_account.id is null or auth.uid() is null then raise exception 'Acesso negado'; end if;
  v_is_owner := v_account.access_mode = 'personal' and v_account.connected_by_user_id = auth.uid()
    and public.is_organization_member(v_account.organization_id);
  if not v_is_owner and not public.is_organization_admin(v_account.organization_id) then raise exception 'Acesso negado'; end if;
  v_status := case p_action when 'pause' then 'paused' when 'resume' then 'connected' when 'disconnect' then 'revoked' else null end;
  if v_status is null then raise exception 'Ação inválida'; end if;
  if p_action = 'resume' and not exists(select 1 from public.integration_token_vault where account_id = p_account_id) then
    raise exception 'Reconecte a conta para restaurar a credencial';
  end if;
  update public.integration_connected_accounts set status = v_status,
    has_credential = case when p_action = 'disconnect' then false else has_credential end,
    revoked_at = case when p_action = 'disconnect' then now() else null end,
    credential_version = case when p_action = 'disconnect' then credential_version + 1 else credential_version end,
    last_error = case when p_action = 'disconnect' then
      case when v_is_owner then 'Conta desconectada pelo próprio usuário' else 'Credencial revogada pelo administrador' end
      else null end
  where id = p_account_id;
  if p_action in ('pause', 'disconnect') then
    update public.integration_sync_jobs
       set status = 'cancelled', locked_at = null, locked_by = null, lease_expires_at = null, completed_at = now(),
           last_error = case when p_action = 'pause' then 'Cancelado porque a conta foi pausada' else 'Cancelado porque a conta foi desconectada' end,
           updated_at = now()
     where account_id = p_account_id and status in ('queued', 'retry', 'processing');
    update public.communication_outbox
       set status = 'cancelled', locked_at = null,
           last_error = case when p_action = 'pause' then 'Cancelado porque a conta foi pausada' else 'Cancelado porque a conta foi desconectada' end
     where account_id = p_account_id and status in ('queued', 'retry');
  end if;
  if p_action = 'disconnect' then delete from public.integration_token_vault where account_id = p_account_id; end if;
  insert into public.integration_audit_events(organization_id, account_id, provider, event_type, severity, actor_user_id, message, metadata)
  select organization_id, id, provider, 'account_' || p_action, case when p_action = 'disconnect' then 'security' else 'info' end, auth.uid(),
         'Estado da conta atualizado', jsonb_build_object('action', p_action, 'by_owner', v_is_owner)
    from public.integration_connected_accounts where id = p_account_id;
  return true;
end; $$;

-- Coloca na fila uma leitura do Gmail/Outlook para cada conta conectada que ainda não tem uma pendente.
create or replace function public.enqueue_periodic_mail_pulls()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer := 0; v_account record; v_job_type text;
begin
  for v_account in
    select a.id, a.organization_id, a.provider from public.integration_connected_accounts a
     where a.provider in ('google', 'microsoft') and a.status = 'connected' and a.has_credential
       and coalesce((a.capabilities ->> 'mail_sync')::boolean, false)
  loop
    v_job_type := case v_account.provider when 'google' then 'google_mail_pull' else 'microsoft_mail_pull' end;
    if exists(select 1 from public.integration_sync_jobs j where j.account_id = v_account.id and j.job_type = v_job_type and j.status in ('queued', 'processing', 'retry')) then
      continue;
    end if;
    insert into public.integration_sync_jobs(organization_id, account_id, provider, job_type, worker_key, idempotency_key, payload)
    values (v_account.organization_id, v_account.id, v_account.provider, v_job_type,
            public.integration_worker_for_job(v_account.provider, v_job_type),
            'poll:' || v_account.id || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI'),
            jsonb_build_object('source', 'pg_cron_poll'))
    on conflict (organization_id, idempotency_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

create or replace function public.realtalent_vault_secret(p_name text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name order by created_at desc limit 1
$$;

-- Chama cada worker só quando existe trabalho para ele. Sem segredos no Vault, não faz nada.
create or replace function public.run_integration_workers()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_base text := rtrim(coalesce(public.realtalent_vault_secret('realtalent_project_url'), ''), '/');
  v_integration_secret text := public.realtalent_vault_secret('realtalent_integration_worker_secret');
  v_communication_secret text := public.realtalent_vault_secret('realtalent_communication_worker_secret');
  v_called jsonb := '[]'::jsonb; v_worker text;
begin
  if v_base = '' then return jsonb_build_object('skipped', 'realtalent_project_url ausente no Vault'); end if;
  if coalesce(length(v_integration_secret), 0) >= 32 then
    for v_worker in
      select distinct j.worker_key from public.integration_sync_jobs j
       where j.status in ('queued', 'retry') and j.available_at <= now() and j.worker_key in ('google-sync', 'microsoft-sync')
    loop
      perform net.http_post(
        url := v_base || '/functions/v1/' || case v_worker when 'google-sync' then 'integration-google-worker' else 'integration-microsoft-worker' end,
        headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_integration_secret),
        body := jsonb_build_object('source', 'pg_cron', 'limit', 10),
        timeout_milliseconds := 5000);
      v_called := v_called || to_jsonb(v_worker);
    end loop;
  end if;
  if coalesce(length(v_communication_secret), 0) >= 32
     and exists(select 1 from public.communication_outbox o where o.status in ('queued', 'retry') and o.available_at <= now()) then
    perform net.http_post(
      url := v_base || '/functions/v1/communication-dispatch-worker',
      headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_communication_secret),
      body := jsonb_build_object('source', 'pg_cron'),
      timeout_milliseconds := 5000);
    v_called := v_called || to_jsonb('communication-dispatch'::text);
  end if;
  return jsonb_build_object('called', v_called);
end; $$;

revoke all on function public.enqueue_periodic_mail_pulls() from public, anon, authenticated;
revoke all on function public.realtalent_vault_secret(text) from public, anon, authenticated;
revoke all on function public.run_integration_workers() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('realtalent-mail-poll', 'realtalent-integration-runners');
  perform cron.schedule('realtalent-mail-poll', '*/5 * * * *', 'select public.enqueue_periodic_mail_pulls();');
  perform cron.schedule('realtalent-integration-runners', '* * * * *', 'select public.run_integration_workers();');
end $$;

commit;
