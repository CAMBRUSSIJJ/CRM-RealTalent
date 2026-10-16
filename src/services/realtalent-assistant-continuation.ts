import type { AssistantAnswer } from './realtalent-assistant'

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const GENERIC_EXECUTION_REPLY = /^(?:faca|faz|execute|executa|pode fazer|pode executar|faz isso|faca isso|execute isso|executa isso|faca a proxima acao|execute a proxima acao|pode fazer isso|sim pode fazer|sim faca isso|sim execute isso)[.!?]*$/

export function resolveAssistantRecommendationContinuation(reply: string, answer: AssistantAnswer | null | undefined) {
  const suggestion = answer?.executionSuggestion
  if (!suggestion?.seed?.trim() || !suggestion.capabilityId?.trim()) return null
  if (!GENERIC_EXECUTION_REPLY.test(normalize(reply))) return null
  return `${suggestion.seed.trim()} Confirmação do usuário: ${reply.trim()}. Prepare a ação ${suggestion.capabilityId} usando o contexto atual e peça somente os dados obrigatórios que ainda faltarem.`
}
