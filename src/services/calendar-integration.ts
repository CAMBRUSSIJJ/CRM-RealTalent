import type { CalendarEvent } from '../domain/types'
import { getSupabaseClient } from '../lib/supabase'
import { enqueueIntegrationSync, loadIntegrationFramework } from './integration-framework'

const table = (client: unknown, name: string) => (client as { from(name: string): any }).from(name)

const resolveDefaultCalendarAccount = async (workspaceId: string) => {
  const client = getSupabaseClient()
  if (!client) return null
  const { data, error } = await client.rpc('resolve_default_integration_account', {
    p_organization_id: workspaceId,
    p_capability: 'calendar_write',
  })
  if (error) return null
  return typeof data === 'string' ? data : null
}

/** Mantém a Agenda integrada sem expor uma Central de Comunicações no CRM. */
export async function queueCalendarMutation(
  workspaceId: string,
  eventId: string,
  mutation: 'create' | 'update' | 'delete',
  event?: CalendarEvent | null,
) {
  const framework = await loadIntegrationFramework(workspaceId)
  const defaultId = await resolveDefaultCalendarAccount(workspaceId)
  const account = framework.accounts.find((item) => item.id === defaultId && item.status === 'connected')
    ?? framework.accounts.find((item) => item.status === 'connected' && ['google', 'microsoft'].includes(item.provider))
  if (!account) return null

  let externalEventId: string | null = null
  const client = getSupabaseClient()
  if (client) {
    const { data } = await table(client, 'calendar_external_links')
      .select('external_event_id')
      .eq('organization_id', workspaceId)
      .eq('event_id', eventId)
      .eq('account_id', account.id)
      .maybeSingle()
    externalEventId = data?.external_event_id ?? null
  }

  return enqueueIntegrationSync(
    workspaceId,
    account,
    account.provider === 'google' ? 'google_calendar_push' : 'microsoft_calendar_push',
    { eventId, mutation, event: event ?? null, externalEventId },
  )
}
