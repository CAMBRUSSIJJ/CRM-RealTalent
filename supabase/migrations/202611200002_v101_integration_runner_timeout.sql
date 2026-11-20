-- RealTalent CRM V101 — os workers levam cerca de 5 s para responder; com 5 s de espera o pg_net
-- registrava falsos erros de timeout. A espera passa a 20 s (o worker termina o trabalho de qualquer forma).

begin;

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
        timeout_milliseconds := 20000);
      v_called := v_called || to_jsonb(v_worker);
    end loop;
  end if;
  if coalesce(length(v_communication_secret), 0) >= 32
     and exists(select 1 from public.communication_outbox o where o.status in ('queued', 'retry') and o.available_at <= now()) then
    perform net.http_post(
      url := v_base || '/functions/v1/communication-dispatch-worker',
      headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_communication_secret),
      body := jsonb_build_object('source', 'pg_cron'),
      timeout_milliseconds := 20000);
    v_called := v_called || to_jsonb('communication-dispatch'::text);
  end if;
  return jsonb_build_object('called', v_called);
end; $$;

revoke all on function public.run_integration_workers() from public, anon, authenticated;

commit;
