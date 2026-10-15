import { describe, expect, it } from 'vitest'
import {
  compareContactCustomValues,
  customColumnId,
  customPropertyIdFromColumn,
  formatContactCustomValue,
  type ContactCustomProperty,
} from './contact-custom-properties-v10165'

const property = (type: ContactCustomProperty['type']): ContactCustomProperty => ({
  id: `prop-${type}`,
  workspaceId: 'workspace-1',
  createdBy: 'user-1',
  name: 'Campo',
  key: 'campo',
  type,
  options: type === 'select' ? ['A', 'B'] : [],
  position: 0,
  createdAt: '2026-09-28T12:00:00.000Z',
  updatedAt: '2026-09-28T12:00:00.000Z',
})

describe('V101.6.5 custom properties', () => {
  it('converte coluna customizada sem perder o id', () => {
    expect(customColumnId('abc')).toBe('custom:abc')
    expect(customPropertyIdFromColumn('custom:abc')).toBe('abc')
    expect(customPropertyIdFromColumn('contact')).toBeNull()
  })

  it('formata tipos essenciais', () => {
    expect(formatContactCustomValue(property('checkbox'), true)).toBe('Sim')
    expect(formatContactCustomValue(property('checkbox'), false)).toBe('Não')
    expect(formatContactCustomValue(property('text'), 'Premium')).toBe('Premium')
    expect(formatContactCustomValue(property('text'), null)).toBe('—')
  })

  it('ordena números e mantém vazios no fim', () => {
    const numeric = property('number')
    expect(compareContactCustomValues(numeric, 10, 2)).toBeGreaterThan(0)
    expect(compareContactCustomValues(numeric, null, 2)).toBeGreaterThan(0)
    expect(compareContactCustomValues(numeric, 2, null)).toBeLessThan(0)
  })
})
