import type { Lead, WorkspaceSnapshot } from '../domain/types'
import type { AssistantAnswer, AssistantContext, AssistantDraft, AssistantExecutionSuggestion } from './realtalent-assistant'
import { realTalentAiGateway as coreRealTalentAiGateway, type RealTalentAiGatewayResult } from './realtalent-ai-gateway-core'
import { buildSalesAgentContext, formatSalesAgentNextBestAction } from './realtalent-sales-intelligence-agent'

export * from './realtalent-ai-gateway-core'

const normalizeIdentity = (value: string | null | undefined) => (value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const verifiedCompanyName = (lead: Lead, snapshot: WorkspaceSnapshot) => {
  const canonical = lead.companyId
    ? snapshot.companies.find((company) => company.id === lead.companyId)?.name?.trim()
    : ''
  if (canonical && normalizeIdentity(canonical) !== normalizeIdentity(lead.name)) return canonical

  const fallback = lead.company?.trim()
  if (!fallback || normalizeIdentity(fallback) === normalizeIdentity(lead.name)) return null
  return fallback
}

const leadForAnswer = (answer: AssistantAnswer, snapshot: WorkspaceSnapshot, context: AssistantContext) => {
  const leadId = answer.focus?.leadId
    ?? answer.items.find((item) => item.leadId)?.leadId
    ?? context.focusLeadId
    ?? (context.previousLeadIds?.length === 1 ? context.previousLeadIds[0] : null)
  return leadId ? snapshot.leads.find((lead) => lead.id === leadId) ?? null : null
}

const activeProposalForLead = (snapshot: WorkspaceSnapshot, leadId: string) => snapshot.proposals
  .filter((proposal) => proposal.leadId === leadId && proposal.isCurrentVersion && !['rejected', 'cancelled'].includes(proposal.status))
  .sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || b.version - a.version)[0] ?? null

interface GroundedMessage {
  draft: AssistantDraft
  relationshipState: 'first_contact' | 'follow_up' | 'proposal_follow_up'
  executionSuggestion: AssistantExecutionSuggestion | null
}

const groundedMessageForLead = (lead: Lead, snapshot: WorkspaceSnapshot, now = new Date()): GroundedMessage => {
  const sales = buildSalesAgentContext(lead, snapshot, now)
  const proposal = activeProposalForLead(snapshot, lead.id)
  const firstName = lead.name.trim().split(/\s+/)[0] || lead.name
  const hasCompletedInteraction = Boolean(sales.commercial.lastInteractionAt)
  const proposalFollowup = Boolean(proposal && ['sent', 'viewed'].includes(proposal.status))
  const channel: AssistantDraft['channel'] = lead.phone ? 'whatsapp' : 'email'
  const company = verifiedCompanyName(lead, snapshot)

  const relationshipState: GroundedMessage['relationshipState'] = proposalFollowup
    ? 'proposal_follow_up'
    : hasCompletedInteraction
      ? 'follow_up'
      : 'first_contact'

  const body = relationshipState === 'proposal_follow_up' && proposal
    ? `Olá, ${firstName}! Tudo bem? Queria acompanhar a proposta ${proposal.title}. Conseguiu avaliar os pontos principais? Posso esclarecer alguma dúvida e alinharmos o próximo passo?`
    : relationshipState === 'follow_up'
      ? `Olá, ${firstName}! Tudo bem? Queria dar continuidade ao nosso contato e alinhar o próximo passo. Como está sua disponibilidade?`
      : `Olá, ${firstName}! Tudo bem? Gostaria de conversar rapidamente para entender seu momento e ver como podemos ajudar. Você teria alguns minutos para falarmos?`

  const title = relationshipState === 'first_contact'
    ? `Primeiro contato · ${lead.name}`
    : relationshipState === 'proposal_follow_up' && proposal
      ? `Follow-up · ${proposal.title}`
      : `Follow-up · ${company || lead.name}`

  const rationale = relationshipState === 'first_contact'
    ? 'Não existe interação concluída registrada; a mensagem foi tratada como primeiro contato.'
    : relationshipState === 'proposal_follow_up'
      ? 'Existe uma proposta enviada ou visualizada; o texto faz acompanhamento desse evento real.'
      : 'Existe interação concluída registrada; o texto continua o relacionamento sem inventar assunto ou empresa.'

  const draft: AssistantDraft = {
    kind: 'message',
    channel,
    leadId: lead.id,
    title,
    body,
    rationale,
  }

  if (lead.doNotContact) return { draft, relationshipState, executionSuggestion: null }

  const executionSuggestion: AssistantExecutionSuggestion | null = channel === 'whatsapp' && lead.phone
    ? {
        capabilityId: 'communications.send_whatsapp',
        label: 'Enviar WhatsApp',
        seed: `Envie uma mensagem de WhatsApp para ${lead.name}. record_query: ${lead.name}. recipient: ${lead.phone}. body: ${body}`,
      }
    : channel === 'email' && lead.email
      ? {
          capabilityId: 'communications.send_email',
          label: 'Enviar e-mail',
          seed: `Envie um e-mail para ${lead.name}. record_query: ${lead.name}. recipient: ${lead.email}. subject: Contato RealTalent. body: ${body}`,
        }
      : null

  return { draft, relationshipState, executionSuggestion }
}

const sanitizeCriticalContradiction = (answer: AssistantAnswer, lead: Lead, snapshot: WorkspaceSnapshot, now: Date): AssistantAnswer => {
  const sales = buildSalesAgentContext(lead, snapshot, now)
  if (sales.health.level !== 'critical') return answer

  const replacement = 'A oportunidade está em estado crítico pelos sinais agregados atuais.'
  return {
    ...answer,
    text: answer.text
      .replace(/não há risco crítico detectado no momento\.?/gi, replacement)
      .replace(/não há risco crítico\.?/gi, replacement),
    facts: answer.facts.map((fact) => /sem risco crítico/i.test(fact) ? `Saúde da oportunidade: ${sales.health.score}/100 (${sales.health.label}).` : fact),
  }
}

const groundNextAction = (answer: AssistantAnswer, lead: Lead, snapshot: WorkspaceSnapshot, now: Date): AssistantAnswer => {
  const sales = buildSalesAgentContext(lead, snapshot, now)
  const neverContacted = sales.risks.some((risk) => risk.key === 'never-contacted')
  const mainRisk = sales.risks[0]
  const grounded = neverContacted ? groundedMessageForLead(lead, snapshot, now) : null

  return {
    ...answer,
    title: `Próxima ação · ${lead.name}`,
    text: formatSalesAgentNextBestAction(lead, snapshot, now),
    items: answer.items.map((item) => item.leadId === lead.id ? {
      ...item,
      title: verifiedCompanyName(lead, snapshot) || lead.name,
      reason: sales.nextBestAction.explanation,
      route: sales.nextBestAction.route,
      action: sales.nextBestAction.kind,
    } : item),
    facts: [
      `Saúde da oportunidade: ${sales.health.score}/100 (${sales.health.label}).`,
      mainRisk ? `Principal risco: ${mainRisk.title} — ${mainRisk.detail}` : `Próxima ação executável: ${sales.nextBestAction.title}.`,
      `Próxima ação executável: ${sales.nextBestAction.title}.`,
    ],
    ...(grounded ? { draft: grounded.draft, executionSuggestion: grounded.executionSuggestion } : {}),
    suggestedPrompts: grounded?.executionSuggestion
      ? ['Envie', 'Sugira uma mensagem', 'Por que você recomenda isso?']
      : answer.suggestedPrompts,
  }
}

const groundSuggestedMessage = (answer: AssistantAnswer, lead: Lead, snapshot: WorkspaceSnapshot, now: Date): AssistantAnswer => {
  const grounded = groundedMessageForLead(lead, snapshot, now)
  const firstContact = grounded.relationshipState === 'first_contact'
  const channelLabel = grounded.draft.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'

  return {
    ...answer,
    title: firstContact ? 'Mensagem de primeiro contato' : 'Mensagem de follow-up',
    text: firstContact
      ? 'Preparei uma mensagem de primeiro contato baseada no histórico real do CRM. Ela ainda não foi enviada.'
      : 'Preparei uma mensagem de acompanhamento baseada em uma interação ou proposta registrada. Ela ainda não foi enviada.',
    draft: grounded.draft,
    executionSuggestion: grounded.executionSuggestion,
    facts: [
      `Canal sugerido: ${channelLabel}.`,
      firstContact
        ? 'Contexto do canal: nenhuma interação concluída; não usei linguagem de retomada.'
        : grounded.relationshipState === 'proposal_follow_up'
          ? 'Contexto do canal: existe proposta enviada/visualizada; o follow-up está ancorado nesse evento.'
          : 'Contexto do canal: existe interação concluída registrada.',
      ...(lead.doNotContact ? ['Envio bloqueado: o contato está marcado como não contatar.'] : []),
    ],
    suggestedPrompts: grounded.executionSuggestion
      ? ['Envie', 'Sugira uma mensagem', 'Qual a próxima ação?']
      : answer.suggestedPrompts,
  }
}

const groundAssistantAnswer = (answer: AssistantAnswer, snapshot: WorkspaceSnapshot, context: AssistantContext, now = new Date()): AssistantAnswer => {
  const lead = leadForAnswer(answer, snapshot, context)
  if (!lead) return answer

  const consistent = sanitizeCriticalContradiction(answer, lead, snapshot, now)
  if (consistent.intent === 'next_action') return groundNextAction(consistent, lead, snapshot, now)
  if (consistent.intent === 'suggest_message') return groundSuggestedMessage(consistent, lead, snapshot, now)
  return consistent
}

export const realTalentAiGateway = {
  ...coreRealTalentAiGateway,
  id: 'realtalent-ai-gateway-v6-grounded-actions',
  async answer(prompt: string, snapshot: WorkspaceSnapshot, assistantContext: AssistantContext = {}): Promise<RealTalentAiGatewayResult> {
    const result = await coreRealTalentAiGateway.answer(prompt, snapshot, assistantContext)
    return {
      ...result,
      answer: groundAssistantAnswer(result.answer, snapshot, assistantContext, assistantContext.now ?? new Date()),
    }
  },
}
