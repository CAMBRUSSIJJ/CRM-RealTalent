import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_CALL_DISPLAY_PREFERENCES,
  normalizeCallDisplayPreferences,
  readCallDisplayPreferences,
  saveCallDisplayPreferences,
} from './call-display-preferences'
import {
  buildRealTalentConnectProtocolUrl,
  connectStatusLabel,
  enqueueRealTalentConnectCall,
} from './realtalent-connect'
import { safeStorage } from '../lib/storage'

describe('Central de Ligações V100.46.5', () => {
  beforeEach(() => safeStorage.clear())

  it('normaliza preferências antigas sem ocultar ferramentas essenciais por acidente', () => {
    const normalized = normalizeCallDisplayPreferences({ showQueueSidebar: false, queueDensity: 'comfortable' })
    expect(normalized.showQueueSidebar).toBe(false)
    expect(normalized.queueDensity).toBe('comfortable')
    expect(normalized.showNotes).toBe(DEFAULT_CALL_DISPLAY_PREFERENCES.showNotes)
    expect(normalized.showObjections).toBe(DEFAULT_CALL_DISPLAY_PREFERENCES.showObjections)
  })

  it('salva a visualização separadamente por organização', () => {
    saveCallDisplayPreferences('org-a', { ...DEFAULT_CALL_DISPLAY_PREFERENCES, showRecording: true })
    saveCallDisplayPreferences('org-b', { ...DEFAULT_CALL_DISPLAY_PREFERENCES, showRecording: false })
    expect(readCallDisplayPreferences('org-a').showRecording).toBe(true)
    expect(readCallDisplayPreferences('org-b').showRecording).toBe(false)
  })

  it('gera protocolo do RealTalent Connect com telefone sanitizado e contexto da chamada', () => {
    const url = buildRealTalentConnectProtocolUrl({
      commandId: 'cmd-1', workspaceId: 'org-1', deviceId: 'device-1', leadId: 'lead-1',
      phone: '(51) 99999-8877', leadName: 'Barbearia Central',
    })
    expect(url).toContain('realtalent-connect://call?')
    expect(url).toContain('phone=51999998877')
    expect(url).toContain('command=cmd-1')
    expect(url).toContain('lead=lead-1')
  })

  it('mantém a fila local de chamada utilizável em demonstração', async () => {
    const command = await enqueueRealTalentConnectCall({
      workspaceId: 'org-local', deviceId: 'device-local', leadId: 'lead-local',
      phone: '+55 51 99999-0000', leadName: 'Lead Local',
    })
    expect(command.status).toBe('queued')
    expect(command.deviceId).toBe('device-local')
    expect(connectStatusLabel(command.status)).toBe('Enviada ao dispositivo')
  })
})
