begin;

-- V101.11.3-H22.7 — fixa o search_path do helper imutável de regras de acesso.
-- Evita resolução de objetos por schemas mutáveis e elimina o warning do advisor
-- sem alterar o comportamento funcional do helper.

alter function public.rt_access_default_rules(text)
  set search_path = public, pg_temp;

commit;
