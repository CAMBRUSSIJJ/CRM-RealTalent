import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
Deno.serve(async(req)=>{
  const url=new URL(req.url)
  if(req.method==='GET'){
    const mode=url.searchParams.get('hub.mode'),token=url.searchParams.get('hub.verify_token'),challenge=url.searchParams.get('hub.challenge')
    return mode==='subscribe'&&token===Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN')?new Response(challenge||'',{status:200}):new Response('Forbidden',{status:403})
  }
  const payload=await req.json().catch(()=>({})) as any; const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as any; let processed=0
  for(const entry of payload.entry||[])for(const change of entry.changes||[]){
    const value=change.value||{}; const phoneNumberId=String(value.metadata?.phone_number_id||'')
    const {data:account}=await admin.from('integration_connected_accounts').select('*').eq('provider','whatsapp_cloud').eq('metadata->>phone_number_id',phoneNumberId).eq('status','connected').maybeSingle()
    if(!account)continue
    for(const message of value.messages||[]){
      const body=message.text?.body||message.button?.text||message.interactive?.button_reply?.title||'[Mensagem não textual]'
      await admin.rpc('upsert_inbound_communication',{p_organization_id:account.organization_id,p_account_id:account.id,p_channel:'whatsapp',p_external_message_id:String(message.id),p_sender:String(message.from||''),p_recipients:[String(value.metadata?.display_phone_number||'')],p_subject:'',p_body:String(body),p_occurred_at:new Date(Number(message.timestamp||Date.now()/1000)*1000).toISOString(),p_metadata:{type:message.type,contacts:value.contacts||[]}}); processed++
    }
    for(const status of value.statuses||[]){
      const mapped=status.status==='read'?'read':status.status==='delivered'?'delivered':status.status==='sent'?'sent':status.status==='failed'?'failed':'sent'
      await admin.from('communication_events').update({status:mapped,metadata:{whatsapp_status:status}}).eq('organization_id',account.organization_id).eq('external_message_id',String(status.id||'')); processed++
    }
  }
  return new Response(JSON.stringify({processed}),{status:200,headers:{'content-type':'application/json'}})
})
