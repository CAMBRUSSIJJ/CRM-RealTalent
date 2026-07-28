import { adminClient, assertWorkerSecret, json, recoverStaleJobs, safeMessage } from '../_shared/integration-runtime.ts'
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return json({}, 204)
  try { assertWorkerSecret(request) } catch { return json({ error: 'Não autorizado' }, 401) }
  const admin = adminClient()
  try {
    const recovered = await recoverStaleJobs(admin)
    const now = new Date();const refreshThreshold = new Date(now.getTime() + 10 * 60 * 1000).toISOString();const healthThreshold = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();const subscriptionThreshold=new Date(now.getTime()+24*60*60*1000).toISOString()
    const [{ data: expiring, error: refreshError }, { data: healthAccounts, error: healthError }, {data:providerAccounts,error:providerError},{data:subscriptions,error:subscriptionError}] = await Promise.all([
      admin.from('integration_connected_accounts').select('id,organization_id,provider').eq('status', 'connected').eq('has_credential', true).lte('token_expires_at', refreshThreshold),
      admin.from('integration_connected_accounts').select('id,organization_id,provider,last_tested_at').eq('status', 'connected').eq('has_credential', true).or(`last_tested_at.is.null,last_tested_at.lt.${healthThreshold}`),
      admin.from('integration_connected_accounts').select('id,organization_id,provider').eq('status','connected').eq('has_credential',true).in('provider',['google','microsoft']),
      admin.from('communication_subscriptions').select('id,account_id,provider,status,expiration_at,renew_after').in('provider',['google','microsoft']),
    ])
    if (refreshError) throw refreshError;if (healthError) throw healthError;if(providerError)throw providerError;if(subscriptionError)throw subscriptionError
    let refreshJobsEnqueued = 0;let healthJobsEnqueued = 0;let subscriptionJobsEnqueued=0
    for (const account of expiring || []) { const { error } = await admin.rpc('enqueue_integration_sync_job_system', {p_organization_id: account.organization_id, p_account_id: account.id,p_job_type: 'credential_refresh', p_idempotency_key: `refresh:${account.id}:${now.toISOString().slice(0, 13)}`,p_payload: { source: 'integration-maintenance' }});if (!error) refreshJobsEnqueued += 1 }
    const healthBucket = Math.floor(now.getTime() / (6 * 60 * 60 * 1000))
    for (const account of healthAccounts || []) { const { error } = await admin.rpc('enqueue_integration_sync_job_system', {p_organization_id: account.organization_id, p_account_id: account.id,p_job_type: 'account_health_check', p_idempotency_key: `health:${account.id}:${healthBucket}`,p_payload: { source: 'integration-maintenance' }});if (!error) healthJobsEnqueued += 1 }
    const subscriptionMap=new Map<string,any[]>();for(const item of subscriptions||[]){const current=subscriptionMap.get(item.account_id)||[];current.push(item);subscriptionMap.set(item.account_id,current)}const renewBucket=Math.floor(now.getTime()/(12*60*60*1000))
    for(const account of providerAccounts||[]){const accountSubscriptions=subscriptionMap.get(account.id)||[];const expectedResources=account.provider==='google'?['gmail','google_calendar']:['outlook_mail','outlook_calendar'];const due=expectedResources.some((resource)=>{const subscription=accountSubscriptions.find((item:any)=>item.resource_type===resource);return !subscription||subscription.status!=='active'||!subscription.expiration_at||subscription.expiration_at<=subscriptionThreshold||Boolean(subscription.renew_after&&subscription.renew_after<=now.toISOString())});if(!due)continue;const jobType=account.provider==='google'?'google_subscription_renew':'microsoft_subscription_renew';const {error}=await admin.rpc('enqueue_integration_sync_job_system',{p_organization_id:account.organization_id,p_account_id:account.id,p_job_type:jobType,p_idempotency_key:`subscription:${account.id}:${renewBucket}`,p_payload:{source:'integration-maintenance',resources:expectedResources}});if(!error)subscriptionJobsEnqueued+=1}
    return json({ worker: 'integration-maintenance', recovered, refreshJobsEnqueued, healthJobsEnqueued, subscriptionJobsEnqueued })
  } catch (error) { return json({ error: safeMessage(error) }, 500) }
})
