import { describe, expect, it } from 'vitest'
import type { Lead, PipelineStage } from '../domain/types'
import { buildStructuredCallSummary, buildWrapRecommendation, recommendCommercialAction } from './commercial-execution'

const lead: Lead = {
  id: 'lead-1', workspaceId: 'ws-1', name: 'Ana', company: 'Barbearia Alfa', phone: '51999999999', email: '', city: 'Porto Alegre', source: 'manual', stageId: 'stage-1', status: 'active', temperature: 'warm', priority: 'medium', ownerId: null, ownerName: 'Camila', value: 1500, nextActionAt: '2026-07-29T12:00:00.000Z', notes: '', tags: [], createdAt: '2026-07-01T12:00:00.000Z', updatedAt: '2026-07-01T12:00:00.000Z',
}
const stage: PipelineStage = { id: 'stage-1', workspaceId: 'ws-1', name: 'Qualificação', order: 1, color: '#000', probability: 25, isWon: false, isLost: false }

it('prioriza retorno solicitado', () => {
  const suggestion = recommendCommercialAction(lead, stage, [{ id: 'call-1', workspaceId: 'ws-1', leadId: lead.id, userId: null, outcome: 'callback_requested', durationSeconds: 30, notes: '', transcript: '', recordingPath: null, startedAt: '2026-07-29T10:00:00.000Z', endedAt: null, createdAt: '2026-07-29T10:00:00.000Z' }], [], new Date('2026-07-29T15:00:00.000Z'))
  expect(suggestion.kind).toBe('callback')
  expect(suggestion.score).toBeGreaterThan(90)
})

it('recomenda proposta após solicitação', () => {
  const suggestion = recommendCommercialAction(lead, stage, [{ id: 'call-1', workspaceId: 'ws-1', leadId: lead.id, userId: null, outcome: 'proposal_requested', durationSeconds: 90, notes: '', transcript: '', recordingPath: null, startedAt: '2026-07-29T10:00:00.000Z', endedAt: null, createdAt: '2026-07-29T10:00:00.000Z' }], [], new Date('2026-07-29T15:00:00.000Z'))
  expect(suggestion.kind).toBe('prepare_proposal')
})

it('gera orientação de wrap-up para reunião', () => {
  const recommendation = buildWrapRecommendation('meeting_scheduled', { decisionMaker: 'João' }, '')
  expect(recommendation.scheduleRecommended).toBe(true)
  expect(recommendation.checklist.length).toBeGreaterThan(1)
})

it('estrutura resumo apenas com dados capturados', () => {
  const summary = buildStructuredCallSummary({ notes: 'Quer aumentar agendamentos.', transcript: '', discovery: { decisionMaker: 'João', currentSystem: 'Agenda manual' }, outcomeLabel: 'Demonstrou interesse' })
  expect(summary).toContain('Decisor: João')
  expect(summary).toContain('Agenda manual')
  expect(summary).toContain('Quer aumentar agendamentos')
})
