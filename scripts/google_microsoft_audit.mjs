import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const exists = (relative) => fs.existsSync(path.join(root, relative))
const checks = []
const check = (id, pass, detail) => checks.push({ id, pass: Boolean(pass), detail })

const migration = read('supabase/migrations/202607280003_v100_46_google_microsoft.sql')
const runtime = read('supabase/functions/_shared/integration-runtime.ts')
const dispatch = read('supabase/functions/communication-dispatch-worker/index.ts')
const maintenance = read('supabase/functions/integration-maintenance-worker/index.ts')
const oauth = read('supabase/functions/integration-oauth-callback/index.ts')
const calendarIntegration = read('src/services/calendar-integration.ts')
const navigation = read('src/components/layout/navigation.ts')
const app = read('src/app/app.tsx')
const msWebhook = read('supabase/functions/microsoft-communications-webhook/index.ts')
const gmailWebhook = read('supabase/functions/gmail-pubsub-webhook/index.ts')

check(
  'gmail_incremental',
  runtime.includes('/history?startHistoryId=') && runtime.includes('gmail_history_id') && runtime.includes('newer_than:90d'),
  'Gmail usa historyId e recuperação por sincronização completa.',
)
check(
  'outlook_delta',
  runtime.includes('messages/delta') && runtime.includes('@odata.deltaLink') && runtime.includes('microsoft_delta_link'),
  'Outlook usa deltaLink e paginação.',
)
check(
  'google_calendar_incremental',
  runtime.includes('syncToken') && runtime.includes('google_sync_token') && runtime.includes('response.status === 410'),
  'Google Calendar usa syncToken com reset controlado.',
)
check(
  'microsoft_calendar_delta',
  runtime.includes('calendarView/delta') && runtime.includes('@odata.nextLink'),
  'Microsoft Calendar usa delta e paginação.',
)
check(
  'subscriptions',
  runtime.includes('/users/me/watch') && runtime.includes('/events/watch') && runtime.includes('graph.microsoft.com/v1.0/subscriptions'),
  'Gmail, Google Calendar e Graph possuem subscriptions reais.',
)
check(
  'automatic_renewal',
  maintenance.includes('expectedResources') && maintenance.includes('subscriptionJobsEnqueued') && maintenance.includes('renew_after'),
  'Manutenção renova e-mail e calendário por conta.',
)
check(
  'oauth_bootstrap',
  oauth.includes('integration_account_defaults') && oauth.includes('initial_sync') && oauth.includes('subscription_renew'),
  'OAuth cria defaults e inicia sync/subscriptions.',
)
check(
  'default_account',
  migration.includes('integration_account_defaults')
    && migration.includes('resolve_default_integration_account')
    && calendarIntegration.includes("p_capability: 'calendar_write'"),
  'Conta padrão existe no banco e continua sendo usada pela Agenda.',
)
check(
  'communications_ui_removed',
  !exists('src/features/communications/communications-page.tsx')
    && !exists('src/services/communications.ts')
    && !navigation.includes("route: 'communications'")
    && !app.includes("route === 'communications'"),
  'A Central de Comunicações foi removida da interface sem apagar a infraestrutura técnica histórica.',
)
check(
  'calendar_bridge_preserved',
  calendarIntegration.includes('queueCalendarMutation')
    && calendarIntegration.includes('calendar_external_links')
    && calendarIntegration.includes('google_calendar_push')
    && calendarIntegration.includes('microsoft_calendar_push'),
  'Agenda continua enfileirando alterações para Google e Microsoft sem depender da tela removida.',
)
check(
  'conflicts_backend',
  migration.includes('integration_sync_conflicts') && runtime.includes('registerCalendarConflict'),
  'Conflitos de calendário continuam detectados e persistidos no backend.',
)
check(
  'html_email_backend',
  migration.includes('body_html') && dispatch.includes("contentType:html?'HTML':'Text'") && dispatch.includes('multipart/alternative'),
  'Infraestrutura de e-mail HTML permanece disponível no backend, embora a tela de Comunicações tenha sido removida.',
)
check(
  'templates_backend',
  migration.includes('email_templates') && migration.includes('subject_template') && migration.includes('body_html_template') && migration.includes('body_text_template'),
  'Templates de e-mail permanecem versionados no banco para compatibilidade e uso futuro.',
)
check(
  'attachments_backend',
  migration.includes('communication_attachments')
    && migration.includes('O total de anexos deve ter no máximo 10 MB')
    && dispatch.includes('#microsoft.graph.fileAttachment')
    && dispatch.includes('multipart/mixed'),
  'Infraestrutura de anexos permanece protegida por limites e transporte nos dois provedores.',
)
check(
  'gmail_pubsub',
  gmailWebhook.includes('message.data') && gmailWebhook.includes('history_id') && gmailWebhook.includes("url.searchParams.get('token')"),
  'Gmail Pub/Sub valida segredo e enfileira historyId.',
)
check(
  'microsoft_lifecycle',
  msWebhook.includes('reauthorizationRequired') && msWebhook.includes('subscriptionRemoved') && msWebhook.includes("lifecycleEvent==='missed'"),
  'Lifecycle do Graph recupera subscription e notificações perdidas.',
)
check(
  'account_capabilities',
  migration.includes("'mail_sync',true,'calendar_sync',true") && oauth.includes('mail_sync:true') && oauth.includes('calendar_sync:true'),
  'Capacidades de sincronização são explícitas.',
)

const failed = checks.filter((item) => !item.pass)
const pkg = JSON.parse(read('package.json'))
const label = `V${pkg.version.replace(/\.0$/, '').replaceAll('.', '-')}`
const report = {
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  scope: 'Infraestrutura Google/Microsoft preservada; Central de Comunicações removida da interface.',
  checks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  results: checks,
}
fs.writeFileSync(path.join(root, `GOOGLE-MICROSOFT-AUDIT-${label}.json`), `${JSON.stringify(report, null, 2)}\n`)
console.log(`${report.passed}/${report.checks} verificações Google e Microsoft aprovadas.`)
if (failed.length) {
  for (const item of failed) console.error(`FALHA ${item.id}: ${item.detail}`)
  process.exit(1)
}
