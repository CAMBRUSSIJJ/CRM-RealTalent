import { describe, expect, it } from 'vitest'
import { buildContactSearchQueries, buildLeadEmailIndex, matchLeadForMessage, parseAddressList } from '../../supabase/functions/_shared/gmail-contact-filter'

describe('filtro de contatos do Gmail', () => {
  const index = buildLeadEmailIndex([{ id: 'lead-1', email: 'Ana@Cliente.com.br' }, { id: 'lead-2', email: 'joao@empresa.com' }, { id: 'lead-3', email: '' }, { id: 'lead-4', email: null }])
  it('indexa e-mails normalizados e ignora vazios', () => { expect(index.get('ana@cliente.com.br')).toBe('lead-1'); expect(index.size).toBe(2) })
  it('registra e-mail recebido de um contato do CRM', () => {
    expect(matchLeadForMessage({ from: 'Ana Souza <ana@cliente.com.br>', to: ['vendedor@realtalent.com'], cc: [] }, 'vendedor@realtalent.com', index)).toEqual({ direction: 'inbound', leadId: 'lead-1', counterpart: 'ana@cliente.com.br' })
  })
  it('registra e-mail enviado pelo Gmail para um contato, mesmo em cópia', () => {
    expect(matchLeadForMessage({ from: 'Vendedor <Vendedor@RealTalent.com>', to: ['outra@pessoa.com'], cc: ['joao@empresa.com'] }, 'vendedor@realtalent.com', index)).toEqual({ direction: 'outbound', leadId: 'lead-2', counterpart: 'joao@empresa.com' })
  })
  it('ignora e-mails pessoais e de quem não é contato', () => {
    expect(matchLeadForMessage({ from: 'newsletter@loja.com', to: ['vendedor@realtalent.com'], cc: [] }, 'vendedor@realtalent.com', index)).toBeNull()
    expect(matchLeadForMessage({ from: 'vendedor@realtalent.com', to: ['mae@familia.com'], cc: [] }, 'vendedor@realtalent.com', index)).toBeNull()
  })
  it('lê listas de destinatários com nomes', () => { expect(parseAddressList('"Silva, Ana" <ana@cliente.com.br>, joao@empresa.com, sem-arroba')).toEqual(['ana@cliente.com.br', 'joao@empresa.com']) })
  it('monta buscas em lotes só com endereços válidos', () => {
    const queries = buildContactSearchQueries(Array.from({ length: 30 }, (_, i) => `c${i}@x.com`).concat(['inválido', 'C0@X.com']), 90, 25)
    expect(queries).toHaveLength(2)
    expect(queries[0].startsWith('newer_than:90d {from:c0@x.com to:c0@x.com cc:c0@x.com')).toBe(true)
    expect(buildContactSearchQueries([])).toEqual([])
  })
})
