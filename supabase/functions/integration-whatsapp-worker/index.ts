import { runProviderWorker } from '../_shared/integration-runtime.ts'
Deno.serve((request) => runProviderWorker(request, 'whatsapp_cloud', 'whatsapp-sync', ['whatsapp_account_sync', 'whatsapp_template_sync']))
