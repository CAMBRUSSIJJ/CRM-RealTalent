-- Fase 1 (PRD): funções SECURITY DEFINER que qualquer visitante sem login podia executar.
-- O PostgreSQL concede EXECUTE ao grupo PUBLIC por padrão, e anon/authenticated herdam dele;
-- por isso cada revogação inclui PUBLIC.
--
-- Três grupos:
--   1. Gatilhos: só o banco os chama. O EXECUTE é checado ao criar o gatilho, não ao disparar,
--      então revogar não muda o comportamento.
--   2. Internas: chamadas só por outras funções SECURITY DEFINER (merge_duplicate_leads,
--      set_sales_proposal_status, save_sales_proposal), que rodam como dono.
--      reassign_official_sales_proposal_v10044 não checava permissão nenhuma e alterava
--      propostas e valores de negócios de qualquer empresa.
--   3. Chamadas pelo app com usuário logado: continuam para authenticated, saem de anon.
--      Todas já checam papel por is_organization_admin/is_organization_member ou auth.uid().
--
-- Continuam públicas (protegidas pelo token secreto do link): get_buyer_room_public,
-- track_buyer_room_public_open, track_buyer_room_public_document,
-- update_buyer_room_public_step, add_buyer_room_public_comment.

-- 1. Gatilhos
revoke execute on function public.audit_crm_change() from public, anon, authenticated;
revoke execute on function public.capture_lead_location_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_lead_history_v100564() from public, anon, authenticated;
revoke execute on function public.protect_organization_owner() from public, anon, authenticated;
revoke execute on function public.protect_sales_proposal_history_v10044() from public, anon, authenticated;
revoke execute on function public.rt_enforce_assignment_permission() from public, anon, authenticated;
revoke execute on function public.rt_seed_access_profiles_after_org() from public, anon, authenticated;
revoke execute on function public.sync_lead_next_action_from_activity() from public, anon, authenticated;
revoke execute on function public.sync_primary_contact_identity_from_lead() from public, anon, authenticated;
revoke execute on function public.sync_primary_lead_identity_from_contact() from public, anon, authenticated;
revoke execute on function public.touch_lead_last_contact_from_activity() from public, anon, authenticated;
revoke execute on function public.touch_lead_last_contact_from_call() from public, anon, authenticated;
revoke execute on function public.track_lead_stage_change() from public, anon, authenticated;

-- 2. Internas
revoke execute on function public.reassign_official_sales_proposal_v10044(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.production_readiness(uuid) from public, anon, authenticated;
revoke execute on function public.next_sales_proposal_number(uuid) from public, anon, authenticated;
revoke execute on function public.resolve_system_health_event(uuid, text) from public, anon, authenticated;

-- 3. Só usuário logado
revoke execute on function public.accept_organization_invite(text) from public, anon;
revoke execute on function public.clear_organization_operational_data(uuid) from public, anon;
revoke execute on function public.create_organization_invite(uuid, text, public.organization_role) from public, anon;
revoke execute on function public.create_organization_with_defaults(text) from public, anon;
revoke execute on function public.create_sales_proposal_revision(uuid, uuid) from public, anon;
revoke execute on function public.remove_organization_member(uuid, uuid) from public, anon;
revoke execute on function public.revoke_organization_invite(uuid) from public, anon;
revoke execute on function public.set_official_sales_proposal(uuid, uuid) from public, anon;
revoke execute on function public.update_organization_member_role(uuid, uuid, public.organization_role) from public, anon;
grant execute on function public.accept_organization_invite(text) to authenticated;
grant execute on function public.clear_organization_operational_data(uuid) to authenticated;
grant execute on function public.create_organization_invite(uuid, text, public.organization_role) to authenticated;
grant execute on function public.create_organization_with_defaults(text) to authenticated;
grant execute on function public.create_sales_proposal_revision(uuid, uuid) to authenticated;
grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_organization_invite(uuid) to authenticated;
grant execute on function public.set_official_sales_proposal(uuid, uuid) to authenticated;
grant execute on function public.update_organization_member_role(uuid, uuid, public.organization_role) to authenticated;
