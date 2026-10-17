import type { CaptureDraft } from './prospecting-workspace'
import { interpretSalesLanguage } from './realtalent-semantic-language-client'

export interface ProspectingSearchPlanQuery {
  term: string
  priority: number
  reason: string
}

export interface ProspectingSearchPlanContext {
  preferredSegments?: string[]
  preferredCities?: string[]
  tags?: string[]
}

export interface ProspectingSearchPlanInput {
  segment: string
  city: string
  query: string
  context?: ProspectingSearchPlanContext
}

export interface ProspectingSearchPlan {
  intent: string
  primarySegment: string
  queries: ProspectingSearchPlanQuery[]
  areas: string[]
  desiredSignals: string[]
  exclusions: string[]
  source: 'ai' | 'deterministic'
  planner: string
}

export type ProspectingSearchDecision = 'ready' | 'review' | 'reject'
export type ProspectingEntityClass = 'business' | 'ambiguous' | 'content' | 'directory'
export type ProspectingGeoConfidence = 'confirmed' | 'probable' | 'unknown' | 'mismatch'

export interface ProspectingSearchSession {
  id: string
  createdAt: string
  intent: string
  segment: string
  areas: string[]
  radiusKm: number | null
  targetQuantity: number
  plan: ProspectingSearchPlan
}

export interface ProspectingDraftVerification {
  accept: boolean
  decision: ProspectingSearchDecision
  entityClass: ProspectingEntityClass
  geoConfidence: ProspectingGeoConfidence
  confidence: number
  reasons: string[]
  warnings: string[]
}

const clean = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ')
const normalize = (value: unknown) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const unique = (values: string[], limit = 20) => {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values.map(clean).filter(Boolean)) {
    const key = normalize(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(value)
    if (output.length >= limit) break
  }
  return output
}

export function decodeProspectingHtmlEntities(value: unknown): string {
  return clean(String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>'))
}

export function sanitizeProspectingDraft(draft: CaptureDraft): CaptureDraft {
  const textFields: Array<keyof CaptureDraft> = [
    'name', 'company', 'description', 'category', 'primaryType', 'placeType', 'notes', 'city', 'address',
    'website', 'phone', 'email', 'instagram', 'sourceDetail', 'businessStatus',
  ]
  const next = { ...draft }
  for (const field of textFields) {
    const value = next[field]
    if (typeof value === 'string') (next as Record<string, unknown>)[field] = decodeProspectingHtmlEntities(value)
  }
  return next
}

const semanticVariants = (segment: string, query: string): string[] => {
  const text = normalize(`${segment} ${query}`)
  const variants: string[] = []
  const add = (...items: string[]) => variants.push(...items)

  if (/\b(odont|dentist|dental|implantodont)\w*/.test(text)) add('clínica odontológica', 'dentista', 'implantodontia', 'odontologia estética')
  if (/\b(barbear|barbeir)\w*/.test(text)) add('barbearia', 'barbeiro', 'barbershop')
  if (/\b(restaurante|gastronom|bistro|pizzaria)\w*/.test(text)) add('restaurante', 'bistrô', 'pizzaria', 'gastronomia')
  if (/\b(academia|fitness|musculacao|crossfit)\w*/.test(text)) add('academia', 'centro de treinamento', 'fitness', 'crossfit')
  if (/\b(imobili|imoveis|corretor)\w*/.test(text)) add('imobiliária', 'corretora de imóveis', 'corretor de imóveis')
  if (/\b(advog|juridic)\w*/.test(text)) add('escritório de advocacia', 'advogado', 'serviços jurídicos')
  if (/\b(contab|contador)\w*/.test(text)) add('escritório contábil', 'contabilidade', 'contador')
  if (/\b(veterin|pet shop|petshop)\w*/.test(text)) add('clínica veterinária', 'hospital veterinário', 'pet shop')
  if (/\b(estetica|estetico|beleza|harmonizacao)\w*/.test(text)) add('clínica de estética', 'estética avançada', 'harmonização facial')
  if (/\b(hotel|pousada|hospedagem)\w*/.test(text)) add('hotel', 'pousada', 'hospedagem')
  if (/\b(software|saas|sistema de gestao|tecnologia)\w*/.test(text)) add('empresa de software', 'software empresarial', 'sistema de gestão')
  if (/\b(clinica|medic|saude)\w*/.test(text) && !/odont|veterin/.test(text)) add('clínica médica', 'centro médico', 'clínica particular')

  return unique(variants, 8)
}

const desiredSignalsFromText = (segment: string, query: string) => {
  const text = normalize(`${segment} ${query}`)
  const signals: string[] = []
  if (/particular|privad/.test(text)) signals.push('atendimento particular')
  if (/implant/.test(text)) signals.push('implantes')
  if (/agend|booking|consulta/.test(text)) signals.push('agendamento')
  if (/site|digital|online/.test(text)) signals.push('presença digital')
  if (/whatsapp|telefone|contato/.test(text)) signals.push('canal de contato')
  if (/premium|alto padrao|luxo/.test(text)) signals.push('posicionamento premium')
  return unique(signals, 8)
}

const defaultExclusions = (query: string) => {
  const text = normalize(query)
  const exclusions = [
    'notícias', 'artigos', 'blogs', 'vagas', 'empregos', 'cursos', 'listas', 'rankings', 'guias',
    'top 10', 'melhores empresas', 'best companies', 'diretórios', 'marketplaces',
  ]
  if (!/fornecedor|distribuidor|atacad/.test(text)) exclusions.push('fornecedores', 'distribuidores')
  return exclusions
}

export function buildDeterministicProspectingSearchPlan(input: ProspectingSearchPlanInput): ProspectingSearchPlan {
  const segment = clean(input.segment)
  const query = clean(input.query)
  // Search Integrity 4.1: ICP pode sugerir uma cidade na UI, mas nunca vira território implícito.
  const areas = unique(input.city.split(/[;\n]+/))
  const preferredSegments = unique(input.context?.preferredSegments ?? [], 4)
  const variants = semanticVariants(segment, query)
  const rawTerms = [
    query,
    segment,
    query && segment && normalize(query) !== normalize(segment) ? `${segment} ${query}` : '',
    ...variants,
    ...preferredSegments,
  ]
  const terms = unique(rawTerms, 10)
  const queries: ProspectingSearchPlanQuery[] = terms.map((term, index) => ({
    term,
    priority: Math.max(10, 100 - index * 8),
    reason: index === 0 && query ? 'pedido explícito do usuário'
      : index <= 1 ? 'segmento principal'
        : variants.some((variant) => normalize(variant) === normalize(term)) ? 'expansão semântica'
          : preferredSegments.some((candidate) => normalize(candidate) === normalize(term)) ? 'afinidade com o ICP'
            : 'combinação de intenção e segmento',
  }))

  return {
    intent: query || segment || 'descobrir empresas com potencial comercial',
    primarySegment: segment || query,
    queries,
    areas,
    desiredSignals: desiredSignalsFromText(segment, query),
    exclusions: defaultExclusions(query),
    source: 'deterministic',
    planner: 'search-integrity-v4.1-fallback',
  }
}

const sanitizeQuery = (entry: Partial<ProspectingSearchPlanQuery>, fallbackReason = 'planejamento semântico'): ProspectingSearchPlanQuery | null => {
  const term = decodeProspectingHtmlEntities(entry.term).slice(0, 160)
  if (!term) return null
  const priority = Number(entry.priority)
  return {
    term,
    priority: Number.isFinite(priority) ? Math.max(0, Math.min(100, Math.round(priority))) : 50,
    reason: decodeProspectingHtmlEntities(entry.reason).slice(0, 180) || fallbackReason,
  }
}

export function sanitizeProspectingSearchPlan(
  value: Partial<ProspectingSearchPlan> | null | undefined,
  baseline: ProspectingSearchPlan,
): ProspectingSearchPlan {
  if (!value) return baseline
  const candidates = Array.isArray(value.queries) ? value.queries : []
  const merged = [...baseline.queries, ...candidates]
    .map((entry) => sanitizeQuery(entry))
    .filter((entry): entry is ProspectingSearchPlanQuery => Boolean(entry))
  const seen = new Set<string>()
  const queries = merged
    .filter((entry) => {
      const key = normalize(entry.term)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 12)

  // O território explicitado pelo usuário é imutável para a IA. A Agent pode refinar consultas,
  // sinais e exclusões, mas não trocar Canoas por outra cidade sem uma nova ação do usuário.
  const areas = baseline.areas.length
    ? baseline.areas
    : unique(Array.isArray(value.areas) ? value.areas : [], 8)

  return {
    intent: decodeProspectingHtmlEntities(value.intent).slice(0, 300) || baseline.intent,
    primarySegment: decodeProspectingHtmlEntities(value.primarySegment).slice(0, 180) || baseline.primarySegment,
    queries: queries.length ? queries : baseline.queries,
    areas,
    desiredSignals: unique([...(Array.isArray(value.desiredSignals) ? value.desiredSignals : []), ...baseline.desiredSignals], 12),
    exclusions: unique([...(Array.isArray(value.exclusions) ? value.exclusions : []), ...baseline.exclusions], 20),
    source: value.source === 'ai' ? 'ai' : baseline.source,
    planner: clean(value.planner).slice(0, 120) || baseline.planner,
  }
}

export async function planProspectingSearchWithAgent(
  input: ProspectingSearchPlanInput,
  baseline = buildDeterministicProspectingSearchPlan(input),
): Promise<ProspectingSearchPlan> {
  const prompt = [
    'Interprete este pedido como uma busca comercial por EMPRESAS/LOCAIS reais no Garimpo.',
    `Pedido: ${clean(input.query) || clean(input.segment)}.`,
    input.segment ? `Segmento informado: ${clean(input.segment)}.` : '',
    input.city ? `Região informada pelo usuário e que NÃO pode ser alterada: ${clean(input.city)}.` : '',
    'Crie termos curtos de busca comercial e sinais úteis. Não retorne artigos, rankings, listas, diretórios, notícias, cursos, vagas, fornecedores ou assuntos genéricos.',
  ].filter(Boolean).join(' ')

  const semantic = await interpretSalesLanguage(prompt, { conversationContext: 'Garimpo Search Integrity 4.1: planejar descoberta de empresas reais. O território informado é imutável. Não executar alteração no CRM.' })
  if (!semantic?.interpretation) return baseline

  const canonical = decodeProspectingHtmlEntities(semantic.interpretation.canonical_request)
  const criteria = unique(semantic.interpretation.entities?.criteria ?? [], 8)
  const aiTerms = unique([
    canonical && canonical.length <= 160 ? canonical : '',
    ...criteria,
  ], 8).filter((term) => normalize(term) !== normalize(input.city))

  if (!aiTerms.length) return baseline
  return sanitizeProspectingSearchPlan({
    intent: canonical || baseline.intent,
    queries: aiTerms.map((term, index) => ({ term, priority: Math.max(55, 92 - index * 6), reason: 'interpretação da Agent' })),
    desiredSignals: criteria,
    source: 'ai',
    planner: `${semantic.provider}:${semantic.model}`,
  }, baseline)
}

export function createProspectingSearchSession(
  input: ProspectingSearchPlanInput & { targetQuantity: number; radiusKm?: number | null },
  plan: ProspectingSearchPlan,
): ProspectingSearchSession {
  if (!plan.areas.length) throw new Error('Informe uma cidade, região, raio ou área desenhada antes de iniciar o Garimpo.')
  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return {
    id: `search-${randomPart}`,
    createdAt: new Date().toISOString(),
    intent: plan.intent,
    segment: plan.primarySegment || clean(input.segment),
    areas: [...plan.areas],
    radiusKm: Number.isFinite(Number(input.radiusKm)) ? Math.max(1, Number(input.radiusKm)) : null,
    targetQuantity: Math.max(1, Math.round(Number(input.targetQuantity) || 1)),
    plan,
  }
}

const draftText = (draft: CaptureDraft) => normalize([
  draft.company,
  draft.name,
  draft.description,
  draft.category,
  draft.primaryType,
  draft.placeType,
  draft.notes,
].filter(Boolean).join(' '))

const hardBusinessIdentity = (draft: CaptureDraft) => Boolean(
  clean(draft.placeId)
  || clean(draft.cnpj)
  || clean(draft.googleMapsUrl),
)

const moderateBusinessIdentity = (draft: CaptureDraft) => Boolean(
  (clean(draft.phone) && clean(draft.company || draft.name))
  || clean(draft.address)
  || (clean(draft.website) && clean(draft.company || draft.name)),
)

const contentPattern = /\b(?:top\s*\d+|the\s+best\s+\d*|best\s+\d+|best\s+[a-z ]+\s+in|melhores|lista\s+de|ranking|guia\s+de|artigo|noticia|blog|curso|vaga|emprego|tutorial|directory|diretorio|marketplace|reviews?|perto\s+de\s+mim|near\s+me)\b/
const directoryPattern = /\b(?:yelp|tripadvisor|foursquare|guiamais|telelistas|solutudo|apontador|listamais|diretorio|directory)\b/

function classifyEntity(draft: CaptureDraft): ProspectingEntityClass {
  const text = draftText(draft)
  const placeType = normalize(draft.placeType || draft.primaryType || draft.category)
  const explicitContent = contentPattern.test(text) || /\b(content|web document)\b/.test(placeType)
  const explicitDirectory = directoryPattern.test(text) || /\bdirectory\b/.test(placeType)
  if (explicitDirectory && !hardBusinessIdentity(draft)) return 'directory'
  if (explicitContent && !hardBusinessIdentity(draft)) return 'content'
  if (hardBusinessIdentity(draft) || moderateBusinessIdentity(draft)) return 'business'
  return 'ambiguous'
}

function geoDecision(draft: CaptureDraft, area: string): { confidence: ProspectingGeoConfidence; reason: string } {
  const expected = normalize(area).split(' ').filter((token) => token.length >= 3)
  const explicitCity = normalize(draft.city)
  const address = normalize(draft.address)
  const hasCoordinates = Number.isFinite(Number((draft as Record<string, unknown>).latitude)) && Number.isFinite(Number((draft as Record<string, unknown>).longitude))
  if (!area) return { confidence: 'unknown', reason: 'território não informado' }
  const areaCity = normalize(area.split(',')[0] || '')
  if (explicitCity) {
    if (areaCity && explicitCity !== areaCity && !explicitCity.includes(areaCity) && !areaCity.includes(explicitCity)) return { confidence: 'mismatch', reason: `cidade divergente: ${draft.city}` }
    return { confidence: 'confirmed', reason: 'cidade confirmada pelo resultado' }
  }
  if (address && expected.some((token) => address.includes(token))) return { confidence: 'probable', reason: 'endereço compatível com o território' }
  if (hasCoordinates) return { confidence: 'probable', reason: 'coordenadas fornecidas pelo provedor; cidade não declarada' }
  return { confidence: 'unknown', reason: 'local não confirmado pelo resultado' }
}

export function verifyProspectingDraft(
  rawDraft: CaptureDraft,
  plan: ProspectingSearchPlan,
  area = '',
): ProspectingDraftVerification {
  const draft = sanitizeProspectingDraft(rawDraft)
  const reasons: string[] = []
  const warnings: string[] = []
  const text = draftText(draft)
  const company = clean(draft.company || draft.name)
  const businessStatus = normalize(draft.businessStatus)
  const entityClass = classifyEntity(draft)
  const geo = geoDecision(draft, area)

  let confidence = company ? 24 : 0
  if (clean(draft.placeId)) { confidence += 28; reasons.push('local confirmado pelo provedor') }
  if (clean(draft.cnpj)) { confidence += 26; reasons.push('CNPJ disponível') }
  if (clean(draft.googleMapsUrl)) confidence += 18
  if (clean(draft.phone)) confidence += 10
  if (clean(draft.website)) confidence += 6
  if (clean(draft.address)) confidence += 8

  if (businessStatus && /closed|encerrad|inativ/.test(businessStatus)) {
    return { accept: false, decision: 'reject', entityClass, geoConfidence: geo.confidence, confidence: Math.min(20, confidence), reasons, warnings: ['empresa/local marcado como encerrado'] }
  }

  if (entityClass === 'content' || entityClass === 'directory') {
    return {
      accept: false,
      decision: 'reject',
      entityClass,
      geoConfidence: geo.confidence,
      confidence: Math.min(20, confidence),
      reasons,
      warnings: [entityClass === 'directory' ? 'diretório/listagem descartado antes da revisão' : 'conteúdo/listicle descartado antes da revisão'],
    }
  }

  if (geo.confidence === 'mismatch') {
    return { accept: false, decision: 'reject', entityClass, geoConfidence: 'mismatch', confidence: Math.min(30, confidence), reasons, warnings: [geo.reason] }
  }

  const terms = plan.queries.flatMap((item) => normalize(item.term).split(' ')).filter((token) => token.length >= 4)
  const overlap = terms.some((token) => text.includes(token))
  if (overlap) { confidence += 10; reasons.push('aderência semântica à busca') }
  else warnings.push('segmento não confirmado no texto retornado')

  if (geo.confidence === 'confirmed') { confidence += 10; reasons.push(geo.reason) }
  else if (geo.confidence === 'probable') { confidence += 5; reasons.push(geo.reason) }
  else warnings.push(geo.reason)

  if (!company) warnings.push('resultado sem nome empresarial claro')
  if (entityClass === 'ambiguous') warnings.push('identidade empresarial ainda não confirmada')
  confidence = Math.max(0, Math.min(100, confidence))

  const decision: ProspectingSearchDecision = !company
    ? 'reject'
    : entityClass === 'business' && geo.confidence === 'confirmed' && confidence >= 62
      ? 'ready'
      : entityClass === 'business' && geo.confidence === 'probable' && confidence >= 68
        ? 'ready'
        : 'review'

  return {
    accept: decision !== 'reject',
    decision,
    entityClass,
    geoConfidence: geo.confidence,
    confidence,
    reasons: unique(reasons, 5),
    warnings: unique(warnings, 5),
  }
}

export function prospectingSearchPlanSummary(plan: ProspectingSearchPlan) {
  const terms = plan.queries.slice(0, 4).map((item) => item.term).join(', ')
  const areas = plan.areas.slice(0, 3).join(', ')
  return `IA entendeu: ${plan.primarySegment || plan.intent}${areas ? ` · território: ${areas}` : ''}${terms ? ` · variações: ${terms}` : ''}`
}
