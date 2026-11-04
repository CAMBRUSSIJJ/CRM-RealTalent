import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../lib/supabase'
import {
  loadCloudTaskNotificationHistory,
  loadCloudReminderReadiness,
  reminderErrorLabel, reminderStatusLabel,
} from './cloud-task-notification-history'

vi.mock('../../lib/supabase', () => ({ getSupabaseClient: vi.fn() }))

const original = [
  { id: 'notice-1', task_id: 'task-visible', assignee_id: 'person-1',
    channel: 'in_app', event_type: 'assigned', status: 'sent',
    scheduled_at: '2026-11-04T10:00:00Z', processed_at: '2026-11-04T10:00:20Z',
    created_at: '2026-11-04T10:00:00Z', last_error: null },
  { id: 'notice-2', task_id: 'task-hidden', assignee_id: 'person-2',
    channel: 'whatsapp', event_type: 'due_soon', status: 'failed',
    scheduled_at: '2026-11-04T12:00:00Z', processed_at: null,
    created_at: '2026-11-04T10:00:00Z', last_error: 'phone_verification_required' },
]

function mockClient(rows: unknown = original, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error }),
  }
  const client = {
    from: vi.fn().mockReturnValue(query),
    functions: { invoke: vi.fn().mockResolvedValue({
      data: { ok: true, databaseReady: true, internalEnabled: false,
        deliveryEnabled: false, whatsappCredentialsPresent: false,
        emailCredentialsPresent: false, schedulerAuthenticated: false,
        appUrlConfigured: true },
      error: null,
    }) },
  }
  vi.mocked(getSupabaseClient).mockReturnValue(client as never)
  return { client, query }
}

describe('Supabase cloud task reminder console', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the authenticated server queue and only shows tasks visible in the CRM', async () => {
    const { client, query } = mockClient()
    const result = await loadCloudTaskNotificationHistory('workspace-1', ['task-visible'])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'notice-1', status: 'sent', channel: 'in_app' })
    expect(client.from).toHaveBeenCalledWith('task_notification_outbox')
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'workspace-1')
    expect(query.limit).toHaveBeenCalledWith(200)
  })

  it('does not query the queue without authorized visible tasks', async () => {
    const { client } = mockClient()
    await expect(loadCloudTaskNotificationHistory('workspace-1', [])).resolves.toEqual([])
    expect(client.from).not.toHaveBeenCalled()
  })

  it('does not disguise missing RLS grants as an empty history', async () => {
    mockClient(null, { code: '42501', message: 'permission denied' })
    await expect(loadCloudTaskNotificationHistory('workspace-1', ['task-visible']))
      .rejects.toThrow(/Sem permissão de leitura/)
  })

  it('reports external provider readiness without claiming delivery', async () => {
    const { client } = mockClient()
    await expect(loadCloudReminderReadiness('workspace-1')).resolves.toMatchObject({
      databaseReady: true, deliveryEnabled: false, emailCredentialsPresent: false,
      whatsappCredentialsPresent: false,
    })
    expect(client.functions.invoke).toHaveBeenCalledWith('task-reminder-readiness',
      { body: { organizationId: 'workspace-1' } })
    expect(reminderStatusLabel.sent).toBe('Processado')
    expect(reminderErrorLabel('phone_verification_required')).toMatch(/não verificado/)
  })

  it('rejects readiness when Supabase does not confirm a successful response', async () => {
    const { client } = mockClient()
    client.functions.invoke.mockResolvedValue({ data: { ok: false }, error: null })
    await expect(loadCloudReminderReadiness('workspace-1')).rejects.toThrow(/Não foi possível/)
  })
})
