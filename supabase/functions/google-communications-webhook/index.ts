import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('')
Deno.serve(async(req)=>{
  const channelId=req.headers.get('x-goog-channel-id')||''; const resourceId=req.headers.get('x-goog-resource-id')||''; const token=req.headers.get('x-goog-channel-token')||''
  if(!channelId||!resourceId)return new Response('ignored',{status:202})
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as any
  const {data:subscription}=await admin.from('communication_subscriptions').select('*').eq('external_subscription_id',channelId).eq('resource_id',resourceId).eq('provider','google').maybeSingle()
  if(!subscription)return new Response('unknown channel',{status:404})
  if(subscription.verification_secret_hash&&await sha(token)!==subscription.verification_secret_hash)return new Response('invalid token',{status:401})
  if(subscription.resource_type==='gmail')return new Response('Use gmail-pubsub-webhook para notificações do Gmail',{status:409})
  const jobType='google_calendar_pull'
  await admin.from('integration_sync_jobs').upsert({organization_id:subscription.organization_id,account_id:subscription.account_id,provider:'google',job_type:jobType,worker_key:'google-sync',status:'queued',idempotency_key:`google:${channelId}:${req.headers.get('x-goog-message-number')||Date.now()}`,payload:{resource_id:resourceId,subscription_id:subscription.id}}, {onConflict:'organization_id,idempotency_key'})
  await admin.from('communication_subscriptions').update({last_notification_at:new Date().toISOString(),status:'active',last_error:null}).eq('id',subscription.id)
  return new Response(null,{status:204})
})
