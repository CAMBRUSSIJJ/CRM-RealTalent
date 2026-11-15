import type { AiSearchResult } from '../../supabase/functions/_shared/prospecting-ai'
import { publicWebUrl } from '../../supabase/functions/_shared/prospecting-ai'
import type { ProspectRecord } from './prospecting-workspace'
import { prospectDataQuality } from './prospecting-data-layer'
import type { CrossSourceReview } from './prospecting-cross-source-review'

export interface ProspectEvidenceView {
  url: string
  title: string
  origins: Array<'discovery' | 'investigation'>
  status: 'read' | 'observed' | 'blocked' | 'unavailable'
  verification: 'confirmed' | 'observed' | 'divergent'
  facts: string[]
  collectedAt: string
  prospectId: string
}
export function unifiedProspectEvidence(prospect: ProspectRecord, result: AiSearchResult | null, review: CrossSourceReview | null): ProspectEvidenceView[] {
  const sources = new Map<string, ProspectEvidenceView>()
  const add = (raw: string, title: string, origin: 'discovery' | 'investigation', status: ProspectEvidenceView['status'] = 'observed') => {
    const safe = publicWebUrl(raw)
    if (!safe) return null
    const parsed = new URL(safe); parsed.hash = ''
    const url = parsed.href
    const existing = sources.get(url)
    if (existing) {
      if (!existing.origins.includes(origin)) existing.origins.push(origin)
      if (origin === 'investigation' && result) existing.collectedAt = result.researchedAt
      if (existing.title === 'Fonte da descoberta' && origin === 'investigation') existing.title = title || parsed.hostname
      return existing
    }
    const source: ProspectEvidenceView = { url, title: title || parsed.hostname, origins: [origin], status,
      verification: 'observed', facts: [], collectedAt: origin === 'discovery' ? prospect.createdAt : result?.researchedAt || prospect.updatedAt, prospectId: prospect.id }
    sources.set(url, source); return source
  }
  for (const raw of [prospect.rawData.sourceUrl, prospect.rawData.source_url, prospect.sourceDetail])
    if (typeof raw === 'string') add(raw, 'Fonte da descoberta', 'discovery')
  for (const source of review?.sources || []) add(source.url, source.title, 'investigation')
  for (const item of result?.sourceReads || []) {
    const source = add(item.url, new URL(item.url).hostname, 'investigation', item.status)
    if (source) source.status = item.status
  }
  const intelligence = result?.leadIntelligence
  for (const fact of [...(intelligence?.offerings || []), ...(intelligence?.prices || []), ...(intelligence?.positioning || []), ...(intelligence?.reputation || [])]) {
    const source = add(fact.sourceUrl, 'Evidência da investigação', 'investigation')
    if (source && !source.facts.includes(fact.excerpt)) source.facts.push(fact.excerpt)
  }
  for (const field of review?.fields || []) for (const candidate of field.candidates) for (const url of candidate.urls) {
    const source = add(url, 'Evidência cadastral', 'investigation')
    if (!source) continue
    const fact = `${field.label}: ${candidate.value}`
    if (!source.facts.includes(fact)) source.facts.push(fact)
    if (field.status === 'divergent') source.verification = 'divergent'
    else if (field.status === 'confirmed' && source.verification !== 'divergent') source.verification = 'confirmed'
  }
  const instagram = result?.instagramDiscovery
  if (instagram?.profileUrl && ['blocked', 'unavailable'].includes(instagram.profileAccess || '')) {
    const source = add(instagram.profileUrl, 'Instagram', 'investigation', instagram.profileAccess === 'blocked' ? 'blocked' : 'unavailable')
    if (source && !source.facts.length) source.status = instagram.profileAccess === 'blocked' ? 'blocked' : 'unavailable'
  }
  return [...sources.values()]
}

export function commercialReviewActions(prospect: ProspectRecord, result: AiSearchResult | null) {
  const quality = prospectDataQuality(prospect)
  const actions: Array<{ kind: 'verification' | 'hypothesis'; title: string; detail: string; question: string; sourceUrls: string[] }> = []
  if (quality.approvalIssues.length || quality.blockers.length) actions.push({ kind: 'verification', title: 'Confirmar identidade e localização',
    detail: [...quality.blockers, ...quality.approvalIssues].join(' · '), question: 'Qual é o endereço oficial e como podemos confirmar que se trata da mesma empresa?', sourceUrls: [] })
  const intelligence = result?.leadIntelligence
  const brief = result?.commercialBrief
  const questions = intelligence?.questions.length ? intelligence.questions : brief?.questions || []
  const hypotheses = intelligence?.hypotheses.length ? intelligence.hypotheses : brief?.hypotheses || []
  const fact = intelligence?.offerings[0] || intelligence?.prices[0] || intelligence?.positioning[0]
  if (fact || brief?.knownFacts.length) actions.push({ kind: 'hypothesis', title: fact ? `Explorar a oferta: ${fact.label}` : 'Preparar conversa de diagnóstico',
    detail: hypotheses[0] || 'A informação publicada orienta a conversa; uma necessidade comercial ainda precisa ser validada.',
    question: questions[0] || 'Como funciona a contratação dos serviços publicados?',
    sourceUrls: [fact?.sourceUrl || brief?.knownFacts[0]?.sourceUrl || ''].filter((url) => Boolean(publicWebUrl(url))) })
  const trigger = brief?.signals[0]
  if (trigger && publicWebUrl(trigger.sourceUrl)) actions.push({ kind: 'hypothesis', title: `Validar o contexto: ${trigger.title}`,
    detail: trigger.excerpt, question: 'Esse anúncio já trouxe mudanças à operação? Há algum objetivo que faça sentido discutir agora?', sourceUrls: [trigger.sourceUrl] })
  return actions.slice(0, 3)
}
