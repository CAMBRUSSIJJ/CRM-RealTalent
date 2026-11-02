import type { WorkTask } from '../domain/types'
import {
  loadGatewayAccounts, loadGatewayWhatsAppQrStatus, sendGatewayCommunication,
} from './local-communications-gateway'
import type { ConnectedAccount } from './integration-framework'

export type WhatsAppTaskTestResult = {
  status: 'accepted' | 'queued'
  eventId: string
  senderPhone: string
  recipientPhone: string
}

export const normalizeTaskTestPhone = (value: string): string | null => {
  const raw = value.trim()
  if (!/^\+[1-9][0-9]{7,14}$/.test(raw)) return null
  return raw.slice(1)
}

export const eligibleTaskForOwnTest = (task: WorkTask, userId: string | null | undefined): boolean =>
  Boolean(userId && task.assigneeId === userId && ['todo', 'in_progress', 'blocked'].includes(task.status))

export const composeTaskWhatsAppTestMessage = (task: Pick<WorkTask, 'title' | 'dueAt' | 'priority'>): string => {
  const due = task.dueAt && Number.isFinite(Date.parse(task.dueAt))
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(task.dueAt))
    : 'Sem prazo'
  const priorities: Record<string, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }
  return [
    'RealTalent — TESTE de lembrete de tarefa',
    '',
    `Tarefa: ${task.title.trim().slice(0, 140)}`,
    `Prazo: ${due}`,
    `Prioridade: ${priorities[task.priority] ?? 'Normal'}`,
    '',
    'Este é um envio de teste solicitado manualmente no CRM. Não há lembretes automáticos ativados por este teste.',
    'Abra o RealTalent para consultar sua tarefa.',
  ].join('\n')
}

export function qrAccountForTaskTest(accounts: ConnectedAccount[]): ConnectedAccount | null {
  return accounts.find(account =>
    account.provider === 'whatsapp_cloud'
    && account.metadata?.transport === 'qr'
    && account.status === 'connected'
    && account.connectionMode === 'live'
    && account.capabilities?.messages === true
  ) ?? null
}

export type TaskWhatsAppTestReadiness = {
  available: boolean
  message: string
  senderPhone: string
  accountId: string | null
}

export async function checkTaskWhatsAppTestConnection(workspaceId: string): Promise<TaskWhatsAppTestReadiness> {
  const [status, accounts] = await Promise.all([
    loadGatewayWhatsAppQrStatus(workspaceId),
    loadGatewayAccounts(workspaceId),
  ])
  const account = qrAccountForTaskTest(accounts)
  if (status.state !== 'connected' || !account) return {
    available: false,
    message: 'WhatsApp por QR Code não está conectado neste workspace. Abra Configurações → WhatsApp para verificar a conexão.',
    senderPhone: status.phone || '',
    accountId: null,
  }
  return {
    available: true,
    message: 'Conexão QR ativa. O envio será realizado pelo mesmo número do chat do CRM.',
    senderPhone: status.phone || '',
    accountId: account.id,
  }
}

export async function sendOwnTaskWhatsAppTest(input: {
  workspaceId: string
  task: WorkTask
  userId: string
  phone: string
  explicitConsent: boolean
  readiness: TaskWhatsAppTestReadiness
}): Promise<WhatsAppTaskTestResult> {
  if (!eligibleTaskForOwnTest(input.task, input.userId) || input.task.workspaceId !== input.workspaceId) {
    throw new Error('O teste só pode ser enviado para uma tarefa aberta atribuída a você.')
  }
  if (!input.explicitConsent) throw new Error('Confirme que o WhatsApp de destino é seu e que você autoriza este envio único.')
  const recipient = normalizeTaskTestPhone(input.phone)
  if (!recipient) throw new Error('Informe seu WhatsApp em formato internacional, por exemplo +5551999999999.')
  if (!input.readiness.available || !input.readiness.accountId) {
    throw new Error('O WhatsApp QR não está conectado. Atualize o diagnóstico antes de enviar.')
  }

  // Check once more just before sending; never fall back to a Cloud API
  // free-form message, which may be rejected outside the customer-care window.
  const current = await checkTaskWhatsAppTestConnection(input.workspaceId)
  if (!current.available || current.accountId !== input.readiness.accountId) {
    throw new Error('A sessão WhatsApp mudou ou desconectou. Recarregue a conexão antes de testar.')
  }
  const key = `task-whatsapp-manual-test:${input.task.id}:${crypto.randomUUID()}`
  const event = await sendGatewayCommunication({
    workspaceId: input.workspaceId,
    leadId: null,
    contactId: null,
    accountId: current.accountId!,
    channel: 'whatsapp',
    recipient,
    body: composeTaskWhatsAppTestMessage(input.task),
    idempotencyKey: key,
  })
  if (event.status === 'queued') return { status: 'queued', eventId: event.id, senderPhone: current.senderPhone, recipientPhone: recipient }
  if (event.status === 'failed') throw new Error('O gateway registrou falha de envio. Consulte o histórico do WhatsApp no CRM.')
  if (!['sent', 'delivered', 'read'].includes(event.status)) {
    throw new Error('O gateway não confirmou a aceitação da mensagem. Verifique a conversa antes de tentar novamente.')
  }
  return { status: 'accepted', eventId: event.id, senderPhone: current.senderPhone, recipientPhone: recipient }
}
