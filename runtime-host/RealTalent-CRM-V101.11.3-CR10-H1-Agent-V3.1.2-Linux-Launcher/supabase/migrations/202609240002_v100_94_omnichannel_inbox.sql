-- RealTalent CRM V100.94 — Omnichannel Inbox
-- Expande o modelo oficial de comunicação para canais sociais sem habilitar automação
-- onde o provedor não oferece uma capability de mensagens aprovada.
begin;

alter table public.communication_threads
  drop constraint if exists communication_threads_channel_check;
alter table public.communication_threads
  add constraint communication_threads_channel_check
  check (channel in ('email','whatsapp','instagram','facebook','linkedin','calendar'));

alter table public.communication_events
  drop constraint if exists communication_events_channel_check;
alter table public.communication_events
  add constraint communication_events_channel_check
  check (channel in ('email','whatsapp','instagram','facebook','linkedin','calendar','call','meeting','note','system'));

comment on table public.communication_events is
  'Timeline oficial e auditável de e-mail, WhatsApp, redes sociais, calendário e interações comerciais por lead. Canais sociais só devem ser ingeridos oficialmente quando a integração possuir capability correspondente.';

commit;
