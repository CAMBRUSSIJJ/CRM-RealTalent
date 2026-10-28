import { describe, expect, it } from 'vitest'
import { appendAgentConversationTurn, formatAgentConversationContext, parseAgentConversationTurns } from './realtalent-agent-v4-conversation'

describe('Agent V4 – session conversation', () => {
  it('preserva no máximo seis pares com limites por mensagem', () => {
    let history = [] as ReturnType<typeof appendAgentConversationTurn>
    for (let i = 0; i < 12; i++) history = appendAgentConversationTurn(history, 'pedido '+i, 'resposta '+i)
    expect(history).toHaveLength(6)
    expect(history[0].user).toBe('pedido 6')
    expect(formatAgentConversationContext(history)).toContain('resposta 11')
    expect(formatAgentConversationContext(history)).not.toContain('pedido 0')
  })
  it('ignora sessão inválida e preserva contexto do workspace', () => {
    expect(parseAgentConversationTurns([{ x: 1 }, null, { user: 'ok', assistant: 'feito' }])).toEqual([{ user: 'ok', assistant: 'feito' }])
    expect(parseAgentConversationTurns('invalid')).toEqual([])
    expect(formatAgentConversationContext([], 'quem ligar?', 'Carlos')).toContain('quem ligar?')
  })
  it('não registra conteúdo vazio ou mensagens ilimitadas', () => {
    const rows = appendAgentConversationTurn([], '  ', 'resposta')
    expect(rows).toEqual([])
    const rows2 = appendAgentConversationTurn([], 'a'.repeat(2000), 'b'.repeat(2000))
    expect(rows2[0].user).toHaveLength(360)
    expect(rows2[0].assistant).toHaveLength(520)
  })
})
