import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8')
const teamSource = read('src/features/teams/team-notification-contacts.tsx')
const teamsPage = read('src/features/teams/teams-page.tsx')
const settings = read('src/features/settings/task-reminder-preferences-panel.tsx')
const worker = read('supabase/functions/task-reminder-dispatch/index.ts')
const migration = read('supabase/migrations/202611020004_team_member_notification_contacts.sql')
const match = teamSource.match(/export function normalizeTeamWhatsApp[\s\S]*?\n\}/)
assert.ok(match, 'phone normalizer should remain a small pure function')
const normalize = Function(match[0]
  .replace('export function', 'function')
  .replace('(raw: string): string | null', '(raw)')
  + ';return normalizeTeamWhatsApp;')()

test('team phone normalization accepts Brazilian and international E.164 numbers', () => {
  assert.equal(normalize('+55 53 99999-9999'), '+5553999999999')
  assert.equal(normalize('53 99999-9999'), '+5553999999999')
  assert.equal(normalize('5553999999999'), '+5553999999999')
  assert.equal(normalize('+1 (415) 555-0100'), '+14155550100')
  assert.equal(normalize(''), null)
  assert.equal(normalize('1234'), null)
  assert.equal(normalize('telefone invalido'), null)
  assert.equal(normalize('++55 53 99999-9999'), null)
})

test('a team contact does not bypass employee opt-in or phone verification', () => {
  assert.match(worker, /directoryPhone_change_requires_employee_reconsent|directory_phone_change_requires_employee_reconsent/)
  assert.ok(worker.includes('recipientPhone !== prefs.whatsapp_phone_e164'))
  assert.ok(worker.includes('verified.phone_e164 !== recipientPhone'))
  assert.ok(worker.includes('!prefs?.whatsapp_enabled || !prefs.whatsapp_consented_at'))
  assert.ok(worker.includes("env('TASK_REMINDER_DELIVERY_ENABLED') === 'true'"))
  assert.ok(worker.includes("if (!token || !/^"))
})

test('phone directory obeys tenant-scoped access controls', () => {
  assert.ok(migration.includes('references public.organization_members(organization_id, user_id)'))
  assert.ok(migration.includes('enable row level security'))
  assert.ok(migration.includes("user_id = (select auth.uid())"))
  assert.ok(migration.includes('public.is_organization_admin(organization_id)'))
  assert.ok(migration.includes('with check ('))
  assert.ok(!migration.includes('grant delete'))
})

test('one Teams contact is reused by task settings without typing each task', () => {
  assert.ok(teamsPage.includes('<TeamNotificationContacts'))
  assert.ok(settings.includes("from('team_member_notification_contacts')"))
  assert.ok(teamSource.includes("from('team_member_notification_contacts')"))
  assert.ok(settings.includes('phoneChanged ? null'))
  assert.ok(teamSource.includes('O cadastro não envia mensagens'))
})
