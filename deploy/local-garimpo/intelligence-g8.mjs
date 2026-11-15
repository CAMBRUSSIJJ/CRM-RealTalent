const text = (value, max = 180) => String(value || '').trim().slice(0, max)

/** Questions and hypotheses are derived from observed facts, never asserted needs. */
export function contextualCommercialAdvice({ intelligence, facts = [], signals = [] }) {
  const offering = intelligence.offerings?.[0], price = intelligence.prices?.[0]
  const positioning = intelligence.positioning?.[0]
  const booking = facts.find((fact) => fact.field === 'bookingUrl' && fact.sourceUrl)
  const questions = [], hypotheses = []
  if (booking) {
    questions.push('Como funciona a reserva pelo canal de agendamento divulgado e o acompanhamento depois do atendimento?')
    hypotheses.push('O canal de agendamento publicado pode orientar uma conversa sobre reservas e continuidade do atendimento; a necessidade ainda precisa ser validada.')
  }
  if (offering) {
    questions.push(`Como os clientes escolhem e contratam “${text(offering.label, 85)}” e quais etapas exigem mais acompanhamento?`)
    hypotheses.push(`A oferta de “${text(offering.label, 85)}” pode orientar a descoberta de objetivos comerciais; não há evidência de um problema ou intenção de compra.`)
  }
  if (price) questions.push(`O preço publicado de ${text(price.amount, 35)} para “${text(price.label, 80)}” inclui quais condições e variações?`)
  if (positioning && questions.length < 3) questions.push(`Como o posicionamento “${text(positioning.label, 80)}” é percebido pelos clientes e demonstrado no atendimento?`)
  if (signals.length) questions.unshift(`A publicação sobre “${text(signals[0].title, 100)}” já trouxe mudanças à operação ou ao atendimento?`)
  if (!questions.length) questions.push('Quais produtos e serviços a empresa oferece e em quais fontes oficiais podemos conferir essas informações?')
  return { questions: questions.slice(0, 3), hypotheses: hypotheses.slice(0, 2),
    recommendedAction: signals.length ? `Conferir a publicação sobre “${text(signals[0].title, 100)}” e validar seu contexto com o responsável.`
      : offering ? `Conferir a fonte de “${text(offering.label, 85)}” e usar a pergunta de descoberta antes de apresentar uma proposta.`
      : 'Confirmar a identidade da empresa e localizar informações oficiais de produtos e serviços antes da abordagem.' }
}

/** Only guides the next collection; these heuristics never become business facts. */
export function adaptiveResearchPlan({ input, plan, sources, multiQueries, lowMemory }) {
  const content = sources.map((source) => source.content || '').join('\n').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const gaps = []
  if (!/servicos|produtos|catalogo|especialidades|nosso portfolio/.test(content)) gaps.push('Produtos e serviços')
  if (!/agend|reserv|contato|fale conosco|whatsapp/.test(content)) gaps.push('Canais e operação')
  const identity = `${text(input.segment, 95)} ${text(input.city, 60)}`
  const priorities = [
    gaps.includes('Produtos e serviços') && `${identity} serviços produtos catálogo especialidades`,
    gaps.includes('Canais e operação') && `${identity} canais atendimento contato agendamento`,
  ].filter(Boolean)
  return { gaps, queries: [...new Set([...priorities, ...multiQueries, ...plan.queries])].slice(0, lowMemory ? 4 : 6) }
}
