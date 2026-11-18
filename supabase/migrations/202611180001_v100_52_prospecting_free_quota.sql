-- RealTalent CRM V100.52 — Garimpo: trava da cota gratuita do Google Places
-- Conta as chamadas pagas por mês (período de cobrança do Google) e bloqueia antes de ultrapassar o limite gratuito.
-- O contador é global do projeto, porque a chave do Google é única para todos os workspaces.

begin;

create table if not exists public.provider_usage_counters (
  provider text not null,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  calls integer not null default 0 check (calls >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, period)
);

-- Sem políticas: somente a service_role (Edge Functions) lê e grava.
alter table public.provider_usage_counters enable row level security;
revoke all on table public.provider_usage_counters from anon, authenticated;

-- Reserva uma chamada se ainda houver cota. Retorna o total após a reserva, ou -1 quando o limite já foi atingido.
create or replace function public.consume_provider_quota(p_provider text, p_period text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_calls integer;
begin
  insert into public.provider_usage_counters (provider, period, calls)
  values (p_provider, p_period, 0)
  on conflict (provider, period) do nothing;

  update public.provider_usage_counters
     set calls = calls + 1, updated_at = now()
   where provider = p_provider and period = p_period and calls < p_limit
  returning calls into v_calls;

  return coalesce(v_calls, -1);
end;
$$;

revoke execute on function public.consume_provider_quota(text, text, integer) from public, anon, authenticated;
grant execute on function public.consume_provider_quota(text, text, integer) to service_role;

comment on table public.provider_usage_counters is 'Chamadas mensais a provedores pagos (ex.: Google Places) para manter o uso dentro da cota gratuita.';

commit;
