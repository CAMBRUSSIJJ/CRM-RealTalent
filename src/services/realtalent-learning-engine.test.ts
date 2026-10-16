import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearRealTalentLearning,
  findRelevantLearningExperiences,
  formatLearningContext,
  isLearningCorrection,
  learningSimilarity,
  listRealTalentLearningExperiences,
  recordLearningCorrection,
  rememberLearningPlan,
  syncVerifiedLearningFromReceipt,
} from './realtalent-learning-engine'

const WORKSPACE = 'learning-test-workspace'

const rememberGoalPlan = (prompt = 'faça uma meta de 40 ligações para amanhã, apenas amanhã') => rememberLearningPlan(WORKSPACE, prompt, {
  id: 'plan:goal:1',
  steps: [{
    capabilityId: 'goals.create',
    title: 'Criar meta',
    args: [
      { name: 'metric', value: 'calls' },
      { name: 'target_value', value: '40' },
      { name: 'period_start', value: '2026-10-16' },
      { name: 'period_end', value: '2026-10-16' },
    ],
  }],
})

describe('RealTalent Learning Engine', () => {
  beforeEach(() => clearRealTalentLearning(WORKSPACE))

  it('aprende somente uma execução com recibo integralmente verificado', () => {
    rememberGoalPlan()
    expect(syncVerifiedLearningFromReceipt(WORKSPACE, {
      id: 'receipt:ok', workspaceId: WORKSPACE, planId: 'plan:goal:1', status: 'verified',
      steps: [{ capabilityId: 'goals.create', status: 'verified', summary: 'Meta criada e relida.' }],
    })).toBe(1)

    const rows = listRealTalentLearningExperiences(WORKSPACE)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'verified_execution', status: 'verified', capabilityId: 'goals.create', uses: 1 })
  })

  it('não transforma execução parcial ou falha em aprendizado positivo', () => {
    rememberGoalPlan()
    syncVerifiedLearningFromReceipt(WORKSPACE, {
      id: 'receipt:partial', workspaceId: WORKSPACE, planId: 'plan:goal:1', status: 'partial',
      steps: [{ capabilityId: 'goals.create', status: 'verified', summary: 'Executor respondeu.' }],
    })
    expect(listRealTalentLearningExperiences(WORKSPACE)).toHaveLength(0)
  })

  it('não duplica o mesmo recibo quando o gateway sincroniza novamente', () => {
    rememberGoalPlan()
    const receipt = {
      id: 'receipt:same', workspaceId: WORKSPACE, planId: 'plan:goal:1', status: 'verified' as const,
      steps: [{ capabilityId: 'goals.create', status: 'verified', summary: 'Meta criada.' }],
    }
    syncVerifiedLearningFromReceipt(WORKSPACE, receipt)
    syncVerifiedLearningFromReceipt(WORKSPACE, receipt)
    expect(listRealTalentLearningExperiences(WORKSPACE)[0]?.uses).toBe(1)
  })

  it('recupera experiências semelhantes antes de um novo pedido', () => {
    rememberGoalPlan('crie uma meta de 40 ligações para amanhã')
    syncVerifiedLearningFromReceipt(WORKSPACE, {
      id: 'receipt:similar', workspaceId: WORKSPACE, planId: 'plan:goal:1', status: 'verified',
      steps: [{ capabilityId: 'goals.create', status: 'verified', summary: 'Meta confirmada.' }],
    })
    const ranked = findRelevantLearningExperiences(WORKSPACE, 'faça uma meta de 50 ligações para amanhã')
    expect(ranked[0]?.capabilityId).toBe('goals.create')
    expect(ranked[0]?.similarity).toBeGreaterThan(0.7)
    const context = formatLearningContext(ranked)
    expect(context).toContain('RT_LEARNING_HINT capability=goals.create')
    expect(context).toContain('period_start=<recalcular pela mensagem atual>')
    expect(context).not.toContain('period_start=2026-10-16')
  })

  it('uma correção do usuário despromove a interpretação anterior', () => {
    rememberGoalPlan()
    syncVerifiedLearningFromReceipt(WORKSPACE, {
      id: 'receipt:wrong-intent', workspaceId: WORKSPACE, planId: 'plan:goal:1', status: 'verified',
      steps: [{ capabilityId: 'goals.create', status: 'verified', summary: 'Meta persistida.' }],
    })
    expect(isLearningCorrection('não foi isso, eu pedi apenas amanhã')).toBe(true)
    recordLearningCorrection(WORKSPACE, 'não foi isso, eu pedi apenas amanhã')

    const rows = listRealTalentLearningExperiences(WORKSPACE)
    expect(rows.some((item) => item.kind === 'verified_execution' && item.status === 'corrected')).toBe(true)
    expect(rows.some((item) => item.kind === 'correction')).toBe(true)
    const context = formatLearningContext(findRelevantLearningExperiences(WORKSPACE, 'meta de ligações para amanhã'))
    expect(context).toContain('CORREÇÃO DO USUÁRIO')
    expect(context).not.toContain('RT_LEARNING_HINT capability=goals.create')
  })

  it('redige segredos antes de persistir argumentos aprendidos', () => {
    rememberLearningPlan(WORKSPACE, 'configure a integração', {
      id: 'plan:secret:1',
      steps: [{ capabilityId: 'settings.open', title: 'Configurar', args: [{ name: 'api_key', value: 'sk-supersecret123456789' }] }],
    })
    syncVerifiedLearningFromReceipt(WORKSPACE, {
      id: 'receipt:secret', workspaceId: WORKSPACE, planId: 'plan:secret:1', status: 'verified',
      steps: [{ capabilityId: 'settings.open', status: 'verified', summary: 'Configuração confirmada.' }],
    })
    const stored = listRealTalentLearningExperiences(WORKSPACE)[0]
    expect(stored.args[0]?.value).toBe('[redacted]')
    expect(JSON.stringify(stored)).not.toContain('supersecret')
  })

  it('similaridade privilegia frases semanticamente próximas por tokens', () => {
    expect(learningSimilarity('crie meta de 40 ligações amanhã', 'faça meta de 50 ligações amanhã')).toBeGreaterThan(
      learningSimilarity('crie meta de 40 ligações amanhã', 'envie um email para Ana'),
    )
  })
})
