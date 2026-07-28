import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
const base64Url=(value:string)=>btoa(unescape(encodeURIComponent(value))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
const cleanHeader=(value:string)=>value.replace(/[\r\n]+/g,' ').trim()
Deno.serve(async(req)=>{
  const expected=Deno.env.get('COMMUNICATION_WORKER_SECRET'); if(!expected||req.headers.get('x-worker-secret')!==expected)return json({error:'Não autorizado'},401)
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as any
  const encryptionKey=Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY')||''
  const {data:items,error}=await admin.from('communication_outbox').select('*,integration_connected_accounts(*)').in('status',['queued','retry']).lte('available_at',new Date().toISOString()).order('available_at').limit(20)
  if(error)return json({error:error.message},500)
  const results=[]
  for(const item of items??[]){
    const attempt=Number(item.attempts||0)+1; const started=Date.now()
    const {data:claimed}=await admin.from('communication_outbox').update({status:'processing',locked_at:new Date().toISOString(),attempts:attempt}).eq('id',item.id).in('status',['queued','retry']).select('id').maybeSingle()
    if(!claimed)continue
    try{
      const account=item.integration_connected_accounts
      if(!account||account.status!=='connected')throw new Error('Conta não conectada')
      const {data:tokens,error:tokenError}=await admin.rpc('read_integration_oauth_token',{p_account_id:item.account_id,p_encryption_key:encryptionKey})
      if(tokenError||!tokens?.[0]?.access_token)throw new Error(tokenError?.message||'Token indisponível')
      const token=tokens[0].access_token as string; const payload=item.payload||{}; let externalId=''; let responseCode=0
      if(item.channel==='email'&&account.provider==='google'){
        const to=cleanHeader(String(payload.recipient||'')); const subject=cleanHeader(String(payload.subject||'')); const body=String(payload.body||'')
        const raw=base64Url(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\nMIME-Version: 1.0\r\n\r\n${body}`)
        const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({raw})})
        const result=await response.json().catch(()=>({})) as any; responseCode=response.status
        if(!response.ok)throw new Error(result?.error?.message||'Falha no Gmail'); externalId=String(result.id||'')
      }else if(item.channel==='email'&&account.provider==='microsoft'){
        const response=await fetch('https://graph.microsoft.com/v1.0/me/sendMail',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({message:{subject:String(payload.subject||''),body:{contentType:'Text',content:String(payload.body||'')},toRecipients:[{emailAddress:{address:String(payload.recipient||'')}}]},saveToSentItems:true})})
        responseCode=response.status; if(!response.ok){const result=await response.json().catch(()=>({})) as any;throw new Error(result?.error?.message||'Falha no Outlook')}
        externalId=`ms-${item.id}`
      }else if(item.channel==='whatsapp'&&account.provider==='whatsapp_cloud'){
        const phoneNumberId=String(account.metadata?.phone_number_id||''); if(!phoneNumberId)throw new Error('Configure phone_number_id na conta do WhatsApp')
        const version=Deno.env.get('META_GRAPH_VERSION')||'v23.0'
        const response=await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:String(payload.recipient||'').replace(/\D/g,''),type:'text',text:{preview_url:false,body:String(payload.body||'')}})})
        const result=await response.json().catch(()=>({})) as any; responseCode=response.status
        if(!response.ok)throw new Error(result?.error?.message||'Falha no WhatsApp'); externalId=String(result.messages?.[0]?.id||'')
      }else throw new Error('Conta incompatível com o canal')
      await admin.from('communication_events').update({status:'sent',external_message_id:externalId||null,occurred_at:new Date().toISOString(),metadata:{...(item.payload||{}),provider:account.provider,response_code:responseCode,duration_ms:Date.now()-started}}).eq('id',item.event_id)
      await admin.from('communication_outbox').update({status:'sent',completed_at:new Date().toISOString(),locked_at:null,last_error:null}).eq('id',item.id)
      results.push({id:item.id,status:'sent',externalId})
    }catch(error){
      const message=error instanceof Error?error.message:'Falha desconhecida'; const terminal=attempt>=Number(item.max_attempts||5); const delay=Math.min(3600,Math.pow(2,attempt)*30)
      await admin.from('communication_events').update({status:'failed',metadata:{dispatch_error:message,attempt}}).eq('id',item.event_id)
      await admin.from('communication_outbox').update({status:terminal?'dead_letter':'retry',available_at:new Date(Date.now()+delay*1000).toISOString(),locked_at:null,last_error:message}).eq('id',item.id)
      results.push({id:item.id,status:terminal?'dead_letter':'retry',error:message})
    }
  }
  return json({processed:results.length,results})
})
