import { DEMO_ACTIVITIES, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_RUNS, DEMO_CALLS, DEMO_COMPANIES, DEMO_CONTACTS, DEMO_CONTACT_RELATIONSHIPS, DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PLAYBOOKS, DEMO_PRODUCTS, DEMO_PROPOSALS, DEMO_REVENUE_ENTRIES, DEMO_SOCIAL_PROFILES, DEMO_WORKSPACE, DEFAULT_STAGES } from '../domain/defaults'
import type {
  ActivityItem, AuditLog, AutomationRule, AutomationRun, AutomationRunOutput, AutomationRunStatus, BuyerRoom, CalendarEvent, CallRecord, CommercialStructureSyncResult, CompanyRecord, ContactRecord, ContactRelationship, DashboardStats, Goal, Lead, OpportunityRecord, PipelineStage, Playbook, ProductRecord, ProposalLineItem, ProposalRecord, ProposalStatus, RevenueEntry, RepositoryHealth, SocialProfile, Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceSnapshot,
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
  CommercialActionResult, CommercialActivityResult, CrmRepository, NewActivityInput, NewAutomationRuleInput, NewAutomationRunInput, NewCalendarEventInput, NewCallInput, NewContactInput, NewContactRelationshipInput, NewGoalInput, NewLeadInput, NewPlaybookInput, NewProductInput, NewProposalInput, NewRevenueEntryInput, NewStageInput, RegisterActivityOutcomeInput, RegisterCallOutcomeInput,
  UpdateActivityInput, UpdateAutomationRuleInput, UpdateCalendarEventInput, UpdateContactInput, UpdateContactRelationshipInput, UpdateGoalInput, UpdateLeadInput, UpdatePlaybookInput, UpdateProductInput, UpdateProposalInput, UpdateStageInput,
} from './crm-repository'

export const LOCAL_DATABASE_STORAGE_KEY = 'realtalent-crm-v100-local'
export const STORAGE_KEY = LOCAL_DATABASE_STORAGE_KEY
export const CORRUPT_BACKUP_PREFIX = 'realtalent-crm-v100-corrupt-backup:'
export const recordingUrlCache = new Map<string, string>()

export interface LocalDatabase {
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
  contactRelationships: ContactRelationship[]
  opportunities: OpportunityRecord[]
  socialProfiles: SocialProfile[]
  products: ProductRecord[]
  proposals: ProposalRecord[]
  buyerRooms: BuyerRoom[]
  revenueEntries: RevenueEntry[]
  members: WorkspaceMember[]
  invites: WorkspaceInvite[]
  auditLogs: AuditLog[]
}

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
export const DEMO_REFERENCE_NOW = new Date('2026-07-16T15:00:00.000Z')

export const shiftIso = (value: string | null, offsetMs: number) => {
  if (!value) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Date(date.getTime() + offsetMs).toISOString()
}

export const rebaseDemoDates = (db: LocalDatabase, reference = new Date()): LocalDatabase => {
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
  db.contacts.forEach((item) => { item.lastContactAt = shiftIso(item.lastContactAt ?? null, offsetMs); item.nextActionAt = shiftIso(item.nextActionAt ?? null, offsetMs); item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.contactRelationships.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.opportunities.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.socialProfiles.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)!; item.lastCheckedAt = shiftIso(item.lastCheckedAt, offsetMs) })
  db.products.forEach((item) => { item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.proposals.forEach((item) => { item.validUntil = shiftIso(item.validUntil ? `${item.validUntil}T12:00:00.000Z` : null, offsetMs)?.slice(0, 10) ?? null; item.sentAt = shiftIso(item.sentAt, offsetMs); item.viewedAt = shiftIso(item.viewedAt, offsetMs); item.acceptedAt = shiftIso(item.acceptedAt, offsetMs); item.rejectedAt = shiftIso(item.rejectedAt, offsetMs); item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
  db.buyerRooms.forEach((item) => { item.expiresAt = shiftIso(item.expiresAt, offsetMs); item.lastOpenedAt = shiftIso(item.lastOpenedAt, offsetMs); item.steps = item.steps.map((step) => ({ ...step, dueAt: shiftIso(step.dueAt, offsetMs), completedAt: shiftIso(step.completedAt, offsetMs) })); item.documents = item.documents.map((doc) => ({ ...doc, addedAt: shiftIso(doc.addedAt, offsetMs)! })); item.activity = item.activity.map((event) => ({ ...event, occurredAt: shiftIso(event.occurredAt, offsetMs)! })); item.createdAt = shiftIso(item.createdAt, offsetMs)!; item.updatedAt = shiftIso(item.updatedAt, offsetMs)! })
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

export const seedDatabase = (): LocalDatabase => rebaseDemoDates({
  workspaces: [clone(DEMO_WORKSPACE)], stages: clone(DEFAULT_STAGES), leads: clone(DEMO_LEADS),
  activities: clone(DEMO_ACTIVITIES), calls: clone(DEMO_CALLS), events: clone(DEMO_EVENTS), playbooks: clone(DEMO_PLAYBOOKS),
  goals: clone(DEMO_GOALS), automationRules: clone(DEMO_AUTOMATION_RULES), automationRuns: clone(DEMO_AUTOMATION_RUNS),
  companies: clone(DEMO_COMPANIES), contacts: clone(DEMO_CONTACTS), contactRelationships: clone(DEMO_CONTACT_RELATIONSHIPS), opportunities: clone(DEMO_OPPORTUNITIES), socialProfiles: clone(DEMO_SOCIAL_PROFILES),
  products: clone(DEMO_PRODUCTS), proposals: clone(DEMO_PROPOSALS), buyerRooms: [], revenueEntries: clone(DEMO_REVENUE_ENTRIES),
  members: [{ workspaceId: DEMO_WORKSPACE.id, userId: 'local-user', displayName: 'Usuário Demo', email: 'demo@realtalent.local', avatarUrl: null, role: 'owner', joinedAt: DEMO_WORKSPACE.createdAt }],
  invites: [], auditLogs: [],
})

export const slugify = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'

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
      leads: [], activities: [], calls: [], events: [], playbooks: [], goals: [], automationRules: [], automationRuns: [], companies: [], contacts: [], contactRelationships: [], opportunities: [], socialProfiles: [], products: [], proposals: [], buyerRooms: [], revenueEntries: [],
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
    db.contacts.forEach((item) => { item.workspaceId = workspaceId; if (item.relationshipOwnerId) item.relationshipOwnerId = userId; if (item.relationshipOwnerName) item.relationshipOwnerName = displayName })
    db.contactRelationships.forEach((item) => { item.workspaceId = workspaceId })
    db.opportunities.forEach((item) => { item.workspaceId = workspaceId })
    db.socialProfiles.forEach((item) => { item.workspaceId = workspaceId })
    db.products.forEach((item) => { item.workspaceId = workspaceId })
    db.proposals.forEach((item) => { item.workspaceId = workspaceId; item.ownerId = userId })
    db.buyerRooms.forEach((item) => { item.workspaceId = workspaceId })
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

export const normalizeActivity = (activity: Partial<ActivityItem>): ActivityItem => {
  const createdAt = activity.createdAt ?? new Date().toISOString()
  return {
    id: activity.id ?? createId('activity'), workspaceId: activity.workspaceId ?? '', leadId: activity.leadId ?? null, contactId: activity.contactId ?? null,
    type: activity.type ?? 'note', title: activity.title ?? 'Atividade', description: activity.description ?? '',
    dueAt: activity.dueAt ?? null, completedAt: activity.completedAt ?? null,
    resolutionStatus: activity.resolutionStatus ?? (activity.completedAt ? 'completed' : 'pending'), resolutionReason: activity.resolutionReason ?? null,
    originEventKey: activity.originEventKey ?? null, purpose: activity.purpose ?? null, assignedTo: activity.assignedTo ?? null,
    sourceType: activity.sourceType ?? 'manual', sourceId: activity.sourceId ?? null,
    createdAt, updatedAt: activity.updatedAt ?? createdAt,
  }
}

export const readDatabase = (): LocalDatabase => {
  const raw = safeStorage.getItem(STORAGE_KEY)
  if (!raw) return seedDatabase()
  try {
    const parsed = JSON.parse(raw) as Partial<LocalDatabase>
    return {
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      stages: Array.isArray(parsed.stages) ? parsed.stages : [],
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities.map(normalizeActivity) : [],
      calls: Array.isArray(parsed.calls) ? parsed.calls.map((item) => ({ ...item, contactId: item.contactId ?? parsed.leads?.find((lead) => lead.id === item.leadId)?.primaryContactId ?? null })) : [],
      events: Array.isArray(parsed.events) ? parsed.events.map((item) => ({ ...item, contactId: item.contactId ?? (item.leadId ? parsed.leads?.find((lead) => lead.id === item.leadId)?.primaryContactId ?? null : null) })) : [],
      playbooks: Array.isArray(parsed.playbooks) ? parsed.playbooks : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      automationRules: Array.isArray(parsed.automationRules) ? parsed.automationRules : [],
      automationRuns: Array.isArray(parsed.automationRuns) ? parsed.automationRuns : [],
      companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts.map((item) => ({ ...item, relationshipStrength: item.relationshipStrength ?? 'unknown', relationshipScore: Number(item.relationshipScore ?? 0), stance: item.stance ?? 'unknown', relationshipOwnerId: item.relationshipOwnerId ?? null, relationshipOwnerName: item.relationshipOwnerName ?? '', lastContactAt: item.lastContactAt ?? null, nextActionAt: item.nextActionAt ?? null, notes: item.notes ?? '', isPrimary: Boolean(item.isPrimary) })) : [],
      contactRelationships: Array.isArray(parsed.contactRelationships) ? parsed.contactRelationships : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      socialProfiles: Array.isArray(parsed.socialProfiles) ? parsed.socialProfiles : [],
      products: Array.isArray(parsed.products) ? parsed.products.map((item) => ({ ...item, pricingMode: item.pricingMode ?? 'fixed', lifecycleStatus: item.lifecycleStatus ?? (item.active ? 'active' : 'archived'), salesProblems: item.salesProblems ?? [], salesBenefits: item.salesBenefits ?? [], discoveryQuestions: item.discoveryQuestions ?? [], objectionNotes: item.objectionNotes ?? [], salesProofs: item.salesProofs ?? [], competitors: item.competitors ?? [], bundleItems: item.bundleItems ?? [] })) : [],
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals.map((item) => normalizeProposal(item as ProposalRecord)) : [],
      buyerRooms: Array.isArray(parsed.buyerRooms) ? parsed.buyerRooms : [],
      revenueEntries: Array.isArray(parsed.revenueEntries) ? parsed.revenueEntries.map((item) => ({ ...item, competenceDate: item.competenceDate ?? item.recognizedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), servicePeriodStart: item.servicePeriodStart ?? null, servicePeriodEnd: item.servicePeriodEnd ?? null, adjustmentReason: item.adjustmentReason ?? '', source: item.source ?? 'manual', scheduleKey: item.scheduleKey ?? null, installmentIndex: item.installmentIndex ?? null, installmentCount: item.installmentCount ?? null })) : [],
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

export const writeDatabase = (db: LocalDatabase) => safeStorage.setItem(STORAGE_KEY, JSON.stringify(db))
export const todayKey = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`
export const stageStatus = (stage: PipelineStage): Lead['status'] => stage.isWon ? 'won' : stage.isLost ? 'lost' : 'active'

export const finiteNumber = (value: unknown, fallback = 0) => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}
export const clampNumber = (value: unknown, min: number, max: number, fallback = min) => Math.min(max, Math.max(min, finiteNumber(value, fallback)))
export const isValidDateValue = (value: string | null | undefined) => !value || !Number.isNaN(new Date(value).getTime())
export const isValidDateOnly = (value: string | null | undefined) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00.000Z`).getTime())
export const assertDateTime = (value: string | null | undefined, label: string) => { if (!isValidDateValue(value)) throw new Error(`${label} inválida.`) }
export const assertDateOnly = (value: string | null | undefined, label: string) => { if (!isValidDateOnly(value)) throw new Error(`${label} inválida.`) }
export const assertDateRange = (start: string, end: string) => {
  assertDateTime(start, 'Data de início')
  assertDateTime(end, 'Data de término')
  if (new Date(end).getTime() <= new Date(start).getTime()) throw new Error('O término deve ser posterior ao início.')
}
export const normalizedTags = (tags: string[]) => Array.from(new Map(tags.map((tag) => tag.trim()).filter(Boolean).map((tag) => [tag.toLocaleLowerCase('pt-BR'), tag])).values()).slice(0, 50)

const normalizedIdentityEmail = (value: string) => value.trim().toLocaleLowerCase('pt-BR')
const identityPatchTouches = (input: UpdateLeadInput | UpdateContactInput) => [
  'name', 'phone', 'email', 'jobTitle', 'decisionRole', 'influenceLevel', 'consentStatus', 'doNotContact', 'doNotContactReason',
].some((key) => (input as Record<string, unknown>)[key] !== undefined)

const reconcilePrimaryIdentity = (lead: Lead, contact: ContactRecord) => {
  const latestUpdatedAt = [lead.updatedAt, contact.updatedAt].filter(Boolean).sort().at(-1) ?? contact.updatedAt
  const merged = {
    name: contact.name.trim() || lead.name,
    phone: contact.phone.trim() ? contact.phone : lead.phone,
    email: normalizedIdentityEmail(contact.email.trim() ? contact.email : lead.email),
    jobTitle: contact.jobTitle.trim() ? contact.jobTitle : lead.jobTitle ?? '',
    decisionRole: contact.decisionRole !== 'unknown' ? contact.decisionRole : lead.decisionRole ?? 'unknown',
    influenceLevel: contact.influenceLevel > 0 ? contact.influenceLevel : clampNumber(lead.influenceLevel, 0, 100, 0),
    consentStatus: contact.consentStatus !== 'unknown' ? contact.consentStatus : lead.consentStatus ?? 'unknown',
    doNotContact: Boolean(contact.doNotContact || lead.doNotContact),
    doNotContactReason: contact.doNotContactReason.trim() || (lead.doNotContactReason ?? ''),
  }
  let contactChanged = false
  const setContact = <K extends keyof ContactRecord>(key: K, value: ContactRecord[K]) => { if (contact[key] !== value) { contact[key] = value; contactChanged = true } }
  setContact('name', merged.name); setContact('phone', merged.phone); setContact('email', merged.email); setContact('jobTitle', merged.jobTitle); setContact('decisionRole', merged.decisionRole)
  setContact('influenceLevel', merged.influenceLevel); setContact('consentStatus', merged.consentStatus); setContact('doNotContact', merged.doNotContact); setContact('doNotContactReason', merged.doNotContactReason)
  if (!contact.leadIds.includes(lead.id)) { contact.leadIds = [...contact.leadIds, lead.id]; contactChanged = true }
  if (contactChanged) contact.updatedAt = latestUpdatedAt
  const leadChanged = lead.name !== merged.name || lead.phone !== merged.phone || lead.email !== merged.email || (lead.jobTitle ?? '') !== merged.jobTitle ||
    (lead.decisionRole ?? 'unknown') !== merged.decisionRole || (lead.influenceLevel ?? 0) !== merged.influenceLevel || (lead.consentStatus ?? 'unknown') !== merged.consentStatus ||
    Boolean(lead.doNotContact) !== merged.doNotContact || (lead.doNotContactReason ?? '') !== merged.doNotContactReason
  if (leadChanged) Object.assign(lead, merged, { updatedAt: latestUpdatedAt })
  return contactChanged || leadChanged
}

const applyContactIdentityToLead = (lead: Lead, contact: ContactRecord, updatedAt = contact.updatedAt) => {
  const next = {
    name: contact.name.trim() || lead.name,
    phone: contact.phone,
    email: normalizedIdentityEmail(contact.email),
    jobTitle: contact.jobTitle,
    decisionRole: contact.decisionRole,
    influenceLevel: clampNumber(contact.influenceLevel, 0, 100, lead.influenceLevel ?? 0),
    consentStatus: contact.consentStatus,
    doNotContact: contact.doNotContact,
    doNotContactReason: contact.doNotContactReason,
  }
  const changed = lead.name !== next.name || lead.phone !== next.phone || lead.email !== next.email || (lead.jobTitle ?? '') !== next.jobTitle ||
    (lead.decisionRole ?? 'unknown') !== next.decisionRole || (lead.influenceLevel ?? 0) !== next.influenceLevel || (lead.consentStatus ?? 'unknown') !== next.consentStatus ||
    Boolean(lead.doNotContact) !== next.doNotContact || (lead.doNotContactReason ?? '') !== next.doNotContactReason
  if (!changed) return false
  Object.assign(lead, next, { updatedAt })
  return true
}

export const syncLeadIdentityToPrimaryContact = (db: LocalDatabase, lead: Lead, input?: UpdateLeadInput) => {
  if (input && !identityPatchTouches(input)) return false
  if (!lead.primaryContactId) return false
  const contact = db.contacts.find((item) => item.id === lead.primaryContactId && item.workspaceId === lead.workspaceId)
  if (!contact) return false
  const should = (key: keyof UpdateLeadInput) => input === undefined || input[key] !== undefined
  let changed = false
  const set = <K extends keyof ContactRecord>(key: K, value: ContactRecord[K]) => {
    if (contact[key] === value) return
    contact[key] = value
    changed = true
  }
  if (should('name')) set('name', lead.name.trim() || contact.name)
  if (should('phone')) set('phone', lead.phone)
  if (should('email')) set('email', normalizedIdentityEmail(lead.email))
  if (should('jobTitle') && lead.jobTitle !== undefined) set('jobTitle', lead.jobTitle)
  if (should('decisionRole') && lead.decisionRole !== undefined) set('decisionRole', lead.decisionRole)
  if (should('influenceLevel') && lead.influenceLevel !== undefined) set('influenceLevel', clampNumber(lead.influenceLevel, 0, 100, contact.influenceLevel))
  if (should('consentStatus') && lead.consentStatus !== undefined) set('consentStatus', lead.consentStatus)
  if (should('doNotContact') && lead.doNotContact !== undefined) set('doNotContact', Boolean(lead.doNotContact))
  if (should('doNotContactReason') && lead.doNotContactReason !== undefined) set('doNotContactReason', lead.doNotContactReason)
  if (!contact.leadIds.includes(lead.id)) { contact.leadIds = [...contact.leadIds, lead.id]; changed = true }
  if (changed) contact.updatedAt = lead.updatedAt
  return changed
}

export const syncContactIdentityToPrimaryLeads = (db: LocalDatabase, contact: ContactRecord, input?: UpdateContactInput) => {
  if (input && !identityPatchTouches(input)) return 0
  let count = 0
  for (const lead of db.leads) {
    if (lead.workspaceId !== contact.workspaceId || lead.primaryContactId !== contact.id) continue
    if (applyContactIdentityToLead(lead, contact)) count += 1
  }
  return count
}


const companyProjectionKeys: Array<keyof UpdateLeadInput> = ['company', 'cnpj', 'website', 'city', 'state']
const opportunityProjectionKeys: Array<keyof UpdateLeadInput> = ['stageId', 'status', 'value', 'ownerId', 'expectedCloseAt', 'companyId', 'primaryContactId']
const patchTouches = (input: UpdateLeadInput | undefined, keys: Array<keyof UpdateLeadInput>) => !input || keys.some((key) => input[key] !== undefined)

/**
 * V101.9.3: a UI ainda escreve através de Lead, mas Empresa e Oportunidade são
 * as autoridades canônicas. Este bridge encaminha somente os campos que pertencem
 * a cada autoridade antes da reconciliação estrutural.
 */
export const syncLeadCommercialProjectionToCanonicalRecords = (db: LocalDatabase, lead: Lead, input?: UpdateLeadInput) => {
  let companyChanged = false
  let opportunityChanged = false
  const now = lead.updatedAt || new Date().toISOString()

  const company = lead.companyId ? db.companies.find((item) => item.id === lead.companyId && item.workspaceId === lead.workspaceId) : null
  if (company && patchTouches(input, companyProjectionKeys)) {
    const should = (key: keyof UpdateLeadInput) => !input || input[key] !== undefined
    const assign = <K extends keyof CompanyRecord>(key: K, value: CompanyRecord[K]) => {
      if (company[key] === value) return
      company[key] = value
      companyChanged = true
    }
    if (should('company') && lead.company.trim()) assign('name', lead.company.trim())
    if (should('cnpj')) assign('cnpj', lead.cnpj ?? '')
    if (should('website')) assign('website', lead.website ?? '')
    if (should('city')) assign('city', lead.city)
    if (should('state')) assign('state', lead.state ?? '')
    if (companyChanged) company.updatedAt = now
  }

  const opportunity = db.opportunities.find((item) => item.workspaceId === lead.workspaceId && (item.id === lead.opportunityId || item.leadId === lead.id)) ?? null
  if (opportunity && patchTouches(input, opportunityProjectionKeys)) {
    const should = (key: keyof UpdateLeadInput) => !input || input[key] !== undefined
    const assign = <K extends keyof OpportunityRecord>(key: K, value: OpportunityRecord[K]) => {
      if (opportunity[key] === value) return
      opportunity[key] = value
      opportunityChanged = true
    }
    if (should('stageId')) {
      assign('stageId', lead.stageId)
      const stage = db.stages.find((item) => item.id === lead.stageId && item.workspaceId === lead.workspaceId)
      if (stage) {
        assign('probability', stage.probability)
        assign('forecastCategory', stage.isWon ? 'closed' : stage.isLost ? 'omitted' : opportunity.forecastCategory ?? 'pipeline')
        assign('closedWonAt', stage.isWon ? (opportunity.closedWonAt ?? now) : null)
      }
    }
    if (should('status') || should('stageId')) assign('status', lead.status)
    if (should('value')) assign('value', lead.value)
    if (should('ownerId')) assign('ownerId', lead.ownerId)
    if (should('expectedCloseAt')) assign('expectedCloseAt', lead.expectedCloseAt ?? null)
    if (should('companyId')) assign('companyId', lead.companyId ?? null)
    if (should('primaryContactId')) assign('primaryContactId', lead.primaryContactId ?? null)
    if (opportunityChanged) opportunity.updatedAt = now
  }

  return { companyChanged, opportunityChanged }
}

export const reconcileCanonicalCommercialToLead = (db: LocalDatabase, lead: Lead) => {
  const contact = lead.primaryContactId ? db.contacts.find((item) => item.id === lead.primaryContactId && item.workspaceId === lead.workspaceId) : null
  const company = lead.companyId ? db.companies.find((item) => item.id === lead.companyId && item.workspaceId === lead.workspaceId) : null
  const opportunity = db.opportunities.find((item) => item.workspaceId === lead.workspaceId && (item.id === lead.opportunityId || item.leadId === lead.id)) ?? null
  let changed = false
  if (contact) changed = applyContactIdentityToLead(lead, contact, contact.updatedAt) || changed
  const set = <K extends keyof Lead>(key: K, value: Lead[K]) => { if (lead[key] !== value) { lead[key] = value; changed = true } }
  if (company) {
    set('companyId', company.id)
    set('company', company.name.trim() || lead.company)
    set('cnpj', company.cnpj)
    set('website', company.website)
    set('city', company.city)
    set('state', company.state)
  }
  if (contact) set('primaryContactId', contact.id)
  if (opportunity) {
    set('opportunityId', opportunity.id)
    set('stageId', opportunity.stageId)
    set('status', opportunity.status)
    set('value', opportunity.value)
    set('ownerId', opportunity.ownerId)
    set('expectedCloseAt', opportunity.expectedCloseAt)
  }
  if (changed) {
    const dates = [lead.updatedAt, contact?.updatedAt, company?.updatedAt, opportunity?.updatedAt].filter((item): item is string => Boolean(item)).sort()
    lead.updatedAt = dates.at(-1) ?? lead.updatedAt
  }
  return changed
}

export const proposalItemTotals = (item: ProposalLineItem): ProposalLineItem => {
  const quantity = Math.max(0.01, finiteNumber(item.quantity, 1))
  const unitPrice = Math.max(0, finiteNumber(item.unitPrice, 0))
  const discountPercent = clampNumber(item.discountPercent, 0, 100, 0)
  const taxRate = Math.max(0, finiteNumber(item.taxRate, 0))
  const lineSubtotal = quantity * unitPrice
  const lineDiscount = lineSubtotal * discountPercent / 100
  const taxable = lineSubtotal - lineDiscount
  const lineTax = taxable * taxRate / 100
  const lineTotal = taxable + lineTax
  const recurringMonthlyTotal = item.billingType === 'recurring' ? lineTotal * (item.billingInterval === 'year' ? 1 / 12 : item.billingInterval === 'quarter' ? 1 / 3 : 1) : 0
  return { ...item, quantity, unitPrice, discountPercent, taxRate, lineSubtotal, lineDiscount, lineTax, lineTotal, recurringMonthlyTotal }
}

export const normalizeProposal = (proposal: ProposalRecord): ProposalRecord => {
  const items = proposal.items.map(proposalItemTotals)
  const oneTimeTotal = items.filter((item) => item.billingType === 'one_time').reduce((sum, item) => sum + item.lineTotal, 0)
  const recurringMonthlyTotal = items.reduce((sum, item) => sum + item.recurringMonthlyTotal, 0)
  const contractTermMonths = Math.max(1, Math.round(finiteNumber(proposal.contractTermMonths, 12)))
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

export const assertProposalValues = (proposal: Pick<ProposalRecord, 'title' | 'probability' | 'validUntil' | 'expectedCloseAt' | 'contractStartAt' | 'contractEndAt' | 'contractTermMonths' | 'postSaleStartAt' | 'items'>) => {
  if (!proposal.title.trim()) throw new Error('Informe o título da proposta.')
  if (!proposal.items.length) throw new Error('Adicione pelo menos um item à proposta.')
  if (!Number.isFinite(proposal.probability) || proposal.probability < 0 || proposal.probability > 100) throw new Error('Probabilidade da proposta inválida.')
  if (!Number.isFinite(proposal.contractTermMonths) || proposal.contractTermMonths < 1) throw new Error('Prazo contratual inválido.')
  assertDateOnly(proposal.validUntil, 'Validade da proposta')
  assertDateOnly(proposal.expectedCloseAt, 'Data prevista de fechamento')
  assertDateOnly(proposal.contractStartAt, 'Início do contrato')
  assertDateOnly(proposal.contractEndAt, 'Fim do contrato')
  assertDateOnly(proposal.postSaleStartAt, 'Início do pós-venda')
  if (proposal.contractStartAt && proposal.contractEndAt && proposal.contractEndAt < proposal.contractStartAt) throw new Error('O fim do contrato deve ser igual ou posterior ao início.')
  for (const item of proposal.items) {
    if (!item.name.trim()) throw new Error('Todos os itens da proposta precisam de nome.')
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error(`Quantidade inválida no item “${item.name || 'sem nome'}”.`)
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error(`Preço inválido no item “${item.name}”.`)
    if (!Number.isFinite(item.discountPercent) || item.discountPercent < 0 || item.discountPercent > 100) throw new Error(`Desconto inválido no item “${item.name}”.`)
    if (!Number.isFinite(item.taxRate) || item.taxRate < 0) throw new Error(`Imposto inválido no item “${item.name}”.`)
  }
}

export const proposalSequence = (db: LocalDatabase, workspaceId: string) => {
  const year = new Date().getFullYear()
  const prefix = `PROP-${year}-`
  const highest = db.proposals
    .filter((item) => item.workspaceId === workspaceId && item.proposalNumber.startsWith(prefix))
    .reduce((max, item) => Math.max(max, finiteNumber(item.proposalNumber.slice(prefix.length), 0)), 0)
  return `${prefix}${String(highest + 1).padStart(3, '0')}`
}

export const syncCommercialFromOfficialProposal = (db: LocalDatabase, leadId: string, now = new Date().toISOString()) => {
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

export const syncLeadNextAction = (db: LocalDatabase, leadId: string | null) => {
  if (!leadId) return
  const lead = db.leads.find((item) => item.id === leadId)
  if (!lead) return
  const next = db.activities
    .filter((activity) => activity.leadId === leadId && activity.dueAt && !activity.completedAt && ['followup', 'meeting', 'call'].includes(activity.type))
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())[0]
  lead.nextActionAt = next?.dueAt ?? null
  lead.updatedAt = new Date().toISOString()
}

export const assertLeadsCanBeDeleted = (db: LocalDatabase, workspaceId: string, leadIds: Set<string>) => {
  const leads = db.leads.filter((lead) => lead.workspaceId === workspaceId && leadIds.has(lead.id))
  const protectedLead = leads.find((lead) => lead.status === 'won')
  if (protectedLead) throw new Error(`O lead “${protectedLead.name}” está ganho e precisa ser arquivado, não excluído.`)
  const protectedProposal = db.proposals.find((proposal) => proposal.workspaceId === workspaceId && leadIds.has(proposal.leadId) && (proposal.status === 'accepted' || Boolean(proposal.closedWonAt)))
  if (protectedProposal) throw new Error(`A proposta ${protectedProposal.proposalNumber} possui aceite/fechamento e precisa permanecer no histórico.`)
  const protectedRevenue = db.revenueEntries.find((entry) => entry.workspaceId === workspaceId && entry.leadId && leadIds.has(entry.leadId) && entry.status !== 'cancelled')
  if (protectedRevenue) throw new Error('Há receita vinculada a um dos leads. Arquive o cadastro para preservar o histórico financeiro.')
}

export const removeLeadDependencies = (db: LocalDatabase, workspaceId: string, leadIds: Set<string>) => {
  const proposalIds = new Set(db.proposals.filter((item) => item.workspaceId === workspaceId && leadIds.has(item.leadId)).map((item) => item.id))
  const opportunityIds = new Set(db.opportunities.filter((item) => item.workspaceId === workspaceId && leadIds.has(item.leadId)).map((item) => item.id))
  db.leads = db.leads.filter((lead) => lead.workspaceId !== workspaceId || !leadIds.has(lead.id))
  db.activities = db.activities.filter((activity) => activity.workspaceId !== workspaceId || !activity.leadId || !leadIds.has(activity.leadId))
  db.calls = db.calls.filter((call) => call.workspaceId !== workspaceId || !leadIds.has(call.leadId))
  db.events = db.events.map((event) => event.workspaceId === workspaceId && event.leadId && leadIds.has(event.leadId) ? { ...event, leadId: null, contactId: null, updatedAt: new Date().toISOString() } : event)
  db.buyerRooms = db.buyerRooms.filter((room) => room.workspaceId !== workspaceId || !leadIds.has(room.leadId))
  db.proposals = db.proposals.filter((proposal) => proposal.workspaceId !== workspaceId || !leadIds.has(proposal.leadId))
  db.revenueEntries = db.revenueEntries.filter((entry) => entry.workspaceId !== workspaceId || !((entry.leadId && leadIds.has(entry.leadId)) || (entry.proposalId && proposalIds.has(entry.proposalId)) || (entry.opportunityId && opportunityIds.has(entry.opportunityId))))
  db.opportunities = db.opportunities.filter((item) => item.workspaceId !== workspaceId || !leadIds.has(item.leadId))
  db.companies = db.companies.map((item) => item.workspaceId === workspaceId ? { ...item, leadIds: item.leadIds.filter((id) => !leadIds.has(id)) } : item)
  db.contacts = db.contacts.map((item) => item.workspaceId === workspaceId ? { ...item, leadIds: item.leadIds.filter((id) => !leadIds.has(id)) } : item)
  synchronizeStructureInDatabase(db, workspaceId)
}


export const synchronizeStructureInDatabase = (db: LocalDatabase, workspaceId: string): CommercialStructureSyncResult => {
  const validLeadIds = new Set(db.leads.filter((lead) => lead.workspaceId === workspaceId).map((lead) => lead.id))
  db.companies = db.companies.map((item) => item.workspaceId === workspaceId ? { ...item, leadIds: item.leadIds.filter((id) => validLeadIds.has(id)) } : item)
  db.contacts = db.contacts.map((item) => item.workspaceId === workspaceId ? { ...item, leadIds: item.leadIds.filter((id) => validLeadIds.has(id)) } : item)
  // Oportunidades são sempre dependentes de lead. Empresas e contatos, porém, também podem ser
  // cadastrados manualmente e devem sobreviver mesmo antes de receberem um vínculo comercial.
  db.opportunities = db.opportunities.filter((item) => item.workspaceId !== workspaceId || validLeadIds.has(item.leadId))
  const validCompanyIds = new Set(db.companies.filter((item) => item.workspaceId === workspaceId).map((item) => item.id))
  const validContactIds = new Set(db.contacts.filter((item) => item.workspaceId === workspaceId).map((item) => item.id))
  db.contactRelationships = db.contactRelationships.filter((item) => item.workspaceId !== workspaceId || (validContactIds.has(item.fromContactId) && validContactIds.has(item.toContactId)))
  db.socialProfiles = db.socialProfiles.filter((item) => item.workspaceId !== workspaceId || (item.entityType === 'company' ? validCompanyIds.has(item.entityId) : validContactIds.has(item.entityId)))
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
    const contact = db.contacts.find((item) => item.id === link.contactId && item.workspaceId === workspaceId)
    if (contact) reconcilePrimaryIdentity(lead, contact)
    reconcileCanonicalCommercialToLead(db, lead)
  }
  return {
    companiesCreated: Math.max(0, db.companies.length - before.companies), contactsCreated: Math.max(0, db.contacts.length - before.contacts),
    opportunitiesCreated: Math.max(0, db.opportunities.length - before.opportunities), socialProfilesCreated: Math.max(0, db.socialProfiles.length - before.socialProfiles), leadsLinked,
  }
}

export const assertAutomationActions = (db: LocalDatabase, workspaceId: string, actions: AutomationRule['actions']) => {
  const ids = new Set<string>()
  for (const action of actions) {
    if (!action.id?.trim()) throw new Error('Cada ação da automação precisa de um identificador.')
    if (ids.has(action.id)) throw new Error('A automação possui ações duplicadas.')
    ids.add(action.id)
    if (action.type === 'move_stage' && !db.stages.some((stage) => stage.id === action.value && stage.workspaceId === workspaceId)) throw new Error('Uma ação da automação aponta para uma etapa inexistente neste workspace.')
    if (action.delayDays !== undefined && (!Number.isFinite(action.delayDays) || action.delayDays < 0)) throw new Error('Atraso em dias inválido na automação.')
    if (action.delayHours !== undefined && (!Number.isFinite(action.delayHours) || action.delayHours < 0)) throw new Error('Atraso em horas inválido na automação.')
    if (action.durationMinutes !== undefined && (!Number.isFinite(action.durationMinutes) || action.durationMinutes <= 0)) throw new Error('Duração inválida na automação.')
  }
}

