import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const sql=fs.readFileSync('supabase/migrations/202611050001_task_reminders_railway_qr_bridge.sql','utf8')
const bridge=fs.readFileSync('runtime-host/deploy/cloud-runtime/task-reminder-qr-bridge.mjs','utf8')
const supervisor=fs.readFileSync('runtime-host/deploy/cloud-runtime/cloud-runtime-supervisor.mjs','utf8')

test('only a private cron with consent and confirmed number can enqueue QR messages',()=>{
  assert.match(sql,/rt_task_reminders\.dispatch_railway_qr_notifications\(\)/)
  assert.match(sql,/whatsapp_consented_at/)
  assert.match(sql,/task_notification_verified_phones/)
  assert.match(sql,/recipient_phone_missing/)
  assert.match(sql,/directory_phone_change_requires_employee_reconsent/)
  assert.match(sql,/v_verified_at is null/)
  assert.match(sql,/for update of o skip locked/)
  assert.match(sql,/channel='whatsapp' and o\.status='pending'/)
  assert.match(sql,/qr_delivery_config/)
  assert.match(sql,/values\(true,false\)/)
})
test('receipt is reconciled as acceptance and unknowns are blocked, never automatically resent',()=>{
  assert.match(sql,/net\.http_post/)
  assert.match(sql,/provider_message_id=/)
  assert.match(sql,/state'='accepted_by_gateway'/)
  assert.match(sql,/delivery_outcome_unknown_requires_review/)
  assert.match(sql,/status='blocked'/)
  assert.doesNotMatch(sql,/where o\.status='failed' and o\.channel='whatsapp'/)
})
test('cron keeps existing internal worker untouched and QR client cannot update private rows',()=>{
  assert.match(sql,/realtalent-task-qr-dispatch/)
  assert.match(sql,/realtalent-task-qr-settle/)
  assert.doesNotMatch(sql,/unschedule\(/)
  assert.match(sql,/revoke all on function rt_task_reminders\.dispatch_railway_qr_notifications\(\) from public,anon,authenticated;/)
  assert.match(sql,/revoke all on rt_task_reminders\.qr_delivery_requests from public, anon, authenticated;/)
})
test('Railway route validates separate secret and QR workspace before sending',()=>{
  assert.match(supervisor,/handleTaskReminderQrBridge\(req, res\)/)
  assert.match(bridge,/taskBridgeAuthorized/)
  assert.match(bridge,/state\.payload\.state !== 'connected'/)
  assert.match(bridge,/idempotencyKey: `task-reminder-qr:\$\{input\.jobId\}`/)
})
