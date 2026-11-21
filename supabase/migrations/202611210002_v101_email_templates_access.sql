-- RealTalent CRM V101 — modelos de e-mail: quem vê e quem edita.
-- Antes: todo membro via modelos particulares dos colegas e editava modelos compartilhados de outros.
-- Agora: vê os compartilhados e os próprios; cria em nome próprio; edita/exclui os próprios (admin edita todos).

begin;

drop policy if exists email_templates_select on public.email_templates;
drop policy if exists email_templates_write on public.email_templates;
drop policy if exists email_templates_insert on public.email_templates;
drop policy if exists email_templates_update on public.email_templates;
drop policy if exists email_templates_delete on public.email_templates;

create policy email_templates_select on public.email_templates for select to authenticated
  using (public.is_organization_member(organization_id) and (shared or created_by = (select auth.uid())));
create policy email_templates_insert on public.email_templates for insert to authenticated
  with check (public.is_organization_member(organization_id) and created_by = (select auth.uid()));
create policy email_templates_update on public.email_templates for update to authenticated
  using (public.is_organization_member(organization_id) and (created_by = (select auth.uid()) or public.is_organization_admin(organization_id)))
  with check (public.is_organization_member(organization_id) and (created_by = (select auth.uid()) or public.is_organization_admin(organization_id)));
create policy email_templates_delete on public.email_templates for delete to authenticated
  using (public.is_organization_member(organization_id) and (created_by = (select auth.uid()) or public.is_organization_admin(organization_id)));

revoke all on public.email_templates from anon;
create index if not exists email_templates_created_by_idx on public.email_templates(created_by);

commit;
