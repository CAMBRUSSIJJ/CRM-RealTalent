import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'
import { buildNotificationAlerts, isNotificationQuietTime, notificationFrequencyBucket } from './notification-engine'
import { createDefaultExperiencePreferences } from '../features/experience/experience-context'

const now = new Date('2026-09-22T12:00:00-03:00')
const preferences = createDefaultExperiencePreferences().notifications

const snapshot = {
  workspace: { id: 'w1', name: 'Teste', slug: 'teste', role: 'owner', createdAt: now.toISOString() },
  stages: [{ id: 'stage-open', workspaceId: 'w1', name: 'Qualificação', order: 1, color: '#000000', probability: 20, isWon: false, isLost: false }],
  leads: [{ id: 'lead-1', workspaceId: 'w1', name: 'Lead parado', company: 'Conta', phone: '', email: '', city: '', source: 'teste', stageId: 'stage-open', status: 'active', temperature: 'warm', priority: 'medium', ownerId: null, ownerName: 'Equipe', value: 1000, nextActionAt: null, lastContactAt: '2026-09-10T12:00:00-03:00', notes: '', tags: [], createdAt: '2026-09-01T12:00:00-03:00', updatedAt: '2026-09-10T12:00:00-03:00' }],
  activities: [
    { id: 'a1', workspaceId: 'w1', leadId: 'lead-1', type: 'followup', title: 'Retornar contato', description: '', dueAt: '2026-09-22T10:00:00-03:00', completedAt: null, assignedTo: null, sourceType: 'manual', sourceId: null, createdAt: '2026-09-20T10:00:00-03:00', updatedAt: '2026-09-20T10:00:00-03:00' },
    { id: 'a2', workspaceId: 'w1', leadId: 'lead-1', type: 'followup', title: 'Próxima tarefa', description: '', dueAt: '2026-09-22T16:00:00-03:00', completedAt: null, assignedTo: null, sourceType: 'manual', sourceId: null, createdAt: '2026-09-20T10:00:00-03:00', updatedAt: '2026-09-20T10:00:00-03:00' },
  ],
  calls: [],
  events: [{ id: 'e1', workspaceId: 'w1', leadId: 'lead-1', title: 'Reunião', description: '', startsAt: '2026-09-22T15:00:00-03:00', endsAt: '2026-09-22T16:00:00-03:00', allDay: false, location: '', status: 'scheduled', assignedTo: null, createdAt: now.toISOString(), updatedAt: now.toISOString() }],
  playbooks: [],
  goals: [],
  automationRules: [],
  automationRuns: [],
  companies: [],
  contacts: [],
  contactRelationships: [],
  opportunities: [],
  socialProfiles: [],
  products: [],
  proposals: [{ id: 'p1', workspaceId: 'w1', proposalGroupId: 'g1', version: 1, proposalNumber: 'P-1', leadId: 'lead-1', opportunityId: null, companyId: null, contactId: null, title: 'Proposta comercial', status: 'sent', forecastCategory: 'best_case', probability: 50, currency: 'BRL', subtotal: 1000, discountTotal: 0, taxTotal: 0, total: 1000, recurringMonthlyTotal: 0, oneTimeTotal: 1000, annualRecurringTotal: 0, totalContractValue: 1000, isOfficial: true, isCurrentVersion: true, supersededById: null, expectedCloseAt: null, contractStartAt: null, contractEndAt: null, contractTermMonths: 0, autoRenew: false, postSaleStartAt: null, postSaleCadenceName: '', closedWonAt: null, validUntil: null, sentAt: '2026-09-15T12:00:00-03:00', viewedAt: null, acceptedAt: null, rejectedAt: null, ownerId: null, notes: '', terms: '', items: [], createdAt: '2026-09-15T12:00:00-03:00', updatedAt: '2026-09-15T12:00:00-03:00' }],
  revenueEntries: [],
} as WorkspaceSnapshot

describe('notification engine', () => {
  it('gera alertas operacionais a partir de uma única regra', () => {
    const alerts = buildNotificationAlerts(snapshot, preferences, { now, staleLeadDays: 7 })
    expect(alerts.some((item) => item.category === 'overdue_activity')).toBe(true)
    expect(alerts.some((item) => item.category === 'upcoming_activity')).toBe(true)
    expect(alerts.some((item) => item.category === 'upcoming_event')).toBe(true)
    expect(alerts.some((item) => item.category === 'proposal_silence')).toBe(true)
    expect(alerts.some((item) => item.category === 'stale_lead')).toBe(true)
  })

  it('respeita horário silencioso atravessando a meia-noite', () => {
    const quiet = { ...preferences, quietHoursEnabled: true, quietStart: '20:00', quietEnd: '08:00' }
    expect(isNotificationQuietTime(quiet, new Date('2026-09-22T23:00:00-03:00'))).toBe(true)
    expect(isNotificationQuietTime(quiet, new Date('2026-09-22T12:00:00-03:00'))).toBe(false)
  })

  it('gera buckets diferentes para frequência horária e diária', () => {
    expect(notificationFrequencyBucket('hourly', now)).toMatch(/^2026-09-22T/)
    expect(notificationFrequencyBucket('daily', now)).toBe('2026-09-22')
    expect(notificationFrequencyBucket('realtime', now)).toBeNull()
  })
})
