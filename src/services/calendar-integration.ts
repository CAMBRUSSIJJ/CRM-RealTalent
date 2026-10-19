import { describeIntegrationBackendError } from './integration-runtime-diagnostics'
import type { CalendarEvent } from '../domain/types'
import { getSupabaseClient } from '../lib/supabase'
import {
  enqueueIntegrationSync,
  loadIntegrationFramework,
  type ConnectedAccount,
  type IntegrationSyncJob,
} from './integration-framework'

const table = (client: unknown, name: string) => (client as { from(name: string): any }).from(name)

export type CalendarSyncDirection = 'two_way' | 'crm_to_provider' | 'provider_to_crm'

export interface ProviderCalendarOption {
  id: string
  name: string
  primary: boolean
  writable: boolean
  selected: boolean
}

export interface CalendarSyncConflictSummary {
  id: string
  accountId: string
  provider: 'google' | 'microsoft'
  resourceType: 'google_calendar' | 'outlook_calendar'
  localResourceId: string | null
  externalResourceId: string
  conflictType: string
  status: string
  localSnapshot: Record<string, unknown>
  externalSnapshot: Record<string, unknown>
  createdAt: string
}

export interface CalendarAccountSyncStatus {
  account: ConnectedAccount
  isDefault: boolean
  calendarId: string
  calendarName: string
  direction: CalendarSyncDirection
  enabled: boolean
  linkedEvents: number
  openConflicts: number
  pendingJobs: number
  failedJobs: number
  subscriptionStatus: string
  subscriptionExpirationAt: string | null
  lastSuccessfulJobAt: string | null
  lastFailedJobAt: string | null
}

export interface CalendarIntegrationDashboard {
  accounts: CalendarAccountSyncStatus[]
  defaultAccountId: string | null
  conflicts: CalendarSyncConflictSummary[]
  hosted: boolean
}

const calendarJob = (job: IntegrationSyncJob) => job.jobType.includes('calendar') || job.jobType.includes('subscription')
const directionFromAccount = (account: ConnectedAccount): CalendarSyncDirection => {
  const value = String(account.metadata?.calendar_sync_direction || 'two_way')
  return value === 'crm_to_provider' || value === 'provider_to_crm' ? value : 'two_way'
}
const syncEnabled = (account: ConnectedAccount) => account.metadata?.calendar_sync_enabled !== false

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

export async function loadCalendarIntegrationDashboard(workspaceId: string): Promise<CalendarIntegrationDashboard> {
  const framework = await loadIntegrationFramework(workspaceId)
  const calendarAccounts = framework.accounts.filter((item) => ['google', 'microsoft'].includes(item.provider))
  const client = getSupabaseClient()
  const defaultAccountId = await resolveDefaultCalendarAccount(workspaceId)
  let links: any[] = []
  let subscriptions: any[] = []
  let conflicts: any[] = []

  if (client) {
    const [linksResult, subscriptionsResult, conflictsResult] = await Promise.all([
      table(client, 'calendar_external_links').select('*').eq('organization_id', workspaceId),
      table(client, 'communication_subscriptions').select('*').eq('organization_id', workspaceId),
      table(client, 'integration_sync_conflicts').select('*').eq('organization_id', workspaceId).in('resource_type', ['google_calendar', 'outlook_calendar']).order('created_at', { ascending: false }).limit(100),
    ])
    if (!linksResult.error) links = linksResult.data || []
    if (!subscriptionsResult.error) subscriptions = subscriptionsResult.data || []
    if (!conflictsResult.error) conflicts = conflictsResult.data || []
  }

  const mappedConflicts: CalendarSyncConflictSummary[] = conflicts.map((row) => ({
    id: String(row.id),
    accountId: String(row.account_id),
    provider: row.resource_type === 'google_calendar' ? 'google' : 'microsoft',
    resourceType: row.resource_type,
    localResourceId: row.local_resource_id ? String(row.local_resource_id) : null,
    externalResourceId: String(row.external_resource_id || ''),
    conflictType: String(row.conflict_type || 'both_updated'),
    status: String(row.status || 'open'),
    localSnapshot: row.local_snapshot && typeof row.local_snapshot === 'object' ? row.local_snapshot : {},
    externalSnapshot: row.external_snapshot && typeof row.external_snapshot === 'object' ? row.external_snapshot : {},
    createdAt: String(row.created_at || ''),
  }))

  const accounts = calendarAccounts.map((account): CalendarAccountSyncStatus => {
    const jobs = framework.jobs.filter((job) => job.accountId === account.id && calendarJob(job))
    const succeeded = jobs.filter((job) => job.status === 'succeeded').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    const failed = jobs.filter((job) => ['failed', 'dead_letter'].includes(job.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    const resourceType = account.provider === 'google' ? 'google_calendar' : 'outlook_calendar'
    const subscription = subscriptions.find((item) => item.account_id === account.id && item.resource_type === resourceType)
    return {
      account,
      isDefault: account.id === defaultAccountId,
      calendarId: String(account.metadata?.calendar_id || (account.provider === 'google' ? 'primary' : 'default')),
      calendarName: String(account.metadata?.calendar_name || (account.provider === 'google' ? 'Agenda principal' : 'Calendário padrão')),
      direction: directionFromAccount(account),
      enabled: syncEnabled(account),
      linkedEvents: links.filter((item) => item.account_id === account.id).length,
      openConflicts: mappedConflicts.filter((item) => item.accountId === account.id && item.status === 'open').length,
      pendingJobs: jobs.filter((job) => ['queued', 'processing', 'retry'].includes(job.status)).length,
      failedJobs: jobs.filter((job) => ['failed', 'dead_letter'].includes(job.status)).length,
      subscriptionStatus: String(subscription?.status || 'not_configured'),
      subscriptionExpirationAt: subscription?.expiration_at ? String(subscription.expiration_at) : null,
      lastSuccessfulJobAt: succeeded?.updatedAt ?? account.lastSyncAt ?? null,
      lastFailedJobAt: failed?.updatedAt ?? null,
    }
  })

  return { accounts, defaultAccountId, conflicts: mappedConflicts, hosted: Boolean(client) }
}

export async function listProviderCalendars(workspaceId: string, accountId: string): Promise<ProviderCalendarOption[]> {
  const client = getSupabaseClient()
  if (!client) return []
  const { data, error } = await client.functions.invoke('integration-calendar-catalog', { body: { organizationId: workspaceId, accountId } })
  if (error) throw new Error(describeIntegrationBackendError('integration-calendar-catalog', error))
  const payload = data as { calendars?: ProviderCalendarOption[]; error?: string }
  if (payload.error) throw new Error(payload.error)
  return Array.isArray(payload.calendars) ? payload.calendars : []
}

export async function saveCalendarIntegrationSettings(
  workspaceId: string,
  accountId: string,
  settings: { calendarId: string; calendarName: string; direction: CalendarSyncDirection; enabled: boolean },
) {
  const client = getSupabaseClient()
  if (!client) throw new Error('A configuração de agenda externa exige o modo hospedado.')
  const { data, error } = await client.rpc('update_calendar_integration_settings', {
    p_organization_id: workspaceId,
    p_account_id: accountId,
    p_calendar_id: settings.calendarId,
    p_calendar_name: settings.calendarName,
    p_sync_direction: settings.direction,
    p_sync_enabled: settings.enabled,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function setDefaultCalendarAccount(workspaceId: string, accountId: string, scope: 'personal' | 'organization' = 'personal') {
  const client = getSupabaseClient()
  if (!client) throw new Error('Conta padrão externa exige o modo hospedado.')
  const capabilities = ['calendar_sync', 'calendar_write'] as const
  for (const capability of capabilities) {
    const { error } = await client.rpc('set_default_integration_account', {
      p_organization_id: workspaceId,
      p_capability: capability,
      p_account_id: accountId,
      p_scope: scope,
    })
    if (error) throw new Error(error.message)
  }
}

export async function queueCalendarPull(workspaceId: string, account: ConnectedAccount) {
  const key = `manual:${Date.now()}`
  return enqueueIntegrationSync(workspaceId, account, account.provider === 'google' ? 'google_calendar_pull' : 'microsoft_calendar_pull', { source: 'calendar_settings', requestKey: key })
}

export async function queueCalendarSubscriptionRenewal(workspaceId: string, account: ConnectedAccount) {
  const key = `subscription:${Date.now()}`
  return enqueueIntegrationSync(workspaceId, account, account.provider === 'google' ? 'google_subscription_renew' : 'microsoft_subscription_renew', { source: 'calendar_settings', requestKey: key })
}

export async function queueCalendarBackfill(workspaceId: string, accountId: string, limit = 200) {
  const client = getSupabaseClient()
  if (!client) throw new Error('A publicação da agenda local exige o modo hospedado.')
  const { data, error } = await client.rpc('enqueue_calendar_backfill', {
    p_organization_id: workspaceId,
    p_account_id: accountId,
    p_limit: Math.max(1, Math.min(500, limit)),
  })
  if (error) throw new Error(error.message)
  return Number(data || 0)
}

export async function resolveCalendarSyncConflict(conflictId: string, resolution: 'keep_local' | 'keep_external' | 'ignore') {
  const client = getSupabaseClient()
  if (!client) throw new Error('A resolução de conflitos exige o modo hospedado.')
  const { data, error } = await client.rpc('resolve_integration_sync_conflict', { p_conflict_id: conflictId, p_resolution: resolution })
  if (error) throw new Error(error.message)
  return Boolean(data)
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
  if (!account || !syncEnabled(account) || directionFromAccount(account) === 'provider_to_crm') return null

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

  const effectiveMutation = mutation === 'update' && event?.status === 'cancelled' ? 'delete' : mutation
  return enqueueIntegrationSync(
    workspaceId,
    account,
    account.provider === 'google' ? 'google_calendar_push' : 'microsoft_calendar_push',
    {
      eventId,
      mutation: effectiveMutation,
      event: event ?? null,
      externalEventId,
      eventVersion: event?.updatedAt ?? null,
      source: 'agenda_mutation',
    },
  )
}
