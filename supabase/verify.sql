-- Execute após a migration para conferir os objetos essenciais.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles','organizations','organization_members','pipeline_stages','leads','lead_stage_history',
    'activities','calls','calendar_events','goals','automation_rules','automation_runs','organization_settings','audit_logs',
    'prospecting_batches','prospecting_leads','prospecting_events'
  )
order by table_name;

select schemaname, tablename, policyname
from pg_policies
where schemaname in ('public','storage')
order by schemaname, tablename, policyname;

-- Verificações V100.2
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'activities'
  and column_name in ('source_type','source_id','description','assigned_to')
order by column_name;

select trigger_name, event_manipulation
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'activities'
order by trigger_name, event_manipulation;

-- Verificações V100.3
select conname
from pg_constraint
where conname in ('goals_metric_check','automation_rules_trigger_type_check','automation_rules_actions_array_check','automation_rules_conditions_array_check')
order by conname;

select table_name
from information_schema.views
where table_schema = 'public' and table_name = 'crm_daily_activity_metrics';

select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('goals','automation_rules','automation_runs')
order by tablename;

-- Verificações V100.4
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('playbooks','organization_invites')
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_organization_invite','accept_organization_invite','revoke_organization_invite',
    'update_organization_member_role','remove_organization_member','production_readiness'
  )
order by routine_name;

select trigger_name, event_object_table
from information_schema.triggers
where event_object_schema = 'public'
  and (trigger_name like '%audit_v1004' or trigger_name = 'organization_members_protect_owner')
order by event_object_table, trigger_name;

-- A política de INSERT direto em audit_logs deve estar ausente na V100.4.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'audit_logs'
order by policyname;

-- Verificações V100.19
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'calls' and column_name = 'consent_at';

select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('playbooks','prospecting_leads','prospecting_events')
order by tablename;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('prospecting_batches','prospecting_leads','prospecting_events')
order by tablename, policyname;

-- Verificações V100.21
select routine_name, security_type
from information_schema.routines
where routine_schema = 'public' and routine_name = 'merge_duplicate_leads';

select has_function_privilege('authenticated', 'public.merge_duplicate_leads(uuid,uuid,uuid)', 'execute') as authenticated_can_merge,
       has_function_privilege('anon', 'public.merge_duplicate_leads(uuid,uuid,uuid)', 'execute') as anon_can_merge;

-- Verificações V100.22
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'leads' and column_name = 'expected_close_at';

-- Verificações V100.23
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('integration_connections','integration_credentials','integration_events','automation_events')
order by table_name;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('rotate_extension_ingest_token','revoke_extension_ingest_token','validate_extension_ingest_token')
order by routine_name;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('integration_connections','integration_credentials','integration_events','automation_events')
order by tablename, policyname;

select has_function_privilege('anon', 'public.validate_extension_ingest_token(text)', 'execute') as anon_can_validate_token,
       has_function_privilege('authenticated', 'public.validate_extension_ingest_token(text)', 'execute') as authenticated_can_validate_token,
       has_function_privilege('service_role', 'public.validate_extension_ingest_token(text)', 'execute') as service_role_can_validate_token;

-- Verificações V100.24
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'integration_connections'
  and column_name in ('client_version','connection_name','last_batch_id','last_latency_ms')
order by column_name;

-- Verificações V100.25
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('seller_notifications','contact_drafts')
order by table_name;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'automation_events'
  and column_name in ('max_attempts','priority','source','batch_id','last_attempt_at','dead_lettered_at')
order by column_name;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('retry_automation_event','cancel_automation_event','retry_failed_automation_events')
order by routine_name;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('seller_notifications','contact_drafts','automation_events')
order by tablename, policyname;
