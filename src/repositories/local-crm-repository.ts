import { DEMO_ACTIVITIES, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_RUNS, DEMO_CALLS, DEMO_COMPANIES, DEMO_CONTACTS, DEMO_CONTACT_RELATIONSHIPS, DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PLAYBOOKS, DEMO_PRODUCTS, DEMO_PROPOSALS, DEMO_REVENUE_ENTRIES, DEMO_SOCIAL_PROFILES, DEMO_WORKSPACE, DEFAULT_STAGES } from '../domain/defaults'
import type {
  ActivityItem, AuditLog, AutomationRule, AutomationRun, AutomationRunOutput, AutomationRunStatus, BuyerRoom, BuyerRoomActivity, CalendarEvent, CallRecord, CommercialStructureSyncResult, CompanyRecord, ContactRecord, ContactRelationship, DashboardStats, Goal, Lead, OpportunityRecord, PipelineStage, Playbook, ProductRecord, ProposalLineItem, ProposalRecord, ProposalStatus, RevenueEntry, RepositoryHealth, SocialProfile, Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceSnapshot,
} from '../domain/types'
import { createId } from '../lib/id'
import { safeStorage } from '../lib/storage'
import { BACKUP_SCHEMA_VERSION } from '../lib/app-version'
import { deleteLocalRecording, readLocalRecording, saveLocalRecording } from '../lib/local-recordings'
import { completeLocalSetup, LOCAL_ACTIVE_WORKSPACE_KEY, markLocalSetupPending, writeLocalProfile, type LocalExperienceInput } from '../lib/local-experience'
import { mergeLeadRecords } from '../services/lead-intelligence'
import { deriveCommercialStructure } from '../services/commercial-structure'
import { buildCommercialCallPlan, resolveCommercialStage, shouldClosePendingActivity } from '../services/commercial-action-engine'
import { appendBuyerRoomActivity, createBuyerRoomShareToken, normalizeBuyerRoom } from '../services/buyer-room'
import type {
  CommercialActionResult, CommercialActivityResult, CrmRepository, OperationalDataClearResult, NewWorkspaceMemberInput, NewActivityInput, NewAutomationRuleInput, NewAutomationRunInput, NewBuyerRoomInput, NewCalendarEventInput, NewCallInput, NewCompanyInput, NewContactInput, NewContactRelationshipInput, NewGoalInput, NewLeadInput, NewPlaybookInput, NewProductInput, NewProposalInput, NewRevenueEntryInput, NewStageInput, RegisterActivityOutcomeInput, RegisterCallOutcomeInput,
  UpdateActivityInput, UpdateAutomationRuleInput, UpdateBuyerRoomInput, UpdateCalendarEventInput, UpdateCompanyInput, UpdateContactInput, UpdateContactRelationshipInput, UpdateGoalInput, UpdateLeadInput, UpdatePlaybookInput, UpdateProductInput, UpdateProposalInput, UpdateStageInput,
} from './crm-repository'

export { LOCAL_DATABASE_STORAGE_KEY, configureLocalExperience } from './local-repository-core'
import type { LocalDatabase } from './local-repository-core'
import { STORAGE_KEY, CORRUPT_BACKUP_PREFIX, recordingUrlCache, clone, DEMO_REFERENCE_NOW, shiftIso, rebaseDemoDates, seedDatabase, slugify, normalizeActivity, readDatabase, writeDatabase, todayKey, stageStatus, finiteNumber, clampNumber, isValidDateValue, isValidDateOnly, assertDateTime, assertDateOnly, assertDateRange, normalizedTags, proposalItemTotals, normalizeProposal, assertProposalValues, proposalSequence, syncCommercialFromOfficialProposal, syncLeadNextAction, assertLeadsCanBeDeleted, removeLeadDependencies, synchronizeStructureInDatabase, syncLeadIdentityToPrimaryContact, syncContactIdentityToPrimaryLeads, syncLeadCommercialProjectionToCanonicalRecords, assertAutomationActions } from './local-repository-core'
import { createLocalCompany, updateLocalCompany } from './local-company-repository'
import { createLocalWorkspaceMember } from './local-workspace-member-repository'

export class LocalCrmRepository implements CrmRepository {
  readonly mode = 'local' as const

  async initialize() {
    if (!safeStorage.getItem(STORAGE_KEY)) {
      const db = seedDatabase()
      for (const workspace of db.workspaces) synchronizeStructureInDatabase(db, workspace.id)
      writeDatabase(db)
      markLocalSetupPending()
      return
    }

    // Inicializar o repositório não deve, por si só, regravar a instalação do usuário.
    const db = readDatabase()
    const structuralSnapshot = () => JSON.stringify({
      leads: db.leads,
      companies: db.companies,
      contacts: db.contacts,
      contactRelationships: db.contactRelationships,
      opportunities: db.opportunities,
    })
    const beforeStructure = structuralSnapshot()
    for (const workspace of db.workspaces) synchronizeStructureInDatabase(db, workspace.id)
    if (structuralSnapshot() !== beforeStructure) writeDatabase(db)
  }

  async health(): Promise<RepositoryHealth> {
    const diagnostics = safeStorage.diagnostics()
    return {
      mode: this.mode, connected: diagnostics.persistent,
      message: diagnostics.persistent
        ? `Modo local persistente ativo · ${(diagnostics.estimatedBytes / 1024).toFixed(1)} KB armazenados.`
        : 'Armazenamento persistente indisponível. Os dados desta sessão podem ser perdidos ao fechar o navegador.',
      checkedAt: new Date().toISOString(),
    }
  }

  async listWorkspaces() { return clone(readDatabase().workspaces) }

  async createWorkspace(name: string) {
    const trimmed = name.trim()
    if (trimmed.length < 2) throw new Error('Informe um nome com pelo menos 2 caracteres.')
    const db = readDatabase()
    const baseSlug = trimmed.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
    const usedSlugs = new Set(db.workspaces.map((item) => item.slug))
    let slug = baseSlug; let suffix = 2
    while (usedSlugs.has(slug)) { slug = `${baseSlug}-${suffix}`; suffix += 1 }
    const workspace: Workspace = {
      id: createId('workspace'), name: trimmed, slug, role: 'owner', createdAt: new Date().toISOString(),
    }
    db.workspaces.push(workspace)
    const colors = ['#4361ee', '#3a86ff', '#8b5cf6', '#f59e0b', '#f97316', '#16a34a']
    const names = ['Novo lead', 'Primeiro contato', 'Follow-up', 'Proposta', 'Negociação', 'Fechado']
    names.forEach((stageName, index) => db.stages.push({
      id: createId('stage'), workspaceId: workspace.id, name: stageName, order: index + 1, color: colors[index],
      probability: [10, 25, 40, 65, 80, 100][index], isWon: index === 5, isLost: false,
    }))
    db.members.push({ workspaceId: workspace.id, userId: 'local-user', displayName: 'Usuário Demo', email: 'demo@realtalent.local', avatarUrl: null, role: 'owner', joinedAt: workspace.createdAt })
    writeDatabase(db)
    return clone(workspace)
  }

  async listWorkspaceMembers(workspaceId: string) { return clone(readDatabase().members.filter((member) => member.workspaceId === workspaceId)) }
  async createWorkspaceMember(workspaceId: string, input: NewWorkspaceMemberInput): Promise<WorkspaceMember> {
    return createLocalWorkspaceMember(workspaceId, input)
  }

  async createWorkspaceInvite(workspaceId: string, email: string, role: 'admin' | 'member' | 'viewer') {
    const db = readDatabase(); const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail.includes('@')) throw new Error('Informe um e-mail válido.')
    const invite: WorkspaceInvite = { id: createId('invite'), workspaceId, token: createId('token'), email: normalizedEmail, role, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), acceptedAt: null, revokedAt: null, createdAt: new Date().toISOString() }
    db.invites.unshift(invite); writeDatabase(db); return clone(invite)
  }

  async listWorkspaceInvites(workspaceId: string) { return clone(readDatabase().invites.filter((invite) => invite.workspaceId === workspaceId)) }

  async revokeWorkspaceInvite(inviteId: string) {
    const db = readDatabase(); const invite = db.invites.find((item) => item.id === inviteId)
    if (!invite) throw new Error('Convite não encontrado.')
    invite.revokedAt = new Date().toISOString(); writeDatabase(db)
  }

  async acceptWorkspaceInvite(token: string) {
    const db = readDatabase(); const invite = db.invites.find((item) => item.token === token && !item.revokedAt && !item.acceptedAt)
    if (!invite || new Date(invite.expiresAt).getTime() < Date.now()) throw new Error('Convite inválido ou expirado.')
    invite.acceptedAt = new Date().toISOString()
    if (!db.members.some((member) => member.workspaceId === invite.workspaceId && member.userId === 'local-user')) db.members.push({ workspaceId: invite.workspaceId, userId: 'local-user', displayName: 'Usuário Demo', email: 'demo@realtalent.local', avatarUrl: null, role: invite.role, joinedAt: invite.acceptedAt })
    writeDatabase(db)
    const workspace = db.workspaces.find((item) => item.id === invite.workspaceId); if (!workspace) throw new Error('Workspace não encontrado.')
    return clone({ ...workspace, role: invite.role })
  }

  async updateWorkspaceMemberRole(workspaceId: string, userId: string, role: 'admin' | 'member' | 'viewer') {
    const db = readDatabase(); const member = db.members.find((item) => item.workspaceId === workspaceId && item.userId === userId)
    if (!member) throw new Error('Membro não encontrado.'); if (member.role === 'owner') throw new Error('O proprietário não pode ter o papel alterado.')
    member.role = role; writeDatabase(db)
  }

  async removeWorkspaceMember(workspaceId: string, userId: string) {
    const db = readDatabase(); const member = db.members.find((item) => item.workspaceId === workspaceId && item.userId === userId)
    if (!member) throw new Error('Membro não encontrado.'); if (member.role === 'owner') throw new Error('O proprietário não pode ser removido.')
    db.members = db.members.filter((item) => !(item.workspaceId === workspaceId && item.userId === userId)); writeDatabase(db)
  }

  async listAuditLogs(workspaceId: string, limit = 100) { return clone(readDatabase().auditLogs.filter((log) => log.workspaceId === workspaceId).slice(0, limit)) }

  async exportWorkspace(workspaceId: string) {
    const snapshot = await this.getSnapshot(workspaceId); const db = readDatabase()
    const calls = clone(db.calls.filter((call) => call.workspaceId === workspaceId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).map((call) => ({ ...call, recordingUrl: null })))
    return { version: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), snapshot: { ...snapshot, calls }, members: db.members.filter((member) => member.workspaceId === workspaceId), auditLogs: db.auditLogs.filter((log) => log.workspaceId === workspaceId) }
  }

  async clearOperationalData(workspaceId: string): Promise<OperationalDataClearResult> {
    const db = readDatabase()
    if (!db.workspaces.some((workspace) => workspace.id === workspaceId)) throw new Error('Workspace não encontrado.')
    const recordings = db.calls.filter((call) => call.workspaceId === workspaceId && call.recordingPath).map((call) => call.recordingPath!).filter(Boolean)
    const before = [db.leads, db.activities, db.calls, db.events, db.playbooks, db.goals, db.automationRules, db.automationRuns, db.companies, db.contacts, db.contactRelationships, db.opportunities, db.socialProfiles, db.proposals, db.buyerRooms, db.revenueEntries]
      .reduce((total, items) => total + items.filter((item) => item.workspaceId === workspaceId).length, 0)
    db.leads = db.leads.filter((item) => item.workspaceId !== workspaceId)
    db.activities = db.activities.filter((item) => item.workspaceId !== workspaceId)
    db.calls = db.calls.filter((item) => item.workspaceId !== workspaceId)
    db.events = db.events.filter((item) => item.workspaceId !== workspaceId)
    db.playbooks = db.playbooks.filter((item) => item.workspaceId !== workspaceId)
    db.goals = db.goals.filter((item) => item.workspaceId !== workspaceId)
    db.automationRules = db.automationRules.filter((item) => item.workspaceId !== workspaceId)
    db.automationRuns = db.automationRuns.filter((item) => item.workspaceId !== workspaceId)
    db.companies = db.companies.filter((item) => item.workspaceId !== workspaceId)
    db.contacts = db.contacts.filter((item) => item.workspaceId !== workspaceId)
    db.contactRelationships = db.contactRelationships.filter((item) => item.workspaceId !== workspaceId)
    db.opportunities = db.opportunities.filter((item) => item.workspaceId !== workspaceId)
    db.socialProfiles = db.socialProfiles.filter((item) => item.workspaceId !== workspaceId)
    db.proposals = db.proposals.filter((item) => item.workspaceId !== workspaceId)
    db.buyerRooms = db.buyerRooms.filter((item) => item.workspaceId !== workspaceId)
    db.revenueEntries = db.revenueEntries.filter((item) => item.workspaceId !== workspaceId)
    writeDatabase(db)
    for (const recordingPath of recordings) {
      try { await deleteLocalRecording(recordingPath); recordingUrlCache.delete(recordingPath) } catch { /* best effort after atomic state commit */ }
    }
    return { cleared: true, total: before }
  }

  async getSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
    const db = readDatabase()
    const workspace = db.workspaces.find((item) => item.id === workspaceId)
    if (!workspace) throw new Error('Workspace não encontrado.')
    return {
      workspace: clone(workspace),
      stages: clone(db.stages.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.order - b.order)),
      leads: clone(db.leads.filter((item) => item.workspaceId === workspaceId)),
      activities: clone(db.activities.filter((item) => item.workspaceId === workspaceId)),
      calls: clone(db.calls.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 500).map((call) => ({ ...call, recordingUrl: null }))),
      events: clone(db.events.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())),
      playbooks: clone(db.playbooks.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))),
      goals: clone(db.goals.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime())),
      automationRules: clone(db.automationRules.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
      automationRuns: clone(db.automationRuns.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 300)),
      companies: clone(db.companies.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
      contacts: clone(db.contacts.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
      contactRelationships: clone(db.contactRelationships.filter((item) => item.workspaceId === workspaceId)),
      opportunities: clone(db.opportunities.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())),
      socialProfiles: clone(db.socialProfiles.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.network.localeCompare(b.network, 'pt-BR'))),
      products: clone(db.products.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
      proposals: clone(db.proposals.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())),
      buyerRooms: clone(db.buyerRooms.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())),
      revenueEntries: clone(db.revenueEntries.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.recognizedAt).getTime() - new Date(a.recognizedAt).getTime())),
    }
  }

  async synchronizeCommercialStructure(workspaceId: string) {
    const db = readDatabase(); const result = synchronizeStructureInDatabase(db, workspaceId); writeDatabase(db); return clone(result)
  }

  async listLeads(workspaceId: string) { return clone(readDatabase().leads.filter((lead) => lead.workspaceId === workspaceId)) }
  async listCompanies(workspaceId: string) { return clone(readDatabase().companies.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) }
  async createCompany(input: NewCompanyInput) { return createLocalCompany(input) }
  async updateCompany(companyId: string, input: UpdateCompanyInput) { return updateLocalCompany(companyId, input) }
  async listContacts(workspaceId: string) { return clone(readDatabase().contacts.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) }
  async listContactRelationships(workspaceId: string) { return clone(readDatabase().contactRelationships.filter((item) => item.workspaceId === workspaceId)) }

  async createContact(input: NewContactInput) {
    const db = readDatabase(); const now = new Date().toISOString()
    if (!input.name.trim()) throw new Error('Informe o nome do contato.')
    if (input.companyId && !db.companies.some((company) => company.id === input.companyId && company.workspaceId === input.workspaceId)) throw new Error('Empresa não encontrada neste workspace.')
    const leadIds = Array.from(new Set(input.leadIds ?? []))
    if (leadIds.some((leadId) => !db.leads.some((lead) => lead.id === leadId && lead.workspaceId === input.workspaceId))) throw new Error('Um ou mais leads vinculados não pertencem a este workspace.')
    const contact: ContactRecord = { ...input, leadIds, id: createId('contact'), name: input.name.trim(), email: input.email.trim().toLocaleLowerCase('pt-BR'), influenceLevel: clampNumber(input.influenceLevel, 0, 100, 0), relationshipScore: clampNumber(input.relationshipScore, 0, 100, 0), createdAt: now, updatedAt: now }
    db.contacts.unshift(contact); writeDatabase(db); return clone(contact)
  }
  async updateContact(contactId: string, input: UpdateContactInput) {
    const db = readDatabase(); const index = db.contacts.findIndex((item) => item.id === contactId); if (index < 0) throw new Error('Contato não encontrado.')
    const current = db.contacts[index]
    if (input.companyId && !db.companies.some((company) => company.id === input.companyId && company.workspaceId === current.workspaceId)) throw new Error('Empresa não encontrada neste workspace.')
    const leadIds = input.leadIds === undefined ? current.leadIds : Array.from(new Set(input.leadIds))
    if (leadIds.some((leadId) => !db.leads.some((lead) => lead.id === leadId && lead.workspaceId === current.workspaceId))) throw new Error('Um ou mais leads vinculados não pertencem a este workspace.')
    const next: ContactRecord = { ...current, ...input, leadIds, name: input.name?.trim() || current.name, ...(input.email !== undefined ? { email: input.email.trim().toLocaleLowerCase('pt-BR') } : {}), influenceLevel: clampNumber(input.influenceLevel ?? current.influenceLevel, 0, 100, current.influenceLevel), relationshipScore: clampNumber(input.relationshipScore ?? current.relationshipScore ?? 0, 0, 100, current.relationshipScore ?? 0), updatedAt: new Date().toISOString() }
    db.contacts[index] = next
    syncContactIdentityToPrimaryLeads(db, next, input)
    writeDatabase(db); return clone(next)
  }
  async deleteContact(contactId: string) {
    const db = readDatabase(); const contact = db.contacts.find((item) => item.id === contactId); if (!contact) return
    const now = new Date().toISOString()
    db.contacts = db.contacts.filter((item) => item.id !== contactId)
    db.contactRelationships = db.contactRelationships.filter((item) => item.fromContactId !== contactId && item.toContactId !== contactId)
    db.socialProfiles = db.socialProfiles.filter((item) => !(item.entityType === 'contact' && item.entityId === contactId))
    db.leads = db.leads.map((lead) => lead.primaryContactId === contactId ? { ...lead, primaryContactId: null, updatedAt: now } : lead)
    db.opportunities = db.opportunities.map((item) => item.primaryContactId === contactId ? { ...item, primaryContactId: null, updatedAt: now } : item)
    db.activities = db.activities.map((item) => item.contactId === contactId ? { ...item, contactId: null, updatedAt: now } : item)
    db.calls = db.calls.map((item) => item.contactId === contactId ? { ...item, contactId: null } : item)
    db.events = db.events.map((item) => item.contactId === contactId ? { ...item, contactId: null, updatedAt: now } : item)
    db.proposals = db.proposals.map((item) => item.contactId === contactId ? { ...item, contactId: null, updatedAt: now } : item)
    writeDatabase(db)
  }
  async createContactRelationship(input: NewContactRelationshipInput) {
    const db = readDatabase(); if (input.fromContactId === input.toContactId) throw new Error('Selecione duas pessoas diferentes.')
    const company = db.companies.find((item) => item.id === input.companyId && item.workspaceId === input.workspaceId)
    const from = db.contacts.find((item) => item.id === input.fromContactId && item.workspaceId === input.workspaceId)
    const to = db.contacts.find((item) => item.id === input.toContactId && item.workspaceId === input.workspaceId)
    if (!company) throw new Error('Empresa da relação não encontrada neste workspace.')
    if (!from || !to) throw new Error('Os contatos da relação precisam pertencer ao mesmo workspace.')
    const now = new Date().toISOString(); const duplicate = db.contactRelationships.find((item) => item.workspaceId === input.workspaceId && item.fromContactId === input.fromContactId && item.toContactId === input.toContactId && item.relationshipType === input.relationshipType)
    if (duplicate) return clone(duplicate)
    const relationship: ContactRelationship = { ...input, id: createId('relationship'), strength: clampNumber(input.strength, 0, 100, 0), createdAt: now, updatedAt: now }; db.contactRelationships.push(relationship); writeDatabase(db); return clone(relationship)
  }
  async updateContactRelationship(relationshipId: string, input: UpdateContactRelationshipInput) {
    const db = readDatabase(); const index = db.contactRelationships.findIndex((item) => item.id === relationshipId); if (index < 0) throw new Error('Relação não encontrada.')
    const current = db.contactRelationships[index]
    const fromContactId = input.fromContactId ?? current.fromContactId
    const toContactId = input.toContactId ?? current.toContactId
    if (fromContactId === toContactId) throw new Error('Selecione duas pessoas diferentes.')
    if (!db.contacts.some((item) => item.id === fromContactId && item.workspaceId === current.workspaceId) || !db.contacts.some((item) => item.id === toContactId && item.workspaceId === current.workspaceId)) throw new Error('Os contatos da relação precisam pertencer ao mesmo workspace.')
    const duplicate = db.contactRelationships.find((item) => item.id !== relationshipId && item.workspaceId === current.workspaceId && item.fromContactId === fromContactId && item.toContactId === toContactId && item.relationshipType === (input.relationshipType ?? current.relationshipType))
    if (duplicate) throw new Error('Esta relação entre contatos já existe.')
    const next: ContactRelationship = { ...current, ...input, fromContactId, toContactId, strength: clampNumber(input.strength ?? current.strength, 0, 100, current.strength), updatedAt: new Date().toISOString() }
    db.contactRelationships[index] = next; writeDatabase(db); return clone(next)
  }
  async deleteContactRelationship(relationshipId: string) { const db = readDatabase(); db.contactRelationships = db.contactRelationships.filter((item) => item.id !== relationshipId); writeDatabase(db) }

  async listOpportunities(workspaceId: string) { return clone(readDatabase().opportunities.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())) }
  async listSocialProfiles(workspaceId: string) { return clone(readDatabase().socialProfiles.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.network.localeCompare(b.network, 'pt-BR'))) }

  async createLead(input: NewLeadInput) {
    if (!input.name.trim()) throw new Error('O nome do lead é obrigatório.')
    assertDateTime(input.nextActionAt, 'Data da próxima ação')
    assertDateTime(input.lastContactAt, 'Data do último contato')
    assertDateTime(input.expectedCloseAt, 'Data prevista de fechamento')
    assertDateTime(input.capturedAt, 'Data de captura')
    const db = readDatabase()
    const stage = db.stages.find((item) => item.id === input.stageId && item.workspaceId === input.workspaceId)
    if (!stage) throw new Error('Etapa inválida para este workspace.')
    const now = new Date().toISOString()
    const lead: Lead = { ...input, status: stageStatus(stage), value: Math.max(0, finiteNumber(input.value, 0)), influenceLevel: input.influenceLevel === undefined ? undefined : clampNumber(input.influenceLevel, 0, 100, 0), tags: normalizedTags(input.tags), id: createId('lead'), name: input.name.trim(), email: input.email.trim().toLocaleLowerCase('pt-BR'), createdAt: now, updatedAt: now }
    db.leads.unshift(lead)
    synchronizeStructureInDatabase(db, input.workspaceId)
    writeDatabase(db)
    return clone(lead)
  }

  async updateLead(leadId: string, input: UpdateLeadInput) {
    const db = readDatabase()
    const index = db.leads.findIndex((lead) => lead.id === leadId)
    if (index < 0) throw new Error('Lead não encontrado.')
    const current = db.leads[index]
    assertDateTime(input.nextActionAt === undefined ? current.nextActionAt : input.nextActionAt, 'Data da próxima ação')
    assertDateTime(input.lastContactAt === undefined ? current.lastContactAt : input.lastContactAt, 'Data do último contato')
    assertDateTime(input.expectedCloseAt === undefined ? current.expectedCloseAt : input.expectedCloseAt, 'Data prevista de fechamento')
    const stage = input.stageId ? db.stages.find((item) => item.id === input.stageId && item.workspaceId === current.workspaceId) : null
    if (input.stageId && !stage) throw new Error('Etapa inválida para este workspace.')
    const next: Lead = {
      ...current, ...input, ...(stage ? { status: stageStatus(stage) } : {}),
      ...(input.value !== undefined ? { value: Math.max(0, finiteNumber(input.value, current.value)) } : {}),
      ...(input.influenceLevel !== undefined ? { influenceLevel: clampNumber(input.influenceLevel, 0, 100, current.influenceLevel ?? 0) } : {}),
      ...(input.tags !== undefined ? { tags: normalizedTags(input.tags) } : {}),
      ...(input.email !== undefined ? { email: input.email.trim().toLocaleLowerCase('pt-BR') } : {}),
      name: input.name?.trim() || current.name, updatedAt: new Date().toISOString(),
    }
    db.leads[index] = next
    syncLeadIdentityToPrimaryContact(db, next, input)
    syncLeadCommercialProjectionToCanonicalRecords(db, next, input)
    synchronizeStructureInDatabase(db, current.workspaceId)
    writeDatabase(db)
    return clone(next)
  }

  async moveLead(leadId: string, stageId: string, lossReason?: string | null) {
    const db = readDatabase()
    const lead = db.leads.find((item) => item.id === leadId)
    if (!lead) throw new Error('Lead não encontrado.')
    const stage = db.stages.find((item) => item.id === stageId && item.workspaceId === lead.workspaceId)
    if (!stage) throw new Error('Etapa não encontrada.')
    const now = new Date().toISOString()
    const lossNote = stage.isLost ? `[Motivo da perda] ${lossReason?.trim() || 'Não informado'}` : ''
    lead.stageId = stageId; lead.status = stageStatus(stage); lead.updatedAt = now
    if (lossNote) lead.notes = [lead.notes.trim(), lossNote].filter(Boolean).join('\n')
    const opportunity = db.opportunities.find((item) => item.id === lead.opportunityId || item.leadId === lead.id)
    if (opportunity) {
      opportunity.stageId = stageId
      opportunity.status = lead.status
      opportunity.probability = stage.probability
      opportunity.forecastCategory = stage.isWon ? 'closed' : stage.isLost ? 'omitted' : opportunity.forecastCategory ?? 'pipeline'
      if (stage.isWon) opportunity.closedWonAt = opportunity.closedWonAt ?? now
      else opportunity.closedWonAt = null
      opportunity.updatedAt = now
    }
    db.activities.unshift(normalizeActivity({
      id: createId('activity'), workspaceId: lead.workspaceId, leadId: lead.id, type: 'stage_change',
      title: `Lead movido para ${stage.name}`, description: lossNote, dueAt: null, completedAt: now,
      sourceType: 'system', sourceId: lead.id, createdAt: now, updatedAt: now,
    }))
    writeDatabase(db)
    return clone(lead)
  }

  async bulkMoveLeads(workspaceId: string, leadIds: string[], stageId: string, lossReason?: string | null) {
    const ids = [...new Set(leadIds)]
    if (!ids.length) return []
    const db = readDatabase()
    const stage = db.stages.find((item) => item.id === stageId && item.workspaceId === workspaceId)
    if (!stage) throw new Error('Etapa não encontrada.')
    const leads = ids.map((id) => db.leads.find((item) => item.id === id && item.workspaceId === workspaceId))
    if (leads.some((lead) => !lead)) throw new Error('Um ou mais leads não pertencem a este workspace.')
    const now = new Date().toISOString()
    const lossNote = stage.isLost ? `[Motivo da perda] ${lossReason?.trim() || 'Não informado'}` : ''
    for (const lead of leads as Lead[]) {
      lead.stageId = stageId; lead.status = stageStatus(stage); lead.updatedAt = now
      if (lossNote) lead.notes = [lead.notes.trim(), lossNote].filter(Boolean).join('\n')
      const opportunity = db.opportunities.find((item) => item.id === lead.opportunityId || item.leadId === lead.id)
      if (opportunity) {
        opportunity.stageId = stageId
        opportunity.status = lead.status
        opportunity.probability = stage.probability
        opportunity.forecastCategory = stage.isWon ? 'closed' : stage.isLost ? 'omitted' : opportunity.forecastCategory ?? 'pipeline'
        if (stage.isWon) opportunity.closedWonAt = opportunity.closedWonAt ?? now
        else opportunity.closedWonAt = null
        opportunity.updatedAt = now
      }
      db.activities.unshift(normalizeActivity({
        id: createId('activity'), workspaceId, leadId: lead.id, type: 'stage_change',
        title: `Lead movido para ${stage.name}`, description: lossNote, dueAt: null, completedAt: now,
        sourceType: 'system', sourceId: lead.id, createdAt: now, updatedAt: now,
      }))
    }
    writeDatabase(db)
    return clone(leads as Lead[])
  }

  async deleteLead(leadId: string) {
    const db = readDatabase()
    const removedLead = db.leads.find((lead) => lead.id === leadId)
    if (!removedLead) return
    const ids = new Set([leadId])
    assertLeadsCanBeDeleted(db, removedLead.workspaceId, ids)
    const recordings = db.calls.filter((call) => call.workspaceId === removedLead.workspaceId && call.leadId === leadId && call.recordingPath?.startsWith('indexeddb:'))
    await Promise.allSettled(recordings.map((call) => deleteLocalRecording(call.id)))
    recordings.forEach((call) => { const url = recordingUrlCache.get(call.id); if (url) URL.revokeObjectURL(url); recordingUrlCache.delete(call.id) })
    removeLeadDependencies(db, removedLead.workspaceId, ids)
    writeDatabase(db)
  }

  async mergeLeads(workspaceId: string, primaryLeadId: string, duplicateLeadId: string) {
    if (primaryLeadId === duplicateLeadId) throw new Error('Selecione dois leads diferentes.')
    const db = readDatabase()
    const primaryIndex = db.leads.findIndex((lead) => lead.id === primaryLeadId && lead.workspaceId === workspaceId)
    const duplicate = db.leads.find((lead) => lead.id === duplicateLeadId && lead.workspaceId === workspaceId)
    if (primaryIndex < 0 || !duplicate) throw new Error('Um dos leads não foi encontrado neste workspace.')
    const primary = db.leads[primaryIndex]
    const duplicateOpportunities = db.opportunities.filter((item) => item.workspaceId === workspaceId && (item.leadId === duplicateLeadId || item.id === duplicate.opportunityId))
    const duplicateOpportunityIds = new Set(duplicateOpportunities.map((item) => item.id))
    const primaryOpportunity = db.opportunities.find((item) => item.workspaceId === workspaceId && (item.leadId === primaryLeadId || item.id === primary.opportunityId)) ?? null
    const merged = mergeLeadRecords(primary, duplicate)

    // V101.9.9-H2: OpportunityRecord é a fonte canônica de receita desde a V101.9.3.
    // Durante a fusão, o maior valor comercial encontrado nos dois Leads e nas suas
    // oportunidades precisa ser promovido para a oportunidade sobrevivente ANTES da
    // reconciliação canônica; caso contrário, synchronizeStructureInDatabase() pode
    // rebaixar o Lead para o valor antigo da oportunidade principal.
    const consolidatedOpportunityValue = Math.max(
      merged.value,
      primaryOpportunity?.value ?? 0,
      ...duplicateOpportunities.map((item) => item.value),
    )
    merged.value = consolidatedOpportunityValue

    let survivingOpportunity = primaryOpportunity
    if (!survivingOpportunity && duplicateOpportunities.length) {
      survivingOpportunity = duplicateOpportunities[0]
      survivingOpportunity.leadId = primaryLeadId
      merged.opportunityId = survivingOpportunity.id
    }
    if (survivingOpportunity) {
      survivingOpportunity.value = consolidatedOpportunityValue
      survivingOpportunity.ownerId = merged.ownerId
      survivingOpportunity.expectedCloseAt = merged.expectedCloseAt ?? survivingOpportunity.expectedCloseAt
      survivingOpportunity.updatedAt = merged.updatedAt
    }
    db.activities = db.activities.map((activity) => activity.workspaceId === workspaceId && activity.leadId === duplicateLeadId ? { ...activity, leadId: primaryLeadId } : activity)
    db.calls = db.calls.map((call) => call.workspaceId === workspaceId && call.leadId === duplicateLeadId ? { ...call, leadId: primaryLeadId } : call)
    db.events = db.events.map((event) => event.workspaceId === workspaceId && event.leadId === duplicateLeadId ? { ...event, leadId: primaryLeadId, updatedAt: new Date().toISOString() } : event)
    db.proposals = db.proposals.map((proposal) => proposal.workspaceId === workspaceId && proposal.leadId === duplicateLeadId ? { ...proposal, leadId: primaryLeadId, updatedAt: new Date().toISOString() } : proposal)
    db.buyerRooms = db.buyerRooms.map((room) => room.workspaceId === workspaceId && room.leadId === duplicateLeadId ? { ...room, leadId: primaryLeadId, updatedAt: new Date().toISOString() } : room)
    db.revenueEntries = db.revenueEntries.map((entry) => entry.workspaceId === workspaceId && (entry.leadId === duplicateLeadId || (entry.opportunityId && duplicateOpportunityIds.has(entry.opportunityId))) ? { ...entry, leadId: primaryLeadId, updatedAt: new Date().toISOString() } : entry)
    db.leads = db.leads.filter((lead) => lead.id !== duplicateLeadId)
    const earliestPending = db.activities.filter((activity) => activity.leadId === primaryLeadId && !activity.completedAt && activity.dueAt).map((activity) => activity.dueAt!).sort()[0] ?? null
    merged.nextActionAt = [merged.nextActionAt, earliestPending].filter((value): value is string => Boolean(value)).sort()[0] ?? null
    db.leads[db.leads.findIndex((lead) => lead.id === primaryLeadId)] = merged
    syncLeadIdentityToPrimaryContact(db, merged)
    synchronizeStructureInDatabase(db, workspaceId)
    const resolvedLead = db.leads.find((lead) => lead.id === primaryLeadId && lead.workspaceId === workspaceId)
    if (!resolvedLead) throw new Error('Falha ao consolidar o lead principal.')
    const resolvedOpportunity = db.opportunities.find((item) => item.id === resolvedLead.opportunityId || item.leadId === primaryLeadId)
    const now = new Date().toISOString()
    db.proposals = db.proposals.map((proposal) => proposal.workspaceId === workspaceId && proposal.leadId === primaryLeadId ? {
      ...proposal, companyId: resolvedLead.companyId ?? null, contactId: resolvedLead.primaryContactId ?? null, opportunityId: resolvedOpportunity?.id ?? null, updatedAt: now,
    } : proposal)
    db.revenueEntries = db.revenueEntries.map((entry) => entry.workspaceId === workspaceId && entry.leadId === primaryLeadId ? { ...entry, opportunityId: resolvedOpportunity?.id ?? null, updatedAt: now } : entry)
    db.buyerRooms = db.buyerRooms.map((room) => room.workspaceId === workspaceId && room.leadId === primaryLeadId ? { ...room, companyId: resolvedLead.companyId ?? null, opportunityId: resolvedOpportunity?.id ?? null, updatedAt: now } : room)
    const official = db.proposals.filter((proposal) => proposal.workspaceId === workspaceId && proposal.leadId === primaryLeadId && proposal.isOfficial && proposal.isCurrentVersion)
    if (official.length > 1) {
      const priority: Record<ProposalStatus, number> = { accepted: 6, viewed: 5, sent: 4, draft: 3, rejected: 2, expired: 1, cancelled: 0 }
      const selected = [...official].sort((a, b) => Number(Boolean(b.closedWonAt)) - Number(Boolean(a.closedWonAt)) || priority[b.status] - priority[a.status] || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
      for (const proposal of official) proposal.isOfficial = proposal.id === selected.id
    }
    const selectedOfficial = db.proposals.find((proposal) => proposal.workspaceId === workspaceId && proposal.leadId === primaryLeadId && proposal.isOfficial && proposal.isCurrentVersion)
    if (selectedOfficial) {
      // A consolidação não pode reduzir um valor comercial válido informado em
      // um dos cadastros duplicados. A proposta oficial continua elevando o valor
      // quando for maior, mas nunca apaga um valor superior preservado no merge.
      const consolidatedValue = Math.max(merged.value, resolvedLead.value, resolvedOpportunity?.value ?? 0, selectedOfficial.totalContractValue)
      resolvedLead.value = consolidatedValue
      resolvedLead.expectedCloseAt = selectedOfficial.expectedCloseAt
      resolvedLead.updatedAt = now
      if (resolvedOpportunity) {
        resolvedOpportunity.officialProposalId = selectedOfficial.id
        resolvedOpportunity.value = consolidatedValue
        resolvedOpportunity.expectedCloseAt = selectedOfficial.expectedCloseAt
        resolvedOpportunity.forecastCategory = selectedOfficial.forecastCategory
        resolvedOpportunity.probability = selectedOfficial.probability
        resolvedOpportunity.updatedAt = now
      }
    }
    db.auditLogs.unshift({
      id: createId('audit'), workspaceId, userId: null, userName: 'Sistema local', action: 'lead_merged',
      entityType: 'lead', entityId: primaryLeadId, createdAt: now,
    })
    writeDatabase(db)
    return clone(resolvedLead)
  }

  async bulkUpdateLeads(workspaceId: string, leadIds: string[], input: UpdateLeadInput) {
    const ids = new Set(leadIds)
    if (!ids.size) return 0
    const db = readDatabase()
    const stage = input.stageId ? db.stages.find((item) => item.id === input.stageId && item.workspaceId === workspaceId) : null
    if (input.stageId && !stage) throw new Error('Etapa inválida para este workspace.')
    assertDateTime(input.nextActionAt, 'Data da próxima ação')
    assertDateTime(input.lastContactAt, 'Data do último contato')
    assertDateTime(input.expectedCloseAt, 'Data prevista de fechamento')
    let count = 0
    db.leads = db.leads.map((lead) => {
      if (lead.workspaceId !== workspaceId || !ids.has(lead.id)) return lead
      count += 1
      return {
        ...lead, ...input, ...(stage ? { status: stageStatus(stage) } : {}),
        ...(input.value !== undefined ? { value: Math.max(0, finiteNumber(input.value, lead.value)) } : {}),
        ...(input.influenceLevel !== undefined ? { influenceLevel: clampNumber(input.influenceLevel, 0, 100, lead.influenceLevel ?? 0) } : {}),
        ...(input.tags !== undefined ? { tags: normalizedTags(input.tags) } : {}),
        ...(input.email !== undefined ? { email: input.email.trim().toLocaleLowerCase('pt-BR') } : {}),
        updatedAt: new Date().toISOString(),
      }
    })
    for (const lead of db.leads) if (lead.workspaceId === workspaceId && ids.has(lead.id)) {
      syncLeadIdentityToPrimaryContact(db, lead, input)
      syncLeadCommercialProjectionToCanonicalRecords(db, lead, input)
    }
    if (stage) db.opportunities = db.opportunities.map((opportunity) => opportunity.workspaceId === workspaceId && ids.has(opportunity.leadId) ? { ...opportunity, stageId: stage.id, status: stageStatus(stage), probability: stage.probability, updatedAt: new Date().toISOString() } : opportunity)
    synchronizeStructureInDatabase(db, workspaceId)
    writeDatabase(db)
    return count
  }

  async bulkAddLeadTag(workspaceId: string, leadIds: string[], tag: string) {
    const cleanTag = tag.trim().slice(0, 40)
    if (!cleanTag) throw new Error('Informe uma tag válida.')
    const ids = new Set(leadIds)
    if (!ids.size) return 0
    const db = readDatabase(); let count = 0; const updatedAt = new Date().toISOString()
    db.leads = db.leads.map((lead) => {
      if (lead.workspaceId !== workspaceId || !ids.has(lead.id)) return lead
      count += 1
      return { ...lead, tags: normalizedTags([...lead.tags, cleanTag]), updatedAt }
    })
    writeDatabase(db)
    return count
  }

  async bulkDeleteLeads(workspaceId: string, leadIds: string[]) {
    const ids = new Set(leadIds)
    if (!ids.size) return 0
    const db = readDatabase()
    const existingIds = new Set(db.leads.filter((lead) => lead.workspaceId === workspaceId && ids.has(lead.id)).map((lead) => lead.id))
    if (!existingIds.size) return 0
    assertLeadsCanBeDeleted(db, workspaceId, existingIds)
    const recordings = db.calls.filter((call) => call.workspaceId === workspaceId && existingIds.has(call.leadId) && call.recordingPath?.startsWith('indexeddb:'))
    await Promise.allSettled(recordings.map((call) => deleteLocalRecording(call.id)))
    recordings.forEach((call) => { const url = recordingUrlCache.get(call.id); if (url) URL.revokeObjectURL(url); recordingUrlCache.delete(call.id) })
    removeLeadDependencies(db, workspaceId, existingIds)
    writeDatabase(db)
    return existingIds.size
  }

  async listStages(workspaceId: string) { return clone(readDatabase().stages.filter((stage) => stage.workspaceId === workspaceId).sort((a, b) => a.order - b.order)) }

  async createStage(input: NewStageInput) {
    const db = readDatabase(); const name = input.name.trim()
    if (!name) throw new Error('Informe o nome da etapa.')
    if (input.isWon && input.isLost) throw new Error('Uma etapa não pode ser ganha e perdida ao mesmo tempo.')
    if (db.stages.some((stage) => stage.workspaceId === input.workspaceId && stage.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) throw new Error('Já existe uma etapa com esse nome.')
    const maxOrder = Math.max(0, ...db.stages.filter((stage) => stage.workspaceId === input.workspaceId).map((stage) => stage.order))
    const order = input.order === undefined ? maxOrder + 1 : Math.max(1, Math.round(finiteNumber(input.order, maxOrder + 1)))
    const stage: PipelineStage = { ...input, name, order, probability: clampNumber(input.probability, 0, 100, 0), id: createId('stage') }
    db.stages.push(stage)
    db.stages.filter((item) => item.workspaceId === input.workspaceId).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'pt-BR')).forEach((item, index) => { item.order = index + 1 })
    writeDatabase(db); return clone(stage)
  }

  async updateStage(stageId: string, input: UpdateStageInput) {
    const db = readDatabase(); const index = db.stages.findIndex((stage) => stage.id === stageId)
    if (index < 0) throw new Error('Etapa não encontrada.')
    const current = db.stages[index]; const name = input.name?.trim()
    if (name && db.stages.some((stage) => stage.workspaceId === current.workspaceId && stage.id !== stageId && stage.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) throw new Error('Já existe uma etapa com esse nome.')
    if (input.order !== undefined && (!Number.isInteger(input.order) || input.order < 1)) throw new Error('A ordem da etapa deve ser um inteiro positivo.')
    const next: PipelineStage = { ...current, ...input, ...(name ? { name } : {}), probability: input.probability === undefined ? current.probability : clampNumber(input.probability, 0, 100, current.probability) }
    if (next.isWon && next.isLost) throw new Error('Uma etapa não pode ser ganha e perdida ao mesmo tempo.')
    db.stages[index] = next
    // Pure order/name/color/percent changes must not rewrite the activity
    // history timestamps of leads that were not moved between stages.
    const now = new Date().toISOString()
    if (next.isWon!==current.isWon||next.isLost!==current.isLost)
    db.leads = db.leads.map((lead) => lead.workspaceId === next.workspaceId && lead.stageId === stageId ? { ...lead, status: lead.status === 'archived' ? 'archived' : stageStatus(next), updatedAt: now } : lead)
    if(next.probability!==current.probability||next.isWon!==current.isWon||next.isLost!==current.isLost)
    db.opportunities = db.opportunities.map((opportunity) => opportunity.workspaceId === next.workspaceId && opportunity.stageId === stageId ? {
      ...opportunity,
      status: stageStatus(next),
      probability: next.probability,
      forecastCategory: next.isWon ? 'closed' : next.isLost ? 'omitted' : opportunity.forecastCategory === 'closed' || opportunity.forecastCategory === 'omitted' ? 'pipeline' : opportunity.forecastCategory,
      closedWonAt: next.isWon ? opportunity.closedWonAt ?? now : null,
      updatedAt: now,
    } : opportunity)
    writeDatabase(db); return clone(next)
  }

  async deleteStage(stageId: string) {
    const db = readDatabase(); const stage = db.stages.find((item) => item.id === stageId)
    if (!stage) throw new Error('Etapa não encontrada.')
    if (db.leads.some((lead) => lead.stageId === stageId) || db.opportunities.some((opportunity) => opportunity.stageId === stageId)) throw new Error('Mova os leads e oportunidades desta etapa antes de excluí-la.')
    if (db.automationRules.some((rule) => rule.workspaceId === stage.workspaceId && rule.actions.some((action) => action.type === 'move_stage' && action.value === stageId))) throw new Error('Esta etapa é usada por uma automação. Atualize a automação antes de excluí-la.')
    const workspaceStages = db.stages.filter((item) => item.workspaceId === stage.workspaceId)
    if (workspaceStages.length <= 1) throw new Error('O Pipeline precisa manter ao menos uma etapa.')
    if (stage.isWon && workspaceStages.filter((item) => item.isWon).length <= 1) throw new Error('O Pipeline precisa manter ao menos uma etapa de ganho.')
    db.stages = db.stages.filter((item) => item.id !== stageId)
    db.stages.filter((item) => item.workspaceId === stage.workspaceId).sort((a, b) => a.order - b.order).forEach((item, index) => { item.order = index + 1 })
    writeDatabase(db)
  }

  async listActivities(workspaceId: string) { return clone(readDatabase().activities.filter((activity) => activity.workspaceId === workspaceId)) }

  async createActivity(input: NewActivityInput) {
    if (!input.title.trim()) throw new Error('Informe o título da atividade.')
    assertDateTime(input.dueAt, 'Data da atividade')
    assertDateTime(input.completedAt, 'Data de conclusão')
    const db = readDatabase(); const now = new Date().toISOString()
    const lead = input.leadId ? db.leads.find((item) => item.id === input.leadId && item.workspaceId === input.workspaceId) : null
    if (input.leadId && !lead) throw new Error('Lead inválido para este workspace.')
    const inferredContactId = input.contactId ?? lead?.primaryContactId ?? null
    if (inferredContactId && !db.contacts.some((contact) => contact.id === inferredContactId && contact.workspaceId === input.workspaceId)) throw new Error('Contato inválido para este workspace.')
    const activity = normalizeActivity({ ...input, contactId: inferredContactId, id: createId('activity'), title: input.title.trim(), createdAt: now, updatedAt: now })
    db.activities.unshift(activity); syncLeadNextAction(db, activity.leadId); writeDatabase(db); return clone(activity)
  }

  async createActivities(inputs: NewActivityInput[]) {
    if (!inputs.length) return []
    const db = readDatabase(); const now = new Date().toISOString()
    for (const input of inputs) {
      if (!input.title.trim()) throw new Error('Informe o título de todas as atividades.')
      assertDateTime(input.dueAt, 'Data da atividade')
      assertDateTime(input.completedAt, 'Data de conclusão')
      const lead = input.leadId ? db.leads.find((item) => item.id === input.leadId && item.workspaceId === input.workspaceId) : null
      if (input.leadId && !lead) throw new Error('Uma atividade possui lead inválido para este workspace.')
      const contactId = input.contactId ?? lead?.primaryContactId ?? null
      if (contactId && !db.contacts.some((contact) => contact.id === contactId && contact.workspaceId === input.workspaceId)) throw new Error('Uma atividade possui contato inválido para este workspace.')
    }
    const activities = inputs.map((input) => {
      const lead = input.leadId ? db.leads.find((item) => item.id === input.leadId && item.workspaceId === input.workspaceId) : null
      return normalizeActivity({ ...input, contactId: input.contactId ?? lead?.primaryContactId ?? null, id: createId('activity'), title: input.title.trim(), createdAt: now, updatedAt: now })
    })
    db.activities.unshift(...activities)
    new Set(activities.map((activity) => activity.leadId).filter((id): id is string => Boolean(id))).forEach((leadId) => syncLeadNextAction(db, leadId))
    writeDatabase(db)
    return clone(activities)
  }

  async updateActivity(activityId: string, input: UpdateActivityInput) {
    const db = readDatabase(); const index = db.activities.findIndex((item) => item.id === activityId)
    if (index < 0) throw new Error('Atividade não encontrada.')
    const current = db.activities[index]
    const previousLead = current.leadId
    const leadId = input.leadId === undefined ? current.leadId : input.leadId
    const lead = leadId ? db.leads.find((item) => item.id === leadId && item.workspaceId === current.workspaceId) : null
    if (leadId && !lead) throw new Error('Lead inválido para este workspace.')
    const inferredContactPatch = input.leadId !== undefined && input.contactId === undefined ? { contactId: lead?.primaryContactId ?? null } : {}
    const contactId = input.contactId !== undefined ? input.contactId : ('contactId' in inferredContactPatch ? inferredContactPatch.contactId : current.contactId ?? null)
    if (contactId && !db.contacts.some((contact) => contact.id === contactId && contact.workspaceId === current.workspaceId)) throw new Error('Contato inválido para este workspace.')
    assertDateTime(input.dueAt === undefined ? current.dueAt : input.dueAt, 'Data da atividade')
    assertDateTime(input.completedAt === undefined ? current.completedAt : input.completedAt, 'Data de conclusão')
    const next = normalizeActivity({ ...current, ...input, ...inferredContactPatch, ...(input.title !== undefined ? { title: input.title.trim() } : {}), updatedAt: new Date().toISOString() })
    if (!next.title) throw new Error('Informe o título da atividade.')
    db.activities[index] = next
    if (next.leadId && next.completedAt && (next.resolutionStatus ?? 'completed') === 'completed' && ['call', 'followup', 'meeting'].includes(next.type)) {
      const lead = db.leads.find((item) => item.id === next.leadId && item.workspaceId === next.workspaceId)
      if (lead && (!lead.lastContactAt || next.completedAt > lead.lastContactAt)) lead.lastContactAt = next.completedAt
    }
    syncLeadNextAction(db, previousLead); syncLeadNextAction(db, next.leadId); writeDatabase(db); return clone(next)
  }

  async deleteActivity(activityId: string) {
    const db = readDatabase(); const activity = db.activities.find((item) => item.id === activityId)
    if (!activity) throw new Error('Atividade não encontrada.')
    if (activity.sourceType === 'calendar' || activity.sourceType === 'call') throw new Error('Esta atividade é gerenciada pelo módulo de origem.')
    db.activities = db.activities.filter((item) => item.id !== activityId); syncLeadNextAction(db, activity.leadId); writeDatabase(db)
  }

  async completeActivity(activityId: string, completed: boolean) {
    return this.updateActivity(activityId, { completedAt: completed ? new Date().toISOString() : null, resolutionStatus: completed ? 'completed' : 'pending', resolutionReason: completed ? 'manual' : null })
  }

  async registerActivityOutcome(input: RegisterActivityOutcomeInput): Promise<CommercialActivityResult> {
    const db = readDatabase()
    const activity = db.activities.find((item) => item.id === input.activityId && item.workspaceId === input.workspaceId)
    if (!activity) throw new Error('Atividade não encontrada para registrar o resultado.')
    if (!activity.leadId) throw new Error('A atividade precisa estar vinculada a um lead.')
    const lead = db.leads.find((item) => item.id === activity.leadId && item.workspaceId === input.workspaceId)
    if (!lead) throw new Error('Lead não encontrado para esta atividade.')
    if (input.createNext && (!input.nextType || !input.nextTitle?.trim() || !input.nextAt)) throw new Error('Informe o próximo passo completo.')
    if (input.createNext) assertDateTime(input.nextAt, 'Data do próximo passo')
    const resultSourceId = `commercial:${activity.id}:result`
    const previousResult = db.activities.find((item) => item.sourceType === 'system' && item.sourceId === resultSourceId)
    if (previousResult) {
      const next = db.activities.find((item) => item.sourceType === 'system' && item.sourceId === `commercial:${activity.id}:next`)
      return { activity: clone(activity), lead: clone(lead), resultActivityId: previousResult.id, nextActivityId: next?.id ?? null, idempotent: true }
    }

    const now = new Date().toISOString()
    activity.completedAt = now
    activity.resolutionStatus = 'completed'
    activity.resolutionReason = 'commercial_outcome'
    activity.updatedAt = now
    if (!lead.lastContactAt || now > lead.lastContactAt) lead.lastContactAt = now

    const closesProspecting = ['meeting_scheduled', 'not_interested', 'won', 'lost'].includes(input.outcome)
    const closesCalls = input.outcome === 'invalid_contact'
    if (closesProspecting || closesCalls) {
      for (const pending of db.activities) {
        if (pending.leadId !== lead.id || pending.completedAt || pending.id === activity.id) continue
        if ((closesProspecting && ['call', 'followup'].includes(pending.type)) || (closesCalls && pending.type === 'call')) {
          pending.completedAt = now
          pending.resolutionStatus = 'superseded'
          pending.resolutionReason = input.outcome === 'meeting_scheduled' ? 'meeting_scheduled' : input.outcome
          pending.updatedAt = now
        }
      }
    }

    const resultActivity = normalizeActivity({
      id: createId('activity'), workspaceId: input.workspaceId, leadId: lead.id, contactId: activity.contactId ?? lead.primaryContactId ?? null, type: 'note', title: input.resultTitle.trim(),
      description: input.resultDescription, dueAt: null, completedAt: now, assignedTo: input.userId ?? activity.assignedTo,
      sourceType: 'system', sourceId: resultSourceId, createdAt: now, updatedAt: now,
    })
    db.activities.unshift(resultActivity)

    const desiredTerminalStatus = input.outcome === 'won' ? 'won' : input.outcome === 'lost' || input.outcome === 'not_interested' ? 'lost' : null
    const stage = input.stageId
      ? db.stages.find((item) => item.id === input.stageId && item.workspaceId === input.workspaceId)
      : desiredTerminalStatus === 'won'
        ? db.stages.find((item) => item.workspaceId === input.workspaceId && item.isWon)
        : desiredTerminalStatus === 'lost'
          ? db.stages.find((item) => item.workspaceId === input.workspaceId && item.isLost)
          : null
    if (input.stageId && !stage) throw new Error('Etapa inválida para este workspace.')
    if (desiredTerminalStatus && !stage) throw new Error(`Configure uma etapa marcada como ${desiredTerminalStatus === 'won' ? 'ganha' : 'perdida'} antes de registrar este resultado.`)
    if (stage && stage.id !== lead.stageId) {
      lead.stageId = stage.id
      lead.status = stageStatus(stage)
      const opportunity = db.opportunities.find((item) => item.id === lead.opportunityId || item.leadId === lead.id)
      if (opportunity) {
        opportunity.stageId = stage.id
        opportunity.status = lead.status
        opportunity.probability = stage.probability
        opportunity.forecastCategory = stage.isWon ? 'closed' : stage.isLost ? 'omitted' : opportunity.forecastCategory ?? 'pipeline'
        opportunity.closedWonAt = stage.isWon ? opportunity.closedWonAt ?? now : null
        opportunity.updatedAt = now
      }
      db.activities.unshift(normalizeActivity({
        id: createId('activity'), workspaceId: input.workspaceId, leadId: lead.id, contactId: activity.contactId ?? lead.primaryContactId ?? null, type: 'stage_change', title: `Lead movido para ${stage.name}`,
        description: `Movimentação automática após “${input.resultTitle.trim()}”.`, dueAt: null, completedAt: now, assignedTo: input.userId,
        sourceType: 'system', sourceId: `commercial:${activity.id}:stage`, createdAt: now, updatedAt: now,
      }))
    } else if (stage) lead.status = stageStatus(stage)

    if (input.outcome === 'invalid_contact') lead.tags = [...new Set([...lead.tags, 'telefone-invalido'])]
    if (input.outcome === 'not_decision_maker') lead.tags = [...new Set([...lead.tags, 'buscar-decisor'])]
    lead.updatedAt = now

    let nextActivityId: string | null = null
    if (input.createNext && input.nextType && input.nextTitle && input.nextAt) {
      const next = normalizeActivity({
        id: createId('activity'), workspaceId: input.workspaceId, leadId: lead.id, contactId: activity.contactId ?? lead.primaryContactId ?? null, type: input.nextType, title: input.nextTitle.trim(),
        description: input.nextDescription ?? '', dueAt: input.nextAt, completedAt: null, assignedTo: input.userId ?? activity.assignedTo,
        sourceType: 'system', sourceId: `commercial:${activity.id}:next`, createdAt: now, updatedAt: now,
      })
      db.activities.unshift(next); nextActivityId = next.id
    }

    syncLeadNextAction(db, lead.id)
    db.auditLogs.unshift({ id: createId('audit'), workspaceId: input.workspaceId, userId: input.userId, userName: lead.ownerName || 'Vendedor', action: 'commercial_activity_result_registered', entityType: 'activity', entityId: activity.id, createdAt: now })
    writeDatabase(db)
    return { activity: clone(activity), lead: clone(lead), resultActivityId: resultActivity.id, nextActivityId, idempotent: false }
  }

  async listCalls(workspaceId: string) {
    return clone(readDatabase().calls.filter((call) => call.workspaceId === workspaceId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 500).map((call) => ({ ...call, recordingUrl: null })))
  }

  async listCallsPage(workspaceId: string, beforeStartedAt: string | null = null, limit = 200) {
    const max = Math.max(1, Math.min(500, Math.floor(limit || 200)))
    const before = beforeStartedAt ? new Date(beforeStartedAt).getTime() : Number.POSITIVE_INFINITY
    return clone(readDatabase().calls
      .filter((call) => call.workspaceId === workspaceId && new Date(call.startedAt).getTime() < before)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, max)
      .map((call) => ({ ...call, recordingUrl: null })))
  }

  async getCallRecordingUrl(callId: string) {
    const call = readDatabase().calls.find((item) => item.id === callId)
    if (!call?.recordingPath?.startsWith('indexeddb:')) return null
    const cached = recordingUrlCache.get(call.id)
    if (cached) return cached
    try {
      const blob = await readLocalRecording(call.id)
      if (!blob) return null
      const url = URL.createObjectURL(blob)
      recordingUrlCache.set(call.id, url)
      return url
    } catch { return null }
  }

  async createCall(input: NewCallInput, recording?: Blob | null) {
    const db = readDatabase()
    const lead = db.leads.find((item) => item.id === input.leadId && item.workspaceId === input.workspaceId)
    if (!lead) throw new Error('Lead inválido para esta ligação.')
    assertDateTime(input.startedAt, 'Data de início da ligação')
    assertDateTime(input.endedAt, 'Data de término da ligação')
    if (input.endedAt && new Date(input.endedAt).getTime() < new Date(input.startedAt).getTime()) throw new Error('O término da ligação não pode ser anterior ao início.')
    if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0) throw new Error('Duração da ligação inválida.')
    if (recording?.size && !input.consentAt) throw new Error('Registre o consentimento antes de salvar uma gravação.')
    const callId = createId('call')
    if (recording?.size) await saveLocalRecording(callId, recording)
    const inferredContactId = input.contactId ?? lead.primaryContactId ?? null
    if (inferredContactId && !db.contacts.some((contact) => contact.id === inferredContactId && contact.workspaceId === input.workspaceId)) throw new Error('Contato inválido para esta ligação.')
    const call: CallRecord = { ...input, durationSeconds: Math.max(0, finiteNumber(input.durationSeconds, 0)), contactId: inferredContactId, id: callId, createdAt: new Date().toISOString(), recordingPath: recording?.size ? `indexeddb:${callId}` : null, recordingUrl: null }
    db.calls.unshift(call)
    const contactedAt = call.endedAt ?? call.startedAt
    if (lead && (!lead.lastContactAt || contactedAt > lead.lastContactAt)) lead.lastContactAt = contactedAt
    db.activities.unshift(normalizeActivity({
      id: createId('activity'), workspaceId: call.workspaceId, leadId: call.leadId, contactId: call.contactId ?? null, type: 'call', title: `Ligação — ${call.outcome}`,
      description: call.notes, dueAt: call.startedAt, completedAt: call.endedAt ?? call.startedAt, assignedTo: call.userId,
      sourceType: 'call', sourceId: call.id, createdAt: call.createdAt, updatedAt: call.createdAt,
    }))
    writeDatabase(db); return clone(call)
  }

  async registerCallOutcome(input: RegisterCallOutcomeInput, recording?: Blob | null): Promise<CommercialActionResult> {
    const db = readDatabase()
    const lead = db.leads.find((item) => item.id === input.leadId && item.workspaceId === input.workspaceId)
    if (!lead) throw new Error('Lead inválido para esta ação comercial.')
    assertDateTime(input.startedAt, 'Data de início da ligação')
    assertDateTime(input.endedAt, 'Data de término da ligação')
    if (input.endedAt && new Date(input.endedAt).getTime() < new Date(input.startedAt).getTime()) throw new Error('O término da ligação não pode ser anterior ao início.')
    if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0) throw new Error('Duração da ligação inválida.')
    if (input.scheduleNext) assertDateTime(input.nextAt, 'Data do próximo passo')
    if (recording?.size && !input.consentAt) throw new Error('Registre o consentimento antes de salvar uma gravação.')
    const requestedContactId = input.contactId ?? lead.primaryContactId ?? null
    if (requestedContactId && !db.contacts.some((contact) => contact.id === requestedContactId && contact.workspaceId === input.workspaceId)) throw new Error('Contato inválido para esta ligação.')
    const plan = buildCommercialCallPlan({ outcome: input.outcome, scheduleNext: input.scheduleNext, nextAt: input.nextAt })
    const duplicate = db.calls.find((call) => call.workspaceId === input.workspaceId && call.leadId === input.leadId && call.startedAt === input.startedAt)
    if (duplicate) {
      const completed = db.activities.find((activity) => activity.sourceType === 'call' && activity.sourceId === duplicate.id)
      const next = db.activities.find((activity) => activity.sourceType === 'system' && activity.sourceId === `commercial:${duplicate.id}:next`)
      const event = db.events.find((item) => item.description.includes(`[[CRM_COMMERCIAL_ACTION:${duplicate.id}]]`))
      return { call: clone(duplicate), lead: clone(lead), activityId: completed?.id ?? '', nextActivityId: next?.id ?? null, calendarEventId: event?.id ?? null, idempotent: true }
    }

    const now = new Date().toISOString()
    const callId = createId('call')
    let recordingSaved = false
    try {
      if (recording?.size) { await saveLocalRecording(callId, recording); recordingSaved = true }
      const { scheduleNext: _scheduleNext, nextAt: _nextAt, meetingDurationMinutes: _meetingDurationMinutes, ...callInput } = input
      const inferredContactId = callInput.contactId ?? lead.primaryContactId ?? null
      const call: CallRecord = { ...callInput, durationSeconds: Math.max(0, finiteNumber(callInput.durationSeconds, 0)), contactId: inferredContactId, id: callId, createdAt: now, recordingPath: recording?.size ? `indexeddb:${callId}` : null, recordingUrl: null }
      db.calls.unshift(call)

      const completedActivity = normalizeActivity({
        id: createId('activity'), workspaceId: call.workspaceId, leadId: call.leadId, contactId: call.contactId ?? null, type: 'call', title: `Ligação — ${plan.label}`,
        description: call.notes, dueAt: call.startedAt, completedAt: call.endedAt ?? call.startedAt, assignedTo: call.userId,
        sourceType: 'call', sourceId: call.id, createdAt: now, updatedAt: now,
      })
      db.activities.unshift(completedActivity)

      for (const activity of db.activities) {
        if (activity.leadId === lead.id && !activity.completedAt && shouldClosePendingActivity(activity.type, plan.pendingActivityPolicy)) {
          activity.completedAt = now
          activity.resolutionStatus = 'superseded'
          activity.resolutionReason = `call_outcome:${input.outcome}`
          activity.updatedAt = now
        }
      }

      const stage = resolveCommercialStage(db.stages, input.workspaceId, plan.stageIntent)
      const previousStageId = lead.stageId
      if (plan.leadStatus && !stage) throw new Error(`Configure uma etapa marcada como ${plan.leadStatus === 'won' ? 'ganha' : 'perdida'} antes de registrar este resultado.`)
      if (stage) {
        lead.stageId = stage.id
        lead.status = stageStatus(stage)
        const opportunity = db.opportunities.find((item) => item.id === lead.opportunityId || item.leadId === lead.id)
        if (opportunity) {
          opportunity.stageId = stage.id
          opportunity.status = lead.status
          opportunity.probability = stage.probability
          opportunity.forecastCategory = stage.isWon ? 'closed' : stage.isLost ? 'omitted' : opportunity.forecastCategory ?? 'pipeline'
          opportunity.closedWonAt = stage.isWon ? opportunity.closedWonAt ?? now : null
          opportunity.updatedAt = now
        }
      }
      if (plan.addTags.length) lead.tags = [...new Set([...lead.tags, ...plan.addTags])]
      const contactedAt = call.endedAt ?? call.startedAt
      if (!lead.lastContactAt || contactedAt > lead.lastContactAt) lead.lastContactAt = contactedAt
      if (call.contactId) {
        const contact = db.contacts.find((item) => item.id === call.contactId && item.workspaceId === input.workspaceId)
        if (contact) {
          if (!contact.lastContactAt || contactedAt > contact.lastContactAt) contact.lastContactAt = contactedAt
          contact.nextActionAt = input.scheduleNext ? input.nextAt : null
          contact.updatedAt = now
        }
      }
      lead.updatedAt = now

      if (stage && previousStageId !== stage.id) {
        db.activities.unshift(normalizeActivity({
          id: createId('activity'), workspaceId: input.workspaceId, leadId: lead.id, type: 'stage_change', title: `Lead movido para ${stage.name}`,
          description: `Movimentação automática pelo resultado “${plan.label}”.`, dueAt: null, completedAt: now, assignedTo: input.userId,
          sourceType: 'system', sourceId: `commercial:${callId}:stage`, createdAt: now, updatedAt: now,
        }))
      }

      let nextActivityId: string | null = null
      let calendarEventId: string | null = null
      if (plan.nextStepKind === 'meeting' && input.nextAt) {
        const endsAt = new Date(input.nextAt)
        endsAt.setMinutes(endsAt.getMinutes() + Math.max(15, finiteNumber(input.meetingDurationMinutes, 30)))
        const event: CalendarEvent = {
          id: createId('event'), workspaceId: input.workspaceId, leadId: lead.id, contactId: call.contactId ?? lead.primaryContactId ?? null, title: `Reunião — ${lead.name}`,
          description: `${input.notes}
[[CRM_COMMERCIAL_ACTION:${callId}]]`.trim(), startsAt: input.nextAt, endsAt: endsAt.toISOString(), allDay: false,
          location: '', status: 'confirmed', assignedTo: input.userId, createdAt: now, updatedAt: now,
        }
        db.events.push(event); calendarEventId = event.id
        const activity = normalizeActivity({
          id: createId('activity'), workspaceId: input.workspaceId, leadId: lead.id, contactId: event.contactId ?? null, type: 'meeting', title: event.title,
          description: event.description, dueAt: event.startsAt, completedAt: null, assignedTo: input.userId,
          sourceType: 'calendar', sourceId: event.id, createdAt: now, updatedAt: now,
        })
        db.activities.unshift(activity); nextActivityId = activity.id
      } else if (plan.nextStepKind === 'call' && input.nextAt) {
        const activity = normalizeActivity({
          id: createId('activity'), workspaceId: input.workspaceId, leadId: lead.id, contactId: call.contactId ?? lead.primaryContactId ?? null, type: 'call', title: `Próxima ligação — ${lead.name}`,
          description: `${plan.label}. ${input.notes}`.trim(), dueAt: input.nextAt, completedAt: null, assignedTo: input.userId,
          sourceType: 'system', sourceId: `commercial:${callId}:next`, createdAt: now, updatedAt: now,
        })
        db.activities.unshift(activity); nextActivityId = activity.id
      }

      syncLeadNextAction(db, lead.id)
      db.auditLogs.unshift({ id: createId('audit'), workspaceId: input.workspaceId, userId: input.userId, userName: lead.ownerName || 'Vendedor', action: 'commercial_call_registered', entityType: 'call', entityId: call.id, createdAt: now })
      writeDatabase(db)
      return { call: clone(call), lead: clone(lead), activityId: completedActivity.id, nextActivityId, calendarEventId, idempotent: false }
    } catch (error) {
      if (recordingSaved) await deleteLocalRecording(callId)
      throw error
    }
  }

  async deleteCall(callId: string) {
    const db = readDatabase(); const call = db.calls.find((item) => item.id === callId)
    if (!call) throw new Error('Ligação não encontrada.')
    if (call.recordingPath?.startsWith('indexeddb:')) await deleteLocalRecording(call.id)
    const recordingUrl = recordingUrlCache.get(call.id); if (recordingUrl) URL.revokeObjectURL(recordingUrl); recordingUrlCache.delete(call.id)
    db.calls = db.calls.filter((item) => item.id !== callId)
    db.activities = db.activities.filter((activity) => !(activity.sourceType === 'call' && activity.sourceId === callId))
    writeDatabase(db)
  }

  async listCalendarEvents(workspaceId: string) { return clone(readDatabase().events.filter((event) => event.workspaceId === workspaceId).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())) }

  async createCalendarEvent(input: NewCalendarEventInput) {
    if (!input.title.trim()) throw new Error('Informe o título do compromisso.')
    assertDateRange(input.startsAt, input.endsAt)
    const db = readDatabase(); const now = new Date().toISOString()
    const lead = input.leadId ? db.leads.find((item) => item.id === input.leadId && item.workspaceId === input.workspaceId) : null
    if (input.leadId && !lead) throw new Error('Lead inválido para este workspace.')
    const inferredContactId = input.contactId ?? lead?.primaryContactId ?? null
    if (inferredContactId && !db.contacts.some((contact) => contact.id === inferredContactId && contact.workspaceId === input.workspaceId)) throw new Error('Contato inválido para este workspace.')
    const event: CalendarEvent = { ...input, contactId: inferredContactId, id: createId('event'), title: input.title.trim(), createdAt: now, updatedAt: now }
    db.events.push(event)
    db.activities.unshift(normalizeActivity({
      id: createId('activity'), workspaceId: event.workspaceId, leadId: event.leadId, contactId: event.contactId ?? null, type: 'meeting', title: event.title,
      description: event.description, dueAt: event.startsAt, completedAt: event.status === 'completed' || event.status === 'cancelled' ? now : null,
      resolutionStatus: event.status === 'completed' ? 'completed' : event.status === 'cancelled' ? 'cancelled' : 'pending', resolutionReason: event.status === 'cancelled' ? 'calendar_cancelled' : event.status === 'completed' ? 'meeting_completed' : null,
      assignedTo: event.assignedTo, sourceType: 'calendar', sourceId: event.id, createdAt: now, updatedAt: now,
    }))
    syncLeadNextAction(db, event.leadId); writeDatabase(db); return clone(event)
  }

  async updateCalendarEvent(eventId: string, input: UpdateCalendarEventInput) {
    const db = readDatabase(); const index = db.events.findIndex((item) => item.id === eventId)
    if (index < 0) throw new Error('Compromisso não encontrado.')
    const current = db.events[index]
    const previousLead = current.leadId
    const leadId = input.leadId === undefined ? current.leadId : input.leadId
    const lead = leadId ? db.leads.find((item) => item.id === leadId && item.workspaceId === current.workspaceId) : null
    if (leadId && !lead) throw new Error('Lead inválido para este workspace.')
    const contactId = input.contactId !== undefined ? input.contactId : input.leadId !== undefined ? lead?.primaryContactId ?? null : current.contactId ?? null
    if (contactId && !db.contacts.some((contact) => contact.id === contactId && contact.workspaceId === current.workspaceId)) throw new Error('Contato inválido para este workspace.')
    const next: CalendarEvent = { ...current, ...input, contactId, updatedAt: new Date().toISOString() }
    if (!next.title.trim()) throw new Error('Informe o título do compromisso.')
    assertDateRange(next.startsAt, next.endsAt)
    db.events[index] = next
    const activityIndex = db.activities.findIndex((activity) => activity.sourceType === 'calendar' && activity.sourceId === eventId)
    const activityData: Partial<ActivityItem> = {
      workspaceId: next.workspaceId, leadId: next.leadId, contactId: next.contactId ?? null, type: 'meeting', title: next.title, description: next.description,
      dueAt: next.startsAt, completedAt: next.status === 'completed' || next.status === 'cancelled' ? new Date().toISOString() : null,
      resolutionStatus: next.status === 'completed' ? 'completed' : next.status === 'cancelled' ? 'cancelled' : 'pending', resolutionReason: next.status === 'cancelled' ? 'calendar_cancelled' : next.status === 'completed' ? 'meeting_completed' : null,
      assignedTo: next.assignedTo, sourceType: 'calendar', sourceId: next.id, updatedAt: new Date().toISOString(),
    }
    if (activityIndex >= 0) db.activities[activityIndex] = normalizeActivity({ ...db.activities[activityIndex], ...activityData })
    else db.activities.unshift(normalizeActivity({ ...activityData, id: createId('activity'), createdAt: new Date().toISOString() }))
    syncLeadNextAction(db, previousLead); syncLeadNextAction(db, next.leadId); writeDatabase(db); return clone(next)
  }

  async deleteCalendarEvent(eventId: string) {
    const db = readDatabase(); const event = db.events.find((item) => item.id === eventId)
    if (!event) throw new Error('Compromisso não encontrado.')
    db.events = db.events.filter((item) => item.id !== eventId)
    db.activities = db.activities.filter((activity) => !(activity.sourceType === 'calendar' && activity.sourceId === eventId))
    syncLeadNextAction(db, event.leadId); writeDatabase(db)
  }


  async listPlaybooks(workspaceId: string) { return clone(readDatabase().playbooks.filter((playbook) => playbook.workspaceId === workspaceId).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))) }

  async createPlaybook(input: NewPlaybookInput) {
    if (!input.title.trim()) throw new Error('Informe o título do playbook.')
    if (!input.content.trim()) throw new Error('Informe o conteúdo do playbook.')
    const db = readDatabase(); const now = new Date().toISOString()
    const playbook: Playbook = { ...input, id: createId('playbook'), title: input.title.trim(), content: input.content.trim(), createdAt: now, updatedAt: now }
    db.playbooks.unshift(playbook); writeDatabase(db); return clone(playbook)
  }

  async updatePlaybook(playbookId: string, input: UpdatePlaybookInput) {
    const db = readDatabase(); const index = db.playbooks.findIndex((playbook) => playbook.id === playbookId)
    if (index < 0) throw new Error('Playbook não encontrado.')
    const next: Playbook = { ...db.playbooks[index], ...input, ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.content !== undefined ? { content: input.content.trim() } : {}), updatedAt: new Date().toISOString() }
    if (!next.title || !next.content) throw new Error('Título e conteúdo são obrigatórios.')
    db.playbooks[index] = next; writeDatabase(db); return clone(next)
  }

  async deletePlaybook(playbookId: string) {
    const db = readDatabase(); const before = db.playbooks.length; db.playbooks = db.playbooks.filter((playbook) => playbook.id !== playbookId)
    if (before === db.playbooks.length) throw new Error('Playbook não encontrado.')
    writeDatabase(db)
  }


  async listProducts(workspaceId: string) { return clone(readDatabase().products.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) }

  async createProduct(input: NewProductInput) {
    if (!input.name.trim()) throw new Error('Informe o nome do produto ou serviço.')
    const db = readDatabase(); const now = new Date().toISOString()
    const product: ProductRecord = { ...input, id: createId('product'), name: input.name.trim(), sku: input.sku.trim(), unitPrice: Math.max(0, finiteNumber(input.unitPrice, 0)), unitCost: Math.max(0, finiteNumber(input.unitCost ?? 0, 0)), kind: input.kind ?? 'service', commercialType: input.commercialType, unitLabel: input.unitLabel?.trim() || 'unidade', defaultDiscountPercent: Math.max(0, Math.min(100, finiteNumber(input.defaultDiscountPercent ?? 0, 0))), maxDiscountPercent: Math.max(0, Math.min(100, finiteNumber(input.maxDiscountPercent ?? 20, 20))), minMarginPercent: Math.max(0, Math.min(100, finiteNumber(input.minMarginPercent ?? 0, 0))), valueProposition: input.valueProposition?.trim() ?? '', targetCustomer: input.targetCustomer?.trim() ?? '', salesNotes: input.salesNotes?.trim() ?? '', pricingMode: input.pricingMode ?? 'fixed', lifecycleStatus: input.lifecycleStatus ?? (input.active ? 'active' : 'draft'), salesProblems: input.salesProblems ?? [], salesBenefits: input.salesBenefits ?? [], discoveryQuestions: input.discoveryQuestions ?? [], objectionNotes: input.objectionNotes ?? [], salesProofs: input.salesProofs ?? [], competitors: input.competitors ?? [], bundleItems: input.bundleItems ?? [], taxRate: Math.max(0, finiteNumber(input.taxRate, 0)), createdAt: now, updatedAt: now }
    db.products.unshift(product); writeDatabase(db); return clone(product)
  }

  async updateProduct(productId: string, input: UpdateProductInput) {
    const db = readDatabase(); const index = db.products.findIndex((item) => item.id === productId)
    if (index < 0) throw new Error('Produto não encontrado.')
    const current = db.products[index]
    const next: ProductRecord = { ...current, ...input, name: input.name?.trim() || current.name, sku: input.sku !== undefined ? input.sku.trim() : current.sku, unitPrice: input.unitPrice !== undefined ? Math.max(0, finiteNumber(input.unitPrice, current.unitPrice)) : current.unitPrice, unitCost: input.unitCost !== undefined ? Math.max(0, finiteNumber(input.unitCost, current.unitCost ?? 0)) : (current.unitCost ?? 0), kind: input.kind ?? current.kind ?? 'service', commercialType: input.commercialType ?? current.commercialType, unitLabel: input.unitLabel !== undefined ? (input.unitLabel.trim() || 'unidade') : (current.unitLabel ?? 'unidade'), defaultDiscountPercent: input.defaultDiscountPercent !== undefined ? Math.max(0, Math.min(100, finiteNumber(input.defaultDiscountPercent, current.defaultDiscountPercent ?? 0))) : (current.defaultDiscountPercent ?? 0), maxDiscountPercent: input.maxDiscountPercent !== undefined ? Math.max(0, Math.min(100, finiteNumber(input.maxDiscountPercent, current.maxDiscountPercent ?? 20))) : (current.maxDiscountPercent ?? 20), minMarginPercent: input.minMarginPercent !== undefined ? Math.max(0, Math.min(100, finiteNumber(input.minMarginPercent, current.minMarginPercent ?? 0))) : (current.minMarginPercent ?? 0), valueProposition: input.valueProposition !== undefined ? input.valueProposition.trim() : (current.valueProposition ?? ''), targetCustomer: input.targetCustomer !== undefined ? input.targetCustomer.trim() : (current.targetCustomer ?? ''), salesNotes: input.salesNotes !== undefined ? input.salesNotes.trim() : (current.salesNotes ?? ''), pricingMode: input.pricingMode ?? current.pricingMode ?? 'fixed', lifecycleStatus: input.lifecycleStatus ?? current.lifecycleStatus ?? (current.active ? 'active' : 'archived'), salesProblems: input.salesProblems ?? current.salesProblems ?? [], salesBenefits: input.salesBenefits ?? current.salesBenefits ?? [], discoveryQuestions: input.discoveryQuestions ?? current.discoveryQuestions ?? [], objectionNotes: input.objectionNotes ?? current.objectionNotes ?? [], salesProofs: input.salesProofs ?? current.salesProofs ?? [], competitors: input.competitors ?? current.competitors ?? [], bundleItems: input.bundleItems ?? current.bundleItems ?? [], taxRate: input.taxRate !== undefined ? Math.max(0, finiteNumber(input.taxRate, current.taxRate)) : current.taxRate, updatedAt: new Date().toISOString() }
    db.products[index] = next; writeDatabase(db); return clone(next)
  }

  async reconcileProposalItems(workspaceId: string, legacyName: string, productId: string) {
    const db = readDatabase()
    const product = db.products.find((item) => item.id === productId && item.workspaceId === workspaceId)
    if (!product) throw new Error('Produto do catálogo não encontrado.')
    const target = legacyName.trim().toLocaleLowerCase('pt-BR')
    let updated = 0
    for (const proposal of db.proposals) {
      if (proposal.workspaceId !== workspaceId) continue
      proposal.items = proposal.items.map((item) => {
        if (item.productId || item.name.trim().toLocaleLowerCase('pt-BR') !== target) return item
        updated += 1
        return {
          ...item,
          productId: product.id,
          pricingSource: 'catalog',
          catalogUnitPrice: product.unitPrice,
          unitCostSnapshot: product.unitCost ?? 0,
          catalogDiscountPercent: product.defaultDiscountPercent ?? 0,
          pricingOverridden: Math.abs(item.unitPrice - product.unitPrice) > 0.005 || Math.abs(item.discountPercent - (product.defaultDiscountPercent ?? 0)) > 0.005,
        }
      })
    }
    if (updated) writeDatabase(db)
    return updated
  }

  async deleteProduct(productId: string) {
    const db = readDatabase()
    if (db.proposals.some((proposal) => proposal.items.some((item) => item.productId === productId))) throw new Error('Este produto já foi utilizado em uma proposta e não pode ser excluído. Desative-o.')
    db.products = db.products.filter((item) => item.id !== productId); writeDatabase(db)
  }

  async listProposals(workspaceId: string) { return clone(readDatabase().proposals.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())) }

  async createProposal(input: NewProposalInput) {
    const db = readDatabase()
    const lead = db.leads.find((item) => item.id === input.leadId && item.workspaceId === input.workspaceId)
    if (!lead) throw new Error('Selecione um lead válido para a proposta.')
    const linkedOpportunity = db.opportunities.find((item) => item.id === input.opportunityId || item.id === lead.opportunityId || item.leadId === lead.id)
    if (lead.status === 'won' || linkedOpportunity?.status === 'won' || linkedOpportunity?.closedWonAt) throw new Error('Negócio ganho não aceita novas propostas. Crie um aditivo ou uma nova oportunidade.')
    assertProposalValues(input)
    const requestedNumber = input.proposalNumber?.trim()
    if (requestedNumber && db.proposals.some((item) => item.workspaceId === input.workspaceId && item.proposalNumber.toLocaleLowerCase('pt-BR') === requestedNumber.toLocaleLowerCase('pt-BR'))) throw new Error('Já existe uma proposta com este número neste workspace.')
    const now = new Date().toISOString()
    const groupId = input.proposalGroupId || createId('proposal-group')
    const proposalId = createId('proposal')
    const hasOfficial = db.proposals.some((item) => item.workspaceId === input.workspaceId && item.leadId === input.leadId && item.isOfficial && item.isCurrentVersion && !['rejected', 'expired', 'cancelled'].includes(item.status))
    const proposal = normalizeProposal({
      ...input,
      id: proposalId,
      proposalGroupId: groupId,
      version: input.version ?? 1,
      proposalNumber: requestedNumber || proposalSequence(db, input.workspaceId),
      isOfficial: !hasOfficial || Boolean(input.isOfficial),
      isCurrentVersion: true,
      supersededById: null,
      sentAt: null,
      viewedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      closedWonAt: null,
      createdAt: now,
      updatedAt: now,
    })
    if (proposal.isOfficial) {
      for (const item of db.proposals) if (item.workspaceId === proposal.workspaceId && item.leadId === proposal.leadId && item.isOfficial) item.isOfficial = false
    }
    db.proposals.unshift(proposal)
    if (proposal.isOfficial) {
      lead.value = proposal.totalContractValue
      lead.expectedCloseAt = proposal.expectedCloseAt
      lead.updatedAt = now
      const opportunity = db.opportunities.find((item) => item.id === proposal.opportunityId || item.leadId === proposal.leadId)
      if (opportunity) {
        opportunity.value = proposal.totalContractValue
        opportunity.expectedCloseAt = proposal.expectedCloseAt
        opportunity.forecastCategory = proposal.forecastCategory
        opportunity.probability = proposal.probability
        opportunity.officialProposalId = proposal.id
        opportunity.updatedAt = now
      }
    }
    writeDatabase(db)
    return clone(proposal)
  }

  async updateProposal(proposalId: string, input: UpdateProposalInput) {
    const db = readDatabase()
    const index = db.proposals.findIndex((item) => item.id === proposalId)
    if (index < 0) throw new Error('Proposta não encontrada.')
    const current = db.proposals[index]
    const linkedOpportunity = db.opportunities.find((item) => item.id === current.opportunityId || item.leadId === current.leadId)
    if (current.closedWonAt || linkedOpportunity?.status === 'won' || linkedOpportunity?.closedWonAt) throw new Error('Propostas de negócio ganho são imutáveis. Crie um aditivo ou uma nova oportunidade.')
    if (!current.isCurrentVersion) throw new Error('Edite somente a revisão vigente da proposta.')
    if (current.status !== 'draft') throw new Error('Propostas enviadas ou encerradas são imutáveis. Crie uma nova revisão.')
    if (input.status !== undefined && input.status !== current.status) throw new Error('Altere o status pelos comandos da proposta.')
    const candidate = { ...current, ...input, title: input.title !== undefined ? input.title.trim() : current.title }
    assertProposalValues(candidate)
    const now = new Date().toISOString()
    const next = normalizeProposal({
      ...candidate,
      probability: input.probability !== undefined ? clampNumber(input.probability, 0, 100, current.probability) : current.probability,
      updatedAt: now,
    })
    db.proposals[index] = next
    if (next.isOfficial) {
      const lead = db.leads.find((item) => item.id === next.leadId)
      if (lead) {
        lead.value = next.totalContractValue
        lead.expectedCloseAt = next.expectedCloseAt
        lead.updatedAt = now
      }
      const opportunity = db.opportunities.find((item) => item.id === next.opportunityId || item.leadId === next.leadId)
      if (opportunity) {
        opportunity.value = next.totalContractValue
        opportunity.expectedCloseAt = next.expectedCloseAt
        opportunity.forecastCategory = next.forecastCategory
        opportunity.probability = next.probability
        opportunity.officialProposalId = next.id
        opportunity.updatedAt = now
      }
    }
    writeDatabase(db)
    return clone(next)
  }

  async createProposalRevision(proposalId: string) {
    const db = readDatabase()
    const source = db.proposals.find((item) => item.id === proposalId)
    if (!source) throw new Error('Proposta não encontrada.')
    const linkedOpportunity = db.opportunities.find((item) => item.id === source.opportunityId || item.leadId === source.leadId)
    if (!source.isCurrentVersion) throw new Error('Crie a revisão a partir da versão vigente.')
    if (source.closedWonAt || linkedOpportunity?.status === 'won' || linkedOpportunity?.closedWonAt) throw new Error('Negócio ganho não pode ser revisado. Crie um aditivo ou uma nova oportunidade.')
    const now = new Date().toISOString()
    const wasOfficial = source.isOfficial
    const version = Math.max(...db.proposals.filter((item) => item.proposalGroupId === source.proposalGroupId).map((item) => item.version), 0) + 1
    const revisionId = createId('proposal')
    for (const item of db.proposals.filter((item) => item.proposalGroupId === source.proposalGroupId && item.isCurrentVersion)) {
      item.isCurrentVersion = false
      item.isOfficial = false
      item.supersededById = revisionId
      item.updatedAt = now
    }
    const revision = normalizeProposal({
      ...clone(source),
      id: revisionId,
      version,
      status: 'draft',
      forecastCategory: source.forecastCategory === 'closed' ? 'best_case' : source.forecastCategory,
      probability: source.probability === 100 ? 60 : source.probability,
      isOfficial: wasOfficial,
      isCurrentVersion: true,
      supersededById: null,
      sentAt: null,
      viewedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      closedWonAt: null,
      items: source.items.map((item) => ({ ...item, id: createId('proposal-item') })),
      createdAt: now,
      updatedAt: now,
    })
    db.proposals.unshift(revision)
    if (wasOfficial) {
      revision.isOfficial = true
      const lead = db.leads.find((item) => item.id === revision.leadId)
      if (lead) {
        lead.value = revision.totalContractValue
        lead.expectedCloseAt = revision.expectedCloseAt
        lead.updatedAt = now
      }
      const opportunity = db.opportunities.find((item) => item.id === revision.opportunityId || item.leadId === revision.leadId)
      if (opportunity) {
        opportunity.officialProposalId = revision.id
        opportunity.value = revision.totalContractValue
        opportunity.expectedCloseAt = revision.expectedCloseAt
        opportunity.forecastCategory = revision.forecastCategory
        opportunity.probability = revision.probability
        opportunity.updatedAt = now
      }
    }
    writeDatabase(db)
    return clone(revision)
  }

  async setOfficialProposal(proposalId: string) {
    const db = readDatabase()
    const proposal = db.proposals.find((item) => item.id === proposalId)
    if (!proposal) throw new Error('Proposta não encontrada.')
    if (!proposal.isCurrentVersion) throw new Error('Somente a revisão vigente pode ser oficial.')
    if (['rejected', 'expired', 'cancelled'].includes(proposal.status)) throw new Error('Uma proposta encerrada não pode ser oficial.')
    const linkedOpportunity = db.opportunities.find((item) => item.id === proposal.opportunityId || item.leadId === proposal.leadId)
    if (linkedOpportunity?.status === 'won' || linkedOpportunity?.closedWonAt) throw new Error('A proposta oficial de um negócio ganho não pode ser substituída.')
    const now = new Date().toISOString()
    for (const item of db.proposals) {
      if (item.workspaceId === proposal.workspaceId && item.leadId === proposal.leadId && item.isOfficial) {
        item.isOfficial = false
        item.updatedAt = now
      }
    }
    proposal.isOfficial = true
    proposal.updatedAt = now
    const lead = db.leads.find((item) => item.id === proposal.leadId)
    if (lead) {
      lead.value = proposal.totalContractValue
      lead.expectedCloseAt = proposal.expectedCloseAt
      lead.updatedAt = now
    }
    const opportunity = linkedOpportunity
    if (opportunity) {
      opportunity.officialProposalId = proposal.id
      opportunity.value = proposal.totalContractValue
      opportunity.expectedCloseAt = proposal.expectedCloseAt
      opportunity.forecastCategory = proposal.forecastCategory
      opportunity.probability = proposal.probability
      opportunity.updatedAt = now
    }
    writeDatabase(db)
    return clone(proposal)
  }

  async updateProposalStatus(proposalId: string, status: ProposalStatus) {
    const db = readDatabase()
    const proposal = db.proposals.find((item) => item.id === proposalId)
    if (!proposal) throw new Error('Proposta não encontrada.')
    if (!proposal.isCurrentVersion) throw new Error('Altere apenas a revisão vigente.')
    const linkedOpportunity = db.opportunities.find((item) => item.id === proposal.opportunityId || item.leadId === proposal.leadId)
    if (proposal.closedWonAt || linkedOpportunity?.status === 'won' || linkedOpportunity?.closedWonAt) throw new Error('O status de uma proposta vinculada a negócio ganho não pode ser alterado.')
    if (proposal.status === status) return clone(proposal)
    const wasOfficial = proposal.isOfficial
    const transitions: Record<ProposalStatus, ProposalStatus[]> = {
      draft: ['sent', 'cancelled'],
      sent: ['viewed', 'accepted', 'rejected', 'expired', 'cancelled'],
      viewed: ['accepted', 'rejected', 'expired', 'cancelled'],
      accepted: ['cancelled'],
      rejected: [],
      expired: [],
      cancelled: [],
    }
    if (!transitions[proposal.status].includes(status)) throw new Error(`Transição inválida: ${proposal.status} → ${status}.`)
    const now = new Date().toISOString()
    proposal.status = status
    proposal.updatedAt = now
    if (status === 'sent') proposal.sentAt = proposal.sentAt ?? now
    if (status === 'viewed') { proposal.sentAt = proposal.sentAt ?? now; proposal.viewedAt = now }
    if (status === 'accepted') {
      for (const item of db.proposals) if (item.workspaceId === proposal.workspaceId && item.leadId === proposal.leadId && item.isOfficial) item.isOfficial = false
      proposal.isOfficial = true
      proposal.acceptedAt = now
      proposal.forecastCategory = 'commit'
      proposal.probability = 100
    }
    if (status === 'rejected') { proposal.rejectedAt = now; proposal.forecastCategory = 'omitted'; proposal.probability = 0; proposal.isOfficial = false }
    if (status === 'cancelled' || status === 'expired') { proposal.forecastCategory = 'omitted'; proposal.probability = 0; proposal.isOfficial = false }
    const lead = db.leads.find((item) => item.id === proposal.leadId)
    const opportunity = linkedOpportunity
    if (status === 'sent' && lead) {
      const proposalStage = db.stages.find((stage) => stage.workspaceId === proposal.workspaceId && /proposta/i.test(stage.name))
      if (proposalStage && lead.status === 'active') {
        lead.stageId = proposalStage.id
        lead.status = stageStatus(proposalStage)
        lead.updatedAt = now
        if (opportunity) {
          opportunity.stageId = proposalStage.id
          opportunity.status = stageStatus(proposalStage)
          opportunity.probability = proposalStage.probability
          opportunity.updatedAt = now
        }
      }
      db.activities.unshift(normalizeActivity({ id: createId('activity'), workspaceId: proposal.workspaceId, leadId: lead.id, type: 'note', title: `Proposta enviada — ${proposal.proposalNumber}`, description: proposal.title, dueAt: null, completedAt: now, assignedTo: proposal.ownerId, sourceType: 'system', sourceId: proposal.id, createdAt: now, updatedAt: now }))
    }
    if (status === 'accepted' && lead) {
      lead.value = proposal.totalContractValue
      lead.expectedCloseAt = proposal.expectedCloseAt
      lead.updatedAt = now
      if (opportunity) {
        opportunity.officialProposalId = proposal.id
        opportunity.value = proposal.totalContractValue
        opportunity.expectedCloseAt = proposal.expectedCloseAt
        opportunity.forecastCategory = 'commit'
        opportunity.probability = 100
        opportunity.updatedAt = now
      }
      db.activities.unshift(normalizeActivity({ id: createId('activity'), workspaceId: proposal.workspaceId, leadId: lead.id, type: 'note', title: `Aceite registrado — ${proposal.proposalNumber}`, description: `TCV: ${proposal.totalContractValue.toFixed(2)} · MRR: ${proposal.recurringMonthlyTotal.toFixed(2)}. Aceite registrado para booking comercial; reconhecimento de receita segue por competência.`, dueAt: null, completedAt: now, assignedTo: proposal.ownerId, sourceType: 'system', sourceId: proposal.id, createdAt: now, updatedAt: now }))
    }
    if (wasOfficial && ['rejected', 'expired', 'cancelled'].includes(status)) syncCommercialFromOfficialProposal(db, proposal.leadId, now)
    writeDatabase(db)
    return clone(proposal)
  }

  async closeOpportunityFromProposal(proposalId: string) {
    const db = readDatabase()
    const proposal = db.proposals.find((item) => item.id === proposalId)
    if (!proposal) throw new Error('Proposta não encontrada.')
    if (!proposal.isCurrentVersion || !proposal.isOfficial || proposal.status !== 'accepted') throw new Error('Aceite e oficialize a revisão vigente antes de fechar a oportunidade.')
    if (proposal.closedWonAt) return clone(proposal)
    const now = new Date().toISOString()
    const won = db.stages.find((stage) => stage.workspaceId === proposal.workspaceId && stage.isWon)
    if (!won) throw new Error('Configure uma etapa marcada como ganha antes de fechar oportunidades.')
    const lead = db.leads.find((item) => item.id === proposal.leadId)
    if (lead) {
      lead.stageId = won.id
      lead.status = 'won'
      lead.value = proposal.totalContractValue
      lead.updatedAt = now
    }
    const opportunity = db.opportunities.find((item) => item.id === proposal.opportunityId || item.leadId === proposal.leadId)
    if (opportunity) {
      opportunity.stageId = won.id
      opportunity.status = 'won'
      opportunity.value = proposal.totalContractValue
      opportunity.forecastCategory = 'closed'
      opportunity.probability = 100
      opportunity.officialProposalId = proposal.id
      opportunity.closedWonAt = now
      opportunity.updatedAt = now
    }
    proposal.closedWonAt = now
    proposal.forecastCategory = 'closed'
    proposal.probability = 100
    proposal.updatedAt = now
    db.activities.unshift(normalizeActivity({ id: createId('activity'), workspaceId: proposal.workspaceId, leadId: proposal.leadId, type: 'note', title: `Oportunidade ganha — ${proposal.proposalNumber}`, description: `Contrato confirmado em ${proposal.totalContractValue.toFixed(2)}. Receita permanece pendente de reconhecimento.`, dueAt: null, completedAt: now, assignedTo: proposal.ownerId, sourceType: 'system', sourceId: proposal.id, createdAt: now, updatedAt: now }))
    const postSaleDue = proposal.postSaleStartAt ? new Date(`${proposal.postSaleStartAt}T12:00:00`).toISOString() : now
    db.activities.unshift(normalizeActivity({ id: createId('activity'), workspaceId: proposal.workspaceId, leadId: proposal.leadId, type: 'followup', title: `Iniciar pós-venda — ${proposal.postSaleCadenceName || 'Onboarding padrão'}`, description: 'Cadência criada após o fechamento. Ajuste a data ou o responsável quando necessário.', dueAt: postSaleDue, completedAt: null, assignedTo: proposal.ownerId, sourceType: 'system', sourceId: proposal.id, createdAt: now, updatedAt: now }))
    writeDatabase(db)
    return clone(proposal)
  }

  async deleteProposal(proposalId: string) {
    const db = readDatabase()
    const proposal = db.proposals.find((item) => item.id === proposalId)
    if (!proposal) return
    const linkedOpportunity = db.opportunities.find((item) => item.id === proposal.opportunityId || item.leadId === proposal.leadId)
    if (proposal.isOfficial) throw new Error('A proposta oficial não pode ser excluída. Defina outra proposta como oficial ou cancele-a primeiro.')
    if (proposal.status === 'accepted' || proposal.closedWonAt || linkedOpportunity?.status === 'won' || linkedOpportunity?.closedWonAt) throw new Error('Proposta aceita ou vinculada a negócio ganho não pode ser excluída. Preserve a auditoria e crie um aditivo quando necessário.')
    db.proposals = db.proposals.filter((item) => item.id !== proposalId)
    writeDatabase(db)
  }

  async listBuyerRooms(workspaceId: string) { return clone(readDatabase().buyerRooms.filter((item) => item.workspaceId === workspaceId).map(normalizeBuyerRoom).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())) }

  async createBuyerRoom(input: NewBuyerRoomInput) {
    const db = readDatabase(); const now = new Date().toISOString()
    const proposal = db.proposals.find((item) => item.id === input.proposalId && item.workspaceId === input.workspaceId)
    if (!proposal) throw new Error('A proposta da Buyer Room não pertence a este workspace.')
    if (db.buyerRooms.some((item) => item.proposalId === input.proposalId && item.status !== 'archived')) throw new Error('Esta proposta já possui uma Buyer Room ativa.')
    const room = normalizeBuyerRoom({ ...input, id: createId('buyer-room'), shareToken: input.shareToken || createBuyerRoomShareToken(), viewCount: 0, lastOpenedAt: null, activity: input.activity ?? [], createdAt: now, updatedAt: now })
    db.buyerRooms.unshift(room); writeDatabase(db); return clone(room)
  }

  async updateBuyerRoom(roomId: string, input: UpdateBuyerRoomInput) {
    const db = readDatabase(); const index = db.buyerRooms.findIndex((item) => item.id === roomId); if (index < 0) throw new Error('Buyer Room não encontrada.')
    const current = db.buyerRooms[index]
    const next = normalizeBuyerRoom({ ...current, ...input, updatedAt: new Date().toISOString() })
    if (input.shareEnabled === true && !current.shareEnabled) next.activity = appendBuyerRoomActivity(next, { type: 'shared', actorName: 'Equipe RealTalent', description: 'Compartilhamento público ativado.', metadata: {} }).activity
    db.buyerRooms[index] = next; writeDatabase(db); return clone(next)
  }

  async rotateBuyerRoomToken(roomId: string) {
    const db = readDatabase(); const index = db.buyerRooms.findIndex((item) => item.id === roomId); if (index < 0) throw new Error('Buyer Room não encontrada.')
    let next = normalizeBuyerRoom({ ...db.buyerRooms[index], shareToken: createBuyerRoomShareToken(), updatedAt: new Date().toISOString() })
    next = appendBuyerRoomActivity(next, { type: 'token_rotated', actorName: 'Equipe RealTalent', description: 'Link público regenerado.', metadata: {} })
    db.buyerRooms[index] = next; writeDatabase(db); return clone(next)
  }

  async recordBuyerRoomActivity(roomId: string, event: Omit<BuyerRoomActivity, 'id' | 'occurredAt'> & { occurredAt?: string }) {
    const db = readDatabase(); const index = db.buyerRooms.findIndex((item) => item.id === roomId); if (index < 0) throw new Error('Buyer Room não encontrada.')
    const next = appendBuyerRoomActivity(normalizeBuyerRoom(db.buyerRooms[index]), event); db.buyerRooms[index] = next; writeDatabase(db); return clone(next)
  }

  async deleteBuyerRoom(roomId: string) { const db = readDatabase(); db.buyerRooms = db.buyerRooms.filter((item) => item.id !== roomId); writeDatabase(db) }

  async listRevenueEntries(workspaceId: string) { return clone(readDatabase().revenueEntries.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.recognizedAt).getTime() - new Date(a.recognizedAt).getTime())) }

  async createRevenueEntry(input: NewRevenueEntryInput) {
    assertDateTime(input.recognizedAt, 'Data de reconhecimento da receita')
    const competenceDate = input.competenceDate || input.recognizedAt.slice(0, 10)
    assertDateOnly(competenceDate, 'Competência da receita')
    assertDateOnly(input.servicePeriodStart, 'Início do período de serviço')
    assertDateOnly(input.servicePeriodEnd, 'Fim do período de serviço')
    if (input.servicePeriodStart && input.servicePeriodEnd && input.servicePeriodEnd < input.servicePeriodStart) throw new Error('O fim do período de serviço deve ser igual ou posterior ao início.')
    if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error('Valor da receita inválido.')
    if (!Number.isFinite(input.recurringMonthlyAmount) || input.recurringMonthlyAmount < 0) throw new Error('Valor recorrente mensal inválido.')
    const db = readDatabase()
    const lead = input.leadId ? db.leads.find((item) => item.id === input.leadId && item.workspaceId === input.workspaceId) : null
    const proposal = input.proposalId ? db.proposals.find((item) => item.id === input.proposalId && item.workspaceId === input.workspaceId) : null
    const opportunity = input.opportunityId ? db.opportunities.find((item) => item.id === input.opportunityId && item.workspaceId === input.workspaceId) : null
    if (input.leadId && !lead) throw new Error('Lead inválido para este lançamento de receita.')
    if (input.proposalId && !proposal) throw new Error('Proposta inválida para este lançamento de receita.')
    if (input.opportunityId && !opportunity) throw new Error('Oportunidade inválida para este lançamento de receita.')
    if (proposal?.leadId && input.leadId && proposal.leadId !== input.leadId) throw new Error('A proposta e o lead da receita não pertencem ao mesmo negócio.')
    if (opportunity?.leadId && input.leadId && opportunity.leadId !== input.leadId) throw new Error('A oportunidade e o lead da receita não pertencem ao mesmo negócio.')
    const now = new Date().toISOString()
    const entry: RevenueEntry = {
      ...input,
      id: createId('revenue'),
      amount: Math.max(0, finiteNumber(input.amount, 0)),
      recurringMonthlyAmount: Math.max(0, finiteNumber(input.recurringMonthlyAmount, 0)),
      competenceDate,
      servicePeriodStart: input.servicePeriodStart ?? null,
      servicePeriodEnd: input.servicePeriodEnd ?? null,
      adjustmentReason: input.adjustmentReason?.trim() ?? '',
      description: input.description.trim(),
      source: input.source ?? 'manual',
      scheduleKey: input.scheduleKey ?? null,
      installmentIndex: input.installmentIndex ?? null,
      installmentCount: input.installmentCount ?? null,
      createdAt: now,
      updatedAt: now,
    }
    db.revenueEntries.unshift(entry)
    writeDatabase(db)
    return clone(entry)
  }

  async updateRevenueEntryStatus(entryId: string, status: RevenueEntry['status']) {
    const db = readDatabase(); const entry = db.revenueEntries.find((item) => item.id === entryId)
    if (!entry) throw new Error('Lançamento de receita não encontrado.')
    entry.status = status; entry.updatedAt = new Date().toISOString(); writeDatabase(db); return clone(entry)
  }

  async listGoals(workspaceId: string) { return clone(readDatabase().goals.filter((goal) => goal.workspaceId === workspaceId)) }

  async createGoal(input: NewGoalInput) {
    if (!Number.isFinite(input.targetValue) || input.targetValue <= 0) throw new Error('A meta deve ser um número maior que zero.')
    assertDateOnly(input.periodStart, 'Início da meta')
    assertDateOnly(input.periodEnd, 'Fim da meta')
    if (input.periodEnd < input.periodStart) throw new Error('O fim do período deve ser igual ou posterior ao início.')
    const db = readDatabase(); const now = new Date().toISOString()
    const duplicate = db.goals.some((goal) => goal.workspaceId === input.workspaceId && (goal.scope ?? (goal.userId ? 'user' : 'workspace')) === (input.scope ?? (input.teamId ? 'team' : input.userId ? 'user' : 'workspace')) && (goal.teamId ?? null) === (input.teamId ?? null) && goal.userId === input.userId && goal.metric === input.metric && goal.periodStart === input.periodStart && goal.periodEnd === input.periodEnd)
    if (duplicate) throw new Error('Já existe uma meta igual para este período.')
    const goal: Goal = { ...input, id: createId('goal'), createdAt: now, updatedAt: now }
    db.goals.unshift(goal); writeDatabase(db); return clone(goal)
  }

  async updateGoal(goalId: string, input: UpdateGoalInput) {
    const db = readDatabase(); const index = db.goals.findIndex((goal) => goal.id === goalId)
    if (index < 0) throw new Error('Meta não encontrada.')
    const next: Goal = { ...db.goals[index], ...input, updatedAt: new Date().toISOString() }
    if (!Number.isFinite(next.targetValue) || next.targetValue <= 0) throw new Error('A meta deve ser um número maior que zero.')
    assertDateOnly(next.periodStart, 'Início da meta')
    assertDateOnly(next.periodEnd, 'Fim da meta')
    if (next.periodEnd < next.periodStart) throw new Error('O fim do período deve ser igual ou posterior ao início.')
    db.goals[index] = next; writeDatabase(db); return clone(next)
  }

  async deleteGoal(goalId: string) {
    const db = readDatabase(); const before = db.goals.length; db.goals = db.goals.filter((goal) => goal.id !== goalId)
    if (before === db.goals.length) throw new Error('Meta não encontrada.')
    writeDatabase(db)
  }

  async listAutomationRules(workspaceId: string) { return clone(readDatabase().automationRules.filter((rule) => rule.workspaceId === workspaceId)) }

  async createAutomationRule(input: NewAutomationRuleInput) {
    if (!input.name.trim()) throw new Error('Informe o nome da automação.')
    if (!input.actions.length) throw new Error('Adicione pelo menos uma ação.')
    const db = readDatabase(); const now = new Date().toISOString()
    assertAutomationActions(db, input.workspaceId, input.actions)
    const rule: AutomationRule = { ...input, id: createId('rule'), name: input.name.trim(), createdAt: now, updatedAt: now }
    db.automationRules.unshift(rule); writeDatabase(db); return clone(rule)
  }

  async updateAutomationRule(ruleId: string, input: UpdateAutomationRuleInput) {
    const db = readDatabase(); const index = db.automationRules.findIndex((rule) => rule.id === ruleId)
    if (index < 0) throw new Error('Automação não encontrada.')
    const next: AutomationRule = { ...db.automationRules[index], ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}), updatedAt: new Date().toISOString() }
    if (!next.name) throw new Error('Informe o nome da automação.')
    if (!next.actions.length) throw new Error('Adicione pelo menos uma ação.')
    assertAutomationActions(db, next.workspaceId, next.actions)
    db.automationRules[index] = next; writeDatabase(db); return clone(next)
  }

  async deleteAutomationRule(ruleId: string) {
    const db = readDatabase(); db.automationRules = db.automationRules.filter((rule) => rule.id !== ruleId)
    db.automationRuns = db.automationRuns.map((run) => run.ruleId === ruleId ? { ...run, ruleId: null } : run); writeDatabase(db)
  }

  async listAutomationRuns(workspaceId: string) { return clone(readDatabase().automationRuns.filter((run) => run.workspaceId === workspaceId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 300)) }

  async startAutomationRun(input: NewAutomationRunInput) {
    const db = readDatabase()
    if (db.automationRuns.some((run) => run.workspaceId === input.workspaceId && run.eventKey === input.eventKey)) return null
    const run: AutomationRun = { id: createId('run'), workspaceId: input.workspaceId, ruleId: input.ruleId, eventKey: input.eventKey, status: 'running', input: clone(input.input), output: {}, errorMessage: null, startedAt: new Date().toISOString(), finishedAt: null }
    db.automationRuns.unshift(run); writeDatabase(db); return clone(run)
  }

  async finishAutomationRun(runId: string, status: AutomationRunStatus, output: AutomationRunOutput, errorMessage: string | null = null) {
    const db = readDatabase(); const index = db.automationRuns.findIndex((run) => run.id === runId)
    if (index < 0) throw new Error('Execução não encontrada.')
    db.automationRuns[index] = { ...db.automationRuns[index], status, output: clone(output), errorMessage, finishedAt: new Date().toISOString() }
    writeDatabase(db); return clone(db.automationRuns[index])
  }

  async getDashboardStats(workspaceId: string): Promise<DashboardStats> {
    const db = readDatabase(); const leads = db.leads.filter((lead) => lead.workspaceId === workspaceId); const activities = db.activities.filter((activity) => activity.workspaceId === workspaceId)
    const today = todayKey(new Date())
    return {
      activeLeads: leads.filter((lead) => lead.status === 'active').length,
      pipelineValue: leads.filter((lead) => lead.status === 'active').reduce((sum, lead) => sum + lead.value, 0),
      dueToday: activities.filter((activity) => activity.dueAt && !activity.completedAt && todayKey(new Date(activity.dueAt)) === today).length,
      hotLeads: leads.filter((lead) => lead.status === 'active' && lead.temperature === 'hot').length,
      wonThisMonth: leads.filter((lead) => {
        if (lead.status !== 'won') return false
        const updatedAt = new Date(lead.updatedAt); const now = new Date()
        return updatedAt.getMonth() === now.getMonth() && updatedAt.getFullYear() === now.getFullYear()
      }).length,
    }
  }

  async importLeads(workspaceId: string, leads: Lead[]) {
    const db = readDatabase()
    const stages = db.stages.filter((stage) => stage.workspaceId === workspaceId)
    const stageById = new Map(stages.map((stage) => [stage.id, stage]))
    const fallbackStage = stages.sort((a, b) => a.order - b.order)[0]
    if (!fallbackStage) throw new Error('O workspace não possui etapas.')
    const existing = new Set(db.leads.filter((lead) => lead.workspaceId === workspaceId).map((lead) => lead.id))
    let count = 0
    for (const lead of leads) {
      const requestedId = lead.id?.trim() || createId('lead')
      let id = requestedId
      while (existing.has(id)) id = createId('lead')
      existing.add(id)
      const stage = stageById.get(lead.stageId) ?? fallbackStage
      assertDateTime(lead.nextActionAt, 'Data da próxima ação importada')
      assertDateTime(lead.lastContactAt, 'Data do último contato importado')
      assertDateTime(lead.expectedCloseAt, 'Data prevista de fechamento importada')
      assertDateTime(lead.capturedAt, 'Data de captura importada')
      db.leads.push({
        ...lead,
        id,
        workspaceId,
        stageId: stage.id,
        status: lead.status === 'archived' ? 'archived' : stageStatus(stage),
        name: lead.name.trim() || 'Lead sem nome',
        email: lead.email.trim().toLocaleLowerCase('pt-BR'),
        value: Math.max(0, finiteNumber(lead.value, 0)),
        influenceLevel: clampNumber(lead.influenceLevel, 0, 100, 0),
        tags: normalizedTags(lead.tags ?? []),
        updatedAt: new Date().toISOString(),
      })
      count += 1
    }
    synchronizeStructureInDatabase(db, workspaceId)
    writeDatabase(db)
    return count
  }
}
