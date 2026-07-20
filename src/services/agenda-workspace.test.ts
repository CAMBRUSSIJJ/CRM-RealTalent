import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../domain/types'
import { addAgendaRecurrence, appendAgendaMetadata, eventsOverlap, readAgendaMetadata, stripAgendaMetadata } from './agenda-workspace'

const baseEvent = (startsAt: string, endsAt: string): CalendarEvent => ({
  id: 'event-1', workspaceId: 'workspace-1', leadId: null, title: 'Reunião', description: '', startsAt, endsAt,
  allDay: false, location: '', status: 'confirmed', assignedTo: null, createdAt: startsAt, updatedAt: startsAt,
})

describe('agenda workspace', () => {
  it('persiste metadados sem misturar com a descrição visível', () => {
    const description = appendAgendaMetadata('Pauta comercial', { version: 1, type: 'meeting', calendar: 'commercial', reminderMinutes: 30, recurrence: 'none' })
    expect(stripAgendaMetadata(description)).toBe('Pauta comercial')
    expect(readAgendaMetadata(description)?.type).toBe('meeting')
  })

  it('detecta conflito real e ignora eventos cancelados', () => {
    const first = baseEvent('2026-07-20T13:00:00.000Z', '2026-07-20T14:00:00.000Z')
    const second = baseEvent('2026-07-20T13:30:00.000Z', '2026-07-20T14:30:00.000Z')
    expect(eventsOverlap(first, second)).toBe(true)
    second.status = 'cancelled'
    expect(eventsOverlap(first, second)).toBe(false)
  })

  it('gera recorrência semanal preservando o horário', () => {
    const original = new Date('2026-07-20T13:15:00.000Z')
    expect(addAgendaRecurrence(original, 'weekly', 2).toISOString()).toBe('2026-08-03T13:15:00.000Z')
  })

  it('ajusta recorrência mensal para o último dia válido', () => {
    const original = new Date('2026-01-31T13:15:00.000Z')
    expect(addAgendaRecurrence(original, 'monthly', 1).toISOString()).toBe('2026-02-28T13:15:00.000Z')
  })
})
