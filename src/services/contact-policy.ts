import type { Lead } from '../domain/types'

export type ContactChannel = 'call' | 'whatsapp' | 'email' | 'instagram' | 'automation'

export interface ContactPermission {
  allowed: boolean
  reason: string | null
}

/**
 * Regra central de contato comercial.
 * Qualquer canal de prospecção deve passar por esta política antes de abrir
 * discador, WhatsApp, e-mail, Instagram ou executar uma automação de contato.
 */
export const contactPermission = (lead: Pick<Lead, 'doNotContact' | 'doNotContactReason'> | null | undefined): ContactPermission => {
  if (!lead?.doNotContact) return { allowed: true, reason: null }
  return {
    allowed: false,
    reason: lead.doNotContactReason?.trim()
      ? `Contato bloqueado: ${lead.doNotContactReason.trim()}`
      : 'Contato bloqueado pela preferência “Não entrar em contato”.',
  }
}

export const canContactLead = (lead: Pick<Lead, 'doNotContact' | 'doNotContactReason'> | null | undefined) => contactPermission(lead).allowed

export const contactBlockedMessage = (lead: Pick<Lead, 'doNotContact' | 'doNotContactReason'> | null | undefined, channel?: ContactChannel) => {
  const permission = contactPermission(lead)
  if (permission.allowed) return null
  const channelLabel = channel === 'call' ? 'ligação' : channel === 'whatsapp' ? 'WhatsApp' : channel === 'email' ? 'e-mail' : channel === 'instagram' ? 'Instagram' : channel === 'automation' ? 'automação' : 'contato'
  return `${permission.reason} O ${channelLabel} não foi aberto.`
}
