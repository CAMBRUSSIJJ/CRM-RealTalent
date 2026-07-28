-- RealTalent CRM V100.38 — contratos mínimos de homologação do banco.
-- Execute com psql após `supabase db reset --local`.

begin;

do $$
declare
  missing_rls text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
    into missing_rls
    from pg_tables
   where schemaname = 'public'
     and rowsecurity = false;
  if missing_rls is not null then
    raise exception 'Tabelas públicas sem RLS: %', missing_rls;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'register_commercial_call_outcome') then
    raise exception 'RPC register_commercial_call_outcome ausente';
  end if;
  if not exists (select 1 from pg_proc where proname = 'register_commercial_followup_outcome') then
    raise exception 'RPC register_commercial_followup_outcome ausente';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='automation_webhooks') then
    raise exception 'Tabela automation_webhooks ausente';
  end if;
  if not exists (select 1 from pg_proc where proname = 'sync_commercial_structure') then
    raise exception 'RPC sync_commercial_structure ausente';
  end if;
  if (select count(*) from information_schema.tables where table_schema='public' and table_name in ('companies','contacts','opportunities','social_profiles')) <> 4 then
    raise exception 'Estrutura comercial V100.38 incompleta';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='leads' and column_name in ('company_id','primary_contact_id','opportunity_id','consent_status','do_not_contact','decision_role')) <> 6 then
    raise exception 'Colunas V100.38 ausentes em leads';
  end if;
end $$;

rollback;

-- V100.39 — Framework de Integrações
DO $$
BEGIN
  IF to_regclass('public.integration_connected_accounts') IS NULL
     OR to_regclass('public.integration_sync_jobs') IS NULL
     OR to_regclass('public.integration_sync_attempts') IS NULL
     OR to_regclass('public.integration_token_vault') IS NULL THEN
    RAISE EXCEPTION 'Framework de Integrações V100.39 incompleto';
  END IF;
END $$;

-- RealTalent Connect Desktop v1.6
DO $$
BEGIN
  IF to_regclass('public.realtalent_connect_devices') IS NULL THEN
    RAISE EXCEPTION 'Tabela realtalent_connect_devices ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='register_realtalent_connect_device')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='heartbeat_realtalent_connect_device')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_realtalent_connect_queue') THEN
    RAISE EXCEPTION 'RPCs do RealTalent Connect v1.6 incompletas';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.realtalent_connect_devices'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS ausente em realtalent_connect_devices';
  END IF;
END $$;

-- V100.40 — Central de Extensões
DO $$
BEGIN
  IF to_regclass('public.extension_installations') IS NULL
     OR to_regclass('public.extension_capture_jobs') IS NULL
     OR to_regclass('public.extension_events') IS NULL
     OR to_regclass('public.extension_product_settings') IS NULL THEN
    RAISE EXCEPTION 'Central de Extensões V100.40 incompleta';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='register_extension_installation')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='heartbeat_extension_installation') THEN
    RAISE EXCEPTION 'RPCs da Central de Extensões incompletas';
  END IF;
END $$;

-- V100.41 — Produção, observabilidade e homologação
DO $$
BEGIN
  IF to_regclass('public.system_health_events') IS NULL THEN
    RAISE EXCEPTION 'Tabela system_health_events ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.system_health_events'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS ausente em system_health_events';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='resolve_system_health_event') THEN
    RAISE EXCEPTION 'RPC resolve_system_health_event ausente';
  END IF;
END $$;

-- V100.42 — Comunicações oficiais e timeline unificada
DO $$
BEGIN
  IF to_regclass('public.communication_threads') IS NULL
     OR to_regclass('public.communication_events') IS NULL
     OR to_regclass('public.communication_outbox') IS NULL
     OR to_regclass('public.communication_subscriptions') IS NULL
     OR to_regclass('public.calendar_external_links') IS NULL THEN
    RAISE EXCEPTION 'Comunicações oficiais V100.42 incompletas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='enqueue_official_communication')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='upsert_inbound_communication')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='read_integration_oauth_token') THEN
    RAISE EXCEPTION 'RPCs de comunicação V100.42 incompletas';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_class
     WHERE oid IN (
       'public.communication_threads'::regclass,
       'public.communication_events'::regclass,
       'public.communication_outbox'::regclass,
       'public.communication_subscriptions'::regclass,
       'public.calendar_external_links'::regclass
     )
       AND NOT relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS incompleto nas tabelas de comunicação V100.42';
  END IF;
END $$;

-- V100.43 — Propostas, produtos, receita e forecast
DO $$
BEGIN
  IF to_regclass('public.products') IS NULL
     OR to_regclass('public.sales_proposals') IS NULL
     OR to_regclass('public.sales_proposal_items') IS NULL
     OR to_regclass('public.revenue_entries') IS NULL THEN
    RAISE EXCEPTION 'Propostas e Forecast V100.43 incompletos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='save_sales_proposal')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='create_sales_proposal_revision')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='set_sales_proposal_status') THEN
    RAISE EXCEPTION 'RPCs de propostas V100.43 incompletas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE oid IN ('public.products'::regclass,'public.sales_proposals'::regclass,'public.sales_proposal_items'::regclass,'public.revenue_entries'::regclass) AND NOT relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS incompleto em Propostas e Forecast V100.43';
  END IF;
END $$;
