import { describe, expect, it } from 'vitest'
import { resumePendingCapabilityLocally } from './realtalent-crm-capability-runtime-client'

const pendingContext = (overrides: Record<string, unknown> = {}) => ({
  currentRoute: 'tasks' as const,
  pendingCapability: {
    capabilityId: 'leads.create',
    capabilityTitle: 'Criar lead/oportunidade',
    originalRequest: 'crie um lead',
    knownArgs: [],
    missingSlots: ['name'],
    clarification: 'Qual é o nome do lead ou contato comercial que você quer criar?',
    ...overrides,
  },
})

describe('RealTalent Agent — retomada determinística de clarificação', () => {
  it('entende uma resposta curta como valor do slot pendente em vez de repetir a pergunta', () => {
    const result = resumePendingCapabilityLocally('carlinhos', pendingContext())

    expect(result?.decision).toBe('execute')
    expect(result?.provider).toBe('local-pending-resume')
    expect(result?.plan.steps[0]?.capabilityId).toBe('leads.create')
    expect(result?.plan.steps[0]?.args).toContainEqual({ name: 'name', value: 'carlinhos' })
  })

  it('preserva argumentos já entendidos ao preencher o próximo slot', () => {
    const result = resumePendingCapabilityLocally('Carlinhos', pendingContext({
      knownArgs: [{ name: 'company', value: 'Empresa XPTO' }],
    }))

    expect(result?.plan.steps[0]?.args).toEqual(expect.arrayContaining([
      { name: 'company', value: 'Empresa XPTO' },
      { name: 'name', value: 'Carlinhos' },
    ]))
  })

  it('usa query para identificar registros citados por nome', () => {
    const result = resumePendingCapabilityLocally('Carlos Almeida', {
      currentRoute: 'tasks',
      pendingCapability: {
        capabilityId: 'leads.update',
        capabilityTitle: 'Atualizar registro comercial',
        originalRequest: 'atualize um lead',
        knownArgs: [{ name: 'priority', value: 'high' }],
        missingSlots: ['record'],
        clarification: 'Qual lead ou oportunidade você quer alterar?',
      },
    })

    expect(result?.plan.steps[0]?.args).toContainEqual({ name: 'record_query', value: 'Carlos Almeida' })
  })

  it('não engole um novo pedido completo como resposta do slot antigo', () => {
    const result = resumePendingCapabilityLocally('na verdade crie uma tarefa para amanhã', pendingContext())
    expect(result).toBeNull()
  })

  it('não inventa normalização temporal em slot que exige interpretação de data', () => {
    const result = resumePendingCapabilityLocally('amanhã', {
      currentRoute: 'goals',
      pendingCapability: {
        capabilityId: 'goals.create',
        capabilityTitle: 'Criar meta',
        originalRequest: 'crie meta de 40 ligações',
        knownArgs: [
          { name: 'metric', value: 'calls' },
          { name: 'target_value', value: '40' },
        ],
        missingSlots: ['period'],
        clarification: 'Para qual período é essa meta?',
      },
    })

    expect(result).toBeNull()
  })
})
