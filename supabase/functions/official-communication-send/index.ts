import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type, x-client-info, x-supabase-api-version','access-control-allow-methods':'POST, OPTIONS'}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json'}})
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
  if(req.method!=='POST')return json({error:'Método não permitido'},405)
  const auth=req.headers.get('authorization')||''
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}})
  const {data:{user}}=await client.auth.getUser(); if(!user)return json({error:'Sessão inválida'},401)
  const body=await req.json().catch(()=>({})) as any
  if(!body.organizationId||!body.leadId||!body.channel||!body.recipient)return json({error:'Dados incompletos'},400)
  let eventId:string|null=null;let error:any=null
  if(body.channel==='email'){
    const result=await client.rpc('enqueue_advanced_email',{p_organization_id:body.organizationId,p_lead_id:body.leadId,p_account_id:body.accountId||null,p_recipient:body.recipient,p_cc:Array.isArray(body.cc)?body.cc:[],p_bcc:Array.isArray(body.bcc)?body.bcc:[],p_subject:body.subject||'',p_body_text:body.body||'',p_body_html:body.bodyHtml||'',p_reply_to_external_message_id:body.replyToExternalMessageId||null,p_template_id:body.templateId||null,p_attachments:Array.isArray(body.attachments)?body.attachments:[],p_idempotency_key:body.idempotencyKey||crypto.randomUUID()});eventId=result.data;error=result.error
  }else{
    if(!body.accountId||!body.body)return json({error:'Conta e mensagem são obrigatórias'},400)
    const result=await client.rpc('enqueue_official_communication',{p_organization_id:body.organizationId,p_lead_id:body.leadId,p_account_id:body.accountId,p_channel:body.channel,p_recipient:body.recipient,p_subject:body.subject||'',p_body:body.body,p_idempotency_key:body.idempotencyKey||crypto.randomUUID()});eventId=result.data;error=result.error
  }
  if(error)return json({error:error.message},400)
  // Agendar envio: a mensagem fica na fila e só sai a partir do horário escolhido.
  const scheduledAt=typeof body.scheduledAt==='string'?new Date(body.scheduledAt):null
  const scheduled=Boolean(scheduledAt&&!Number.isNaN(scheduledAt.getTime())&&scheduledAt.getTime()>Date.now()+60_000)
  if(scheduledAt&&!scheduled&&body.scheduledAt)return json({error:'Escolha um horário pelo menos 2 minutos à frente.'},400)
  if(scheduled&&scheduledAt!.getTime()>Date.now()+90*86_400_000)return json({error:'O agendamento pode ser de até 90 dias.'},400)
  if(scheduled||body.track===true){
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as any
    const {data:current}=await admin.from('communication_events').select('metadata').eq('id',eventId).single()
    await admin.from('communication_events').update({metadata:{...(current?.metadata||{}),...(scheduled?{scheduled_for:scheduledAt!.toISOString()}:{}),...(body.track===true?{tracking:true}:{})}}).eq('id',eventId)
    const {data:outbox}=await admin.from('communication_outbox').select('payload').eq('event_id',eventId).maybeSingle()
    await admin.from('communication_outbox').update({...(scheduled?{available_at:scheduledAt!.toISOString()}:{}),payload:{...(outbox?.payload||{}),...(body.track===true?{track:true}:{})}}).eq('event_id',eventId).in('status',['queued','retry'])
  }
  const workerSecret=scheduled?'':Deno.env.get('COMMUNICATION_WORKER_SECRET')||''
  const base=Deno.env.get('SUPABASE_URL')||''
  let dispatchTriggered=false
  if(workerSecret.length>=32&&base){
    try{
      const response=await fetch(`${base}/functions/v1/communication-dispatch-worker`,{method:'POST',headers:{'content-type':'application/json','x-worker-secret':workerSecret},body:'{"limit":25}'})
      dispatchTriggered=response.ok
    }catch{/* pg_cron remains the fallback */}
  }
  const {data:event,error:errorEvent}=await (client as any).from('communication_events').select('*').eq('id',eventId).single()
  if(errorEvent||!event)return json({error:errorEvent?.message||'Evento não encontrado'},500)
  return json({dispatchTriggered,scheduledFor:scheduled?scheduledAt!.toISOString():null,event:{id:event.id,workspaceId:event.organization_id,leadId:event.lead_id,contactId:event.contact_id||null,accountId:event.account_id,threadId:event.thread_id,channel:event.channel,direction:event.direction,eventType:event.event_type,status:event.status,externalMessageId:event.external_message_id,internetMessageId:event.internet_message_id,replyToExternalMessageId:event.reply_to_external_message_id,senderAddress:event.sender_address,recipientAddresses:event.recipient_addresses,subject:event.subject,bodyText:event.body_text,bodyHtml:event.body_html,hasAttachments:event.has_attachments,occurredAt:event.occurred_at,metadata:event.metadata,createdAt:event.created_at}})
})
