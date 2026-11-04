import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(path, 'utf8')
const tasks = read('src/features/tasks/tasks-page.tsx')
const cloud = read('src/features/communications-automations/cloud-task-automation-center.tsx')
const local = read('src/features/communications-automations/communication-automation-center.tsx')
const badge = read('src/components/layout/topbar.tsx')
const bell = read('src/features/experience/notification-center.tsx')
const migration = read('supabase/migrations/202611040001_task_notification_history_read_grant.sql')

test('Tasks uses Supabase console only on hosted mode while preserving the local QR console', () => {
  assert.match(tasks, /repositoryMode === 'local'/)
  assert.match(tasks, /<CloudTaskAutomationCenter/)
  assert.match(tasks, /<CommunicationAutomationCenter/)
  assert.match(cloud, /loadCloudTaskNotificationHistory/)
  assert.match(cloud, /loadCloudReminderReadiness/)
  assert.match(local, /loadGatewayLocalTaskAutoHistory/)
})

test('Opening a dashboard does not send messages or claim delivery to WhatsApp', () => {
  assert.doesNotMatch(cloud, /sendGatewayCommunication|scheduleGatewayLocalTaskAuto|sendOwnTaskWhatsAppTest|\.from\('task_notification_outbox'\)\.insert/)
  assert.match(cloud, /Aceito pelo provedor; entrega e leitura não verificadas/)
  assert.match(cloud, /Nenhum aviso é enviado ao abrir esta tela/)
})

test('Topbar includes unread task notification count and immediate read refresh', () => {
  assert.match(badge, /unreadTaskNotifications/)
  assert.match(badge, /'seller_notifications'/)
  assert.match(badge, /'task-reminder'/)
  assert.match(bell, /realtalent:task-notification-updated/)
})

test('migration only grants selected columns under existing RLS; never grants mutation rights', () => {
  assert.match(migration, /GRANT SELECT \(/)
  assert.match(migration, /TO authenticated;/)
  const executable = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
  assert.doesNotMatch(executable, /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)/i)
})
