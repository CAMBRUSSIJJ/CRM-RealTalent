import { describe, expect, it } from 'vitest'
import { defaultVoiceSettings, normalizeVoiceEvent, normalizeVoiceSettings, REALTALENT_VOICE_EVENT_SCHEMA } from './voice-dialer'

describe('RealTalent Voice & Dialer', () => {
  it('mantém discador externo como fallback seguro por padrão', () => {
    expect(defaultVoiceSettings().defaultProviderId).toBe('external_tel')
  })

  it('normaliza configurações sem aceitar provider arbitrário', () => {
    const settings = normalizeVoiceSettings({ defaultProviderId: 'fake', connectBaseUrl: 'http://localhost:3001/', outboundIdentities: [] })
    expect(settings.defaultProviderId).toBe('external_tel')
    expect(settings.connectBaseUrl).toBe('http://localhost:3001')
  })

  it('aceita apenas eventos versionados de voz', () => {
    expect(normalizeVoiceEvent({ schema: REALTALENT_VOICE_EVENT_SCHEMA, providerId: 'realtalent_connect', callId: 'call-1', state: 'ringing', direction: 'inbound', phone: '+5551999999999', occurredAt: '2026-09-16T12:00:00.000Z' })?.direction).toBe('inbound')
    expect(normalizeVoiceEvent({ callId: 'call-1' })).toBeNull()
  })
})
