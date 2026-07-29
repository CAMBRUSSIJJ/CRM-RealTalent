import { runProviderWorker } from '../_shared/integration-runtime.ts'
Deno.serve((request) => runProviderWorker(request, 'microsoft', 'microsoft-sync', [
  'microsoft_mail_pull', 'microsoft_calendar_pull', 'microsoft_calendar_push', 'microsoft_subscription_renew',
]))
