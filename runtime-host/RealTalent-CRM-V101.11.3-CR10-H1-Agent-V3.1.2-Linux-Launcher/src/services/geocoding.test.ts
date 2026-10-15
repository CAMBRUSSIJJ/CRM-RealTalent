import { describe, expect, it } from 'vitest'
import type { Lead } from '../domain/types'
import { addressStatusForLead, buildLeadAddress, estimateLeadGeocode, hasLeadCoordinates } from './geocoding'

const lead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'lead-test', workspaceId: 'workspace-test', name: 'Barbearia Teste', company: 'Barbearia Teste',
  phone: '', email: '', city: 'Canoas', source: 'Manual', stageId: 'stage-new', status: 'active',
  temperature: 'warm', priority: 'medium', ownerId: 'user-test', ownerName: 'Pessoa Teste', value: 0,
  tags: [], createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z', ...overrides,
})

describe('geocoding helpers', () => {
  it('monta um endereço estruturado sem campos vazios', () => {
    expect(buildLeadAddress(lead({ street: 'Rua Um', addressNumber: '25', district: 'Centro', state: 'RS', postalCode: '92000-000' })))
      .toBe('Rua Um, 25 · Centro · Canoas · RS · 92000-000 · Brasil')
  })

  it('classifica endereço completo como pendente e cidade isolada como aproximada', () => {
    expect(addressStatusForLead(lead({ street: 'Rua Um', addressNumber: '25', state: 'RS' }))).toBe('pending')
    expect(addressStatusForLead(lead())).toBe('approximate')
    expect(addressStatusForLead(lead({ city: '' }))).toBe('incomplete')
  })

  it('gera fallback determinístico e claramente aproximado no modo local', () => {
    const result = estimateLeadGeocode(lead({ street: 'Rua Um', addressNumber: '25', state: 'RS' }))
    expect(result.geocodeStatus).toBe('approximate')
    expect(result.geocodeProvider).toBe('city_fallback')
    expect(Number.isFinite(result.latitude)).toBe(true)
    expect(Number.isFinite(result.longitude)).toBe(true)
  })

  it('preserva uma localização já existente', () => {
    const existing = lead({ latitude: -29.9, longitude: -51.1 })
    expect(hasLeadCoordinates(existing)).toBe(true)
    expect(estimateLeadGeocode(existing)).toEqual({})
  })
})
