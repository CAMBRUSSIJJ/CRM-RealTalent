import type { ContactRecord, Lead, PlaybookObjective, ProposalRecord, WorkspaceSnapshot } from '../domain/types'

export type CallSessionMode = 'focus' | 'power'
export type CallSessionObjective = PlaybookObjective

export interface CallSessionObjectiveDefinition {
  id: CallSessionObjective
  label: string
  shortLabel: string
  description: string
  successSignal: string
}

export const CALL_SESSION_OBJECTIVES: CallSessionObjectiveDefinition[] = [
  { id: 'first_meeting', label: 'Conseguir primeira reunião', shortLabel: 'Primeira reunião', description: 'Criar interesse suficiente para avançar a conversa para uma reunião.', successSignal: 'Reunião agendada' },
  { id: 'identify_decision_maker', label: 'Identificar quem decide', shortLabel: 'Mapear decisão', description: 'Descobrir decisor, influenciadores e quem precisa participar do próximo passo.', successSignal: 'Decisor identificado' },
  { id: 'qualify', label: 'Qualificar oportunidade', shortLabel: 'Qualificação', description: 'Entender dor, processo atual, impacto, timing e capacidade de avançar.', successSignal: 'Qualificação completa' },
  { id: 'proposal_followup', label: 'Validar proposta', shortLabel: 'Proposta', description: 'Entender percepção, objeções, stakeholders faltantes e caminho para decisão.', successSignal: 'Próximo passo da proposta definido' },
  { id: 'recover_opportunity', label: 'Recuperar oportunidade parada', shortLabel: 'Recuperação', description: 'Retomar contexto, confirmar prioridade e criar uma nova ação concreta.', successSignal: 'Oportunidade reativada' },
]

export const callSessionObjective = (id: CallSessionObjective) => CALL_SESSION_OBJECTIVES.find((item) => item.id === id) ?? CALL_SESSION_OBJECTIVES[0]

export const inferCallSessionObjective = (lead: Lead, snapshot: WorkspaceSnapshot | null | undefined): CallSessionObjective => {
  if (!snapshot) return 'first_meeting'
  const proposal = snapshot.proposals
    .filter((item) => item.leadId === lead.id && !['rejected', 'expired'].includes(item.status))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
  if (proposal && ['draft', 'sent', 'viewed', 'accepted'].includes(proposal.status)) return 'proposal_followup'
  const stage = snapshot.stages.find((item) => item.id === lead.stageId)
  const stageText = `${stage?.name ?? ''}`.toLowerCase()
  if (/diagn|qualif|discovery/.test(stageText)) return 'qualify'
  if (/proposta|negocia|fech/.test(stageText)) return 'proposal_followup'
  if (lead.lastContactAt && lead.nextActionAt && new Date(lead.nextActionAt).getTime() < Date.now()) return 'recover_opportunity'
  return 'first_meeting'
}

export interface DiscoveryChecklistItem {
  id: 'pain' | 'impact' | 'current_process' | 'decision' | 'budget' | 'timing' | 'next_step'
  label: string
  complete: boolean
  hint: string
}

export function buildDiscoveryChecklist(input: {
  lead: Lead | null | undefined
  contacts: ContactRecord[]
  notes: string
  decisionMaker: string
  currentSystem: string
  mainPain: string
  bestTime: string
  objective: CallSessionObjective
}): DiscoveryChecklistItem[] {
  const text = `${input.notes}`.toLowerCase()
  const hasDecisionRole = input.contacts.some((contact) => ['decision_maker', 'economic_buyer'].includes(contact.decisionRole))
  const pain = Boolean(input.mainPain.trim()) || /dor|problema|perde|dificuldade|gargalo|desafio/.test(text)
  const impact = /impact|custo|receita|perda|tempo|horas|dinheiro|cliente/.test(text)
  const current = Boolean(input.currentSystem.trim()) || /sistema|whatsapp|planilha|agenda|processo atual/.test(text)
  const decision = Boolean(input.decisionMaker.trim()) || hasDecisionRole
  const budget = /orçamento|budget|investimento|valor disponível|aprova.*valor/.test(text)
  const timing = Boolean(input.bestTime.trim()) || /prazo|quando|mês|semana|urgente|timing/.test(text)
  const next = Boolean(input.lead?.nextActionAt) || /próximo passo|reunião|retorno|proposta|enviar/.test(text)
  return [
    { id: 'pain', label: 'Problema', complete: pain, hint: 'Qual problema vale resolver agora?' },
    { id: 'impact', label: 'Impacto', complete: impact, hint: 'Qual o custo de manter a situação atual?' },
    { id: 'current_process', label: 'Processo atual', complete: current, hint: 'Como isso é feito hoje?' },
    { id: 'decision', label: 'Decisão', complete: decision, hint: 'Quem participa e quem aprova?' },
    { id: 'budget', label: 'Orçamento', complete: budget, hint: 'Existe faixa de investimento ou aprovação?' },
    { id: 'timing', label: 'Timing', complete: timing, hint: 'Quando precisam resolver?' },
    { id: 'next_step', label: 'Próximo passo', complete: next, hint: input.objective === 'proposal_followup' ? 'Qual é o caminho para a decisão?' : 'Qual avanço concreto sai desta conversa?' },
  ]
}

export interface CallSignalDefinition {
  id: 'pain' | 'competitor' | 'decision_maker' | 'budget' | 'timing' | 'existing_solution' | 'interest'
  label: string
  note: string
}

export const CALL_QUICK_SIGNALS: CallSignalDefinition[] = [
  { id: 'pain', label: 'Dor', note: 'Sinal: dor relevante identificada.' },
  { id: 'competitor', label: 'Concorrente', note: 'Sinal: concorrente ou alternativa atual mencionada.' },
  { id: 'decision_maker', label: 'Decisor', note: 'Sinal: processo de decisão ou decisor mencionado.' },
  { id: 'budget', label: 'Orçamento', note: 'Sinal: orçamento/investimento discutido.' },
  { id: 'timing', label: 'Timing', note: 'Sinal: prazo de decisão ou implantação mencionado.' },
  { id: 'existing_solution', label: 'Já usa solução', note: 'Sinal: processo ou solução atual identificado.' },
  { id: 'interest', label: 'Interessado', note: 'Sinal: interesse explícito em avançar.' },
]

export const currentProposalForLead = (leadId: string, proposals: ProposalRecord[]) => proposals
  .filter((item) => item.leadId === leadId && !['rejected', 'expired'].includes(item.status))
  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null

export const callModeDescription = (mode: CallSessionMode) => mode === 'power'
  ? 'Após o wrap-up, o RealTalent prepara automaticamente o próximo contato da fila. Nenhuma chamada é iniciada sem controle do vendedor.'
  : 'Um contato por vez, com máximo contexto da conta antes de cada chamada.'
