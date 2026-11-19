import { describe, expect, it } from 'vitest'
import type { Lead } from '../domain/types'
import { reviewLeadImport } from './lead-import-review'
import { buildLeadsFromCsv, readLeadCsv, suggestLeadCsvMapping } from './lead-csv'

const lead = (over: Partial<Lead>): Lead => ({
  id: over.id ?? Math.random().toString(36), workspaceId: 'w', name: 'X', company: 'X', phone: '', email: '', city: '', source: 'CSV',
  stageId: 's1', status: 'active', temperature: 'warm', priority: 'medium', ownerId: null, ownerName: 'Equipe', value: 0,
  nextActionAt: null, notes: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
})

describe('reviewLeadImport', () => {
  it('separa novos, existentes e repetidos no arquivo', () => {
    const existing = [lead({ id: 'e1', name: 'Barbearia Alfa', phone: '+55 (51) 99999-0001' })]
    const incoming = [
      lead({ name: 'Alfa', phone: '51999990001' }),
      lead({ name: 'Beta', email: 'Beta@Exemplo.com' }),
      lead({ name: 'Beta filial', email: 'beta@exemplo.com ' }),
      lead({ name: 'Gama', cnpj: '12.345.678/0001-90' }),
    ]
    const review = reviewLeadImport(incoming, existing, [2, 3, 4, 5])
    expect(review.matchesExisting.map((item) => [item.lead.name, item.existing?.id, item.reasons])).toEqual([['Alfa', 'e1', ['mesmo telefone']]])
    expect(review.repeatedInFile.map((item) => [item.lead.name, item.repeatsRow, item.reasons])).toEqual([['Beta filial', 3, ['mesmo e-mail']]])
    expect(review.fresh.map((item) => item.lead.name)).toEqual(['Beta', 'Gama'])
  })

  it('não trata nome igual como duplicado', () => {
    const review = reviewLeadImport([lead({ name: 'Ana' })], [lead({ name: 'Ana' })])
    expect(review.fresh).toHaveLength(1)
  })

  it('ignora telefone curto e CNPJ incompleto', () => {
    const review = reviewLeadImport([lead({ phone: '1234', cnpj: '123' })], [lead({ phone: '1234', cnpj: '123' })])
    expect(review.fresh).toHaveLength(1)
  })
})

describe('mapeamento de colunas', () => {
  const stages = [{ id: 's1', name: 'Novo lead', color: '#000', order: 0, probability: 10, isWon: false, isLost: false, workspaceId: 'w' }] as any

  it('sugere campos pelo cabeçalho e lê CNPJ e site', () => {
    const table = readLeadCsv('Nome;Empresa;CNPJ;Site;Coluna estranha\nAna;Alfa;12.345.678/0001-90;alfa.com.br;x')
    const mapping = suggestLeadCsvMapping(table.headers)
    expect(mapping).toEqual(['name', 'company', 'cnpj', 'website', null])
    const result = buildLeadsFromCsv(table, mapping, 'w', stages)
    expect(result.leads[0]).toMatchObject({ name: 'Ana', company: 'Alfa', cnpj: '12.345.678/0001-90', website: 'alfa.com.br' })
    expect(result.rowNumbers).toEqual([2])
  })

  it('usa o mapeamento escolhido pela pessoa, mesmo com cabeçalho desconhecido', () => {
    const table = readLeadCsv('Cliente,Contato principal\nAlfa LTDA,51999990001')
    expect(suggestLeadCsvMapping(table.headers)).toEqual([null, null])
    const result = buildLeadsFromCsv(table, ['name', 'phone'], 'w', stages)
    expect(result.leads[0]).toMatchObject({ name: 'Alfa LTDA', phone: '51999990001' })
  })
})
