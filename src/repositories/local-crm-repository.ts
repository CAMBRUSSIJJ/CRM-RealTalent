import { DEMO_ACTIVITIES, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_RUNS, DEMO_CALLS, DEMO_COMPANIES, DEMO_CONTACTS, DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PLAYBOOKS, DEMO_PRODUCTS, DEMO_PROPOSALS, DEMO_REVENUE_ENTRIES, DEMO_SOCIAL_PROFILES, DEMO_WORKSPACE, DEFAULT_STAGES } from '../domain/defaults'
import type {
  ActivityItem, AuditLog, AutomationRule, AutomationRun, AutomationRunOutput, AutomationRunStatus, CalendarEvent, CallRecord, CommercialStructureSyncResult, CompanyRecord, ContactRecord, DashboardStats, Goal, Lead, OpportunityRecord, PipelineStage, Playbook, ProductRecord, ProposalLineItem, ProposalRecord, ProposalStatus, RevenueEntry, RepositoryHealth, SocialProfile, Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceSnapshot,
} from '../domain/types'
import { createId } from '../lib/id'
import { safeStorage } from '../lib/storage'
import { BACKUP_SCHEMA_VERSION } from '../lib/app-version'
import { deleteLocalRecording, readLocalRecording, saveLocalRecording } from '../lib/local-recordings'
import { completeLocalSetup, LOCAL_ACTIVE_WORKSPACE_KEY, markLocalSetupPending, writeLocalProfile, type LocalExperienceInput } from '../lib/local-experience'
import { mergeLeadRecords } from '../services/lead-intelligence'
import { deriveCommercialStructure } from '../services/commercial-structure'
import { buildCommercialCallPlan, resolveCommercialStage, shouldClosePendingActivity } from '../services/commercial-action-engine'
import type {
  CommercialActionResult, CommercialActivityResult, CrmRepository, NewActivityInput, NewAutomationRuleInput, NewAutomationRunInput, NewCalendarEventInput, NewCallInput, NewGoalInput, NewLeadInput, NewPlaybookInput, NewProductInput, NewProposalInput, NewRevenueEntryInput, NewStageInput, RegisterActivityOutcomeInput, RegisterCallOutcomeInput,
  UpdateActivityInput, UpdateAutomationRuleInput, UpdateCalendarEventInput, UpdateGoalInput, UpdateLeadInput, UpdatePlaybookInput, UpdateProductInput, UpdateProposalInput, UpdateStageInput,
} from './crm-repository'

export const LOCAL_DATABASE_STORAGE_KEY = 'realtalent-crm-v100-local'
const STORAGE_KEY = LOCAL_DATABASE_STORAGE_KEY
const CORRUPT_BACKUP_PREFIX = 'realtalent-crm-v100-corrupt-backup:'
const recordingUrlCache = new Map<string, string>()

interface LocalDatabase {
  workspaces: Workspace[]
  stages: PipelineStage[]
  leads: Lead[]
  activities: ActivityItem[]
  calls: CallRecord[]
  events: CalendarEvent[]
  playbooks: Playbook[]
  goals: Goal[]
  automationRules: AutomationRule[]
  automationRuns: AutomationRun[]
  companies: CompanyRecord[]
  contacts: ContactRecord[]
  opportunities: OpportunityRecord[]
  socialProfiles: SocialProfile[]
  products: ProductRecord[]
  proposals: ProposalRecord[]
  revenueEntries: RevenueEntry[]
  members: WorkspaceMember[]
  invites: WorkspaceInvite[]
  auditLogs: AuditLog[]
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const DEMO_REFERENCE_NOW = new Date('2026-07-16T15:00:00.000Z')

const shiftIso = (value: string | null, offsetMs: number) => {
  if (!value) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Date(date.getTime() + offsetMs).toISOString()
}

const rebaseDemoDates = (db: LocalDatabase, reference = new Date()): LocalDatabase => {
  const offsetMs = reference.getTime() - DEMO_REFERENCE_NOW.getTime()
  db.workspaces.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)! })
  db.leads.forEach((item) => {
    item.nextActionAt = shiftIso(item.nextActionAt, offsetMs)
    item.createdAt = shiftIso(item.createdAt, offsetMs)!
    item.updatedAt = shiftIso(item.updatedAt, offsetMs)!
  })
  db.activities.forEach((item) => {
    item.dueAt = shiftIso(item.dueAt, offsetMs)
    item.completedAt = shiftIso(item.completedAt, offsetMs)
    item.createdAt = shiftIso(item.createdAt, offsetMs)!
    item.updatedAt = shiftIso(item.updatedAt, offsetMs)!
  })
  db.calls.forEach((item) => {
    item.startedAt = shiftIso(item.startedAt, offsetMs)!
    item.endedAt = shiftIso(item.endedAt, offsetMs)
    item.createdAt = shiftIso(item.createdAt, offsetMs)!
  })
  db.events.forEach((item) => {
    item.startsAt = shiftIso(item.startsAt, offsetMs)!
    item.endsAt = shiftIso(item.endsAt, offsetMs)!
    item.createdAt = shiftIso(item.createdAt, offsetMs)!
    item.updatedAt = shiftIso(item.updatedAt, offsetMs)!
  })
  db.playbooks.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.automationRules.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.automationRuns.forEach((item) => { item.startedAt = shiftIso(item.startedAt, offsetMs)!; item.finishedAt = shiftIso(item.finishedAt, offsetMs) })
  db.companies.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.contacts.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.opportunities.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.socialProfiles.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)!; item.lastCheckedAt = shiftIso(item.lastCheckedAt, offsetMs) })
  db.products.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.proposals.forEach((item) => { item.validUntil = shiftIso(item.validUntil ? `${item.validUntil}T12:00:00.000Z` : null, offsetMs)?.slice(0, 10) ?? null; item.sentAt = shiftIso(item.sentAt, offsetMs); item.viewedAt = shiftIso(item.viewedAt, offsetMs); item.acceptedAt = shiftIso(item.acceptedAt, offsetMs); item.rejectedAt = shiftIso(item.rejectedAt, offsetMs); item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.revenueEntries.forEach((item) => { item.recognizedAt = shiftIso(item.recognizedAt, offsetMs)!; item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.members.forEach((item) => { item.joinedAt = shiftIso(item.joinedAt, offsetMs)! })
  const monthStart = new Date(reference.getFullYear(), reference.getMonth(), 1)
  const monthEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 0)
  const dateOnly = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  db.goals.forEach((item) => {
    item.periodStart = dateOnly(monthStart)
    item.periodEnd = dateOnly(monthEnd)
    item.createdAt = shiftIso(item.createdAt, offsetMs)!
    item.updatedAt = shiftIso(item.updatedAt, offsetMs)!
  })
  return db
}

const seedDatabase = (): LocalDatabase => rebaseDemoDates({
  workspaces: [clone(DEMO_WORKSPACE)], stages: clone(DEFAULT_STAGES), leads: clone(DEMO_LEADS),
  activities: clone(DEMO_ACTIVITIES), calls: clone(DEMO_CALLS), events: clone(DEMO_EVENTS), playbooks: clone(DEMO_PLAYBOOKS),
  goals: clone(DEMO_GOALS), automationRules: clone(DEMO_AUTOMATION_RULES), automationRuns: clone(DEMO_AUTOMATION_RUNS),
  companies: clone(DEMO_COMPANIES), contacts: clone(DEMO_CONTACTS), opportunities: clone(DEMO_OPPORTUNITIES), socialProfiles: clone(DEMO_SOCIAL_PROFILES),
  products: clone(DEMO_PRODUCTS), proposals: clone(DEMO_PROPOSALS), revenueEntries: clone(DEMO_REVENUE_ENTRIES),
  members: [{ workspaceId: DEMO_WORKSPACE.id, userId: 'demo-user', displayName: 'Usuário Demo', email: 'demo@realtalent.local', avatarUrl: null, role: 'owner', joinedAt: DEMO_WORKSPACE.createdAt }],
  invites: [], auditLogs: [],
})

const slugify = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'

export const configureLocalExperience = (input: LocalExperienceInput) => {
  const displayName = input.displayName.trim()
  const companyName = input.companyName.trim()
  if (displayName.length < 2) throw new Error('Informe seu nome com pelo menos 2 caracteres.')
  if (companyName.length < 2) throw new Error('Informe o nome da empresa com pelo menos 2 caracteres.')
  const email = input.email.trim().toLowerCase() || 'usuario@local.crm'
  const userId = 'local-user'
  const workspaceId = 'local-workspace'
  const createdAt = new Date().toISOString()
  const workspace: Workspace = { id: workspaceId, name: companyName, slug: slugify(companyName), role: 'owner', createdAt }
  const member: WorkspaceMember = { workspaceId, userId, displayName, email, avatarUrl: null, role: 'owner', joinedAt: createdAt }
  let db = seedDatabase()
  if (input.mode === 'clean') {
    db = {
      workspaces: [workspace],
      stages: clone(DEFAULT_STAGES).map((stage) => ({ ...stage, id: createId('stage'), workspaceId })),
      leads: [], activities: [], calls: [], events: [], playbooks: [], goals: [], automationRules: [], automationRuns: [], companies: [], contacts: [], opportunities: [], socialProfiles: [], products: [], proposals: [], revenueEntries: [],
      members: [member], invites: [], auditLogs: [],
    }
  } else {
    const oldWorkspaceId = db.workspaces[0]?.id ?? DEMO_WORKSPACE.id
    db.workspaces = [workspace]
    db.stages.forEach((item) => { item.workspaceId = workspaceId })
    db.leads.forEach((item) => { item.workspaceId = workspaceId; item.ownerId = userId; item.ownerName = displayName })
    db.activities.forEach((item) => { item.workspaceId = workspaceId; if (item.assignedTo) item.assignedTo = userId })
    db.calls.forEach((item) => { item.workspaceId = workspaceId; if (item.userId) item.userId = userId })
    db.events.forEach((item) => { item.workspaceId = workspaceId; if (item.assignedTo) item.assignedTo = userId })
    db.playbooks.forEach((item) => { item.workspaceId = workspaceId })
    db.goals.forEach((item) => { item.workspaceId = workspaceId })
    db.automationRules.forEach((item) => { item.workspaceId = workspaceId; item.createdBy = userId })
    db.automationRuns.forEach((item) => { item.workspaceId = workspaceId })
    db.companies.forEach((item) => { item.workspaceId = workspaceId })
    db.contacts.forEach((item) => { item.workspaceId = workspaceId })
    db.opportunities.forEach((item) => { item.workspaceId = workspaceId })
    db.socialProfiles.forEach((item) => { item.workspaceId = workspaceId })
    db.products.forEach((item) => { item.workspaceId = workspaceId })
    db.proposals.forEach((item) => { item.workspaceId = workspaceId; item.ownerId = userId })
    db.revenueEntries.forEach((item) => { item.workspaceId = workspaceId; item.ownerId = userId })
    db.invites.forEach((item) => { if (item.workspaceId === oldWorkspaceId) item.workspaceId = workspaceId })
    db.auditLogs.forEach((item) => { if (item.workspaceId === oldWorkspaceId) item.workspaceId = workspaceId })
    db.members = [member]
  }
  writeDatabase(db)
  writeLocalProfile({ displayName, email })
  safeStorage.setItem(LOCAL_ACTIVE_WORKSPACE_KEY, workspaceId)
  completeLocalSetup()
}

const normalizeActivity = (activity: Partial<ActivityItem>): ActivityItem => {
  const createdAt = activity.createdAt ?? new Date().toISOString()
  return {
    id: activity.id ?? createId('activity'), workspaceId: activity.workspaceId ?? '', leadId: activity.leadId ?? null,
    type: activity.type ?? 'note', title: activity.title ?? 'Atividade', description: activity.description ?? '',
    dueAt: activity.dueAt ?? null, completedAt: activity.completedAt ?? null, assignedTo: activity.assignedTo ?? null,
    sourceType: activity.sourceType ?? 'manual', sourceId: activity.sourceId ?? null,
    createdAt, updatedAt: activity.updatedAt ?? createdAt,
  }
}

const readDatabase = (): LocalDatabase => {
  const raw = safeStorage.getItem(STORAGE_KEY)
  if (!raw) return seedDatabase()
  try {
    const parsed = JSON.parse(raw) as Partial<LocalDatabase>
    return {
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      stages: Array.isArray(parsed.stages) ? parsed.stages : [],
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities.map(normalizeActivity) : [],
      calls: Array.isArray(parsed.calls) ? parsed.calls : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      playbooks: Array.isArray(parsed.playbooks) ? parsed.playbooks : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      automationRules: Array.isArray(parsed.automationRules) ? parsed.automationRules : [],
      automationRuns: Array.isArray(parsed.automationRuns) ? parsed.automationRuns : [],
      companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      socialProfiles: Array.isArray(parsed.socialProfiles) ? parsed.socialProfiles : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals.map((item) => normalizeProposal(item as ProposalRecord)) : [],
      revenueEntries: Array.isArray(parsed.revenueEntries) ? parsed.revenueEntries.map((item) => ({ ...item, competenceDate: item.competenceDate ?? item.recognizedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), servicePeriodStart: item.servicePeriodStart ?? null, servicePeriodEnd: item.servicePeriodEnd ?? null, adjustmentReason: item.adjustmentReason ?? '' })) : [],
      members: Array.isArray(parsed.members) ? parsed.members : [],
      invites: Array.isArray(parsed.invites) ? parsed.invites : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    }
  } catch {
    const recovered = seedDatabase()
    safeStorage.setItem(`${CORRUPT_BACKUP_PREFIX}${Date.now()}`, raw)
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(recovered))
    return recovered
  }
}

const writeDatabase = (db: LocalDatabase) => safeStorage.setItem(STORAGE_KEY, JSON.stringify(db))
const todayKey = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`
const stageStatus = (stage: PipelineStage): Lead['status'] => stage.isWon ? 'won' : stage.isLost ? 'lost' : 'active'


const proposalItemTotals = (item: ProposalLineItem): ProposalLineItem => {
  const quantity = Math.max(0.01, Number(item.quantity || 1))
  const unitPrice = Math.max(0, Number(item.unitPrice || 0))
  const discountPercent = Math.min(100, Math.max(0, Number(item.discountPercent || 0)))
  const taxRate = Math.max(0, Number(item.taxRate || 0))
  const lineSubtotal = quantity * unitPrice
  const lineDiscount = lineSubtotal * discountPercent / 100
  const taxable = lineSubtotal - lineDiscount
  const lineTax = taxable * taxRate / 100
  const lineTotal = taxable + lineTax
  const recurringMonthlyTotal = item.billingType === 'recurring' ? lineTotal * (item.billingInterval === 'year' ? 1 / 12 : item.billingInterval === 'quarter' ? 1 / 3 : 1) : 0
  return { ...item, quantity, unitPrice, discountPercent, taxRate, lineSubtotal, lineDiscount, lineTax, lineTotal, recurringMonthlyTotal }
}

const normalizeProposal = (proposal: ProposalRecord): ProposalRecord => {
  const items = proposal.items.map(proposalItemTotals)
  const oneTimeTotal = items.filter((item) => item.billingType === 'one_time').reduce((sum, item) => sum + item.lineTotal, 0)
  const recurringMonthlyTotal = items.reduce((sum, item) => sum + item.recurringMonthlyTotal, 0)
  const contractTermMonths = Math.max(1, Number(proposal.contractTermMonths || 12))
  const annualRecurringTotal = recurringMonthlyTotal * 12
  const totalContractValue = oneTimeTotal + recurringMonthlyTotal * contractTermMonths
  return {
    ...proposal,
    items,
    subtotal: items.reduce((sum, item) => sum + item.lineSubtotal, 0),
    discountTotal: items.reduce((sum, item) => sum + item.lineDiscount, 0),
    taxTotal: items.reduce((sum, item) => sum + item.lineTax, 0),
    total: items.reduce((sum, item) => sum + item.lineTotal, 0),
    recurringMonthlyTotal,
    oneTimeTotal,
    annualRecurringTotal,
    totalContractValue,
    isOfficial: Boolean(proposal.isOfficial),
    isCurrentVersion: proposal.isCurrentVersion !== false,
    supersededById: proposal.supersededById ?? null,
    expectedCloseAt: proposal.expectedCloseAt ?? null,
    contractStartAt: proposal.contractStartAt ?? null,
    contractEndAt: proposal.contractEndAt ?? null,
    contractTermMonths,
    autoRenew: Boolean(proposal.autoRenew),
    postSaleStartAt: proposal.postSaleStartAt ?? null,
    postSaleCadenceName: proposal.postSaleCadenceName ?? 'Onboarding padrão',
    closedWonAt: proposal.closedWonAt ?? null,
  }
}

const proposalSequence = (db: LocalDatabase, workspaceId: string) => {
  const year = new Date().getFullYear()
  const numbers = new Set(db.proposals.filter((item) => item.workspaceId === workspaceId && item.proposalNumber.startsWith(`PROP-${year}-`)).map((item) => item.proposalNumber))
  return `PROP-${year}-${String(numbers.size + 1).padStart(3, '0')}`
}

const syncCommercialFromOfficialProposal = (db: LocalDatabase, leadId: string, now = new Date().toISOString()) => {
  const lead = db.leads.find((item) => item.id === leadId)
  const opportunity = db.opportunities.find((item) => item.id === lead?.opportunityId || item.leadId === leadId)
  const priority: Record<ProposalStatus, number> = { accepted: 5, viewed: 4, sent: 3, draft: 2, rejected: 0, expired: 0, cancelled: 0 }
  const candidate = db.proposals
    .filter((item) => item.leadId === leadId && item.isCurrentVersion && !['rejected', 'expired', 'cancelled'].includes(item.status) && !item.closedWonAt)
    .sort((a, b) => priority[b.status] - priority[a.status] || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
  for (const item of db.proposals) if (item.leadId === leadId) item.isOfficial = item.id === candidate?.id
  if (candidate) {
    if (lead) { lead.value = candidate.totalContractValue; lead.expectedCloseAt = candidate.expectedCloseAt; lead.updatedAt = now }
    if (opportunity) { opportunity.officialProposalId = candidate.id; opportunity.value = candidate.totalContractValue; opportunity.expectedCloseAt = candidate.expectedCloseAt; opportunity.forecastCategory = candidate.forecastCategory; opportunity.probability = candidate.probability; opportunity.updatedAt = now }
    return candidate
  }
  if (lead) { lead.value = 0; lead.updatedAt = now }
  if (opportunity) {
    const stage = db.stages.find((item) => item.id === opportunity.stageId)
    opportunity.officialProposalId = null
    opportunity.value = 0
    opportunity.forecastCategory = 'pipeline'
    opportunity.probability = stage?.probability ?? 0
    opportunity.updatedAt = now
  }
  return null
}

const syncLeadNextAction = (db: LocalDatabase, leadId: string | null) => {
  if (!leadId) return
  const lead = db.leads.find((item) => item.id === leadId)
  if (!lead) return
  const next = db.activities
    .filter((activity) => activity.leadId === leadId && activity.dueAt && !activity.completedAt && ['followup', 'meeting', 'call'].includes(activity.type))
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())[0]
  lead.nextActionAt = next?.dueAt ?? null
  lead.updatedAt = new Date().toISOString()
}


const synchronizeStructureInDatabase = (db: LocalDatabase, workspaceId: string): CommercialStructureSyncResult => {
  const validLeadIds = new Set(db.leads.filter((lead) => lead.workspaceId === workspaceId).map((lead) => lead.id))
  db.companies = db.companies.map((item) => item.workspaceId === workspaceId ? { ...item, leadIds: item.leadIds.filter((id) => validLeadIds.has(id)) } : item)
  db.contacts = db.contacts.map((item) => item.workspaceId === workspaceId ? { ...item, leadIds: item.leadIds.filter((id) => validLeadIds.has(id)) } : item)
  db.opportunities = db.opportunities.filter((item) => item.workspaceId !== workspaceId || validLeadIds.has(item.leadId))
  const activeCompanyIds = new Set(db.companies.filter((item) => item.workspaceId === workspaceId && (item.leadIds.length || db.contacts.some((contact) => contact.companyId === item.id) || db.opportunities.some((opportunity) => opportunity.companyId === item.id))).map((item) => item.id))
  const activeContactIds = new Set(db.contacts.filter((item) => item.workspaceId === workspaceId && (item.leadIds.length || db.opportunities.some((opportunity) => opportunity.primaryContactId === item.id))).map((item) => item.id))
  db.companies = db.companies.filter((item) => item.workspaceId !== workspaceId || activeCompanyIds.has(item.id))
  db.contacts = db.contacts.filter((item) => item.workspaceId !== workspaceId || activeContactIds.has(item.id))
  db.socialProfiles = db.socialProfiles.filter((item) => item.workspaceId !== workspaceId || (item.entityType === 'company' ? activeCompanyIds.has(item.entityId) : activeContactIds.has(item.entityId)))
  const before = { companies: db.companies.length, contacts: db.contacts.length, opportunities: db.opportunities.length, socialProfiles: db.socialProfiles.length }
  const leads = db.leads.filter((lead) => lead.workspaceId === workspaceId)
  const derived = deriveCommercialStructure(leads, {
    companies: db.companies.filter((item) => item.workspaceId === workspaceId), contacts: db.contacts.filter((item) => item.workspaceId === workspaceId),
    opportunities: db.opportunities.filter((item) => item.workspaceId === workspaceId), socialProfiles: db.socialProfiles.filter((item) => item.workspaceId === workspaceId),
  })
  db.companies = [...db.companies.filter((item) => item.workspaceId !== workspaceId), ...derived.companies]
  db.contacts = [...db.contacts.filter((item) => item.workspaceId !== workspaceId), ...derived.contacts]
  db.opportunities = [...db.opportunities.filter((item) => item.workspaceId !== workspaceId), ...derived.opportunities]
  db.socialProfiles = [...db.socialProfiles.filter((item) => item.workspaceId !== workspaceId), ...derived.socialProfiles]
  let leadsLinked = 0
  for (const link of derived.leadLinks) {
    const lead = db.leads.find((item) => item.id === link.leadId && item.workspaceId === workspaceId)
    if (!lead) continue
    if (lead.companyId !== link.companyId || lead.primaryContactId !== link.contactId || lead.opportunityId !== link.opportunityId) leadsLinked += 1
    lead.companyId = link.companyId; lead.primaryContactId = link.contactId; lead.opportunityId = link.opportunityId
  }
  return {
    companiesCreated: Math.max(0, db.companies.length - before.companies), contactsCreated: Math.max(0, db.contacts.length - before.contacts),
    opportunitiesCreated: Math.max(0, db.opportunities.length - before.opportunities), socialProfilesCreated: Math.max(0, db.socialProfiles.length - before.socialProfiles), leadsLinked,
  }
}

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
    const db = readDatabase()
    for (const workspace of db.workspaces) synchronizeStructureInDatabase(db, workspace.id)
    writeDatabase(db)
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
    db.members.push({ workspaceId: workspace.id, userId: 'demo-user', displayName: 'Usuário Demo', email: 'demo@realtalent.local', avatarUrl: null, role: 'owner', joinedAt: workspace.createdAt })
    writeDatabase(db)
    return clone(workspace)
  }

  async listWorkspaceMembers(workspaceId: string) { return clone(readDatabase().members.filter((member) => member.workspaceId === workspaceId)) }

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
    if (!db.members.some((member) => member.workspaceId === invite.workspaceId && member.userId === 'demo-user')) db.members.push({ workspaceId: invite.workspaceId, userId: 'demo-user', displayName: 'Usuário Demo', email: 'demo@realtalent.local', avatarUrl: null, role: invite.role, joinedAt: invite.acceptedAt })
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
    return { version: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), snapshot, members: db.members.filter((member) => member.workspaceId === workspaceId), auditLogs: db.auditLogs.filter((log) => log.workspaceId === workspaceId) }
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
      calls: clone(db.calls.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())),
      events: clone(db.events.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())),
      playbooks: clone(db.playbooks.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))),
      goals: clone(db.goals.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime())),
      automationRules: clone(db.automationRules.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
      automationRuns: clone(db.automationRuns.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 300)),
      companies: clone(db.companies.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
      contacts: clone(db.contacts.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
      opportunities: clone(db.opportunities.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())),
      socialProfiles: clone(db.socialProfiles.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.network.localeCompare(b.network, 'pt-BR'))),
      products: clone(db.products.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
      proposals: clone(db.proposals.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())),
      revenueEntries: clone(db.revenueEntries.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.recognizedAt).getTime() - new Date(a.recognizedAt).getTime())),
    }
  }

  async synchronizeCommercialStructure(workspaceId: string) {
    const db = readDatabase(); const result = synchronizeStructureInDatabase(db, workspaceId); writeDatabase(db); return clone(result)
  }

  async listLeads(workspaceId: string) { return clone(readDatabase().leads.filter((lead) => lead.workspaceId === workspaceId)) }

  async createLead(input: NewLeadInput) {
    if (!input.name.trim()) throw new Error('O nome do lead é obrigatório.')
    const db = readDatabase()
    const stage = db.stages.find((item) => item.id === input.stageId && item.workspaceId === input.workspaceId)
    if (!stage) throw new Error('Etapa inválida para este workspace.')
    const now = new Date().toISOString()
    const lead: Lead = { ...input, status: stageStatus(stage), id: createId('lead'), name: input.name.trim(), createdAt: now, updatedAt: now }
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
    const stage = input.stageId ? db.stages.find((item) => item.id === input.stageId && item.workspaceId === current.workspaceId) : null
    if (input.stageId && !stage) throw new Error('Etapa inválida para este workspace.')
    const next: Lead = {
      ...current, ...input, ...(stage ? { status: stageStatus(stage) } : {}),
      name: input.name?.trim() || current.name, updatedAt: new Date().toISOString(),
    }
    db.leads[index] = next
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
    const recordings = db.calls.filter((call) => call.leadId === leadId && call.recordingPath?.startsWith('indexeddb:'))
    await Promise.allSettled(recordings.map((call) => deleteLocalRecording(call.id)))
    recordings.forEach((call) => { const url = recordingUrlCache.get(call.id); if (url) URL.revokeObjectURL(url); recordingUrlCache.delete(call.id) })
    db.leads = db.leads.filter((lead) => lead.id !== leadId)
    db.activities = db.activities.filter((activity) => activity.leadId !== leadId)
    db.calls = db.calls.filter((call) => call.leadId !== leadId)
    db.events = db.events.map((event) => event.leadId === leadId ? { ...event, leadId: null } : event)
    db.companies = db.companies.map((item) => ({ ...item, leadIds: item.leadIds.filter((id) => id !== leadId) })).filter((item) => item.leadIds.length)
    db.contacts = db.contacts.map((item) => ({ ...item, leadIds: item.leadIds.filter((id) => id !== leadId) })).filter((item) => item.leadIds.length)
    db.opportunities = db.opportunities.filter((item) => item.leadId !== leadId)
    writeDatabase(db)
  }

  async mergeLeads(workspaceId: string, primaryLeadId: string, duplicateLeadId: string) {
    if (primaryLeadId === duplicateLeadId) throw new Error('Selecione dois leads diferentes.')
    const db = readDatabase()
    const primaryIndex = db.leads.findIndex((lead) => lead.id === primaryLeadId && lead.workspaceId === workspaceId)
    const duplicate = db.leads.find((lead) => lead.id === duplicateLeadId && lead.workspaceId === workspaceId)
    if (primaryIndex < 0 || !duplicate) throw new Error('Um dos leads não foi encontrado neste workspace.')
    const primary = db.leads[primaryIndex]
    const merged = mergeLeadRecords(primary, duplicate)
    db.activities = db.activities.map((activity) => activity.leadId === duplicateLeadId ? { ...activity, leadId: primaryLeadId } : activity)
    db.calls = db.calls.map((call) => call.leadId === duplicateLeadId ? { ...call, leadId: primaryLeadId } : call)
    db.events = db.events.map((event) => event.leadId === duplicateLeadId ? { ...event, leadId: primaryLeadId } : event)
    db.leads = db.leads.filter((lead) => lead.id !== duplicateLeadId)
    const earliestPending = db.activities.filter((activity) => activity.leadId === primaryLeadId && !activity.completedAt && activity.dueAt).map((activity) => activity.dueAt!).sort()[0] ?? null
    merged.nextActionAt = [merged.nextActionAt, earliestPending].filter((value): value is string => Boolean(value)).sort()[0] ?? null
    db.leads[db.leads.findIndex((lead) => lead.id === primaryLeadId)] = merged
    synchronizeStructureInDatabase(db, workspaceId)
    db.auditLogs.unshift({
      id: createId('audit'), workspaceId, userId: null, userName: 'Sistema local', action: 'lead_merged',
      entityType: 'lead', entityId: primaryLeadId, createdAt: new Date().toISOString(),
    })
    writeDatabase(db)
    return clone(merged)
  }

  async bulkUpdateLeads(workspaceId: string, leadIds: string[], input: UpdateLeadInput) {
    const ids = new Set(leadIds)
    if (!ids.size) return 0
    const db = readDatabase()
    const stage = input.stageId ? db.stages.find((item) => item.id === input.stageId && item.workspaceId === workspaceId) : null
    if (input.stageId && !stage) throw new Error('Etapa inválida para este workspace.')
    let count = 0
    db.leads = db.leads.map((lead) => {
      if (lead.workspaceId !== workspaceId || !ids.has(lead.id)) return lead
      count += 1
      return { ...lead, ...input, ...(stage ? { status: stageStatus(stage) } : {}), updatedAt: new Date().toISOString() }
    })
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
      return { ...lead, tags: [...new Set([...lead.tags, cleanTag])], updatedAt }
    })
    writeDatabase(db)
    return count
  }

  async bulkDeleteLeads(workspaceId: string, leadIds: string[]) {
    const ids = new Set(leadIds)
    const db = readDatabase()
    const recordings = db.calls.filter((call) => call.workspaceId === workspaceId && ids.has(call.leadId) && call.recordingPath?.startsWith('indexeddb:'))
    await Promise.allSettled(recordings.map((call) => deleteLocalRecording(call.id)))
    recordings.forEach((call) => { const url = recordingUrlCache.get(call.id); if (url) URL.revokeObjectURL(url); recordingUrlCache.delete(call.id) })
    const before = db.leads.length
    db.leads = db.leads.filter((lead) => lead.workspaceId !== workspaceId || !ids.has(lead.id))
    db.activities = db.activities.filter((activity) => activity.workspaceId !== workspaceId || !activity.leadId || !ids.has(activity.leadId))
    db.calls = db.calls.filter((call) => call.workspaceId !== workspaceId || !ids.has(call.leadId))
    db.events = db.events.map((event) => event.workspaceId === workspaceId && event.leadId && ids.has(event.leadId) ? { ...event, leadId: null } : event)
    writeDatabase(db)
    return before - db.leads.length
  }

  async listStages(workspaceId: string) { return clone(readDatabase().stages.filter((stage) => stage.workspaceId === workspaceId).sort((a, b) => a.order - b.order)) }

  async createStage(input: NewStageInput) {
    const db = readDatabase(); const name = input.name.trim()
    if (!name) throw new Error('Informe o nome da etapa.')
    if (db.stages.some((stage) => stage.workspaceId === input.workspaceId && stage.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe uma etapa com esse nome.')
    const order = input.order ?? Math.max(0, ...db.stages.filter((stage) => stage.workspaceId === input.workspaceId).map((stage) => stage.order)) + 1
    const stage: PipelineStage = { ...input, name, order, id: createId('stage') }
    db.stages.push(stage); writeDatabase(db); return clone(stage)
  }

  async updateStage(stageId: string, input: UpdateStageInput) {
    const db = readDatabase(); const index = db.stages.findIndex((stage) => stage.id === stageId)
    if (index < 0) throw new Error('Etapa não encontrada.')
    const current = db.stages[index]; const name = input.name?.trim()
    if (name && db.stages.some((stage) => stage.workspaceId === current.workspaceId && stage.id !== stageId && stage.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe uma etapa com esse nome.')
    const next = { ...current, ...input, ...(name ? { name } : {}) }
    if (next.isWon && next.isLost) throw new Error('Uma etapa não pode ser ganha e perdida ao mesmo tempo.')
    db.stages[index] = next
    db.leads = db.leads.map((lead) => lead.stageId === stageId ? { ...lead, status: stageStatus(next), updatedAt: new Date().toISOString() } : lead)
    writeDatabase(db); return clone(next)
  }

  async deleteStage(stageId: string) {
    const db = readDatabase(); const stage = db.stages.find((item) => item.id === stageId)
    if (!stage) throw new Error('Etapa não encontrada.')
    if (db.leads.some((lead) => lead.stageId === stageId)) throw new Error('Mova os leads desta etapa antes de excluí-la.')
    if (db.stages.filter((item) => item.workspaceId === stage.workspaceId).length <= 1) throw new Error('O Pipeline precisa manter ao menos uma etapa.')
    db.stages = db.stages.filter((item) => item.id !== stageId)
    db.stages.filter((item) => item.workspaceId === stage.workspaceId).sort((a, b) => a.order - b.order).forEach((item, index) => { item.order = index + 1 })
    writeDatabase(db)
  }

  async listActivities(workspaceId: string) { return clone(readDatabase().activities.filter((activity) => activity.workspaceId === workspaceId)) }

  async createActivity(input: NewActivityInput) {
    if (!input.title.trim()) throw new Error('Informe o título da atividade.')
    const db = readDatabase(); const now = new Date().toISOString()
    if (input.leadId && !db.leads.some((lead) => lead.id === input.leadId && lead.workspaceId === input.workspaceId)) throw new Error('Lead inválido para este workspace.')
    const activity = normalizeActivity({ ...input, id: createId('activity'), title: input.title.trim(), createdAt: now, updatedAt: now })
    db.activities.unshift(activity); syncLeadNextAction(db, activity.leadId); writeDatabase(db); return clone(activity)
  }

  async createActivities(inputs: NewActivityInput[]) {
    if (!inputs.length) return []
    const db = readDatabase(); const now = new Date().toISOString()
    for (const input of inputs) {
      if (!input.title.trim()) throw new Error('Informe o título de todas as atividades.')
      if (input.leadId && !db.leads.some((lead) => lead.id === input.leadId && lead.workspaceId === input.workspaceId)) throw new Error('Uma atividade possui lead inválido para este workspace.')
    }
    const activities = inputs.map((input) => normalizeActivity({ ...input, id: createId('activity'), title: input.title.trim(), createdAt: now, updatedAt: now }))
    db.activities.unshift(...activities)
    new Set(activities.map((activity) => activity.leadId).filter((id): id is string => Boolean(id))).forEach((leadId) => syncLeadNextAction(db, leadId))
    writeDatabase(db)
    return clone(activities)
  }

  async updateActivity(activityId: string, input: UpdateActivityInput) {
    const db = readDatabase(); const index = db.activities.findIndex((item) => item.id === activityId)
    if (index < 0) throw new Error('Atividade não encontrada.')
    const previousLead = db.activities[index].leadId
    const next = normalizeActivity({ ...db.activities[index], ...input, ...(input.title !== undefined ? { title: input.title.trim() } : {}), updatedAt: new Date().toISOString() })
    if (!next.title) throw new Error('Informe o título da atividade.')
    db.activities[index] = next
    if (next.leadId && next.completedAt && ['call', 'followup', 'meeting'].includes(next.type)) {
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
    return this.updateActivity(activityId, { completedAt: completed ? new Date().toISOString() : null })
  }

  async registerActivityOutcome(input: RegisterActivityOutcomeInput): Promise<CommercialActivityResult> {
    const db = readDatabase()
    const activity = db.activities.find((item) => item.id === input.activityId && item.workspaceId === input.workspaceId)
    if (!activity) throw new Error('Atividade não encontrada para registrar o resultado.')
    if (!activity.leadId) throw new Error('A atividade precisa estar vinculada a um lead.')
    const lead = db.leads.find((item) => item.id === activity.leadId && item.workspaceId === input.workspaceId)
    if (!lead) throw new Error('Lead não encontrado para esta atividade.')
    if (input.createNext && (!input.nextType || !input.nextTitle?.trim() || !input.nextAt)) throw new Error('Informe o próximo passo completo.')
    const resultSourceId = `commercial:${activity.id}:result`
    const previousResult = db.activities.find((item) => item.sourceType === 'system' && item.sourceId === resultSourceId)
    if (previousResult) {
      const next = db.activities.find((item) => item.sourceType === 'system' && item.sourceId === `commercial:${activity.id}:next`)
      return { activity: clone(activity), lead: clone(lead), resultActivityId: previousResult.id, nextActivityId: next?.id ?? null, idempotent: true }
    }

    const now = new Date().toISOString()
    activity.completedAt = now
    activity.updatedAt = now
    if (!lead.lastContactAt || now > lead.lastContactAt) lead.lastContactAt = now

    const closesProspecting = ['meeting_scheduled', 'not_interested', 'won', 'lost'].includes(input.outcome)
    const closesCalls = input.outcome === 'invalid_contact'
    if (closesProspecting || closesCalls) {
      for (const pending of db.activities) {
        if (pending.leadId !== lead.id || pending.completedAt || pending.id === activity.id) continue
        if ((closesProspecting && ['call', 'followup'].includes(pending.type)) || (closesCalls && pending.type === 'call')) {
          pending.completedAt = now
          pending.updatedAt = now
        }
      }
    }

    const resultActivity = normalizeActivity({
      id: createId('activity'), workspaceId: input.workspaceId, leadId: lead.id, type: 'note', title: input.resultTitle.trim(),
      description: input.resultDescription, dueAt: null, completedAt: now, assignedTo: input.userId ?? activity.assignedTo,
      sourceType: 'system', sourceId: resultSourceId, createdAt: now, updatedAt: now,
    })
    db.activities.unshift(resultActivity)

    if (input.stageId && input.stageId !== lead.stageId) {
      const stage = db.stages.find((item) => item.id === input.stageId && item.workspaceId === input.workspaceId)
      if (!stage) throw new Error('Etapa inválida para este workspace.')
      lead.stageId = stage.id
      lead.status = stageStatus(stage)
      db.activities.unshift(normalizeActivity({
        id: createId('activity'), workspaceId: input.workspaceId, leadId: lead.id, type: 'stage_change', title: `Lead movido para ${stage.name}`,
        description: `Movimentação automática após “${input.resultTitle.trim()}”.`, dueAt: null, completedAt: now, assignedTo: input.userId,
        sourceType: 'system', sourceId: `commercial:${activity.id}:stage`, createdAt: now, updatedAt: now,
      }))
    } else if (input.outcome === 'won') lead.status = 'won'
    else if (input.outcome === 'lost' || input.outcome === 'not_interested') lead.status = 'lost'

    if (input.outcome === 'invalid_contact') lead.tags = [...new Set([...lead.tags, 'telefone-invalido'])]
    if (input.outcome === 'not_decision_maker') lead.tags = [...new Set([...lead.tags, 'buscar-decisor'])]
    lead.updatedAt = now

    let nextActivityId: string | null = null
    if (input.createNext && input.nextType && input.nextTitle && input.nextAt) {
      const next = normalizeActivity({
        id: createId('activity'), workspaceId: input.workspaceId, leadId: lead.id, type: input.nextType, title: input.nextTitle.trim(),
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
    const calls = clone(readDatabase().calls.filter((call) => call.workspaceId === workspaceId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()))
    return Promise.all(calls.map(async (call) => {
      if (!call.recordingPath?.startsWith('indexeddb:')) return { ...call, recordingUrl: null }
      const cached = recordingUrlCache.get(call.id)
      if (cached) return { ...call, recordingUrl: cached }
      try {
        const blob = await readLocalRecording(call.id)
        if (!blob) return { ...call, recordingUrl: null }
        const url = URL.createObjectURL(blob); recordingUrlCache.set(call.id, url)
        return { ...call, recordingUrl: url }
      } catch { return { ...call, recordingUrl: null } }
    }))
  }

  async createCall(input: NewCallInput, recording?: Blob | null) {
    const db = readDatabase()
    if (!db.leads.some((lead) => lead.id === input.leadId && lead.workspaceId === input.workspaceId)) throw new Error('Lead inválido para esta ligação.')
    if (recording?.size && !input.consentAt) throw new Error('Registre o consentimento antes de salvar uma gravação.')
    const callId = createId('call')
    if (recording?.size) await saveLocalRecording(callId, recording)
    const call: CallRecord = { ...input, id: callId, createdAt: new Date().toISOString(), recordingPath: recording?.size ? `indexeddb:${callId}` : null, recordingUrl: null }
    db.calls.unshift(call)
    const lead = db.leads.find((item) => item.id === call.leadId && item.workspaceId === call.workspaceId)
    const contactedAt = call.endedAt ?? call.startedAt
    if (lead && (!lead.lastContactAt || contactedAt > lead.lastContactAt)) lead.lastContactAt = contactedAt
    db.activities.unshift(normalizeActivity({
      id: createId('activity'), workspaceId: call.workspaceId, leadId: call.leadId, type: 'call', title: `Ligação — ${call.outcome}`,
      description: call.notes, dueAt: call.startedAt, completedAt: call.endedAt ?? call.startedAt, assignedTo: call.userId,
      sourceType: 'call', sourceId: call.id, createdAt: call.createdAt, updatedAt: call.createdAt,
    }))
    writeDatabase(db); return clone(call)
  }

  async registerCallOutcome(input: RegisterCallOutcomeInput, recording?: Blob | null): Promise<CommercialActionResult> {
    const db = readDatabase()
    const lead = db.leads.find((item) => item.id === input.leadId && item.workspaceId === input.workspaceId)
    if (!lead) throw new Error('Lead inválido para esta ação comercial.')
    if (recording?.size && !input.consentAt) throw new Error('Registre o consentimento antes de salvar uma gravação.')
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
      const call: CallRecord = { ...callInput, id: callId, createdAt: now, recordingPath: recording?.size ? `indexeddb:${callId}` : null, recordingUrl: null }
      db.calls.unshift(call)

      const completedActivity = normalizeActivity({
        id: createId('activity'), workspaceId: call.workspaceId, leadId: call.leadId, type: 'call', title: `Ligação — ${plan.label}`,
        description: call.notes, dueAt: call.startedAt, completedAt: call.endedAt ?? call.startedAt, assignedTo: call.userId,
        sourceType: 'call', sourceId: call.id, createdAt: now, updatedAt: now,
      })
      db.activities.unshift(completedActivity)

      for (const activity of db.activities) {
        if (activity.leadId === lead.id && !activity.completedAt && shouldClosePendingActivity(activity.type, plan.pendingActivityPolicy)) {
          activity.completedAt = now
          activity.updatedAt = now
        }
      }

      const stage = resolveCommercialStage(db.stages, input.workspaceId, plan.stageIntent)
      const previousStageId = lead.stageId
      if (stage) { lead.stageId = stage.id; lead.status = stageStatus(stage) }
      else if (plan.leadStatus) lead.status = plan.leadStatus
      if (plan.addTags.length) lead.tags = [...new Set([...lead.tags, ...plan.addTags])]
      const contactedAt = call.endedAt ?? call.startedAt
      if (!lead.lastContactAt || contactedAt > lead.lastContactAt) lead.lastContactAt = contactedAt
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
        endsAt.setMinutes(endsAt.getMinutes() + Math.max(15, input.meetingDurationMinutes ?? 30))
        const event: CalendarEvent = {
          id: createId('event'), workspaceId: input.workspaceId, leadId: lead.id, title: `Reunião — ${lead.name}`,
          description: `${input.notes}
[[CRM_COMMERCIAL_ACTION:${callId}]]`.trim(), startsAt: input.nextAt, endsAt: endsAt.toISOString(), allDay: false,
          location: '', status: 'confirmed', assignedTo: input.userId, createdAt: now, updatedAt: now,
        }
        db.events.push(event); calendarEventId = event.id
        const activity = normalizeActivity({
          id: createId('activity'), workspaceId: input.workspaceId, leadId: lead.id, type: 'meeting', title: event.title,
          description: event.description, dueAt: event.startsAt, completedAt: null, assignedTo: input.userId,
          sourceType: 'calendar', sourceId: event.id, createdAt: now, updatedAt: now,
        })
        db.activities.unshift(activity); nextActivityId = activity.id
      } else if (plan.nextStepKind === 'call' && input.nextAt) {
        const activity = normalizeActivity({
          id: createId('activity'), workspaceId: input.workspaceId, leadId: lead.id, type: 'call', title: `Próxima ligação — ${lead.name}`,
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
    if (new Date(input.endsAt).getTime() < new Date(input.startsAt).getTime()) throw new Error('O término deve ser posterior ao início.')
    const db = readDatabase(); const now = new Date().toISOString()
    const event: CalendarEvent = { ...input, id: createId('event'), title: input.title.trim(), createdAt: now, updatedAt: now }
    db.events.push(event)
    db.activities.unshift(normalizeActivity({
      id: createId('activity'), workspaceId: event.workspaceId, leadId: event.leadId, type: 'meeting', title: event.title,
      description: event.description, dueAt: event.startsAt, completedAt: event.status === 'completed' || event.status === 'cancelled' ? now : null,
      assignedTo: event.assignedTo, sourceType: 'calendar', sourceId: event.id, createdAt: now, updatedAt: now,
    }))
    syncLeadNextAction(db, event.leadId); writeDatabase(db); return clone(event)
  }

  async updateCalendarEvent(eventId: string, input: UpdateCalendarEventInput) {
    const db = readDatabase(); const index = db.events.findIndex((item) => item.id === eventId)
    if (index < 0) throw new Error('Compromisso não encontrado.')
    const previousLead = db.events[index].leadId; const next = { ...db.events[index], ...input, updatedAt: new Date().toISOString() }
    if (!next.title.trim()) throw new Error('Informe o título do compromisso.')
    if (new Date(next.endsAt).getTime() < new Date(next.startsAt).getTime()) throw new Error('O término deve ser posterior ao início.')
    db.events[index] = next
    const activityIndex = db.activities.findIndex((activity) => activity.sourceType === 'calendar' && activity.sourceId === eventId)
    const activityData: Partial<ActivityItem> = {
      workspaceId: next.workspaceId, leadId: next.leadId, type: 'meeting', title: next.title, description: next.description,
      dueAt: next.startsAt, completedAt: next.status === 'completed' || next.status === 'cancelled' ? new Date().toISOString() : null,
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
    const product: ProductRecord = { ...input, id: createId('product'), name: input.name.trim(), sku: input.sku.trim(), unitPrice: Math.max(0, Number(input.unitPrice || 0)), taxRate: Math.max(0, Number(input.taxRate || 0)), createdAt: now, updatedAt: now }
    db.products.unshift(product); writeDatabase(db); return clone(product)
  }

  async updateProduct(productId: string, input: UpdateProductInput) {
    const db = readDatabase(); const index = db.products.findIndex((item) => item.id === productId)
    if (index < 0) throw new Error('Produto não encontrado.')
    const current = db.products[index]
    const next: ProductRecord = { ...current, ...input, name: input.name?.trim() || current.name, sku: input.sku !== undefined ? input.sku.trim() : current.sku, unitPrice: input.unitPrice !== undefined ? Math.max(0, Number(input.unitPrice)) : current.unitPrice, taxRate: input.taxRate !== undefined ? Math.max(0, Number(input.taxRate)) : current.taxRate, updatedAt: new Date().toISOString() }
    db.products[index] = next; writeDatabase(db); return clone(next)
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
    if (!input.items.length) throw new Error('Adicione pelo menos um item à proposta.')
    const now = new Date().toISOString()
    const groupId = input.proposalGroupId || createId('proposal-group')
    const proposalId = createId('proposal')
    const hasOfficial = db.proposals.some((item) => item.workspaceId === input.workspaceId && item.leadId === input.leadId && item.isOfficial && item.isCurrentVersion && !['rejected', 'expired', 'cancelled'].includes(item.status))
    const proposal = normalizeProposal({
      ...input,
      id: proposalId,
      proposalGroupId: groupId,
      version: input.version ?? 1,
      proposalNumber: input.proposalNumber || proposalSequence(db, input.workspaceId),
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
      for (const item of db.proposals) if (item.leadId === proposal.leadId && item.isOfficial) item.isOfficial = false
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
    const now = new Date().toISOString()
    const next = normalizeProposal({
      ...current,
      ...input,
      probability: input.probability !== undefined ? Math.min(100, Math.max(0, Number(input.probability))) : current.probability,
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
      for (const item of db.proposals) if (item.leadId === proposal.leadId && item.isOfficial) item.isOfficial = false
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
      if (proposalStage && lead.status === 'active') lead.stageId = proposalStage.id
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
      db.activities.unshift(normalizeActivity({ id: createId('activity'), workspaceId: proposal.workspaceId, leadId: lead.id, type: 'note', title: `Aceite registrado — ${proposal.proposalNumber}`, description: `TCV: ${proposal.totalContractValue.toFixed(2)} · MRR: ${proposal.recurringMonthlyTotal.toFixed(2)}. Aguardando fechamento comercial e reconhecimento por competência.`, dueAt: null, completedAt: now, assignedTo: proposal.ownerId, sourceType: 'system', sourceId: proposal.id, createdAt: now, updatedAt: now }))
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
    const lead = db.leads.find((item) => item.id === proposal.leadId)
    if (lead) {
      if (won) lead.stageId = won.id
      lead.status = 'won'
      lead.value = proposal.totalContractValue
      lead.updatedAt = now
    }
    const opportunity = db.opportunities.find((item) => item.id === proposal.opportunityId || item.leadId === proposal.leadId)
    if (opportunity) {
      if (won) opportunity.stageId = won.id
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

  async listRevenueEntries(workspaceId: string) { return clone(readDatabase().revenueEntries.filter((item) => item.workspaceId === workspaceId).sort((a, b) => new Date(b.recognizedAt).getTime() - new Date(a.recognizedAt).getTime())) }

  async createRevenueEntry(input: NewRevenueEntryInput) {
    const db = readDatabase()
    const now = new Date().toISOString()
    const entry: RevenueEntry = {
      ...input,
      id: createId('revenue'),
      amount: Math.max(0, Number(input.amount || 0)),
      recurringMonthlyAmount: Math.max(0, Number(input.recurringMonthlyAmount || 0)),
      competenceDate: input.competenceDate || input.recognizedAt.slice(0, 10),
      servicePeriodStart: input.servicePeriodStart ?? null,
      servicePeriodEnd: input.servicePeriodEnd ?? null,
      adjustmentReason: input.adjustmentReason?.trim() ?? '',
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
    if (input.targetValue <= 0) throw new Error('A meta deve ser maior que zero.')
    if (input.periodEnd < input.periodStart) throw new Error('O fim do período deve ser posterior ao início.')
    const db = readDatabase(); const now = new Date().toISOString()
    const duplicate = db.goals.some((goal) => goal.workspaceId === input.workspaceId && goal.userId === input.userId && goal.metric === input.metric && goal.periodStart === input.periodStart && goal.periodEnd === input.periodEnd)
    if (duplicate) throw new Error('Já existe uma meta igual para este período.')
    const goal: Goal = { ...input, id: createId('goal'), createdAt: now, updatedAt: now }
    db.goals.unshift(goal); writeDatabase(db); return clone(goal)
  }

  async updateGoal(goalId: string, input: UpdateGoalInput) {
    const db = readDatabase(); const index = db.goals.findIndex((goal) => goal.id === goalId)
    if (index < 0) throw new Error('Meta não encontrada.')
    const next: Goal = { ...db.goals[index], ...input, updatedAt: new Date().toISOString() }
    if (next.targetValue <= 0) throw new Error('A meta deve ser maior que zero.')
    if (next.periodEnd < next.periodStart) throw new Error('O fim do período deve ser posterior ao início.')
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
    const rule: AutomationRule = { ...input, id: createId('rule'), name: input.name.trim(), createdAt: now, updatedAt: now }
    db.automationRules.unshift(rule); writeDatabase(db); return clone(rule)
  }

  async updateAutomationRule(ruleId: string, input: UpdateAutomationRuleInput) {
    const db = readDatabase(); const index = db.automationRules.findIndex((rule) => rule.id === ruleId)
    if (index < 0) throw new Error('Automação não encontrada.')
    const next: AutomationRule = { ...db.automationRules[index], ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}), updatedAt: new Date().toISOString() }
    if (!next.name) throw new Error('Informe o nome da automação.')
    if (!next.actions.length) throw new Error('Adicione pelo menos uma ação.')
    db.automationRules[index] = next; writeDatabase(db); return clone(next)
  }

  async deleteAutomationRule(ruleId: string) {
    const db = readDatabase(); db.automationRules = db.automationRules.filter((rule) => rule.id !== ruleId)
    db.automationRuns = db.automationRuns.map((run) => run.ruleId === ruleId ? { ...run, ruleId: null } : run); writeDatabase(db)
  }

  async listAutomationRuns(workspaceId: string) { return clone(readDatabase().automationRuns.filter((run) => run.workspaceId === workspaceId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())) }

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
    const db = readDatabase(); const stageIds = new Set(db.stages.filter((stage) => stage.workspaceId === workspaceId).map((stage) => stage.id)); const fallbackStage = db.stages.find((stage) => stage.workspaceId === workspaceId)?.id
    if (!fallbackStage) throw new Error('O workspace não possui etapas.')
    const existing = new Set(db.leads.filter((lead) => lead.workspaceId === workspaceId).map((lead) => lead.id)); let count = 0
    leads.forEach((lead) => { const id = existing.has(lead.id) ? createId('lead') : lead.id; db.leads.push({ ...lead, id, workspaceId, stageId: stageIds.has(lead.stageId) ? lead.stageId : fallbackStage, updatedAt: new Date().toISOString() }); count += 1 })
    synchronizeStructureInDatabase(db, workspaceId); writeDatabase(db); return count
  }
}
