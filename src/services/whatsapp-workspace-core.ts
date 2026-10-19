import { describeIntegrationBackendError } from './integration-runtime-diagnostics'
import type { CommunicationEvent, Lead } from '../domain/types'
import { openExternalUrl } from '../lib/browser-actions'
import { getSupabaseClient } from '../lib/supabase'
import { safeStorage } from '../lib/storage'
import { loadIntegrationFramework, type ConnectedAccount } from './integration-framework'
import { sendGatewayCommunication, type GatewayWhatsAppAttachmentInput } from './local-communications-gateway'

export type WhatsAppMode = 'assisted' | 'official'
export type WhatsAppTemplatePurpose = 'first_contact' | 'followup' | 'proposal' | 'meeting' | 'post_sale' | 'custom'
export interface WhatsAppTemplate { id: string; name: string; purpose: WhatsAppTemplatePurpose; body: string; active: boolean }
export interface WhatsAppTemplateContext { name?: string; company?: string; owner?: string; stage?: string; value?: string; proposal?: string; date?: string; time?: string }

const STORAGE_PREFIX = 'realtalent-v10085-whatsapp-templates:'
export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  { id: 'first-contact', name: 'Primeiro contato', purpose: 'first_contact', active: true, body: 'Olá, {{name}}! Tudo bem? Sou {{owner}} da RealTalent. Vi o trabalho da {{company}} e queria entender rapidamente como vocês organizam o processo comercial hoje. Posso te fazer uma pergunta?' },
  { id: 'followup', name: 'Retomar conversa', purpose: 'followup', active: true, body: 'Olá, {{name}}! Retomando nossa conversa sobre {{company}}. Ficou alguma dúvida ou existe um melhor momento para avançarmos?' },
  { id: 'proposal', name: 'Proposta enviada', purpose: 'proposal', active: true, body: 'Olá, {{name}}! A proposta {{proposal}} já está pronta. Quando você conseguir revisar, me avise e alinhamos os próximos passos.' },
  { id: 'meeting', name: 'Confirmar reunião', purpose: 'meeting', active: true, body: 'Olá, {{name}}! Confirmando nossa reunião em {{date}} às {{time}}. Se precisar ajustar o horário, me avise por aqui.' },
  { id: 'post-sale', name: 'Pós-venda', purpose: 'post_sale', active: true, body: 'Olá, {{name}}! Passando para acompanhar como está a experiência desde o início do trabalho. Existe algo que possamos ajustar ou melhorar?' },
]

const cloneDefaults = () => DEFAULT_WHATSAPP_TEMPLATES.map((item) => ({ ...item }))
export const loadWhatsAppTemplates = (workspaceId: string): WhatsAppTemplate[] => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`) ?? 'null')
    if (!Array.isArray(parsed)) return cloneDefaults()
    const normalized = parsed.filter((item) => item && typeof item === 'object').map((item, index) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 80) : `template-${index + 1}`,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : `Template ${index + 1}`,
      purpose: ['first_contact', 'followup', 'proposal', 'meeting', 'post_sale', 'custom'].includes(String(item.purpose)) ? item.purpose as WhatsAppTemplatePurpose : 'custom',
      body: typeof item.body === 'string' ? item.body.slice(0, 4000) : '', active: item.active !== false,
    })).filter((item) => item.body.trim())
    return normalized.length ? normalized : cloneDefaults()
  } catch { return cloneDefaults() }
}
export const saveWhatsAppTemplates = (workspaceId: string, templates: WhatsAppTemplate[]) => safeStorage.setItem(`${STORAGE_PREFIX}${workspaceId}`, JSON.stringify(templates.slice(0, 50)))
export const resetWhatsAppTemplates = (workspaceId: string) => { const templates = cloneDefaults(); saveWhatsAppTemplates(workspaceId, templates); return templates }

export const normalizeWhatsAppPhone = (value: string, defaultCountryCode = '55') => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith(defaultCountryCode)) return digits
  if (digits.length >= 12 && !defaultCountryCode) return digits
  return `${defaultCountryCode}${digits}`
}

export const renderWhatsAppTemplate = (body: string, context: WhatsAppTemplateContext) => body.replace(/\{\{\s*(name|company|owner|stage|value|proposal|date|time)\s*\}\}/gi, (_, key: keyof WhatsAppTemplateContext) => String(context[key] ?? '').trim()).replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim()
export const templateContextFromLead = (lead: Lead, extra: WhatsAppTemplateContext = {}): WhatsAppTemplateContext => ({ name: lead.name, company: lead.company || lead.name, owner: lead.ownerName || 'equipe RealTalent', value: lead.value ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.value) : '', ...extra })
export const pickWhatsAppTemplate = (templates: WhatsAppTemplate[], purpose: WhatsAppTemplatePurpose) => templates.find((item) => item.active && item.purpose === purpose) ?? templates.find((item) => item.active) ?? null
export const buildWhatsAppDeepLink = (phone: string, message: string, defaultCountryCode = '55') => {
  const normalized = normalizeWhatsAppPhone(phone, defaultCountryCode)
  return normalized ? `https://wa.me/${normalized}${message.trim() ? `?text=${encodeURIComponent(message.trim())}` : ''}` : ''
}
export const openAssistedWhatsApp = (phone: string, message: string, defaultCountryCode = '55') => {
  const url = buildWhatsAppDeepLink(phone, message, defaultCountryCode)
  return url ? openExternalUrl(url) : { ok: false, reason: 'Telefone ausente ou inválido.' }
}

export const connectedWhatsAppAccounts = async (workspaceId: string): Promise<ConnectedAccount[]> => {
  const state = await loadIntegrationFramework(workspaceId)
  return state.accounts.filter((item) => item.provider === 'whatsapp_cloud' && item.status === 'connected' && item.connectionMode === 'live')
}

export async function sendOfficialWhatsApp(input: { workspaceId: string; leadId?: string | null; contactId?: string | null; accountId: string; recipient?: string; threadId?: string | null; body: string; idempotencyKey?: string; attachment?: GatewayWhatsAppAttachmentInput | null; replyToExternalMessageId?: string | null; replyPreview?: string | null }): Promise<CommunicationEvent> {
  const client = getSupabaseClient()
  const idempotencyKey = input.idempotencyKey ?? `crm-whatsapp:${input.leadId || input.threadId || input.recipient}:${Date.now()}`
  if (client && input.threadId?.endsWith('@g.us')) throw new Error('Envio para grupos está disponível apenas no WhatsApp por QR local nesta versão.')
  if (!client) return sendGatewayCommunication({ workspaceId: input.workspaceId, leadId: input.leadId || null, contactId: input.contactId ?? null, accountId: input.accountId, channel: 'whatsapp', recipient: input.recipient, threadId: input.threadId ?? null, body: input.body, idempotencyKey, attachment: input.attachment ?? null, replyToExternalMessageId: input.replyToExternalMessageId ?? null, replyPreview: input.replyPreview ?? null })
  const { data, error } = await client.functions.invoke('official-communication-send', { body: { organizationId: input.workspaceId, leadId: input.leadId || null, contactId: input.contactId ?? null, accountId: input.accountId, channel: 'whatsapp', recipient: input.recipient, body: input.body, idempotencyKey, attachment: input.attachment ?? null, replyToExternalMessageId: input.replyToExternalMessageId ?? null } })
  if (error) throw new Error(describeIntegrationBackendError('official-communication-send', error))
  const event = (data as { event?: CommunicationEvent; error?: string } | null)?.event
  if (!event) throw new Error((data as { error?: string } | null)?.error ?? 'O backend não retornou o evento de comunicação.')
  return event
}

export const whatsappActivityDescription = (mode: WhatsAppMode, message: string, templateName?: string) => `${mode === 'official' ? 'Mensagem oficial enfileirada pelo WhatsApp Business.' : 'Conversa aberta no WhatsApp pelo modo assistido.'}${templateName ? ` Template: ${templateName}.` : ''}\n\nMensagem preparada:\n${message}`.slice(0, 4000)
