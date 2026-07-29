import { describe, expect, it } from 'vitest'
import type { Lead } from '../domain/types'
import { suggestSalesMessage } from './sales-messages'

const lead = { name: 'Ana Souza', company: 'ACME', phone: '51999999999', email: 'ana@acme.com' } as Lead

describe('sales messages', () => {
  it('personaliza mensagem de proposta sem prometer resultado', () => {
    const message = suggestSalesMessage(lead, 'Proposta enviada', 'whatsapp')
    expect(message.body).toContain('Ana')
    expect(message.body).toContain('proposta')
    expect(message.body).not.toContain('garant')
  })

  it('gera roteiro de ligação com próximo passo', () => {
    const message = suggestSalesMessage(lead, 'Negociação', 'call')
    expect(message.body).toContain('Objetivo:')
    expect(message.body).toContain('próximo passo')
  })
})
