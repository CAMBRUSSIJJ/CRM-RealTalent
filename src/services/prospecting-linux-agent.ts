import type { Lead } from '../domain/types'
import type { CaptureDraft } from './prospecting-workspace'
import { env } from '../lib/env'
import { runtimeFetch } from './realtalent-runtime-transport'
import { buildDeterministicProspectingSearchPlan, decodeProspectingHtmlEntities, planProspectingSearchWithAgent, sanitizeProspectingDraft, sanitizeProspectingSearchPlan } from './prospecting-search-intelligence'

export type ProspectingAgentJobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
export type ProspectingAgentCadence = 'off' | 'daily' | 'weekly'
export type ProspectingAreaMode = 'radius' | 'city' | 'neighborhoods' | 'map'
export type ProspectingSearchMode = 'coverage' | 'fast' | 'economy'
export type ProspectingTargetMode = 'max' | 'quantity'
export type ProspectingCategoryMode = 'exact' | 'related'
export type ProspectingProcessingStage = 'pending' | 'running' | 'completed' | 'attention' | 'failed' | 'skipped'
export type ProspectingEnrichmentTaskId = 'website' | 'contacts' | 'cnpj' | 'social'
export type ProspectingEnrichmentTaskStatus = ProspectingProcessingStage | 'retrying'
export interface ProspectingEnrichmentTask { id: ProspectingEnrichmentTaskId; status: ProspectingEnrichmentTaskStatus; attempts: number; maxAttempts: number; lastError: string | null; message: string; lastRunAt: string | null; completedAt: string | null }
export interface ProspectingGeoPoint { lat: number; lon: number }
export interface ProspectingTerritoryPreview { region: string; displayName: string; center: ProspectingGeoPoint; bbox: { south: number; north: number; west: number; east: number } }
export interface ProspectingSemanticPlan { intent: string; queries: string[]; exclusions: string[]; planner: string }
export interface ProspectingAdaptiveMetric { attempts: number; discovered: number; accepted: number; rejected: number; duplicates: number; ready: number; attention: number; yieldRate: number; duplicateRate: number; qualityRate: number; score: number; state: 'learning' | 'low_yield' | 'duplicate_heavy' | 'high_yield'; lastRunAt: string | null }
export interface ProspectingAdaptiveDecision { id: string; signature: string; type: string; scope: 'query' | 'source' | 'cell'; key: string; message: string; at: string; metrics: { yieldRate: number; duplicateRate: number; qualityRate: number; score: number; discovered: number; accepted: number } }
export interface ProspectingAdaptiveLearning { version: string; perQuery: Record<string, ProspectingAdaptiveMetric>; perSource: Record<string, ProspectingAdaptiveMetric>; perCell: Record<string, ProspectingAdaptiveMetric>; bestQuery: string | null; bestSource: string | null; adaptations: ProspectingAdaptiveDecision[] }

export interface ProspectingAgentHealth {
  ok: boolean
  version: string
  pid: number
  port: number
  chromium: boolean
  chromiumBinary: string | null
  providers: {
    placeFirstSearch?: boolean
    searchOntology?: boolean
    territoryEngine2?: boolean
    strictScope?: boolean
    coverageExpansion?: boolean
    runtimeTruth?: boolean
    openstreetmap: boolean
    webDiscovery?: boolean
    websiteCrawler: boolean
    cnpjEnrichment: boolean
    websiteDiscovery?: boolean
    contactDiscovery?: boolean
    cnpjDiscovery?: boolean
    socialDiscovery?: boolean
    chromiumHeadless: boolean
  }
  providerStatus?: Record<string, { state: string; lastSuccessAt: string | null; lastError: string | null }>
  territoryEngine?: { version: string; maxSubdivisionLevel: number; maxCells: number; weightedCoverage: boolean; radiusGeometry: boolean }
  strictScope?: { version: string; defaultCategoryMode: ProspectingCategoryMode; categoryGate: boolean; localityGate: boolean; contentGate: boolean }
  queued: number
  running: number
  checkedAt: string
}

export interface ProspectingAgentJob {
  id: string
  workspaceId: string
  source: 'manual' | 'campaign'
  status: ProspectingAgentJobStatus
  input: {
    segment: string
    regions: string[]
    targetQuantity: number
    targetMode: ProspectingTargetMode
    areaMode: ProspectingAreaMode
    radiusKm: number
    searchMode: ProspectingSearchMode
    categoryMode: ProspectingCategoryMode
    mapPolygon?: ProspectingGeoPoint[]
    searchCenter?: ProspectingGeoPoint | null
    semanticPlan?: ProspectingSemanticPlan | null
  }
  options: { enrichWeb: boolean; enrichCnpj: boolean; browserFallback: boolean }
  results: Array<CaptureDraft & {
    completenessPercent?: number
    confidencePercent?: number
    candidateId?: string
    qualityStatus?: 'processing' | 'ready' | 'attention'
    resolutionStatus?: 'unique' | 'merged' | 'review'
    resolutionConfidence?: number
    possibleDuplicate?: { company: string; score: number }
    placeType?: 'physical_place' | 'service_business' | 'online_business' | 'directory' | 'content' | 'web_document' | 'unknown'
    placeConfidence?: number
    placeEvidence?: string[]
    latitude?: number | null
    longitude?: number | null
    evidence?: Array<{ field: string; value: string; source: string; confidence: string; collectedAt: string }>
    processingStages?: Record<string, ProspectingProcessingStage>
    enrichmentTasks?: Record<ProspectingEnrichmentTaskId, ProspectingEnrichmentTask>
    enrichmentCache?: { website?: { domain?: string; url?: string; email?: string; phone?: string; cnpj?: string; instagram?: string; facebook?: string; linkedin?: string; textLength?: number; warnings?: string[]; collectedAt?: string } | null }
    reviewRevision?: number
    reviewPublishedAt?: string | null
    reviewReason?: string
  }>
  plan?: {
    expandedQueries: string[]
    ontology?: { version: string; intentId: string; label: string; intent: string; confidence: number; matchedBy: string; aliases: string[]; webTerms: string[]; osmFilters: Array<Record<string,string>>; osmNameTerms: string[]; cnaes: Array<{ code: string; label: string }>; providerCategories: string[]; strictTerms?: string[]; rejectTerms?: string[]; exactOsmFilters?: Array<Record<string,string>>; scopeVersion?: string }
    cells: Array<{ id: string; parentId: string | null; level: number; region: string; mode?: 'bbox' | 'area'; bbox?: { south: number; north: number; west: number; east: number } | null; status: string; resultsFound: number; uniqueResultsFound: number; density: number; areaKm2?: number; searchAreaKm2?: number; coverageRatio?: number; subdivisionReason?: string; providerSaturated?: boolean }>
    providerRuns: Array<{ provider: string; cellId: string | null; query: string; intentId?: string; region?: string; status: string; results: number; localCandidates?: number; rejectedDocuments?: number; error?: string }>
    geometry?: { type: 'polygon' | 'bbox' | 'circle'; polygon?: ProspectingGeoPoint[]; center?: ProspectingGeoPoint; radiusKm?: number; bbox: { south: number; north: number; west: number; east: number } } | null
    semanticPlan?: ProspectingSemanticPlan | null
    plannedAt: string | null
  }
  coverage?: {
    territoryPercent: number
    attemptedTerritoryPercent: number
    successfulTerritoryPercent: number
    failedTerritoryPercent: number
    saturationPercent: number
    saturationConfidence: 'low' | 'medium' | 'high'
    areaKm2: number
    attemptedAreaKm2: number
    successfulAreaKm2: number
    failedAreaKm2: number
    subdivisionCount: number
    deepestSubdivisionLevel: number
    saturatedCells: number
    attemptedCells: number
    completedCells: number
    failedCells: number
    totalCells: number
    completedSources: number
    totalSources: number
    validRuns: number
    failedRuns: number
    lastNewCounts: number[]
  }
  processing?: {
    raw: number
    identity: number
    website: number
    contacts: number
    legal: number
    social: number
    validation: number
    ready: number
    attention: number
    failed: number
  }
  reviewStream?: {
    revision: number
    acknowledgedRevision: number
    readyCandidates: number
    lastPublishedAt: string | null
    lastAcknowledgedAt: string | null
  }
  runtime?: {
    runId: string
    version: string
    phase: 'queued' | 'planning' | 'discovering_osm' | 'expanding_coverage' | 'discovering_web' | 'enriching' | 'finalizing' | 'completed' | 'paused' | 'cancelled' | 'failed' | string
    phaseLabel: string
    phaseStartedAt: string
    updatedAt: string
    currentSource: string
    currentRegion: string
    currentQuery: string
    sourceStates: Record<string, string>
    counters: { discovered: number; accepted: number; ready: number; attention: number; rejectedCategory: number; rejectedLocation: number; duplicates: number; queries: number }
    learning?: ProspectingAdaptiveLearning
    events: Array<{ id: string; type: string; message: string; at: string; [key: string]: unknown }>
  }
  clientImportedAt: string | null
  warnings: string[]
  error: string | null
  message: string
  progress: { found: number; currentRegion: string; currentSource: string; currentUrl: string }
  stats: {
    discovered: number
    unique: number
    duplicates: number
    websitesVisited: number
    queries: number
    withPhone: number
    withEmail: number
    withInstagram: number
    withWebsite: number
    withCnpj: number
    webDocuments?: number
    webPlaceCandidates?: number
    webRejectedDocuments?: number
    scopeRejectedCategory?: number
    scopeRejectedLocation?: number
    scopeRejectedOther?: number
  }
  sourceLog?: Array<{ type: 'raw' | 'candidate' | 'rejected' | 'duplicate'; name: string; url?: string; provider?: string; reason?: string; at: string }>
  rejections?: Array<{ name: string; source: string; type: string; reason: string; at: string }>
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface ProspectingAgentCampaign {
  id: string
  workspaceId: string
  name: string
  cadence: Exclude<ProspectingAgentCadence, 'off'>
  active: boolean
  input: { segment: string; regions: string[]; targetQuantity: number; targetMode: ProspectingTargetMode; areaMode: ProspectingAreaMode; radiusKm: number; searchMode: ProspectingSearchMode; categoryMode: ProspectingCategoryMode; mapPolygon?: ProspectingGeoPoint[]; searchCenter?: ProspectingGeoPoint | null }
  createdAt: string
  lastRunAt: string | null
  nextRunAt: string
}

// legacy audit marker: const AGENT_URL = 'http://127.0.0.1:4319'
const AGENT_URL = env.prospectingGatewayUrl

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 7000): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await runtimeFetch(`${AGENT_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : `Prospecting Agent HTTP ${response.status}`)
    return payload as T
  } finally { window.clearTimeout(timer) }
}

const clean = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ')
const normalize = (value: unknown) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
const digits = (value: unknown) => clean(value).replace(/\D/g, '')
const domain = (value: unknown) => clean(value).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLocaleLowerCase('pt-BR')

export function existingProspectingIdentityKeys(leads: Lead[]): string[] {
  const keys = new Set<string>()
  for (const lead of leads) {
    const cnpj = digits(lead.cnpj).slice(0, 14)
    const phone = digits(lead.phone)
    const website = domain(lead.website)
    const company = normalize(lead.company || lead.name)
    const city = normalize(lead.city)
    if (cnpj.length === 14) keys.add(`cnpj:${cnpj}`)
    if (phone.length >= 10) keys.add(`phone:${phone}`)
    if (website) keys.add(`domain:${website}`)
    if (company) keys.add(`name:${company}:${city}`)
  }
  return [...keys]
}

export async function getProspectingAgentHealth(): Promise<ProspectingAgentHealth | null> {
  try {
    return await request<ProspectingAgentHealth>('/api/prospecting-agent/health', {}, 12000)
  } catch { return null }
}

export async function previewProspectingTerritory(region: string): Promise<ProspectingTerritoryPreview> {
  return await request<ProspectingTerritoryPreview>(`/api/prospecting-agent/territory/preview?region=${encodeURIComponent(region)}`, {}, 12000)
}

const agentNormalize = (value: unknown) => decodeProspectingHtmlEntities(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
const AGENT_CONTENT_NOISE = /\b(?:the\s+best(?:\s+\d+)?|top\s*\d+|best\s+\d+|encontre\s+(?:a|o)\s+melhor|melhor(?:es)?|ranking|lista\s+de|guia\s+de|reviews?|directory|diret[oó]rio|artigo|blog|curso|vaga|emprego|near\s+me|perto\s+de\s+mim)\b/i
const AGENT_DIRECTORY_HOST = /(^|\.)(?:yelp\.|tripadvisor\.|foursquare\.com|guiamais\.com\.br|telelistas\.net|solutudo\.com\.br|apontador\.com\.br|listamais\.com\.br|locaisdobrasil\.com\.br|brasillocais\.com)/i

function sanitizeAgentCandidate<T extends ProspectingAgentJob['results'][number]>(candidate: T, areaMode?: ProspectingAreaMode): T | null {
  const sanitized = sanitizeProspectingDraft(candidate) as T
  const provider = String(sanitized.provider ?? '').toLocaleLowerCase('pt-BR')
  const placeType = String(sanitized.placeType ?? '').toLocaleLowerCase('pt-BR')
  const name = decodeProspectingHtmlEntities(sanitized.company || sanitized.name)
  const website = String(sanitized.website ?? '')
  let host = ''
  try { host = website ? new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname : '' } catch { host = '' }
  if (AGENT_CONTENT_NOISE.test(name) || ['directory', 'content', 'web_document'].includes(placeType) || provider === 'web_coverage_hint') return null
  if (AGENT_DIRECTORY_HOST.test(host)) {
    sanitized.website = ''
    sanitized.sourceDetail = sanitized.sourceDetail || 'Diretório público usado como evidência de descoberta'
    sanitized.qualityStatus = 'attention'
    sanitized.reviewReason = 'directory_evidence'
  }
  const scopeValidation = sanitized.scopeValidation as { location?: { accepted?: boolean; score?: number } } | undefined
  if (scopeValidation?.location?.accepted === false) return null
  const scopeRegion = decodeProspectingHtmlEntities(sanitized.scopeRegion)
  const scopeExplicitCity = decodeProspectingHtmlEntities(sanitized.scopeExplicitCity)
  const sourceCity = decodeProspectingHtmlEntities(sanitized.city)
  if (provider.startsWith('web') && !scopeExplicitCity && sourceCity && agentNormalize(sourceCity) === agentNormalize(scopeRegion)) sanitized.city = ''
  const hasCoordinates = Number.isFinite(Number(sanitized.latitude)) && Number.isFinite(Number(sanitized.longitude))
  const geoScore = Number(scopeValidation?.location?.score ?? (hasCoordinates ? 90 : 0))
  const hasIdentity = Boolean(String(sanitized.osmId ?? sanitized.placeId ?? sanitized.cnpj ?? sanitized.phone ?? sanitized.website ?? '').trim())
  const geometryRequired = areaMode === 'radius' || areaMode === 'map'
  if (sanitized.qualityStatus === 'ready' && (!hasIdentity || geoScore < 68 || placeType === 'unknown' || (geometryRequired && !hasCoordinates))) {
    sanitized.qualityStatus = 'attention'
    sanitized.reviewReason = geometryRequired && !hasCoordinates ? 'coordinates_not_confirmed' : geoScore < 68 ? 'location_not_confirmed' : 'business_identity_not_confirmed'
  }
  return sanitized
}

function sanitizeProspectingAgentJob(job: ProspectingAgentJob): ProspectingAgentJob {
  const rawResults = Array.isArray(job.results) ? job.results : []
  const results = rawResults.map((candidate) => sanitizeAgentCandidate(candidate, job.input.areaMode)).filter((candidate): candidate is ProspectingAgentJob['results'][number] => Boolean(candidate))
  const filteredByIntegrity = rawResults.length - results.length
  const ready = results.filter((candidate) => candidate.qualityStatus === 'ready').length
  const attention = results.filter((candidate) => candidate.qualityStatus !== 'ready').length
  return {
    ...job,
    results,
    stats: { ...job.stats, unique: results.length, webRejectedDocuments: Number(job.stats?.webRejectedDocuments || 0) + filteredByIntegrity },
    processing: job.processing ? { ...job.processing, validation: results.length, ready, attention } : job.processing,
    runtime: job.runtime ? { ...job.runtime, counters: { ...job.runtime.counters, accepted: results.length, ready, attention } } : job.runtime,
  }
}

export async function listProspectingAgentJobs(workspaceId: string): Promise<ProspectingAgentJob[]> {
  const response = await request<{ jobs: ProspectingAgentJob[] }>(`/api/prospecting-agent/jobs?workspaceId=${encodeURIComponent(workspaceId)}`)
  return (response.jobs ?? []).map(sanitizeProspectingAgentJob)
}

export async function createProspectingAgentJob(input: {
  workspaceId: string
  segment: string
  regions: string[]
  targetQuantity: number
  targetMode: ProspectingTargetMode
  areaMode: ProspectingAreaMode
  radiusKm: number
  searchMode: ProspectingSearchMode
  categoryMode: ProspectingCategoryMode
  mapPolygon?: ProspectingGeoPoint[]
  searchCenter?: ProspectingGeoPoint | null
  semanticPlan?: ProspectingSemanticPlan | null
  existingKeys: string[]
  enrichWeb?: boolean
  enrichCnpj?: boolean
  browserFallback?: boolean
}): Promise<ProspectingAgentJob> {
  let semanticPlan = input.semanticPlan ?? null
  if (!semanticPlan) {
    const primaryRegion = input.regions.map((item) => item.trim()).find(Boolean) ?? ''
    const planInput = { segment: input.segment, city: primaryRegion, query: input.segment }
    const baseline = buildDeterministicProspectingSearchPlan(planInput)
    try {
      const refined = await planProspectingSearchWithAgent(planInput, baseline)
      const plan = sanitizeProspectingSearchPlan(refined, baseline)
      semanticPlan = { intent: plan.intent, queries: plan.queries.map((entry) => entry.term), exclusions: plan.exclusions, planner: plan.planner }
    } catch {
      semanticPlan = { intent: baseline.intent, queries: baseline.queries.map((entry) => entry.term), exclusions: baseline.exclusions, planner: baseline.planner }
    }
  }
  const response = await request<{ job: ProspectingAgentJob }>('/api/prospecting-agent/jobs', { method: 'POST', body: JSON.stringify({ ...input, semanticPlan }) }, 10000)
  return sanitizeProspectingAgentJob(response.job)
}

export async function getProspectingAgentJob(jobId: string): Promise<ProspectingAgentJob> {
  const response = await request<{ job: ProspectingAgentJob }>(`/api/prospecting-agent/jobs/${encodeURIComponent(jobId)}`)
  return sanitizeProspectingAgentJob(response.job)
}

export async function controlProspectingAgentJob(jobId: string, action: 'pause' | 'resume' | 'cancel' | 'imported'): Promise<ProspectingAgentJob> {
  const response = await request<{ job: ProspectingAgentJob }>(`/api/prospecting-agent/jobs/${encodeURIComponent(jobId)}/${action}`, { method: 'POST', body: '{}' })
  return sanitizeProspectingAgentJob(response.job)
}

export async function retryProspectingEnrichmentTask(jobId: string, candidateId: string, taskId: ProspectingEnrichmentTaskId): Promise<ProspectingAgentJob> {
  const response = await request<{ job: ProspectingAgentJob }>(`/api/prospecting-agent/jobs/${encodeURIComponent(jobId)}/candidates/${encodeURIComponent(candidateId)}/enrichment/${encodeURIComponent(taskId)}/retry`, { method: 'POST', body: '{}' }, 30000)
  return sanitizeProspectingAgentJob(response.job)
}

export interface ProspectingReviewBatch {
  entries: ProspectingAgentJob['results']
  revision: number
  currentRevision: number
  acknowledgedRevision: number
  hasMore: boolean
}

export async function getProspectingReviewBatch(jobId: string, afterRevision: number, limit = 50): Promise<ProspectingReviewBatch> {
  const batch = await request<ProspectingReviewBatch>(`/api/prospecting-agent/jobs/${encodeURIComponent(jobId)}/review?afterRevision=${Math.max(0, afterRevision)}&limit=${Math.min(100, Math.max(1, limit))}`, {}, 10000)
  return { ...batch, entries: batch.entries.map((entry) => sanitizeAgentCandidate(entry)).filter((entry): entry is ProspectingAgentJob['results'][number] => Boolean(entry)) }
}

export async function acknowledgeProspectingReviewBatch(jobId: string, revision: number): Promise<ProspectingAgentJob> {
  const response = await request<{ job: ProspectingAgentJob }>(`/api/prospecting-agent/jobs/${encodeURIComponent(jobId)}/review/ack`, { method: 'POST', body: JSON.stringify({ revision }) }, 10000)
  return sanitizeProspectingAgentJob(response.job)
}

export async function createProspectingAgentCampaign(input: {
  workspaceId: string
  name: string
  cadence: Exclude<ProspectingAgentCadence, 'off'>
  segment: string
  regions: string[]
  targetQuantity: number
  targetMode: ProspectingTargetMode
  areaMode: ProspectingAreaMode
  radiusKm: number
  searchMode: ProspectingSearchMode
  categoryMode: ProspectingCategoryMode
  mapPolygon?: ProspectingGeoPoint[]
  searchCenter?: ProspectingGeoPoint | null
  existingKeys: string[]
}): Promise<ProspectingAgentCampaign> {
  const response = await request<{ campaign: ProspectingAgentCampaign }>('/api/prospecting-agent/campaigns', { method: 'POST', body: JSON.stringify(input) })
  return response.campaign
}
