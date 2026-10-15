-- RealTalent CRM V100.14 — Automações Comerciais
-- Amplia os gatilhos aceitos pelo banco. Condições, ações e proteções continuam em JSONB auditável.

begin;

alter table public.automation_rules
  drop constraint if exists automation_rules_trigger_type_check;

alter table public.automation_rules
  add constraint automation_rules_trigger_type_check
  check (trigger_type in (
    'lead_created',
    'lead_imported',
    'stage_changed',
    'activity_completed',
    'activity_overdue',
    'call_outcome',
    'meeting_scheduled',
    'meeting_cancelled',
    'proposal_sent',
    'date_reached',
    'lead_stale',
    'goal_at_risk',
    'opportunity_won',
    'opportunity_lost',
    'manual'
  ));

comment on column public.automation_rules.conditions is
  'Condições comerciais e configuração reservada automation_guard para simulação, cooldown, limites e prevenção de duplicidade.';
comment on column public.automation_rules.actions is
  'Ações automáticas ordenadas; o frontend V100.14 valida limite, duplicidade e reversibilidade antes da execução.';

commit;
