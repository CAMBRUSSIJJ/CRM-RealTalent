import type {
  ActivityItem, AutomationAction, AutomationCondition, AutomationRule, AutomationRun, AutomationRunOutput, AutomationRunStatus, BuyerRoom, BuyerRoomActivity, CalendarEvent, CalendarEventStatus, CallOutcome, CallRecord, CommercialStructureSyncResult, CompanyRecord, ContactRecord, ContactRelationship, DashboardStats, Goal, GoalMetric, Lead, OpportunityRecord, PipelineStage, Playbook, ProductRecord, ProposalLineItem, ProposalRecord, ProposalStatus, RevenueEntry, SocialProfile,
  AuditLog, RepositoryHealth, Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceSnapshot,
} from '../domain/types'
import { getSupabaseClient } from '../lib/supabase'
import { BACKUP_SCHEMA_VERSION } from '../lib/app-version'
import { createBuyerRoomShareToken } from '../services/buyer-room'
import type { Database } from '../lib/supabase.types'
import { fetchAllRows } from './supabase-pagination'
import type {
  CommercialActionResult, CommercialActivityResult, CrmRepository, OperationalDataClearResult, NewWorkspaceMemberInput, NewActivityInput, NewAutomationRuleInput, NewAutomationRunInput, NewBuyerRoomInput, NewCalendarEventInput, NewCallInput, NewCompanyInput, NewContactInput, NewContactRelationshipInput, NewGoalInput, NewLeadInput, NewPlaybookInput, NewProductInput, NewProposalInput, NewRevenueEntryInput, NewStageInput, RegisterActivityOutcomeInput, RegisterCallOutcomeInput,
  UpdateActivityInput, UpdateAutomationRuleInput, UpdateBuyerRoomInput, UpdateCalendarEventInput, UpdateCompanyInput, UpdateContactInput, UpdateContactRelationshipInput, UpdateGoalInput, UpdateLeadInput, UpdatePlaybookInput, UpdateProductInput, UpdateProposalInput, UpdateStageInput,
} from './crm-repository'
import type {LeadRow,StageRow,ActivityRow,EventRow,PlaybookRow,GoalRow,AutomationRuleRow,AutomationRunRow,ProductRow,ProposalRow,ProposalItemRow,RevenueRow} from './supabase-repository-mappers'
import {mapCompany,mapContact,mapContactRelationship,mapOpportunity,mapSocialProfile,mapStage,mapActivity,mapCall,mapEvent,mapPlaybook,mapGoal,mapAutomationRule,mapProduct,mapProposalItem,mapProposal,mapBuyerRoom,mapRevenueEntry,mapAutomationRun,recordingExtension} from './supabase-repository-mappers'
import { productInsertPayload, productUpdatePayload } from './supabase-product-payloads'
import { mapLeadWithWorkspaceOwner, mapLeadsWithWorkspaceOwners } from './supabase-lead-owner'
import {getSupabaseCallRecordingUrl,listAllSupabaseCalls,listSupabaseCalls,listSupabaseCallsPage} from './supabase-call-history'

const requireClient = () => {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase não configurado. Verifique o arquivo .env.')
  return client
}


const finiteNumber = (value: unknown, fallback = 0) => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const contactIdentityPayloadFromLead = (row: Record<string, any>, input: UpdateLeadInput): Record<string, unknown> => ({
  ...(input.name !== undefined ? { name: row.name } : {}),
  ...(input.phone !== undefined ? { phone: row.phone ?? '' } : {}),
  ...(input.email !== undefined ? { email: String(row.email ?? '').trim().toLocaleLowerCase('pt-BR') } : {}),
  ...(input.jobTitle !== undefined ? { job_title: row.job_title ?? '' } : {}),
  ...(input.decisionRole !== undefined ? { decision_role: row.decision_role ?? 'unknown' } : {}),
  ...(input.influenceLevel !== undefined ? { influence_level: row.influence_level ?? 0 } : {}),
  ...(input.consentStatus !== undefined ? { consent_status: row.consent_status ?? 'unknown' } : {}),
  ...(input.doNotContact !== undefined ? { do_not_contact: Boolean(row.do_not_contact) } : {}),
  ...(input.doNotContactReason !== undefined ? { do_not_contact_reason: row.do_not_contact_reason ?? '' } : {}),
})

const leadIdentityPayloadFromContact = (row: Record<string, any>, input: UpdateContactInput): Record<string, unknown> => ({
  ...(input.name !== undefined ? { name: row.name } : {}),
  ...(input.phone !== undefined ? { phone: row.phone ?? '' } : {}),
  ...(input.email !== undefined ? { email: String(row.email ?? '').trim().toLocaleLowerCase('pt-BR') } : {}),
  ...(input.jobTitle !== undefined ? { job_title: row.job_title ?? '' } : {}),
  ...(input.decisionRole !== undefined ? { decision_role: row.decision_role ?? 'unknown' } : {}),
  ...(input.influenceLevel !== undefined ? { influence_level: row.influence_level ?? 0 } : {}),
  ...(input.consentStatus !== undefined ? { consent_status: row.consent_status ?? 'unknown' } : {}),
  ...(input.doNotContact !== undefined ? { do_not_contact: Boolean(row.do_not_contact) } : {}),
  ...(input.doNotContactReason !== undefined ? { do_not_contact_reason: row.do_not_contact_reason ?? '' } : {}),
})


const companyCanonicalPayloadFromLead = (row: Record<string, any>, input: UpdateLeadInput): Record<string, unknown> => ({
  ...(input.company !== undefined ? { name: String(row.company ?? '').trim() || String(row.name ?? '').trim() } : {}),
  ...(input.cnpj !== undefined ? { cnpj: row.cnpj ?? '' } : {}),
  ...(input.website !== undefined ? { website: row.website ?? '' } : {}),
  ...(input.city !== undefined ? { city: row.city ?? '' } : {}),
  ...(input.state !== undefined ? { state: row.state ?? '' } : {}),
})

const opportunityCanonicalPayloadFromLead = (row: Record<string, any>, input: UpdateLeadInput): Record<string, unknown> => ({
  ...(input.companyId !== undefined ? { company_id: row.company_id ?? null } : {}),
  ...(input.primaryContactId !== undefined ? { primary_contact_id: row.primary_contact_id ?? null } : {}),
  ...(input.stageId !== undefined ? { stage_id: row.stage_id } : {}),
  ...((input.status !== undefined || input.stageId !== undefined) ? { status: row.status } : {}),
  ...(input.value !== undefined ? { value: row.value ?? 0 } : {}),
  ...(input.ownerId !== undefined ? { owner_id: row.owner_id ?? null } : {}),
  ...(input.expectedCloseAt !== undefined ? { expected_close_at: row.expected_close_at ?? null } : {}),
})

const isValidDateValue = (value: string | null | undefined) => !value || !Number.isNaN(Date.parse(value))
const isValidDateOnly = (value: string | null | undefined) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

const assertDateTime = (value: string | null | undefined, label: string) => {
  if (!isValidDateValue(value)) throw new Error(`${label} possui uma data inválida.`)
}

const assertDateOnly = (value: string | null | undefined, label: string) => {
  if (!isValidDateOnly(value)) throw new Error(`${label} possui uma data inválida.`)
}

const assertDateRange = (startsAt: string, endsAt: string, label: string) => {
  assertDateTime(startsAt, `${label}: início`)
  assertDateTime(endsAt, `${label}: término`)
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) throw new Error(`${label}: o término precisa ser posterior ao início.`)
}

const assertDateOnlyRange = (startsAt: string | null | undefined, endsAt: string | null | undefined, label: string) => {
  assertDateOnly(startsAt, `${label}: início`)
  assertDateOnly(endsAt, `${label}: término`)
  if (startsAt && endsAt && endsAt < startsAt) throw new Error(`${label}: a data final não pode ser anterior à inicial.`)
}

const assertProposalPayload = (proposal: {
  title: string
  probability: number
  validUntil: string | null
  expectedCloseAt: string | null
  contractStartAt: string | null
  contractEndAt: string | null
  contractTermMonths: number
  postSaleStartAt: string | null
  items: Array<{ name: string; quantity: number; unitPrice: number; discountPercent: number; taxRate: number }>
}) => {
  if (!proposal.title.trim()) throw new Error('Informe um título para a proposta.')
  if (!Number.isFinite(Number(proposal.probability)) || Number(proposal.probability) < 0 || Number(proposal.probability) > 100) throw new Error('A probabilidade da proposta deve ficar entre 0 e 100%.')
  if (!Number.isFinite(Number(proposal.contractTermMonths)) || Number(proposal.contractTermMonths) < 1) throw new Error('O prazo contratual precisa ser maior que zero.')
  assertDateOnly(proposal.validUntil, 'Validade da proposta')
  assertDateOnly(proposal.expectedCloseAt, 'Previsão de fechamento')
  assertDateOnlyRange(proposal.contractStartAt, proposal.contractEndAt, 'Período contratual')
  assertDateOnly(proposal.postSaleStartAt, 'Início do pós-venda')
  if (!proposal.items.length) throw new Error('Adicione ao menos um item à proposta.')
  proposal.items.forEach((item, index) => {
    if (!item.name.trim()) throw new Error(`O item ${index + 1} precisa de um nome.`)
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) throw new Error(`Quantidade inválida no item ${index + 1}.`)
    if (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) throw new Error(`Preço inválido no item ${index + 1}.`)
    if (!Number.isFinite(Number(item.discountPercent)) || Number(item.discountPercent) < 0 || Number(item.discountPercent) > 100) throw new Error(`Desconto inválido no item ${index + 1}.`)
    if (!Number.isFinite(Number(item.taxRate)) || Number(item.taxRate) < 0) throw new Error(`Imposto inválido no item ${index + 1}.`)
  })
}

export class SupabaseCrmRepository implements CrmRepository {
  readonly mode = 'supabase' as const

  private async mapLeadWithOwner(row: LeadRow, workspaceId = row.organization_id) {
    return mapLeadWithWorkspaceOwner(row, await this.listWorkspaceMembers(workspaceId))
  }

  private async syncLeadNextAction(leadId: string | null) {
    if (!leadId) return
    const client = requireClient()
    const { data, error } = await client.from('activities').select('due_at')
      .eq('lead_id', leadId).is('completed_at', null).not('due_at', 'is', null)
      .in('activity_type', ['followup', 'meeting', 'call']).order('due_at').limit(1)
    if (error) throw error
    const { error: updateError } = await client.from('leads').update({ next_action_at: data?.[0]?.due_at ?? null }).eq('id', leadId)
    if (updateError) throw updateError
  }

  async initialize() {
    const client = requireClient(); const { error } = await client.auth.getSession(); if (error) throw error
  }

  async health(): Promise<RepositoryHealth> {
    try {
      const client = requireClient(); const { error } = await client.from('organizations').select('id', { count: 'exact', head: true }); if (error) throw error
      return { mode: this.mode, connected: true, message: 'Conectado ao Supabase com sessão protegida.', checkedAt: new Date().toISOString() }
    } catch (error) {
      return { mode: this.mode, connected: false, message: error instanceof Error ? error.message : 'Falha de conexão.', checkedAt: new Date().toISOString() }
    }
  }

  async listWorkspaces() {
    const client = requireClient()
    const { data, error } = await client.from('organization_members').select('role, organizations!inner(id,name,slug,created_at)').order('created_at', { foreignTable: 'organizations' })
    if (error) throw error
    return (data ?? []).map((item) => {
      const organization = item.organizations as unknown as { id: string; name: string; slug: string; created_at: string }
      return { id: organization.id, name: organization.name, slug: organization.slug, role: item.role, createdAt: organization.created_at } satisfies Workspace
    })
  }

  async createWorkspace(name: string) {
    const client = requireClient(); const { data, error } = await client.rpc('create_organization_with_defaults', { p_name: name.trim() }); if (error) throw error
    const workspace = (await this.listWorkspaces()).find((item) => item.id === data)
    if (!workspace) throw new Error('Workspace criado, mas não foi possível carregá-lo.')
    return workspace
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const client = requireClient()
    const { data, error } = await client.from('organization_members').select('organization_id,user_id,role,created_at,profiles!inner(display_name,email,avatar_url)').eq('organization_id', workspaceId).order('created_at')
    if (error) throw error
    return (data ?? []).map((row) => {
      const profile = row.profiles as unknown as { display_name: string; email: string; avatar_url: string | null }
      return { workspaceId: row.organization_id, userId: row.user_id, displayName: profile.display_name || profile.email.split('@')[0], email: profile.email, avatarUrl: profile.avatar_url, role: row.role, joinedAt: row.created_at }
    })
  }

  async createWorkspaceMember(_workspaceId: string, _input: NewWorkspaceMemberInput): Promise<WorkspaceMember> {
    throw new Error('Membros locais sem login estão disponíveis apenas no modo local. Em produção, use convites de equipe.')
  }

  async createWorkspaceInvite(workspaceId: string, email: string, role: 'admin' | 'member' | 'viewer'): Promise<WorkspaceInvite> {
    const client = requireClient(); const { data, error } = await client.rpc('create_organization_invite', { p_organization_id: workspaceId, p_email: email.trim().toLowerCase(), p_role: role }); if (error) throw error
    const value = data as unknown as Record<string, unknown>
    return { id: String(value.id), workspaceId, token: String(value.token), email: String(value.email), role: String(value.role) as WorkspaceInvite['role'], expiresAt: String(value.expires_at), acceptedAt: null, revokedAt: null, createdAt: String(value.created_at) }
  }

  async listWorkspaceInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    const client = requireClient(); const { data, error } = await client.from('organization_invites').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }); if (error) throw error
    return (data ?? []).map((row) => ({ id: row.id, workspaceId: row.organization_id, token: row.token, email: row.email, role: row.role, expiresAt: row.expires_at, acceptedAt: row.accepted_at, revokedAt: row.revoked_at, createdAt: row.created_at }))
  }

  async revokeWorkspaceInvite(inviteId: string) { const client = requireClient(); const { error } = await client.rpc('revoke_organization_invite', { p_invite_id: inviteId }); if (error) throw error }

  async acceptWorkspaceInvite(token: string) {
    const client = requireClient(); const { data, error } = await client.rpc('accept_organization_invite', { p_token: token }); if (error) throw error
    const workspace = (await this.listWorkspaces()).find((item) => item.id === data); if (!workspace) throw new Error('Convite aceito, mas o workspace não pôde ser carregado.')
    return workspace
  }

  async updateWorkspaceMemberRole(workspaceId: string, userId: string, role: 'admin' | 'member' | 'viewer') { const client = requireClient(); const { error } = await client.rpc('update_organization_member_role', { p_organization_id: workspaceId, p_user_id: userId, p_role: role }); if (error) throw error }

  async removeWorkspaceMember(workspaceId: string, userId: string) { const client = requireClient(); const { error } = await client.rpc('remove_organization_member', { p_organization_id: workspaceId, p_user_id: userId }); if (error) throw error }

  async listAuditLogs(workspaceId: string, limit = 100): Promise<AuditLog[]> {
    const client = requireClient(); const { data, error } = await client.from('audit_logs').select('id,organization_id,user_id,action,entity_type,entity_id,created_at').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(limit); if (error) throw error
    const userIds = Array.from(new Set((data ?? []).map((row) => row.user_id).filter((value): value is string => Boolean(value))))
    const names = new Map<string, string>()
    if (userIds.length) {
      const { data: profiles, error: profilesError } = await client.from('profiles').select('id,display_name').in('id', userIds); if (profilesError) throw profilesError
      for (const profile of profiles ?? []) names.set(profile.id, profile.display_name)
    }
    return (data ?? []).map((row) => ({ id: String(row.id), workspaceId: row.organization_id, userId: row.user_id, userName: row.user_id ? (names.get(row.user_id) ?? 'Usuário') : 'Sistema', action: row.action, entityType: row.entity_type, entityId: row.entity_id, createdAt: row.created_at }))
  }

  async exportWorkspace(workspaceId: string) {
    const client = requireClient()
    const [snapshot, members, auditLogs, calls] = await Promise.all([
      this.getSnapshot(workspaceId), this.listWorkspaceMembers(workspaceId), this.listAuditLogs(workspaceId, 1000),
      listAllSupabaseCalls(client, workspaceId),
    ])
    return { version: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), snapshot: { ...snapshot, calls }, members, auditLogs }
  }

  async clearOperationalData(workspaceId: string) {
    const client = requireClient(); const { data, error } = await client.rpc('clear_organization_operational_data', { p_organization_id: workspaceId }); if (error) throw error
    const result = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>; return { cleared: result.cleared !== false, total: Number(result.total ?? 0) }
  }

  async getSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
    const [workspaces, stages, leads, activities, calls, events, playbooks, goals, automationRules, automationRuns, companies, contacts, contactRelationships, opportunities, socialProfiles, products, proposals, buyerRooms, revenueEntries] = await Promise.all([
      this.listWorkspaces(), this.listStages(workspaceId), this.listLeads(workspaceId), this.listActivities(workspaceId),
      this.listCalls(workspaceId), this.listCalendarEvents(workspaceId), this.listPlaybooks(workspaceId), this.listGoals(workspaceId),
      this.listAutomationRules(workspaceId), this.listAutomationRuns(workspaceId), this.listCompanies(workspaceId), this.listContacts(workspaceId), this.listContactRelationships(workspaceId),
      this.listOpportunities(workspaceId), this.listSocialProfiles(workspaceId), this.listProducts(workspaceId), this.listProposals(workspaceId), this.listBuyerRooms(workspaceId), this.listRevenueEntries(workspaceId),
    ])
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (!workspace) throw new Error('Workspace não encontrado ou sem acesso.')
    return { workspace, stages, leads, activities, calls, events, playbooks, goals, automationRules, automationRuns, companies, contacts, contactRelationships, opportunities, socialProfiles, products, proposals, buyerRooms, revenueEntries }
  }

  async synchronizeCommercialStructure(workspaceId: string): Promise<CommercialStructureSyncResult> {
    const client = requireClient() as any; const { data, error } = await client.rpc('sync_commercial_structure', { p_organization_id: workspaceId }); if (error) throw error
    return { companiesCreated: Number(data?.companiesCreated ?? data?.companiescreated ?? 0), contactsCreated: Number(data?.contactsCreated ?? data?.contactscreated ?? 0), opportunitiesCreated: Number(data?.opportunitiesCreated ?? data?.opportunitiescreated ?? 0), socialProfilesCreated: Number(data?.socialProfilesCreated ?? data?.socialprofilescreated ?? 0), leadsLinked: Number(data?.leadsLinked ?? data?.leadslinked ?? 0) }
  }

  async listLeads(workspaceId: string) {
    const client = requireClient()
    const [rows, members] = await Promise.all([
      fetchAllRows<LeadRow>((from, to) => client.from('leads').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }).order('id').range(from, to)),
      this.listWorkspaceMembers(workspaceId),
    ])
    return mapLeadsWithWorkspaceOwners(rows, members)
  }

  async listCompanies(workspaceId: string) {
    const client = requireClient() as any
    const rows = await fetchAllRows<Record<string, any>>((from, to) => client.from('companies').select('*').eq('organization_id', workspaceId).order('name').order('id').range(from, to))
    return rows.map(mapCompany)
  }

  async createCompany(input: NewCompanyInput) {
    const client = requireClient() as any
    const payload = { organization_id: input.workspaceId, name: input.name.trim(), legal_name: input.legalName ?? '', cnpj: input.cnpj ?? '', domain: (input.domain ?? '').trim().toLocaleLowerCase('pt-BR'), website: input.website ?? '', segment: input.segment ?? '', phone: input.phone ?? '', city: input.city ?? '', state: input.state ?? '', status: input.status ?? 'prospect', lead_ids: input.leadIds ?? [] }
    const { data, error } = await client.from('companies').insert(payload).select().single(); if (error) throw error; return mapCompany(data)
  }

  async updateCompany(companyId: string, input: UpdateCompanyInput) {
    const client = requireClient() as any
    const payload: Record<string, unknown> = { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.legalName !== undefined ? { legal_name: input.legalName } : {}), ...(input.cnpj !== undefined ? { cnpj: input.cnpj } : {}), ...(input.domain !== undefined ? { domain: input.domain.trim().toLocaleLowerCase('pt-BR') } : {}), ...(input.website !== undefined ? { website: input.website } : {}), ...(input.segment !== undefined ? { segment: input.segment } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}), ...(input.city !== undefined ? { city: input.city } : {}), ...(input.state !== undefined ? { state: input.state } : {}), ...(input.status !== undefined ? { status: input.status } : {}), ...(input.leadIds !== undefined ? { lead_ids: input.leadIds } : {}) }
    const { data, error } = await client.from('companies').update(payload).eq('id', companyId).select().single(); if (error) throw error; return mapCompany(data)
  }

  async listContacts(workspaceId: string) {
    const client = requireClient() as any
    const rows = await fetchAllRows<Record<string, any>>((from, to) => client.from('contacts').select('*').eq('organization_id', workspaceId).order('name').order('id').range(from, to))
    return rows.map(mapContact)
  }

  async listContactRelationships(workspaceId: string) {
    const client = requireClient() as any
    const rows = await fetchAllRows<Record<string, any>>((from, to) => client.from('contact_relationships').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }).order('id').range(from, to))
    return rows.map(mapContactRelationship)
  }

  async createContact(input: NewContactInput) {
    const client = requireClient() as any
    const { data, error } = await client.from('contacts').insert({ organization_id: input.workspaceId, company_id: input.companyId, name: input.name.trim(), job_title: input.jobTitle ?? '', phone: input.phone ?? '', email: input.email ?? '', decision_role: input.decisionRole ?? 'unknown', influence_level: input.influenceLevel ?? 0, relationship_strength: input.relationshipStrength ?? 'unknown', relationship_score: input.relationshipScore ?? 0, stance: input.stance ?? 'unknown', relationship_owner_id: input.relationshipOwnerId ?? null, relationship_owner_name: input.relationshipOwnerName ?? '', last_contact_at: input.lastContactAt ?? null, next_action_at: input.nextActionAt ?? null, notes: input.notes ?? '', is_primary: input.isPrimary ?? false, consent_status: input.consentStatus ?? 'unknown', do_not_contact: input.doNotContact ?? false, do_not_contact_reason: input.doNotContactReason ?? '', lead_ids: input.leadIds ?? [] }).select().single()
    if (error) throw error; return mapContact(data)
  }

  async updateContact(contactId: string, input: UpdateContactInput) {
    const client = requireClient() as any; const payload: Record<string, unknown> = {
      ...(input.companyId !== undefined ? { company_id: input.companyId } : {}), ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.jobTitle !== undefined ? { job_title: input.jobTitle } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}), ...(input.email !== undefined ? { email: input.email } : {}), ...(input.decisionRole !== undefined ? { decision_role: input.decisionRole } : {}), ...(input.influenceLevel !== undefined ? { influence_level: input.influenceLevel } : {}), ...(input.relationshipStrength !== undefined ? { relationship_strength: input.relationshipStrength } : {}), ...(input.relationshipScore !== undefined ? { relationship_score: input.relationshipScore } : {}), ...(input.stance !== undefined ? { stance: input.stance } : {}), ...(input.relationshipOwnerId !== undefined ? { relationship_owner_id: input.relationshipOwnerId } : {}), ...(input.relationshipOwnerName !== undefined ? { relationship_owner_name: input.relationshipOwnerName } : {}), ...(input.lastContactAt !== undefined ? { last_contact_at: input.lastContactAt } : {}), ...(input.nextActionAt !== undefined ? { next_action_at: input.nextActionAt } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}), ...(input.isPrimary !== undefined ? { is_primary: input.isPrimary } : {}), ...(input.consentStatus !== undefined ? { consent_status: input.consentStatus } : {}), ...(input.doNotContact !== undefined ? { do_not_contact: input.doNotContact } : {}), ...(input.doNotContactReason !== undefined ? { do_not_contact_reason: input.doNotContactReason } : {}), ...(input.leadIds !== undefined ? { lead_ids: input.leadIds } : {})
    }; const { data, error } = await client.from('contacts').update(payload).eq('id', contactId).select().single(); if (error) throw error
    const leadIdentityPayload = leadIdentityPayloadFromContact(data as Record<string, any>, input)
    if (Object.keys(leadIdentityPayload).length) {
      const { error: leadSyncError } = await client.from('leads').update(leadIdentityPayload).eq('organization_id', data.organization_id).eq('primary_contact_id', contactId)
      if (leadSyncError) throw leadSyncError
    }
    return mapContact(data)
  }

  async deleteContact(contactId: string) { const client = requireClient() as any; const { error } = await client.from('contacts').delete().eq('id', contactId); if (error) throw error }

  async createContactRelationship(input: NewContactRelationshipInput) {
    const client = requireClient() as any; const { data, error } = await client.from('contact_relationships').insert({ organization_id: input.workspaceId, company_id: input.companyId, from_contact_id: input.fromContactId, to_contact_id: input.toContactId, relationship_type: input.relationshipType, strength: input.strength, notes: input.notes }).select().single(); if (error) throw error; return mapContactRelationship(data)
  }
  async updateContactRelationship(relationshipId: string, input: UpdateContactRelationshipInput) {
    const client = requireClient() as any; const payload = { ...(input.fromContactId !== undefined ? { from_contact_id: input.fromContactId } : {}), ...(input.toContactId !== undefined ? { to_contact_id: input.toContactId } : {}), ...(input.relationshipType !== undefined ? { relationship_type: input.relationshipType } : {}), ...(input.strength !== undefined ? { strength: input.strength } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}) }; const { data, error } = await client.from('contact_relationships').update(payload).eq('id', relationshipId).select().single(); if (error) throw error; return mapContactRelationship(data)
  }
  async deleteContactRelationship(relationshipId: string) { const client = requireClient() as any; const { error } = await client.from('contact_relationships').delete().eq('id', relationshipId); if (error) throw error }

  async listOpportunities(workspaceId: string) {
    const client = requireClient() as any
    const rows = await fetchAllRows<Record<string, any>>((from, to) => client.from('opportunities').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }).order('id').range(from, to))
    return rows.map(mapOpportunity)
  }

  async listSocialProfiles(workspaceId: string) {
    const client = requireClient() as any
    const rows = await fetchAllRows<Record<string, any>>((from, to) => client.from('social_profiles').select('*').eq('organization_id', workspaceId).order('network').order('id').range(from, to))
    return rows.map(mapSocialProfile)
  }

  async createLead(input: NewLeadInput) {
    const client = requireClient() as any; const { data, error } = await client.from('leads').insert({
      organization_id: input.workspaceId, name: input.name.trim(), company: input.company, phone: input.phone, email: input.email,
      city: input.city, postal_code: input.postalCode ?? '', street: input.street ?? '', address_number: input.addressNumber ?? '', complement: input.complement ?? '', district: input.district ?? '', state: input.state ?? '', country: input.country ?? 'Brasil',
      formatted_address: input.formattedAddress ?? '', latitude: input.latitude ?? null, longitude: input.longitude ?? null, geocode_status: input.geocodeStatus ?? (input.city ? 'approximate' : 'incomplete'),
      geocode_precision: input.geocodePrecision ?? 'unknown', geocode_provider: input.geocodeProvider ?? null, geocode_place_id: input.geocodePlaceId ?? null, geocoded_at: input.geocodedAt ?? null, geocode_error: input.geocodeError ?? null,
      source: input.source, source_detail: input.sourceDetail ?? '', source_url: input.sourceUrl ?? '', captured_at: input.capturedAt ?? new Date().toISOString(), consent_status: input.consentStatus ?? 'unknown', do_not_contact: input.doNotContact ?? false, do_not_contact_reason: input.doNotContactReason ?? '', company_id: input.companyId ?? null, primary_contact_id: input.primaryContactId ?? null, opportunity_id: input.opportunityId ?? null, cnpj: input.cnpj ?? '', website: input.website ?? '', instagram_url: input.instagramUrl ?? '', linkedin_url: input.linkedinUrl ?? '', facebook_url: input.facebookUrl ?? '', job_title: input.jobTitle ?? '', decision_role: input.decisionRole ?? 'unknown', influence_level: input.influenceLevel ?? 0, stage_id: input.stageId, status: input.status, temperature: input.temperature,
      priority: input.priority, owner_id: input.ownerId, value: input.value, next_action_at: input.nextActionAt, last_contact_at: input.lastContactAt, expected_close_at: input.expectedCloseAt ?? null, notes: input.notes, tags: input.tags,
    }).select().single(); if (error) throw error
    const { error: syncError } = await client.rpc('sync_commercial_structure', { p_organization_id: input.workspaceId }); if (syncError) throw syncError
    const { data: synced, error: syncedError } = await client.from('leads').select('*').eq('id', data.id).single(); if (syncedError) throw syncedError
    return this.mapLeadWithOwner(synced, input.workspaceId)
  }

  async updateLead(leadId: string, input: UpdateLeadInput) {
    const client = requireClient() as any; const payload: Record<string, unknown> = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.company !== undefined ? { company: input.company } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}), ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}), ...(input.postalCode !== undefined ? { postal_code: input.postalCode } : {}),
      ...(input.street !== undefined ? { street: input.street } : {}), ...(input.addressNumber !== undefined ? { address_number: input.addressNumber } : {}),
      ...(input.complement !== undefined ? { complement: input.complement } : {}), ...(input.district !== undefined ? { district: input.district } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}), ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.formattedAddress !== undefined ? { formatted_address: input.formattedAddress } : {}), ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}), ...(input.geocodeStatus !== undefined ? { geocode_status: input.geocodeStatus } : {}),
      ...(input.geocodePrecision !== undefined ? { geocode_precision: input.geocodePrecision } : {}), ...(input.geocodeProvider !== undefined ? { geocode_provider: input.geocodeProvider } : {}),
      ...(input.geocodePlaceId !== undefined ? { geocode_place_id: input.geocodePlaceId } : {}), ...(input.geocodedAt !== undefined ? { geocoded_at: input.geocodedAt } : {}),
      ...(input.geocodeError !== undefined ? { geocode_error: input.geocodeError } : {}), ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.sourceDetail !== undefined ? { source_detail: input.sourceDetail } : {}), ...(input.sourceUrl !== undefined ? { source_url: input.sourceUrl } : {}), ...(input.capturedAt !== undefined ? { captured_at: input.capturedAt } : {}),
      ...(input.consentStatus !== undefined ? { consent_status: input.consentStatus } : {}), ...(input.doNotContact !== undefined ? { do_not_contact: input.doNotContact } : {}), ...(input.doNotContactReason !== undefined ? { do_not_contact_reason: input.doNotContactReason } : {}),
      ...(input.companyId !== undefined ? { company_id: input.companyId } : {}), ...(input.primaryContactId !== undefined ? { primary_contact_id: input.primaryContactId } : {}), ...(input.opportunityId !== undefined ? { opportunity_id: input.opportunityId } : {}),
      ...(input.cnpj !== undefined ? { cnpj: input.cnpj } : {}), ...(input.website !== undefined ? { website: input.website } : {}), ...(input.instagramUrl !== undefined ? { instagram_url: input.instagramUrl } : {}), ...(input.linkedinUrl !== undefined ? { linkedin_url: input.linkedinUrl } : {}), ...(input.facebookUrl !== undefined ? { facebook_url: input.facebookUrl } : {}),
      ...(input.jobTitle !== undefined ? { job_title: input.jobTitle } : {}), ...(input.decisionRole !== undefined ? { decision_role: input.decisionRole } : {}), ...(input.influenceLevel !== undefined ? { influence_level: input.influenceLevel } : {}),
      ...(input.stageId !== undefined ? { stage_id: input.stageId } : {}), ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}), ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.ownerId !== undefined ? { owner_id: input.ownerId } : {}), ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.nextActionAt !== undefined ? { next_action_at: input.nextActionAt } : {}), ...(input.lastContactAt !== undefined ? { last_contact_at: input.lastContactAt } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.expectedCloseAt !== undefined ? { expected_close_at: input.expectedCloseAt } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
    }
    const { data, error } = await client.from('leads').update(payload).eq('id', leadId).select().single(); if (error) throw error
    const contactIdentityPayload = contactIdentityPayloadFromLead(data as Record<string, any>, input)
    if (data.primary_contact_id && Object.keys(contactIdentityPayload).length) {
      const { error: contactSyncError } = await client.from('contacts').update(contactIdentityPayload).eq('organization_id', data.organization_id).eq('id', data.primary_contact_id)
      if (contactSyncError) throw contactSyncError
    }
    const companyPayload = companyCanonicalPayloadFromLead(data as Record<string, any>, input)
    if (data.company_id && Object.keys(companyPayload).length) {
      const { error: companySyncError } = await client.from('companies').update(companyPayload).eq('organization_id', data.organization_id).eq('id', data.company_id)
      if (companySyncError) throw companySyncError
    }
    const opportunityPayload = opportunityCanonicalPayloadFromLead(data as Record<string, any>, input)
    if (Object.keys(opportunityPayload).length) {
      let opportunityQuery = client.from('opportunities').update(opportunityPayload).eq('organization_id', data.organization_id)
      opportunityQuery = data.opportunity_id ? opportunityQuery.eq('id', data.opportunity_id) : opportunityQuery.eq('lead_id', leadId)
      const { error: opportunitySyncError } = await opportunityQuery
      if (opportunitySyncError) throw opportunitySyncError
    }
    const { error: syncError } = await client.rpc('sync_commercial_structure', { p_organization_id: data.organization_id }); if (syncError) throw syncError
    const { data: synced, error: syncedError } = await client.from('leads').select('*').eq('id', leadId).single(); if (syncedError) throw syncedError
    return this.mapLeadWithOwner(synced, data.organization_id)
  }

  async moveLead(leadId: string, stageId: string, lossReason?: string | null) {
    const client = requireClient()
    const { data, error } = await client.rpc('move_lead_with_reason', { p_lead_id: leadId, p_stage_id: stageId, p_loss_reason: lossReason ?? null })
    if (error) throw error
    return this.mapLeadWithOwner(data as LeadRow)
  }

  async bulkMoveLeads(workspaceId: string, leadIds: string[], stageId: string, lossReason?: string | null) {
    if (!leadIds.length) return []
    const client = requireClient()
    const { data, error } = await client.rpc('bulk_move_leads_with_reason', { p_organization_id: workspaceId, p_lead_ids: leadIds, p_stage_id: stageId, p_loss_reason: lossReason ?? null })
    if (error) throw error
    return mapLeadsWithWorkspaceOwners((data ?? []) as LeadRow[], await this.listWorkspaceMembers(workspaceId))
  }

  async deleteLead(leadId: string) {
    const client = requireClient()
    const { data: calls, error: readError } = await client.from('calls').select('recording_path').eq('lead_id', leadId)
    if (readError) throw readError
    const { error } = await client.from('leads').delete().eq('id', leadId); if (error) throw error
    const paths = (calls ?? []).map((call) => call.recording_path).filter((path): path is string => Boolean(path))
    if (paths.length) await client.storage.from('crm-recordings').remove(paths)
  }

  async mergeLeads(workspaceId: string, primaryLeadId: string, duplicateLeadId: string) {
    const client = requireClient()
    const { data, error } = await client.rpc('merge_duplicate_leads_v10066', {
      p_organization_id: workspaceId, p_primary_lead_id: primaryLeadId, p_duplicate_lead_id: duplicateLeadId,
    })
    if (error) throw error
    const { error: syncError } = await (client as any).rpc('sync_commercial_structure', { p_organization_id: workspaceId }); if (syncError) throw syncError
    const { data: lead, error: leadError } = await client.from('leads').select('*').eq('id', String(data)).single()
    if (leadError) throw leadError
    return this.mapLeadWithOwner(lead as LeadRow, workspaceId)
  }

  async bulkUpdateLeads(workspaceId: string, leadIds: string[], input: UpdateLeadInput) {
    if (!leadIds.length) return 0
    const client = requireClient(); let status = input.status
    if (input.stageId) {
      const { data: stage, error: stageError } = await client.from('pipeline_stages').select('is_won,is_lost').eq('id', input.stageId).eq('organization_id', workspaceId).single(); if (stageError) throw stageError
      status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'active'
    }
    const payload: Database['public']['Tables']['leads']['Update'] = {
      ...(input.stageId !== undefined ? { stage_id: input.stageId } : {}), ...(status !== undefined ? { status } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}), ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.ownerId !== undefined ? { owner_id: input.ownerId } : {}), ...(input.nextActionAt !== undefined ? { next_action_at: input.nextActionAt } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}), ...(input.tags !== undefined ? { tags: input.tags } : {}),
    }
    const { data, error } = await client.from('leads').update(payload).eq('organization_id', workspaceId).in('id', leadIds).select('id'); if (error) throw error
    const opportunityPayload: Record<string, unknown> = {
      ...(input.stageId !== undefined ? { stage_id: input.stageId } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(input.ownerId !== undefined ? { owner_id: input.ownerId } : {}),
    }
    if (Object.keys(opportunityPayload).length) {
      const { error: opportunityError } = await (client as any).from('opportunities').update(opportunityPayload).eq('organization_id', workspaceId).in('lead_id', leadIds)
      if (opportunityError) throw opportunityError
    }
    const { error: syncError } = await (client as any).rpc('sync_commercial_structure', { p_organization_id: workspaceId }); if (syncError) throw syncError
    return data?.length ?? 0
  }

  async bulkAddLeadTag(workspaceId: string, leadIds: string[], tag: string) {
    const client = requireClient()
    const { data, error } = await client.rpc('bulk_add_lead_tag', { p_organization_id: workspaceId, p_lead_ids: leadIds, p_tag: tag })
    if (error) throw error
    return Number(data ?? 0)
  }

  async bulkDeleteLeads(workspaceId: string, leadIds: string[]) {
    if (!leadIds.length) return 0
    const client = requireClient()
    const { data: calls, error: readError } = await client.from('calls').select('recording_path').eq('organization_id', workspaceId).in('lead_id', leadIds)
    if (readError) throw readError
    const { data, error } = await client.from('leads').delete().eq('organization_id', workspaceId).in('id', leadIds).select('id'); if (error) throw error
    const paths = (calls ?? []).map((call) => call.recording_path).filter((path): path is string => Boolean(path))
    if (paths.length) await client.storage.from('crm-recordings').remove(paths)
    return data?.length ?? 0
  }

  async listStages(workspaceId: string) {
    const client = requireClient()
    const rows = await fetchAllRows<StageRow>((from, to) => client.from('pipeline_stages').select('*').eq('organization_id', workspaceId).order('stage_order').order('id').range(from, to))
    return rows.map(mapStage)
  }

  async createStage(input: NewStageInput) {
    if (!input.name.trim()) throw new Error('Informe o nome da etapa.')
    if (input.isWon && input.isLost) throw new Error('Uma etapa não pode ser ganha e perdida ao mesmo tempo.')
    if (!Number.isFinite(Number(input.probability)) || Number(input.probability) < 0 || Number(input.probability) > 100) throw new Error('A probabilidade da etapa deve ficar entre 0 e 100%.')
    const client = requireClient(); const { data: existing, error: existingError } = await client.from('pipeline_stages').select('stage_order').eq('organization_id', input.workspaceId).order('stage_order', { ascending: false }).limit(1); if (existingError) throw existingError
    const { data, error } = await client.from('pipeline_stages').insert({
      organization_id: input.workspaceId, name: input.name.trim(), stage_order: input.order ?? ((existing?.[0]?.stage_order ?? 0) + 1),
      color: input.color, probability: input.probability, is_won: input.isWon, is_lost: input.isLost,
    }).select().single(); if (error) throw error
    return mapStage(data)
  }

  async updateStage(stageId: string, input: UpdateStageInput) {
    const client = requireClient()
    const { data: current, error: currentError } = await client.from('pipeline_stages').select('is_won,is_lost,name,probability').eq('id', stageId).single(); if (currentError) throw currentError
    const nextWon = input.isWon ?? current.is_won; const nextLost = input.isLost ?? current.is_lost
    if (nextWon && nextLost) throw new Error('Uma etapa não pode ser ganha e perdida ao mesmo tempo.')
    if (input.name !== undefined && !input.name.trim()) throw new Error('Informe o nome da etapa.')
    if (input.probability !== undefined && (!Number.isFinite(Number(input.probability)) || Number(input.probability) < 0 || Number(input.probability) > 100)) throw new Error('A probabilidade da etapa deve ficar entre 0 e 100%.')
    const { data, error } = await client.from('pipeline_stages').update({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.probability !== undefined ? { probability: input.probability } : {}), ...(input.isWon !== undefined ? { is_won: input.isWon } : {}),
      ...(input.isLost !== undefined ? { is_lost: input.isLost } : {}),
    }).eq('id', stageId).select().single(); if (error) throw error
    const stage = mapStage(data); const { error: leadsError } = await client.from('leads').update({ status: stage.isWon ? 'won' : stage.isLost ? 'lost' : 'active' }).eq('stage_id', stageId); if (leadsError) throw leadsError
    return stage
  }

  async deleteStage(stageId: string) {
    const client = requireClient(); const { count, error: countError } = await client.from('leads').select('id', { count: 'exact', head: true }).eq('stage_id', stageId); if (countError) throw countError
    if ((count ?? 0) > 0) throw new Error('Mova os leads desta etapa antes de excluí-la.')
    const { error } = await client.from('pipeline_stages').delete().eq('id', stageId); if (error) throw error
  }

  async listActivities(workspaceId: string) {
    const client = requireClient()
    const rows = await fetchAllRows<ActivityRow>((from, to) => client.from('activities').select('*').eq('organization_id', workspaceId).order('due_at', { ascending: true, nullsFirst: false }).order('id').range(from, to))
    return rows.map(mapActivity)
  }

  async createActivity(input: NewActivityInput) {
    const client = requireClient(); const { data, error } = await client.from('activities').insert({
      organization_id: input.workspaceId, lead_id: input.leadId, contact_id: input.contactId ?? null, activity_type: input.type, title: input.title.trim(), description: input.description,
      due_at: input.dueAt, completed_at: input.completedAt, resolution_status: input.resolutionStatus ?? (input.completedAt ? 'completed' : 'pending'),
      resolution_reason: input.resolutionReason ?? null, origin_event_key: input.originEventKey ?? null, purpose: input.purpose ?? null,
      assigned_to: input.assignedTo, source_type: input.sourceType, source_id: input.sourceId,
    } as any).select().single(); if (error) throw error
    await this.syncLeadNextAction(input.leadId); return mapActivity(data)
  }

  async createActivities(inputs: NewActivityInput[]) {
    if (!inputs.length) return []
    const client = requireClient()
    const payload = inputs.map((input) => ({
      organization_id: input.workspaceId, lead_id: input.leadId, contact_id: input.contactId ?? null, activity_type: input.type, title: input.title.trim(), description: input.description,
      due_at: input.dueAt, completed_at: input.completedAt, resolution_status: input.resolutionStatus ?? (input.completedAt ? 'completed' : 'pending'),
      resolution_reason: input.resolutionReason ?? null, origin_event_key: input.originEventKey ?? null, purpose: input.purpose ?? null,
      assigned_to: input.assignedTo, source_type: input.sourceType, source_id: input.sourceId,
    })) as any
    const { data, error } = await client.from('activities').insert(payload).select(); if (error) throw error
    const leadIds = [...new Set(inputs.map((input) => input.leadId).filter((id): id is string => Boolean(id)))]
    await Promise.all(leadIds.map((leadId) => this.syncLeadNextAction(leadId)))
    return (data ?? []).map(mapActivity)
  }

  async updateActivity(activityId: string, input: UpdateActivityInput) {
    const client = requireClient(); const { data: previous, error: previousError } = await client.from('activities').select('lead_id').eq('id', activityId).single(); if (previousError) throw previousError
    const { data, error } = await client.from('activities').update({
      ...(input.leadId !== undefined ? { lead_id: input.leadId } : {}), ...(input.contactId !== undefined ? { contact_id: input.contactId } : {}), ...(input.type !== undefined ? { activity_type: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dueAt !== undefined ? { due_at: input.dueAt } : {}), ...(input.completedAt !== undefined ? { completed_at: input.completedAt } : {}),
      ...(input.resolutionStatus !== undefined ? { resolution_status: input.resolutionStatus } : {}), ...(input.resolutionReason !== undefined ? { resolution_reason: input.resolutionReason } : {}),
      ...(input.originEventKey !== undefined ? { origin_event_key: input.originEventKey } : {}), ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
      ...(input.assignedTo !== undefined ? { assigned_to: input.assignedTo } : {}),
    } as any).eq('id', activityId).select().single(); if (error) throw error
    await Promise.all([this.syncLeadNextAction(previous.lead_id), this.syncLeadNextAction(data.lead_id)]); return mapActivity(data)
  }

  async deleteActivity(activityId: string) {
    const client = requireClient(); const { data: activity, error: readError } = await client.from('activities').select('lead_id,source_type').eq('id', activityId).single(); if (readError) throw readError
    if (activity.source_type === 'calendar' || activity.source_type === 'call') throw new Error('Esta atividade é gerenciada pelo módulo de origem.')
    const { error } = await client.from('activities').delete().eq('id', activityId); if (error) throw error
    await this.syncLeadNextAction(activity.lead_id)
  }

  async completeActivity(activityId: string, completed: boolean) { return this.updateActivity(activityId, { completedAt: completed ? new Date().toISOString() : null, resolutionStatus: completed ? 'completed' : 'pending', resolutionReason: completed ? 'manual' : null }) }

  async registerActivityOutcome(input: RegisterActivityOutcomeInput): Promise<CommercialActivityResult> {
    const client = requireClient()
    const { data, error } = await client.rpc('register_commercial_activity_outcome', {
      p_organization_id: input.workspaceId,
      p_activity_id: input.activityId,
      p_outcome: input.outcome,
      p_result_title: input.resultTitle,
      p_result_description: input.resultDescription,
      p_create_next: input.createNext,
      p_next_type: input.nextType,
      p_next_title: input.nextTitle,
      p_next_description: input.nextDescription,
      p_next_at: input.nextAt,
      p_stage_id: input.stageId,
    })
    if (error) throw error
    const result = (data ?? {}) as unknown as Record<string, unknown>
    const [{ data: activityRow, error: activityError }, { data: leadRow, error: leadError }] = await Promise.all([
      client.from('activities').select('*').eq('id', input.activityId).single(),
      client.from('leads').select('*').eq('id', String(result.lead_id ?? '')).single(),
    ])
    if (activityError) throw activityError
    if (leadError) throw leadError
    return {
      activity: mapActivity(activityRow),
      lead: await this.mapLeadWithOwner(leadRow, input.workspaceId),
      resultActivityId: String(result.result_activity_id ?? ''),
      nextActivityId: result.next_activity_id ? String(result.next_activity_id) : null,
      idempotent: Boolean(result.idempotent),
    }
  }

  async listCalls(workspaceId: string) { return listSupabaseCalls(requireClient(), workspaceId) }
  async listCallsPage(workspaceId: string, beforeStartedAt: string | null = null, limit = 200) {
    return listSupabaseCallsPage(requireClient(), workspaceId, beforeStartedAt, limit)
  }
  async getCallRecordingUrl(callId: string) { return getSupabaseCallRecordingUrl(requireClient(), callId) }

  async createCall(input: NewCallInput, recording?: Blob | null) {
    const client = requireClient(); const callId = crypto.randomUUID(); let recordingPath: string | null = null
    if (recording && recording.size) {
      recordingPath = `${input.workspaceId}/${callId}.${recordingExtension(recording.type)}`
      const { error: uploadError } = await client.storage.from('crm-recordings').upload(recordingPath, recording, { contentType: recording.type || 'audio/webm', upsert: false })
      if (uploadError) throw uploadError
    }
    const { data, error } = await client.from('calls').insert({
      id: callId, organization_id: input.workspaceId, lead_id: input.leadId, contact_id: input.contactId ?? null, user_id: input.userId, outcome: input.outcome,
      duration_seconds: input.durationSeconds, notes: input.notes, transcript: input.transcript, recording_path: recordingPath, consent_at: input.consentAt ?? null, consent_text: recordingPath ? 'O participante foi informado e consentiu com a gravação.' : null, consent_by: recordingPath ? input.userId : null,
      started_at: input.startedAt, ended_at: input.endedAt,
    } as any).select().single()
    if (error) {
      if (recordingPath) await client.storage.from('crm-recordings').remove([recordingPath])
      throw error
    }
    try {
      await client.from('activities').insert({
        organization_id: input.workspaceId, lead_id: input.leadId, contact_id: input.contactId ?? null, activity_type: 'call', title: `Ligação — ${input.outcome}`,
        description: input.notes, due_at: input.startedAt, completed_at: input.endedAt ?? input.startedAt, resolution_status: 'completed', resolution_reason: `call_outcome:${input.outcome}`, assigned_to: input.userId,
        source_type: 'call', source_id: callId,
      } as any).throwOnError()
    } catch (activityError) {
      await client.from('calls').delete().eq('id', callId); if (recordingPath) await client.storage.from('crm-recordings').remove([recordingPath]); throw activityError
    }
    let recordingUrl: string | null = null
    if (recordingPath) recordingUrl = (await client.storage.from('crm-recordings').createSignedUrl(recordingPath, 3600)).data?.signedUrl ?? null
    return mapCall(data, recordingUrl)
  }

  async registerCallOutcome(input: RegisterCallOutcomeInput, recording?: Blob | null): Promise<CommercialActionResult> {
    const client = requireClient()
    const callId = crypto.randomUUID()
    let recordingPath: string | null = null
    let rpcCommitted = false
    if (recording?.size) {
      if (!input.consentAt) throw new Error('Registre o consentimento antes de salvar uma gravação.')
      recordingPath = `${input.workspaceId}/${callId}.${recordingExtension(recording.type)}`
      const { error: uploadError } = await client.storage.from('crm-recordings').upload(recordingPath, recording, { contentType: recording.type || 'audio/webm', upsert: false })
      if (uploadError) throw uploadError
    }
    try {
      const { data, error } = await client.rpc('register_commercial_call_outcome', {
        p_organization_id: input.workspaceId,
        p_call_id: callId,
        p_lead_id: input.leadId,
        p_outcome: input.outcome,
        p_duration_seconds: input.durationSeconds,
        p_notes: input.notes,
        p_transcript: input.transcript,
        p_recording_path: recordingPath,
        p_consent_at: input.consentAt ?? null,
        p_started_at: input.startedAt,
        p_ended_at: input.endedAt,
        p_schedule_next: input.scheduleNext,
        p_next_at: input.nextAt,
        p_meeting_duration_minutes: Math.max(15, input.meetingDurationMinutes ?? 30),
      })
      if (error) throw error
      rpcCommitted = true
      const result = (data ?? {}) as unknown as Record<string, unknown>
      const persistedCallId = String(result.call_id ?? callId)
      if (input.contactId) {
        const contactAt = input.endedAt ?? input.startedAt
        const nextActivityId = result.next_activity_id ? String(result.next_activity_id) : null
        const calendarEventId = result.calendar_event_id ? String(result.calendar_event_id) : null
        const operations: PromiseLike<unknown>[] = [
          client.from('calls').update({ contact_id: input.contactId } as any).eq('id', persistedCallId).throwOnError(),
          client.from('activities').update({ contact_id: input.contactId } as any).eq('source_type', 'call').eq('source_id', persistedCallId).throwOnError(),
          client.from('contacts').update({ last_contact_at: contactAt, next_action_at: input.scheduleNext ? input.nextAt : null, updated_at: new Date().toISOString() } as any).eq('id', input.contactId).eq('organization_id', input.workspaceId).throwOnError(),
        ]
        if (nextActivityId) operations.push(client.from('activities').update({ contact_id: input.contactId } as any).eq('id', nextActivityId).throwOnError())
        if (calendarEventId) {
          operations.push(client.from('calendar_events').update({ contact_id: input.contactId } as any).eq('id', calendarEventId).throwOnError())
          operations.push(client.from('activities').update({ contact_id: input.contactId } as any).eq('source_type', 'calendar').eq('source_id', calendarEventId).throwOnError())
        }
        await Promise.all(operations)
      }
      if (recordingPath && persistedCallId !== callId) {
        await client.storage.from('crm-recordings').remove([recordingPath])
        recordingPath = null
      }
      const [{ data: callRow, error: callError }, { data: leadRow, error: leadError }] = await Promise.all([
        client.from('calls').select('*').eq('id', persistedCallId).single(),
        client.from('leads').select('*').eq('id', input.leadId).single(),
      ])
      if (callError) throw callError
      if (leadError) throw leadError
      let recordingUrl: string | null = null
      if (callRow.recording_path) recordingUrl = (await client.storage.from('crm-recordings').createSignedUrl(callRow.recording_path, 3600)).data?.signedUrl ?? null
      return {
        call: mapCall(callRow, recordingUrl),
        lead: await this.mapLeadWithOwner(leadRow, input.workspaceId),
        activityId: String(result.activity_id ?? ''),
        nextActivityId: result.next_activity_id ? String(result.next_activity_id) : null,
        calendarEventId: result.calendar_event_id ? String(result.calendar_event_id) : null,
        idempotent: Boolean(result.idempotent),
      }
    } catch (error) {
      // V101.5.1: after the commercial RPC commits, the database may already reference the recording.
      // Never delete that file on a later metadata/reconciliation failure, otherwise call and Storage diverge.
      if (recordingPath && !rpcCommitted) await client.storage.from('crm-recordings').remove([recordingPath])
      throw error
    }
  }

  async deleteCall(callId: string) {
    const client = requireClient(); const { data: call, error: readError } = await client.from('calls').select('recording_path').eq('id', callId).single(); if (readError) throw readError
    const { error: activityError } = await client.from('activities').delete().eq('source_type', 'call').eq('source_id', callId); if (activityError) throw activityError
    const { error } = await client.from('calls').delete().eq('id', callId); if (error) throw error
    if (call.recording_path) await client.storage.from('crm-recordings').remove([call.recording_path])
  }

  async listCalendarEvents(workspaceId: string) {
    const client = requireClient()
    const rows = await fetchAllRows<EventRow>((from, to) => client.from('calendar_events').select('*').eq('organization_id', workspaceId).order('starts_at').order('id').range(from, to))
    return rows.map(mapEvent)
  }

  async createCalendarEvent(input: NewCalendarEventInput) {
    if (!input.title.trim()) throw new Error('Informe o título do evento.')
    assertDateRange(input.startsAt, input.endsAt, 'Evento')
    const client = requireClient(); const { data, error } = await client.from('calendar_events').insert({
      organization_id: input.workspaceId, lead_id: input.leadId, contact_id: input.contactId ?? null, title: input.title.trim(), description: input.description,
      starts_at: input.startsAt, ends_at: input.endsAt, all_day: input.allDay, location: input.location, status: input.status, assigned_to: input.assignedTo,
    } as any).select().single(); if (error) throw error
    try {
      await client.from('activities').insert({
        organization_id: input.workspaceId, lead_id: input.leadId, contact_id: input.contactId ?? null, activity_type: 'meeting', title: input.title.trim(), description: input.description,
        due_at: input.startsAt, completed_at: input.status === 'completed' || input.status === 'cancelled' ? new Date().toISOString() : null,
        resolution_status: input.status === 'completed' ? 'completed' : input.status === 'cancelled' ? 'cancelled' : 'pending',
        resolution_reason: input.status === 'cancelled' ? 'calendar_cancelled' : input.status === 'completed' ? 'meeting_completed' : null,
        assigned_to: input.assignedTo, source_type: 'calendar', source_id: data.id,
      } as any).throwOnError()
    } catch (activityError) { await client.from('calendar_events').delete().eq('id', data.id); throw activityError }
    await this.syncLeadNextAction(input.leadId); return mapEvent(data)
  }

  async updateCalendarEvent(eventId: string, input: UpdateCalendarEventInput) {
    const client = requireClient(); const { data: previous, error: previousError } = await client.from('calendar_events').select('lead_id,title,starts_at,ends_at').eq('id', eventId).single(); if (previousError) throw previousError
    const nextTitle = input.title ?? previous.title; if (!nextTitle.trim()) throw new Error('Informe o título do evento.')
    assertDateRange(input.startsAt ?? previous.starts_at, input.endsAt ?? previous.ends_at, 'Evento')
    const { data, error } = await client.from('calendar_events').update({
      ...(input.leadId !== undefined ? { lead_id: input.leadId } : {}), ...(input.contactId !== undefined ? { contact_id: input.contactId } : {}), ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}), ...(input.startsAt !== undefined ? { starts_at: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { ends_at: input.endsAt } : {}), ...(input.allDay !== undefined ? { all_day: input.allDay } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}), ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.assignedTo !== undefined ? { assigned_to: input.assignedTo } : {}),
    } as any).eq('id', eventId).select().single(); if (error) throw error
    const completedAt = data.status === 'completed' || data.status === 'cancelled' ? new Date().toISOString() : null
    const resolutionStatus = data.status === 'completed' ? 'completed' : data.status === 'cancelled' ? 'cancelled' : 'pending'
    const { data: updatedActivity, error: activityError } = await client.from('activities').update({
      lead_id: data.lead_id, contact_id: (data as any).contact_id ?? null, title: data.title, description: data.description, due_at: data.starts_at, completed_at: completedAt,
      resolution_status: resolutionStatus, resolution_reason: data.status === 'cancelled' ? 'calendar_cancelled' : data.status === 'completed' ? 'meeting_completed' : null, assigned_to: data.assigned_to,
    } as any).eq('source_type', 'calendar').eq('source_id', eventId).select('id')
    if (activityError) throw activityError
    if (!updatedActivity?.length) await client.from('activities').insert({
      organization_id: data.organization_id, lead_id: data.lead_id, contact_id: (data as any).contact_id ?? null, activity_type: 'meeting', title: data.title, description: data.description,
      due_at: data.starts_at, completed_at: completedAt, resolution_status: resolutionStatus,
      resolution_reason: data.status === 'cancelled' ? 'calendar_cancelled' : data.status === 'completed' ? 'meeting_completed' : null, assigned_to: data.assigned_to, source_type: 'calendar', source_id: data.id,
    } as any).throwOnError()
    await Promise.all([this.syncLeadNextAction(previous.lead_id), this.syncLeadNextAction(data.lead_id)]); return mapEvent(data)
  }

  async deleteCalendarEvent(eventId: string) {
    const client = requireClient(); const { data: event, error: readError } = await client.from('calendar_events').select('lead_id').eq('id', eventId).single(); if (readError) throw readError
    const { error: activityError } = await client.from('activities').delete().eq('source_type', 'calendar').eq('source_id', eventId); if (activityError) throw activityError
    const { error } = await client.from('calendar_events').delete().eq('id', eventId); if (error) throw error
    await this.syncLeadNextAction(event.lead_id)
  }


  async listPlaybooks(workspaceId: string) {
    const client = requireClient()
    const rows = await fetchAllRows<PlaybookRow>((from, to) => client.from('playbooks').select('*').eq('organization_id', workspaceId).order('title').order('id').range(from, to))
    return rows.map(mapPlaybook)
  }

  async createPlaybook(input: NewPlaybookInput) {
    const client = requireClient(); const { data, error } = await client.from('playbooks').insert({ organization_id: input.workspaceId, kind: input.kind, title: input.title.trim(), category: input.category.trim(), content: input.content.trim(), tags: input.tags, guidance: (input.guidance ?? {}) as any, active: input.active }).select().single(); if (error) throw error
    return mapPlaybook(data)
  }

  async updatePlaybook(playbookId: string, input: UpdatePlaybookInput) {
    const client = requireClient(); const { data, error } = await client.from('playbooks').update({ ...(input.kind !== undefined ? { kind: input.kind } : {}), ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.category !== undefined ? { category: input.category.trim() } : {}), ...(input.content !== undefined ? { content: input.content.trim() } : {}), ...(input.tags !== undefined ? { tags: input.tags } : {}), ...(input.guidance !== undefined ? { guidance: input.guidance as any } : {}), ...(input.active !== undefined ? { active: input.active } : {}) }).eq('id', playbookId).select().single(); if (error) throw error
    return mapPlaybook(data)
  }

  async deletePlaybook(playbookId: string) { const client = requireClient(); const { error } = await client.from('playbooks').delete().eq('id', playbookId); if (error) throw error }


  async listProducts(workspaceId: string) {
    const client = requireClient()
    const rows = await fetchAllRows<ProductRow>((from, to) => client.from('products').select('*').eq('organization_id', workspaceId).order('name').order('id').range(from, to))
    return rows.map(mapProduct)
  }

  async createProduct(input: NewProductInput) {
    const client = requireClient(); const { data, error } = await client.from('products').insert(productInsertPayload(input)).select().single(); if (error) throw error
    return mapProduct(data)
  }

  async updateProduct(productId: string, input: UpdateProductInput) {
    const client = requireClient(); const { data, error } = await client.from('products').update(productUpdatePayload(input)).eq('id', productId).select().single(); if (error) throw error
    return mapProduct(data)
  }

  async reconcileProposalItems(workspaceId: string, legacyName: string, productId: string) {
    const client = requireClient() as any
    const { data: product, error: productError } = await client.from('products').select('*').eq('id', productId).eq('organization_id', workspaceId).single()
    if (productError || !product) throw new Error('Produto do catálogo não encontrado.')
    const { data: rows, error } = await client.from('sales_proposal_items').select('id,name,unit_price,discount_percent').eq('organization_id', workspaceId).is('product_id', null)
    if (error) throw error
    const target = legacyName.trim().toLocaleLowerCase('pt-BR')
    const matches = (rows ?? []).filter((row: any) => String(row.name ?? '').trim().toLocaleLowerCase('pt-BR') === target)
    for (const row of matches) {
      const overridden = Math.abs(Number(row.unit_price ?? 0) - Number(product.unit_price ?? 0)) > 0.005 || Math.abs(Number(row.discount_percent ?? 0) - Number(product.default_discount_percent ?? 0)) > 0.005
      const { error: updateError } = await client.from('sales_proposal_items').update({ product_id: productId, pricing_source: 'catalog', catalog_unit_price: product.unit_price, unit_cost_snapshot: product.unit_cost ?? 0, catalog_discount_percent: product.default_discount_percent ?? 0, pricing_overridden: overridden }).eq('id', row.id).eq('organization_id', workspaceId)
      if (updateError) throw updateError
    }
    return matches.length
  }

  async deleteProduct(productId: string) { const client = requireClient(); const usage = await client.from('sales_proposal_items').select('id', { count: 'exact', head: true }).eq('product_id', productId); if (usage.error) throw usage.error; if ((usage.count ?? 0) > 0) { const { error } = await client.from('products').update({ active: false }).eq('id', productId); if (error) throw error; return } const { error } = await client.from('products').delete().eq('id', productId); if (error) throw error }

  private async loadProposal(proposalId: string) {
    const client = requireClient(); const [{ data, error }, itemsResult] = await Promise.all([client.from('sales_proposals').select('*').eq('id', proposalId).single(), client.from('sales_proposal_items').select('*').eq('proposal_id', proposalId).order('item_order')]); if (error) throw error; if (itemsResult.error) throw itemsResult.error
    return mapProposal(data, (itemsResult.data ?? []).map(mapProposalItem))
  }

  async listProposals(workspaceId: string) {
    const client = requireClient()
    const [proposals, items] = await Promise.all([
      fetchAllRows<ProposalRow>((from, to) => client.from('sales_proposals').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }).order('id').range(from, to)),
      fetchAllRows<ProposalItemRow>((from, to) => client.from('sales_proposal_items').select('*').eq('organization_id', workspaceId).order('item_order').order('id').range(from, to)),
    ])
    const byProposal = new Map<string, ProposalLineItem[]>()
    for (const row of items) { const list = byProposal.get(row.proposal_id) ?? []; list.push(mapProposalItem(row)); byProposal.set(row.proposal_id, list) }
    return proposals.map((row) => mapProposal(row, byProposal.get(row.id) ?? []))
  }

  async createProposal(input: NewProposalInput) {
    assertProposalPayload(input)
    const client = requireClient() as any
    const { data, error } = await client.rpc('save_sales_proposal', {
      p_organization_id: input.workspaceId,
      p_proposal_id: null,
      p_lead_id: input.leadId,
      p_title: input.title,
      p_forecast_category: input.forecastCategory,
      p_probability: input.probability,
      p_valid_until: input.validUntil,
      p_expected_close_at: input.expectedCloseAt,
      p_contract_start_at: input.contractStartAt,
      p_contract_end_at: input.contractEndAt,
      p_contract_term_months: input.contractTermMonths,
      p_auto_renew: input.autoRenew,
      p_post_sale_start_at: input.postSaleStartAt,
      p_post_sale_cadence_name: input.postSaleCadenceName,
      p_notes: input.notes,
      p_terms: input.terms,
      p_items: input.items.map((item, index) => ({ product_id: item.productId, item_order: index + 1, name: item.name, description: item.description, quantity: item.quantity, unit_price: item.unitPrice, discount_percent: item.discountPercent, tax_rate: item.taxRate, billing_type: item.billingType, billing_interval: item.billingInterval, pricing_source: item.pricingSource ?? (item.productId ? 'catalog' : 'manual'), catalog_unit_price: item.catalogUnitPrice ?? null, unit_cost_snapshot: item.unitCostSnapshot ?? null, catalog_discount_percent: item.catalogDiscountPercent ?? null, pricing_overridden: Boolean(item.pricingOverridden) })),
    })
    if (error) throw error
    const proposal = await this.loadProposal(data as string)
    if (input.isOfficial && !proposal.isOfficial) return this.setOfficialProposal(proposal.id)
    return proposal
  }

  async updateProposal(proposalId: string, input: UpdateProposalInput) {
    const current = await this.loadProposal(proposalId)
    assertProposalPayload({
      title: input.title ?? current.title, probability: input.probability ?? current.probability,
      validUntil: input.validUntil === undefined ? current.validUntil : input.validUntil, expectedCloseAt: input.expectedCloseAt === undefined ? current.expectedCloseAt : input.expectedCloseAt,
      contractStartAt: input.contractStartAt === undefined ? current.contractStartAt : input.contractStartAt, contractEndAt: input.contractEndAt === undefined ? current.contractEndAt : input.contractEndAt,
      contractTermMonths: input.contractTermMonths ?? current.contractTermMonths, postSaleStartAt: input.postSaleStartAt === undefined ? current.postSaleStartAt : input.postSaleStartAt, items: input.items ?? current.items,
    })
    const client = requireClient() as any
    const { data, error } = await client.rpc('save_sales_proposal', {
      p_organization_id: current.workspaceId,
      p_proposal_id: proposalId,
      p_lead_id: current.leadId,
      p_title: input.title ?? current.title,
      p_forecast_category: input.forecastCategory ?? current.forecastCategory,
      p_probability: input.probability ?? current.probability,
      p_valid_until: input.validUntil === undefined ? current.validUntil : input.validUntil,
      p_expected_close_at: input.expectedCloseAt === undefined ? current.expectedCloseAt : input.expectedCloseAt,
      p_contract_start_at: input.contractStartAt === undefined ? current.contractStartAt : input.contractStartAt,
      p_contract_end_at: input.contractEndAt === undefined ? current.contractEndAt : input.contractEndAt,
      p_contract_term_months: input.contractTermMonths ?? current.contractTermMonths,
      p_auto_renew: input.autoRenew ?? current.autoRenew,
      p_post_sale_start_at: input.postSaleStartAt === undefined ? current.postSaleStartAt : input.postSaleStartAt,
      p_post_sale_cadence_name: input.postSaleCadenceName ?? current.postSaleCadenceName,
      p_notes: input.notes ?? current.notes,
      p_terms: input.terms ?? current.terms,
      p_items: (input.items ?? current.items).map((item, index) => ({ product_id: item.productId, item_order: index + 1, name: item.name, description: item.description, quantity: item.quantity, unit_price: item.unitPrice, discount_percent: item.discountPercent, tax_rate: item.taxRate, billing_type: item.billingType, billing_interval: item.billingInterval, pricing_source: item.pricingSource ?? (item.productId ? 'catalog' : 'manual'), catalog_unit_price: item.catalogUnitPrice ?? null, unit_cost_snapshot: item.unitCostSnapshot ?? null, catalog_discount_percent: item.catalogDiscountPercent ?? null, pricing_overridden: Boolean(item.pricingOverridden) })),
    })
    if (error) throw error
    if (input.status && input.status !== current.status) await this.updateProposalStatus(data as string, input.status)
    return this.loadProposal(data as string)
  }

  async createProposalRevision(proposalId: string) { const current = await this.loadProposal(proposalId); const client = requireClient() as any; const { data, error } = await client.rpc('create_sales_proposal_revision', { p_organization_id: current.workspaceId, p_proposal_id: proposalId }); if (error) throw error; return this.loadProposal(data as string) }
  async updateProposalStatus(proposalId: string, status: ProposalStatus) { const current = await this.loadProposal(proposalId); const client = requireClient() as any; const { data, error } = await client.rpc('set_sales_proposal_status', { p_organization_id: current.workspaceId, p_proposal_id: proposalId, p_status: status }); if (error) throw error; return this.loadProposal(data as string) }
  async setOfficialProposal(proposalId: string) { const current = await this.loadProposal(proposalId); const client = requireClient() as any; const { data, error } = await client.rpc('set_official_sales_proposal', { p_organization_id: current.workspaceId, p_proposal_id: proposalId }); if (error) throw error; return this.loadProposal(data as string) }
  async closeOpportunityFromProposal(proposalId: string) { const current = await this.loadProposal(proposalId); const client = requireClient() as any; const { data, error } = await client.rpc('close_opportunity_from_proposal', { p_organization_id: current.workspaceId, p_proposal_id: proposalId }); if (error) throw error; return this.loadProposal(data as string) }
  async deleteProposal(proposalId: string) { const current = await this.loadProposal(proposalId); if (current.isOfficial) throw new Error('A proposta oficial não pode ser excluída. Defina outra proposta como oficial ou cancele-a primeiro.'); if (current.status === 'accepted' || current.closedWonAt) throw new Error('Proposta aceita ou vinculada a negócio ganho não pode ser excluída.'); const client = requireClient(); const { error } = await client.from('sales_proposals').delete().eq('id', proposalId); if (error) throw error }

  async listBuyerRooms(workspaceId: string) {
    const client = requireClient() as any
    const rows = await fetchAllRows<Record<string, any>>((from, to) => client.from('buyer_rooms').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }).order('id').range(from, to))
    return rows.map(mapBuyerRoom)
  }

  async createBuyerRoom(input: NewBuyerRoomInput) {
    const client = requireClient() as any
    const { data: proposal, error: proposalError } = await client.from('sales_proposals').select('id').eq('id', input.proposalId).eq('organization_id', input.workspaceId).single(); if (proposalError || !proposal) throw new Error('A proposta da Buyer Room não pertence a este workspace.')
    const { data, error } = await client.from('buyer_rooms').insert({ organization_id: input.workspaceId, lead_id: input.leadId, opportunity_id: input.opportunityId, proposal_id: input.proposalId, company_id: input.companyId, title: input.title.trim(), welcome_message: input.welcomeMessage.trim(), status: input.status, share_token: input.shareToken || createBuyerRoomShareToken(), share_enabled: input.shareEnabled, expires_at: input.expiresAt, participants: input.participants, steps: input.steps, documents: input.documents, activity: input.activity ?? [] }).select().single()
    if (error) throw error; return mapBuyerRoom(data)
  }

  async updateBuyerRoom(roomId: string, input: UpdateBuyerRoomInput) {
    const client = requireClient() as any
    const payload = { ...(input.leadId !== undefined ? { lead_id: input.leadId } : {}), ...(input.opportunityId !== undefined ? { opportunity_id: input.opportunityId } : {}), ...(input.proposalId !== undefined ? { proposal_id: input.proposalId } : {}), ...(input.companyId !== undefined ? { company_id: input.companyId } : {}), ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.welcomeMessage !== undefined ? { welcome_message: input.welcomeMessage.trim() } : {}), ...(input.status !== undefined ? { status: input.status } : {}), ...(input.shareEnabled !== undefined ? { share_enabled: input.shareEnabled } : {}), ...(input.expiresAt !== undefined ? { expires_at: input.expiresAt } : {}), ...(input.participants !== undefined ? { participants: input.participants } : {}), ...(input.steps !== undefined ? { steps: input.steps } : {}), ...(input.documents !== undefined ? { documents: input.documents } : {}) }
    const { data, error } = await client.from('buyer_rooms').update(payload).eq('id', roomId).select().single(); if (error) throw error; return mapBuyerRoom(data)
  }

  async rotateBuyerRoomToken(roomId: string) {
    const client = requireClient() as any; const { data, error } = await client.rpc('rotate_buyer_room_token', { p_room_id: roomId, p_new_token: createBuyerRoomShareToken() }); if (error) throw error
    const { data: row, error: loadError } = await client.from('buyer_rooms').select('*').eq('id', data as string).single(); if (loadError) throw loadError; return mapBuyerRoom(row)
  }

  async recordBuyerRoomActivity(roomId: string, event: Omit<BuyerRoomActivity, 'id' | 'occurredAt'> & { occurredAt?: string }) {
    const client = requireClient() as any; const { data, error } = await client.rpc('append_buyer_room_activity', { p_room_id: roomId, p_event: { ...event, id: globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}`, occurredAt: event.occurredAt ?? new Date().toISOString() } }); if (error) throw error
    const { data: row, error: loadError } = await client.from('buyer_rooms').select('*').eq('id', data as string).single(); if (loadError) throw loadError; return mapBuyerRoom(row)
  }

  async deleteBuyerRoom(roomId: string) { const client = requireClient() as any; const { error } = await client.from('buyer_rooms').delete().eq('id', roomId); if (error) throw error }

  async listRevenueEntries(workspaceId: string) {
    const client = requireClient()
    const rows = await fetchAllRows<RevenueRow>((from, to) => client.from('revenue_entries').select('*').eq('organization_id', workspaceId).order('competence_date', { ascending: false }).order('id').range(from, to))
    return rows.map(mapRevenueEntry)
  }
  async createRevenueEntry(input: NewRevenueEntryInput) {
    assertDateTime(input.recognizedAt, 'Data de reconhecimento'); assertDateOnly(input.competenceDate, 'Competência'); assertDateOnlyRange(input.servicePeriodStart, input.servicePeriodEnd, 'Período do serviço')
    if (!Number.isFinite(Number(input.amount)) || Number(input.amount) < 0 || !Number.isFinite(Number(input.recurringMonthlyAmount)) || Number(input.recurringMonthlyAmount) < 0) throw new Error('Os valores da receita precisam ser números não negativos.')
    const client = requireClient(); const { data, error } = await client.from('revenue_entries').insert({ organization_id: input.workspaceId, proposal_id: input.proposalId, lead_id: input.leadId, opportunity_id: input.opportunityId, revenue_type: input.revenueType, status: input.status, amount: finiteNumber(input.amount), recurring_monthly_amount: finiteNumber(input.recurringMonthlyAmount), recognized_at: input.recognizedAt, competence_date: input.competenceDate, service_period_start: input.servicePeriodStart, service_period_end: input.servicePeriodEnd, adjustment_reason: input.adjustmentReason.trim(), description: input.description.trim(), owner_id: input.ownerId, source: input.source ?? 'manual', schedule_key: input.scheduleKey ?? null, installment_index: input.installmentIndex ?? null, installment_count: input.installmentCount ?? null }).select().single(); if (error) throw error; return mapRevenueEntry(data)
  }
  async updateRevenueEntryStatus(entryId: string, status: RevenueEntry['status']) { const client = requireClient(); const { data, error } = await client.from('revenue_entries').update({ status }).eq('id', entryId).select().single(); if (error) throw error; return mapRevenueEntry(data) }

  async listGoals(workspaceId: string) {
    const client = requireClient()
    const rows = await fetchAllRows<GoalRow>((from, to) => client.from('goals').select('*').eq('organization_id', workspaceId).order('period_start', { ascending: false }).order('id').range(from, to))
    return rows.map(mapGoal)
  }

  async createGoal(input: NewGoalInput) {
    if (!Number.isFinite(Number(input.targetValue)) || Number(input.targetValue) <= 0) throw new Error('A meta precisa ser maior que zero.')
    assertDateOnlyRange(input.periodStart, input.periodEnd, 'Período da meta')
    const client = requireClient(); const { data, error } = await client.from('goals').insert({
      organization_id: input.workspaceId, user_id: input.userId, metric: input.metric, target_value: input.targetValue,
      scope: input.scope ?? (input.teamId ? 'team' : input.userId ? 'user' : 'workspace'), team_id: input.teamId ?? null, team_name: input.teamName ?? '',
      period_start: input.periodStart, period_end: input.periodEnd,
    }).select().single(); if (error) throw error
    return { ...mapGoal(data), userName: input.userName }
  }

  async updateGoal(goalId: string, input: UpdateGoalInput) {
    const client = requireClient(); const { data: current, error: currentError } = await client.from('goals').select('target_value,period_start,period_end').eq('id', goalId).single(); if (currentError) throw currentError
    const nextTarget = input.targetValue ?? Number(current.target_value); if (!Number.isFinite(Number(nextTarget)) || Number(nextTarget) <= 0) throw new Error('A meta precisa ser maior que zero.')
    assertDateOnlyRange(input.periodStart ?? current.period_start, input.periodEnd ?? current.period_end, 'Período da meta')
    const { data, error } = await client.from('goals').update({
      ...(input.scope !== undefined ? { scope: input.scope } : {}), ...(input.teamId !== undefined ? { team_id: input.teamId } : {}), ...(input.teamName !== undefined ? { team_name: input.teamName } : {}), ...(input.userId !== undefined ? { user_id: input.userId } : {}), ...(input.metric !== undefined ? { metric: input.metric } : {}),
      ...(input.targetValue !== undefined ? { target_value: input.targetValue } : {}), ...(input.periodStart !== undefined ? { period_start: input.periodStart } : {}),
      ...(input.periodEnd !== undefined ? { period_end: input.periodEnd } : {}),
    }).eq('id', goalId).select().single(); if (error) throw error
    return { ...mapGoal(data), ...(input.userName !== undefined ? { userName: input.userName } : {}) }
  }

  async deleteGoal(goalId: string) { const client = requireClient(); const { error } = await client.from('goals').delete().eq('id', goalId); if (error) throw error }

  async listAutomationRules(workspaceId: string) {
    const client = requireClient()
    const rows = await fetchAllRows<AutomationRuleRow>((from, to) => client.from('automation_rules').select('*').eq('organization_id', workspaceId).order('name').order('id').range(from, to))
    return rows.map(mapAutomationRule)
  }

  async createAutomationRule(input: NewAutomationRuleInput) {
    const client = requireClient(); const { data, error } = await client.from('automation_rules').insert({
      organization_id: input.workspaceId, name: input.name.trim(), enabled: input.enabled, trigger_type: input.triggerType,
      conditions: input.conditions as unknown as Database['public']['Tables']['automation_rules']['Insert']['conditions'],
      actions: input.actions as unknown as Database['public']['Tables']['automation_rules']['Insert']['actions'], created_by: input.createdBy,
    }).select().single(); if (error) throw error
    return mapAutomationRule(data)
  }

  async updateAutomationRule(ruleId: string, input: UpdateAutomationRuleInput) {
    const client = requireClient(); const { data, error } = await client.from('automation_rules').update({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.triggerType !== undefined ? { trigger_type: input.triggerType } : {}),
      ...(input.conditions !== undefined ? { conditions: input.conditions as unknown as Database['public']['Tables']['automation_rules']['Update']['conditions'] } : {}),
      ...(input.actions !== undefined ? { actions: input.actions as unknown as Database['public']['Tables']['automation_rules']['Update']['actions'] } : {}),
    }).eq('id', ruleId).select().single(); if (error) throw error
    return mapAutomationRule(data)
  }

  async deleteAutomationRule(ruleId: string) { const client = requireClient(); const { error } = await client.from('automation_rules').delete().eq('id', ruleId); if (error) throw error }

  async listAutomationRuns(workspaceId: string) {
    const client = requireClient(); const { data, error } = await client.from('automation_runs').select('*').eq('organization_id', workspaceId).order('started_at', { ascending: false }).limit(300); if (error) throw error
    return (data ?? []).map(mapAutomationRun)
  }

  async startAutomationRun(input: NewAutomationRunInput) {
    const client = requireClient(); const { data, error } = await client.from('automation_runs').insert({
      organization_id: input.workspaceId, rule_id: input.ruleId, event_key: input.eventKey, status: 'running',
      input: input.input as unknown as Database['public']['Tables']['automation_runs']['Insert']['input'], output: {},
    }).select().single()
    if (error && (error as { code?: string }).code === '23505') return null
    if (error) throw error
    return mapAutomationRun(data)
  }

  async finishAutomationRun(runId: string, status: AutomationRunStatus, output: AutomationRunOutput, errorMessage: string | null = null) {
    const client = requireClient(); const { data, error } = await client.from('automation_runs').update({
      status, output: output as unknown as Database['public']['Tables']['automation_runs']['Update']['output'], error_message: errorMessage,
      finished_at: new Date().toISOString(),
    }).eq('id', runId).select().single(); if (error) throw error
    return mapAutomationRun(data)
  }

  async getDashboardStats(workspaceId: string): Promise<DashboardStats> {
    const [leads, activities] = await Promise.all([this.listLeads(workspaceId), this.listActivities(workspaceId)]); const now = new Date()
    const isSameDay = (value: string) => { const date = new Date(value); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate() }
    return {
      activeLeads: leads.filter((lead) => lead.status === 'active').length,
      pipelineValue: leads.filter((lead) => lead.status === 'active').reduce((sum, lead) => sum + lead.value, 0),
      dueToday: activities.filter((activity) => activity.dueAt && !activity.completedAt && isSameDay(activity.dueAt)).length,
      hotLeads: leads.filter((lead) => lead.status === 'active' && lead.temperature === 'hot').length,
      wonThisMonth: leads.filter((lead) => {
        const updated = new Date(lead.updatedAt)
        return lead.status === 'won' && updated.getMonth() === now.getMonth() && updated.getFullYear() === now.getFullYear()
      }).length,
    }
  }

  async importLeads(workspaceId: string, leads: Lead[]) {
    const client = requireClient() as any; if (!leads.length) return 0
    const payload = leads.map((lead) => ({ organization_id: workspaceId, name: lead.name, company: lead.company, phone: lead.phone, email: lead.email, city: lead.city,
      postal_code: lead.postalCode ?? '', street: lead.street ?? '', address_number: lead.addressNumber ?? '', complement: lead.complement ?? '', district: lead.district ?? '', state: lead.state ?? '', country: lead.country ?? 'Brasil',
      source: lead.source, source_detail: lead.sourceDetail ?? '', source_url: lead.sourceUrl ?? '', captured_at: lead.capturedAt ?? lead.createdAt, consent_status: lead.consentStatus ?? 'unknown', do_not_contact: lead.doNotContact ?? false, do_not_contact_reason: lead.doNotContactReason ?? '',
      cnpj: lead.cnpj ?? '', website: lead.website ?? '', instagram_url: lead.instagramUrl ?? '', linkedin_url: lead.linkedinUrl ?? '', facebook_url: lead.facebookUrl ?? '', job_title: lead.jobTitle ?? '', decision_role: lead.decisionRole ?? 'unknown', influence_level: lead.influenceLevel ?? 0,
      stage_id: lead.stageId, status: lead.status, temperature: lead.temperature, priority: lead.priority, owner_id: null, value: lead.value, next_action_at: lead.nextActionAt, expected_close_at: lead.expectedCloseAt ?? null, notes: lead.notes, tags: lead.tags }))
    const { error } = await client.from('leads').insert(payload); if (error) throw error
    const { error: syncError } = await client.rpc('sync_commercial_structure', { p_organization_id: workspaceId }); if (syncError) throw syncError
    return payload.length
  }
}
