import { runProviderWorker } from '../_shared/integration-runtime.ts'
Deno.serve((request) => runProviderWorker(request, 'google', 'google-sync', [
  'google_mail_pull', 'google_calendar_pull', 'google_calendar_push', 'google_subscription_renew',
]))
