import { describe, expect, it } from 'vitest'
import { dueStatus, isOverdue } from './due-status'

const now = new Date(2026, 10, 19, 14, 0)

describe('regra única de prazo', () => {
  it('considera atrasado o que já passou do horário hoje', () => {
    expect(dueStatus(new Date(2026, 10, 19, 10, 46), false, now)).toBe('overdue')
    expect(isOverdue(new Date(2026, 10, 18, 9, 0), false, now)).toBe(true)
  })
  it('separa hoje, próximos, sem data e concluídos', () => {
    expect(dueStatus(new Date(2026, 10, 19, 18, 0), false, now)).toBe('today')
    expect(dueStatus(new Date(2026, 10, 20, 8, 0), false, now)).toBe('upcoming')
    expect(dueStatus(null, false, now)).toBe('unscheduled')
    expect(dueStatus(new Date(2026, 10, 18, 9, 0), true, now)).toBe('completed')
  })
})
