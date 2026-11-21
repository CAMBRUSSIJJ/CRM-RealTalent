import { describe, expect, it } from 'vitest'
import { renderTemplate } from './email-templates'
import { cumulativeDays, validateSequence } from './email-sequences'

describe('modelos de e-mail', () => {
  const context = { name: 'Ana Souza', company: 'Empresa X', jobTitle: '', city: 'Porto Alegre', stage: 'Proposta', sellerName: 'Marcelo', sellerEmail: 'm@rt.com' }
  it('troca as variáveis pelos dados do contato', () => {
    expect(renderTemplate('Olá {{primeiro_nome}}, tudo bem na {{ empresa }}? — {{vendedor}}', context).text).toBe('Olá Ana, tudo bem na Empresa X? — Marcelo')
  })
  it('avisa as variáveis sem dado e não deixa espaço antes da pontuação', () => {
    const result = renderTemplate('Como {{cargo}}, você', context)
    expect(result.missing).toEqual(['cargo'])
    expect(result.text).toBe('Como, você')
  })
  it('mantém chaves desconhecidas como estão', () => {
    expect(renderTemplate('{{desconhecida}}', context).text).toBe('{{desconhecida}}')
  })
})

describe('sequências', () => {
  it('valida nome, assunto do primeiro e textos', () => {
    expect(validateSequence('', [])).toMatch(/nome/)
    expect(validateSequence('S', [{ position: 1, delayDays: 0, subject: '', body: 'x' }])).toMatch(/assunto/)
    expect(validateSequence('S', [{ position: 1, delayDays: 0, subject: 'Oi', body: 'x' }, { position: 2, delayDays: 3, subject: '', body: ' ' }])).toMatch(/e-mail 2/)
    expect(validateSequence('S', [{ position: 1, delayDays: 0, subject: 'Oi', body: 'x' }, { position: 2, delayDays: 3, subject: '', body: 'y' }])).toBeNull()
  })
  it('calcula o dia de cada e-mail', () => { expect(cumulativeDays([{ delayDays: 0 }, { delayDays: 3 }, { delayDays: 4 }])).toEqual([0, 3, 7]) })
})
