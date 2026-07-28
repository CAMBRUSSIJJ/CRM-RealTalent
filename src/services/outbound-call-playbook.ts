import type { CallOutcome } from '../domain/types'

export type OutboundStepId =
  | 'opening'
  | 'decision-maker'
  | 'context'
  | 'diagnosis'
  | 'impact'
  | 'value'
  | 'invitation'
  | 'scheduling'
  | 'closing'

export interface OutboundStepAction {
  id: string
  label: string
  nextStepId?: OutboundStepId
  note?: string
  outcome?: CallOutcome
  tone?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
}

export interface OutboundCallStep {
  id: OutboundStepId
  order: number
  phase: string
  title: string
  objective: string
  say: string
  ask?: string
  coaching: string
  actions: OutboundStepAction[]
}

export interface BuiltInObjection {
  id: string
  title: string
  category: string
  response: string
  diagnosticQuestion: string
}

export const OUTBOUND_CALL_STEPS: OutboundCallStep[] = [
  {
    id: 'opening',
    order: 1,
    phase: 'Abertura',
    title: 'Ganhe permissão para continuar',
    objective: 'Reduzir a resistência inicial e conquistar 30 segundos de atenção.',
    say: 'Olá, [Nome do Lead], tudo bem? Aqui é [Responsável]. Posso te explicar em 30 segundos o motivo da ligação e você me diz se vale a pena continuarmos?',
    coaching: 'Fale com tranquilidade. Não acelere nem tente apresentar a solução antes de receber a permissão.',
    actions: [
      { id: 'permission', label: 'Pode falar', nextStepId: 'decision-maker', note: 'Prospect autorizou a apresentação.', tone: 'primary' },
      { id: 'busy', label: 'Está sem tempo agora', outcome: 'callback_requested', note: 'Prospect pediu contato em outro momento.', tone: 'warning' },
      { id: 'refused', label: 'Recusou a abordagem', outcome: 'not_interested', note: 'Prospect recusou a abordagem inicial.', tone: 'danger' },
    ],
  },
  {
    id: 'decision-maker',
    order: 2,
    phase: 'Decisor',
    title: 'Confirme com quem você está falando',
    objective: 'Identificar quem decide sobre agenda, atendimento e sistema do estabelecimento.',
    say: '[Nome do Lead], talvez você consiga me orientar. Quem normalmente cuida das decisões relacionadas à agenda, aos clientes e ao sistema utilizado pelo [Nome do Estabelecimento]?',
    ask: 'É diretamente com você que eu devo conversar sobre isso?',
    coaching: 'Trate a atendente como aliada. Evite exigir transferência ou esconder o motivo da ligação.',
    actions: [
      { id: 'is-decision-maker', label: 'É o decisor', nextStepId: 'context', note: 'Contato confirmado como decisor.', tone: 'success' },
      { id: 'other-person', label: 'É outra pessoa', nextStepId: 'closing', note: 'Contato não é o decisor; solicitar nome, telefone e melhor horário.', tone: 'secondary' },
      { id: 'decision-maker-busy', label: 'Decisor ocupado', outcome: 'callback_requested', note: 'Decisor indisponível; combinar melhor horário.', tone: 'warning' },
      { id: 'wrong-person', label: 'Contato incorreto', outcome: 'wrong_person', note: 'Contato não é responsável pelas decisões comerciais.', tone: 'danger' },
    ],
  },
  {
    id: 'context',
    order: 3,
    phase: 'Contexto',
    title: 'Apresente a hipótese de valor',
    objective: 'Explicar o motivo do contato sem diagnosticar o negócio antes de ouvi-lo.',
    say: 'Eu trabalho exclusivamente com barbearias e salões de beleza. Ajudamos negócios do setor a reduzir faltas, cancelamentos e horários vazios, além de recuperar clientes que demoram para retornar.',
    ask: 'Hoje vocês utilizam algum sistema de agendamento ou concentram a maior parte dos contatos no WhatsApp?',
    coaching: 'Venda o problema que você resolve, não o aplicativo. Pare de falar assim que fizer a pergunta.',
    actions: [
      { id: 'uses-system', label: 'Já utiliza sistema', nextStepId: 'diagnosis', note: 'Lead já utiliza sistema de agendamento.', tone: 'secondary' },
      { id: 'uses-whatsapp', label: 'Usa WhatsApp/agenda', nextStepId: 'diagnosis', note: 'Lead concentra agendamentos no WhatsApp ou agenda manual.', tone: 'primary' },
      { id: 'mixed-process', label: 'Processo misto', nextStepId: 'diagnosis', note: 'Lead usa sistema e processos manuais em conjunto.', tone: 'secondary' },
    ],
  },
  {
    id: 'diagnosis',
    order: 4,
    phase: 'Diagnóstico',
    title: 'Descubra o problema que ainda permanece',
    objective: 'Fazer o próprio prospect reconhecer uma lacuna operacional ou comercial.',
    say: 'Perfeito. Eu não estou entrando em contato para dizer que você simplesmente precisa de outro sistema. Quero entender se existe algum ponto que a estrutura atual ainda não resolve bem.',
    ask: 'Mesmo com o processo de vocês, o que ainda pesa mais: faltas, cancelamentos em cima da hora, horários difíceis de preencher ou clientes que demoram para voltar?',
    coaching: 'Não complete a resposta do lead. Espere, registre a dor com as palavras dele e faça uma pergunta de aprofundamento.',
    actions: [
      { id: 'has-pain', label: 'Reconheceu um problema', nextStepId: 'impact', note: 'Lead reconheceu uma dor operacional/comercial.', tone: 'success' },
      { id: 'no-clear-pain', label: 'Não percebe problema', nextStepId: 'impact', note: 'Lead não percebeu uma dor clara; investigar impacto e frequência.', tone: 'secondary' },
      { id: 'satisfied', label: 'Está totalmente satisfeito', outcome: 'not_interested', note: 'Lead afirma estar satisfeito com o processo atual.', tone: 'warning' },
    ],
  },
  {
    id: 'impact',
    order: 5,
    phase: 'Impacto',
    title: 'Transforme a dor em prioridade',
    objective: 'Entender frequência, consequência e relevância sem pressionar com perguntas óbvias.',
    say: 'Entendi. Só para eu dimensionar corretamente: quando isso acontece, vocês conseguem recuperar o horário ou normalmente ele acaba ficando vazio?',
    ask: 'Isso acontece com que frequência e o que vocês fazem hoje para evitar que se repita?',
    coaching: 'Procure fatos: frequência, horários, reação da equipe e perda de oportunidade. Evite prometer faturamento sem dados.',
    actions: [
      { id: 'impact-confirmed', label: 'Impacto confirmado', nextStepId: 'value', note: 'Lead confirmou impacto relevante na ocupação ou retorno de clientes.', tone: 'success' },
      { id: 'low-impact', label: 'Impacto pequeno', nextStepId: 'value', note: 'Lead considera o impacto pequeno, mas aceita entender oportunidades.', tone: 'secondary' },
      { id: 'not-priority', label: 'Não é prioridade', outcome: 'not_interested', note: 'Tema não é prioridade para o lead neste momento.', tone: 'warning' },
    ],
  },
  {
    id: 'value',
    order: 6,
    phase: 'Valor',
    title: 'Conecte a solução ao que foi dito',
    objective: 'Resumir a dor e posicionar a reunião como investigação, não demonstração genérica.',
    say: 'Então o ponto não é apenas ter uma agenda, mas conseguir agir sobre [Dor principal]: reduzir a perda desse horário, melhorar a confirmação e estimular o retorno dos clientes. É exatamente nessa parte que nosso trabalho se diferencia.',
    ask: 'Faria sentido avaliar, com os seus números e o seu processo, se existe uma oportunidade concreta de melhorar isso?',
    coaching: 'Repita a dor registrada pelo lead. Não liste todas as funcionalidades e não ataque o sistema que ele já usa.',
    actions: [
      { id: 'value-accepted', label: 'Vê valor', nextStepId: 'invitation', outcome: 'interested', note: 'Lead reconheceu valor em avaliar a oportunidade.', tone: 'success' },
      { id: 'needs-clarity', label: 'Pediu mais detalhes', nextStepId: 'invitation', note: 'Lead pediu mais detalhes antes do convite.', tone: 'secondary' },
      { id: 'value-rejected', label: 'Não vê valor', outcome: 'not_interested', note: 'Lead não identificou valor suficiente para avançar.', tone: 'danger' },
    ],
  },
  {
    id: 'invitation',
    order: 7,
    phase: 'Convite',
    title: 'Convide para o próximo passo',
    objective: 'Agendar uma conversa curta com expectativa e escopo claros.',
    say: 'Pelo que você me contou, faz sentido uma conversa objetiva de 15 minutos com o nosso consultor. Ele vai entender melhor a operação de vocês e verificar se existe uma oportunidade real de melhorar [Dor principal].',
    ask: 'Para você funciona melhor no começo ou no fim do dia?',
    coaching: 'Não faça uma nova apresentação. Combine o próximo passo e avance para duas opções concretas de horário.',
    actions: [
      { id: 'accepted-meeting', label: 'Aceitou conversar', nextStepId: 'scheduling', outcome: 'interested', note: 'Lead aceitou avançar para o agendamento.', tone: 'success' },
      { id: 'needs-partner', label: 'Precisa falar com alguém', outcome: 'callback_requested', note: 'Lead precisa alinhar a reunião com outro decisor.', tone: 'warning' },
      { id: 'thinking', label: 'Vai pensar', outcome: 'callback_requested', note: 'Lead pediu tempo antes de confirmar a reunião.', tone: 'secondary' },
      { id: 'declined-meeting', label: 'Recusou a reunião', outcome: 'not_interested', note: 'Lead recusou o próximo passo.', tone: 'danger' },
    ],
  },
  {
    id: 'scheduling',
    order: 8,
    phase: 'Agenda',
    title: 'Feche data, horário e compromisso',
    objective: 'Evitar agendamento vago e confirmar quem participará da reunião.',
    say: 'Tenho duas possibilidades: [Opção de horário 1] ou [Opção de horário 2]. Qual delas fica melhor para você?',
    ask: 'Além de você, existe mais alguém que deveria participar dessa conversa?',
    coaching: 'Confirme data, horário, canal da reunião e participantes. Depois repita o combinado em uma única frase.',
    actions: [
      { id: 'meeting-booked', label: 'Reunião confirmada', nextStepId: 'closing', outcome: 'meeting_scheduled', note: 'Reunião confirmada com data e horário.', tone: 'success' },
      { id: 'callback-to-schedule', label: 'Definir horário depois', outcome: 'callback_requested', note: 'Lead aceitou a reunião, mas precisa confirmar o horário.', tone: 'warning' },
    ],
  },
  {
    id: 'closing',
    order: 9,
    phase: 'Encerramento',
    title: 'Encerre com clareza',
    objective: 'Confirmar a próxima ação ou finalizar a conversa de forma profissional.',
    say: 'Perfeito, [Nome do Lead]. Vou registrar o que combinamos e enviar a confirmação pelo WhatsApp. Obrigado pelo seu tempo.',
    ask: 'O melhor número para receber a confirmação é este mesmo?',
    coaching: 'Não reabra a venda. Confirme o combinado, agradeça e encerre.',
    actions: [
      { id: 'finish', label: 'Concluir conversa', outcome: 'meeting_scheduled', note: 'Conversa encerrada com próximo passo confirmado.', tone: 'success' },
      { id: 'finish-callback', label: 'Concluir com retorno', outcome: 'callback_requested', note: 'Conversa encerrada com retorno combinado.', tone: 'secondary' },
      { id: 'finish-no-interest', label: 'Encerrar sem interesse', outcome: 'not_interested', note: 'Conversa encerrada sem interesse.', tone: 'danger' },
    ],
  },
]

export const BUILT_IN_OBJECTIONS: BuiltInObjection[] = [
  {
    id: 'already-system',
    title: 'Já tenho sistema',
    category: 'Solução atual',
    response: 'Perfeito. Eu não estou entrando em contato para dizer que você precisa trocar de sistema. Quero entender se, mesmo usando essa ferramenta, ainda existem faltas, clientes que não retornam ou horários difíceis de preencher.',
    diagnosticQuestion: 'Qual é o principal problema que ainda permanece, mesmo usando o sistema atual?',
  },
  {
    id: 'no-time',
    title: 'Não tenho tempo agora',
    category: 'Tempo',
    response: 'Sem problema. Não quero atrapalhar sua operação. Posso ser objetivo e combinar um horário melhor para uma conversa de 15 minutos.',
    diagnosticQuestion: 'Para você costuma ser mais tranquilo no começo ou no fim do dia?',
  },
  {
    id: 'not-interested',
    title: 'Não tenho interesse',
    category: 'Interesse',
    response: 'Tranquilo. Só para eu não insistir em algo que não faça sentido: você não tem interesse porque já está satisfeito com o processo atual ou porque esse assunto não é prioridade agora?',
    diagnosticQuestion: 'O que precisaria estar acontecendo para esse tema se tornar relevante para vocês?',
  },
  {
    id: 'send-whatsapp',
    title: 'Me manda no WhatsApp',
    category: 'Canal',
    response: 'Envio sim. Para eu não te mandar uma mensagem genérica, me diga só uma coisa: hoje o maior desafio está em faltas, horários vazios ou retorno dos clientes?',
    diagnosticQuestion: 'Posso enviar um resumo e já deixar um horário sugerido para conversarmos?',
  },
  {
    id: 'is-it-paid',
    title: 'A reunião é paga?',
    category: 'Confiança',
    response: 'Não. Essa primeira conversa é gratuita e serve para entender a situação atual e verificar se existe aderência. Só depois, caso faça sentido para os dois lados, falamos sobre uma possível solução.',
    diagnosticQuestion: 'Posso reservar 15 minutos para fazermos essa avaliação?',
  },
  {
    id: 'selling-something',
    title: 'Vocês querem me vender algo?',
    category: 'Confiança',
    response: 'Existe uma solução comercial, sim, mas esta ligação não é para forçar uma venda. Primeiro precisamos entender se existe um problema real que justifique uma conversa. Caso não exista, encerramos por ali.',
    diagnosticQuestion: 'Posso fazer duas perguntas rápidas para verificar se existe aderência?',
  },
  {
    id: 'need-partner',
    title: 'Preciso falar com meu sócio',
    category: 'Decisão',
    response: 'Faz sentido envolver quem participa da decisão. Podemos marcar a conversa em um horário em que vocês dois estejam disponíveis, assim ninguém precisa repassar as informações depois.',
    diagnosticQuestion: 'Qual período costuma funcionar melhor para os dois?',
  },
  {
    id: 'too-early',
    title: 'Estou começando agora',
    category: 'Momento',
    response: 'Entendo. No início, organizar a agenda e o retorno dos clientes pode evitar que hábitos ruins cresçam junto com o negócio. A conversa pode servir para você estruturar isso desde cedo, sem compromisso.',
    diagnosticQuestion: 'Hoje você já atende com horários marcados ou ainda está formando a carteira de clientes?',
  },
]

export function outboundStepById(id: OutboundStepId): OutboundCallStep {
  return OUTBOUND_CALL_STEPS.find((step) => step.id === id) ?? OUTBOUND_CALL_STEPS[0]
}

export function renderOutboundText(text: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce((current, [token, value]) => current.replaceAll(`[${token}]`, value || `[${token}]`), text)
}
