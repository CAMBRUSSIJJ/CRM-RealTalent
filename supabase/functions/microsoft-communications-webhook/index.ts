import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('')
Deno.serve(async(req)=>{
  const url=new URL(req.url); const validation=url.searchParams.get('validationToken'); if(validation)return new Response(validation,{status:200,headers:{'content-type':'text/plain'}})
  if(req.method!=='POST')return new Response(JSON.stringify({error:'Método não permitido'}),{status:405,headers:{'content-type':'application/json'}})
  const body=await req.json().catch(()=>({value:[]})) as any; const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as any; let accepted=0;let lifecycle=0
  for(const notice of body.value||[]){
    const {data:subscription}=await admin.from('communication_subscriptions').select('*').eq('external_subscription_id',String(notice.subscriptionId||'')).eq('provider','microsoft').maybeSingle()
    if(!subscription)continue
    if(subscription.verification_secret_hash&&await sha(String(notice.clientState||''))!==subscription.verification_secret_hash)continue
    const lifecycleEvent=String(notice.lifecycleEvent||'')
    if(lifecycleEvent){
      lifecycle+=1;const renewalNeeded=['reauthorizationRequired','subscriptionRemoved','missed'].includes(lifecycleEvent)
      await admin.from('communication_subscriptions').update({status:renewalNeeded?'renewal_due':'active',last_error:renewalNeeded?`Microsoft lifecycle: ${lifecycleEvent}`:null,metadata:{...(subscription.metadata||{}),last_lifecycle_event:lifecycleEvent}}).eq('id',subscription.id)
      if(renewalNeeded){
        const syncType=subscription.resource_type==='outlook_mail'?'microsoft_mail_pull':'microsoft_calendar_pull'
        await admin.rpc('enqueue_integration_sync_job_system',{p_organization_id:subscription.organization_id,p_account_id:subscription.account_id,p_job_type:'microsoft_subscription_renew',p_idempotency_key:`ms-lifecycle:${subscription.id}:${lifecycleEvent}:${Date.now()}`,p_payload:{source:'microsoft_lifecycle',subscription_id:subscription.id,lifecycle_event:lifecycleEvent}})
        await admin.rpc('enqueue_integration_sync_job_system',{p_organization_id:subscription.organization_id,p_account_id:subscription.account_id,p_job_type:syncType,p_idempotency_key:`ms-lifecycle-sync:${subscription.id}:${Date.now()}`,p_payload:{source:'microsoft_lifecycle',full_recovery:lifecycleEvent==='missed'}})
      }
      continue
    }
    const jobType=subscription.resource_type==='outlook_mail'?'microsoft_mail_pull':'microsoft_calendar_pull'
    await admin.from('integration_sync_jobs').upsert({organization_id:subscription.organization_id,account_id:subscription.account_id,provider:'microsoft',job_type:jobType,worker_key:'microsoft-sync',status:'queued',idempotency_key:`microsoft:${notice.subscriptionId}:${notice.sequenceNumber||notice.resourceData?.id||Date.now()}`,payload:{resource:notice.resource,subscription_id:subscription.id,change_type:notice.changeType||null}}, {onConflict:'organization_id,idempotency_key'})
    await admin.from('communication_subscriptions').update({last_notification_at:new Date().toISOString(),status:'active',last_error:null}).eq('id',subscription.id); accepted++
  }
  return new Response(JSON.stringify({accepted,lifecycle}),{status:202,headers:{'content-type':'application/json'}})
})
