export * from './whatsapp-workspace-core'

import type { CommunicationEvent } from '../domain/types'
import { sendOfficialWhatsApp as coreSendOfficialWhatsApp } from './whatsapp-workspace-core'
import {
  beginCommunicationIdempotencyAttempt,
  confirmCommunicationIdempotencyAttempt,
  keepCommunicationIdempotencyPending,
} from './communication-idempotency'

export async function sendOfficialWhatsApp(input: Parameters<typeof coreSendOfficialWhatsApp>[0]): Promise<CommunicationEvent> {
  const attempt = beginCommunicationIdempotencyAttempt({
    workspaceId: input.workspaceId,
    leadId: input.leadId ?? null,
    contactId: input.contactId ?? null,
    channel: 'whatsapp',
    recipient: input.recipient || input.threadId || '',
    body: input.body,
    proposedKey: input.idempotencyKey,
  })
  try {
    const event = await coreSendOfficialWhatsApp({ ...input, idempotencyKey: attempt.key })
    confirmCommunicationIdempotencyAttempt(attempt, event.id)
    return event
  } catch (error) {
    // Preserve a tentativa pendente: se o provider recebeu o envio mas a resposta
    // ao browser falhou, o retry usa a mesma idempotency key e não duplica a mensagem.
    keepCommunicationIdempotencyPending(attempt)
    throw error
  }
}
