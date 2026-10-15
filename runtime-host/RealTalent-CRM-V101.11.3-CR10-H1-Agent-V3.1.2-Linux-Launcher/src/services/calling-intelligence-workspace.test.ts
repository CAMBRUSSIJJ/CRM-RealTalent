import { describe, expect, it } from 'vitest'
import type { CallRecord, ContactRecord, Lead } from '../domain/types'
import { analyzeLiveConversation, buildCallHealth, buildPreCallBrief, recommendNextBestQuestion } from './calling-intelligence-workspace'
import { buildDiscoveryChecklist } from './call-session-intelligence'

const lead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'l1', workspaceId: 'w1', name: 'João', company: 'Barbearia Horizonte', phone: '51999998888', email: '', city: 'Porto Alegre', source: 'garimpo', stageId: 's1', status: 'active', temperature: 'hot', priority: 'high', ownerId: null, ownerName: 'Camila', value: 4500, nextActionAt: null, notes: '', tags: [], createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z', ...overrides,
})

const call = (overrides: Partial<CallRecord> = {}): CallRecord => ({
  id: 'c1', workspaceId: 'w1', leadId: 'l1', contactId: null, userId: null, outcome: 'callback_requested', durationSeconds: 90, notes: 'Usa outro sistema e pediu retorno.', transcript: '', recordingPath: null, startedAt: '2026-09-14T10:00:00.000Z', endedAt: '2026-09-14T10:01:30.000Z', createdAt: '2026-09-14T10:01:30.000Z', ...overrides,
})

describe('calling intelligence workspace', () => {
  it('detecta sinais de conversa sem provedor externo', () => {
    const signals = analyzeLiveConversation('Já temos um sistema, mas perdemos horários vazios. Minha sócia aprova e podemos marcar uma reunião semana que vem.')
    const ids = signals.map((item) => item.id)
    expect(ids).toContain('existing_solution')
    expect(ids).toContain('pain')
    expect(ids).toContain('decision_maker')
    expect(ids).toContain('timing')
    expect(ids).toContain('next_step')
  })

  it('bloqueia Call Health quando há opt-out', () => {
    const contact = { id: 'p1', phone: '51999998888', doNotContact: false, consentStatus: 'opted_out' } as ContactRecord
    const health = buildCallHealth({ lead: lead(), contact, contacts: [contact], allLeads: [lead()], calls: [], events: [], now: new Date('2026-09-15T12:00:00.000Z') })
    expect(health.status).toBe('restricted')
    expect(health.checks.some((item) => item.id === 'permission' && item.blocking)).toBe(true)
  })

  it('gera brief contextual para retorno solicitado', () => {
    const brief = buildPreCallBrief({ lead: lead(), contact: null, contacts: [], calls: [call()], activities: [], proposals: [], stage: { id: 's1', workspaceId: 'w1', name: 'Diagnóstico', order: 1, color: '#000', probability: 30, isWon: false, isLost: false }, objective: 'qualify' })
    expect(brief.recommendedQuestion).toContain('pediu')
    expect(brief.context.join(' ')).toContain('Diagnóstico')
    expect(brief.signals).toContain('Solução atual')
  })

  it('recomenda a primeira lacuna comercial relevante', () => {
    const checklist = buildDiscoveryChecklist({ lead: lead(), contacts: [], notes: '', decisionMaker: '', currentSystem: 'WhatsApp', mainPain: 'clientes somem', bestTime: '', objective: 'qualify' })
    const question = recommendNextBestQuestion({ checklist, mainPain: 'clientes somem', objective: 'qualify', liveSignals: analyzeLiveConversation('O problema é que clientes somem e usamos WhatsApp.') })
    expect(question.category).toBe('Impacto')
    expect(question.question).toContain('clientes somem')
  })
})
