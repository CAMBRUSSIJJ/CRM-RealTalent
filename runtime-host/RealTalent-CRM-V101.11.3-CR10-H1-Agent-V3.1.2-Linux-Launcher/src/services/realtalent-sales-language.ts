import type { AppRoute } from '../domain/types'

export type SemanticSalesIntent =
  | 'best_contacts' | 'call_now' | 'risk_deals' | 'stale_deals' | 'proposal_followup' | 'missing_decision_maker' | 'forecast' | 'priorities'
  | 'prepare_call' | 'next_action' | 'activity_summary' | 'suggest_message' | 'meeting_summary' | 'create_task' | 'create_followups' | 'complete_task' | 'unknown'

export interface SemanticSalesInterpretation {
  version: '3.1.5' | string
  language: 'pt' | 'en' | 'es' | 'other'
  intent: SemanticSalesIntent
  object: 'contact' | 'lead' | 'opportunity' | 'proposal' | 'task' | 'calendar' | 'pipeline' | 'communication' | 'none'
  action: 'read' | 'rank' | 'create' | 'complete' | 'draft' | 'analyze' | 'none'
  confidence: number
  needs_clarification: boolean
  clarification: string
  canonical_request: string
  rationale: string
  entities: {
    contact_query: string
    assignee_query: string
    task_title: string
    due_at_iso: string
    explicit_time: boolean
    task_type: 'call' | 'generic' | 'none'
    criteria: string[]
    reference: string
  }
}

export type CommercialLanguageIntent =
  | 'best_contacts'
  | 'call_now'
  | 'risk_deals'
  | 'stale_deals'
  | 'proposal_followup'
  | 'missing_decision_maker'
  | 'forecast'
  | 'priorities'
  | null

const normalize = (value: string) => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const hasAny = (text: string, values: string[]) => values.some((value) => text.includes(value))

/**
 * Fallback local de compatibilidade/latência zero.
 * A V3.1.5 usa o Semantic Sales Language Engine estruturado como interpretador principal
 * para frases não triviais; esta função permanece como fallback quando o runtime/modelo não está disponível.
 */
export function inferCommercialLanguageIntent(raw: string, route?: AppRoute | null): CommercialLanguageIntent {
  const q = normalize(raw)
  if (!q) return null

  const contactNouns = ['contato', 'contatos', 'lead', 'leads', 'cliente', 'clientes', 'prospect', 'prospects', 'prospecto', 'prospectos', 'contact', 'contacts']
  const qualityWords = ['melhor', 'melhores', 'top', 'promissor', 'promissores', 'quente', 'quentes', 'prioritario', 'prioritarios', 'prioridade', 'potencial', 'qualificado', 'qualificados', 'mais chance', 'maior chance', 'vale mais a pena', 'valem mais a pena', 'best', 'hottest', 'promising', 'mejores', 'mejor', 'calientes']
  const rankingVerbs = ['traga', 'mostre', 'mostrar', 'liste', 'listar', 'quais', 'quem', 'selecione', 'priorize', 'priorizar', 'atacar primeiro', 'focar primeiro', 'começar por', 'comecar por']

  const mentionsContacts = hasAny(q, contactNouns)
  const asksQuality = hasAny(q, qualityWords)
  const asksRanking = hasAny(q, rankingVerbs)
  const onContacts = route === 'leads'

  if ((mentionsContacts && asksQuality) || (onContacts && asksQuality && asksRanking) || hasAny(q, ['quem eu priorizo', 'quem devo priorizar', 'onde tenho mais chance', 'por quem eu comeco', 'por quem eu começo'])) return 'best_contacts'

  if (hasAny(q, ['quem devo ligar', 'quem eu ligo', 'quem ligar', 'ligar agora', 'liga pra quem', 'ligo para quem', 'melhores ligacoes', 'melhores ligacoes', 'who should i call', 'a quien llamo'])) return 'call_now'
  if (hasAny(q, ['negocios em risco', 'negocio em risco', 'o que esta em risco', 'riscos do pipeline', 'risco de perder', 'deals at risk', 'negocios en riesgo'])) return 'risk_deals'
  if (hasAny(q, ['negocios parados', 'negocio parado', 'sem mexer', 'sem movimento', 'esfriando', 'encalhado', 'stale deals', 'sin movimiento'])) return 'stale_deals'
  if (hasAny(q, ['proposta sem resposta', 'propostas sem resposta', 'quem nao respondeu proposta', 'proposta aguardando', 'proposal follow up', 'propuesta sin respuesta'])) return 'proposal_followup'
  if (hasAny(q, ['sem decisor', 'falta decisor', 'quem nao tem decisor', 'sem economic buyer', 'missing decision maker', 'sin decisor'])) return 'missing_decision_maker'
  if (hasAny(q, ['forecast', 'previsao', 'quanto vamos fechar', 'quanto devo fechar', 'gap para meta', 'cobertura do pipeline', 'pipeline coverage', 'best case', 'commit'])) return 'forecast'
  if (hasAny(q, ['o que devo fazer', 'o que eu faco', 'prioridades de hoje', 'minhas prioridades', 'prepare meu dia', 'organize meu dia', 'por onde comeco', 'por onde começo', 'what should i do', 'que hago hoy'])) return 'priorities'

  return null
}
