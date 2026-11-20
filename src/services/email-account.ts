import { env } from '../lib/env'
import { getSupabaseClient } from '../lib/supabase'
import { safeStorage } from '../lib/storage'

// Conta de e-mail pessoal de quem está usando o CRM (Fase 2 · Comunicação).
// Cada vendedor conecta o próprio Gmail; o CRM envia por ela e guarda só as conversas com contatos do CRM.

export type EmailAccountStatus = 'connected' | 'attention' | 'expired' | 'paused' | 'error'

export interface MyEmailAccount {
  id: string
  provider: 'google' | 'microsoft'
  email: string
  displayName: string
  status: EmailAccountStatus
  canSend: boolean
  canRead: boolean
  lastSyncAt: string | null
  lastError: string | null
}

export interface LeadEmail {
  id: string
  direction: 'inbound' | 'outbound'
  status: string
  subject: string
  bodyText: string
  sender: string
  recipients: string[]
  occurredAt: string
}

export type StartConnectionResult =
  | { kind: 'redirect'; url: string }
  | { kind: 'not_configured'; message: string; missing: string[] }
  | { kind: 'local'; message: string }

export interface OAuthReturn { status: 'success' | 'error'; provider: string; detail: string }

const SETTINGS_TAB_KEY = 'realtalent-settings-open-tab'
const objectValue = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

// Lê o retorno do Google/Microsoft na URL (o callback redireciona com ?oauth=success|error).
export function readOAuthReturn(search: string): OAuthReturn | null {
  const params = new URLSearchParams(search)
  const status = params.get('oauth')
  if (status !== 'success' && status !== 'error') return null
  return { status, provider: params.get('provider') || '', detail: params.get('detail') || '' }
}

export function oauthReturnMessage(result: OAuthReturn) {
  const label = result.provider === 'microsoft' ? 'Outlook' : 'Gmail'
  if (result.status === 'success') return `${result.provider ? label : 'Conta'} conectado. As conversas com seus contatos aparecem no CRM em alguns minutos.`
  return result.detail || 'Não foi possível conectar a conta. Tente de novo.'
}

export const cleanOAuthParams = (href: string) => {
  const url = new URL(href)
  for (const key of ['oauth', 'provider', 'detail', 'route', 'tab', 'integration']) url.searchParams.delete(key)
  return `${url.pathname}${url.search}${url.hash}`
}

// A tela de Configurações abre na aba pedida uma única vez (ex.: ao voltar do Google).
export const requestSettingsTab = (tab: string) => safeStorage.setItem(SETTINGS_TAB_KEY, tab)
export const consumeSettingsTab = () => {
  const tab = safeStorage.getItem(SETTINGS_TAB_KEY)
  if (tab) safeStorage.removeItem(SETTINGS_TAB_KEY)
  return tab
}

export function mapMyEmailAccount(row: Record<string, unknown>): MyEmailAccount {
  const capabilities = objectValue(row.capabilities)
  const metadata = objectValue(row.metadata)
  const status = String(row.status || 'attention')
  return {
    id: String(row.id),
    provider: row.provider === 'microsoft' ? 'microsoft' : 'google',
    email: String(metadata.email || row.display_name || ''),
    displayName: String(row.display_name || metadata.email || ''),
    status: (['connected', 'attention', 'expired', 'paused', 'error'].includes(status) ? status : 'attention') as EmailAccountStatus,
    canSend: Boolean(capabilities.email_send),
    canRead: Boolean(capabilities.mail_sync),
    lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
  }
}

export async function loadMyEmailAccount(workspaceId: string): Promise<MyEmailAccount | null> {
  const client = getSupabaseClient()
  if (!client) return null
  const { data: auth } = await client.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await client.from('integration_connected_accounts').select('*')
    .eq('organization_id', workspaceId).in('provider', ['google', 'microsoft']).eq('connected_by_user_id', auth.user.id)
    .eq('connection_mode', 'live').neq('status', 'revoked').order('updated_at', { ascending: false }).limit(1)
  if (error) throw new Error(`Não foi possível carregar sua conta de e-mail: ${error.message}`)
  return data?.[0] ? mapMyEmailAccount(data[0] as Record<string, unknown>) : null
}

export async function startEmailConnection(workspaceId: string, provider: 'google' | 'microsoft' = 'google'): Promise<StartConnectionResult> {
  const client = getSupabaseClient()
  if (!client || !env.supabaseUrl) return { kind: 'local', message: 'No modo demonstração não há conexão real com o Gmail. Use o CRM hospedado para conectar sua conta.' }
  const { data: session } = await client.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.')
  const response = await fetch(`${env.supabaseUrl.replace(/\/$/, '')}/functions/v1/integration-oauth-start`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ organizationId: workspaceId, provider }),
  })
  const payload = await response.json().catch(() => ({})) as { authorizationUrl?: string; error?: string; code?: string; missing?: string[] }
  if (payload.code === 'not_configured') return { kind: 'not_configured', message: payload.error || 'A conexão ainda não foi configurada pelo administrador.', missing: payload.missing || [] }
  if (!response.ok || !payload.authorizationUrl) throw new Error(payload.error || 'Não foi possível iniciar a conexão.')
  return { kind: 'redirect', url: payload.authorizationUrl }
}

export async function disconnectMyEmailAccount(workspaceId: string, accountId: string) {
  const client = getSupabaseClient()
  if (!client) return
  const { error } = await client.functions.invoke('integration-account-revoke', { body: { organizationId: workspaceId, accountId } })
  if (error) throw new Error(`Não foi possível desconectar: ${error.message}`)
}

export async function testMyEmailAccount(workspaceId: string, accountId: string) {
  const client = getSupabaseClient()
  if (!client) throw new Error('O teste exige o CRM hospedado.')
  const { data, error } = await client.functions.invoke('integration-account-test', { body: { organizationId: workspaceId, accountId } })
  if (error) throw new Error(error.message)
  return data as { status: 'pass' | 'warn' | 'fail'; message: string; latencyMs: number }
}

export interface SendLeadEmailInput { workspaceId: string; leadId: string; accountId: string; recipient: string; subject: string; body: string; idempotencyKey: string }

export function validateLeadEmail(input: Pick<SendLeadEmailInput, 'recipient' | 'subject' | 'body'>) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient.trim())) return 'O contato não tem um e-mail válido.'
  if (!input.subject.trim()) return 'Escreva um assunto.'
  if (!input.body.trim()) return 'Escreva a mensagem.'
  return null
}

export async function sendLeadEmail(input: SendLeadEmailInput) {
  const problem = validateLeadEmail(input)
  if (problem) throw new Error(problem)
  const client = getSupabaseClient()
  if (!client) throw new Error('O envio pelo Gmail exige o CRM hospedado.')
  const { data, error } = await client.functions.invoke('official-communication-send', {
    body: { organizationId: input.workspaceId, leadId: input.leadId, accountId: input.accountId, channel: 'email', recipient: input.recipient.trim(), subject: input.subject.trim(), body: input.body, idempotencyKey: input.idempotencyKey },
  })
  if (error) {
    const context = (error as { context?: Response }).context
    const detail = context ? await context.json().catch(() => null) as { error?: string } | null : null
    throw new Error(detail?.error || error.message)
  }
  return data as { event: { id: string; status: string } }
}

export async function listLeadEmails(workspaceId: string, leadId: string): Promise<LeadEmail[]> {
  const client = getSupabaseClient()
  if (!client) return []
  // communication_events ainda não está nos tipos gerados do Supabase.
  type EventRow = { id: string; direction: string; status: string; subject: string | null; body_text: string | null; sender_address: string | null; recipient_addresses: string[] | null; occurred_at: string }
  type EventQuery = { eq(column: string, value: string): EventQuery; order(column: string, options: { ascending: boolean }): EventQuery; limit(count: number): PromiseLike<{ data: EventRow[] | null; error: { message: string } | null }> }
  const events = (client as unknown as { from(table: string): { select(columns: string): EventQuery } }).from('communication_events')
  const { data, error } = await events.select('id,direction,status,subject,body_text,sender_address,recipient_addresses,occurred_at')
    .eq('organization_id', workspaceId).eq('lead_id', leadId).eq('channel', 'email').order('occurred_at', { ascending: false }).limit(30)
  if (error) throw new Error(`Não foi possível carregar os e-mails: ${error.message}`)
  return (data || []).map((row) => ({
    id: String(row.id), direction: row.direction === 'outbound' ? 'outbound' : 'inbound', status: String(row.status || ''),
    subject: String(row.subject || '(sem assunto)'), bodyText: String(row.body_text || ''), sender: String(row.sender_address || ''),
    recipients: Array.isArray(row.recipient_addresses) ? row.recipient_addresses.map(String) : [], occurredAt: String(row.occurred_at),
  }))
}

export const emailStatusLabel = (status: string) => ({ queued: 'Na fila', processing: 'Enviando', sent: 'Enviado', received: 'Recebido', failed: 'Falhou', cancelled: 'Cancelado' } as Record<string, string>)[status] || status
