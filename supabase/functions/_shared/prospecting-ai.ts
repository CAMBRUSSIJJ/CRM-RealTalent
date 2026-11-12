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
  researchStatus?: 'completed' | 'partial'
  instagramDiscovery?: AiInstagramDiscovery
  researchPlan?: AiG6ResearchPlan
  commercialBrief?: AiG6CommercialBrief
  leadIntelligence?: AiG7LeadIntelligence
}
export class ProspectingError extends Error {
  code: string
  status: number
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status }
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
