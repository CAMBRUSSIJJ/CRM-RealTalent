begin;

-- V101.11.3-H22.6 — SECURITY DEFINER execute hardening
--
-- PostgreSQL concede EXECUTE em novas funções a PUBLIC por padrão. Parte das funções
-- abaixo já possuía checagem de auth.uid()/organização, mas continuava invocável por
-- `anon` por herdar esse grant. `claim_lead_geocode_jobs` é mais sensível: é uma RPC
-- de worker e não faz autenticação de usuário, portanto deve ser exclusivamente backend.
--
-- As RPCs públicas baseadas em token (Buyer Room / RealTalent Meet) NÃO são alteradas
-- aqui; elas permanecem anon-accessible de forma intencional.

-- Helpers de RLS/permissão: frontend autenticado e backend podem executar; anon não.
revoke all on function public.can_write_organization(uuid) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.can_write_organization(uuid) to authenticated, service_role;

revoke all on function public.is_organization_admin(uuid) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.is_organization_admin(uuid) to authenticated, service_role;

revoke all on function public.is_organization_member(uuid) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.is_organization_member(uuid) to authenticated, service_role;

revoke all on function public.rt_access_action_allowed(uuid,text,text) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.rt_access_action_allowed(uuid,text,text) to authenticated, service_role;

revoke all on function public.rt_access_rule(uuid,text) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.rt_access_rule(uuid,text) to authenticated, service_role;

revoke all on function public.rt_access_scope(uuid,text) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.rt_access_scope(uuid,text) to authenticated, service_role;

revoke all on function public.rt_access_scope_allows(uuid,text,uuid,uuid) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.rt_access_scope_allows(uuid,text,uuid,uuid) to authenticated, service_role;

revoke all on function public.rt_member_profile_key(uuid) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.rt_member_profile_key(uuid) to authenticated, service_role;

-- Geocodificação: solicitação pode vir do CRM autenticado; claim é somente worker.
revoke all on function public.enqueue_lead_geocoding(uuid[],text,smallint) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.enqueue_lead_geocoding(uuid[],text,smallint) to authenticated, service_role;

revoke all on function public.claim_lead_geocode_jobs(integer,text,integer) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.claim_lead_geocode_jobs(integer,text,integer) to service_role;

-- Execução comercial: exige usuário autenticado no próprio corpo da RPC.
revoke all on function public.register_commercial_activity_outcome(uuid,uuid,text,text,text,boolean,text,text,text,timestamptz,uuid) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.register_commercial_activity_outcome(uuid,uuid,text,text,text,boolean,text,text,text,timestamptz,uuid) to authenticated, service_role;

revoke all on function public.register_commercial_call_outcome(uuid,uuid,uuid,text,integer,text,text,text,timestamptz,timestamptz,timestamptz,boolean,timestamptz,integer) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.register_commercial_call_outcome(uuid,uuid,uuid,text,integer,text,text,text,timestamptz,timestamptz,timestamptz,boolean,timestamptz,integer) to authenticated, service_role;

revoke all on function public.save_sales_proposal(uuid,uuid,uuid,text,text,numeric,date,date,date,date,integer,boolean,date,text,text,text,jsonb) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.save_sales_proposal(uuid,uuid,uuid,text,text,numeric,date,date,date,date,integer,boolean,date,text,text,text,jsonb) to authenticated, service_role;

-- Extension Center: todas estas RPCs dependem de auth.uid()/membership/admin.
revoke all on function public.ensure_extension_product_settings(uuid,text) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.ensure_extension_product_settings(uuid,text) to authenticated, service_role;

revoke all on function public.register_extension_installation(uuid,text,text,text,text,text,text,text,integer,text[],text[],jsonb) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.register_extension_installation(uuid,text,text,text,text,text,text,text,integer,text[],text[],jsonb) to authenticated, service_role;

revoke all on function public.heartbeat_extension_installation(uuid,uuid,integer,integer,text) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.heartbeat_extension_installation(uuid,uuid,integer,integer,text) to authenticated, service_role;

revoke all on function public.retry_extension_capture_job(uuid) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.retry_extension_capture_job(uuid) to authenticated, service_role;

revoke all on function public.save_extension_product_settings(uuid,text,boolean,text,boolean,text,text,text,integer,integer,boolean,text[],jsonb) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.save_extension_product_settings(uuid,text,boolean,text,boolean,text,text,text,integer,integer,boolean,text[],jsonb) to authenticated, service_role;

revoke all on function public.update_extension_installation_status(uuid,text) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.update_extension_installation_status(uuid,text) to authenticated, service_role;

commit;
