-- RealTalent CRM V100.92 — Hardening & UX
-- Limpeza operacional atômica e administrada: preserva organização, membros,
-- pipeline, catálogo, integrações/configurações e trilha de auditoria.
begin;

create or replace function public.clear_organization_operational_data(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_count integer := 0;
  v_total integer := 0;
  v_tables text[] := array[
    'communication_attachments',
    'webhook_deliveries',
    'automation_events',
    'automation_runs',
    'contact_drafts',
    'seller_notifications',
    'calendar_external_links',
    'communication_outbox',
    'communication_events',
    'communication_threads',
    'buyer_rooms',
    'revenue_entries',
    'sales_proposal_items',
    'sales_proposals',
    'realtalent_connect_call_commands',
    'extension_capture_jobs',
    'extension_events',
    'prospecting_events',
    'prospecting_leads',
    'prospecting_batches',
    'lead_geocode_jobs',
    'lead_location_history',
    'lead_stage_history',
    'activities',
    'calls',
    'calendar_events',
    'contact_relationships',
    'social_profiles',
    'opportunities',
    'contacts',
    'companies',
    'playbooks',
    'goals',
    'automation_rules',
    'leads'
  ];
begin
  if auth.uid() is null or not public.is_organization_admin(p_organization_id) then
    raise exception 'Somente administradores podem limpar os dados operacionais do workspace.';
  end if;

  -- A limpeza administrativa é uma operação destrutiva explícita. O flag local
  -- permite apagar também históricos protegidos, somente dentro desta transação.
  perform set_config('realtalent.lead_merge', 'on', true);

  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('delete from public.%I where organization_id = $1', v_table) using p_organization_id;
      get diagnostics v_count = row_count;
      v_total := v_total + v_count;
    end if;
  end loop;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, after_data)
  values (
    p_organization_id,
    auth.uid(),
    'workspace.operational_data_cleared',
    'organization',
    p_organization_id::text,
    jsonb_build_object('total', v_total, 'version', 'V100.92.0')
  );

  return jsonb_build_object('cleared', true, 'total', v_total);
end;
$$;

revoke all on function public.clear_organization_operational_data(uuid) from public;
grant execute on function public.clear_organization_operational_data(uuid) to authenticated;

comment on function public.clear_organization_operational_data(uuid) is
  'V100.92: limpa dados operacionais do workspace em uma única transação, preservando estrutura administrativa e configurações.';

commit;
