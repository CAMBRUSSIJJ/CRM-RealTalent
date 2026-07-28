import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'POST, OPTIONS'}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json'}})
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
  if(req.method!=='POST')return json({error:'Método não permitido'},405)
  const auth=req.headers.get('authorization')||''
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}})
  const {data:{user}}=await client.auth.getUser(); if(!user)return json({error:'Sessão inválida'},401)
  const body=await req.json().catch(()=>({})) as {organizationId?:string;leadId?:string;accountId?:string;channel?:string;recipient?:string;subject?:string;body?:string;idempotencyKey?:string}
  if(!body.organizationId||!body.leadId||!body.accountId||!body.channel||!body.recipient||!body.body)return json({error:'Dados incompletos'},400)
  const {data:eventId,error}=await client.rpc('enqueue_official_communication',{p_organization_id:body.organizationId,p_lead_id:body.leadId,p_account_id:body.accountId,p_channel:body.channel,p_recipient:body.recipient,p_subject:body.subject||'',p_body:body.body,p_idempotency_key:body.idempotencyKey||crypto.randomUUID()})
  if(error)return json({error:error.message},400)
  const {data:event,event:errorEvent}=await (client as any).from('communication_events').select('*').eq('id',eventId).single()
  if(errorEvent||!event)return json({error:errorEvent?.message||'Evento não encontrado'},500)
  return json({event:{id:event.id,workspaceId:event.organization_id,leadId:event.lead_id,accountId:event.account_id,threadId:event.thread_id,channel:event.channel,direction:event.direction,eventType:event.event_type,status:event.status,externalMessageId:event.external_message_id,senderAddress:event.sender_address,recipientAddresses:event.recipient_addresses,subject:event.subject,bodyText:event.body_text,occurredAt:event.occurred_at,metadata:event.metadata,createdAt:event.created_at}})
})
