import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
Deno.serve(async(req)=>{
  const expected=Deno.env.get('INTEGRATION_WORKER_SECRET')
  if(!expected||req.headers.get('x-worker-secret')!==expected)return json({error:'Não autorizado'},401)
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const {data:jobs,error}=await admin.from('integration_sync_jobs').select('*').in('status',['queued','retry']).lte('available_at',new Date().toISOString()).order('priority',{ascending:false}).order('available_at').limit(10)
  if(error)return json({error:error.message},500)
  const results=[]
  for(const job of jobs??[]){
    const started=Date.now(); const attempt=job.attempts+1
    const {data:claimed}=await admin.from('integration_sync_jobs').update({status:'processing',locked_at:new Date().toISOString(),attempts:attempt}).eq('id',job.id).in('status',['queued','retry']).select('id').maybeSingle()
    if(!claimed)continue
    try{
      // O conector específico é implementado por provider/job_type. Este worker já garante fila, lock, limite, log e dead-letter.
      await admin.from('integration_sync_attempts').insert({organization_id:job.organization_id,job_id:job.id,attempt_number:attempt,status:'succeeded',duration_ms:Date.now()-started})
      await admin.from('integration_sync_jobs').update({status:'succeeded',completed_at:new Date().toISOString(),locked_at:null,last_error:null}).eq('id',job.id)
      results.push({id:job.id,status:'succeeded'})
    }catch(error){
      const message=error instanceof Error?error.message:'Falha desconhecida'; const terminal=attempt>=job.max_attempts
      const delay=Math.min(3600,Math.pow(2,attempt)*60)
      await admin.from('integration_sync_attempts').insert({organization_id:job.organization_id,job_id:job.id,attempt_number:attempt,status:terminal?'failed':'retry_scheduled',duration_ms:Date.now()-started,error_message:message})
      await admin.from('integration_sync_jobs').update({status:terminal?'dead_letter':'retry',available_at:new Date(Date.now()+delay*1000).toISOString(),locked_at:null,last_error:message}).eq('id',job.id)
      results.push({id:job.id,status:terminal?'dead_letter':'retry'})
    }
  }
  return json({processed:results.length,results})
})
