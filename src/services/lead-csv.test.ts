import { describe, expect, it } from 'vitest'
import { leadsToCsv, parseLeadCsv } from './lead-csv'
import { DEFAULT_STAGES, DEMO_WORKSPACE } from '../domain/defaults'

describe('parseLeadCsv', () => {
  it('importa CSV em português e resolve etapa', () => {
    const result = parseLeadCsv('Nome;Telefone;Cidade;Etapa;Valor\nBarbearia Alfa;(51)99999-0000;Canoas;Proposta;1.500,50', DEMO_WORKSPACE.id, DEFAULT_STAGES)
    expect(result.leads).toHaveLength(1)
    expect(result.leads[0].name).toBe('Barbearia Alfa')
    expect(result.leads[0].value).toBe(1500.5)
    expect(DEFAULT_STAGES.find((stage) => stage.id === result.leads[0].stageId)?.name).toBe('Proposta')
  })

  it('preserva quebras de linha dentro de campos entre aspas', () => {
    const result = parseLeadCsv('Nome;Observações\r\nAlpha;"Linha 1\r\nLinha 2"', DEMO_WORKSPACE.id, DEFAULT_STAGES)
    expect(result.leads[0].notes).toBe('Linha 1\r\nLinha 2')
  })

  it('neutraliza fórmulas ao exportar para planilha', () => {
    const lead = parseLeadCsv('Nome;Empresa\nAlpha;=HYPERLINK(""https://exemplo"";""x"")', DEMO_WORKSPACE.id, DEFAULT_STAGES).leads[0]
    expect(leadsToCsv([lead], DEFAULT_STAGES)).toContain('"\'=HYPERLINK')
  })
})
