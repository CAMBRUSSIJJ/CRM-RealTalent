import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/202611020001_task_assignee_notification_outbox.sql','utf8')
const worker = readFileSync('supabase/functions/task-reminder-dispatch/index.ts','utf8')
const ui = readFileSync('src/features/settings/task-reminder-preferences-panel.tsx','utf8')
test('a task assignment creates a durable queue, never direct outbound messages from the browser', () => {
  assert.match(migration, /after insert or update of assignee_id,due_at,status/i)
  assert.match(migration, /unique \(event_key, channel\)/i)
  assert.match(migration, /status = 'pending'/i)
  assert.match(migration, /status = 'cancelled'/i)
})
test('queue and verified phone records are inaccessible to browser roles', () => {
  assert.match(migration,/alter table public\.task_notification_outbox enable row level security/i)
  assert.match(migration,/revoke all on public\.task_notification_outbox from public, anon, authenticated/i)
  assert.match(migration,/revoke all on public\.task_notification_verified_phones from public, anon, authenticated/i)
  assert.match(worker,/eq\('status', 'pending'\)\.select\('\*'\)/)
})
test('recipient opts in before WhatsApp can be delivered', () => {
  assert.match(worker,/whatsapp_consented_at/)
  assert.match(worker,/task_notification_verified_phones/)
  assert.match(worker,/verified\.phone_e164 !== prefs\.whatsapp_phone_e164/)
  assert.match(worker,/type: 'template'/)
  assert.match(ui,/Autorizo o RealTalent/)
  assert.doesNotMatch(ui,/META_TOKEN|SERVICE_ROLE_KEY/)
})
test('email is dispatched with stable idempotency key', () => {
  assert.match(worker,/'Idempotency-Key': String\(job.id\)/)
  assert.match(worker,/email_confirmed_at/)
  assert.match(worker,/prefs\?\.email_enabled/)
})
test('no cron call is accepted without nonempty server-only secret', () => {
  assert.match(worker,/cronSecret\.length < 32/)
  assert.match(worker,/supplied !== cronSecret/)
  assert.doesNotMatch(worker,/access-control-allow-origin/i)
})

test('internal reminders can be enabled without enabling WhatsApp or email', () => {
  assert.match(worker, /TASK_REMINDER_INTERNAL_ENABLED/)
  assert.match(worker, /TASK_REMINDER_DELIVERY_ENABLED/)
  assert.match(worker, /if \(!externalEnabled\) pending = pending\.eq\('channel', 'in_app'\)/)
  assert.ok(worker.indexOf("if (supplied !== cronSecret)") < worker.indexOf("const internalEnabled"), 'auth must precede readiness')
  assert.match(worker, /stale_reminder_expired/)
})
test('CRM notification center actually reads assignee reminders from the server', () => {
  const center = readFileSync('src/features/experience/notification-center.tsx', 'utf8')
  assert.match(center, /from\('seller_notifications'\)/)
  assert.match(center, /eq\('source_type', 'task-reminder'\)/)
  assert.match(center, /eq\('user_id', user\.id\)/)
})
