import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const cors={ 'access-control-allow-origin':'*','access-control-allow-headers':'authorization, apikey, content-type' }
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
const randomUrl=(size:number)=>{const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return base64url(bytes)}
const sha256=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))
const hex=async(value:string)=>Array.from(await sha256(value)).map((item)=>item.toString(16).padStart(2,'0')).join('')
const providers={
  google:{client:'GOOGLE_OAUTH_CLIENT_ID',auth:'https://accounts.google.com/o/oauth2/v2/auth',scopes:'openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events'},
  microsoft:{client:'MICROSOFT_OAUTH_CLIENT_ID',auth:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',scopes:'openid profile email offline_access User.Read Mail.Send Mail.Read Calendars.ReadWrite'},
  meta:{client:'META_OAUTH_CLIENT_ID',auth:`https://www.facebook.com/${Deno.env.get('META_GRAPH_VERSION')||'v23.0'}/dialog/oauth`,scopes:'public_profile,email,pages_show_list,pages_read_engagement,leads_retrieval,instagram_basic,instagram_manage_messages'},
  whatsapp_cloud:{client:'META_OAUTH_CLIENT_ID',auth:`https://www.facebook.com/${Deno.env.get('META_GRAPH_VERSION')||'v23.0'}/dialog/oauth`,scopes:'public_profile,business_management,whatsapp_business_management,whatsapp_business_messaging'},
} as const
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
  if(req.method!=='POST')return json({error:'Método não permitido'},405)
  const auth=req.headers.get('authorization')||''
  const client=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_ANON_KEY')||'',{global:{headers:{Authorization:auth}}})
  const {data:{user}}=await client.auth.getUser()
  if(!user)return json({error:'Sessão inválida'},401)
  const body=await req.json().catch(()=>({})) as {organizationId?:string;provider?:keyof typeof providers}
  const config=body.provider?providers[body.provider]:null
  if(!body.organizationId||!body.provider||!config)return json({error:'Organização ou provedor inválido'},400)
  const {data:isAdmin}=await client.rpc('is_organization_admin',{p_organization_id:body.organizationId})
  if(!isAdmin)return json({error:'Somente administradores podem conectar contas'},403)
  const clientId=Deno.env.get(config.client)||''
  const appUrl=Deno.env.get('APP_PUBLIC_URL')||''
  const encryptionKey=Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY')||''
  if(!clientId||!appUrl||encryptionKey.length<32)return json({error:`OAuth ${body.provider} ainda não foi configurado no servidor`},503)
  const state=randomUrl(32); const verifier=randomUrl(64); const challenge=base64url(await sha256(verifier))
  const redirectUri=`${Deno.env.get('SUPABASE_URL')}/functions/v1/integration-oauth-callback`
  const admin=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'')
  const {error:stateError}=await admin.rpc('create_integration_oauth_state',{
    p_state_hash:await hex(state),p_organization_id:body.organizationId,p_provider:body.provider,p_user_id:user.id,
    p_redirect_uri:redirectUri,p_code_verifier:verifier,p_encryption_key:encryptionKey,p_ttl_seconds:600,
  })
  if(stateError)return json({error:stateError.message},500)
  const url=new URL(config.auth);url.searchParams.set('client_id',clientId);url.searchParams.set('redirect_uri',redirectUri);url.searchParams.set('response_type','code');url.searchParams.set('state',state);url.searchParams.set('scope',config.scopes);url.searchParams.set('code_challenge',challenge);url.searchParams.set('code_challenge_method','S256')
  if(body.provider==='google'){url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent');url.searchParams.set('include_granted_scopes','true')}
  return json({authorizationUrl:url.toString(),returnUrl:`${appUrl}/?route=settings&tab=integrations&integration=${body.provider}`,pkce:true,stateMode:'single_use'})
})
