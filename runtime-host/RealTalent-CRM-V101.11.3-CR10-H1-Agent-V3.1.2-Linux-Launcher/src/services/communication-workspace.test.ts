import { describe, expect, it } from 'vitest'
import type { UnifiedCommunicationItem } from './communication-workspace'
import { buildCommunicationConversations, channelLabel, loadAssistedCommunicationTimeline, recordAssistedCommunication } from './communication-workspace'

describe('omnichannel communication workspace', () => {
  it('agrupa mensagens por lead e canal e identifica resposta pendente', () => {
    const timeline: UnifiedCommunicationItem[] = [
      { id: '1', source: 'official', leadId: 'lead-1', contactId: null, channel: 'whatsapp', direction: 'inbound', status: 'received', title: 'WhatsApp', body: 'Pode me enviar valores?', subject: '', occurredAt: '2026-09-24T14:00:00Z', official: true, metadata: {} },
      { id: '2', source: 'official', leadId: 'lead-1', contactId: null, channel: 'whatsapp', direction: 'outbound', status: 'delivered', title: 'WhatsApp', body: 'Olá!', subject: '', occurredAt: '2026-09-24T13:00:00Z', official: true, metadata: {} },
      { id: '3', source: 'assisted', leadId: 'lead-1', contactId: null, channel: 'instagram', direction: 'outbound', status: 'sent', title: 'Instagram', body: 'Mensagem enviada', subject: '', occurredAt: '2026-09-23T12:00:00Z', official: false, metadata: {} },
    ]
    const conversations = buildCommunicationConversations(timeline)
    expect(conversations).toHaveLength(2)
    expect(conversations[0].channel).toBe('whatsapp')
    expect(conversations[0].status).toBe('needs_reply')
    expect(conversations[0].unreadCount).toBe(1)
  })

  it('persiste interação social assistida sem simular integração oficial', () => {
    const workspaceId = `test-${Date.now()}`
    const item = recordAssistedCommunication({ workspaceId, leadId: 'lead-social', channel: 'linkedin', direction: 'outbound', body: 'Contato inicial' })
    expect(item.official).toBe(false)
    expect(item.source).toBe('assisted')
    expect(loadAssistedCommunicationTimeline(workspaceId)[0]?.channel).toBe('linkedin')
  })

  it('nomeia os canais sociais', () => {
    expect(channelLabel('instagram')).toBe('Instagram')
    expect(channelLabel('facebook')).toBe('Facebook')
    expect(channelLabel('linkedin')).toBe('LinkedIn')
  })
})
