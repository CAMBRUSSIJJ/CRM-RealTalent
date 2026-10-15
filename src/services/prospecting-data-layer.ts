import type { ProspectRecord } from './prospecting-workspace'

export type ProspectReadiness = 'ready' | 'review' | 'blocked'
export type ProspectQualityDimension = 'identity' | 'contact' | 'origin' | 'coverage'

export interface ProspectQualityProfile {
  score: number
  readiness: ProspectReadiness
  label: string
  dimensions: Record<ProspectQualityDimension, number>
  blockers: string[]
  warnings: string[]
  missingFields: string[]
  recommendedActions: string[]
  identityKey: string
}

export interface ProspectDataLayerEnvelope {
  contract: 'realtalent-data-layer/2.5'
  exportedAt: string
  workspaceId: string
  purpose: 'prospecting_enrichment'
  records: Array<{
    prospectId: string
    identityKey: string
    source: ProspectRecord['source']
    sourceDetail: string
    quality: ProspectQualityProfile
    data: Pick<ProspectRecord, 'name' | 'company' | 'phone' | 'email' | 'city' | 'address' | 'cnpj' | 'instagram' | 'website' | 'bookingUrl' | 'systemName' | 'description' | 'notes'>
  }>
}

const digits = (value: string) => value.replace(/\D/g, '')
const normalizedText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim()
const normalizedInstagram = (value: string) => value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '').toLocaleLowerCase('pt-BR')
const normalizedDomain = (value: string) => value.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLocaleLowerCase('pt-BR')
const cnpjDigits = (value: string) => digits(value).slice(0, 14)
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export function prospectIdentityKey(prospect: ProspectRecord) {
  const cnpj = cnpjDigits(prospect.cnpj)
  if (cnpj.length === 14) return `cnpj:${cnpj}`
  const domain = normalizedDomain(prospect.website)
  if (domain) return `domain:${domain}`
  const instagram = normalizedInstagram(prospect.instagram)
  if (instagram) return `instagram:${instagram}`
  const phone = digits(prospect.phone)
  if (phone.length >= 10) return `phone:${phone}`
  const company = normalizedText(prospect.company || prospect.name)
  const city = normalizedText(prospect.city)
  return `entity:${company || 'unknown'}:${city || 'unknown'}`
}

export function prospectDataQuality(prospect: ProspectRecord): ProspectQualityProfile {
  const hasCompany = Boolean(normalizedText(prospect.company || prospect.name)) && prospect.name !== 'Lead sem nome'
  const hasCnpj = cnpjDigits(prospect.cnpj).length === 14
  const hasLocation = Boolean(prospect.city.trim() || prospect.address.trim())
  const hasPhone = digits(prospect.phone).length >= 10
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prospect.email.trim())
  const hasInstagram = Boolean(normalizedInstagram(prospect.instagram))
  const hasWebsite = Boolean(normalizedDomain(prospect.website))
  const hasDigital = hasEmail || hasInstagram || hasWebsite
  const hasContact = hasPhone || hasDigital
  const hasSource = prospect.source !== 'manual' || Boolean(prospect.sourceDetail.trim())
  const hasTrace = Boolean(prospect.sourceDetail.trim()) || Object.keys(prospect.rawData ?? {}).length > 2
  const wasAnalyzed = Boolean(prospect.analyzedAt)

  const identity = clamp((hasCompany ? 42 : 0) + (hasCnpj ? 38 : 0) + (hasLocation ? 20 : 0))
  const contact = clamp((hasPhone ? 45 : 0) + (hasEmail ? 20 : 0) + (hasInstagram ? 15 : 0) + (hasWebsite ? 20 : 0))
  const origin = clamp((hasSource ? 45 : 0) + (hasTrace ? 35 : 0) + (wasAnalyzed ? 20 : 0))
  const coverage = clamp(
    (hasCompany ? 15 : 0) + (hasContact ? 20 : 0) + (hasLocation ? 15 : 0) + (hasCnpj ? 15 : 0) +
    (hasDigital ? 15 : 0) + (prospect.description.trim() ? 10 : 0) + (prospect.systemName.trim() ? 5 : 0) + (prospect.bookingUrl.trim() ? 5 : 0),
  )

  const duplicatePenalty = prospect.duplicateLevel === 'confirmed' ? 38 : prospect.duplicateLevel === 'possible' ? 14 : 0
  const score = clamp((prospect.confidence * .32) + (identity * .25) + (contact * .23) + (origin * .1) + (coverage * .1) - duplicatePenalty)
  const blockers: string[] = []
  const warnings: string[] = []
  const missingFields: string[] = []
  const recommendedActions: string[] = []

  if (!hasCompany) { blockers.push('Identidade da empresa não confirmada'); missingFields.push('empresa') }
  if (!hasContact) { blockers.push('Nenhum canal de contato utilizável'); missingFields.push('telefone/e-mail/canal digital') }
  if (prospect.duplicateLevel === 'confirmed') blockers.push('Duplicidade confirmada com a base do CRM')
  if (!hasLocation) { warnings.push('Localização ausente'); missingFields.push('cidade/endereço') }
  if (!hasCnpj) { warnings.push('CNPJ não validado'); missingFields.push('CNPJ') }
  if (!hasPhone) { warnings.push('Telefone comercial ausente ou incompleto'); missingFields.push('telefone') }
  if (!hasDigital) { warnings.push('Presença digital não identificada'); missingFields.push('Instagram/site/e-mail') }
  if (!hasTrace) warnings.push('Origem com pouca rastreabilidade')
  if (prospect.duplicateLevel === 'possible') warnings.push('Possível duplicidade exige decisão humana')
  if (!wasAnalyzed) warnings.push('Análise do Data Layer ainda não executada')

  if (!hasCompany) recommendedActions.push('Confirmar razão social ou nome comercial')
  if (!hasContact) recommendedActions.push('Enriquecer telefone, e-mail, Instagram ou site')
  if (!hasCnpj) recommendedActions.push('Buscar CNPJ para fortalecer a identidade da conta')
  if (!hasLocation) recommendedActions.push('Completar cidade ou endereço para território e mapa')
  if (prospect.duplicateLevel !== 'none') recommendedActions.push('Revisar o possível registro existente antes de criar outro lead')
  if (!wasAnalyzed) recommendedActions.push('Executar Reanalisar para recalcular qualidade e duplicidade')
  if (!recommendedActions.length) recommendedActions.push('Revisar os sinais comerciais e aprovar para envio ao CRM')

  const readiness: ProspectReadiness = blockers.length ? 'blocked' : (wasAnalyzed && hasCompany && hasContact ? 'ready' : 'review')
  const label = readiness === 'ready' ? 'Pronto para aprovação' : readiness === 'blocked' ? 'Bloqueado para envio' : 'Revisão necessária'

  return {
    score,
    readiness,
    label,
    dimensions: { identity, contact, origin, coverage },
    blockers,
    warnings,
    missingFields: Array.from(new Set(missingFields)),
    recommendedActions: Array.from(new Set(recommendedActions)),
    identityKey: prospectIdentityKey(prospect),
  }
}

export function sortProspectsForGuidedReview(prospects: ProspectRecord[]) {
  const rank: Record<ProspectReadiness, number> = { blocked: 0, review: 1, ready: 2 }
  return [...prospects].sort((left, right) => {
    const a = prospectDataQuality(left)
    const b = prospectDataQuality(right)
    return rank[a.readiness] - rank[b.readiness] || a.score - b.score || left.createdAt.localeCompare(right.createdAt)
  })
}

export function buildProspectingDataLayerEnvelope(workspaceId: string, prospects: ProspectRecord[]): ProspectDataLayerEnvelope {
  return {
    contract: 'realtalent-data-layer/2.5',
    exportedAt: new Date().toISOString(),
    workspaceId,
    purpose: 'prospecting_enrichment',
    records: prospects.map((prospect) => ({
      prospectId: prospect.id,
      identityKey: prospectIdentityKey(prospect),
      source: prospect.source,
      sourceDetail: prospect.sourceDetail,
      quality: prospectDataQuality(prospect),
      data: {
        name: prospect.name,
        company: prospect.company,
        phone: prospect.phone,
        email: prospect.email,
        city: prospect.city,
        address: prospect.address,
        cnpj: prospect.cnpj,
        instagram: prospect.instagram,
        website: prospect.website,
        bookingUrl: prospect.bookingUrl,
        systemName: prospect.systemName,
        description: prospect.description,
        notes: prospect.notes,
      },
    })),
  }
}

export function prospectReadinessCounts(prospects: ProspectRecord[]) {
  return prospects.reduce((counts, prospect) => {
    counts[prospectDataQuality(prospect).readiness] += 1
    return counts
  }, { ready: 0, review: 0, blocked: 0 } as Record<ProspectReadiness, number>)
}
