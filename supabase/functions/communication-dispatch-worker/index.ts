import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { ensureFreshToken } from '../_shared/integration-runtime.ts'
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
const cleanHeader=(value:string)=>value.replace(/[\r\n]+/g,' ').trim()
const bytesToBase64=(bytes:Uint8Array)=>{let value='';for(let i=0;i<bytes.length;i+=0x8000)value+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(value)}
const utf8Base64=(value:string)=>bytesToBase64(new TextEncoder().encode(value))
const base64ToBytes=(value:string)=>Uint8Array.from(atob(value.replace(/\s+/g,'')),(char)=>char.charCodeAt(0))
const base64UrlBytes=(bytes:Uint8Array)=>bytesToBase64(bytes).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
const base64Lines=(value:string)=>value.replace(/\s+/g,'').match(/.{1,76}/g)?.join('\r\n')||''
const sanitizeHtml=(value:string)=>value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/\son\w+\s*=\s*(['"]).*?\1/gi,'').replace(/javascript:/gi,'')
const arrayOf=(value:unknown)=>Array.isArray(value)?value.map((item)=>String(item).trim()).filter(Boolean):[]
const addressList=(values:string[])=>values.map(cleanHeader).filter(Boolean).join(', ')
const encodedSubject=(value:string)=>/[\x80-\uFFFF]/.test(value)?`=?UTF-8?B?${utf8Base64(cleanHeader(value))}?=`:cleanHeader(value)
type Attachment={fileName?:string;contentType?:string;sizeBytes?:number;base64?:string;disposition?:string;contentId?:string}
const attachmentsOf=(value:unknown):Attachment[]=>Array.isArray(value)?value.filter((item):item is Attachment=>Boolean(item&&typeof item==='object')).slice(0,10):[]
const buildGmailMime=(payload:Record<string,unknown>)=>{
  const to=cleanHeader(String(payload.recipient||''));const cc=arrayOf(payload.cc);const bcc=arrayOf(payload.bcc);const subject=encodedSubject(String(payload.subject||''));
  const text=String(payload.body||'');const html=sanitizeHtml(String(payload.bodyHtml||''));const attachments=attachmentsOf(payload.attachments)
  const mixed=`rt-mixed-${crypto.randomUUID()}`;const alternative=`rt-alt-${crypto.randomUUID()}`
  const headers=[`To: ${to}`,cc.length?`Cc: ${addressList(cc)}`:'',bcc.length?`Bcc: ${addressList(bcc)}`:'',`Subject: ${subject}`,'MIME-Version: 1.0'].filter(Boolean)
  const alternativeParts=[`--${alternative}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64Lines(utf8Base64(text||html.replace(/<[^>]+>/g,' '))),`--${alternative}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',base64Lines(utf8Base64(html||`<pre>${text.replace(/[&<>]/g,(char)=>char==='&'?'&amp;':char==='<'?'&lt;':'&gt;')}</pre>`)),`--${alternative}--`].join('\r\n')
  if(!attachments.length)return [...headers,`Content-Type: multipart/alternative; boundary="${alternative}"`,'',alternativeParts].join('\r\n')
  const attachmentParts=attachments.map((file)=>{const name=cleanHeader(String(file.fileName||'arquivo'));const type=cleanHeader(String(file.contentType||'application/octet-stream'));const disposition=file.disposition==='inline'?'inline':'attachment';const contentId=file.contentId?`Content-ID: <${cleanHeader(String(file.contentId))}>`:'';return [`--${mixed}`,`Content-Type: ${type}; name="${name}"`,'Content-Transfer-Encoding: base64',`Content-Disposition: ${disposition}; filename="${name}"`,contentId,'',base64Lines(String(file.base64||''))].filter(Boolean).join('\r\n')}).join('\r\n')
  return [...headers,`Content-Type: multipart/mixed; boundary="${mixed}"`,'',`--${mixed}`,`Content-Type: multipart/alternative; boundary="${alternative}"`,'',alternativeParts,attachmentParts,`--${mixed}--`].join('\r\n')
}
Deno.serve(async(req)=>{
  const expected=Deno.env.get('COMMUNICATION_WORKER_SECRET')||'';if(expected.length<32||req.headers.get('x-worker-secret')!==expected)return json({error:'Não autorizado'},401)
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as any
  await admin.from('communication_outbox').update({status:'retry',locked_at:null,last_error:'Lock expirado; envio recuperado automaticamente',available_at:new Date().toISOString()}).eq('status','processing').lt('locked_at',new Date(Date.now()-10*60_000).toISOString())
  const {data:items,error}=await admin.from('communication_outbox').select('*,integration_connected_accounts(*)').in('status',['queued','retry']).lte('available_at',new Date().toISOString()).order('available_at').limit(20)
  if(error)return json({error:error.message},500)
  const results=[]
  for(const item of items??[]){
    const attempt=Number(item.attempts||0)+1;const started=Date.now();const {data:claimed}=await admin.from('communication_outbox').update({status:'processing',locked_at:new Date().toISOString(),attempts:attempt}).eq('id',item.id).in('status',['queued','retry']).select('id').maybeSingle();if(!claimed)continue
    try{
      const account=item.integration_connected_accounts;if(!account||account.status!=='connected'||!account.has_credential)throw new Error('Conta não conectada')
      const token=await ensureFreshToken(admin,account);const payload=(item.payload||{}) as Record<string,unknown>;let externalId='';let responseCode=0
      if(item.channel==='email'&&account.provider==='google'){
        const raw=base64UrlBytes(new TextEncoder().encode(buildGmailMime(payload)))
        const requestBody:Record<string,unknown>={raw};if(payload.threadId)requestBody.threadId=String(payload.threadId)
        const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(requestBody)});const result=await response.json().catch(()=>({})) as any;responseCode=response.status;if(!response.ok)throw new Error(result?.error?.message||'Falha no Gmail');externalId=String(result.id||'')
      }else if(item.channel==='email'&&account.provider==='microsoft'){
        const rawAttachments=attachmentsOf(payload.attachments)
        const html=sanitizeHtml(String(payload.bodyHtml||''));const message:Record<string,unknown>={subject:String(payload.subject||''),body:{contentType:html?'HTML':'Text',content:html||String(payload.body||'')},toRecipients:[{emailAddress:{address:String(payload.recipient||'')}}],ccRecipients:arrayOf(payload.cc).map((address)=>({emailAddress:{address}})),bccRecipients:arrayOf(payload.bcc).map((address)=>({emailAddress:{address}}))}
        if(!rawAttachments.length){const response=await fetch('https://graph.microsoft.com/v1.0/me/sendMail',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({message,saveToSentItems:true})});responseCode=response.status;if(!response.ok){const result=await response.json().catch(()=>({})) as any;throw new Error(result?.error?.message||'Falha no Outlook')}}
        else{
          const draftResponse=await fetch('https://graph.microsoft.com/v1.0/me/messages',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(message)});const draft=await draftResponse.json().catch(()=>({})) as any;if(!draftResponse.ok||!draft.id)throw new Error(draft?.error?.message||'Falha ao criar rascunho no Outlook')
          externalId=String(draft.id)
          for(const file of rawAttachments){const bytes=base64ToBytes(String(file.base64||''));const name=cleanHeader(String(file.fileName||'arquivo'));const contentType=String(file.contentType||'application/octet-stream')
            if(bytes.length<3*1024*1024){const attachResponse=await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(externalId)}/attachments`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({'@odata.type':'#microsoft.graph.fileAttachment',name,contentType,contentBytes:bytesToBase64(bytes),isInline:file.disposition==='inline',contentId:file.contentId?String(file.contentId):undefined})});const attachResult=await attachResponse.json().catch(()=>({})) as any;if(!attachResponse.ok)throw new Error(attachResult?.error?.message||`Falha ao anexar ${name}`)}
            else{const sessionResponse=await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(externalId)}/attachments/createUploadSession`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({AttachmentItem:{attachmentType:'file',name,size:bytes.length,contentType,isInline:file.disposition==='inline'}})});const session=await sessionResponse.json().catch(()=>({})) as any;if(!sessionResponse.ok||!session.uploadUrl)throw new Error(session?.error?.message||`Falha ao preparar upload de ${name}`);const chunkSize=320*1024*10;for(let start=0;start<bytes.length;start+=chunkSize){const end=Math.min(bytes.length,start+chunkSize);const upload=await fetch(String(session.uploadUrl),{method:'PUT',headers:{'content-length':String(end-start),'content-range':`bytes ${start}-${end-1}/${bytes.length}`},body:bytes.slice(start,end)});if(!upload.ok&&upload.status!==201&&upload.status!==202){const detail=await upload.json().catch(()=>({})) as any;throw new Error(detail?.error?.message||`Falha no upload de ${name}`)}}}
          }
          const sendResponse=await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(externalId)}/send`,{method:'POST',headers:{authorization:`Bearer ${token}`}});responseCode=sendResponse.status;if(!sendResponse.ok){const result=await sendResponse.json().catch(()=>({})) as any;throw new Error(result?.error?.message||'Falha ao enviar o rascunho do Outlook')}
        }
        if(!externalId)externalId=`ms-${item.id}`
      }else if(item.channel==='whatsapp'&&account.provider==='whatsapp_cloud'){
        const phoneNumberId=String(account.metadata?.phone_number_id||'');if(!phoneNumberId)throw new Error('Configure phone_number_id na conta do WhatsApp');const version=Deno.env.get('META_GRAPH_VERSION')||'v23.0';const response=await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:String(payload.recipient||'').replace(/\D/g,''),type:'text',text:{preview_url:false,body:String(payload.body||'')}})});const result=await response.json().catch(()=>({})) as any;responseCode=response.status;if(!response.ok)throw new Error(result?.error?.message||'Falha no WhatsApp');externalId=String(result.messages?.[0]?.id||'')
      }else throw new Error('Conta incompatível com o canal')
      const eventMetadata={provider:account.provider,response_code:responseCode,duration_ms:Date.now()-started,template_id:payload.templateId||null,cc:arrayOf(payload.cc),bcc:arrayOf(payload.bcc),attachment_count:attachmentsOf(payload.attachments).length}
      await admin.from('communication_events').update({status:'sent',external_message_id:externalId||null,occurred_at:new Date().toISOString(),metadata:eventMetadata}).eq('id',item.event_id)
      await admin.from('communication_outbox').update({status:'sent',completed_at:new Date().toISOString(),locked_at:null,last_error:null}).eq('id',item.id);results.push({id:item.id,status:'sent',externalId})
    }catch(error){const message=error instanceof Error?error.message:'Falha desconhecida';const terminal=attempt>=Number(item.max_attempts||5);const delay=Math.min(3600,Math.pow(2,attempt)*30);await admin.from('communication_events').update({status:'failed',metadata:{dispatch_error:message,attempt}}).eq('id',item.event_id);await admin.from('communication_outbox').update({status:terminal?'dead_letter':'retry',available_at:new Date(Date.now()+delay*1000).toISOString(),locked_at:null,last_error:message}).eq('id',item.id);results.push({id:item.id,status:terminal?'dead_letter':'retry',error:message})}
  }
  return json({processed:results.length,results})
})
