import { describe, expect, it } from 'vitest'
import { canContactLead, contactBlockedMessage, contactPermission } from './contact-policy'

describe('contact policy', () => {
  it('permite contato quando o lead não está bloqueado', () => {
    expect(canContactLead({ doNotContact: false, doNotContactReason: '' })).toBe(true)
  })

  it('bloqueia todos os canais quando doNotContact está ativo', () => {
    const lead = { doNotContact: true, doNotContactReason: 'Solicitação do contato' }
    expect(contactPermission(lead).allowed).toBe(false)
    expect(contactBlockedMessage(lead, 'whatsapp')).toContain('Solicitação do contato')
    expect(contactBlockedMessage(lead, 'call')).toContain('não foi aberto')
  })

  it('fornece uma justificativa segura mesmo sem motivo preenchido', () => {
    expect(contactBlockedMessage({ doNotContact: true, doNotContactReason: '' }, 'email')).toContain('Não entrar em contato')
  })
})
