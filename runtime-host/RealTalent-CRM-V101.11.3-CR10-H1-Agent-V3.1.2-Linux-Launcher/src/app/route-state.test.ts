import { describe, expect, it } from 'vitest'
import { routeContextFromHash, routeFromHash, routeToHash } from './route-state'

describe('route-state V100.53', () => {
  it('serializa rotas simples como hash navegável', () => {
    expect(routeToHash('pipeline')).toBe('#/pipeline')
  })

  it('preserva o contexto comercial na URL', () => {
    const hash = routeToHash('proposals', { leadId: 'lead-42', proposalId: 'prop-7', action: 'follow-proposal' })
    expect(hash).toContain('#/proposals?')
    expect(routeFromHash(hash)).toBe('proposals')
    expect(routeContextFromHash(hash)).toEqual({ leadId: 'lead-42', proposalId: 'prop-7', action: 'follow-proposal' })
  })

  it('restaura evento e ação da Agenda após refresh', () => {
    const hash = routeToHash('agenda', { leadId: 'lead-1', eventId: 'event-9', action: 'create-meeting' })
    expect(routeContextFromHash(hash)).toMatchObject({ leadId: 'lead-1', eventId: 'event-9', action: 'create-meeting' })
  })

  it('restaura uma rota válida do hash', () => {
    expect(routeFromHash('#/agenda')).toBe('agenda')
  })

  it('expõe Contatos na URL mantendo compatibilidade interna com leads', () => {
    expect(routeToHash('leads', { leadId: 'lead-1', action: 'contact-record' })).toContain('#/contacts?')
    expect(routeFromHash('#/contacts?leadId=lead-1')).toBe('leads')
    expect(routeFromHash('#/leads?leadId=lead-1')).toBe('leads')
  })

  it('usa o dashboard para rotas desconhecidas', () => {
    expect(routeFromHash('#/rota-inexistente')).toBe('dashboard')
    expect(routeFromHash('')).toBe('dashboard')
  })
})
