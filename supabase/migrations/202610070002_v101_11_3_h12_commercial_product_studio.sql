begin;

-- V101.11.3-H12 — Commercial Product Studio & Catalog-First Proposals
-- O catálogo passa a ser a fonte de verdade comercial; conhecimento de venda fica no produto.

alter table public.products
  add column if not exists value_proposition text not null default '',
  add column if not exists target_customer text not null default '',
  add column if not exists sales_notes text not null default '';

comment on column public.products.value_proposition is 'Proposta de valor comercial consumida pelo Product Studio, Playbook e execução de vendas.';
comment on column public.products.target_customer is 'Perfil de cliente/público principal do produto ou serviço.';
comment on column public.products.sales_notes is 'Conhecimento comercial livre: argumentos, objeções, provas, concorrentes e orientações de venda.';

commit;
