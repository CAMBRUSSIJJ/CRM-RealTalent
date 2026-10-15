import type { CompanyRecord, ContactRecord, Lead, OpportunityRecord, WorkspaceSnapshot } from '../../domain/types'
import type {
  CanonicalCommercialGraph, CanonicalCommercialInspection, CanonicalCommercialLink, CanonicalIssue, CanonicalProjectionResult, CanonicalResolutionSource,
} from './types'

const normalizeEmail = (value = '') => value.trim().toLocaleLowerCase('pt-BR')
const normalizePhone = (value = '') => value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
const normalizeText = (value = '') => value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const normalizeCnpj = (value = '') => value.replace(/\D/g, '')
const domainFromUrl = (value = '') => {
  const text = value.trim()
  if (!text) return ''
  try { return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.replace(/^www\./, '').toLocaleLowerCase('pt-BR') } catch { return '' }
}

const newest = <T extends { updatedAt: string }>(items: T[]) => [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null
const sameWorkspace = <T extends { workspaceId: string }>(workspaceId: string, value: T | undefined | null): value is T => Boolean(value && value.workspaceId === workspaceId)

const issue = (issues: CanonicalIssue[], value: CanonicalIssue) => { issues.push(value) }

const resolvePerson = (lead: Lead, snapshot: WorkspaceSnapshot, issues: CanonicalIssue[]): { record: ContactRecord | null; source: CanonicalResolutionSource } => {
  if (lead.primaryContactId) {
    const explicit = snapshot.contacts.find((item) => item.id === lead.primaryContactId)
    if (explicit && explicit.workspaceId !== lead.workspaceId) issue(issues, { severity: 'error', code: 'workspace_mismatch', leadId: lead.id, object: 'person', recordId: explicit.id, message: 'Pessoa principal pertence a outro workspace.' })
    if (sameWorkspace(lead.workspaceId, explicit)) return { record: explicit, source: 'explicit-link' }
  }

  const inverse = snapshot.contacts.filter((item) => item.workspaceId === lead.workspaceId && item.leadIds.includes(lead.id))
  const preferred = newest(inverse.filter((item) => item.isPrimary)) ?? newest(inverse)
  if (preferred) return { record: preferred, source: 'inverse-link' }

  const email = normalizeEmail(lead.email)
  const phone = normalizePhone(lead.phone)
  const identity = snapshot.contacts.filter((item) => item.workspaceId === lead.workspaceId && (
    (email && normalizeEmail(item.email) === email) || (phone && normalizePhone(item.phone) === phone)
  ))
  if (identity.length > 1) issue(issues, { severity: 'warning', code: 'ambiguous_identity', leadId: lead.id, object: 'person', message: 'Mais de uma Pessoa corresponde ao e-mail/telefone do registro comercial.' })
  const matched = newest(identity)
  if (matched) return { record: matched, source: 'identity-match' }

  issue(issues, { severity: 'warning', code: 'missing_person', leadId: lead.id, object: 'person', message: 'Registro comercial ainda não possui Pessoa canônica.' })
  return { record: null, source: 'missing' }
}

const resolveCompany = (lead: Lead, person: ContactRecord | null, snapshot: WorkspaceSnapshot, issues: CanonicalIssue[]): { record: CompanyRecord | null; source: CanonicalResolutionSource } => {
  if (lead.companyId) {
    const explicit = snapshot.companies.find((item) => item.id === lead.companyId)
    if (explicit && explicit.workspaceId !== lead.workspaceId) issue(issues, { severity: 'error', code: 'workspace_mismatch', leadId: lead.id, object: 'company', recordId: explicit.id, message: 'Empresa vinculada pertence a outro workspace.' })
    if (sameWorkspace(lead.workspaceId, explicit)) return { record: explicit, source: 'explicit-link' }
  }
  if (person?.companyId) {
    const inverse = snapshot.companies.find((item) => item.id === person.companyId && item.workspaceId === lead.workspaceId)
    if (inverse) return { record: inverse, source: 'inverse-link' }
  }
  const opportunityCompany = snapshot.opportunities.find((item) => item.workspaceId === lead.workspaceId && (item.id === lead.opportunityId || item.leadId === lead.id))?.companyId
  if (opportunityCompany) {
    const inverse = snapshot.companies.find((item) => item.id === opportunityCompany && item.workspaceId === lead.workspaceId)
    if (inverse) return { record: inverse, source: 'inverse-link' }
  }

  const cnpj = normalizeCnpj(lead.cnpj)
  const domain = domainFromUrl(lead.website)
  const name = normalizeText(lead.company)
  const identity = snapshot.companies.filter((item) => item.workspaceId === lead.workspaceId && (
    (cnpj && normalizeCnpj(item.cnpj) === cnpj) || (domain && item.domain.toLocaleLowerCase('pt-BR') === domain) || (name && normalizeText(item.name) === name)
  ))
  if (identity.length > 1) issue(issues, { severity: 'warning', code: 'ambiguous_identity', leadId: lead.id, object: 'company', message: 'Mais de uma Empresa corresponde à identidade do registro comercial.' })
  const matched = newest(identity)
  if (matched) return { record: matched, source: 'identity-match' }

  issue(issues, { severity: 'warning', code: 'missing_company', leadId: lead.id, object: 'company', message: 'Registro comercial ainda não possui Empresa canônica.' })
  return { record: null, source: 'missing' }
}

const resolveOpportunity = (lead: Lead, snapshot: WorkspaceSnapshot, issues: CanonicalIssue[]): { record: OpportunityRecord | null; source: CanonicalResolutionSource } => {
  if (lead.opportunityId) {
    const explicit = snapshot.opportunities.find((item) => item.id === lead.opportunityId)
    if (explicit && explicit.workspaceId !== lead.workspaceId) issue(issues, { severity: 'error', code: 'workspace_mismatch', leadId: lead.id, object: 'opportunity', recordId: explicit.id, message: 'Oportunidade vinculada pertence a outro workspace.' })
    if (sameWorkspace(lead.workspaceId, explicit)) return { record: explicit, source: 'explicit-link' }
  }
  const inverse = newest(snapshot.opportunities.filter((item) => item.workspaceId === lead.workspaceId && item.leadId === lead.id))
  if (inverse) return { record: inverse, source: 'inverse-link' }
  issue(issues, { severity: 'warning', code: 'missing_opportunity', leadId: lead.id, object: 'opportunity', message: 'Registro comercial ainda não possui Oportunidade canônica.' })
  return { record: null, source: 'missing' }
}

export const buildCanonicalCommercialGraph = (snapshot: WorkspaceSnapshot): CanonicalCommercialGraph => {
  const issues: CanonicalIssue[] = []
  const persons = new Map(snapshot.contacts.filter((item) => item.workspaceId === snapshot.workspace.id).map((item) => [item.id, item]))
  const companies = new Map(snapshot.companies.filter((item) => item.workspaceId === snapshot.workspace.id).map((item) => [item.id, item]))
  const opportunities = new Map(snapshot.opportunities.filter((item) => item.workspaceId === snapshot.workspace.id).map((item) => [item.id, item]))
  const links = new Map<string, CanonicalCommercialLink>()

  for (const lead of snapshot.leads) {
    if (lead.workspaceId !== snapshot.workspace.id) {
      issue(issues, { severity: 'error', code: 'workspace_mismatch', leadId: lead.id, object: 'lead', recordId: lead.id, message: 'Registro comercial pertence a outro workspace.' })
      continue
    }
    const person = resolvePerson(lead, snapshot, issues)
    const company = resolveCompany(lead, person.record, snapshot, issues)
    const opportunity = resolveOpportunity(lead, snapshot, issues)
    if (person.record?.companyId && company.record && person.record.companyId !== company.record.id) issue(issues, { severity: 'warning', code: 'relation_mismatch', leadId: lead.id, object: 'person', recordId: person.record.id, message: 'Pessoa e registro comercial apontam para Empresas diferentes.' })
    if (opportunity.record?.companyId && company.record && opportunity.record.companyId !== company.record.id) issue(issues, { severity: 'warning', code: 'relation_mismatch', leadId: lead.id, object: 'opportunity', recordId: opportunity.record.id, message: 'Oportunidade e registro comercial apontam para Empresas diferentes.' })
    if (opportunity.record?.primaryContactId && person.record && opportunity.record.primaryContactId !== person.record.id) issue(issues, { severity: 'warning', code: 'relation_mismatch', leadId: lead.id, object: 'opportunity', recordId: opportunity.record.id, message: 'Oportunidade e registro comercial apontam para Pessoas principais diferentes.' })
    links.set(lead.id, {
      leadId: lead.id, workspaceId: lead.workspaceId,
      personId: person.record?.id ?? null, companyId: company.record?.id ?? null, opportunityId: opportunity.record?.id ?? null,
      source: { person: person.source, company: company.source, opportunity: opportunity.source },
    })
  }

  return { version: '101.9.3', persons, companies, opportunities, links, issues }
}

const newestIso = (...values: Array<string | null | undefined>) => values.filter((item): item is string => Boolean(item)).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]

export const projectLeadFromCanonical = (lead: Lead, graph: CanonicalCommercialGraph): CanonicalProjectionResult => {
  const link = graph.links.get(lead.id) ?? { leadId: lead.id, workspaceId: lead.workspaceId, personId: null, companyId: null, opportunityId: null, source: { person: 'missing', company: 'missing', opportunity: 'missing' } } as CanonicalCommercialLink
  const person = link.personId ? graph.persons.get(link.personId) ?? null : null
  const company = link.companyId ? graph.companies.get(link.companyId) ?? null : null
  const opportunity = link.opportunityId ? graph.opportunities.get(link.opportunityId) ?? null : null

  const projected: Lead = {
    ...lead,
    companyId: company?.id ?? lead.companyId ?? null,
    primaryContactId: person?.id ?? lead.primaryContactId ?? null,
    opportunityId: opportunity?.id ?? lead.opportunityId ?? null,
    ...(person ? {
      name: person.name.trim() || lead.name,
      phone: person.phone,
      email: normalizeEmail(person.email),
      jobTitle: person.jobTitle,
      decisionRole: person.decisionRole,
      influenceLevel: person.influenceLevel,
      consentStatus: person.consentStatus,
      doNotContact: person.doNotContact,
      doNotContactReason: person.doNotContactReason,
      lastContactAt: person.lastContactAt ?? lead.lastContactAt ?? null,
      nextActionAt: person.nextActionAt ?? lead.nextActionAt,
    } : {}),
    ...(company ? {
      company: company.name.trim() || lead.company,
      cnpj: company.cnpj,
      website: company.website,
      city: company.city,
      state: company.state,
    } : {}),
    ...(opportunity ? {
      stageId: opportunity.stageId,
      status: opportunity.status,
      value: opportunity.value,
      ownerId: opportunity.ownerId,
      expectedCloseAt: opportunity.expectedCloseAt,
    } : {}),
    updatedAt: newestIso(lead.updatedAt, person?.updatedAt, company?.updatedAt, opportunity?.updatedAt) ?? lead.updatedAt,
  }
  return { lead: projected, changed: JSON.stringify(projected) !== JSON.stringify(lead), link }
}

export const canonicalizeWorkspaceSnapshot = (snapshot: WorkspaceSnapshot): { snapshot: WorkspaceSnapshot; inspection: CanonicalCommercialInspection } => {
  const graph = buildCanonicalCommercialGraph(snapshot)
  let projectedLeadsChanged = 0
  const leads = snapshot.leads.map((lead) => {
    const result = projectLeadFromCanonical(lead, graph)
    if (result.changed) projectedLeadsChanged += 1
    return result.lead
  })
  const links = [...graph.links.values()]
  const fullyCanonical = links.filter((link) => link.personId && link.companyId && link.opportunityId).length
  const inspection: CanonicalCommercialInspection = {
    version: '101.9.3',
    authority: { person: 'ContactRecord', company: 'CompanyRecord', opportunity: 'OpportunityRecord', lead: 'legacy-projection' },
    counts: {
      leads: snapshot.leads.length,
      persons: graph.persons.size,
      companies: graph.companies.size,
      opportunities: graph.opportunities.size,
      fullyCanonical,
      legacyFallbacks: snapshot.leads.length - fullyCanonical,
      projectedLeadsChanged,
    },
    issues: [...graph.issues], links,
  }
  return { snapshot: { ...snapshot, leads }, inspection }
}

export const resolveCanonicalCommercialLink = (leadId: string, snapshot: WorkspaceSnapshot) => buildCanonicalCommercialGraph(snapshot).links.get(leadId) ?? null
