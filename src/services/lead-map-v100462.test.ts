import { describe, expect, it } from 'vitest'
import type { Lead } from '../domain/types'
import { addressStatusForLead, buildLeadAddress, estimateLeadGeocode, hasLeadCoordinates } from './geocoding'

const makeLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'map-lead', workspaceId: 'workspace-map', name: 'Lead do Mapa', company: 'Empresa do Mapa', phone: '', email: '', city: 'Porto Alegre',
  source: 'Manual', stageId: 'stage-new', status: 'active', temperature: 'warm', priority: 'medium', ownerId: null, ownerName: 'Equipe',
  value: 1000, nextActionAt: null, notes: '', tags: [], createdAt: '2026-07-28T00:00:00.000Z', updatedAt: '2026-07-28T00:00:00.000Z', ...overrides,
})

describe('Mapa de Leads V100.46.2', () => {
  it('reconhece coordenadas válidas para posicionar o marcador', () => {
    expect(hasLeadCoordinates(makeLead({ latitude: -30.03, longitude: -51.22 }))).toBe(true)
  })

  it('mantém o endereço estruturado usado pela fila', () => {
    expect(buildLeadAddress(makeLead({ street: 'Rua Um', addressNumber: '10', district: 'Centro', state: 'RS' }))).toContain('Rua Um, 10')
  })

  it('classifica endereço completo como pendente de geocodificação', () => {
    expect(addressStatusForLead(makeLead({ street: 'Rua Um', addressNumber: '10', state: 'RS' }))).toBe('pending')
  })

  it('marca lead sem cidade como incompleto', () => {
    expect(addressStatusForLead(makeLead({ city: '' }))).toBe('incomplete')
  })

  it('identifica claramente a estimativa local', () => {
    const result = estimateLeadGeocode(makeLead({ street: 'Rua Um', addressNumber: '10', state: 'RS' }))
    expect(result.geocodeStatus).toBe('approximate')
    expect(result.geocodeProvider).toBe('city_fallback')
    expect(result.geocodeError).toMatch(/Estimativa local/)
  })
})
