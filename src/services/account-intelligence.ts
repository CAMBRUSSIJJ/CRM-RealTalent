import type { ContactRecord, ContactRelationship, DecisionRole, Lead, WorkspaceSnapshot } from '../domain/types'

export const decisionRoleLabels: Record<DecisionRole, string> = {
  decision_maker: 'Decisor final',
  economic_buyer: 'Decisor econômico',
  champion: 'Champion',
  influencer: 'Influenciador',
  technical_evaluator: 'Avaliador técnico',
  finance: 'Financeiro',
  procurement: 'Compras',
  gatekeeper: 'Gatekeeper',
  blocker: 'Bloqueador',
  user: 'Usuário',
  operational: 'Operacional',
  unknown: 'Papel não identificado',
}

export const relationshipStrengthLabels = {
  unknown: 'Não avaliado', weak: 'Fraco', developing: 'Em desenvolvimento', strong: 'Forte', trusted: 'Confiança alta',
} as const

export const stanceLabels = { unknown: 'Desconhecida', supportive: 'Favorável', neutral: 'Neutra', opposed: 'Contrária' } as const

export const relationshipTypeLabels = {
  reports_to: 'Responde a', partner: 'Sócio(a) de', co_owner: 'Coproprietário(a) de', referred_by: 'Indicado(a) por', works_with: 'Trabalha com', influences: 'Influencia', other: 'Relacionado(a) a',
} as const

const relationshipStrengthBaseScore = { unknown: 0, weak: 25, developing: 50, strong: 75, trusted: 90 } as const

export const calculatedRelationshipScore = (contact: ContactRecord, snapshot: WorkspaceSnapshot) => {
  const interactions = contactInteractionSummary(contact, snapshot)
  const base = relationshipStrengthBaseScore[contact.relationshipStrength ?? 'unknown']
  const volumeBonus = Math.min(8, interactions.total * 2)
  const recencyBonus = interactions.lastAt && Date.now() - new Date(interactions.lastAt).getTime() <= 30 * 86_400_000 ? 7 : 0
  const stanceAdjustment = contact.stance === 'supportive' ? 4 : contact.stance === 'opposed' ? -8 : 0
  return Math.max(0, Math.min(100, Math.round(base + volumeBonus + recencyBonus + stanceAdjustment)))
}

const keyRoles: DecisionRole[][] = [
  ['decision_maker', 'economic_buyer'],
  ['champion'],
  ['finance', 'procurement'],
  ['influencer', 'technical_evaluator', 'operational', 'user'],
]

const roleGroupLabels = ['Decisão', 'Champion', 'Financeiro/Compras', 'Influência/Operação']

export interface ContactInteractionSummary {
  total: number
  calls: number
  meetings: number
  activities: number
  lastAt: string | null
  ownerNames: string[]
}

export interface AccountIntelligence {
  coverageScore: number
  relationshipScore: number
  risk: 'low' | 'medium' | 'high'
  riskLabel: string
  missingRoleGroups: string[]
  strengths: string[]
  warnings: string[]
  recommendedAction: { title: string; explanation: string; contactId?: string }
  contactedCount: number
  totalContacts: number
}

export const contactInteractionSummary = (contact: ContactRecord, snapshot: WorkspaceSnapshot): ContactInteractionSummary => {
  const leadIds = new Set(contact.leadIds)
  const leads = snapshot.leads.filter((lead) => leadIds.has(lead.id))
  const fallbackLeadIds = leads.length ? leadIds : new Set(snapshot.leads.filter((lead) => lead.companyId === contact.companyId && lead.primaryContactId === contact.id).map((lead) => lead.id))
  const calls = snapshot.calls.filter((item) => item.contactId ? item.contactId === contact.id : fallbackLeadIds.has(item.leadId))
  const meetings = snapshot.events.filter((item) => item.status !== 'cancelled' && (item.contactId ? item.contactId === contact.id : Boolean(item.leadId && fallbackLeadIds.has(item.leadId))))
  const activities = snapshot.activities.filter((item) => item.resolutionStatus === 'completed' && (item.contactId ? item.contactId === contact.id : Boolean(item.leadId && fallbackLeadIds.has(item.leadId))))
  const dates = [contact.lastContactAt, ...calls.map((item) => item.endedAt ?? item.startedAt), ...meetings.map((item) => item.startsAt), ...activities.map((item) => item.completedAt)].filter((value): value is string => Boolean(value))
  const lastAt = dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
  const ownerNames = [...new Set(leads.map((lead) => lead.ownerName).filter(Boolean))]
  return { total: calls.length + meetings.length + activities.length, calls: calls.length, meetings: meetings.length, activities: activities.length, lastAt, ownerNames }
}

const hasAnyRole = (contacts: ContactRecord[], roles: DecisionRole[]) => contacts.some((contact) => roles.includes(contact.decisionRole))

export const buildAccountIntelligence = (lead: Lead, contacts: ContactRecord[], relationships: ContactRelationship[], snapshot: WorkspaceSnapshot): AccountIntelligence => {
  const activeContacts = contacts.filter((contact) => !contact.doNotContact)
  const roleCoverage = keyRoles.map((roles) => hasAnyRole(activeContacts, roles))
  const missingRoleGroups = roleCoverage.map((covered, index) => covered ? null : roleGroupLabels[index]).filter((value): value is string => Boolean(value))
  const contactedCount = activeContacts.filter((contact) => contactInteractionSummary(contact, snapshot).total > 0 || Boolean(contact.lastContactAt)).length
  const totalContacts = activeContacts.length
  const relationshipScore = totalContacts
    ? Math.round(activeContacts.reduce((sum, contact) => sum + calculatedRelationshipScore(contact, snapshot), 0) / totalContacts)
    : 0
  const roleScore = Math.round(roleCoverage.filter(Boolean).length / roleCoverage.length * 55)
  const contactScore = totalContacts ? Math.round(contactedCount / totalContacts * 25) : 0
  const graphScore = totalContacts > 1 ? Math.min(20, relationships.length * 8) : 0
  const coverageScore = Math.max(0, Math.min(100, roleScore + contactScore + graphScore))

  const warnings: string[] = []
  const strengths: string[] = []
  if (!hasAnyRole(activeContacts, ['decision_maker', 'economic_buyer'])) warnings.push('Decisor final/econômico ainda não está claramente coberto.')
  else strengths.push('Decisor identificado.')
  if (!hasAnyRole(activeContacts, ['champion'])) warnings.push('Não há champion identificado dentro da conta.')
  else strengths.push('Champion identificado.')
  if (!hasAnyRole(activeContacts, ['finance', 'procurement'])) warnings.push('Financeiro/Compras ainda não está mapeado.')
  else strengths.push('Financeiro ou Compras mapeado.')
  if (totalContacts > 1 && contactedCount <= 1) warnings.push('Oportunidade concentrada em um único relacionamento.')
  if (activeContacts.some((contact) => contact.decisionRole === 'blocker' || contact.stance === 'opposed')) warnings.push('Existe stakeholder com postura contrária ou bloqueadora.')
  if (relationshipScore >= 70) strengths.push('Relacionamento médio forte com a conta.')
  if (relationships.length >= Math.max(1, totalContacts - 1)) strengths.push('Relações internas da conta estão bem mapeadas.')

  const risk: AccountIntelligence['risk'] = coverageScore >= 75 && relationshipScore >= 60 ? 'low' : coverageScore >= 45 ? 'medium' : 'high'
  const riskLabel = risk === 'low' ? 'Risco de relacionamento baixo' : risk === 'medium' ? 'Cobertura parcial da conta' : 'Risco de relacionamento alto'

  const neverContacted = activeContacts
    .map((contact) => ({ contact, interactions: contactInteractionSummary(contact, snapshot) }))
    .filter((item) => item.interactions.total === 0 && !item.contact.lastContactAt)
    .sort((a, b) => Number(b.contact.influenceLevel) - Number(a.contact.influenceLevel))
  const missingDecision = !hasAnyRole(activeContacts, ['decision_maker', 'economic_buyer'])
  const missingFinance = !hasAnyRole(activeContacts, ['finance', 'procurement'])
  let recommendedAction: AccountIntelligence['recommendedAction']
  if (missingDecision) recommendedAction = { title: 'Identificar quem decide', explanation: 'A oportunidade ainda não possui decisor econômico/final claramente mapeado.' }
  else if (missingFinance) recommendedAction = { title: 'Mapear aprovação financeira', explanation: 'A decisão está avançando sem Financeiro/Compras identificado.' }
  else if (neverContacted.length) recommendedAction = { title: `Criar relacionamento com ${neverContacted[0].contact.name}`, explanation: `${decisionRoleLabels[neverContacted[0].contact.decisionRole]} ainda não possui interação registrada.`, contactId: neverContacted[0].contact.id }
  else if (lead.nextActionAt) recommendedAction = { title: 'Executar próxima ação do negócio', explanation: 'A conta está razoavelmente coberta; mantenha o avanço comercial coordenado.' }
  else recommendedAction = { title: 'Definir próxima ação da conta', explanation: 'A oportunidade está ativa sem próximo passo claramente registrado.' }

  return { coverageScore, relationshipScore, risk, riskLabel, missingRoleGroups, strengths, warnings, recommendedAction, contactedCount, totalContacts }
}
