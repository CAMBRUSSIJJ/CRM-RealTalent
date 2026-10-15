import { describe, expect, it } from 'vitest'
import { DEFAULT_STAGES } from '../domain/defaults'
import { importV99Backup } from './v99-importer'

describe('importV99Backup', () => {
  it('normaliza uma lista legada de leads', () => {
    const result = importV99Backup(JSON.stringify({
      crm_leads: [
        { id: 'old-1', nome: 'Barbearia Teste', telefone: '51999999999', etapa: 'Proposta', temperatura: 'Quente', valor: 'R$ 4.500,00' },
      ],
    }), 'workspace-test', DEFAULT_STAGES.map((stage) => ({ ...stage, workspaceId: 'workspace-test' })))

    expect(result.leads).toHaveLength(1)
    expect(result.leads[0]).toMatchObject({
      id: 'old-1',
      name: 'Barbearia Teste',
      phone: '51999999999',
      temperature: 'hot',
      value: 4500,
    })
    expect(result.leads[0].stageId).toBe('stage-proposal')
  })

  it('rejeita arquivo sem leads', () => {
    expect(() => importV99Backup('{"settings":{}}', 'workspace-test', DEFAULT_STAGES)).toThrow(/Nenhuma lista de leads/)
  })
})

describe('backup administrativo V100.17', () => {
  it('prioriza leads do snapshot em vez das etapas', () => {
    const stages = DEFAULT_STAGES.map((stage) => ({ ...stage, workspaceId: 'workspace-1' }))
    const backup = JSON.stringify({
      version: '100.17',
      workspace: {
        snapshot: {
          stages: [{ id: 'stage-1', name: 'Novo lead' }],
          leads: [{ id: 'lead-backup', name: 'Empresa Restaurada', company: 'Empresa Restaurada', stageId: stages[0].id }],
        },
      },
    })
    const result = importV99Backup(backup, 'workspace-1', stages)
    expect(result.leads).toHaveLength(1)
    expect(result.leads[0].name).toBe('Empresa Restaurada')
    expect(result.sourceKeys).toEqual(['workspace.snapshot.leads'])
  })
})
