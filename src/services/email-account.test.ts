import { describe, expect, it } from 'vitest'
import { buildContactSearchQueries, buildLeadEmailIndex, matchLeadForMessage, parseAddressList } from '../../supabase/functions/_shared/gmail-contact-filter'
import { cleanOAuthParams, mapMyEmailAccount, oauthReturnMessage, readOAuthReturn, validateLeadEmail } from './email-account'

describe('filtro de contatos do Gmail', () => {
  const index = buildLeadEmailIndex([
    { id: 'lead-1', email: 'Ana@Cliente.com.br' },
    { id: 'lead-2', email: 'joao@empresa.com' },
    { id: 'lead-3', email: '' },
    { id: 'lead-4', email: null },
  ])

  it('indexa e-mails normalizados e ignora vazios', () => {
    expect(index.get('ana@cliente.com.br')).toBe('lead-1')
    expect(index.size).toBe(2)
  })

  it('registra e-mail recebido de um contato do CRM', () => {
    const match = matchLeadForMessage({ from: 'Ana Souza <ana@cliente.com.br>', to: ['vendedor@realtalent.com'], cc: [] }, 'vendedor@realtalent.com', index)
    expect(match).toEqual({ direction: 'inbound', leadId: 'lead-1', counterpart: 'ana@cliente.com.br' })
  })

  it('registra e-mail enviado pelo Gmail para um contato, mesmo em cópia', () => {
    const match = matchLeadForMessage({ from: 'Vendedor <Vendedor@RealTalent.com>', to: ['outra@pessoa.com'], cc: ['joao@empresa.com'] }, 'vendedor@realtalent.com', index)
    expect(match).toEqual({ direction: 'outbound', leadId: 'lead-2', counterpart: 'joao@empresa.com' })
  })

  it('ignora e-mails pessoais e de quem não é contato', () => {
    expect(matchLeadForMessage({ from: 'newsletter@loja.com', to: ['vendedor@realtalent.com'], cc: [] }, 'vendedor@realtalent.com', index)).toBeNull()
    expect(matchLeadForMessage({ from: 'vendedor@realtalent.com', to: ['mae@familia.com'], cc: [] }, 'vendedor@realtalent.com', index)).toBeNull()
  })

  it('lê listas de destinatários com nomes', () => {
    expect(parseAddressList('"Silva, Ana" <ana@cliente.com.br>, joao@empresa.com, sem-arroba')).toEqual(['ana@cliente.com.br', 'joao@empresa.com'])
  })

  it('monta buscas em lotes só com endereços válidos', () => {
    const emails = Array.from({ length: 30 }, (_, i) => `c${i}@x.com`).concat(['inválido', 'C0@X.com'])
    const queries = buildContactSearchQueries(emails, 90, 25)
    expect(queries).toHaveLength(2)
    expect(queries[0].startsWith('newer_than:90d {from:c0@x.com to:c0@x.com cc:c0@x.com')).toBe(true)
    expect(buildContactSearchQueries([])).toEqual([])
  })
})

describe('conta de e-mail pessoal', () => {
  it('lê o retorno do OAuth', () => {
    expect(readOAuthReturn('?route=settings&oauth=success&provider=google')).toEqual({ status: 'success', provider: 'google', detail: '' })
    expect(readOAuthReturn('?oauth=talvez')).toBeNull()
    expect(oauthReturnMessage({ status: 'error', provider: '', detail: 'Você cancelou a autorização. Nada foi conectado.' })).toContain('cancelou')
    expect(oauthReturnMessage({ status: 'success', provider: 'google', detail: '' })).toContain('Gmail conectado')
  })

  it('limpa os parâmetros do OAuth e mantém os demais', () => {
    expect(cleanOAuthParams('https://crm.app/?route=settings&tab=integrations&oauth=success&provider=google&x=1#topo')).toBe('/?x=1#topo')
  })

  it('mostra permissões de acordo com o que o Google concedeu', () => {
    const account = mapMyEmailAccount({ id: 'a1', provider: 'google', display_name: 'Ana', status: 'connected', capabilities: { email_send: true, mail_sync: false }, metadata: { email: 'ana@x.com' }, last_sync_at: null, last_error: null })
    expect(account).toMatchObject({ email: 'ana@x.com', canSend: true, canRead: false, status: 'connected' })
    expect(mapMyEmailAccount({ id: 'a2', status: 'qualquer' }).status).toBe('attention')
  })

  it('valida o e-mail antes de enviar', () => {
    expect(validateLeadEmail({ recipient: 'sem-email', subject: 'Oi', body: 'Teste' })).toMatch(/e-mail válido/)
    expect(validateLeadEmail({ recipient: 'ana@x.com', subject: ' ', body: 'Teste' })).toMatch(/assunto/)
    expect(validateLeadEmail({ recipient: 'ana@x.com', subject: 'Oi', body: '' })).toMatch(/mensagem/)
    expect(validateLeadEmail({ recipient: 'ana@x.com', subject: 'Oi', body: 'Teste' })).toBeNull()
  })
})
