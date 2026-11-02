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
  // Accept +55 53 99999-9999, 55DDD..., or DDD + subscriber.
  // This control is explicitly for Brazilian numbers in the user's CRM.
  if (!raw || /[^\d+\s().-]/.test(raw) || (raw.match(/\+/g) || []).length > 1 || (raw.includes('+') && !raw.startsWith('+'))) return null
  const digits = raw.replace(/\D/g, '')
  if (/^55[1-9][0-9]{9,10}$/.test(digits)) return digits
  if (/^[1-9][0-9]{9,10}$/.test(digits) && !raw.startsWith('+')) return `55${digits}`
  return null
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
  // The live QR state is authoritative. An account may temporarily be
  // "attention" while the gateway rehydrates its connection list.
  return accounts.find(account =>
    account.provider === 'whatsapp_cloud'
    && String(account.metadata?.transport || '').toLowerCase() === 'qr'
    && !['revoked', 'paused'].includes(account.status)
    && account.connectionMode !== 'demo'
  ) ?? null
}

export type TaskWhatsAppTestReadiness = {
  available: boolean
  message: string
  senderPhone: string
  accountId: string | null
}

export async function checkTaskWhatsAppTestConnection(workspaceId: string): Promise<TaskWhatsAppTestReadiness> {
  // Communicações and Tarefas now share the same QR status endpoint.
  // A remembered phone number alone is NOT proof of a live session.
  const status = await loadGatewayWhatsAppQrStatus(workspaceId)
  if (status.state !== 'connected') {
    const states: Record<string, string> = {
      starting: 'O WhatsApp está reconectando. Aguarde a conexão ficar ativa e clique em Verificar novamente.',
      qr: 'O WhatsApp está aguardando a leitura do QR Code em Comunicações → WhatsApp.',
      disconnected: 'A sessão do WhatsApp está desconectada. Confira o status em Comunicações → WhatsApp.',
      logged_out: 'O WhatsApp encerrou a sessão. Conecte novamente em Comunicações → WhatsApp.',
      idle: 'Não há uma sessão QR ativa neste workspace. Verifique Comunicações → WhatsApp.',
    }
    return { available: false, message: states[status.state] || 'WhatsApp não está pronto para o envio.', senderPhone: '', accountId: null }
  }

  // On the new gateway the account ID is supplied directly by the *live*
  // QR session. No separate, potentially stale integrations cache is needed.
  let accountId = typeof status.accountId === 'string' && status.accountId.trim() ? status.accountId : null
  if (!accountId) {
    // Backward-compatible fallback for an older gateway already running:
    // use its QR account, never a Cloud API account.
    let accounts: ConnectedAccount[]
    try { accounts = await loadGatewayAccounts(workspaceId) }
    catch {
      return {
        available: false,
        message: 'A sessão WhatsApp está ativa, mas não foi possível consultar a conta de envio. Reinicie apenas o gateway local do CRM e verifique novamente.',
        senderPhone: status.phone || '',
        accountId: null,
      }
    }
    accountId = qrAccountForTaskTest(accounts)?.id || null
  }
  if (!accountId) return {
    available: false,
    message: 'O WhatsApp está conectado, mas a conta de envio ainda não foi registrada pelo gateway. Aguarde a sincronização e clique em Verificar novamente.',
    senderPhone: status.phone || '',
    accountId: null,
  }

  return {
    available: true,
    message: 'WhatsApp conectado em Comunicações. Tarefas utilizará essa mesma sessão QR para o teste.',
    senderPhone: status.phone || '',
    accountId,
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
  if (!recipient) throw new Error('Informe seu número brasileiro com DDD, por exemplo 53999999999 ou +5553999999999.')
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
  if (event.status === 'failed') {
    const rawError = event.metadata?.lastSendError
    const details = typeof rawError === 'string' && rawError.trim() ? rawError.trim().slice(0, 350) : 'O WhatsApp Web não confirmou o envio.'
    throw new Error(`Envio não confirmado: ${details}. Não houve reenvio automático deste teste. Confira a conversa antes de tentar novamente.`)
  }
  if (!['sent', 'delivered', 'read'].includes(event.status)) {
    throw new Error('O gateway não confirmou a aceitação da mensagem. Verifique a conversa antes de tentar novamente.')
  }
  return { status: 'accepted', eventId: event.id, senderPhone: current.senderPhone, recipientPhone: recipient }
}
