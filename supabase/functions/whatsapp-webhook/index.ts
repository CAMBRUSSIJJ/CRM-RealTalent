import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const constantTimeEquals = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}
const hmacHex = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
  return Array.from(signature).map((item) => item.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async(req)=>{
  const url=new URL(req.url)
  if(req.method==='GET'){
    const mode=url.searchParams.get('hub.mode'),token=url.searchParams.get('hub.verify_token'),challenge=url.searchParams.get('hub.challenge')
    return mode==='subscribe'&&token===Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN')?new Response(challenge||'',{status:200}):new Response('Forbidden',{status:403})
  }
  if(req.method!=='POST')return new Response('Method not allowed',{status:405})
  const raw=await req.text()
  const appSecret=Deno.env.get('META_APP_SECRET')||''
  const supplied=req.headers.get('x-hub-signature-256')||''
  if(appSecret.length<32||!supplied.startsWith('sha256='))return new Response('Webhook signature unavailable',{status:503})
  const expected=`sha256=${await hmacHex(raw,appSecret)}`
  if(!constantTimeEquals(supplied,expected))return new Response('Invalid signature',{status:401})
  const payload=JSON.parse(raw||'{}') as any
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as any; let processed=0
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
