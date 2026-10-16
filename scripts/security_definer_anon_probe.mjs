const required=['CR2_SUPABASE_URL','CR2_SUPABASE_ANON_KEY']
const missing=required.filter(k=>!process.env[k])
if(missing.length){console.error('SECURITY DEFINER PROBE BLOCKED: faltam variáveis: '+missing.join(', '));process.exit(2)}

const url=process.env.CR2_SUPABASE_URL.replace(/\/$/,'')
const key=process.env.CR2_SUPABASE_ANON_KEY
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'}

const rpc=async(name,body)=>{
  const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body)})
  const text=await response.text()
  let data=null
  try{data=text?JSON.parse(text):null}catch{data=text}
  return {ok:response.ok,status:response.status,data,text}
}

const describe=(result)=>{
  const message=result?.data?.message||result?.data?.details||result?.data?.hint||result?.text||''
  return `${result?.status||0} ${String(message).slice(0,180)}`
}

const isPrivilegeDenied=(result)=>{
  const message=(result?.data?.message||result?.data?.details||result?.text||'').toLowerCase()
  return !result.ok && (result.status===401||result.status===403||message.includes('permission denied for function')||message.includes('permissão negada para função'))
}

const assert=(condition,message,detail='')=>{
  if(!condition)throw new Error(`${message}${detail?`: ${detail}`:''}`)
  console.log(`PASS ${message}`)
}

const dummyOrg='00000000-0000-0000-0000-000000000001'
const dummyId='00000000-0000-0000-0000-000000000002'

try{
  let result=await rpc('claim_lead_geocode_jobs',{p_limit:1,p_worker:'anon-security-probe',p_lease_seconds:60})
  assert(isPrivilegeDenied(result),'01 anon bloqueado no worker de geocodificação',describe(result))

  result=await rpc('is_organization_member',{p_organization_id:dummyOrg})
  assert(isPrivilegeDenied(result),'02 anon bloqueado no helper SECURITY DEFINER de organização',describe(result))

  result=await rpc('enqueue_lead_geocoding',{p_lead_ids:[dummyId],p_source:'manual',p_priority:100})
  assert(isPrivilegeDenied(result),'03 anon bloqueado no enfileiramento de geocodificação',describe(result))

  result=await rpc('save_sales_proposal',{
    p_organization_id:dummyOrg,p_proposal_id:null,p_lead_id:dummyId,p_title:'probe',p_forecast_category:'pipeline',p_probability:0,
    p_valid_until:null,p_expected_close_at:null,p_contract_start_at:null,p_contract_end_at:null,p_contract_term_months:12,p_auto_renew:false,
    p_post_sale_start_at:null,p_post_sale_cadence_name:'probe',p_notes:'',p_terms:'',p_items:[]
  })
  assert(isPrivilegeDenied(result),'04 anon bloqueado na mutação de proposta',describe(result))

  result=await rpc('register_commercial_activity_outcome',{
    p_organization_id:dummyOrg,p_activity_id:dummyId,p_outcome:'answered',p_result_title:'probe',p_result_description:'',p_create_next:false,
    p_next_type:null,p_next_title:null,p_next_description:null,p_next_at:null,p_stage_id:null
  })
  assert(isPrivilegeDenied(result),'05 anon bloqueado na mutação de atividade comercial',describe(result))

  result=await rpc('register_extension_installation',{
    p_organization_id:dummyOrg,p_product_key:'rt-capture',p_installation_key:'anon-probe-1234',p_display_name:'probe',p_browser:'Chrome',
    p_browser_version:'',p_platform:'linux',p_app_version:'0.0.0',p_manifest_version:3,p_permissions:[],p_capabilities:[],p_metadata:{}
  })
  assert(isPrivilegeDenied(result),'06 anon bloqueado no registro de extensão',describe(result))

  // Este endpoint é deliberadamente público por share token. Token inválido pode retornar
  // vazio/erro funcional, mas NÃO pode falhar por falta de EXECUTE.
  result=await rpc('get_buyer_room_public',{p_share_token:'security-probe-invalid-token'})
  assert(!isPrivilegeDenied(result),'07 Buyer Room público continua executável por token',describe(result))

  console.log('SECURITY DEFINER ANON PASS: RPCs internas protegidas e Buyer Room público preservado.')
}catch(error){
  console.error('SECURITY DEFINER ANON FAIL:',error?.message||error)
  process.exitCode=1
}
