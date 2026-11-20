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

import { counterpartOf, isAutomatedAddress, isWorkMailLabelSet, senderDisplayName } from '../../supabase/functions/_shared/gmail-contact-filter'
describe('caixa recente do Gmail', () => {
  it('descarta promoções, social, spam e rascunhos', () => {
    expect(isWorkMailLabelSet(['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'])).toBe(true)
    expect(isWorkMailLabelSet(['INBOX', 'CATEGORY_PROMOTIONS'])).toBe(false)
    expect(isWorkMailLabelSet(['SPAM'])).toBe(false)
    expect(isWorkMailLabelSet(['DRAFT'])).toBe(false)
  })
  it('reconhece remetentes automáticos', () => {
    expect(isAutomatedAddress('no-reply@banco.com')).toBe(true)
    expect(isAutomatedAddress('noreply+abc@x.com')).toBe(true)
    expect(isAutomatedAddress('ana@cliente.com')).toBe(false)
  })
  it('lê nome e quem está do outro lado', () => {
    expect(senderDisplayName('"Ana Souza" <ana@x.com>')).toBe('Ana Souza')
    expect(counterpartOf({ from: 'Eu <eu@empresa.com>', to: ['eu@empresa.com', 'ana@x.com'], cc: [] }, 'eu@empresa.com')).toEqual({ direction: 'outbound', address: 'ana@x.com' })
    expect(counterpartOf({ from: 'Ana <ana@x.com>', to: ['eu@empresa.com'], cc: [] }, 'eu@empresa.com')).toEqual({ direction: 'inbound', address: 'ana@x.com' })
  })
})
