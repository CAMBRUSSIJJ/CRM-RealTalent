import { describe, expect, it } from 'vitest'
import { buildWhatsAppDeepLink, normalizeWhatsAppPhone, renderWhatsAppTemplate } from './whatsapp-workspace'

describe('whatsapp workspace', () => {
  it('normaliza telefone brasileiro com código do país', () => {
    expect(normalizeWhatsAppPhone('(51) 99999-0000', '55')).toBe('5551999990000')
    expect(normalizeWhatsAppPhone('+55 51 99999-0000', '55')).toBe('5551999990000')
  })

  it('renderiza variáveis conhecidas sem deixar espaços duplicados', () => {
    expect(renderWhatsAppTemplate('Olá, {{name}}! Sou {{owner}}.', { name: 'Camila', owner: 'Marcelo' })).toBe('Olá, Camila! Sou Marcelo.')
  })

  it('gera deep link com mensagem codificada', () => {
    expect(buildWhatsAppDeepLink('51999990000', 'Olá, tudo bem?', '55')).toContain('https://wa.me/5551999990000?text=')
  })
})
