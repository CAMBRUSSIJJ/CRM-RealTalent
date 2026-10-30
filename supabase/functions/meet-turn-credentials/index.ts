// Mint ephemeral TURN credentials only for an existing, active invitation.
// Coturn must be configured with use-auth-secret and the same shared secret.
// No TURN secret or service role token is ever returned to the browser.
const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Cache-Control':'no-store',
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
  if(req.method!=='POST')return json({error:'method_not_allowed'},405)
  const url=Deno.env.get('SUPABASE_URL')
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secret=Deno.env.get('MEET_TURN_SHARED_SECRET')
  const turnUrls=(Deno.env.get('MEET_TURN_URLS')||'').split(',').map(x=>x.trim()).filter(x=>/^turns?:/i.test(x))
  if(!url||!key||!secret||!turnUrls.length)return json({error:'turn_not_configured'},503)
  let token=''
  try{const body=await req.json();token=typeof body?.token==='string'?body.token.trim():''}catch{return json({error:'invalid_request'},400)}
  if(!/^[a-f0-9]{64}$/i.test(token))return json({error:'invalid_invite'},400)
  try{
    const endpoint=new URL(url+'/rest/v1/realtalent_meet_rooms')
    endpoint.searchParams.set('select','id')
    endpoint.searchParams.set('public_token','eq.'+token)
    endpoint.searchParams.set('status','in.(scheduled,live)')
    endpoint.searchParams.set('limit','1')
    const response=await fetch(endpoint,{headers:{apikey:key,Authorization:'Bearer '+key}})
    if(!response.ok)return json({error:'service_unavailable'},503)
    const rooms=await response.json()
    if(!Array.isArray(rooms)||!rooms.length)return json({error:'invite_unavailable'},404)
    const ttl=3600
    const expires=Math.floor(Date.now()/1000)+ttl
    const username=expires+':realtalent-'+String(rooms[0].id).slice(0,8)
    const signingKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign'])
    const mac=await crypto.subtle.sign('HMAC',signingKey,new TextEncoder().encode(username))
    const credential=btoa(String.fromCharCode(...new Uint8Array(mac)))
    return json({iceServers:[{urls:turnUrls,username,credential}],expiresAt:new Date(expires*1000).toISOString()})
  }catch{return json({error:'service_unavailable'},503)}
})
