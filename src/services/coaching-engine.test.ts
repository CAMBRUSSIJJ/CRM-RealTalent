import { describe, expect, it } from 'vitest'
import { buildTeamCoachingSummary, evaluateCallCoaching, recommendPlaybooks } from './coaching-engine'
import type { CallRecord, Lead, Playbook } from '../domain/types'

const lead = { id: 'lead-1', workspaceId: 'w', name: 'Lead', company: 'Empresa', stageId: 'stage-1', temperature: 'hot', nextActionAt: '2026-09-16T12:00:00.000Z' } as Lead
const call = { id: 'call-1', workspaceId: 'w', leadId: 'lead-1', userId: null, outcome: 'meeting_scheduled', durationSeconds: 600, notes: 'Resultado: reunião marcada. Etapa do roteiro: Diagnóstico. Dor: no-show. Impacto em receita. Sistema atual: WhatsApp. Decisor: sócio. Orçamento discutido. Timing esta semana. Objeção — Já tenho sistema. Resposta utilizada: diagnóstico.', transcript: 'Combinamos reunião e próximo passo para amanhã.', recordingPath: null, startedAt: '2026-09-15T10:00:00.000Z', endedAt: '2026-09-15T10:10:00.000Z', createdAt: '2026-09-15T10:10:00.000Z' } as CallRecord
const playbook = { id: 'p', workspaceId: 'w', kind: 'script', title: 'Qualificação', category: 'Discovery', content: '...', tags: [], active: true, guidance: { objectives: ['qualify'], stageIds: ['stage-1'], temperatures: ['hot'] }, createdAt: '', updatedAt: '' } as Playbook

describe('coaching engine', () => {
  it('scores a well documented call', () => { expect(evaluateCallCoaching({ call, lead, playbooks: [] }).score).toBeGreaterThanOrEqual(80) })
  it('aggregates team coaching', () => { expect(buildTeamCoachingSummary({ calls: [call], leads: [lead], contacts: [], playbooks: [] }).nextStepRate).toBe(100) })
  it('ranks contextual playbooks first', () => { expect(recommendPlaybooks([playbook], { objective: 'qualify', stageId: 'stage-1', temperature: 'hot', kind: 'script' })[0].score).toBeGreaterThan(60) })
})
