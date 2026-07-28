import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('')
Deno.serve(async(req)=>{
  const url=new URL(req.url); const validation=url.searchParams.get('validationToken'); if(validation)return new Response(validation,{status:200,headers:{'content-type':'text/plain'}})
  const body=await req.json().catch(()=>({value:[]})) as any; const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as any; let accepted=0
  for(const notice of body.value||[]){
    const {data:subscription}=await admin.from('communication_subscriptions').select('*').eq('external_subscription_id',String(notice.subscriptionId||'')).eq('provider','microsoft').maybeSingle()
    if(!subscription)continue
    if(subscription.verification_secret_hash&&await sha(String(notice.clientState||''))!==subscription.verification_secret_hash)continue
    const jobType=subscription.resource_type==='outlook_mail'?'outlook_mail_pull':'outlook_calendar_pull'
    await admin.from('integration_sync_jobs').upsert({organization_id:subscription.organization_id,account_id:subscription.account_id,provider:'microsoft',job_type:jobType,status:'queued',idempotency_key:`microsoft:${notice.subscriptionId}:${notice.sequenceNumber||notice.resourceData?.id||Date.now()}`,payload:{resource:notice.resource,subscription_id:subscription.id}}, {onConflict:'organization_id,idempotency_key'})
    await admin.from('communication_subscriptions').update({last_notification_at:new Date().toISOString(),status:'active',last_error:null}).eq('id',subscription.id); accepted++
  }
  return new Response(JSON.stringify({accepted}),{status:202,headers:{'content-type':'application/json'}})
})
