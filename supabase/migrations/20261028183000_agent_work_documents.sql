-- STAGED ONLY: Agent V5.3 memory. Do not deploy directly to production.
-- Apply to test branch after RLS verification; user owns every document.
create table if not exists public.agent_work_documents (
  workspace_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  document jsonb,
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id),
  constraint agent_work_document_size check (document is null or octet_length(document::text) <= 250000),
  constraint agent_work_document_object check (document is null or jsonb_typeof(document) = 'object')
);

create index if not exists agent_work_documents_user_idx on public.agent_work_documents(user_id);
alter table public.agent_work_documents enable row level security;
revoke all on public.agent_work_documents from public,anon,authenticated;
grant select,insert,update,delete on public.agent_work_documents to authenticated;

create policy "agent_work_select_own" on public.agent_work_documents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "agent_work_insert_own" on public.agent_work_documents
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "agent_work_update_own" on public.agent_work_documents
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "agent_work_delete_own" on public.agent_work_documents
  for delete to authenticated using (user_id = (select auth.uid()));

comment on table public.agent_work_documents is
  'User-private versioned Agent working artifact; not a shared workspace document. Cloud memory optional until migration is approved.';
