import { describe, expect, it } from 'vitest'
import { buildCommunicationConversations, type UnifiedCommunicationItem } from './communication-workspace'

const event = (
  id: string,
  threadId: string,
  peerAddress: string,
  chatName: string,
  direction: 'inbound' | 'outbound' = 'inbound',
  options: { leadId?: string | null; crmReadAt?: string | null } = {},
): UnifiedCommunicationItem => ({
  id,
  source: 'official',
  leadId: options.leadId ?? null,
  contactId: null,
  channel: 'whatsapp',
  direction,
  status: direction === 'inbound' ? 'received' : 'sent',
  title: chatName,
  body: `mensagem ${id}`,
  subject: '',
  occurredAt: `2026-10-01T20:0${id.slice(-1)}:00.000Z`,
  official: false,
  metadata: { threadId, peerAddress, chatName, transport: 'qr', unofficial: true, ...(options.crmReadAt ? { crmReadAt: options.crmReadAt } : {}) },
})

describe('WhatsApp History Sync H9', () => {
  it('mantém chats não vinculados separados pela thread do WhatsApp', () => {
    const conversations = buildCommunicationConversations([
      event('m1', '5511111111111@c.us', '5511111111111', 'Cliente A'),
      event('m2', '5522222222222@c.us', '5522222222222', 'Cliente B'),
    ])
    expect(conversations).toHaveLength(2)
    expect(conversations.map((item) => item.externalDisplayName).sort()).toEqual(['Cliente A', 'Cliente B'])
  })

  it('agrupa mensagens recebidas e enviadas da mesma thread', () => {
    const conversations = buildCommunicationConversations([
      event('m1', '5511111111111@c.us', '5511111111111', 'Cliente A', 'inbound'),
      event('m2', '5511111111111@c.us', '5511111111111', 'Cliente A', 'outbound'),
    ])
    expect(conversations).toHaveLength(1)
    expect(conversations[0]?.events).toHaveLength(2)
    expect(conversations[0]?.externalAddress).toBe('5511111111111')
  })

  it('normaliza aliases @lid e @c.us do mesmo número na mesma conversa 1:1', () => {
    const conversations = buildCommunicationConversations([
      event('m1', '123456789012345@lid', '5511111111111', 'Cliente A', 'inbound'),
      event('m2', '5511111111111@c.us', '5511111111111', 'Cliente A', 'outbound'),
    ])
    expect(conversations).toHaveLength(1)
    expect(conversations[0]?.events).toHaveLength(2)
  })

  it('não mistura dois números do WhatsApp só porque pertencem ao mesmo lead', () => {
    const conversations = buildCommunicationConversations([
      event('m1', '5511111111111@c.us', '5511111111111', 'Cliente A', 'inbound', { leadId: 'lead-1' }),
      event('m2', '5522222222222@c.us', '5522222222222', 'Cliente A trabalho', 'inbound', { leadId: 'lead-1' }),
    ])
    expect(conversations).toHaveLength(2)
  })

  it('histórico importado marcado como lido não infla a caixa de não lidas', () => {
    const conversations = buildCommunicationConversations([
      event('m1', '5511111111111@c.us', '5511111111111', 'Cliente A', 'inbound', { crmReadAt: '2026-10-01T20:10:00.000Z' }),
    ])
    expect(conversations[0]?.unreadCount).toBe(0)
    expect(conversations[0]?.status).toBe('idle')
  })

  it('mensagem inbound nova continua aparecendo como precisa de resposta', () => {
    const conversations = buildCommunicationConversations([
      event('m1', '5511111111111@c.us', '5511111111111', 'Cliente A'),
    ])
    expect(conversations[0]?.unreadCount).toBe(1)
    expect(conversations[0]?.status).toBe('needs_reply')
  })
  it('não expõe LID longo como número telefônico do cliente', () => {
    const lid = '120363420605141530'
    const conversations = buildCommunicationConversations([
      event('m7', `${lid}@lid`, lid, `+${lid}`),
    ])
    expect(conversations).toHaveLength(1)
    expect(conversations[0]?.externalAddress).toBeNull()
    expect(conversations[0]?.externalDisplayName).toBe('WhatsApp · identidade pendente')
  })

  it('mantém número E.164 válido como endereço externo', () => {
    const conversations = buildCommunicationConversations([
      event('m8', '5551999991001@c.us', '5551999991001', 'Carlos'),
    ])
    expect(conversations[0]?.externalAddress).toBe('5551999991001')
    expect(conversations[0]?.externalDisplayName).toBe('Carlos')
  })

})
