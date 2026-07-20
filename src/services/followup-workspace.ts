import type { ActivityItem, ActivityType } from '../domain/types'
import { stripAgendaMetadata } from './agenda-workspace'

export type FollowupChannel = 'call' | 'whatsapp' | 'instagram' | 'email' | 'task' | 'meeting'
export type FollowupOutcome =
  | 'answered'
  | 'no_response'
  | 'callback_requested'
  | 'interested'
  | 'proposal_requested'
  | 'meeting_scheduled'
  | 'not_decision_maker'
  | 'invalid_contact'
  | 'not_interested'
  | 'won'
  | 'lost'

export interface CadenceStepInput {
  id: string
  title: string
  offsetDays: number
  channel: FollowupChannel
  type: Extract<ActivityType, 'call' | 'followup' | 'meeting'>
  objective: string
  script: string
}

export interface CadenceTemplateInput {
  id: string
  name: string
  category: string
  description: string
  skipWeekends: boolean
  steps: CadenceStepInput[]
}

export interface FollowupMetadata {
  version: 1
  kind: 'cadence-step' | 'result'
  cadenceId?: string
  cadenceName?: string
  cadenceCategory?: string
  stepIndex?: number
  stepTotal?: number
  channel?: FollowupChannel
  objective?: string
  script?: string
  outcome?: FollowupOutcome
  outcomeLabel?: string
  resultNote?: string
  recordedAt?: string
}

const META_PATTERN = /\n?\[\[CRM_FOLLOWUP_META:([^\]]+)\]\]/g

export const appendFollowupMetadata = (description: string, metadata: FollowupMetadata) => {
  const clean = stripFollowupMetadata(description).trim()
  const encoded = encodeURIComponent(JSON.stringify(metadata))
  return `${clean}${clean ? '\n' : ''}[[CRM_FOLLOWUP_META:${encoded}]]`
}

export const readFollowupMetadata = (activityOrDescription: ActivityItem | string | null | undefined): FollowupMetadata | null => {
  const description = typeof activityOrDescription === 'string' ? activityOrDescription : activityOrDescription?.description
  if (!description) return null
  const matches = [...description.matchAll(META_PATTERN)]
  const raw = matches.at(-1)?.[1]
  if (!raw) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as FollowupMetadata
    return parsed?.version === 1 ? parsed : null
  } catch { return null }
}

export const stripFollowupMetadata = (description: string | null | undefined) => stripAgendaMetadata((description ?? '').replace(META_PATTERN, '')).trim()

export const channelLabel: Record<FollowupChannel, string> = {
  call: 'Ligação', whatsapp: 'WhatsApp', instagram: 'Instagram', email: 'E-mail', task: 'Tarefa', meeting: 'Reunião',
}

export const outcomeLabel: Record<FollowupOutcome, string> = {
  answered: 'Respondeu', no_response: 'Não respondeu', callback_requested: 'Pediu retorno', interested: 'Demonstrou interesse',
  proposal_requested: 'Solicitou proposta', meeting_scheduled: 'Reunião marcada', not_decision_maker: 'Não é o decisor',
  invalid_contact: 'Contato inválido', not_interested: 'Sem interesse', won: 'Venda realizada', lost: 'Oportunidade perdida',
}

const step = (id: string, title: string, offsetDays: number, channel: FollowupChannel, type: CadenceStepInput['type'], objective: string, script: string): CadenceStepInput => ({
  id, title, offsetDays, channel, type, objective, script,
})

export const DEFAULT_CADENCE_TEMPLATES: CadenceTemplateInput[] = [
  {
    id: 'cold-prospecting', name: 'Prospecção fria', category: 'Prospecção', description: 'Sequência multicanal para gerar resposta sem pressionar o lead cedo demais.', skipWeekends: true,
    steps: [
      step('cold-1', 'Primeiro contato', 0, 'whatsapp', 'followup', 'Criar familiaridade e abrir uma conversa sobre a principal dor comercial.', 'Apresente o motivo do contato, cite um sinal observado e faça uma pergunta simples.'),
      step('cold-2', 'Ligação de diagnóstico', 2, 'call', 'call', 'Validar se existe perda de oportunidades e identificar o decisor.', 'Use perguntas curtas. Não apresente toda a solução antes de confirmar a dor.'),
      step('cold-3', 'Reforço de oportunidade', 4, 'instagram', 'followup', 'Retomar com um ângulo diferente e uma observação específica.', 'Evite repetir a primeira mensagem. Traga uma consequência prática da dor.'),
      step('cold-4', 'Contato de valor', 7, 'email', 'followup', 'Compartilhar uma orientação objetiva e propor o próximo passo.', 'Use prova, contexto e um CTA com duas opções de horário.'),
      step('cold-5', 'Encerramento elegante', 10, 'whatsapp', 'followup', 'Encerrar a sequência preservando abertura futura.', 'Se não for prioridade agora, encerre sem culpa e deixe uma porta aberta.'),
    ],
  },
  {
    id: 'interested-lead', name: 'Lead interessado', category: 'Qualificação', description: 'Acelera diagnóstico, reunião e definição do próximo passo.', skipWeekends: true,
    steps: [
      step('interest-1', 'Confirmar interesse', 0, 'whatsapp', 'followup', 'Entender urgência, objetivo e cenário atual.', 'Confirme o que chamou atenção e faça duas perguntas de diagnóstico.'),
      step('interest-2', 'Ligação de qualificação', 1, 'call', 'call', 'Validar fit, autoridade e impacto.', 'Feche a ligação com um próximo passo definido e data combinada.'),
      step('interest-3', 'Agendar demonstração', 2, 'meeting', 'meeting', 'Transformar interesse em reunião com pauta clara.', 'Envie pauta, duração e resultado esperado da conversa.'),
    ],
  },
  {
    id: 'proposal-followup', name: 'Após proposta', category: 'Negociação', description: 'Garante retorno estruturado sem deixar a proposta esquecida.', skipWeekends: true,
    steps: [
      step('proposal-1', 'Confirmar recebimento', 0, 'whatsapp', 'followup', 'Confirmar acesso e combinar quando o lead avaliará.', 'Não pergunte apenas se recebeu; combine a data da decisão.'),
      step('proposal-2', 'Mapear dúvidas', 2, 'call', 'call', 'Identificar objeções, envolvidos e critérios de decisão.', 'Pergunte o que precisa estar claro para avançar.'),
      step('proposal-3', 'Retomar decisão', 5, 'whatsapp', 'followup', 'Conduzir para sim, ajuste ou encerramento.', 'Seja direto sobre decisão e próximo passo.'),
      step('proposal-4', 'Fechamento da negociação', 8, 'call', 'call', 'Resolver pendências finais e formalizar decisão.', 'Recapitule valor, impacto e condição combinada.'),
    ],
  },
  {
    id: 'no-response', name: 'Não respondeu', category: 'Recuperação', description: 'Alterna canais e argumentos para recuperar contatos silenciosos.', skipWeekends: true,
    steps: [
      step('nr-1', 'Nova tentativa', 0, 'whatsapp', 'followup', 'Retomar com mensagem mais curta.', 'Use uma pergunta binária e fácil de responder.'),
      step('nr-2', 'Tentativa por ligação', 2, 'call', 'call', 'Buscar contato direto em horário diferente.', 'Cite em uma frase o motivo da ligação.'),
      step('nr-3', 'Contato alternativo', 4, 'instagram', 'followup', 'Testar outro canal com contexto.', 'Mantenha a mensagem pessoal e sem copiar o WhatsApp.'),
      step('nr-4', 'Encerrar sequência', 7, 'email', 'followup', 'Fechar a tentativa e permitir retomada futura.', 'Explique que encerrará os contatos por enquanto.'),
    ],
  },
  {
    id: 'meeting-confirmation', name: 'Reunião agendada', category: 'Reunião', description: 'Reduz faltas e garante preparação antes e depois da conversa.', skipWeekends: false,
    steps: [
      step('meeting-1', 'Confirmar reunião', 0, 'whatsapp', 'followup', 'Confirmar horário, participantes e pauta.', 'Envie uma confirmação objetiva com data e horário.'),
      step('meeting-2', 'Lembrete da reunião', 1, 'whatsapp', 'followup', 'Diminuir risco de ausência.', 'Reforce o link ou local e a duração.'),
      step('meeting-3', 'Retorno pós-reunião', 2, 'email', 'followup', 'Registrar acordos e manter o avanço.', 'Resuma decisões, responsáveis e prazo do próximo passo.'),
    ],
  },
  {
    id: 'stalled-lead', name: 'Lead parado', category: 'Reativação', description: 'Reabre oportunidades sem repetir a abordagem antiga.', skipWeekends: true,
    steps: [
      step('stalled-1', 'Reabertura contextual', 0, 'whatsapp', 'followup', 'Entender se o cenário ou prioridade mudou.', 'Retome o contexto anterior e pergunte o que mudou.'),
      step('stalled-2', 'Novo diagnóstico', 3, 'call', 'call', 'Atualizar dor, urgência e decisores.', 'Não continue de onde parou sem requalificar.'),
      step('stalled-3', 'Nova oportunidade', 6, 'email', 'followup', 'Apresentar um novo motivo para conversar.', 'Traga um ganho ou risco que ainda não foi explorado.'),
    ],
  },
  {
    id: 'post-sale', name: 'Pós-venda', category: 'Relacionamento', description: 'Acompanha implantação, satisfação e novas oportunidades.', skipWeekends: true,
    steps: [
      step('post-1', 'Boas-vindas e próximos passos', 0, 'whatsapp', 'followup', 'Garantir clareza sobre início e responsabilidades.', 'Confirme os primeiros marcos e canais de suporte.'),
      step('post-2', 'Checagem de implantação', 7, 'call', 'call', 'Identificar obstáculos antes que virem insatisfação.', 'Pergunte o que já funcionou e onde existe dificuldade.'),
      step('post-3', 'Avaliar satisfação', 21, 'email', 'followup', 'Medir percepção de valor e oportunidades de melhoria.', 'Peça uma avaliação específica sobre resultado e experiência.'),
      step('post-4', 'Indicação ou expansão', 30, 'call', 'call', 'Gerar indicação, renovação ou nova oportunidade.', 'Só peça indicação após confirmar valor percebido.'),
    ],
  },
  {
    id: 'event-referral', name: 'Evento ou indicação', category: 'Prospecção', description: 'Aproveita contexto e confiança para acelerar a conversa.', skipWeekends: true,
    steps: [
      step('event-1', 'Contato contextualizado', 0, 'whatsapp', 'followup', 'Usar o vínculo do evento ou indicação para iniciar.', 'Comece pelo contexto real e não por uma apresentação genérica.'),
      step('event-2', 'Ligação breve', 1, 'call', 'call', 'Transformar familiaridade em diagnóstico.', 'Peça poucos minutos e valide a oportunidade.'),
      step('event-3', 'Agendar conversa', 3, 'meeting', 'meeting', 'Marcar reunião com objetivo claro.', 'Ofereça duas opções de horário e uma pauta.'),
    ],
  },
]

export const addBusinessDays = (start: Date, offsetDays: number, skipWeekends: boolean) => {
  const result = new Date(start)
  if (!skipWeekends) { result.setDate(result.getDate() + offsetDays); return result }
  if (offsetDays === 0) {
    while ([0, 6].includes(result.getDay())) result.setDate(result.getDate() + 1)
    return result
  }
  let remaining = offsetDays
  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    if (![0, 6].includes(result.getDay())) remaining -= 1
  }
  return result
}
