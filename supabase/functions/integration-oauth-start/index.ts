import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const cors={ 'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'POST, OPTIONS' }
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json'}})
const providers={
  google:{auth:'https://accounts.google.com/o/oauth2/v2/auth',client:'GOOGLE_OAUTH_CLIENT_ID',scopes:'openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly'},
  microsoft:{auth:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',client:'MICROSOFT_OAUTH_CLIENT_ID',scopes:'openid profile email offline_access Calendars.ReadWrite Mail.ReadWrite Mail.Send'},
  meta:{auth:'https://www.facebook.com/v23.0/dialog/oauth',client:'META_OAUTH_CLIENT_ID',scopes:'public_profile,pages_show_list,leads_retrieval'},
  whatsapp_cloud:{auth:'https://www.facebook.com/v23.0/dialog/oauth',client:'META_OAUTH_CLIENT_ID',scopes:'whatsapp_business_management,whatsapp_business_messaging'},
} as const
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('')
const hmac=async(payload:string,secret:string)=>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload)))}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
  if(req.method!=='POST')return json({error:'Método não permitido'},405)
  const auth=req.headers.get('authorization')||''
  const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}})
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)return json({error:'Sessão inválida'},401)
  const body=await req.json().catch(()=>({})) as {organizationId?:string;provider?:keyof typeof providers}
  const config=body.provider?providers[body.provider]:null
  if(!body.organizationId||!body.provider||!config)return json({error:'Organização ou provedor inválido'},400)
  const {data:isAdmin}=await supabase.rpc('is_organization_admin',{p_organization_id:body.organizationId})
  if(!isAdmin)return json({error:'Somente administradores podem conectar contas'},403)
  const clientId=Deno.env.get(config.client)
  const appUrl=Deno.env.get('APP_PUBLIC_URL')
  const stateSecret=Deno.env.get('OAUTH_STATE_SECRET')
  if(!clientId||!appUrl||!stateSecret)return json({error:`OAuth ${body.provider} ainda não foi configurado no servidor`},503)
  const nonce=crypto.randomUUID(); const expires=Math.floor(Date.now()/1000)+600
  const payload=btoa(JSON.stringify({o:body.organizationId,p:body.provider,u:user.id,n:nonce,e:expires})).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
  const signature=await hmac(payload,stateSecret); const state=`${payload}.${signature}`
  const redirectUri=`${Deno.env.get('SUPABASE_URL')}/functions/v1/integration-oauth-callback`
  const url=new URL(config.auth); url.searchParams.set('client_id',clientId); url.searchParams.set('redirect_uri',redirectUri); url.searchParams.set('response_type','code'); url.searchParams.set('state',state); url.searchParams.set('scope',config.scopes)
  if(body.provider==='google'){url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent');url.searchParams.set('include_granted_scopes','true')}
  return json({authorizationUrl:url.toString(),returnUrl:`${appUrl}/?integration=${body.provider}`})
})
