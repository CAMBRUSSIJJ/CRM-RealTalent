import type { ActivityItem, CalendarEvent, CallRecord, Lead } from '../domain/types'

export interface LeadDataIssue {
  key: 'phone' | 'email' | 'owner' | 'source' | 'next_action' | 'company' | 'city'
  label: string
}

export interface LeadPriorityInsight {
  score: number
  level: 'low' | 'medium' | 'high' | 'urgent'
  label: string
  reasons: string[]
}

export interface DuplicateMatch {
  leadId: string
  matchId: string
  reasons: string[]
}

export interface DuplicatePair {
  primary: Lead
  duplicate: Lead
  reasons: string[]
}

const normalizeText = (value: string) => value.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ')
const normalizePhone = (value: string) => value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
const normalizeEmail = (value: string) => value.trim().toLowerCase()
const normalizeDocument = (value = '') => value.replace(/\D/g, '')
const normalizeUrl = (value = '') => value.trim().toLocaleLowerCase('pt-BR').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
const domainFromUrl = (value = '') => normalizeUrl(value).split('/')[0]

export const leadDataIssues = (lead: Lead): LeadDataIssue[] => {
  const issues: LeadDataIssue[] = []
  if (normalizePhone(lead.phone).length < 10) issues.push({ key: 'phone', label: lead.phone ? 'Telefone incompleto' : 'Sem telefone' })
  if (lead.email && !/^\S+@\S+\.\S+$/.test(lead.email)) issues.push({ key: 'email', label: 'E-mail inválido' })
  if (!lead.ownerId && !lead.ownerName) issues.push({ key: 'owner', label: 'Sem responsável' })
  if (!lead.source.trim()) issues.push({ key: 'source', label: 'Sem origem' })
  if (!lead.nextActionAt && lead.status === 'active') issues.push({ key: 'next_action', label: 'Sem próxima ação' })
  if (!lead.company.trim()) issues.push({ key: 'company', label: 'Sem empresa' })
  if (!lead.city.trim()) issues.push({ key: 'city', label: 'Sem cidade' })
  return issues
}

export const leadPriorityInsight = (lead: Lead, now = new Date()): LeadPriorityInsight => {
  let score = 0
  const reasons: string[] = []
  const nowTime = now.getTime()
  const updatedTime = new Date(lead.updatedAt).getTime()
  const daysWithoutUpdate = Number.isNaN(updatedTime) ? 0 : Math.max(0, Math.floor((nowTime - updatedTime) / 86_400_000))

  if (lead.status !== 'active') return { score: 0, level: 'low', label: 'Sem prioridade', reasons: ['Lead fora da operação ativa'] }

  if (lead.nextActionAt) {
    const nextTime = new Date(lead.nextActionAt).getTime()
    if (!Number.isNaN(nextTime) && nextTime < nowTime) { score += 30; reasons.push('próxima ação vencida') }
    else if (!Number.isNaN(nextTime) && nextTime - nowTime <= 86_400_000) { score += 16; reasons.push('ação prevista para as próximas 24 horas') }
  } else { score += 18; reasons.push('sem próxima ação') }

  if (lead.temperature === 'hot') { score += 20; reasons.push('lead quente') }
  else if (lead.temperature === 'warm') { score += 8; reasons.push('lead morno') }

  if (lead.priority === 'urgent') { score += 20; reasons.push('marcado como urgente') }
  else if (lead.priority === 'high') { score += 12; reasons.push('prioridade alta') }
  else if (lead.priority === 'medium') score += 5

  if (lead.value >= 10_000) { score += 15; reasons.push('alto valor potencial') }
  else if (lead.value >= 3_000) { score += 9; reasons.push('valor relevante no pipeline') }
  else if (lead.value > 0) score += 4

  if (daysWithoutUpdate >= 14) { score += 14; reasons.push(`sem atualização há ${daysWithoutUpdate} dias`) }
  else if (daysWithoutUpdate >= 7) { score += 9; reasons.push(`sem atualização há ${daysWithoutUpdate} dias`) }
  else if (daysWithoutUpdate >= 3) score += 4

  score = Math.min(100, score)
  const level = score >= 75 ? 'urgent' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low'
  const label = level === 'urgent' ? 'Prioridade crítica' : level === 'high' ? 'Prioridade alta' : level === 'medium' ? 'Prioridade média' : 'Prioridade baixa'
  return { score, level, label, reasons: reasons.slice(0, 4) }
}

export const findDuplicateMatches = (leads: Lead[]): DuplicateMatch[] => {
  const matches: DuplicateMatch[] = []
  for (let index = 0; index < leads.length; index += 1) {
    const lead = leads[index]
    const phone = normalizePhone(lead.phone)
    const email = normalizeEmail(lead.email)
    const company = normalizeText(lead.company)
    const city = normalizeText(lead.city)
    for (let otherIndex = index + 1; otherIndex < leads.length; otherIndex += 1) {
      const other = leads[otherIndex]
      const reasons: string[] = []
      const otherPhone = normalizePhone(other.phone)
      const otherEmail = normalizeEmail(other.email)
      const personReasons: string[] = []
      const companyReasons: string[] = []
      if (phone.length >= 10 && phone === otherPhone) personReasons.push('mesmo telefone')
      if (email && email === otherEmail) personReasons.push('mesmo e-mail')
      const cnpj = normalizeDocument(lead.cnpj); const otherCnpj = normalizeDocument(other.cnpj)
      if (cnpj.length === 14 && cnpj === otherCnpj) companyReasons.push('mesmo CNPJ')
      const domain = domainFromUrl(lead.website); const otherDomain = domainFromUrl(other.website)
      if (domain && domain === otherDomain) companyReasons.push('mesmo domínio')
      const socialUrls = [lead.instagramUrl, lead.linkedinUrl, lead.facebookUrl].map(normalizeUrl).filter(Boolean)
      const otherSocialUrls = new Set([other.instagramUrl, other.linkedinUrl, other.facebookUrl].map(normalizeUrl).filter(Boolean))
      if (socialUrls.some((url) => otherSocialUrls.has(url))) companyReasons.push('mesmo perfil social')
      if (company.length >= 4 && city && company === normalizeText(other.company) && city === normalizeText(other.city)) companyReasons.push('mesma empresa e cidade')
      const samePersonName = normalizeText(lead.name) && normalizeText(lead.name) === normalizeText(other.name)
      reasons.push(...personReasons)
      if (samePersonName) reasons.push(...companyReasons)
      if (!reasons.length) continue
      matches.push({ leadId: lead.id, matchId: other.id, reasons })
      matches.push({ leadId: other.id, matchId: lead.id, reasons })
    }
  }
  return matches
}

export const findDuplicatePairs = (leads: Lead[]): DuplicatePair[] => {
  const byId = new Map(leads.map((lead) => [lead.id, lead]))
  const seen = new Set<string>()
  return findDuplicateMatches(leads).flatMap((match) => {
    const key = [match.leadId, match.matchId].sort().join(':')
    if (seen.has(key)) return []
    seen.add(key)
    const primary = byId.get(match.leadId)
    const duplicate = byId.get(match.matchId)
    return primary && duplicate ? [{ primary, duplicate, reasons: match.reasons }] : []
  })
}

const priorityWeight = { low: 0, medium: 1, high: 2, urgent: 3 } as const
const temperatureWeight = { cold: 0, warm: 1, hot: 2 } as const

/** Combina dois cadastros sem somar o valor da mesma oportunidade. */
export const mergeLeadRecords = (primary: Lead, duplicate: Lead, now = new Date()): Lead => {
  if (primary.workspaceId !== duplicate.workspaceId) throw new Error('Os leads precisam pertencer ao mesmo workspace.')
  const notes = [primary.notes.trim(), duplicate.notes.trim() && `Conteúdo incorporado de ${duplicate.name}:\n${duplicate.notes.trim()}`].filter(Boolean).join('\n\n')
  return {
    ...primary,
    company: primary.company || duplicate.company,
    phone: primary.phone || duplicate.phone,
    email: primary.email || duplicate.email,
    city: primary.city || duplicate.city,
    source: primary.source || duplicate.source,
    sourceDetail: primary.sourceDetail || duplicate.sourceDetail, sourceUrl: primary.sourceUrl || duplicate.sourceUrl, capturedAt: [primary.capturedAt, duplicate.capturedAt].filter((value): value is string => Boolean(value)).sort()[0] ?? primary.createdAt,
    consentStatus: primary.consentStatus && primary.consentStatus !== 'unknown' ? primary.consentStatus : duplicate.consentStatus, doNotContact: Boolean(primary.doNotContact || duplicate.doNotContact), doNotContactReason: primary.doNotContactReason || duplicate.doNotContactReason,
    companyId: primary.companyId || duplicate.companyId, primaryContactId: primary.primaryContactId || duplicate.primaryContactId, opportunityId: primary.opportunityId || duplicate.opportunityId,
    cnpj: primary.cnpj || duplicate.cnpj, website: primary.website || duplicate.website, instagramUrl: primary.instagramUrl || duplicate.instagramUrl, linkedinUrl: primary.linkedinUrl || duplicate.linkedinUrl, facebookUrl: primary.facebookUrl || duplicate.facebookUrl,
    jobTitle: primary.jobTitle || duplicate.jobTitle, decisionRole: primary.decisionRole && primary.decisionRole !== 'unknown' ? primary.decisionRole : duplicate.decisionRole, influenceLevel: Math.max(primary.influenceLevel ?? 0, duplicate.influenceLevel ?? 0),
    ownerId: primary.ownerId || duplicate.ownerId,
    ownerName: primary.ownerName || duplicate.ownerName,
    value: Math.max(primary.value, duplicate.value),
    nextActionAt: [primary.nextActionAt, duplicate.nextActionAt].filter((value): value is string => Boolean(value)).sort()[0] ?? null,
    expectedCloseAt: [primary.expectedCloseAt, duplicate.expectedCloseAt].filter((value): value is string => Boolean(value)).sort()[0] ?? null,
    priority: priorityWeight[duplicate.priority] > priorityWeight[primary.priority] ? duplicate.priority : primary.priority,
    temperature: temperatureWeight[duplicate.temperature] > temperatureWeight[primary.temperature] ? duplicate.temperature : primary.temperature,
    tags: Array.from(new Set([...primary.tags, ...duplicate.tags])),
    notes,
    createdAt: primary.createdAt < duplicate.createdAt ? primary.createdAt : duplicate.createdAt,
    updatedAt: now.toISOString(),
  }
}

export const latestLeadInteractionAt = (
  lead: Lead,
  activities: ActivityItem[],
  calls: CallRecord[],
  events: CalendarEvent[],
): string => {
  const values = [lead.updatedAt]
  activities.filter((item) => item.leadId === lead.id).forEach((item) => values.push(item.completedAt ?? item.updatedAt ?? item.createdAt))
  calls.filter((item) => item.leadId === lead.id).forEach((item) => values.push(item.endedAt ?? item.startedAt ?? item.createdAt))
  events.filter((item) => item.leadId === lead.id).forEach((item) => values.push(item.updatedAt ?? item.startsAt ?? item.createdAt))
  return values.filter(Boolean).sort().at(-1) ?? lead.updatedAt
}
