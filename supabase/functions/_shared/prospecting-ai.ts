// Pure contracts shared by the Edge Function and its tests. No credentials or runtime globals.
export const aiFields = ['company', 'phone', 'email', 'city', 'address', 'cnpj', 'instagram', 'website', 'bookingUrl', 'systemName', 'whatsappUrl'] as const
export type AiField = typeof aiFields[number]
export interface AiSource { url: string; title: string; content?: string }
export interface AiEvidence { field: AiField; value: string; sourceUrl: string }
export interface AiTriggerSignal {
  type: 'expansion' | 'hiring' | 'launch' | 'partnership' | 'opening' | 'rebranding' | 'event' | 'complaint' | 'other'
  title: string
  excerpt: string
  sourceUrl: string
  eventDate: string
  channel: 'instagram' | 'website' | 'other'
}
export const aiTriggerTypes = ['expansion', 'hiring', 'launch', 'partnership', 'opening', 'rebranding', 'event', 'complaint', 'other'] as const
export interface AiResearch {
  sources: AiSource[]
  evidence: AiEvidence[]
  opportunity: string
  suggestedApproach: string
  missingFields: AiField[]
  researchedAt: string
  signals?: AiTriggerSignal[]
}
export interface AiLead {
  company: string; phone: string; email: string; city: string; address: string; cnpj: string
  instagram: string; website: string; bookingUrl: string; systemName: string; whatsappUrl: string
  aiResearch: AiResearch
}
export interface AiSearchInput {
  organizationId: string
  segment: string
  city: string
  query: string
  source: 'maps' | 'instagram' | 'cnpj' | 'extension' | 'manual'
  limit: number
  prospectId?: string
  website?: string
  instagram?: string
  execution?: 'local' | 'server'
}
export interface AiResearchStage {
  stage: 'website' | 'web' | 'instagram' | 'facts' | 'signals' | 'business' | 'completed'
  phaseStatus: 'running' | 'completed' | 'failed'
  errorCode?: string
  sourceCount: number
  leadCount: number
  at?: string
}
export interface AiInstagramDiscovery {
  status: 'linked' | 'candidate' | 'provided' | 'not_found' | 'unavailable'
  profileUrl?: string
  evidenceUrl?: string
  /** Count of post URLs that actually returned readable public text. */
  postCount: number
  /** Count of candidate URLs before attempting a post scrape. */
  postLinksFound?: number
  /** Whether the public profile itself was readable through local Firecrawl. */
  profileAccess?: 'readable' | 'bio_only' | 'blocked' | 'unavailable' | 'not_attempted'
  /** Specific non-sensitive reason why reading the profile or posts did not work. */
  accessReason?: 'login_required' | 'no_public_content' | 'scrape_failed' | 'timeout' | 'posts_unavailable'
  /** Only URLs of post pages whose readable text was actually collected. */
  readablePostUrls?: string[]
  /** Citable excerpts of real publicly readable posts, even if Ollama fails. */
  readablePostExcerpts?: Array<{ url: string; excerpt: string }>
  /** Short excerpt actually returned from the public profile page. */
  profileExcerpt?: string
  /** Summarization of publicly readable posts only, not images or videos. */
  contentSummary?: string
}
export interface AiG6Fact {
  field: string
  label: string
  value: string
  sourceUrl: string
}
export interface AiG6CommercialBrief {
  status: 'evidence_based' | 'insufficient_evidence'
  segment: string
  summary: string
  knownFacts: AiG6Fact[]
  missing: string[]
  signals: Array<{ title: string; excerpt: string; sourceUrl: string; type: string }>
  /** Hypotheses are never treated as validated business needs. */
  hypotheses: string[]
  questions: string[]
  recommendedAction: string
  researchLimits: string[]
  planner?: 'ollama_questions'
}
export interface AiG7LeadIntelligenceEvidence {
  label: string
  excerpt: string
  sourceUrl: string
  channel: 'instagram' | 'website_or_web'
  amount?: string
}
export interface AiG7LeadIntelligence {
  version: 'G7'
  status: 'partial_evidence' | 'insufficient_evidence'
  extraction: 'ollama_verified' | 'literal_only'
  sourceCount: number
  businessSummary?: string
  coverage?: Array<{ channel: string; label: string; pages: number; status: string }>
  offerings: AiG7LeadIntelligenceEvidence[]
  prices: AiG7LeadIntelligenceEvidence[]
  positioning: AiG7LeadIntelligenceEvidence[]
  reputation?: AiG7LeadIntelligenceEvidence[]
  missing: string[]
  hypotheses: string[]
  questions: string[]
  recommendedAction: string
}
export interface AiG6ResearchPlan {
  version: string
  segment: string
  priorities: string[]
  questions: string[]
  queries: string[]
  strategy: 'sector_rules' | 'ollama_bounded'
  budget: { lowMemorySearches: number; normalSearches: number; deepPagesLow: number; deepPagesNormal: number }
}
export interface AiSearchResult {
  leads: AiLead[]
  warnings: string[]
  researchedAt: string
  /** Local-only execution details. Not required by the public search API. */
  stages?: AiResearchStage[]
  researchStatus?: 'completed' | 'limited' | 'partial'
  executionId?: string
  contractVersion?: 'garimpo-research/8'
  runtime?: { version: string; model: string; memoryProfile: string }
  providers?: Array<{ name: string; configured: boolean; used: boolean; succeeded: number; failed: number }>
  adaptiveResearch?: { gaps: string[]; queriesExecuted: number; exhausted: boolean }
  sourceReads?: Array<{ url: string; status: 'read' | 'observed' | 'blocked' | 'unavailable' }>
  instagramDiscovery?: AiInstagramDiscovery
  researchPlan?: AiG6ResearchPlan
  commercialBrief?: AiG6CommercialBrief
  leadIntelligence?: AiG7LeadIntelligence
}

/** Optional channels do not turn an otherwise complete investigation into a failure. */
export function researchCompletionStatus(stages: AiResearchStage[], hasSources: boolean): 'completed' | 'limited' | 'partial' {
  const failed = stages.filter((stage) => stage.phaseStatus === 'failed')
  if (failed.some((stage) => ['facts', 'business'].includes(stage.stage))
    || !hasSources && failed.some((stage) => ['website', 'web'].includes(stage.stage))) return 'partial'
  return failed.length ? 'limited' : 'completed'
}

export function parseAiSearchResult(value: unknown): AiSearchResult {
  const fail = (): never => { throw new ProspectingError('invalid_ai_response', 502) }
  const record = (item: unknown): Record<string, unknown> => isRecord(item) ? item : fail()
  const string = (item: unknown, max = 20_000): string => typeof item === 'string' && item.length <= max ? item : fail()
  const list = (item: unknown, check: (row: unknown) => void, max = 100) => {
    if (!Array.isArray(item) || item.length > max) fail()
    for (const row of item as unknown[]) check(row)
  }
  const strings = (item: unknown) => list(item, (row) => { string(row) })
  const date = (item: unknown) => { if (!Number.isFinite(Date.parse(string(item, 80)))) fail() }
  const url = (item: unknown) => { if (!publicWebUrl(string(item, 2000))) fail() }
  const number = (item: unknown) => { if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) fail() }
  const signal = (item: unknown) => {
    const row = record(item)
    for (const key of ['type', 'title', 'excerpt', 'eventDate', 'channel']) string(row[key])
    if (!aiTriggerTypes.includes(row.type as typeof aiTriggerTypes[number])) fail()
    url(row.sourceUrl)
  }
  const root = record(value)
  date(root.researchedAt)
  strings(root.warnings)
  list(root.leads, (item) => {
    const lead = record(item)
    for (const field of aiFields) string(lead[field], 2000)
    const research = record(lead.aiResearch)
    list(research.sources, (item) => { const source = record(item); url(source.url); string(source.title); if (source.content !== undefined) string(source.content, 60_000) })
    const sourceUrls = new Set((research.sources as AiSource[]).map((source) => source.url))
    list(research.evidence, (item) => {
      const fact = record(item)
      if (!aiFields.includes(fact.field as AiField)) fail()
      string(fact.value); url(fact.sourceUrl)
      if (!sourceUrls.has(fact.sourceUrl as string)) fail()
    })
    for (const key of ['opportunity', 'suggestedApproach']) string(research[key])
    date(research.researchedAt)
    list(research.missingFields, (field) => { if (!aiFields.includes(field as AiField)) fail() })
    if (research.signals !== undefined) list(research.signals, signal)
  }, 10)
  if (root.researchStatus !== undefined && !['completed', 'limited', 'partial'].includes(root.researchStatus as string)) fail()
  if (root.executionId !== undefined) string(root.executionId, 200)
  if (root.contractVersion !== undefined && root.contractVersion !== 'garimpo-research/8') throw new ProspectingError('research_contract_unsupported', 502)
  if (root.stages !== undefined) list(root.stages, (item) => {
    const row = record(item)
    if (!['website', 'web', 'instagram', 'facts', 'signals', 'business', 'completed'].includes(row.stage as string)
      || !['running', 'completed', 'failed'].includes(row.phaseStatus as string)) fail()
    number(row.sourceCount); number(row.leadCount)
    if (row.at !== undefined) date(row.at)
    if (row.errorCode !== undefined) string(row.errorCode, 100)
  })
  if (root.instagramDiscovery !== undefined) {
    const row = record(root.instagramDiscovery)
    if (!['linked', 'candidate', 'provided', 'not_found', 'unavailable'].includes(row.status as string)) fail()
    number(row.postCount)
    for (const key of ['profileUrl', 'evidenceUrl']) if (row[key] !== undefined) url(row[key])
    for (const key of ['profileExcerpt', 'contentSummary', 'profileAccess', 'accessReason']) if (row[key] !== undefined) string(row[key])
    if (row.postLinksFound !== undefined) number(row.postLinksFound)
    if (row.readablePostUrls !== undefined) list(row.readablePostUrls, url)
    if (row.readablePostExcerpts !== undefined) list(row.readablePostExcerpts, (item) => { const r = record(item); url(r.url); string(r.excerpt) })
  }
  if (root.leadIntelligence !== undefined) {
    const row = record(root.leadIntelligence)
    if (row.version !== 'G7' || !['partial_evidence', 'insufficient_evidence'].includes(row.status as string)
      || !['ollama_verified', 'literal_only'].includes(row.extraction as string)) fail()
    number(row.sourceCount)
    for (const key of ['offerings', 'prices', 'positioning', 'reputation']) {
      if (key === 'reputation' && row[key] === undefined) continue
      list(row[key], (item) => { const r = record(item); string(r.label); string(r.excerpt); url(r.sourceUrl); string(r.channel); if (r.amount !== undefined) string(r.amount) })
    }
    for (const key of ['missing', 'hypotheses', 'questions']) strings(row[key])
    string(row.recommendedAction)
    if (row.businessSummary !== undefined) string(row.businessSummary)
    if (row.coverage !== undefined) list(row.coverage, (item) => { const r = record(item); string(r.channel); string(r.label); number(r.pages); string(r.status) })
  }
  if (root.commercialBrief !== undefined) {
    const row = record(root.commercialBrief)
    if (!['evidence_based', 'insufficient_evidence'].includes(row.status as string)) fail()
    for (const key of ['segment', 'summary', 'recommendedAction']) string(row[key])
    for (const key of ['missing', 'hypotheses', 'questions', 'researchLimits']) strings(row[key])
    list(row.knownFacts, (item) => { const r = record(item); string(r.field); string(r.label); string(r.value); url(r.sourceUrl) })
    list(row.signals, (item) => { const r = record(item); string(r.title); string(r.excerpt); string(r.type); url(r.sourceUrl) })
  }
  if (root.researchPlan !== undefined) {
    const row = record(root.researchPlan)
    for (const key of ['version', 'segment', 'strategy']) string(row[key])
    for (const key of ['priorities', 'questions', 'queries']) strings(row[key])
    const budget = record(row.budget)
    for (const key of ['lowMemorySearches', 'normalSearches', 'deepPagesLow', 'deepPagesNormal']) number(budget[key])
  }
  if (root.runtime !== undefined) { const row = record(root.runtime); for (const key of ['version', 'model', 'memoryProfile']) string(row[key], 200) }
  if (root.providers !== undefined) list(root.providers, (item) => {
    const row = record(item); string(row.name, 100)
    if (typeof row.configured !== 'boolean' || typeof row.used !== 'boolean') fail()
    number(row.succeeded); number(row.failed)
  }, 10)
  if (root.adaptiveResearch !== undefined) {
    const row = record(root.adaptiveResearch)
    strings(row.gaps); number(row.queriesExecuted)
    if (typeof row.exhausted !== 'boolean') fail()
  }
  if (root.sourceReads !== undefined) list(root.sourceReads, (item) => {
    const row = record(item); url(row.url)
    if (!['read', 'observed', 'blocked', 'unavailable'].includes(row.status as string)) fail()
  })
  return value as AiSearchResult
}
export class ProspectingError extends Error {
  code: string
  status: number
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status }
}
export function parseAiResearch(value: unknown): AiResearch {
  const fields = Object.fromEntries(aiFields.map((field) => [field, '']))
  parseAiSearchResult({ leads: [{ ...fields, aiResearch: value }], warnings: [],
    researchedAt: isRecord(value) ? value.researchedAt : '' })
  return value as AiResearch
}
export const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseAiSearchInput(value: unknown): AiSearchInput {
  if (!isRecord(value) || !uuid.test(text(value.organizationId))) throw new ProspectingError('invalid_workspace')
  const segment = text(value.segment, 150), city = text(value.city, 150), query = text(value.query, 1000)
  if (!segment || !city) throw new ProspectingError('search_criteria_required')
  const limit = value.limit ?? 5
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 10) throw new ProspectingError('invalid_limit')
  const source = text(value.source) || 'maps'
  if (!['maps', 'instagram', 'cnpj', 'extension', 'manual'].includes(source)) throw new ProspectingError('invalid_source')
  if (value.prospectId !== undefined && !uuid.test(text(value.prospectId))) throw new ProspectingError('invalid_prospect')
  if (value.execution !== undefined && !['local', 'server'].includes(text(value.execution))) throw new ProspectingError('invalid_execution')
  const website = value.website ? publicWebUrl(value.website) : ''
  if (value.website && (!website || !website.startsWith('https://'))) throw new ProspectingError('invalid_website')
  const instagram = text(value.instagram, 100)
  if (instagram && !(/^@?[a-z0-9._]{1,30}$/i.test(instagram) ||
    (/^https:\/\/(www\.)?instagram\.com\/[a-z0-9._]{1,30}\/?$/i.test(instagram)))) throw new ProspectingError('invalid_instagram')
  return { organizationId: text(value.organizationId), segment, city, query, limit, source: source as AiSearchInput['source'],
    ...(value.prospectId ? { prospectId: text(value.prospectId) } : {}),
    ...(website ? { website } : {}),
    ...(instagram ? { instagram } : {}),
    ...(value.execution ? { execution: value.execution as 'local' | 'server' } : {}) }
}

export function publicWebUrl(value: unknown): string {
  try {
    const url = new URL(text(value, 2000))
    const host = url.hostname.toLowerCase()
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) return ''
    if (!host.includes('.') || host.includes(':') || /^[\d.]+$/.test(host) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return ''
    url.hash = ''
    return url.href
  } catch { return '' }
}

function validCnpj(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!/^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false
  for (const length of [12, 13]) {
    let weight = length - 7, sum = 0
    for (const digit of digits.slice(0, length)) { sum += Number(digit) * weight; weight = weight === 2 ? 9 : weight - 1 }
    const remainder = sum % 11
    if (Number(digits[length]) !== (remainder < 2 ? 0 : 11 - remainder)) return false
  }
  return true
}

function cleanField(field: AiField, raw: unknown) {
  const value = text(raw, 1000)
  if (field === 'phone') return /^\d{10,15}$/.test(value.replace(/\D/g, '')) ? value : ''
  if (field === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : ''
  if (field === 'cnpj') return validCnpj(value) ? value : ''
  if (['website', 'bookingUrl', 'whatsappUrl'].includes(field)) {
    const url = publicWebUrl(value)
    if (field === 'whatsappUrl' && url && !['wa.me', 'api.whatsapp.com', 'whatsapp.com', 'www.whatsapp.com'].includes(new URL(url).hostname)) return ''
    return url
  }
  if (field === 'instagram') {
    if (/^@?[a-z0-9._]{1,30}$/i.test(value)) return `@${value.replace(/^@/, '')}`
    const url = publicWebUrl(value)
    return url && /^(www\.)?instagram\.com$/.test(new URL(url).hostname) ? url : ''
  }
  return value
}

// Only accept values extracted from the search report with URLs actually returned by the search provider.
export function sanitizeAiResult(raw: unknown, sources: AiSource[], report: string, limit: number, now = new Date().toISOString()): AiSearchResult {
  const allowedSources = new Map(sources.map((source) => [publicWebUrl(source.url), source]).filter(([url]) => Boolean(url)) as Array<[string, AiSource]>)
  const result: AiSearchResult = { leads: [], warnings: [], researchedAt: now }
  const rows = isRecord(raw) && Array.isArray(raw.leads) ? raw.leads : []
  const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  const reportText = normalized(report)
  for (const row of rows.slice(0, limit)) {
    if (!isRecord(row) || !Array.isArray(row.facts)) continue
    const lead = Object.fromEntries(aiFields.map((field) => [field, ''])) as unknown as AiLead
    const evidence: AiEvidence[] = []
    for (const fact of row.facts) {
      if (!isRecord(fact) || !aiFields.includes(fact.field as AiField)) continue
      const field = fact.field as AiField, sourceUrl = publicWebUrl(fact.sourceUrl), rawValue = text(fact.value, 1000)
      const value = cleanField(field, rawValue)
      const sourceContent = allowedSources.get(sourceUrl)?.content
      if (!value || !allowedSources.has(sourceUrl) || !(sourceContent ? normalized(sourceContent) : reportText).includes(normalized(rawValue))) continue
      lead[field] = value
      evidence.push({ field, value, sourceUrl })
    }
    if (!lead.company) continue
    if (result.leads.some((item) => normalized(`${item.company}:${item.city}`) === normalized(`${lead.company}:${lead.city}`))) continue
    const urls = new Set(evidence.map((item) => item.sourceUrl))
    const signals: AiTriggerSignal[] = []
    const rawSignals = Array.isArray(row.signals) ? row.signals : []
    for (const candidate of rawSignals.slice(0, 12)) {
      if (!isRecord(candidate)) continue
      const sourceUrl = publicWebUrl(candidate.sourceUrl)
      const excerpt = text(candidate.excerpt, 420)
      const sourceContent = allowedSources.get(sourceUrl)?.content || ''
      const type = text(candidate.type) as AiTriggerSignal['type']
      // A proposed signal is retained only when the cited page actually contains
      // the exact excerpt. Hypotheses without matching evidence are discarded.
      if (!excerpt || !sourceContent || !allowedSources.has(sourceUrl) ||
          !normalized(sourceContent).includes(normalized(excerpt)) ||
          !aiTriggerTypes.includes(type)) continue
      const eventDate = text(candidate.eventDate, 60)
      const channel: AiTriggerSignal['channel'] = /(^|\.)instagram\.com$/i.test(new URL(sourceUrl).hostname) ? 'instagram'
        : /(^|\.)facebook\.com$/i.test(new URL(sourceUrl).hostname) ? 'other' : 'website'
      if (signals.some((item) => item.sourceUrl === sourceUrl && normalized(item.excerpt) === normalized(excerpt))) continue
      signals.push({
        type, title: text(candidate.title, 150) || 'Sinal a revisar',
        excerpt, sourceUrl,
        // A date is never inferred from the research date. It must appear in
        // the page itself, and is otherwise omitted.
        eventDate: eventDate && normalized(sourceContent).includes(normalized(eventDate)) ? eventDate : '',
        channel,
      })
    }
    lead.aiResearch = {
      evidence, sources: [...new Set([...urls, ...signals.map((item) => item.sourceUrl)])].map((url) => ({ url, title: text(allowedSources.get(url)?.title) || new URL(url).hostname })),
      opportunity: text(row.opportunity, 1500), suggestedApproach: text(row.suggestedApproach, 1500),
      missingFields: aiFields.filter((field) => !lead[field]), researchedAt: now, signals,
    }
    result.leads.push(lead)
  }
  if (result.leads.length < limit) result.warnings.push('A pesquisa retornou menos empresas com fontes do que o limite solicitado. Dados não encontrados ficaram em branco.')
  return result
}

export const aiOutputSchema = {
  type: 'object', additionalProperties: false, required: ['leads'], properties: {
    leads: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['facts', 'opportunity', 'suggestedApproach', 'signals'], properties: {
      facts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'value', 'sourceUrl'], properties: {
        field: { type: 'string', enum: [...aiFields] }, value: { type: 'string' }, sourceUrl: { type: 'string' },
      } } }, opportunity: { type: 'string' }, suggestedApproach: { type: 'string' },
      signals: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'title', 'excerpt', 'sourceUrl', 'eventDate'], properties: {
        type: { type: 'string', enum: [...aiTriggerTypes] }, title: { type: 'string' },
        excerpt: { type: 'string' }, sourceUrl: { type: 'string' }, eventDate: { type: 'string' },
      } } },
    } } },
  },
} as const

const cors = {
  'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } })

export function createProspectingAiHandler(deps: {
  authorize(request: Request, input: AiSearchInput): Promise<void>
  configured(): boolean
  search(input: AiSearchInput, signal: AbortSignal): Promise<AiSearchResult>
  enqueue?(request: Request, input: AiSearchInput): Promise<{ jobId: string }>
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    try {
      if (!/^Bearer \S+$/i.test(request.headers.get('authorization') ?? '')) throw new ProspectingError('unauthorized', 401)
      const body = await request.text()
      if (body.length > 32_000) throw new ProspectingError('request_too_large', 413)
      let raw: unknown
      try { raw = JSON.parse(body) } catch { throw new ProspectingError('invalid_json') }
      const input = parseAiSearchInput(raw)
      await deps.authorize(request, input)
      if (input.execution === 'local') {
        if (!deps.enqueue) throw new ProspectingError('local_connector_unavailable', 503)
        return json(await deps.enqueue(request, input), 202)
      }
      if (!deps.configured()) throw new ProspectingError('ai_not_configured', 503)
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120_000)])
      return json(await deps.search(input, signal))
    } catch (error) {
      if (error instanceof ProspectingError) return json({ error: error.code }, error.status)
      if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return json({ error: 'search_timeout' }, 504)
      // Provider errors can contain prompts, request headers and credentials.
      return json({ error: 'ai_provider_failed' }, 502)
    }
  }
}
