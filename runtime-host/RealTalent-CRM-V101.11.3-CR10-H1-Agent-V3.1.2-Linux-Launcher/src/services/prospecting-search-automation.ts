import type { CaptureDraft } from './prospecting-workspace'
import {
  runProspectingProviderSearch,
  type ProspectingProviderSearchInput,
  type ProspectingProviderSearchResult,
} from './prospecting-provider-gateway'

export type ProspectingAutomationStatus = 'idle' | 'planning' | 'searching' | 'completed' | 'cancelled' | 'failed'

export interface ProspectingSearchAutomationInput {
  workspaceId: string
  segment: string
  city: string
  query: string
  targetQuantity: number
  maxRequests?: number
}

export interface ProspectingSearchAutomationProgress {
  status: ProspectingAutomationStatus
  targetQuantity: number
  uniqueFound: number
  requestsCompleted: number
  maxRequests: number
  currentArea: string
  currentQuery: string
  message: string
}

export interface ProspectingSearchAutomationResult {
  drafts: CaptureDraft[]
  uniqueCount: number
  requestsCompleted: number
  areasSearched: string[]
  warnings: string[]
  stoppedReason: 'target_reached' | 'sources_exhausted' | 'request_limit' | 'cancelled'
}

export interface ProspectingSearchAutomationOptions {
  signal?: AbortSignal
  onProgress?: (progress: ProspectingSearchAutomationProgress) => void
  search?: (input: ProspectingProviderSearchInput) => Promise<ProspectingProviderSearchResult>
}

const clean = (value: string) => value.trim().replace(/\s+/g, ' ')
const normalize = (value: string) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '')
const domain = (value: unknown) => String(value ?? '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLocaleLowerCase('pt-BR')

export function prospectingAutomationAreas(city: string): string[] {
  const parts = city.split(/[;\n]+/).map(clean).filter(Boolean)
  return [...new Set(parts.map((item) => item.toLocaleLowerCase('pt-BR')))].map((normalized) => parts.find((item) => item.toLocaleLowerCase('pt-BR') === normalized)!)
}

export function prospectingAutomationQueries(segment: string, query: string): string[] {
  const segmentClean = clean(segment)
  const queryClean = clean(query)
  const values = [queryClean, segmentClean].filter(Boolean)
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = normalize(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function prospectingDraftIdentityKeys(draft: CaptureDraft): string[] {
  const keys: string[] = []
  const placeId = clean(String(draft.placeId ?? ''))
  const cnpj = digits(draft.cnpj).slice(0, 14)
  const phone = digits(draft.phone)
  const website = domain(draft.website)
  const company = normalize(String(draft.company ?? draft.name ?? ''))
  const city = normalize(String(draft.city ?? ''))
  if (placeId) keys.push(`place:${placeId}`)
  if (cnpj.length === 14) keys.push(`cnpj:${cnpj}`)
  if (phone.length >= 10) keys.push(`phone:${phone}`)
  if (website) keys.push(`domain:${website}`)
  if (company) keys.push(`name:${company}:${city}`)
  return keys
}

export function dedupeProspectingDrafts(drafts: CaptureDraft[]): CaptureDraft[] {
  const seen = new Set<string>()
  const output: CaptureDraft[] = []
  for (const draft of drafts) {
    const keys = prospectingDraftIdentityKeys(draft)
    if (keys.some((key) => seen.has(key))) continue
    keys.forEach((key) => seen.add(key))
    output.push(draft)
  }
  return output
}

export async function runProspectingSearchAutomation(
  input: ProspectingSearchAutomationInput,
  options: ProspectingSearchAutomationOptions = {},
): Promise<ProspectingSearchAutomationResult> {
  const targetQuantity = Math.min(100, Math.max(1, Math.round(input.targetQuantity || 20)))
  const maxRequests = Math.min(12, Math.max(1, Math.round(input.maxRequests ?? Math.ceil(targetQuantity / 20) + 2)))
  const areas = prospectingAutomationAreas(input.city)
  const effectiveAreas = areas.length ? areas : ['']
  const queries = prospectingAutomationQueries(input.segment, input.query)
  if (!queries.length) throw new Error('Informe um segmento ou uma busca específica para iniciar a automação.')

  const search = options.search ?? runProspectingProviderSearch
  const warnings = new Set<string>()
  const drafts: CaptureDraft[] = []
  const seen = new Set<string>()
  let requestsCompleted = 0
  let stoppedReason: ProspectingSearchAutomationResult['stoppedReason'] = 'sources_exhausted'

  const emit = (patch: Partial<ProspectingSearchAutomationProgress>) => options.onProgress?.({
    status: 'searching',
    targetQuantity,
    uniqueFound: drafts.length,
    requestsCompleted,
    maxRequests,
    currentArea: '',
    currentQuery: '',
    message: 'Preparando busca automática…',
    ...patch,
  })

  emit({ status: 'planning', message: `Plano criado para até ${targetQuantity} oportunidade(s).` })

  outer: for (const area of effectiveAreas) {
    for (const term of queries) {
      let pageToken: string | null = null
      do {
        if (options.signal?.aborted) { stoppedReason = 'cancelled'; break outer }
        if (requestsCompleted >= maxRequests) { stoppedReason = 'request_limit'; break outer }
        const remaining = targetQuantity - drafts.length
        if (remaining <= 0) { stoppedReason = 'target_reached'; break outer }

        emit({ currentArea: area, currentQuery: term, message: `Pesquisando ${term}${area ? ` em ${area}` : ''}…` })
        const result = await search({
          workspaceId: input.workspaceId,
          source: 'maps',
          segment: input.segment,
          city: area,
          query: term,
          quantity: Math.min(20, Math.max(1, remaining)),
          pageToken,
        })
        requestsCompleted += 1
        result.warnings.forEach((warning) => warnings.add(warning))

        for (const draft of result.drafts) {
          const keys = prospectingDraftIdentityKeys(draft)
          if (keys.some((key) => seen.has(key))) continue
          keys.forEach((key) => seen.add(key))
          drafts.push(draft)
          if (drafts.length >= targetQuantity) break
        }

        emit({ uniqueFound: drafts.length, requestsCompleted, currentArea: area, currentQuery: term, message: `${drafts.length} oportunidade(s) única(s) encontradas.` })
        if (drafts.length >= targetQuantity) { stoppedReason = 'target_reached'; break outer }
        pageToken = result.nextPageToken
      } while (pageToken)
    }
  }

  if (options.signal?.aborted) stoppedReason = 'cancelled'
  else if (requestsCompleted >= maxRequests && drafts.length < targetQuantity) stoppedReason = 'request_limit'
  else if (drafts.length >= targetQuantity) stoppedReason = 'target_reached'

  emit({
    status: stoppedReason === 'cancelled' ? 'cancelled' : 'completed',
    uniqueFound: drafts.length,
    requestsCompleted,
    message: stoppedReason === 'target_reached'
      ? `Meta atingida: ${drafts.length} oportunidade(s) única(s).`
      : stoppedReason === 'request_limit'
        ? `Limite de ${maxRequests} consulta(s) atingido com ${drafts.length} resultado(s) único(s).`
        : `Busca concluída com ${drafts.length} resultado(s) único(s).`,
  })

  return {
    drafts: drafts.slice(0, targetQuantity),
    uniqueCount: Math.min(drafts.length, targetQuantity),
    requestsCompleted,
    areasSearched: effectiveAreas.filter(Boolean),
    warnings: [...warnings],
    stoppedReason,
  }
}
