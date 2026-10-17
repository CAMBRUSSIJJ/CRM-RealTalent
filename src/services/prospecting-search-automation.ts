import type { CaptureDraft } from './prospecting-workspace'
import {
  runProspectingProviderSearch,
  type ProspectingProviderSearchInput,
  type ProspectingProviderSearchResult,
} from './prospecting-provider-gateway'
import {
  buildDeterministicProspectingSearchPlan,
  prospectingSearchPlanSummary,
  sanitizeProspectingSearchPlan,
  verifyProspectingDraft,
  type ProspectingSearchPlan,
  type ProspectingSearchPlanContext,
  type ProspectingSearchPlanInput,
} from './prospecting-search-intelligence'

export type ProspectingAutomationStatus = 'idle' | 'planning' | 'searching' | 'completed' | 'cancelled' | 'failed'

export interface ProspectingSearchAutomationInput {
  workspaceId: string
  segment: string
  city: string
  query: string
  targetQuantity: number
  maxRequests?: number
  context?: ProspectingSearchPlanContext
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
  plan?: ProspectingSearchPlan
  rejectedCount?: number
  duplicatesFiltered?: number
}

export interface ProspectingSearchAutomationResult {
  drafts: CaptureDraft[]
  uniqueCount: number
  requestsCompleted: number
  areasSearched: string[]
  warnings: string[]
  stoppedReason: 'target_reached' | 'sources_exhausted' | 'request_limit' | 'cancelled'
  plan: ProspectingSearchPlan
  rejectedCount: number
  duplicatesFiltered: number
  adaptations: string[]
}

export interface ProspectingSearchAutomationOptions {
  signal?: AbortSignal
  onProgress?: (progress: ProspectingSearchAutomationProgress) => void
  search?: (input: ProspectingProviderSearchInput) => Promise<ProspectingProviderSearchResult>
  planSearch?: (input: ProspectingSearchPlanInput, baseline: ProspectingSearchPlan) => Promise<Partial<ProspectingSearchPlan> | ProspectingSearchPlan | null>
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
  const search = options.search ?? runProspectingProviderSearch
  const warnings = new Set<string>()
  const drafts: CaptureDraft[] = []
  const seen = new Set<string>()
  const adaptations: string[] = []
  let requestsCompleted = 0
  let rejectedCount = 0
  let duplicatesFiltered = 0
  let stoppedReason: ProspectingSearchAutomationResult['stoppedReason'] = 'sources_exhausted'

  const planInput: ProspectingSearchPlanInput = { segment: input.segment, city: input.city, query: input.query, context: input.context }
  const baselinePlan = buildDeterministicProspectingSearchPlan(planInput)
  if (!baselinePlan.queries.length) throw new Error('Informe um segmento ou uma busca específica para iniciar a automação.')
  let plan = baselinePlan

  const emit = (patch: Partial<ProspectingSearchAutomationProgress>) => options.onProgress?.({
    status: 'searching',
    targetQuantity,
    uniqueFound: drafts.length,
    requestsCompleted,
    maxRequests,
    currentArea: '',
    currentQuery: '',
    message: 'Preparando busca inteligente…',
    plan,
    rejectedCount,
    duplicatesFiltered,
    ...patch,
  })

  emit({ status: 'planning', message: `Interpretando a busca para até ${targetQuantity} oportunidade(s)…` })
  if (options.planSearch) {
    try {
      const aiPlan = await options.planSearch(planInput, baselinePlan)
      plan = sanitizeProspectingSearchPlan(aiPlan, baselinePlan)
    } catch {
      warnings.add('A Agent não conseguiu refinar o plano nesta tentativa; a busca continuou com o planejador semântico local.')
      plan = baselinePlan
    }
  }

  const effectiveAreas = plan.areas.length ? plan.areas : ['']
  const queries = plan.queries.map((item) => item.term)
  emit({ status: 'planning', plan, message: prospectingSearchPlanSummary(plan) })

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

        let acceptedInBatch = 0
        let duplicatesInBatch = 0
        let rejectedInBatch = 0
        for (const draft of result.drafts) {
          const verification = verifyProspectingDraft(draft, plan, area)
          if (!verification.accept) {
            rejectedCount += 1
            rejectedInBatch += 1
            continue
          }
          const keys = prospectingDraftIdentityKeys(draft)
          if (keys.some((key) => seen.has(key))) {
            duplicatesFiltered += 1
            duplicatesInBatch += 1
            continue
          }
          keys.forEach((key) => seen.add(key))
          drafts.push({
            ...draft,
            searchIntelligence: {
              confidence: verification.confidence,
              reasons: verification.reasons,
              warnings: verification.warnings,
              query: term,
              area,
              planner: plan.planner,
            },
          })
          acceptedInBatch += 1
          if (drafts.length >= targetQuantity) break
        }

        emit({
          uniqueFound: drafts.length,
          requestsCompleted,
          currentArea: area,
          currentQuery: term,
          rejectedCount,
          duplicatesFiltered,
          message: `${drafts.length} oportunidade(s) válida(s) · ${rejectedCount} ruído(s) filtrado(s) · ${duplicatesFiltered} duplicidade(s).`,
        })
        if (drafts.length >= targetQuantity) { stoppedReason = 'target_reached'; break outer }

        const rawCount = result.drafts.length
        const acceptanceRatio = rawCount ? acceptedInBatch / rawCount : 0
        const duplicateRatio = rawCount ? duplicatesInBatch / rawCount : 0
        const shouldAdaptForQuality = rawCount >= 5 && acceptanceRatio < 0.2
        const shouldAdaptForDuplicates = rawCount >= 5 && duplicateRatio > 0.7
        const emptyUsefulBatch = rawCount > 0 && acceptedInBatch === 0 && rejectedInBatch + duplicatesInBatch === rawCount

        if ((shouldAdaptForQuality || shouldAdaptForDuplicates || emptyUsefulBatch) && result.nextPageToken) {
          const reason = shouldAdaptForDuplicates
            ? `Consulta “${term}” saturou em duplicidades; avancei para outra variação sem gastar outra página.`
            : `Consulta “${term}” trouxe baixa aderência; refinei a estratégia e avancei para outra variação.`
          adaptations.push(reason)
          warnings.add(reason)
          pageToken = null
        } else {
          pageToken = result.nextPageToken
        }
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
    rejectedCount,
    duplicatesFiltered,
    message: stoppedReason === 'target_reached'
      ? `Meta atingida: ${drafts.length} oportunidade(s) válida(s).`
      : stoppedReason === 'request_limit'
        ? `Limite de ${maxRequests} consulta(s) atingido com ${drafts.length} resultado(s) válido(s).`
        : `Busca inteligente concluída com ${drafts.length} resultado(s) válido(s).`,
  })

  return {
    drafts: drafts.slice(0, targetQuantity),
    uniqueCount: Math.min(drafts.length, targetQuantity),
    requestsCompleted,
    areasSearched: effectiveAreas.filter(Boolean),
    warnings: [...warnings],
    stoppedReason,
    plan,
    rejectedCount,
    duplicatesFiltered,
    adaptations,
  }
}
