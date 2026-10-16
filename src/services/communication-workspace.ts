export * from './communication-workspace-core'

import type { CommunicationEvent } from '../domain/types'
import { sendOfficialEmail as coreSendOfficialEmail } from './communication-workspace-core'
import {
  beginCommunicationIdempotencyAttempt,
  confirmCommunicationIdempotencyAttempt,
  keepCommunicationIdempotencyPending,
} from './communication-idempotency'

export async function sendOfficialEmail(input: Parameters<typeof coreSendOfficialEmail>[0]): Promise<CommunicationEvent> {
  const attempt = beginCommunicationIdempotencyAttempt({
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    contactId: input.contactId ?? null,
    channel: 'email',
    recipient: input.recipient,
    subject: input.subject,
    body: input.body,
    proposedKey: input.idempotencyKey,
  })
  try {
    const event = await coreSendOfficialEmail({ ...input, idempotencyKey: attempt.key })
    confirmCommunicationIdempotencyAttempt(attempt, event.id)
    return event
  } catch (error) {
    // O resultado de uma falha de rede pode ser ambíguo: preserve a chave para
    // que a próxima tentativa consulte/reuse o mesmo envio no backend.
    keepCommunicationIdempotencyPending(attempt)
    throw error
  }
}
