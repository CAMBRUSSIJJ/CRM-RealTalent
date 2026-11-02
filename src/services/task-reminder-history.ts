import { getSupabaseClient } from '../lib/supabase'

export type TaskReminderHistory = {
  id: string
  eventType: 'assigned' | 'due_soon'
  channel: 'in_app' | 'email' | 'whatsapp'
  status: 'pending' | 'processing' | 'sent' | 'skipped' | 'blocked' | 'failed' | 'cancelled'
  scheduledAt: string
  processedAt: string | null
  createdAt: string
}

export const reminderHistoryStatusLabel: Record<TaskReminderHistory['status'], string> = {
  pending: 'Programado', processing: 'Processando', sent: 'Enviado ao canal',
  skipped: 'Dispensado', blocked: 'Não habilitado', failed: 'Falha',
  cancelled: 'Cancelado',
}
export const reminderChannelLabel: Record<TaskReminderHistory['channel'], string> = {
  in_app: 'CRM', email: 'E-mail', whatsapp: 'WhatsApp',
}

/** Read-only, authorized by task visibility RLS in the database. */
export async function loadTaskReminderHistory(
  workspaceId: string, taskId: string,
): Promise<TaskReminderHistory[]> {
  const client = getSupabaseClient()
  if (!client) throw new Error('Conexão Supabase indisponível.')
  const { data, error } = await (client as any).from('task_notification_outbox')
    .select('id,event_type,channel,status,scheduled_at,processed_at,created_at')
    .eq('organization_id', workspaceId).eq('task_id', taskId)
    .order('created_at', { ascending: false }).limit(30)
  if (error) throw new Error('Histórico indisponível. Verifique a atualização do banco e suas permissões.')
  return (data ?? []).map((r: any) => ({
    id: String(r.id), eventType: r.event_type, channel: r.channel, status: r.status,
    scheduledAt: r.scheduled_at, processedAt: r.processed_at ?? null, createdAt: r.created_at,
  }))
}
