const required=['CR3_SUPABASE_URL','CR3_SUPABASE_ANON_KEY','CR3_WORKSPACE_ID','CR3_COMMUNICATION_ACCOUNT_ID','CR3_ADMIN_EMAIL','CR3_ADMIN_PASSWORD','CR3_MANAGER_EMAIL','CR3_MANAGER_PASSWORD','CR3_SELLER_EMAIL','CR3_SELLER_PASSWORD']
const missing=required.filter(k=>!process.env[k])
if(missing.length){console.error('CR3 STAGING BLOCKED: faltam variáveis: '+missing.join(', '));console.error('Use .env.cr3.example em um workspace descartável de staging.');process.exit(2)}
const url=process.env.CR3_SUPABASE_URL.replace(/\/$/,''),key=process.env.CR3_SUPABASE_ANON_KEY,org=process.env.CR3_WORKSPACE_ID,communicationAccountId=process.env.CR3_COMMUNICATION_ACCOUNT_ID
const raw=async(path,{token=key,method='GET',body,prefer}={})=>{const headers={apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};if(prefer)headers.Prefer=prefer;const r=await fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}return {ok:r.ok,status:r.status,data}}
const req=async(path,o={})=>{const r=await raw(path,o);if(!r.ok)throw new Error(`${o.method||'GET'} ${path}: ${r.status} ${r.data?.message||r.data?.msg||r.data?.details||String(r.data).slice(0,220)}`);return r.data}
const login=async(email,password)=>{const d=await req('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});if(!d?.user||!d?.access_token)throw new Error('login sem usuário/token');return d}
const rpc=(name,body,token)=>req(`/rest/v1/rpc/${name}`,{method:'POST',body,token})
const qs=(o)=>new URLSearchParams(o).toString()
const select=async(table,params,token)=>req(`/rest/v1/${table}?${qs(params)}`,{token})
const insert=async(table,body,selectCols,token)=>{const suffix=selectCols?`?select=${encodeURIComponent(selectCols)}`:'';const rows=await req(`/rest/v1/${table}${suffix}`,{method:'POST',body,token,prefer:'return=representation'});return Array.isArray(rows)?rows[0]:rows}
const update=async(table,filters,body,token)=>req(`/rest/v1/${table}?${qs(filters)}`,{method:'PATCH',body,token,prefer:'return=minimal'})
const del=async(table,filters,token)=>req(`/rest/v1/${table}?${qs(filters)}`,{method:'DELETE',token,prefer:'return=minimal'})
const assert=(cond,msg)=>{if(!cond)throw new Error(msg);console.log('PASS '+msg)}
let seller,manager,admin;const made={}
try{
  seller=await login(process.env.CR3_SELLER_EMAIL,process.env.CR3_SELLER_PASSWORD);assert(!!seller.user,'01 login Vendedor')
  manager=await login(process.env.CR3_MANAGER_EMAIL,process.env.CR3_MANAGER_PASSWORD);assert(!!manager.user,'02 login Gestor')
  admin=await login(process.env.CR3_ADMIN_EMAIL,process.env.CR3_ADMIN_PASSWORD);assert(!!admin.user,'03 login Administrador')
  const stages=await select('pipeline_stages',{select:'id,name',organization_id:`eq.${org}`,is_won:'eq.false',is_lost:'eq.false',order:'stage_order.asc',limit:'1'},seller.access_token);const stage=stages?.[0];if(!stage)throw new Error('stage comercial aberto não encontrado')
  const suffix=Date.now().toString(36)
  let r=await insert('contacts',{organization_id:org,name:`CR3 Contato ${suffix}`,email:`cr3-${suffix}@example.invalid`,consent_status:'consented',relationship_owner_id:seller.user.id,relationship_owner_name:seller.user.email||'QA Vendedor'},'id',seller.access_token);made.contact=r.id;assert(!!made.contact,'04 contato criado pelo Vendedor')
  r=await insert('leads',{organization_id:org,name:`CR3 Lead ${suffix}`,company:'CR3 Staging',email:`cr3-${suffix}@example.invalid`,stage_id:stage.id,owner_id:seller.user.id,value:1500,primary_contact_id:made.contact,source:'CR3 E2E'},'id',seller.access_token);made.lead=r.id;assert(!!made.lead,'05 lead comercial criado')
  r=await insert('opportunities',{organization_id:org,primary_contact_id:made.contact,lead_id:made.lead,title:`CR3 Negócio ${suffix}`,stage_id:stage.id,status:'active',value:1500,owner_id:seller.user.id},'id',seller.access_token);made.opp=r.id
  await update('leads',{organization_id:`eq.${org}`,id:`eq.${made.lead}`},{opportunity_id:made.opp},seller.access_token);assert(!!made.opp,'06 oportunidade vinculada')
  r=await insert('activities',{organization_id:org,lead_id:made.lead,activity_type:'followup',title:'CR3 Follow-up comercial',due_at:new Date(Date.now()+86400000).toISOString(),assigned_to:seller.user.id},'id',seller.access_token);made.activity=r.id;assert(!!made.activity,'07 follow-up criado')
  r=await insert('work_tasks',{organization_id:org,title:'CR3 Preparar proposta',status:'in_progress',priority:'high',assignee_id:seller.user.id,created_by:seller.user.id},'id',seller.access_token);made.task=r.id
  await insert('task_relations',{organization_id:org,task_id:made.task,entity_type:'opportunity',entity_id:made.opp,entity_label:`CR3 Negócio ${suffix}`},null,seller.access_token);assert(!!made.task,'08 tarefa vinculada à oportunidade')

  const forgedEvent=await raw('/rest/v1/communication_events?select=id',{method:'POST',body:{organization_id:org,lead_id:made.lead,contact_id:made.contact,channel:'whatsapp',direction:'outbound',event_type:'message',status:'sent',recipient_addresses:['+5500000000000'],body_text:'CR3 forged direct event',idempotency_key:`cr3-forged-${suffix}`},token:seller.access_token,prefer:'return=representation'})
  assert(!forgedEvent.ok&&forgedEvent.status===403,'09 escrita direta no histórico oficial bloqueada')

  const accounts=await select('integration_connected_accounts',{select:'id,provider,status,connection_mode,has_credential',id:`eq.${communicationAccountId}`,organization_id:`eq.${org}`,limit:'1'},seller.access_token)
  assert(accounts?.[0]?.provider==='whatsapp_cloud'&&accounts?.[0]?.status==='connected'&&accounts?.[0]?.connection_mode==='demo','10 fixture server-only de comunicação disponível')
  made.event=await rpc('enqueue_official_communication',{p_organization_id:org,p_lead_id:made.lead,p_account_id:communicationAccountId,p_channel:'whatsapp',p_recipient:'+5500000000000',p_subject:'CR3 E2E',p_body:'CR3 staging probe — sem entrega externa',p_idempotency_key:`cr3-${suffix}`},seller.access_token)
  const [events,outbox]=await Promise.all([
    select('communication_events',{select:'id,thread_id,status,direction,channel',id:`eq.${made.event}`,limit:'1'},seller.access_token),
    select('communication_outbox',{select:'id,event_id,status,channel',event_id:`eq.${made.event}`,limit:'1'},seller.access_token),
  ])
  made.thread=events?.[0]?.thread_id
  assert(events?.[0]?.status==='queued'&&events?.[0]?.direction==='outbound'&&outbox?.[0]?.status==='queued','11 comunicação oficial enfileirada via RPC protegido, sem envio real')

  made.proposal=await rpc('save_sales_proposal',{p_organization_id:org,p_proposal_id:null,p_lead_id:made.lead,p_title:`CR3 Proposta ${suffix}`,p_forecast_category:'best_case',p_probability:60,p_valid_until:new Date(Date.now()+7*86400000).toISOString().slice(0,10),p_expected_close_at:new Date(Date.now()+7*86400000).toISOString().slice(0,10),p_contract_start_at:new Date(Date.now()+8*86400000).toISOString().slice(0,10),p_contract_end_at:null,p_contract_term_months:12,p_auto_renew:false,p_post_sale_start_at:new Date(Date.now()+9*86400000).toISOString().slice(0,10),p_post_sale_cadence_name:'CR3 Onboarding',p_notes:'CR3 staging',p_terms:'CR3 staging',p_items:[{item_order:1,name:'CR3 Serviço',description:'E2E',quantity:1,unit_price:1500,discount_percent:0,tax_rate:0,billing_type:'one_time',billing_interval:null,pricing_source:'manual'}]},seller.access_token);assert(!!made.proposal,'12 proposta criada via RPC real')
  await rpc('set_sales_proposal_status',{p_organization_id:org,p_proposal_id:made.proposal,p_status:'sent'},seller.access_token);assert(true,'13 proposta enviada')
  await rpc('set_sales_proposal_status',{p_organization_id:org,p_proposal_id:made.proposal,p_status:'accepted'},seller.access_token);assert(true,'14 aceite registrado')
  await rpc('close_opportunity_from_proposal',{p_organization_id:org,p_proposal_id:made.proposal},seller.access_token)
  const [opps,leads,post]=await Promise.all([
    select('opportunities',{select:'status,value',id:`eq.${made.opp}`,limit:'1'},seller.access_token),
    select('leads',{select:'status,value',id:`eq.${made.lead}`,limit:'1'},seller.access_token),
    select('activities',{select:'id',organization_id:`eq.${org}`,lead_id:`eq.${made.lead}`,activity_type:'eq.followup',title:'ilike.Iniciar pós-venda*'},seller.access_token),
  ])
  assert(opps?.[0]?.status==='won'&&leads?.[0]?.status==='won'&&post?.length>0,'15 fechamento sincroniza lead/oportunidade e cria pós-venda')

  // Receita usa o contrato canônico atual: recognized_at é o instante do reconhecimento,
  // enquanto competence_date é o período comercial/financeiro obrigatório desde V100.44.
  // Incluímos o campo também no teste negativo para provar que o bloqueio do Vendedor é
  // realmente de autorização, e não apenas uma rejeição por linha inválida.
  const recognizedAt=new Date().toISOString(),competenceDate=recognizedAt.slice(0,10)
  const forbidden=await raw('/rest/v1/revenue_entries?select=id',{method:'POST',body:{organization_id:org,proposal_id:made.proposal,lead_id:made.lead,opportunity_id:made.opp,revenue_type:'one_time',status:'recognized',amount:1500,recognized_at:recognizedAt,competence_date:competenceDate,description:'CR3 seller should fail'},token:seller.access_token,prefer:'return=representation'})
  assert(!forbidden.ok,'16 Vendedor bloqueado ao reconhecer valor de receita')
  r=await insert('revenue_entries',{organization_id:org,proposal_id:made.proposal,lead_id:made.lead,opportunity_id:made.opp,revenue_type:'one_time',status:'recognized',amount:1500,recognized_at:recognizedAt,competence_date:competenceDate,description:'CR3 recognized by manager'},'id,amount',manager.access_token);made.revenue=r.id;assert(Number(r.amount)===1500,'17 Gestor reconhece receita')
  await update('work_tasks',{id:`eq.${made.task}`},{status:'completed',completed_at:new Date().toISOString()},seller.access_token);assert(true,'18 tarefa comercial concluída')
  console.log('CR3 STAGING PASS: login → contato → oportunidade → follow-up/tarefa → comunicação oficial protegida → proposta → aceite → fechamento → receita (HTTP nativo, sem entrega externa).')
}catch(e){console.error('CR3 STAGING FAIL:',e?.message||e);process.exitCode=1}
finally{
  try{if(manager?.access_token&&made.revenue)await del('revenue_entries',{id:`eq.${made.revenue}`},manager.access_token)}catch{}
  try{if(seller?.access_token&&made.task)await del('work_tasks',{id:`eq.${made.task}`},seller.access_token)}catch{}
}
