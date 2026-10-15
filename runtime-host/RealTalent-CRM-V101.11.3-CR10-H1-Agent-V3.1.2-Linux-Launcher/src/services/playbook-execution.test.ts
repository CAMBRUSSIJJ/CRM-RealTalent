import { describe, expect, it } from 'vitest'
import type { Playbook } from '../domain/types'
import { derivePlaybookSteps, playbookExecutionCoverage, recommendedExecutionMode } from './playbook-execution'

const base: Playbook = {
  id: 'pb-1', workspaceId: 'ws-1', kind: 'script', title: 'Discovery', category: 'Qualificação',
  content: 'Abra a conversa.\n\nInvestigue o processo atual.', tags: [], active: true,
  guidance: {
    executionModes: ['step_by_step', 'call'], segments: ['Serviços'], personas: ['Dono'],
    discoveryQuestions: ['Como fazem hoje?'], objectionPrompts: ['Já tenho sistema'], successCriteria: ['Próximo passo definido'],
  },
  createdAt: '2026-09-22T00:00:00Z', updatedAt: '2026-09-22T00:00:00Z',
}

describe('playbook execution V100.82', () => {
  it('quebra o conteúdo e adiciona discovery, objeções e sucesso como etapas', () => {
    const steps = derivePlaybookSteps(base)
    expect(steps.map((item) => item.kind)).toEqual(['content', 'content', 'discovery', 'objection', 'success'])
  })

  it('respeita o primeiro modo configurado como recomendação', () => {
    expect(recommendedExecutionMode(base)).toBe('step_by_step')
  })

  it('mede cobertura de execução e contexto', () => {
    expect(playbookExecutionCoverage(base)).toEqual({ modes: 2, contextual: 2, conversation: 2, ready: true })
  })
})
