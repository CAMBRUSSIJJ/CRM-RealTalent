import type { Lead, WorkspaceSnapshot } from '../domain/types'

export type IntegritySeverity = 'error' | 'warning' | 'info'

export interface IntegrityIssue {
  code: string
  severity: IntegritySeverity
  label: string
  detail: string
  entityIds: string[]
}

export interface IntegrityReport {
  checkedAt: string
  score: number
  errors: number
  warnings: number
  issues: IntegrityIssue[]
  counts: {
    stages: number
    leads: number
    activities: number
    calls: number
    events: number
    goals: number
    automations: number
  }
}

const normalizePhone = (value: string) => value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
const normalizeText = (value: string) => value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const isInvalidDate = (value: string | null | undefined) => Boolean(value && Number.isNaN(new Date(value).getTime()))
const isInvalidDateOnly = (value: string | null | undefined) => Boolean(value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T12:00:00.000Z`).getTime())))

const duplicateGroups = (leads: Lead[], keyOf: (lead: Lead) => string, minimumLength: number) => {
  const groups = new Map<string, Lead[]>()
  for (const lead of leads) {
    const key = keyOf(lead)
    if (key.length < minimumLength) continue
    groups.set(key, [...(groups.get(key) ?? []), lead])
  }
  return [...groups.values()].filter((group) => group.length > 1)
}

export function inspectWorkspaceIntegrity(snapshot: WorkspaceSnapshot): IntegrityReport {
  const issues: IntegrityIssue[] = []
  const stageById = new Map(snapshot.stages.map((stage) => [stage.id, stage]))
  const leadById = new Map(snapshot.leads.map((lead) => [lead.id, lead]))
  const companyById = new Map(snapshot.companies.map((company) => [company.id, company]))
  const contactById = new Map(snapshot.contacts.map((contact) => [contact.id, contact]))
  const opportunityById = new Map(snapshot.opportunities.map((opportunity) => [opportunity.id, opportunity]))
  const proposalById = new Map(snapshot.proposals.map((proposal) => [proposal.id, proposal]))
  const buyerRooms = snapshot.buyerRooms ?? []

  const add = (issue: IntegrityIssue) => issues.push(issue)

  const invalidStages = snapshot.stages.filter((stage) => stage.isWon && stage.isLost)
  if (invalidStages.length) add({
    code: 'stage_conflicting_status', severity: 'error', label: 'Etapas com status conflitante',
    detail: `${invalidStages.length} etapa(s) estão marcadas como ganha e perdida ao mesmo tempo.`, entityIds: invalidStages.map((stage) => stage.id),
  })

  const stageOrderKeys = new Map<number, string[]>()
  for (const stage of snapshot.stages) stageOrderKeys.set(stage.order, [...(stageOrderKeys.get(stage.order) ?? []), stage.id])
  const invalidStageNumbers = snapshot.stages.filter((stage) => !Number.isFinite(stage.order) || stage.order < 1 || !Number.isFinite(stage.probability) || stage.probability < 0 || stage.probability > 100)
  const duplicateStageOrders = [...stageOrderKeys.values()].filter((ids) => ids.length > 1).flat()
  if (invalidStageNumbers.length || duplicateStageOrders.length) add({
    code: 'invalid_stage_order_probability', severity: 'warning', label: 'Configuração inconsistente do Pipeline',
    detail: `${invalidStageNumbers.length} etapa(s) possuem ordem/probabilidade inválida e ${duplicateStageOrders.length} participam de ordens duplicadas.`, entityIds: [...new Set([...invalidStageNumbers.map((stage) => stage.id), ...duplicateStageOrders])],
  })

  const orphanLeads = snapshot.leads.filter((lead) => !stageById.has(lead.stageId))
  if (orphanLeads.length) add({
    code: 'lead_without_stage', severity: 'error', label: 'Leads fora do Pipeline',
    detail: `${orphanLeads.length} lead(s) apontam para uma etapa inexistente.`, entityIds: orphanLeads.map((lead) => lead.id),
  })

  const statusMismatch = snapshot.leads.filter((lead) => {
    const stage = stageById.get(lead.stageId)
    if (!stage) return false
    const expected = stage.isWon ? 'won' : stage.isLost ? 'lost' : 'active'
    return lead.status !== expected && lead.status !== 'archived'
  })
  if (statusMismatch.length) add({
    code: 'lead_stage_status_mismatch', severity: 'warning', label: 'Status divergente do Pipeline',
    detail: `${statusMismatch.length} lead(s) têm status diferente da etapa atual.`, entityIds: statusMismatch.map((lead) => lead.id),
  })

  const invalidLeadValues = snapshot.leads.filter((lead) => !Number.isFinite(lead.value) || lead.value < 0 || (lead.influenceLevel !== undefined && (!Number.isFinite(lead.influenceLevel) || lead.influenceLevel < 0 || lead.influenceLevel > 100)) || isInvalidDate(lead.nextActionAt) || isInvalidDate(lead.lastContactAt) || isInvalidDate(lead.expectedCloseAt) || isInvalidDate(lead.capturedAt))
  if (invalidLeadValues.length) add({
    code: 'invalid_lead_values', severity: 'error', label: 'Dados inválidos em leads',
    detail: `${invalidLeadValues.length} lead(s) possuem valor, influência ou data inválida.`, entityIds: invalidLeadValues.map((lead) => lead.id),
  })

  const invalidLeadRefs = snapshot.leads.filter((lead) => (lead.companyId && !companyById.has(lead.companyId)) || (lead.primaryContactId && !contactById.has(lead.primaryContactId)) || (lead.opportunityId && !opportunityById.has(lead.opportunityId)))
  if (invalidLeadRefs.length) add({
    code: 'lead_orphan_commercial_reference', severity: 'error', label: 'Vínculos comerciais quebrados em leads',
    detail: `${invalidLeadRefs.length} lead(s) apontam para empresa, contato ou oportunidade inexistente.`, entityIds: invalidLeadRefs.map((lead) => lead.id),
  })

  const orphanActivities = snapshot.activities.filter((activity) => activity.leadId && !leadById.has(activity.leadId))
  if (orphanActivities.length) add({
    code: 'orphan_activity', severity: 'warning', label: 'Atividades sem lead',
    detail: `${orphanActivities.length} atividade(s) apontam para leads removidos.`, entityIds: orphanActivities.map((activity) => activity.id),
  })

  const orphanCalls = snapshot.calls.filter((call) => !leadById.has(call.leadId))
  if (orphanCalls.length) add({
    code: 'orphan_call', severity: 'error', label: 'Ligações sem lead',
    detail: `${orphanCalls.length} ligação(ões) apontam para leads inexistentes.`, entityIds: orphanCalls.map((call) => call.id),
  })

  const orphanEvents = snapshot.events.filter((event) => event.leadId && !leadById.has(event.leadId))
  if (orphanEvents.length) add({
    code: 'orphan_event', severity: 'warning', label: 'Eventos sem lead',
    detail: `${orphanEvents.length} compromisso(s) apontam para leads removidos.`, entityIds: orphanEvents.map((event) => event.id),
  })

  const invalidEvents = snapshot.events.filter((event) => isInvalidDate(event.startsAt) || isInvalidDate(event.endsAt) || new Date(event.endsAt).getTime() <= new Date(event.startsAt).getTime())
  if (invalidEvents.length) add({
    code: 'invalid_event_range', severity: 'error', label: 'Horários inválidos na Agenda',
    detail: `${invalidEvents.length} compromisso(s) possuem datas inválidas ou término anterior ao início.`, entityIds: invalidEvents.map((event) => event.id),
  })

  const invalidActivities = snapshot.activities.filter((activity) => isInvalidDate(activity.dueAt) || isInvalidDate(activity.completedAt))
  if (invalidActivities.length) add({
    code: 'invalid_activity_date', severity: 'warning', label: 'Datas inválidas em atividades',
    detail: `${invalidActivities.length} atividade(s) possuem datas que não podem ser interpretadas.`, entityIds: invalidActivities.map((activity) => activity.id),
  })

  const invalidCalls = snapshot.calls.filter((call) => !Number.isFinite(call.durationSeconds) || call.durationSeconds < 0 || isInvalidDate(call.startedAt) || isInvalidDate(call.endedAt) || Boolean(call.endedAt && new Date(call.endedAt).getTime() < new Date(call.startedAt).getTime()) || Boolean(call.contactId && !contactById.has(call.contactId)))
  if (invalidCalls.length) add({
    code: 'invalid_call_data', severity: 'error', label: 'Ligações inconsistentes',
    detail: `${invalidCalls.length} ligação(ões) possuem duração, data ou contato inválido.`, entityIds: invalidCalls.map((call) => call.id),
  })

  const invalidCompanies = snapshot.companies.filter((company) => company.leadIds.some((id) => !leadById.has(id)))
  if (invalidCompanies.length) add({ code: 'company_orphan_lead', severity: 'warning', label: 'Empresas com vínculos antigos', detail: `${invalidCompanies.length} empresa(s) ainda referenciam leads inexistentes.`, entityIds: invalidCompanies.map((company) => company.id) })

  const invalidContacts = snapshot.contacts.filter((contact) => (contact.companyId && !companyById.has(contact.companyId)) || contact.leadIds.some((id) => !leadById.has(id)) || (contact.relationshipScore !== undefined && (!Number.isFinite(contact.relationshipScore) || contact.relationshipScore < 0 || contact.relationshipScore > 100)) || !Number.isFinite(contact.influenceLevel) || contact.influenceLevel < 0 || contact.influenceLevel > 100 || isInvalidDate(contact.lastContactAt) || isInvalidDate(contact.nextActionAt))
  if (invalidContacts.length) add({ code: 'invalid_contact_reference', severity: 'error', label: 'Contatos inconsistentes', detail: `${invalidContacts.length} contato(s) possuem vínculo, pontuação ou data inválida.`, entityIds: invalidContacts.map((contact) => contact.id) })

  const invalidRelationships = snapshot.contactRelationships.filter((relationship) => relationship.fromContactId === relationship.toContactId || !contactById.has(relationship.fromContactId) || !contactById.has(relationship.toContactId) || (relationship.companyId && !companyById.has(relationship.companyId)) || !Number.isFinite(relationship.strength) || relationship.strength < 0 || relationship.strength > 100)
  if (invalidRelationships.length) add({ code: 'invalid_contact_relationship', severity: 'error', label: 'Relações entre contatos inconsistentes', detail: `${invalidRelationships.length} relação(ões) possuem participantes, empresa ou intensidade inválida.`, entityIds: invalidRelationships.map((relationship) => relationship.id) })

  const invalidOpportunities = snapshot.opportunities.filter((opportunity) => {
    const lead = leadById.get(opportunity.leadId)
    const stage = stageById.get(opportunity.stageId)
    const expectedStatus = stage ? (stage.isWon ? 'won' : stage.isLost ? 'lost' : 'active') : null
    return !lead || !stage || (opportunity.companyId && !companyById.has(opportunity.companyId)) || (opportunity.primaryContactId && !contactById.has(opportunity.primaryContactId)) || (opportunity.officialProposalId && !proposalById.has(opportunity.officialProposalId)) || !Number.isFinite(opportunity.value) || opportunity.value < 0 || !Number.isFinite(opportunity.probability ?? 0) || (opportunity.probability ?? 0) < 0 || (opportunity.probability ?? 0) > 100 || isInvalidDateOnly(opportunity.expectedCloseAt) || (expectedStatus && opportunity.status !== expectedStatus && opportunity.status !== 'archived')
  })
  if (invalidOpportunities.length) add({ code: 'invalid_opportunity_reference', severity: 'error', label: 'Oportunidades inconsistentes', detail: `${invalidOpportunities.length} oportunidade(s) possuem vínculo, status, valor ou data inválida.`, entityIds: invalidOpportunities.map((opportunity) => opportunity.id) })

  const proposalNumberGroups = new Map<string, string[]>()
  for (const proposal of snapshot.proposals) {
    const key = normalizeText(proposal.proposalNumber)
    proposalNumberGroups.set(key, [...(proposalNumberGroups.get(key) ?? []), proposal.id])
  }
  const duplicateProposalNumbers = [...proposalNumberGroups.values()].filter((ids) => ids.length > 1).flat()
  if (duplicateProposalNumbers.length) add({ code: 'duplicate_proposal_number', severity: 'error', label: 'Numeração duplicada de propostas', detail: `${duplicateProposalNumbers.length} proposta(s) compartilham um número que deveria ser único.`, entityIds: duplicateProposalNumbers })

  const invalidProposals = snapshot.proposals.filter((proposal) => {
    const lead = leadById.get(proposal.leadId)
    const opportunity = proposal.opportunityId ? opportunityById.get(proposal.opportunityId) : null
    const invalidItems = !proposal.items.length || proposal.items.some((item) => !item.name.trim() || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0 || !Number.isFinite(item.discountPercent) || item.discountPercent < 0 || item.discountPercent > 100 || !Number.isFinite(item.taxRate) || item.taxRate < 0)
    return !lead || (proposal.companyId && !companyById.has(proposal.companyId)) || (proposal.contactId && !contactById.has(proposal.contactId)) || Boolean(proposal.opportunityId && !opportunity) || Boolean(opportunity && opportunity.leadId !== proposal.leadId) || !Number.isFinite(proposal.probability) || proposal.probability < 0 || proposal.probability > 100 || !Number.isFinite(proposal.totalContractValue) || proposal.totalContractValue < 0 || !Number.isFinite(proposal.contractTermMonths) || proposal.contractTermMonths < 1 || isInvalidDateOnly(proposal.validUntil) || isInvalidDateOnly(proposal.expectedCloseAt) || isInvalidDateOnly(proposal.contractStartAt) || isInvalidDateOnly(proposal.contractEndAt) || isInvalidDateOnly(proposal.postSaleStartAt) || Boolean(proposal.contractStartAt && proposal.contractEndAt && proposal.contractEndAt < proposal.contractStartAt) || invalidItems
  })
  if (invalidProposals.length) add({ code: 'invalid_proposal_data', severity: 'error', label: 'Propostas inconsistentes', detail: `${invalidProposals.length} proposta(s) possuem vínculo, item, valor ou data inválida.`, entityIds: invalidProposals.map((proposal) => proposal.id) })

  const officialByLead = new Map<string, string[]>()
  const currentByGroup = new Map<string, string[]>()
  for (const proposal of snapshot.proposals) {
    if (proposal.isOfficial && proposal.isCurrentVersion) officialByLead.set(proposal.leadId, [...(officialByLead.get(proposal.leadId) ?? []), proposal.id])
    if (proposal.isCurrentVersion) currentByGroup.set(proposal.proposalGroupId, [...(currentByGroup.get(proposal.proposalGroupId) ?? []), proposal.id])
  }
  const conflictingProposalVersions = [...officialByLead.values(), ...currentByGroup.values()].filter((ids) => ids.length > 1).flat()
  if (conflictingProposalVersions.length) add({ code: 'proposal_version_conflict', severity: 'error', label: 'Versões oficiais conflitantes', detail: 'Há mais de uma proposta oficial por lead ou mais de uma revisão vigente no mesmo grupo.', entityIds: [...new Set(conflictingProposalVersions)] })

  const invalidRevenue = snapshot.revenueEntries.filter((entry) => !Number.isFinite(entry.amount) || entry.amount < 0 || !Number.isFinite(entry.recurringMonthlyAmount) || entry.recurringMonthlyAmount < 0 || isInvalidDate(entry.recognizedAt) || isInvalidDateOnly(entry.competenceDate) || isInvalidDateOnly(entry.servicePeriodStart) || isInvalidDateOnly(entry.servicePeriodEnd) || Boolean(entry.servicePeriodStart && entry.servicePeriodEnd && entry.servicePeriodEnd < entry.servicePeriodStart) || Boolean(entry.leadId && !leadById.has(entry.leadId)) || Boolean(entry.proposalId && !proposalById.has(entry.proposalId)) || Boolean(entry.opportunityId && !opportunityById.has(entry.opportunityId)))
  if (invalidRevenue.length) add({ code: 'invalid_revenue_entry', severity: 'error', label: 'Receitas inconsistentes', detail: `${invalidRevenue.length} lançamento(s) possuem referência, valor ou competência inválida.`, entityIds: invalidRevenue.map((entry) => entry.id) })

  const invalidAutomationStageRefs = snapshot.automationRules.filter((rule) => rule.actions.some((action) => action.type === 'move_stage' && !stageById.has(action.value)))
  if (invalidAutomationStageRefs.length) add({ code: 'automation_invalid_stage', severity: 'error', label: 'Automações com etapa inexistente', detail: `${invalidAutomationStageRefs.length} automação(ões) tentam mover leads para uma etapa que não existe.`, entityIds: invalidAutomationStageRefs.map((rule) => rule.id) })

  const invalidBuyerRooms = buyerRooms.filter((room) => {
    const proposal = proposalById.get(room.proposalId)
    const invalidRefs = !leadById.has(room.leadId) || !proposal || Boolean(room.companyId && !companyById.has(room.companyId)) || Boolean(room.opportunityId && !opportunityById.has(room.opportunityId))
    const invalidDates = isInvalidDate(room.expiresAt) || isInvalidDate(room.lastOpenedAt) || isInvalidDate(room.createdAt) || isInvalidDate(room.updatedAt)
    const invalidSteps = room.steps.some((step) => !step.id?.trim() || !step.title?.trim() || isInvalidDate(step.dueAt) || isInvalidDate(step.completedAt))
    const invalidToken = !room.shareToken || room.shareToken.length < 32
    return invalidRefs || invalidDates || invalidSteps || invalidToken || (proposal ? proposal.leadId !== room.leadId : false)
  })
  if (invalidBuyerRooms.length) add({ code: 'invalid_buyer_room', severity: 'error', label: 'Buyer Rooms inconsistentes', detail: `${invalidBuyerRooms.length} sala(s) possuem referência, token, etapa ou data inválida.`, entityIds: invalidBuyerRooms.map((room) => room.id) })

  const roomsByProposal = new Map<string, string[]>()
  const roomsByToken = new Map<string, string[]>()
  for (const room of buyerRooms.filter((item) => item.status !== 'archived')) {
    roomsByProposal.set(room.proposalId, [...(roomsByProposal.get(room.proposalId) ?? []), room.id])
    roomsByToken.set(room.shareToken, [...(roomsByToken.get(room.shareToken) ?? []), room.id])
  }
  const duplicateBuyerRooms = [...roomsByProposal.values()].filter((ids) => ids.length > 1).flat()
  if (duplicateBuyerRooms.length) add({ code: 'duplicate_buyer_room_proposal', severity: 'error', label: 'Propostas com mais de uma Buyer Room', detail: 'Há mais de uma sala ativa para a mesma proposta.', entityIds: [...new Set(duplicateBuyerRooms)] })
  const duplicateBuyerRoomTokens = [...roomsByToken.values()].filter((ids) => ids.length > 1).flat()
  if (duplicateBuyerRoomTokens.length) add({ code: 'duplicate_buyer_room_token', severity: 'error', label: 'Tokens públicos duplicados', detail: 'Duas ou mais Buyer Rooms compartilham o mesmo token público.', entityIds: [...new Set(duplicateBuyerRoomTokens)] })

  const phoneDuplicates = duplicateGroups(snapshot.leads, (lead) => normalizePhone(lead.phone), 10)
  if (phoneDuplicates.length) add({
    code: 'duplicate_phone', severity: 'warning', label: 'Possíveis leads duplicados por telefone',
    detail: `${phoneDuplicates.length} grupo(s) compartilham o mesmo telefone.`, entityIds: phoneDuplicates.flatMap((group) => group.map((lead) => lead.id)),
  })

  const emailDuplicates = duplicateGroups(snapshot.leads, (lead) => normalizeText(lead.email), 5)
  if (emailDuplicates.length) add({
    code: 'duplicate_email', severity: 'warning', label: 'Possíveis leads duplicados por e-mail',
    detail: `${emailDuplicates.length} grupo(s) compartilham o mesmo e-mail.`, entityIds: emailDuplicates.flatMap((group) => group.map((lead) => lead.id)),
  })

  const nameCityDuplicates = duplicateGroups(snapshot.leads, (lead) => {
    const name = normalizeText(lead.company || lead.name)
    const city = normalizeText(lead.city)
    return name && city ? `${name}|${city}` : ''
  }, 5)
  if (nameCityDuplicates.length) add({
    code: 'duplicate_name_city', severity: 'info', label: 'Registros semelhantes por empresa e cidade',
    detail: `${nameCityDuplicates.length} grupo(s) merecem revisão antes de novas importações.`, entityIds: nameCityDuplicates.flatMap((group) => group.map((lead) => lead.id)),
  })

  const rulesWithoutActions = snapshot.automationRules.filter((rule) => !rule.actions.length)
  if (rulesWithoutActions.length) add({
    code: 'automation_without_actions', severity: 'error', label: 'Automações sem ações',
    detail: `${rulesWithoutActions.length} automação(ões) não possuem nenhuma ação configurada.`, entityIds: rulesWithoutActions.map((rule) => rule.id),
  })

  const invalidGoals = snapshot.goals.filter((goal) => !Number.isFinite(goal.targetValue) || goal.targetValue <= 0 || isInvalidDateOnly(goal.periodStart) || isInvalidDateOnly(goal.periodEnd) || goal.periodEnd < goal.periodStart)
  if (invalidGoals.length) add({
    code: 'invalid_goal', severity: 'warning', label: 'Metas inválidas',
    detail: `${invalidGoals.length} meta(s) possuem alvo ou período inválido.`, entityIds: invalidGoals.map((goal) => goal.id),
  })

  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.filter((issue) => issue.severity === 'warning').length
  const score = Math.max(0, 100 - (errors * 18) - (warnings * 7) - (issues.filter((issue) => issue.severity === 'info').length * 2))

  return {
    checkedAt: new Date().toISOString(), score, errors, warnings, issues,
    counts: {
      stages: snapshot.stages.length, leads: snapshot.leads.length, activities: snapshot.activities.length,
      calls: snapshot.calls.length, events: snapshot.events.length, goals: snapshot.goals.length,
      automations: snapshot.automationRules.length,
    },
  }
}
