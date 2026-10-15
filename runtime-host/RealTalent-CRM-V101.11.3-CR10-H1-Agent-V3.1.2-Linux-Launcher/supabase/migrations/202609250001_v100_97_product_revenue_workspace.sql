-- V100.97.0 — Product & Revenue Workspace
-- Amplia o catálogo com custo, tipo/unidade comercial e desconto padrão.

alter table public.products
  add column if not exists unit_cost numeric(14,2) not null default 0,
  add column if not exists product_kind text not null default 'service',
  add column if not exists unit_label text not null default 'unidade',
  add column if not exists default_discount_percent numeric(7,4) not null default 0;

do $$ begin
  alter table public.products add constraint products_product_kind_check check (product_kind in ('product','service'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.products add constraint products_unit_cost_nonnegative check (unit_cost >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.products add constraint products_default_discount_range check (default_discount_percent >= 0 and default_discount_percent <= 100);
exception when duplicate_object then null; end $$;

comment on column public.products.unit_cost is 'Custo unitário usado para leitura comercial de margem; não substitui contabilidade.';
comment on column public.products.product_kind is 'Classificação comercial: product ou service.';
comment on column public.products.unit_label is 'Unidade comercial exibida ao vendedor (licença, hora, projeto, unidade...).';
comment on column public.products.default_discount_percent is 'Desconto sugerido ao inserir o item em uma proposta.';
