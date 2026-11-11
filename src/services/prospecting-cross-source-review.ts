import type { AiField, AiLead, AiSearchResult } from '../../supabase/functions/_shared/prospecting-ai'
import type { ProspectRecord } from './prospecting-workspace'

// A field must be corroborated by two distinct registrable domains to be confirmed.
// Multiple URLs or subdomains from the same domain count as a single source.
export type CrossSourceStatus = 'confirmed' | 'divergent' | 'observed' | 'pending'
export interface CrossSourceCandidate {
  value: string
  urls: string[]
  independentPublishers: number
}
export interface CrossSourceField {
  field: AiField
  label: string
  currentValue: string
  status: CrossSourceStatus
  candidates: CrossSourceCandidate[]
}
export interface CrossSourceReview {
  matched: boolean
  fields: CrossSourceField[]
  sources: Array<{ url: string; title: string }>
  warnings: string[]
  confirmed: number
  divergent: number
  observed: number
  pending: number
  importable: AiField[]
}

const fields: Array<[AiField, string]> = [
  ['company', 'Empresa'], ['city', 'Cidade'], ['address', 'Endereço'],
  ['phone', 'Telefone'], ['email', 'E-mail'], ['cnpj', 'CNPJ'],
  ['website', 'Site'], ['instagram', 'Instagram'],
  ['bookingUrl', 'Agendamento'], ['whatsappUrl', 'WhatsApp publicado'],
]
const normalize = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase()
const digits = (value: string) => value.replace(/\D/g, '')
const normalizeCity = (value: string) => normalize(value.replace(/(?:,|\s|-)\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*$/i, ''))
const urlHost = (value: string) => {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''
    return url.hostname.toLowerCase().replace(/^www\./, '')
  } catch { return '' }
}
const publisher = (url: string) => {
  const host = urlHost(url)
  if (!host) return ''
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const suffix = parts.slice(-2).join('.')
  return ['com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'co.uk'].includes(suffix)
    ? parts.slice(-3).join('.') : parts.slice(-2).join('.')
}
const identityValue = (field: AiField, value: string) => {
  if (field === 'cnpj' || field === 'phone') {
    const valueDigits = digits(value)
    return field === 'phone' && valueDigits.length === 13 && valueDigits.startsWith('55')
      ? valueDigits.slice(2) : valueDigits
  }
  if (field === 'website' || field === 'bookingUrl' || field === 'whatsappUrl') {
    try {
      const parsed = new URL(value)
      return parsed.hostname.replace(/^www\./, '').toLowerCase() + parsed.pathname.replace(/\/$/, '')
    } catch { /* invalid URL is not corroborated */ }
  }
  if (field === 'instagram') {
    return normalize(value.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0])
  }
  return normalize(value)
}

export function matchedCrossSourceLead(prospect: ProspectRecord, result: AiSearchResult): AiLead | null {
  const company = normalize(prospect.company || prospect.name)
  const city = normalizeCity(prospect.city)
  const cnpj = digits(prospect.cnpj)
  const phone = identityValue('phone', prospect.phone)
  return result.leads.find((lead) => {
    const sameName = Boolean(company && normalize(lead.company) === company)
    const sameCity = Boolean(city && normalizeCity(lead.city) === city)
    const strongCnpj = cnpj.length === 14 && digits(lead.cnpj) === cnpj
    const strongPhone = phone.length >= 10 && identityValue('phone', lead.phone) === phone
    // A matching phone alone is not sufficient: shared booking desks may reuse numbers.
    return (sameName && (sameCity || strongCnpj || (strongPhone && !lead.city)))
      || (strongCnpj && (!lead.city || sameCity))
  }) ?? null
}

export function crossSourceReview(prospect: ProspectRecord, result: AiSearchResult): CrossSourceReview {
  const lead = matchedCrossSourceLead(prospect, result)
  const evidence = lead?.aiResearch.evidence ?? []
  const sources = (lead?.aiResearch.sources ?? [])
    .filter((s) => Boolean(urlHost(s.url)))
    .map((s) => ({ url: s.url, title: s.title }))
  const reviewedFields: CrossSourceField[] = fields.map(([field, label]) => {
    const currentValue = String(prospect[field] || '').trim()
    const grouped = new Map<string, { value: string; urls: Set<string>; publishers: Set<string> }>()
    for (const item of evidence) {
      if (item.field !== field || !item.value || !urlHost(item.sourceUrl)) continue
      const key = identityValue(field, item.value)
      if (!key) continue
      const existing = grouped.get(key) ?? { value: item.value, urls: new Set<string>(), publishers: new Set<string>() }
      existing.urls.add(item.sourceUrl)
      existing.publishers.add(publisher(item.sourceUrl))
      grouped.set(key, existing)
    }
    const candidates = [...grouped.values()].map((entry) => ({
      value: entry.value,
      urls: [...entry.urls],
      independentPublishers: entry.publishers.size,
    }))
    const differsFromRecord = Boolean(currentValue && candidates.length &&
      candidates.every((c) => identityValue(field, c.value) !== identityValue(field, currentValue)))
    const status: CrossSourceStatus = !candidates.length ? 'pending'
      : candidates.length > 1 || differsFromRecord ? 'divergent'
      : candidates[0].independentPublishers >= 2 ? 'confirmed' : 'observed'
    return { field, label, currentValue, status, candidates }
  })
  const count = (status: CrossSourceStatus) => reviewedFields.filter((field) => field.status === status).length
  return {
    matched: Boolean(lead),
    fields: reviewedFields,
    sources,
    // The batch size controls search depth, not the number of companies we expect
    // in a single-company review. Hide this generic limit warning here.
    warnings: result.warnings.filter((warning) => !warning.startsWith('A pesquisa retornou menos empresas com fontes')),
    confirmed: count('confirmed'),
    divergent: count('divergent'),
    observed: count('observed'),
    pending: count('pending'),
    importable: reviewedFields.filter(({ field, status, currentValue }) =>
      status === 'confirmed' && !currentValue && field !== 'company' && field !== 'city').map(({ field }) => field),
  }
}

// Explicit action only: copy corroborated, currently missing fields. Never overwrite
// existing data, merge distinct companies, or approve/send the prospect.
export function confirmedEnrichmentResult(prospect: ProspectRecord, result: AiSearchResult): AiSearchResult | null {
  const lead = matchedCrossSourceLead(prospect, result)
  if (!lead) return null
  const review = crossSourceReview(prospect, result)
  if (!review.importable.length) return null
  const cleaned = {
    ...lead,
    company: prospect.company,
    city: prospect.city,
  }
  for (const [field] of fields) {
    if (field !== 'company' && field !== 'city' && !review.importable.includes(field)) cleaned[field] = ''
  }
  return { ...result, leads: [cleaned] }
}

/** Corroboration derived from saved evidence, never from mere field presence. */
export function savedCrossSourceReview(prospect: ProspectRecord): CrossSourceReview | null {
  const candidate = prospect.rawData.aiResearch as Record<string, unknown> | undefined
  if (!candidate || !Array.isArray(candidate.evidence) || !Array.isArray(candidate.sources)) return null
  const lead: AiLead = {
    company: prospect.company, city: prospect.city, address: prospect.address,
    phone: prospect.phone, email: prospect.email, cnpj: prospect.cnpj,
    instagram: prospect.instagram, website: prospect.website,
    bookingUrl: prospect.bookingUrl, systemName: prospect.systemName,
    whatsappUrl: '',
    aiResearch: candidate as unknown as AiLead['aiResearch'],
  }
  return crossSourceReview(prospect, { leads: [lead], warnings: [], researchedAt: new Date().toISOString() })
}
