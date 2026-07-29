import type {
  ConsentStatus,
  DecisionRole,
  GeocodePrecision,
  GeocodeStatus,
  Lead,
  LeadPriority,
  LeadStatus,
  LeadTemperature,
  PipelineStage,
  Workspace,
  WorkspaceSnapshot,
} from '../domain/types'

const asString = (value: unknown, fallback = '') => typeof value === 'string' ? value : value == null ? fallback : String(value)
const asNullableString = (value: unknown) => {
  const next = asString(value).trim()
  return next || null
}
const asFiniteNumber = (value: unknown, fallback = 0) => {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}
const asNullableFiniteNumber = (value: unknown) => {
  if (value == null || value === '') return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}
const asStringArray = (value: unknown) => Array.isArray(value)
  ? value.map((item) => asString(item).trim()).filter(Boolean)
  : typeof value === 'string'
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : []
const validDate = (value: unknown, fallback: string) => {
  const text = asString(value)
  return text && Number.isFinite(new Date(text).getTime()) ? text : fallback
}
const validNullableDate = (value: unknown) => {
  const text = asNullableString(value)
  return text && Number.isFinite(new Date(text).getTime()) ? text : null
}
const arrayOrEmpty = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : []

const statusValues: LeadStatus[] = ['active', 'won', 'lost', 'archived']
const temperatureValues: LeadTemperature[] = ['cold', 'warm', 'hot']
const priorityValues: LeadPriority[] = ['low', 'medium', 'high', 'urgent']
const consentValues: ConsentStatus[] = ['unknown', 'legitimate_interest', 'consented', 'opted_out']
const decisionValues: DecisionRole[] = ['decision_maker', 'influencer', 'user', 'unknown']
const geocodeStatusValues: GeocodeStatus[] = ['pending', 'exact', 'approximate', 'incomplete', 'not_found', 'manual']
const geocodePrecisionValues: GeocodePrecision[] = ['rooftop', 'range_interpolated', 'street', 'district', 'city', 'manual', 'unknown']

const normalizeWorkspace = (input: unknown): Workspace => {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const now = new Date().toISOString()
  const role = ['owner', 'admin', 'member', 'viewer'].includes(asString(raw.role))
    ? asString(raw.role) as Workspace['role']
    : 'member'
  return {
    id: asString(raw.id, 'workspace-unavailable'),
    name: asString(raw.name, 'Workspace').trim() || 'Workspace',
    slug: asString(raw.slug, 'workspace'),
    role,
    createdAt: validDate(raw.createdAt, now),
  }
}

const normalizeStage = (input: unknown, workspaceId: string, index: number): PipelineStage => {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return {
    id: asString(raw.id, `stage-${index + 1}`),
    workspaceId: asString(raw.workspaceId, workspaceId),
    name: asString(raw.name, `Etapa ${index + 1}`).trim() || `Etapa ${index + 1}`,
    order: Math.max(0, Math.round(asFiniteNumber(raw.order, index))),
    color: asString(raw.color, '#64748b'),
    probability: Math.max(0, Math.min(100, asFiniteNumber(raw.probability))),
    isWon: Boolean(raw.isWon),
    isLost: Boolean(raw.isLost),
  }
}

/**
 * Protege a interface contra registros antigos, importações incompletas e
 * colunas nulas que poderiam interromper uma página inteira durante o render.
 */
export const normalizeLeadForRender = (input: Lead, fallbackStageId = '', fallbackWorkspaceId = ''): Lead => {
  const raw = (input && typeof input === 'object' ? input : {}) as Lead & Record<string, unknown>
  const now = new Date().toISOString()
  const status = statusValues.includes(raw.status as LeadStatus) ? raw.status as LeadStatus : 'active'
  const temperature = temperatureValues.includes(raw.temperature as LeadTemperature) ? raw.temperature as LeadTemperature : 'cold'
  const priority = priorityValues.includes(raw.priority as LeadPriority) ? raw.priority as LeadPriority : 'medium'
  const consentStatus = consentValues.includes(raw.consentStatus as ConsentStatus) ? raw.consentStatus as ConsentStatus : 'unknown'
  const decisionRole = decisionValues.includes(raw.decisionRole as DecisionRole) ? raw.decisionRole as DecisionRole : 'unknown'
  const geocodeStatus = geocodeStatusValues.includes(raw.geocodeStatus as GeocodeStatus) ? raw.geocodeStatus as GeocodeStatus : undefined
  const geocodePrecision = geocodePrecisionValues.includes(raw.geocodePrecision as GeocodePrecision) ? raw.geocodePrecision as GeocodePrecision : undefined
  return {
    ...input,
    id: asString(raw.id),
    workspaceId: asString(raw.workspaceId, fallbackWorkspaceId),
    name: asString(raw.name, 'Lead sem nome').trim() || 'Lead sem nome',
    company: asString(raw.company),
    phone: asString(raw.phone),
    email: asString(raw.email),
    city: asString(raw.city),
    source: asString(raw.source),
    stageId: asString(raw.stageId, fallbackStageId) || fallbackStageId,
    status,
    temperature,
    priority,
    ownerId: asNullableString(raw.ownerId),
    ownerName: asString(raw.ownerName),
    value: Math.max(0, asFiniteNumber(raw.value)),
    nextActionAt: validNullableDate(raw.nextActionAt),
    lastContactAt: validNullableDate(raw.lastContactAt),
    expectedCloseAt: validNullableDate(raw.expectedCloseAt),
    notes: asString(raw.notes),
    tags: [...new Set(asStringArray(raw.tags))],
    createdAt: validDate(raw.createdAt, now),
    updatedAt: validDate(raw.updatedAt, validDate(raw.createdAt, now)),
    postalCode: asString(raw.postalCode),
    street: asString(raw.street),
    addressNumber: asString(raw.addressNumber),
    complement: asString(raw.complement),
    district: asString(raw.district),
    state: asString(raw.state),
    country: asString(raw.country),
    formattedAddress: asString(raw.formattedAddress),
    latitude: asNullableFiniteNumber(raw.latitude),
    longitude: asNullableFiniteNumber(raw.longitude),
    geocodeStatus,
    geocodePrecision,
    geocodeProvider: asNullableString(raw.geocodeProvider),
    geocodePlaceId: asNullableString(raw.geocodePlaceId),
    geocodedAt: validNullableDate(raw.geocodedAt),
    geocodeError: asNullableString(raw.geocodeError),
    sourceDetail: asString(raw.sourceDetail),
    sourceUrl: asString(raw.sourceUrl),
    capturedAt: validNullableDate(raw.capturedAt),
    consentStatus,
    doNotContact: Boolean(raw.doNotContact),
    doNotContactReason: asString(raw.doNotContactReason),
    companyId: asNullableString(raw.companyId),
    primaryContactId: asNullableString(raw.primaryContactId),
    opportunityId: asNullableString(raw.opportunityId),
    cnpj: asString(raw.cnpj),
    website: asString(raw.website),
    instagramUrl: asString(raw.instagramUrl),
    linkedinUrl: asString(raw.linkedinUrl),
    facebookUrl: asString(raw.facebookUrl),
    jobTitle: asString(raw.jobTitle),
    decisionRole,
    influenceLevel: Math.max(0, Math.min(100, asFiniteNumber(raw.influenceLevel))),
  }
}

export const normalizeSnapshotForRender = (input: WorkspaceSnapshot): WorkspaceSnapshot => {
  const raw = (input && typeof input === 'object' ? input : {}) as WorkspaceSnapshot & Record<string, unknown>
  const workspace = normalizeWorkspace(raw.workspace)
  const stages = arrayOrEmpty<PipelineStage>(raw.stages)
    .map((stage, index) => normalizeStage(stage, workspace.id, index))
    .sort((left, right) => left.order - right.order)
  const fallbackStageId = stages.find((stage) => !stage.isWon && !stage.isLost)?.id ?? stages[0]?.id ?? ''
  return {
    ...input,
    workspace,
    stages,
    leads: arrayOrEmpty<Lead>(raw.leads).map((lead) => normalizeLeadForRender(lead, fallbackStageId, workspace.id)),
    activities: arrayOrEmpty(raw.activities),
    calls: arrayOrEmpty(raw.calls),
    events: arrayOrEmpty(raw.events),
    playbooks: arrayOrEmpty(raw.playbooks),
    goals: arrayOrEmpty(raw.goals),
    automationRules: arrayOrEmpty(raw.automationRules),
    automationRuns: arrayOrEmpty(raw.automationRuns),
    companies: arrayOrEmpty(raw.companies),
    contacts: arrayOrEmpty(raw.contacts),
    opportunities: arrayOrEmpty(raw.opportunities),
    socialProfiles: arrayOrEmpty(raw.socialProfiles),
    products: arrayOrEmpty(raw.products),
    proposals: arrayOrEmpty(raw.proposals),
    revenueEntries: arrayOrEmpty(raw.revenueEntries),
  }
}
