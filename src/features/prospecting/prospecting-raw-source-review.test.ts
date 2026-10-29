import { describe, expect, it } from 'vitest'
import type { ProspectingAgentJob } from '../../services/prospecting-linux-agent'
import { rawSourceKey, rawSourceReviewCount } from './prospecting-raw-source-review'

const job = (sourceLog: NonNullable<ProspectingAgentJob['sourceLog']>): ProspectingAgentJob =>
  ({ id: 'execution-01', sourceLog }) as ProspectingAgentJob

describe('Revisão única das fontes do Garimpo', () => {
  it('inclui dados brutos, candidatos, filtrados e duplicidades', () => {
    const instance = job([
      { type: 'raw', name: 'Lista pública de empresas', provider: 'web_discovery', url: 'https://example.com/lista', at: '' },
      { type: 'candidate', name: 'Barbearia Alfa', provider: 'openstreetmap', at: '' },
      { type: 'rejected', name: 'Documento de terceiros', provider: 'web_discovery', at: '', reason: 'Não é empresa' },
      { type: 'duplicate', name: 'Barbearia Alfa repetida', provider: 'web_discovery', at: '', reason: 'Mesmo local' },
    ])
    expect(rawSourceReviewCount(instance)).toBe(4)
  })

  it('não duplica uma mesma URL recebida mais de uma vez', () => {
    const instance = job([
      { type: 'raw', name: 'Fonte A', url: 'https://example.com/page/', provider: 'web_discovery', at: '' },
      { type: 'candidate', name: 'Fonte A', url: 'https://example.com/page', provider: 'web_discovery', at: '' },
    ])
    expect(rawSourceReviewCount(instance)).toBe(1)
    expect(rawSourceKey('execution-01', instance.sourceLog![0])).toBe(rawSourceKey('execution-01', instance.sourceLog![1]))
  })

  it('inclui rejeições estruturadas mesmo quando ausentes no log de origem', () => {
    const instance = {
      ...job([]),
      rejections: [{ name: 'Documento descartado', source: 'web_discovery', type: 'content', reason: 'Não é empresa', at: '' }],
    } as ProspectingAgentJob
    expect(rawSourceReviewCount(instance)).toBe(1)
  })

  it('mantém a contagem zerada sem execução', () => {
    expect(rawSourceReviewCount(null)).toBe(0)
  })
})
