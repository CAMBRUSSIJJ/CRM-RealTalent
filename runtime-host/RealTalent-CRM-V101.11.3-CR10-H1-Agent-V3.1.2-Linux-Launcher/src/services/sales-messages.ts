import type { Lead } from '../domain/types'

export type SalesMessageChannel = 'whatsapp' | 'email' | 'call'

export interface SalesMessageSuggestion {
  subject: string
  body: string
  objective: string
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'tudo bem'
const context = (lead: Lead) => lead.company.trim() ? ` para a ${lead.company.trim()}` : ''

export const suggestSalesMessage = (lead: Lead, stageName: string, channel: SalesMessageChannel): SalesMessageSuggestion => {
  const name = firstName(lead.name)
  const stage = stageName.toLocaleLowerCase('pt-BR')
  let objective = 'Combinar um próximo passo claro.'
  let body = `Olá, ${name}! Tudo bem? Quero dar continuidade à nossa conversa${context(lead)}. Qual é o melhor momento para falarmos?`
  let subject = `Próximo passo — ${lead.company || lead.name}`

  if (/novo|entrada|lead|contato|abordagem/.test(stage)) {
    objective = 'Abrir a conversa e entender a prioridade do cliente.'
    body = `Olá, ${name}! Tudo bem? Sou da RealTalent e estou entrando em contato${context(lead)}. Posso te fazer duas perguntas rápidas para entender se conseguimos ajudar?`
    subject = `Contato RealTalent — ${lead.company || lead.name}`
  } else if (/qualific|diagnóstico|reunião/.test(stage)) {
    objective = 'Confirmar necessidade, urgência e participantes da decisão.'
    body = `Olá, ${name}! Para nossa conversa ser objetiva, queria confirmar: qual é hoje a principal prioridade${context(lead)} e quem mais participa dessa decisão?`
    subject = `Preparação do diagnóstico — ${lead.company || lead.name}`
  } else if (/proposta|orçamento/.test(stage)) {
    objective = 'Confirmar recebimento e agendar a análise da proposta.'
    body = `Olá, ${name}! Conseguiu receber e analisar a proposta da RealTalent? Se fizer sentido, podemos revisar juntos os pontos principais e combinar uma decisão. Qual horário funciona melhor?`
    subject = `Retorno sobre a proposta — ${lead.company || lead.name}`
  } else if (/negocia|decisão|fechamento/.test(stage)) {
    objective = 'Identificar a objeção final e combinar a decisão.'
    body = `Olá, ${name}! Quero facilitar a decisão sobre nossa proposta. Existe algum ponto comercial, operacional ou de prazo que ainda precisamos ajustar? Posso alinhar isso com você hoje.`
    subject = `Alinhamento final — ${lead.company || lead.name}`
  } else if (/follow|retorno|nutri/.test(stage)) {
    objective = 'Retomar com contexto e obter uma resposta objetiva.'
    body = `Olá, ${name}! Retomando nosso contato${context(lead)}: este tema ainda é prioridade para você? Se sim, combinamos o próximo passo; se o momento mudou, sem problema, eu ajusto por aqui.`
    subject = `Retomada de contato — ${lead.company || lead.name}`
  }

  if (channel === 'call') body = `Objetivo: ${objective}\n\nAbertura sugerida:\n${body}\n\nAntes de encerrar, confirme responsável, data e próximo passo.`
  if (channel === 'email') body = `${body}\n\nFico à disposição e aguardo sua indicação do melhor próximo passo.\n\nAtenciosamente,\nEquipe RealTalent`
  return { subject, body, objective }
}
