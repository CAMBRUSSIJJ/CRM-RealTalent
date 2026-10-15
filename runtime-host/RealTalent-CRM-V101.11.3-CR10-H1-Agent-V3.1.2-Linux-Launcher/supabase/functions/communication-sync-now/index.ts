import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'POST, OPTIONS'}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
  if(req.method!=='POST')return json({error:'Método não permitido'},405)
  const auth=req.headers.get('authorization')||''
  const client=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_ANON_KEY')||'',{global:{headers:{Authorization:auth}}}) as any
  const {data:{user}}=await client.auth.getUser(); if(!user)return json({error:'Sessão inválida'},401)
  const body=await req.json().catch(()=>({})) as {organizationId?:string}
  if(!body.organizationId)return json({error:'Organização obrigatória'},400)
  const {data:isMember}=await client.rpc('is_organization_member',{p_organization_id:body.organizationId})
  if(!isMember)return json({error:'Sem acesso à organização'},403)

  const admin=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'') as any
  const {data:accounts,error}=await admin.from('integration_connected_accounts').select('id,provider,status,connection_mode,capabilities').eq('organization_id',body.organizationId).eq('status','connected').eq('connection_mode','live')
  if(error)return json({error:error.message},500)

  const queued:string[]=[]
  for(const account of accounts||[]){
    const jobs=account.provider==='google'?['google_mail_pull','google_subscription_renew']:
      account.provider==='microsoft'?['microsoft_mail_pull','microsoft_subscription_renew']:
      account.provider==='whatsapp_cloud'?['whatsapp_account_sync','whatsapp_template_sync']:[]
    for(const jobType of jobs){
      const key=`manual:${account.id}:${jobType}:${Math.floor(Date.now()/30000)}`
      const {error:enqueueError}=await admin.rpc('enqueue_integration_sync_job_system',{p_organization_id:body.organizationId,p_account_id:account.id,p_job_type:jobType,p_idempotency_key:key,p_payload:{source:'manual_sync',requested_by:user.id}})
      if(!enqueueError)queued.push(`${account.provider}:${jobType}`)
    }
  }

  const workerSecret=Deno.env.get('INTEGRATION_WORKER_SECRET')||''
  const base=Deno.env.get('SUPABASE_URL')||''
  const workers=['integration-google-worker','integration-microsoft-worker','integration-whatsapp-worker']
  const triggered:string[]=[]
  if(workerSecret.length>=32&&base){
    await Promise.all(workers.map(async(name)=>{
      try{
        const response=await fetch(`${base}/functions/v1/${name}`,{method:'POST',headers:{'content-type':'application/json','x-worker-secret':workerSecret},body:'{"limit":25}'})
        if(response.ok)triggered.push(name)
      }catch{/* cron remains fallback */}
    }))
  }
  return json({queued,triggered,accounts:(accounts||[]).length})
})
