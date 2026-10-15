-- RealTalent CRM V100.22 — previsão comercial e execução de Pipeline
begin;

alter table public.leads add column if not exists expected_close_at date;
create index if not exists leads_org_expected_close_idx
  on public.leads(organization_id, expected_close_at)
  where status = 'active' and expected_close_at is not null;

comment on column public.leads.expected_close_at is 'Data comercial prevista para fechamento; separada da próxima ação operacional.';

commit;
