import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const appUrl=()=>Deno.env.get('APP_PUBLIC_URL')||'http://localhost:5173'
const redirect=(status:'success'|'error',provider='',detail='')=>{const url=new URL(appUrl());url.searchParams.set('route','settings');url.searchParams.set('tab','integrations');url.searchParams.set('oauth',status);if(provider)url.searchParams.set('provider',provider);if(detail)url.searchParams.set('detail',detail.slice(0,160));return Response.redirect(url.toString(),302)}
const sha256hex=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map((item)=>item.toString(16).padStart(2,'0')).join('')
type Provider='google'|'microsoft'|'meta'|'whatsapp_cloud'
const configs={
  google:{clientId:'GOOGLE_OAUTH_CLIENT_ID',clientSecret:'GOOGLE_OAUTH_CLIENT_SECRET',tokenUrl:'https://oauth2.googleapis.com/token',profileUrl:'https://openidconnect.googleapis.com/v1/userinfo'},
  microsoft:{clientId:'MICROSOFT_OAUTH_CLIENT_ID',clientSecret:'MICROSOFT_OAUTH_CLIENT_SECRET',tokenUrl:'https://login.microsoftonline.com/common/oauth2/v2.0/token',profileUrl:'https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName,mail'},
  meta:{clientId:'META_OAUTH_CLIENT_ID',clientSecret:'META_OAUTH_CLIENT_SECRET',tokenUrl:`https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION')||'v23.0'}/oauth/access_token`,profileUrl:`https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION')||'v23.0'}/me?fields=id,name,email`},
  whatsapp_cloud:{clientId:'META_OAUTH_CLIENT_ID',clientSecret:'META_OAUTH_CLIENT_SECRET',tokenUrl:`https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION')||'v23.0'}/oauth/access_token`,profileUrl:`https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION')||'v23.0'}/me?fields=id,name,email`},
} as const
const capabilities:Record<Provider,Record<string,boolean>>={
  google:{email_send:true,email_read:true,mail_sync:true,calendar_read:true,calendar_sync:true,calendar_write:true,incremental_sync:true,webhooks:true},
  microsoft:{email_send:true,email_read:true,mail_sync:true,calendar_read:true,calendar_sync:true,calendar_write:true,incremental_sync:true,webhooks:true},
  meta:{lead_ads:true,pages:true,instagram:true,webhooks:true},
  whatsapp_cloud:{messages:true,templates:true,delivery_status:true,webhooks:true},
}
Deno.serve(async(request)=>{
  const url=new URL(request.url);const code=url.searchParams.get('code');const state=url.searchParams.get('state');const providerError=url.searchParams.get('error_description')||url.searchParams.get('error')
  if(!state)return redirect('error','','Estado OAuth ausente')
  try{
    const encryptionKey=Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY')||''
    if(encryptionKey.length<32)throw new Error('Cofre OAuth não configurado')
    const admin=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'')
    const {data:rows,error:stateError}=await admin.rpc('consume_integration_oauth_state',{p_state_hash:await sha256hex(state),p_encryption_key:encryptionKey})
    const stored=Array.isArray(rows)?rows[0]:rows
    if(stateError||!stored)throw new Error(stateError?.message||'Estado OAuth inválido, expirado ou já consumido')
    const provider=stored.provider as Provider
    if(providerError)throw new Error(providerError)
    if(!code)throw new Error('Código OAuth ausente')
    const config=configs[provider]
    if(!config)throw new Error('Provedor OAuth inválido')
    const clientId=Deno.env.get(config.clientId)||'';const clientSecret=Deno.env.get(config.clientSecret)||''
    if(!clientId||!clientSecret)throw new Error(`Credenciais ${provider} não configuradas`)
    const tokenBody=new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:String(stored.redirect_uri),grant_type:'authorization_code',code_verifier:String(stored.code_verifier)})
    const tokenResponse=await fetch(config.tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:tokenBody})
    const token=await tokenResponse.json().catch(()=>({})) as Record<string,unknown>
    if(!tokenResponse.ok||typeof token.access_token!=='string')throw new Error(typeof token.error_description==='string'?token.error_description:String((token.error as any)?.message||'Falha na troca do código OAuth'))
    const profileResponse=await fetch(config.profileUrl,{headers:{authorization:`Bearer ${token.access_token}`}})
    const profile=await profileResponse.json().catch(()=>({})) as Record<string,unknown>
    if(!profileResponse.ok)throw new Error(String((profile.error as any)?.message||'Não foi possível identificar a conta conectada'))
    const externalId=String(profile.id||profile.sub||profile.userPrincipalName||profile.email||crypto.randomUUID())
    const email=String(profile.email||profile.mail||profile.userPrincipalName||'')
    const displayName=String(profile.name||profile.displayName||email||`${provider} ${externalId}`)
    const scopes=typeof token.scope==='string'?token.scope.split(/[ ,]+/).filter(Boolean):[]
    const expiresIn=Number(token.expires_in||0);const expiresAt=expiresIn>0?new Date(Date.now()+expiresIn*1000).toISOString():null
    const {data:membership}=await admin.from('organization_members').select('role').eq('organization_id',stored.organization_id).eq('user_id',stored.user_id).maybeSingle()
    if(!membership||!['owner','admin'].includes(membership.role))throw new Error('Usuário sem permissão para esta organização')
    const {data:account,error:accountError}=await admin.from('integration_connected_accounts').upsert({
      organization_id:stored.organization_id,provider,external_account_id:externalId,display_name:displayName,status:'connected',scopes,
      has_credential:true,token_expires_at:expiresAt,last_error:null,connected_by_user_id:stored.user_id,access_mode:'personal',
      allowed_user_ids:[],allowed_roles:[],capabilities:capabilities[provider],connection_mode:'live',revoked_at:null,
      metadata:{email,provider_profile:{id:externalId,name:displayName}},
    },{onConflict:'organization_id,provider,external_account_id'}).select('id').single()
    if(accountError||!account)throw new Error(accountError?.message||'Falha ao salvar a conta')
    const {error:vaultError}=await admin.rpc('store_integration_oauth_token',{p_account_id:account.id,p_access_token:token.access_token,p_refresh_token:typeof token.refresh_token==='string'?token.refresh_token:'',p_token_type:typeof token.token_type==='string'?token.token_type:'Bearer',p_expires_at:expiresAt,p_encryption_key:encryptionKey})
    if(vaultError)throw new Error(vaultError.message)
    await admin.from('integration_audit_events').insert({organization_id:stored.organization_id,account_id:account.id,provider,event_type:'oauth_connected',severity:'security',actor_user_id:stored.user_id,message:'Conta conectada com PKCE e estado OAuth de uso único',metadata:{external_account_id:externalId,credential_version:1}})
    if(provider==='google'||provider==='microsoft'){
      const capabilityList=['email_send','mail_sync','calendar_sync','calendar_write']
      for(const capability of capabilityList){
        const {data:existing}=await admin.from('integration_account_defaults').select('id').eq('organization_id',stored.organization_id).eq('user_id',stored.user_id).eq('capability',capability).maybeSingle()
        if(!existing)await admin.from('integration_account_defaults').insert({organization_id:stored.organization_id,user_id:stored.user_id,capability,account_id:account.id})
      }
      const jobs=provider==='google'?['google_mail_pull','google_calendar_pull','google_subscription_renew']:['microsoft_mail_pull','microsoft_calendar_pull','microsoft_subscription_renew']
      for(const jobType of jobs)await admin.rpc('enqueue_integration_sync_job_system',{p_organization_id:stored.organization_id,p_account_id:account.id,p_job_type:jobType,p_idempotency_key:`oauth:${account.id}:${jobType}:${Date.now()}`,p_payload:{source:'oauth_connected',initial_sync:true}})
    }
    return redirect('success',provider)
  }catch(error){return redirect('error','',error instanceof Error?error.message:'Falha inesperada no OAuth')}
})
