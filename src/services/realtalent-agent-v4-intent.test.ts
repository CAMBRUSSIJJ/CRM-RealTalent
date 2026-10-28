import { describe, expect, it } from 'vitest'
import { canAnswerSalesReadLocally, isWriteOrCompoundRequest } from './realtalent-agent-v4-intent'
import type { AssistantAnswer } from './realtalent-assistant'

const answer = (intent: AssistantAnswer['intent'], plan?: AssistantAnswer['plan']) =>
  ({ intent, plan, items: [], title: '', text: '', facts: [], suggestedPrompts: [] } as unknown as AssistantAnswer)

describe('RealTalent Agent V4 – operational intent guard', () => {
  it.each([
    'quem devo ligar agora?', 'Quais clientes precisam de atenção?', 'resuma o histórico dessa conta',
    'me mostre as oportunidades em risco', 'qual a próxima ação?', 'prepare a ligação',
  ])('permite leitura local inequívoca: %s', (request) => {
    expect(canAnswerSalesReadLocally(request, answer('call_now'))).toBe(true)
  })
  it.each([
    'crie uma tarefa amanhã', 'mande WhatsApp para Carlos', 'organize meu dia e crie followups',
    'quais negócios estão em risco e depois agende retornos',
    'exclua o contato de Maria', 'registre a ligação',
  ])('não transforma escrita em consulta: %s', (request) => {
    expect(isWriteOrCompoundRequest(request)).toBe(true)
    expect(canAnswerSalesReadLocally(request, answer('priorities'))).toBe(false)
  })
  it('não usa o caminho rápido com operação pendente, ajuda, ou plano mutável', () => {
    expect(canAnswerSalesReadLocally('quem devo ligar', answer('call_now'), true)).toBe(false)
    expect(canAnswerSalesReadLocally('quem devo ligar', answer('help'))).toBe(false)
    expect(canAnswerSalesReadLocally('quem devo ligar', answer('call_now', { kind: 'create_task' } as AssistantAnswer['plan']))).toBe(false)
  })
  it('não interpreta frase sem evidência como um pedido de leitura', () => {
    expect(canAnswerSalesReadLocally('quero que você resolva tudo', answer('best_contacts'))).toBe(false)
  })
})
