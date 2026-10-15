import type { WorkspaceSnapshot } from '../domain/types'
import type { ProspectRecord } from './prospecting-workspace'
import { prospectDataQuality } from './prospecting-data-layer'

export interface ProspectingIcpProfile {
  sampleSize: number
  segments: Array<{ value: string; count: number }>
  cities: Array<{ value: string; count: number }>
  tags: Array<{ value: string; count: number }>
  averageTicket: number
  medianTicket: number
  source: 'won_customers' | 'active_pipeline' | 'workspace_fallback'
}

export interface ProspectingScoreBreakdown {
  fit: number
  potential: number
  contactability: number
  timing: number
  dataQuality: number
}

export interface ProspectingIntelligenceScore {
  prospectId: string
  score: number
  breakdown: ProspectingScoreBreakdown
  reasons: string[]
  warnings: string[]
  opportunitySignals: string[]
}

const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim()
const countBy = (values: string[]) => {
  const map = new Map<string, { label: string; count: number }>()
  values.map((value) => value.trim()).filter(Boolean).forEach((value) => {
    const key = normalize(value)
    if (!key) return
    const current = map.get(key)
    map.set(key, { label: current?.label ?? value.trim(), count: (current?.count ?? 0) + 1 })
  })
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).map((item) => ({ value: item.label, count: item.count }))
}
const median = (values: number[]) => {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const hasTextOverlap = (value: string, candidates: string[]) => {
  const normalized = normalize(value)
  if (!normalized) return false
  const tokens = new Set(normalized.split(' ').filter((item) => item.length >= 3))
  return candidates.some((candidate) => {
    const other = normalize(candidate)
    if (!other) return false
    if (normalized.includes(other) || other.includes(normalized)) return true
    return other.split(' ').filter((item) => item.length >= 3).some((item) => tokens.has(item))
  })
}

export function buildProspectingIcp(snapshot: WorkspaceSnapshot): ProspectingIcpProfile {
  const won = snapshot.leads.filter((lead) => lead.status === 'won')
  const active = snapshot.leads.filter((lead) => lead.status === 'active' && (lead.temperature === 'hot' || lead.priority === 'high' || lead.priority === 'urgent'))
  const sample = won.length ? won : active.length ? active : snapshot.leads
  const companyById = new Map(snapshot.companies.map((company) => [company.id, company]))
  const segments = sample.flatMap((lead) => {
    const company = lead.companyId ? companyById.get(lead.companyId) : null
    return company?.segment ? [company.segment] : []
  })
  const cities = sample.map((lead) => lead.city).filter(Boolean)
  const tags = sample.flatMap((lead) => lead.tags ?? []).filter((tag) => !/^garimpo(?:-|$)/i.test(tag))
  const tickets = sample.map((lead) => Number(lead.value || 0)).filter((value) => value > 0)
  return {
    sampleSize: sample.length,
    segments: countBy(segments).slice(0, 8),
    cities: countBy(cities).slice(0, 8),
    tags: countBy(tags).slice(0, 12),
    averageTicket: tickets.length ? tickets.reduce((sum, value) => sum + value, 0) / tickets.length : 0,
    medianTicket: median(tickets),
    source: won.length ? 'won_customers' : active.length ? 'active_pipeline' : 'workspace_fallback',
  }
}

const rawString = (prospect: ProspectRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = prospect.rawData?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function scoreProspectWithIcp(prospect: ProspectRecord, snapshot: WorkspaceSnapshot, icp = buildProspectingIcp(snapshot)): ProspectingIntelligenceScore {
  const reasons: string[] = []
  const warnings: string[] = []
  const opportunitySignals: string[] = []
  const quality = prospectDataQuality(prospect)
  const category = rawString(prospect, 'category', 'segment', 'cnaeDescription', 'subcategory') || prospect.description
  const topSegments = icp.segments.slice(0, 5).map((item) => item.value)
  const topCities = icp.cities.slice(0, 5).map((item) => item.value)

  let fit = 8
  if (topSegments.length && hasTextOverlap(category, topSegments)) { fit += 14; reasons.push('Segmento parecido com clientes de melhor desempenho') }
  else if (!topSegments.length) fit += 8
  if (prospect.city && topCities.some((city) => normalize(city) === normalize(prospect.city))) { fit += 8; reasons.push('Região recorrente na carteira comercial') }
  fit = Math.min(30, fit)

  let potential = 5
  if (prospect.website) { potential += 5; reasons.push('Presença digital própria confirmada') }
  if (prospect.instagram) potential += 4
  if (prospect.followers && prospect.followers >= 1000) { potential += 4; reasons.push('Audiência digital relevante') }
  if (prospect.followers && prospect.followers >= 5000) potential += 3
  if (prospect.website && !prospect.bookingUrl) { potential += 4; opportunitySignals.push('Site identificado sem link de agendamento confirmado') }
  if (prospect.instagram && !prospect.website) { potential += 3; opportunitySignals.push('Presença social sem site próprio confirmado') }
  if (!prospect.systemName) opportunitySignals.push('Nenhum sistema/CRM identificado nos dados atuais')
  potential = Math.min(25, potential)

  let contactability = 0
  if (prospect.phone) contactability += 9
  if (prospect.email) contactability += 5
  if (prospect.website || prospect.instagram) contactability += 4
  if (prospect.cnpj) contactability += 2
  if (contactability >= 14) reasons.push('Boa capacidade de contato e validação')
  else if (contactability <= 5) warnings.push('Poucos canais de contato confirmados')
  contactability = Math.min(20, contactability)

  let timing = 5
  if (prospect.status === 'approved') timing += 5
  if (prospect.status === 'review') timing += 3
  if (prospect.duplicateLevel === 'none') timing += 3
  if (prospect.duplicateLevel !== 'none') warnings.push(prospect.duplicateLevel === 'confirmed' ? 'Duplicidade confirmada no CRM' : 'Possível duplicidade no CRM')
  if (opportunitySignals.length) timing += 2
  timing = Math.min(15, timing)

  const dataQuality = Math.max(0, Math.min(10, Math.round(quality.score / 10)))
  if (quality.readiness === 'ready') reasons.push('Dados suficientes para ação comercial')
  if (quality.readiness === 'blocked') warnings.push(...quality.blockers.slice(0, 2))

  const score = Math.max(0, Math.min(100, Math.round(fit + potential + contactability + timing + dataQuality)))
  return { prospectId: prospect.id, score, breakdown: { fit, potential, contactability, timing, dataQuality }, reasons: reasons.slice(0, 5), warnings: [...new Set(warnings)].slice(0, 4), opportunitySignals: [...new Set(opportunitySignals)].slice(0, 4) }
}

export function rankProspects(prospects: ProspectRecord[], snapshot: WorkspaceSnapshot, options: { includeDiscarded?: boolean; includeSent?: boolean } = {}) {
  const icp = buildProspectingIcp(snapshot)
  return prospects
    .filter((prospect) => (options.includeDiscarded || prospect.status !== 'discarded') && (options.includeSent || prospect.status !== 'sent'))
    .map((prospect) => ({ prospect, intelligence: scoreProspectWithIcp(prospect, snapshot, icp) }))
    .sort((a, b) => b.intelligence.score - a.intelligence.score || b.prospect.confidence - a.prospect.confidence || a.prospect.company.localeCompare(b.prospect.company))
}

export function prospectingIcpSummary(icp: ProspectingIcpProfile) {
  const segment = icp.segments.slice(0, 3).map((item) => item.value).join(', ')
  const city = icp.cities.slice(0, 3).map((item) => item.value).join(', ')
  const source = icp.source === 'won_customers' ? 'clientes ganhos' : icp.source === 'active_pipeline' ? 'oportunidades prioritárias' : 'carteira atual'
  return `${icp.sampleSize} registro(s) de ${source}${segment ? ` · segmentos: ${segment}` : ''}${city ? ` · regiões: ${city}` : ''}`
}
