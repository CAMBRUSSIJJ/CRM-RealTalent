import { describe, expect, it } from 'vitest'
import { addBusinessDays, appendFollowupMetadata, readFollowupMetadata, stripFollowupMetadata } from './followup-workspace'

describe('followup-workspace', () => {
  it('persiste metadados sem poluir a descrição visível', () => {
    const description = appendFollowupMetadata('Validar interesse.', {
      version: 1,
      kind: 'cadence-step',
      cadenceId: 'cadence-1',
      cadenceName: 'Prospecção fria',
      channel: 'whatsapp',
      stepIndex: 1,
      stepTotal: 5,
    })
    expect(stripFollowupMetadata(description)).toBe('Validar interesse.')
    expect(readFollowupMetadata(description)).toMatchObject({ cadenceName: 'Prospecção fria', channel: 'whatsapp', stepIndex: 1 })
  })

  it('move etapas de fim de semana para o próximo dia útil', () => {
    const saturday = new Date('2026-07-18T10:00:00-03:00')
    const due = addBusinessDays(saturday, 0, true)
    expect(due.getDay()).toBe(1)
    expect(due.getDate()).toBe(20)
  })

  it('mantém dias corridos quando a pausa de fim de semana está desligada', () => {
    const friday = new Date('2026-07-17T10:00:00-03:00')
    const due = addBusinessDays(friday, 2, false)
    expect(due.getDay()).toBe(0)
    expect(due.getDate()).toBe(19)
  })
})
