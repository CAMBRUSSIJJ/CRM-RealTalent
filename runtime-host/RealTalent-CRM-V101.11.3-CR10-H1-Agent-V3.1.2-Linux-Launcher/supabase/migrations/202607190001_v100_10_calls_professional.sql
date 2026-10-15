-- RealTalent CRM V100.10 — Central Profissional de Ligações
begin;

alter table public.calls drop constraint if exists calls_outcome_check;
alter table public.calls add constraint calls_outcome_check check (outcome in (
  'answered','no_answer','busy','voicemail','callback_requested','interested',
  'meeting_scheduled','proposal_requested','proposal_sent','wrong_person',
  'invalid_number','not_interested','sale_completed','other'
));

create index if not exists calls_lead_outcome_started_idx
  on public.calls(lead_id, outcome, started_at desc);

commit;
