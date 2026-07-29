import { runProviderWorker } from '../_shared/integration-runtime.ts'
Deno.serve((request) => runProviderWorker(request, 'meta', 'meta-sync', ['meta_account_sync', 'meta_leads_pull']))
