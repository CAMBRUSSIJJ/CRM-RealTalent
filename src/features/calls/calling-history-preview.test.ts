import { describe, expect, it } from 'vitest'
import { callingHistoryPreview } from './calling-history-preview'

describe('Call Focus history preview', () => {
  it('remove generated CRM agenda metadata without mutating source activity', () => {
    const original = 'Tarefa do CRM · task-7ba039e5-b47b-456b-afe9-35ef07e3385c [CRM_AGENDA_META: %7B%22version%22%3A1%7D'
    expect(callingHistoryPreview(original)).toBe('Tarefa registrada no CRM')
    expect(original).toContain('CRM_AGENDA_META')
  })
  it('keeps meaningful human notes', () => {
    expect(callingHistoryPreview('Pediu proposta e demonstrou urgência para reduzir horários vazios.'))
      .toBe('Pediu proposta e demonstrou urgência para reduzir horários vazios.')
  })
  it('limits very long notes to preview only', () => {
    const result = callingHistoryPreview('Detalhe comercial '.repeat(30), 80)
    expect(result.length).toBeLessThanOrEqual(80)
    expect(result.endsWith('…')).toBe(true)
  })
  it('handles null and metadata-only text', () => {
    expect(callingHistoryPreview(null)).toBe('')
    expect(callingHistoryPreview('[CRM_AGENDA_META]%7B%7D')).toBe('')
  })
})
