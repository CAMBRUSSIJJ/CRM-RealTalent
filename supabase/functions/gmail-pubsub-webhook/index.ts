import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})
const decode=(value:string)=>{try{return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)))) as {emailAddress?:string;historyId?:string}}catch{return{}}}
Deno.serve(async(request)=>{
  if(request.method!=='POST')return json({error:'Método não permitido'},405)
  const url=new URL(request.url);const expected=Deno.env.get('GMAIL_PUBSUB_WEBHOOK_SECRET')||'';const supplied=request.headers.get('x-gmail-pubsub-secret')||url.searchParams.get('token')||''
  if(expected.length<32||supplied!==expected)return json({error:'Não autorizado'},401)
  const body=await request.json().catch(()=>({})) as any;const message=body.message||{};const decoded=decode(String(message.data||''));const email=String(decoded.emailAddress||'').toLowerCase()
  if(!email||!decoded.historyId)return json({error:'Notificação Gmail inválida'},400)
  const admin=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'') as any
  const {data:accounts,error}=await admin.from('integration_connected_accounts').select('id,organization_id,provider,metadata').eq('provider','google').eq('status','connected')
  if(error)return json({error:error.message},500)
  const account=(accounts||[]).find((item:any)=>String(item.metadata?.email||'').toLowerCase()===email)
  if(!account)return json({accepted:false,reason:'account_not_found'},202)
  await admin.from('integration_sync_jobs').upsert({organization_id:account.organization_id,account_id:account.id,provider:'google',job_type:'google_mail_pull',worker_key:'google-sync',status:'queued',idempotency_key:`gmail:${message.messageId||decoded.historyId}`,payload:{history_id:decoded.historyId,email_address:email,pubsub_message_id:message.messageId||null}}, {onConflict:'organization_id,idempotency_key'})
  await admin.from('communication_subscriptions').update({last_notification_at:new Date().toISOString(),status:'active',last_error:null,metadata:{history_id:decoded.historyId,email}}).eq('account_id',account.id).eq('resource_type','gmail_mailbox')
  return json({accepted:true},202)
})
