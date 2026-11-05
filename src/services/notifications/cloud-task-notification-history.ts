import { getSupabaseClient } from '../../lib/supabase'

export type CloudTaskNotificationStatus =
  'pending' | 'processing' | 'sent' | 'skipped' | 'blocked' | 'failed' | 'cancelled'

export interface CloudTaskNotification {
  id: string
  taskId: string
  assigneeId: string
  channel: 'in_app' | 'email' | 'whatsapp'
  eventType: 'assigned' | 'due_soon'
  status: CloudTaskNotificationStatus
  scheduledAt: string
  processedAt: string | null
  createdAt: string
  lastError: string | null
}

export interface CloudReminderReadiness {
  databaseReady: boolean
  deliveryEnabled: boolean
  internalEnabled: boolean
  schedulerAuthenticated: boolean
  emailCredentialsPresent: boolean
  whatsappCredentialsPresent: boolean
  appUrlConfigured: boolean
}

export const reminderStatusLabel: Record<CloudTaskNotificationStatus, string> = {
  pending: 'Programado',
  processing: 'Processando',
  sent: 'Processado',
  skipped: 'Ignorado: tarefa alterada ou aviso vencido',
  blocked: 'Bloqueado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
}

export const reminderChannelLabel: Record<CloudTaskNotification['channel'], string> = {
  in_app: 'No CRM',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
}

export const reminderErrorLabel = (error: string | null): string => {
  if (!error) return ''
  const translations: Record<string, string> = {
    email_provider_not_configured: 'Serviço de e-mail não configurado.',
    recipient_email_not_verified: 'E-mail do responsável não verificado.',
    recipient_phone_missing: 'Telefone do responsável não cadastrado em Equipes.',
    phone_verification_required: 'Número de WhatsApp não verificado.',
    whatsapp_consent_required: 'O responsável precisa autorizar o WhatsApp em Configurações → Notificações.',
    task_no_longer_eligible: 'A tarefa foi alterada ou o responsável não está mais habilitado.',
    qr_session_not_connected: 'O WhatsApp QR não está conectado no Railway. Conecte em Configurações → WhatsApp.',
    qr_bridge_auth_rejected: 'A autenticação entre o Supabase e o Railway foi rejeitada.',
    gateway_send_unconfirmed_requires_review: 'O gateway não confirmou a aceitação. Verifique a conversa antes de reenviar.',
    gateway_rejected_message: 'O gateway rejeitou a mensagem. Consulte Comunicações.',

    directory_phone_change_requires_employee_reconsent: 'Telefone alterado: é necessária nova autorização do responsável.',
    approved_whatsapp_template_or_credentials_missing: 'Credenciais ou modelo oficial do WhatsApp indisponíveis.',
    team_contact_directory_unavailable: 'Diretório de Equipes indisponível.',
    delivery_outcome_unknown_requires_review: 'Resultado incerto: confirme com o destinatário antes de tentar novamente.',
    stale_reminder_expired: 'Aviso expirado para evitar envio fora de hora.',
    in_app_persistence_failed: 'Não foi possível gravar o aviso no CRM.',
  }
  return translations[error] || (error.startsWith('whatsapp_provider_http_')
    ? 'O provedor de WhatsApp rejeitou o envio.'
    : error.startsWith('email_provider_http_')
      ? 'O provedor de e-mail rejeitou o envio.'
      : 'Falha de envio. Consulte os registros do gateway.')
}

/** Read-only view over the server-owned, RLS-protected outbox.
 * Never schedule or send anything from a browser just to populate this panel.
 */
export async function loadCloudTaskNotificationHistory(
  workspaceId: string,
  visibleTaskIds: string[],
): Promise<CloudTaskNotification[]> {
  if (!workspaceId || !visibleTaskIds.length) return []
  const client = getSupabaseClient()
  if (!client) throw new Error('A conexão com o banco do CRM não está disponível.')
  const { data, error } = await (client as any).from('task_notification_outbox')
    .select('id,task_id,assignee_id,channel,event_type,status,scheduled_at,processed_at,created_at,last_error')
    .eq('organization_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.code === '42501'
    ? 'Sem permissão de leitura do histórico de notificações. Atualize a migração do Supabase.'
    : error.message || 'Não foi possível consultar as notificações hospedadas.')
  const allowed = new Set(visibleTaskIds)
  return (data || []).filter((row: any) => allowed.has(String(row.task_id)))
    .map((row: any): CloudTaskNotification => ({
      id: String(row.id), taskId: String(row.task_id), assigneeId: String(row.assignee_id),
      channel: row.channel, eventType: row.event_type, status: row.status,
      scheduledAt: row.scheduled_at, processedAt: row.processed_at ?? null,
      createdAt: row.created_at, lastError: row.last_error ?? null,
    }))
}

export async function loadCloudReminderReadiness(workspaceId: string): Promise<CloudReminderReadiness> {
  const client = getSupabaseClient()
  if (!client) throw new Error('Banco online indisponível.')
  const { data, error } = await client.functions.invoke('task-reminder-readiness', {
    body: { organizationId: workspaceId },
  })
  if (error || !data?.ok) throw new Error('Não foi possível consultar a configuração de envios externos.')
  return {
    databaseReady: Boolean(data.databaseReady),
    deliveryEnabled: Boolean(data.deliveryEnabled),
    internalEnabled: Boolean(data.internalEnabled),
    schedulerAuthenticated: Boolean(data.schedulerAuthenticated),
    emailCredentialsPresent: Boolean(data.emailCredentialsPresent),
    whatsappCredentialsPresent: Boolean(data.whatsappCredentialsPresent),
    appUrlConfigured: Boolean(data.appUrlConfigured),
  }
}
