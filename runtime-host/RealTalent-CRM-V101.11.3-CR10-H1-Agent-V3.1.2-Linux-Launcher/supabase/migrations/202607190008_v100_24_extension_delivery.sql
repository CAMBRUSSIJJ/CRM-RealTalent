-- RealTalent CRM V100.24 — telemetria operacional da Extensão RealTalent V8.2.0.
begin;

alter table public.integration_connections
  add column if not exists client_version text,
  add column if not exists connection_name text,
  add column if not exists last_batch_id text,
  add column if not exists last_latency_ms integer;

alter table public.integration_connections
  drop constraint if exists integration_connections_last_latency_ms_check;
alter table public.integration_connections
  add constraint integration_connections_last_latency_ms_check
  check (last_latency_ms is null or last_latency_ms >= 0);

create index if not exists integration_events_extension_tests_idx
  on public.integration_events(organization_id, created_at desc)
  where provider = 'extension' and event_type = 'connection_test';

comment on column public.integration_connections.client_version is 'Última versão declarada pelo cliente da integração.';
comment on column public.integration_connections.connection_name is 'Nome operacional declarado pela instalação da extensão.';
comment on column public.integration_connections.last_batch_id is 'Identificador idempotente do último lote recebido.';
comment on column public.integration_connections.last_latency_ms is 'Latência observada no último teste quando informada pelo cliente.';

commit;
