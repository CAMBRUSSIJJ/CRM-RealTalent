-- V100.65.0 — Coaching & Playbooks
-- Evolui playbooks sem acoplar gravação/transcrição ao CRM.

alter table public.playbooks
  add column if not exists guidance jsonb not null default '{}'::jsonb;

alter table public.playbooks drop constraint if exists playbooks_kind_check;
alter table public.playbooks
  add constraint playbooks_kind_check check (kind in ('script','objection','battlecard','checklist'));

comment on column public.playbooks.guidance is
  'Regras contextuais do playbook: objetivos, etapas, personas, resultados, temperaturas e critérios de coaching.';

create index if not exists playbooks_guidance_gin_idx on public.playbooks using gin (guidance);
