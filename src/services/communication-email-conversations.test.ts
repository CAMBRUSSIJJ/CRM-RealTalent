import { describe, expect, it } from 'vitest'
import { buildCommunicationConversations, emailCounterpartOf, type UnifiedCommunicationItem } from './communication-workspace-core'

const mail = (id: string, direction: 'inbound' | 'outbound', metadata: Record<string, unknown>, leadId: string | null = null): UnifiedCommunicationItem => ({
  id, source: 'official', leadId, contactId: null, channel: 'email', direction, status: direction === 'inbound' ? 'received' : 'sent',
  title: 'Assunto', subject: 'Assunto', body: 'Oi', occurredAt: `2026-11-2${id}T10:00:00Z`, official: true, metadata,
} as UnifiedCommunicationItem)

describe('conversas de e-mail sem contato', () => {
  it('separa uma conversa por pessoa do outro lado', () => {
    const conversations = buildCommunicationConversations([
      mail('1', 'inbound', { senderAddress: 'Ana <ana@cliente.com>', sender_name: 'Ana' }),
      mail('2', 'outbound', { senderAddress: 'eu@empresa.com', recipientAddresses: ['ana@cliente.com'] }),
      mail('3', 'inbound', { senderAddress: 'joao@outra.com' }),
    ])
    expect(conversations).toHaveLength(2)
    const ana = conversations.find((item) => item.externalAddress === 'ana@cliente.com')
    expect(ana?.events).toHaveLength(2)
    expect(ana?.title).toBe('Ana')
    expect(conversations.find((item) => item.externalAddress === 'joao@outra.com')?.title).toBe('joao@outra.com')
  })
  it('e-mail de contato continua agrupado pelo contato', () => {
    const conversations = buildCommunicationConversations([mail('1', 'inbound', { senderAddress: 'ana@cliente.com' }, 'lead-1'), mail('2', 'inbound', { senderAddress: 'outro@cliente.com' }, 'lead-1')])
    expect(conversations).toHaveLength(1)
    expect(conversations[0].key).toBe('lead-1:email')
  })
  it('usa o endereço gravado pelo servidor quando existe', () => {
    expect(emailCounterpartOf({ direction: 'outbound', metadata: { counterpart: 'X@Y.com', recipientAddresses: ['z@y.com'] } })).toBe('x@y.com')
  })
})
