begin;

-- V101.11.3-H13 — Product Readiness, Offer Builder & Revenue Contract Bridge

alter table public.products
  add column if not exists pricing_mode text not null default 'fixed',
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists sales_problems jsonb not null default '[]'::jsonb,
  add column if not exists sales_benefits jsonb not null default '[]'::jsonb,
  add column if not exists discovery_questions jsonb not null default '[]'::jsonb,
  add column if not exists objection_notes jsonb not null default '[]'::jsonb,
  add column if not exists sales_proofs jsonb not null default '[]'::jsonb,
  add column if not exists competitors jsonb not null default '[]'::jsonb,
  add column if not exists bundle_items jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.products add constraint products_pricing_mode_check check (pricing_mode in ('fixed','from','quote','free','custom'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.products add constraint products_lifecycle_status_check check (lifecycle_status in ('draft','ready','active','archived'));
exception when duplicate_object then null; end $$;

update public.products
set lifecycle_status = case when active then 'active' else 'archived' end
where lifecycle_status is null or lifecycle_status not in ('draft','ready','active','archived');

alter table public.revenue_entries
  add column if not exists source text not null default 'manual',
  add column if not exists schedule_key text,
  add column if not exists installment_index integer,
  add column if not exists installment_count integer;

do $$ begin
  alter table public.revenue_entries add constraint revenue_entries_source_check check (source in ('manual','proposal_schedule'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.revenue_entries add constraint revenue_entries_installment_index_check check (installment_index is null or installment_index >= 1);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.revenue_entries add constraint revenue_entries_installment_count_check check (installment_count is null or installment_count >= 1);
exception when duplicate_object then null; end $$;

create unique index if not exists revenue_entries_schedule_key_unique
  on public.revenue_entries(organization_id, schedule_key)
  where schedule_key is not null;

comment on column public.products.pricing_mode is 'Semântica comercial do preço: fixed, from, quote, free ou custom.';
comment on column public.products.lifecycle_status is 'Ciclo comercial: draft, ready, active ou archived.';
comment on column public.products.bundle_items is 'Componentes de uma oferta reutilizável [{productId,quantity}].';
comment on column public.revenue_entries.source is 'Origem do lançamento: manual ou proposal_schedule.';
comment on column public.revenue_entries.schedule_key is 'Chave idempotente do plano automático de receita criado a partir de proposta aceita.';

commit;
