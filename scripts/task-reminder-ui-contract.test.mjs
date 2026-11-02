import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const migration = source('supabase/migrations/202611020003_task_reminder_rules_and_history.sql')
const work = source('src/services/work-management.ts')
const modal = source('src/features/tasks/task-modal.tsx')
const editor = source('src/features/tasks/task-reminder-editor.tsx')
const tasks = source('src/features/tasks/tasks-page.tsx')
const pref = source('src/features/settings/task-reminder-preferences-panel.tsx')

test('task row stores all reminder settings in a single atomic upsert', () => {
  for (const key of ['reminder_enabled','reminder_on_assignment','reminder_channels','reminder_offsets_minutes','reminder_custom_minutes']) {
    assert.ok(migration.includes('add column if not exists ' + key), key)
    assert.ok(work.includes(key + ':'), key)
  }
  assert.ok(work.includes('client.from(\'work_tasks\').upsert(payload)'))
})

test('assignment and due reminders use selected channels, times and sender permissions', () => {
  assert.ok(migration.includes('foreach one_channel in array new.reminder_channels loop'))
  assert.ok(migration.includes('if changed_assignment and new.reminder_on_assignment then'))
  assert.ok(migration.includes('new.due_at - (one_offset * interval \'1 minute\')'))
  assert.ok(migration.includes("status='cancelled'"))
  assert.ok(migration.includes('status in (\'todo\',\'in_progress\',\'blocked\')'))
  assert.ok(migration.includes('new.due_at <= now() + (one_offset * interval'))
})

test('history access follows existing task visibility RLS, read-only', () => {
  assert.ok(migration.includes('task_notification_outbox_visible_task'))
  assert.ok(migration.includes('on public.task_notification_outbox for select to authenticated'))
  assert.ok(migration.includes('from public.work_tasks t'))
  assert.ok(migration.includes('revoke all on public.task_notification_outbox from anon, authenticated'))
  assert.ok(!migration.includes('grant insert, update'))
  assert.ok(!migration.includes('provider_message_id,'))
  assert.ok(!migration.includes('last_error,'))
})

test('task editor includes configurable channels, intervals, defaults and history', () => {
  for (const phrase of ['No CRM','WhatsApp oficial','E-mail','1 dia antes','1 hora antes','15 minutos antes','antecedência personalizada','Ao atribuir a tarefa','Histórico de notificações']) {
    assert.ok(editor.includes(phrase), phrase)
  }
  assert.ok(modal.includes('<TaskReminderEditor'))
  assert.ok(modal.includes('reminderEnabled: reminders.enabled'))
  assert.ok(modal.includes('reminderCustomMinutes: reminders.customMinutes'))
})

test('QR test moved from Tasks main header to Settings without losing its safeguards', () => {
  assert.ok(!tasks.includes('Testar lembrete WhatsApp'))
  assert.ok(tasks.includes('repositoryMode={repositoryMode}'))
  assert.ok(pref.includes('<TaskReminderTestLauncher'))
  assert.ok(source('src/features/settings/task-reminder-test-launcher.tsx').includes('<TaskWhatsAppTestModal'))
})

test('external channels remain opt-in, and local mode never pretends to send automatically', () => {
  assert.ok(editor.includes('conexão por QR'))
  assert.ok(editor.includes('envio automático exige Supabase'))
  const worker = source('supabase/functions/task-reminder-dispatch/index.ts')
  assert.ok(worker.includes("TASK_REMINDER_DELIVERY_ENABLED"))
  assert.ok(worker.includes('task_notification_verified_phones'))
  assert.ok(worker.includes('whatsapp_consented_at'))
})
