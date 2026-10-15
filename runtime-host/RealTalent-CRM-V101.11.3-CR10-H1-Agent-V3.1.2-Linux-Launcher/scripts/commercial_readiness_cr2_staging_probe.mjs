const need=['CR2_SUPABASE_URL','CR2_SUPABASE_ANON_KEY','CR2_WORKSPACE_ID','CR2_ADMIN_EMAIL','CR2_ADMIN_PASSWORD','CR2_MANAGER_EMAIL','CR2_MANAGER_PASSWORD','CR2_SELLER_EMAIL','CR2_SELLER_PASSWORD']
const missing=need.filter(k=>!process.env[k])
if(missing.length){console.error('CR2 STAGING BLOCKED: faltam variáveis: '+missing.join(', '));console.error('Copie .env.cr2.example, preencha com contas exclusivas de staging e rode novamente.');process.exit(2)}
const url=process.env.CR2_SUPABASE_URL.replace(/\/$/,''), key=process.env.CR2_SUPABASE_ANON_KEY, org=process.env.CR2_WORKSPACE_ID
const req=async(path,{token=key,method='GET',body,prefer}={})=>{const headers={apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};if(prefer)headers.Prefer=prefer;const r=await fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(`${method} ${path}: ${r.status} ${data?.message||data?.msg||String(data).slice(0,180)}`);return data}
const login=async(email,password)=>{const data=await req('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});if(!data?.user||!data?.access_token)throw new Error('login sem usuário/token');return data}
const rpc=(name,body,token)=>req(`/rest/v1/rpc/${name}`,{method:'POST',body,token})
const selectProfile=async(userId,token)=>{const q=new URLSearchParams({select:'profile_key',organization_id:`eq.${org}`,user_id:`eq.${userId}`,limit:'1'});const rows=await req('/rest/v1/member_access_profiles?'+q,{token});return rows?.[0]||null}
const cases=[
  {name:'Administrador',email:process.env.CR2_ADMIN_EMAIL,password:process.env.CR2_ADMIN_PASSWORD,expect:{scope:'all',approve:true,settings:true}},
  {name:'Gestor',email:process.env.CR2_MANAGER_EMAIL,password:process.env.CR2_MANAGER_PASSWORD,expect:{scope:'team',approve:true,settings:true}},
  {name:'Vendedor',email:process.env.CR2_SELLER_EMAIL,password:process.env.CR2_SELLER_PASSWORD,expect:{scope:'own',approve:false,settings:false}},
]
let failures=0
for(const t of cases){
  try{
    const auth=await login(t.email,t.password), token=auth.access_token
    const [scope,approve,settings,profile]=await Promise.all([
      rpc('rt_access_scope',{p_organization_id:org,p_resource:'proposals'},token),
      rpc('rt_access_action_allowed',{p_organization_id:org,p_resource:'proposals',p_action:'approve'},token),
      rpc('rt_access_action_allowed',{p_organization_id:org,p_resource:'settings',p_action:'view'},token),
      selectProfile(auth.user.id,token),
    ])
    const good=scope===t.expect.scope&&approve===t.expect.approve&&settings===t.expect.settings
    console.log(`${good?'PASS':'FAIL'} ${t.name}: profile=${profile?.profile_key??'fallback'} scope=${scope} approve=${approve} settings=${settings}`)
    if(!good) failures++
  }catch(e){console.log(`FAIL ${t.name}: ${e?.message||e}`);failures++}
}
if(failures){console.error(`CR2 STAGING FAIL: ${failures} cenário(s)`);process.exit(1)}
console.log('CR2 STAGING PASS: Admin/Gestor/Vendedor autenticados e H22 confirmado via RPC/RLS (HTTP nativo, sem dependência do SDK).')
