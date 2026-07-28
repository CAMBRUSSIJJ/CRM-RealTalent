import type {
  CompanyRecord, ContactRecord, DataQualityIssue, Lead, OpportunityRecord, SocialNetwork, SocialProfile, WorkspaceSnapshot,
} from '../domain/types'
import { createId } from '../lib/id'
import { findDuplicatePairs, leadDataIssues } from './lead-intelligence'

const normalizeText = (value = '') => value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const normalizePhone = (value = '') => value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
const normalizeEmail = (value = '') => value.trim().toLocaleLowerCase('pt-BR')
const normalizeUrl = (value = '') => {
  const trimmed = value.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}
const domainFromUrl = (value = '') => {
  try { return new URL(normalizeUrl(value)).hostname.replace(/^www\./, '') } catch { return '' }
}
const socialUsername = (url: string) => {
  try { const path = new URL(url).pathname.split('/').filter(Boolean)[0] ?? ''; return path ? `@${path}` : '' } catch { return '' }
}
const normalizeCnpj = (value = '') => value.replace(/\D/g, '')
const companyKey = (lead: Lead) => {
  const cnpj = normalizeCnpj(lead.cnpj)
  if (cnpj) return `cnpj:${cnpj}`
  const domain = domainFromUrl(lead.website ?? '')
  if (domain) return `domain:${domain}`
  return `name:${normalizeText(lead.company || lead.name)}|city:${normalizeText(lead.city)}`
}
const contactKey = (lead: Lead) => normalizeEmail(lead.email) || normalizePhone(lead.phone) || `${normalizeText(lead.name)}|${companyKey(lead)}`

export interface DerivedCommercialStructure {
  companies: CompanyRecord[]
  contacts: ContactRecord[]
  opportunities: OpportunityRecord[]
  socialProfiles: SocialProfile[]
  leadLinks: Array<{ leadId: string; companyId: string; contactId: string; opportunityId: string }>
}

const networkUrls = (lead: Lead): Array<[SocialNetwork, string]> => [
  ['instagram', lead.instagramUrl ?? ''], ['linkedin', lead.linkedinUrl ?? ''], ['facebook', lead.facebookUrl ?? ''], ['website', lead.website ?? ''],
]

export const deriveCommercialStructure = (leads: Lead[], existing?: Pick<WorkspaceSnapshot, 'companies' | 'contacts' | 'opportunities' | 'socialProfiles'>): DerivedCommercialStructure => {
  const companies = new Map<string, CompanyRecord>()
  const contacts = new Map<string, ContactRecord>()
  const opportunities = new Map<string, OpportunityRecord>()
  const socialProfiles = new Map<string, SocialProfile>()
  const companyByKey = new Map<string, string>()
  const contactByKey = new Map<string, string>()
  const now = new Date().toISOString()

  for (const item of existing?.companies ?? []) {
    companies.set(item.id, { ...item, leadIds: [...item.leadIds] })
    const key = item.cnpj ? `cnpj:${normalizeCnpj(item.cnpj)}` : item.domain ? `domain:${item.domain.toLocaleLowerCase('pt-BR')}` : `name:${normalizeText(item.name)}|city:${normalizeText(item.city)}`
    companyByKey.set(key, item.id)
  }
  for (const item of existing?.contacts ?? []) { contacts.set(item.id, { ...item, leadIds: [...item.leadIds] }); contactByKey.set(normalizeEmail(item.email) || normalizePhone(item.phone) || `${normalizeText(item.name)}|${item.companyId ?? ''}`, item.id) }
  for (const item of existing?.opportunities ?? []) opportunities.set(item.id, { ...item })
  for (const item of existing?.socialProfiles ?? []) socialProfiles.set(item.id, { ...item })

  const leadLinks: DerivedCommercialStructure['leadLinks'] = []
  for (const lead of leads) {
    const key = companyKey(lead)
    let companyId = lead.companyId && companies.has(lead.companyId) ? lead.companyId : companyByKey.get(key)
    if (!companyId) companyId = lead.companyId || createId('company')
    const currentCompany = companies.get(companyId)
    const website = normalizeUrl(lead.website ?? currentCompany?.website ?? '')
    const company: CompanyRecord = {
      id: companyId, workspaceId: lead.workspaceId, name: lead.company.trim() || lead.name.trim(), legalName: currentCompany?.legalName ?? '',
      cnpj: lead.cnpj?.trim() || currentCompany?.cnpj || '', domain: domainFromUrl(website) || currentCompany?.domain || '', website,
      segment: currentCompany?.segment || lead.tags[0] || '', phone: lead.phone || currentCompany?.phone || '', city: lead.city || currentCompany?.city || '',
      state: lead.state ?? currentCompany?.state ?? '', status: lead.status === 'won' ? 'customer' : lead.status === 'archived' ? 'inactive' : 'prospect',
      leadIds: Array.from(new Set([...(currentCompany?.leadIds ?? []), lead.id])), createdAt: currentCompany?.createdAt ?? lead.createdAt, updatedAt: lead.updatedAt || now,
    }
    companies.set(companyId, company); companyByKey.set(key, companyId)

    const cKey = contactKey(lead)
    let contactId = lead.primaryContactId && contacts.has(lead.primaryContactId) ? lead.primaryContactId : contactByKey.get(cKey)
    if (!contactId) contactId = lead.primaryContactId || createId('contact')
    const currentContact = contacts.get(contactId)
    const contact: ContactRecord = {
      id: contactId, workspaceId: lead.workspaceId, companyId, name: lead.name.trim(), jobTitle: lead.jobTitle?.trim() || currentContact?.jobTitle || '',
      phone: lead.phone || currentContact?.phone || '', email: lead.email || currentContact?.email || '', decisionRole: lead.decisionRole ?? currentContact?.decisionRole ?? 'unknown',
      influenceLevel: Math.max(0, Math.min(100, lead.influenceLevel ?? currentContact?.influenceLevel ?? 0)), consentStatus: lead.consentStatus ?? currentContact?.consentStatus ?? 'unknown',
      doNotContact: Boolean(lead.doNotContact ?? currentContact?.doNotContact), doNotContactReason: lead.doNotContactReason ?? currentContact?.doNotContactReason ?? '',
      leadIds: Array.from(new Set([...(currentContact?.leadIds ?? []), lead.id])), createdAt: currentContact?.createdAt ?? lead.createdAt, updatedAt: lead.updatedAt || now,
    }
    contacts.set(contactId, contact); contactByKey.set(cKey, contactId)

    const existingOpportunity = [...opportunities.values()].find((item) => item.leadId === lead.id)
    const opportunityId = lead.opportunityId || existingOpportunity?.id || createId('opportunity')
    opportunities.set(opportunityId, {
      id: opportunityId, workspaceId: lead.workspaceId, companyId, primaryContactId: contactId, leadId: lead.id,
      title: opportunities.get(opportunityId)?.title || `${lead.company || lead.name} — oportunidade`, stageId: lead.stageId, status: lead.status, value: lead.value, ownerId: lead.ownerId,
      expectedCloseAt: lead.expectedCloseAt ?? null, createdAt: opportunities.get(opportunityId)?.createdAt ?? lead.createdAt, updatedAt: lead.updatedAt || now,
    })

    for (const [network, urlRaw] of networkUrls(lead)) {
      const url = normalizeUrl(urlRaw)
      if (!url) continue
      const existingProfile = [...socialProfiles.values()].find((profile) => profile.workspaceId === lead.workspaceId && profile.network === network && normalizeUrl(profile.url) === url)
      const id = existingProfile?.id ?? createId('social')
      socialProfiles.set(id, {
        id, workspaceId: lead.workspaceId, entityType: 'company', entityId: companyId, network, username: network === 'website' ? domainFromUrl(url) : socialUsername(url),
        url, externalId: existingProfile?.externalId ?? null, verified: existingProfile?.verified ?? false, source: existingProfile?.source || lead.sourceDetail || lead.source || 'Cadastro do lead',
        confidence: existingProfile?.confidence ?? (lead.sourceUrl && normalizeUrl(lead.sourceUrl) === url ? 95 : 80), lastCheckedAt: existingProfile?.lastCheckedAt ?? null,
        createdAt: existingProfile?.createdAt ?? lead.createdAt, updatedAt: lead.updatedAt || now,
      })
    }
    leadLinks.push({ leadId: lead.id, companyId, contactId, opportunityId })
  }
  return { companies: [...companies.values()], contacts: [...contacts.values()], opportunities: [...opportunities.values()], socialProfiles: [...socialProfiles.values()], leadLinks }
}

const issue = (partial: Omit<DataQualityIssue, 'id'>): DataQualityIssue => ({ ...partial, id: `${partial.category}:${partial.leadIds.join(':')}:${normalizeText(partial.title)}` })

export const buildDataQualityIssues = (snapshot: WorkspaceSnapshot): DataQualityIssue[] => {
  const issues: DataQualityIssue[] = []
  const activeLeads = snapshot.leads.filter((lead) => lead.status === 'active')
  for (const pair of findDuplicatePairs(snapshot.leads)) issues.push(issue({ workspaceId: snapshot.workspace.id, category: 'duplicate', severity: 'critical', title: 'Possível cadastro duplicado', description: `${pair.primary.name} e ${pair.duplicate.name}: ${pair.reasons.join(', ')}.`, leadIds: [pair.primary.id, pair.duplicate.id], suggestedAction: 'Comparar os registros e fundir o duplicado no cadastro principal.' }))
  for (const lead of snapshot.leads) {
    for (const basic of leadDataIssues(lead)) issues.push(issue({ workspaceId: lead.workspaceId, category: basic.key === 'next_action' ? 'opportunity' : basic.key === 'source' ? 'origin' : basic.key === 'city' ? 'location' : basic.key === 'company' ? 'identity' : 'contact', severity: basic.key === 'next_action' && lead.status === 'active' ? 'high' : 'medium', title: basic.label, description: `${lead.name} precisa de revisão no cadastro.`, leadIds: [lead.id], suggestedAction: 'Abrir o lead e completar a informação.' }))
    if (!lead.companyId || !snapshot.companies.some((company) => company.id === lead.companyId)) issues.push(issue({ workspaceId: lead.workspaceId, category: 'identity', severity: 'high', title: 'Lead sem empresa estruturada', description: `${lead.name} ainda não está ligado a uma empresa oficial.`, leadIds: [lead.id], suggestedAction: 'Executar a sincronização da estrutura comercial.' }))
    if (!lead.primaryContactId || !snapshot.contacts.some((contact) => contact.id === lead.primaryContactId)) issues.push(issue({ workspaceId: lead.workspaceId, category: 'identity', severity: 'high', title: 'Lead sem pessoa estruturada', description: `${lead.name} ainda não está ligado a um contato oficial.`, leadIds: [lead.id], suggestedAction: 'Executar a sincronização da estrutura comercial.' }))
    if ((lead.decisionRole ?? 'unknown') === 'unknown') issues.push(issue({ workspaceId: lead.workspaceId, category: 'identity', severity: lead.status === 'active' ? 'medium' : 'low', title: 'Papel na decisão não identificado', description: `${lead.name} não está classificado como decisor, influenciador ou usuário.`, leadIds: [lead.id], contactId: lead.primaryContactId ?? null, suggestedAction: 'Identificar o papel da pessoa na decisão de compra.' }))
    if (!lead.sourceDetail?.trim() || !lead.capturedAt) issues.push(issue({ workspaceId: lead.workspaceId, category: 'origin', severity: 'medium', title: 'Origem incompleta', description: `${lead.name} possui origem geral, mas falta detalhe ou data de captura.`, leadIds: [lead.id], suggestedAction: 'Registrar canal, detalhe, URL e data da captura.' }))
    if ((lead.consentStatus ?? 'unknown') === 'unknown') issues.push(issue({ workspaceId: lead.workspaceId, category: 'consent', severity: 'high', title: 'Base de contato não revisada', description: `${lead.name} não possui consentimento ou base de tratamento documentada.`, leadIds: [lead.id], suggestedAction: 'Revisar a base legal e os canais permitidos antes de automatizar contato.' }))
    if (lead.doNotContact) issues.push(issue({ workspaceId: lead.workspaceId, category: 'consent', severity: 'critical', title: 'Contato bloqueado', description: `${lead.name} está marcado para não receber contato${lead.doNotContactReason ? `: ${lead.doNotContactReason}` : '.'}`, leadIds: [lead.id], suggestedAction: 'Manter cadências e automações bloqueadas para este contato.' }))
    if (!networkUrls(lead).some(([, url]) => Boolean(url.trim()))) issues.push(issue({ workspaceId: lead.workspaceId, category: 'social', severity: 'low', title: 'Sem identidade social', description: `${lead.company || lead.name} não possui perfil social ou site associado.`, leadIds: [lead.id], companyId: lead.companyId ?? null, suggestedAction: 'Adicionar perfis oficiais quando forem encontrados.' }))
    if (lead.status === 'active' && !lead.nextActionAt) issues.push(issue({ workspaceId: lead.workspaceId, category: 'opportunity', severity: 'critical', title: 'Oportunidade sem próxima ação', description: `${lead.name} está ativo no Pipeline sem próxima atividade.`, leadIds: [lead.id], opportunityId: lead.opportunityId ?? null, suggestedAction: 'Agendar uma ação comercial antes de encerrar a revisão.' }))
  }
  for (const profile of snapshot.socialProfiles) {
    const exists = profile.entityType === 'company' ? snapshot.companies.some((company) => company.id === profile.entityId) : snapshot.contacts.some((contact) => contact.id === profile.entityId)
    if (!exists) issues.push(issue({ workspaceId: profile.workspaceId, category: 'social', severity: 'high', title: 'Perfil social sem vínculo', description: `${profile.url} não está associado a uma empresa ou pessoa existente.`, leadIds: [], suggestedAction: 'Associar o perfil ao registro correto ou removê-lo.' }))
  }
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  return issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.title.localeCompare(b.title, 'pt-BR'))
}

export const dataQualitySummary = (snapshot: WorkspaceSnapshot) => {
  const issues = buildDataQualityIssues(snapshot)
  const total = Math.max(1, snapshot.leads.length * 8)
  const penalty = issues.reduce((sum, item) => sum + ({ critical: 8, high: 5, medium: 3, low: 1 }[item.severity]), 0)
  const score = Math.max(0, Math.min(100, Math.round(100 - (penalty / total) * 100)))
  return {
    score, issues, critical: issues.filter((item) => item.severity === 'critical').length, high: issues.filter((item) => item.severity === 'high').length,
    duplicates: issues.filter((item) => item.category === 'duplicate').length, blocked: snapshot.contacts.filter((item) => item.doNotContact).length,
    structuredCompanies: snapshot.companies.length, structuredContacts: snapshot.contacts.length, opportunities: snapshot.opportunities.length, socialProfiles: snapshot.socialProfiles.length,
    activeLeads: snapshot.leads.filter((lead) => lead.status === 'active').length,
  }
}
