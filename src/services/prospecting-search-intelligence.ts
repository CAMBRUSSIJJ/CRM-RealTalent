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

export interface ProspectingDraftVerification {
  accept: boolean
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
  const exclusions = ['notícias', 'artigos', 'vagas', 'cursos']
  if (!/fornecedor|distribuidor|atacad/.test(text)) exclusions.push('fornecedores')
  return exclusions
}

export function buildDeterministicProspectingSearchPlan(input: ProspectingSearchPlanInput): ProspectingSearchPlan {
  const segment = clean(input.segment)
  const query = clean(input.query)
  const requestedAreas = unique(input.city.split(/[;\n]+/))
  const preferredAreas = requestedAreas.length ? [] : unique(input.context?.preferredCities ?? [], 4)
  const areas = [...requestedAreas, ...preferredAreas]

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
    planner: 'semantic-fallback-v3',
  }
}

const sanitizeQuery = (entry: Partial<ProspectingSearchPlanQuery>, fallbackReason = 'planejamento semântico'): ProspectingSearchPlanQuery | null => {
  const term = clean(entry.term).slice(0, 160)
  if (!term) return null
  const priority = Number(entry.priority)
  return {
    term,
    priority: Number.isFinite(priority) ? Math.max(0, Math.min(100, Math.round(priority))) : 50,
    reason: clean(entry.reason).slice(0, 180) || fallbackReason,
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

  return {
    intent: clean(value.intent).slice(0, 300) || baseline.intent,
    primarySegment: clean(value.primarySegment).slice(0, 180) || baseline.primarySegment,
    queries: queries.length ? queries : baseline.queries,
    areas: unique([...(Array.isArray(value.areas) ? value.areas : []), ...baseline.areas], 8),
    desiredSignals: unique([...(Array.isArray(value.desiredSignals) ? value.desiredSignals : []), ...baseline.desiredSignals], 12),
    exclusions: unique([...(Array.isArray(value.exclusions) ? value.exclusions : []), ...baseline.exclusions], 12),
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
    input.city ? `Região informada: ${clean(input.city)}.` : '',
    'Normalize a intenção e identifique critérios úteis, sem transformar a busca em artigos, notícias, cursos ou assuntos genéricos.',
  ].filter(Boolean).join(' ')

  const semantic = await interpretSalesLanguage(prompt, { conversationContext: 'Garimpo: planejar descoberta de empresas reais. Não executar alteração no CRM.' })
  if (!semantic?.interpretation) return baseline

  const canonical = clean(semantic.interpretation.canonical_request)
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

const draftText = (draft: CaptureDraft) => normalize([
  draft.company,
  draft.name,
  draft.description,
  draft.category,
  draft.primaryType,
  draft.placeType,
  draft.notes,
].filter(Boolean).join(' '))

const hasBusinessSignal = (draft: CaptureDraft) => Boolean(
  clean(draft.placeId)
  || clean(draft.cnpj)
  || clean(draft.phone)
  || clean(draft.website)
  || clean(draft.address)
  || clean(draft.googleMapsUrl),
)

export function verifyProspectingDraft(
  draft: CaptureDraft,
  plan: ProspectingSearchPlan,
  area = '',
): ProspectingDraftVerification {
  const reasons: string[] = []
  const warnings: string[] = []
  const text = draftText(draft)
  const company = clean(draft.company || draft.name)
  const placeType = normalize(draft.placeType || draft.primaryType || draft.category)
  const businessStatus = normalize(draft.businessStatus)
  const strongBusinessSignal = hasBusinessSignal(draft)

  let confidence = company ? 28 : 4
  if (clean(draft.placeId)) { confidence += 26; reasons.push('local confirmado pelo provedor') }
  if (clean(draft.cnpj)) { confidence += 24; reasons.push('CNPJ disponível') }
  if (clean(draft.phone)) confidence += 10
  if (clean(draft.website)) confidence += 8
  if (clean(draft.address) || clean(draft.city)) confidence += 8

  if (businessStatus && /closed|encerrad|inativ/.test(businessStatus)) {
    return { accept: false, confidence: Math.min(20, confidence), reasons, warnings: ['empresa/local marcado como encerrado'] }
  }

  const obviousContent = /\b(artigo|noticia|blog|curso|vaga|emprego|tutorial|guia|lista de|ranking de)\b/.test(text)
    || /\b(content|directory|web document)\b/.test(placeType)
  if (obviousContent && !strongBusinessSignal) {
    return { accept: false, confidence: Math.min(25, confidence), reasons, warnings: ['resultado parece conteúdo, diretório ou assunto e não uma empresa real'] }
  }

  const terms = plan.queries.flatMap((item) => normalize(item.term).split(' ')).filter((token) => token.length >= 4)
  const overlap = terms.some((token) => text.includes(token))
  if (overlap) { confidence += 10; reasons.push('aderência semântica à busca') }
  else warnings.push('segmento não confirmado no texto retornado')

  if (area && clean(draft.city)) {
    const areaNorm = normalize(area)
    const cityNorm = normalize(draft.city)
    const areaTokens = areaNorm.split(' ').filter((token) => token.length >= 4)
    const locationMatch = areaTokens.some((token) => cityNorm.includes(token) || normalize(draft.address).includes(token))
    if (locationMatch) { confidence += 7; reasons.push('região compatível') }
    else warnings.push('região retornada difere da área pesquisada')
  }

  if (!company) warnings.push('resultado sem nome empresarial claro')
  if (!strongBusinessSignal) warnings.push('poucos sinais verificáveis de empresa/local')
  confidence = Math.max(0, Math.min(100, confidence))

  // Google Places pode devolver categorias pouco descritivas. Não rejeitamos um local com placeId/endereço
  // apenas por baixa sobreposição textual; hard reject fica reservado a conteúdo/encerrados/sem identidade.
  const accept = Boolean(company) && (strongBusinessSignal || confidence >= 48)
  return { accept, confidence, reasons: unique(reasons, 4), warnings: unique(warnings, 4) }
}

export function prospectingSearchPlanSummary(plan: ProspectingSearchPlan) {
  const terms = plan.queries.slice(0, 4).map((item) => item.term).join(', ')
  const areas = plan.areas.slice(0, 3).join(', ')
  return `IA entendeu: ${plan.primarySegment || plan.intent}${areas ? ` · região: ${areas}` : ''}${terms ? ` · variações: ${terms}` : ''}`
}
