import type { AssistantAnswer } from './realtalent-assistant'

// Local fast path is a READ-ONLY optimization, not an authorization path.
// Every mutation remains planned through the capability registry and executor.
const READ_INTENTS = new Set<AssistantAnswer['intent']>([
  'best_contacts','call_now','risk_deals','stale_deals','proposal_followup',
  'missing_decision_maker','forecast','priorities','prepare_call','next_action',
  'activity_summary','meeting_summary','suggest_message',
])

const normalized = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim()

// A deterministic veto is safer than mistaking requests to mutate data for
// questions. The model planner is still used for ambiguous and compound tasks.
export function isWriteOrCompoundRequest(prompt: string): boolean {
  const text = normalized(prompt)
  if (/\b(crie|criar|cria|cadastre|cadastrar|adicione|adicionar|atualize|atualizar|altere|alterar|mova|mover|exclua|excluir|apague|apagar|conclua|concluir|envie|enviar|mande|mandar|agende|agendar|marque|marcar|registre|registrar|ative|ativar|desative|desativar|organize|organizar|defina|definir|execute|executar|garimpe|garimpar)\b/.test(text)) return true
  if (/\b(faca|faz|fazer)\b/.test(text) && !/\b(o que|como|por que|porque|quem|quais)\b/.test(text)) return true
  if (/\b(e depois|em seguida|alem disso|tambem (crie|agende|envie|registre)|e (crie|agende|envie|registre|mova|exclua))\b/.test(text)) return true
  return false
}

// Compound guard protects against false partial-success responses when the model
// returns only one tool for two explicitly requested CRM operations.
export function requestsMultipleCrmActions(prompt: string): boolean {
  const text = normalized(prompt)
  const verbs = /\b(crie|criar|cadastre|cadastrar|adicione|adicionar|atualize|atualizar|mova|mover|exclua|excluir|conclua|concluir|envie|enviar|mande|mandar|agende|agendar|marque|marcar|registre|registrar|defina|definir|garimpe|garimpar|execute|executar|consulte|consultar|analise|analisar|calcule|calcular|liste|listar|prepare|preparar|busque|buscar|encontre|encontrar)\b/g
  return [...text.matchAll(verbs)].length >= 2 && /\b(e(?:\s+depois|\s+tambem)?|depois|em seguida|alem disso)\b|[;,]/.test(text)
}

/** A follow-up question must not be silently consumed as the missing value
 * of a previous write operation. Cancellation remains handled by the UI. */
export function startsNewRequestWhilePending(prompt: string): boolean {
  const text = normalized(prompt)
  return /^(quem|quais?|quantos?|quando|onde|o que|como|por que|porque|me mostre|mostre|liste|resuma|analise|na verdade|ou melhor)\b/.test(text)
}

export function canAnswerSalesReadLocally(prompt: string, answer: AssistantAnswer, hasPendingOperation = false): boolean {
  if (hasPendingOperation || isWriteOrCompoundRequest(prompt)) return false
  if (answer.plan || !READ_INTENTS.has(answer.intent)) return false
  const text = normalized(prompt)
  // Only explicit questions/analysis requests: let the semantic model handle
  // uncertain instructions, even if a keyword-based local answer exists.
  return /^(quem|qual|quais|quantos?|quando|onde|por que|porque|o que|como|me diga|me mostre|mostre|liste|resuma|resumir|analise|analisar|sugira|sugerir|prepare minha ligacao|prepare a ligacao|prepare o contato)\b/.test(text)
}
