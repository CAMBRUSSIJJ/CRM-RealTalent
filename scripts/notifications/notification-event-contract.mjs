/**
 * Communication & Automations: central event contract.
 * The local QR adapter implements task events; future cloud transports can
 * consume the same envelope without coupling CRM features to a provider.
 * Event records must never contain access tokens or provider credentials.
 */
export const NOTIFICATION_EVENT_TYPES = Object.freeze([
  'task.assigned',
  'task.due_soon',
  'task.reminder_requested',
  'meeting.scheduled',
  'opportunity.assigned',
  'proposal.updated',
])

export function notificationEvent({ type, workspaceId, entityId, recipientId, occurredAt, payload = {} }) {
  if (!NOTIFICATION_EVENT_TYPES.includes(type)) throw new Error('unsupported_notification_event_type')
  const id = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,170}$/.test(value)
  if (!id(workspaceId) || !id(entityId) || !id(recipientId)) throw new Error('invalid_notification_entity')
  const at = occurredAt || new Date().toISOString()
  if (!Number.isFinite(Date.parse(at))) throw new Error('invalid_notification_event_time')
  return Object.freeze({
    type, workspaceId, entityId, recipientId, occurredAt:at,
    payload:Object.freeze({ ...payload }),
  })
}

export const taskNotificationEvent = (task, workspaceId, type, at) =>
  notificationEvent({ type, workspaceId, entityId:task.id,
    recipientId:task.assigneeId, occurredAt:at,
    payload:{ title:String(task.title || 'Tarefa').slice(0,140), dueAt:task.dueAt || null } })
