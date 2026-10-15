import { describe, expect, it } from 'vitest'
import type { ContactRecord, Lead } from '../domain/types'
import { buildCallQueue, calculateCallPerformance, defaultNextDate, outcomeLabel, resolveLeadCallTarget } from './call-workspace'

const lead = (overrides: Partial<Lead>): Lead => ({
  id: 'lead-1', workspaceId: 'ws', name: 'Lead', company: 'Empresa', phone: '51999999999', email: '', city: '', source: '', stageId: 'stage-1',
  status: 'active', temperature: 'warm', priority: 'medium', ownerId: null, ownerName: '', value: 0, nextActionAt: null, notes: '', tags: [], createdAt: '2026-07-01T10:00:00Z', updatedAt: '2026-07-01T10:00:00Z', ...overrides,
})

describe('call workspace', () => {
  it('prioritizes overdue urgent leads', () => {
    const now = new Date('2026-07-18T12:00:00-03:00')
    const queue = buildCallQueue([
      lead({ id: 'normal', priority: 'low', nextActionAt: '2026-07-18T15:00:00-03:00' }),
      lead({ id: 'urgent', priority: 'urgent', temperature: 'hot', nextActionAt: '2026-07-17T09:00:00-03:00' }),
    ], [], [], [], now)
    expect(queue[0].lead.id).toBe('urgent')
    expect(queue[0].bucket).toBe('overdue')
  })


  it('uses a callable stakeholder when the legacy lead phone is empty', () => {
    const accountLead = lead({ id: 'account-lead', phone: '', companyId: 'company-1', primaryContactId: 'contact-1' })
    const contacts: ContactRecord[] = [
      { id: 'contact-1', workspaceId: 'ws', companyId: 'company-1', name: 'Carlos', jobTitle: 'Dono', phone: '', email: '', decisionRole: 'decision_maker', influenceLevel: 100, consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', leadIds: ['account-lead'], createdAt: '2026-07-01T10:00:00Z', updatedAt: '2026-07-01T10:00:00Z' },
      { id: 'contact-2', workspaceId: 'ws', companyId: 'company-1', name: 'Mariana', jobTitle: 'Financeiro', phone: '51988887777', email: '', decisionRole: 'economic_buyer', influenceLevel: 80, consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', leadIds: ['account-lead'], createdAt: '2026-07-01T10:00:00Z', updatedAt: '2026-07-01T10:00:00Z' },
    ]
    expect(resolveLeadCallTarget(accountLead, contacts)).toMatchObject({ contactId: 'contact-2', phone: '51988887777', name: 'Mariana' })
    expect(buildCallQueue([accountLead], [], [], [], new Date('2026-07-18T12:00:00-03:00'), contacts)).toHaveLength(1)
  })


  it('does not fall back to the legacy phone when the primary stakeholder opted out', () => {
    const accountLead = lead({ id: 'blocked-primary-lead', phone: '51977776666', companyId: 'company-2', primaryContactId: 'blocked-primary' })
    const contacts: ContactRecord[] = [
      { id: 'blocked-primary', workspaceId: 'ws', companyId: 'company-2', name: 'Contato bloqueado', jobTitle: 'Dono', phone: '51977776666', email: '', decisionRole: 'decision_maker', influenceLevel: 100, consentStatus: 'opted_out', doNotContact: true, doNotContactReason: 'Solicitou não receber contatos', leadIds: ['blocked-primary-lead'], createdAt: '2026-07-01T10:00:00Z', updatedAt: '2026-07-01T10:00:00Z' },
    ]
    expect(resolveLeadCallTarget(accountLead, contacts).phone).toBe('')
    expect(buildCallQueue([accountLead], [], [], [], new Date('2026-07-18T12:00:00-03:00'), contacts)).toHaveLength(0)
  })

  it('keeps globally blocked leads out of the automatic call queue', () => {
    const blocked = lead({ doNotContact: true })
    expect(resolveLeadCallTarget(blocked, []).phone).toBe('')
    expect(buildCallQueue([blocked], [], [], [], new Date('2026-07-18T12:00:00-03:00'))).toHaveLength(0)
  })

  it('calculates contact and meeting rates', () => {
    const stats = calculateCallPerformance([
      { id: '1', workspaceId: 'ws', leadId: 'l', userId: null, outcome: 'answered', durationSeconds: 60, notes: '', transcript: '', recordingPath: null, startedAt: '2026-07-18T10:00:00-03:00', endedAt: null, createdAt: '2026-07-18T10:00:00-03:00' },
      { id: '2', workspaceId: 'ws', leadId: 'l', userId: null, outcome: 'meeting_scheduled', durationSeconds: 120, notes: '', transcript: '', recordingPath: null, startedAt: '2026-07-18T11:00:00-03:00', endedAt: null, createdAt: '2026-07-18T11:00:00-03:00' },
      { id: '3', workspaceId: 'ws', leadId: 'l', userId: null, outcome: 'no_answer', durationSeconds: 0, notes: '', transcript: '', recordingPath: null, startedAt: '2026-07-18T12:00:00-03:00', endedAt: null, createdAt: '2026-07-18T12:00:00-03:00' },
    ], new Date('2026-07-18T15:00:00-03:00'))
    expect(stats.answerRate).toBe(67)
    expect(stats.meetingRate).toBe(50)
  })

  it('provides labels and suggested next dates', () => {
    expect(outcomeLabel('callback_requested')).toBe('Pediu retorno')
    expect(defaultNextDate('invalid_number')).toBeNull()
  })

  it('keeps short callbacks inside configured business hours', () => {
    const friday = new Date(2026, 8, 18, 17, 30)
    const next = defaultNextDate('busy', friday, { defaultFollowupDays: 1, businessDays: [1, 2, 3, 4, 5], businessStart: '08:30', businessEnd: '18:00' })
    expect(next?.getDay()).toBe(1)
    expect(next?.getHours()).toBe(10)
    expect(next?.getMinutes()).toBe(0)
  })

  it('schedules proposal follow-up as business days instead of weekend hours', () => {
    const friday = new Date(2026, 8, 18, 15, 0)
    const next = defaultNextDate('proposal_sent', friday, { defaultFollowupDays: 1, businessDays: [1, 2, 3, 4, 5], businessStart: '08:30', businessEnd: '18:00' })
    expect(next?.getDay()).toBe(2)
    expect(next?.getHours()).toBe(8)
    expect(next?.getMinutes()).toBe(30)
  })
})
