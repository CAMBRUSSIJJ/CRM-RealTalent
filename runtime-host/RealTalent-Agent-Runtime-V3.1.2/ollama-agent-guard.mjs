import http from 'node:http'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const HOST=process.env.REALTALENT_AGENT_HOST||'127.0.0.1'
const PORT=Number(process.env.REALTALENT_AGENT_PORT||8791)
const INNER_PORT=Number(process.env.REALTALENT_AGENT_INNER_PORT||8792)
const originalGateway=path.join(here,'gateway.mjs')

const child=spawn(process.execPath,[originalGateway],{
  cwd:here,
  env:{...process.env,REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AGENT_PORT:String(INNER_PORT)},
  stdio:'inherit',
})
let shuttingDown=false
child.on('exit',(code,signal)=>{
  console.error(`[agent-inner] encerrou code=${code} signal=${signal||''}`)
  if(!shuttingDown)process.exit(code||1)
})

const json=(res,status,value)=>{
  const body=JSON.stringify(value)
  res.statusCode=status
  res.setHeader('content-type','application/json; charset=utf-8')
  res.setHeader('cache-control','no-store')
  res.end(body)
}

const readBody=(req,limit=900_000)=>new Promise((resolve,reject)=>{
  let size=0;const chunks=[]
  req.on('data',chunk=>{size+=chunk.length;if(size>limit){reject(new Error('payload_too_large'));req.destroy();return}chunks.push(chunk)})
  req.on('end',()=>{try{const raw=Buffer.concat(chunks).toString('utf8');resolve({raw,body:raw?JSON.parse(raw):{}})}catch(error){reject(error)}})
  req.on('error',reject)
})

const plannerText=(value='')=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const isGoalPrompt=(prompt='')=>/\b(meta|metas|objetivo|objetivos|target|targets)\b/.test(plannerText(prompt))
const metricFromPrompt=(prompt='')=>{
  const t=plannerText(prompt)
  const rules=[
    ['calls',/\b(ligacao|ligacoes|chamada|chamadas|telefonema|telefonemas|calls?)\b/],
    ['contacts',/\b(contato|contatos|contacts?)\b/],
    ['followups',/\b(follow[ -]?up|follow[ -]?ups|retorno|retornos)\b/],
    ['meetings',/\b(reuniao|reunioes|meeting|meetings)\b/],
    ['proposals',/\b(proposta|propostas|proposal|proposals)\b/],
    ['wins',/\b(venda|vendas|ganho|ganhos|wins?)\b/],
    ['revenue',/\b(receita|faturamento|revenue)\b/],
    ['new_leads',/\b(novos? leads?|lead|leads)\b/],
  ]
  for(const [metric,re] of rules)if(re.test(t))return metric
  return ''
}
const targetFromPrompt=(prompt='')=>{
  const raw=String(prompt||'').replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,' ').replace(/\b\d{4}-\d{2}-\d{2}\b/g,' ')
  const t=plannerText(raw)
  const patterns=[
    /\bmeta(?:s)?(?:\s+de)?\s+(\d+(?:[.,]\d+)?)/,
    /\b(\d+(?:[.,]\d+)?)\s+(?:ligacao|ligacoes|chamada|chamadas|contato|contatos|follow[ -]?ups?|reuniao|reunioes|proposta|propostas|venda|vendas|leads?)\b/,
    /\b(?:quero|crie|criar|defina|definir|estabeleca|estabelecer)\s+(\d+(?:[.,]\d+)?)/,
  ]
  for(const re of patterns){const m=t.match(re);if(m)return m[1].replace(',','.')}
  return ''
}
const dateFromPrompt=(prompt='',context={})=>{
  const raw=String(prompt||'')
  const dmy=raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if(dmy)return `${dmy[3]}-${String(dmy[2]).padStart(2,'0')}-${String(dmy[1]).padStart(2,'0')}`
  const iso=raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`
  const base=new Date(context?.now||Date.now());if(Number.isNaN(base.getTime()))return ''
  const zone=String(context?.timezone||'America/Sao_Paulo')
  const zoned=d=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const m=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`}
  const t=plannerText(raw)
  if(/\bamanha\b/.test(t))return zoned(new Date(base.getTime()+86400000))
  if(/\bhoje\b/.test(t))return zoned(base)
  return ''
}
const argsObject=(items=[])=>Object.fromEntries((Array.isArray(items)?items:[]).filter(x=>x&&x.name).map(x=>[String(x.name),String(x.value??'')]))
const argsList=obj=>Object.entries(obj).filter(([,v])=>String(v??'').trim()!=='').map(([name,value])=>({name,value:String(value)}))

const repairGoalPlan=(payload,requestBody)=>{
  if(!payload?.ok||!payload?.plan)return payload
  const plan=payload.plan
  const steps=Array.isArray(plan.steps)?plan.steps:[]
  const goalStep=steps.find(step=>step?.capabilityId==='goals.create')
  if(!goalStep)return payload
  if(!(Array.isArray(requestBody?.capabilities)&&requestBody.capabilities.some(item=>item?.id==='goals.create')))return payload

  const prompt=String(requestBody?.prompt||'')
  const context=requestBody?.context&&typeof requestBody.context==='object'?requestBody.context:{}
  const inherited=argsObject(context?.pending_capability?.knownArgs)
  const modelArgs={...argsObject(plan.knownArgs),...argsObject(goalStep.args)}
  const metrics=new Set(['calls','contacts','followups','meetings','proposals','wins','revenue','new_leads'])
  const metric=metricFromPrompt(prompt)||(metrics.has(modelArgs.metric)?modelArgs.metric:'')||(metrics.has(inherited.metric)?inherited.metric:'')
  const target=targetFromPrompt(prompt)||(/^\d+(?:\.\d+)?$/.test(modelArgs.target_value||'')?modelArgs.target_value:'')||(/^\d+(?:\.\d+)?$/.test(inherited.target_value||'')?inherited.target_value:'')
  const periodStart=dateFromPrompt(prompt,context)||(/^\d{4}-\d{2}-\d{2}$/.test(modelArgs.period_start||'')?modelArgs.period_start:'')||(/^\d{4}-\d{2}-\d{2}$/.test(inherited.period_start||'')?inherited.period_start:'')
  const periodEnd=(/^\d{4}-\d{2}-\d{2}$/.test(modelArgs.period_end||'')?modelArgs.period_end:'')||(/^\d{4}-\d{2}-\d{2}$/.test(inherited.period_end||'')?inherited.period_end:'')||periodStart
  const scope=['user','team','organization'].includes(modelArgs.scope)?modelArgs.scope:(['user','team','organization'].includes(inherited.scope)?inherited.scope:'user')
  const repaired={metric,target_value:target,period_start:periodStart,period_end:periodEnd,scope}
  const missing=[]
  if(!metric)missing.push('metric')
  if(!target)missing.push('target_value')
  if(!periodStart)missing.push('period_start')
  const typedArgs=argsList(repaired)
  goalStep.args=typedArgs
  plan.knownArgs=typedArgs
  plan.missingSlots=missing
  plan.pendingCapabilityId=missing.length?'goals.create':''
  plan.needsClarification=missing.length>0
  if(missing.length){
    const first=missing[0]
    plan.clarification=first==='metric'?'Qual tipo de meta você quer criar? Ligações, contatos, follow-ups, reuniões, propostas, vendas, receita ou novos leads?':first==='target_value'?'Qual é o valor da meta?':'Para qual data ou período você quer essa meta?'
    plan.confidence=Math.max(0.75,Math.min(Number(plan.confidence)||0.75,0.92))
    payload.decision='clarify'
  }else{
    const labels={calls:'ligações',contacts:'contatos',followups:'follow-ups',meetings:'reuniões',proposals:'propostas',wins:'vendas',revenue:'receita',new_leads:'novos leads'}
    plan.clarification=''
    plan.confidence=Math.max(Number(plan.confidence)||0,0.95)
    plan.goal=`Criar meta de ${target} ${labels[metric]||metric} para ${periodStart}`
    payload.decision='execute'
  }
  payload.guard={typed:true,capability:'goals.create',repaired:true}
  return payload
}

const semanticFallback=(body,error='semantic_timeout')=>{
  const routed=error==='routed_to_capability_planner'
  return {
    ok:true,version:'3.1.5',
    interpretation:{version:'3.1.5',language:'pt',intent:'unknown',object:'none',action:'none',confidence:routed?0.5:0.4,needs_clarification:false,clarification:'',canonical_request:String(body?.prompt||'').slice(0,500),rationale:routed?'Pedido de meta pertence ao CRM Capability Planner e foi roteado para a capacidade de Metas.':'O Semantic Sales Language não concluiu no tempo disponível; o pedido segue para o Capability Planner.',entities:{contact_query:'',assignee_query:'',task_title:'',due_at_iso:'',explicit_time:false,task_type:'none',criteria:[],reference:''}},
    decision:'fallback',provider:'ollama',model:String(process.env.OLLAMA_FAST_MODEL||process.env.OLLAMA_MODEL||''),modelRole:'classification',degraded:!routed,error,
  }
}

const innerFetch=async(pathname,req,raw,timeoutMs=50_000)=>{
  const headers={}
  for(const [key,value] of Object.entries(req.headers))if(value!=null)headers[key]=Array.isArray(value)?value.join(', '):String(value)
  headers.host=`127.0.0.1:${INNER_PORT}`
  delete headers['content-length']
  return fetch(`http://127.0.0.1:${INNER_PORT}${pathname}`,{method:req.method,headers,body:['GET','HEAD'].includes(String(req.method||'GET').toUpperCase())?undefined:raw,signal:AbortSignal.timeout(timeoutMs)})
}

const proxyStream=(req,res)=>{
  const headers={...req.headers,host:`127.0.0.1:${INNER_PORT}`}
  const upstream=http.request({host:'127.0.0.1',port:INNER_PORT,path:req.url||'/',method:req.method,headers},u=>{res.writeHead(u.statusCode||502,u.headers);u.pipe(res)})
  upstream.on('error',error=>json(res,502,{ok:false,error:'agent_inner_unavailable',message:String(error.message||error)}))
  req.pipe(upstream)
}

const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname.replace(/\/+$/,'')||'/'
  if(req.method==='POST'&&(pathname==='/language/interpret'||pathname==='/capabilities/plan')){
    let parsed
    try{parsed=await readBody(req)}catch(error){return json(res,400,{ok:false,error:String(error.message||error)})}

    // Metas são capacidades executáveis do CRM e não fazem parte do schema de intents
    // do Semantic Sales Language. Evita classificação incorreta e entrega o pedido
    // diretamente ao Capability Planner baseado em Ollama.
    if(pathname==='/language/interpret'&&isGoalPrompt(parsed.body?.prompt)){
      return json(res,200,semanticFallback(parsed.body,'routed_to_capability_planner'))
    }

    try{
      const inner=await innerFetch(pathname,req,parsed.raw,50_000)
      const text=await inner.text()
      let payload
      try{payload=JSON.parse(text)}catch{res.statusCode=inner.status;res.setHeader('content-type',inner.headers.get('content-type')||'text/plain');return res.end(text)}
      if(pathname==='/language/interpret'&&inner.status>=500)return json(res,200,semanticFallback(parsed.body,payload?.error||`semantic_${inner.status}`))
      if(pathname==='/capabilities/plan'&&inner.ok)payload=repairGoalPlan(payload,parsed.body)
      return json(res,inner.status,payload)
    }catch(error){
      if(pathname==='/language/interpret')return json(res,200,semanticFallback(parsed.body,String(error.message||error)))
      return json(res,503,{ok:false,error:'capability_planner_unavailable',message:String(error.message||error)})
    }
  }
  return proxyStream(req,res)
})

server.listen(PORT,HOST,()=>console.log(`RealTalent Ollama Agent Guard em http://${HOST}:${PORT} → Agent :${INNER_PORT}`))
const shutdown=()=>{if(shuttingDown)return;shuttingDown=true;try{server.close()}catch{};try{child.kill('SIGTERM')}catch{};setTimeout(()=>process.exit(0),800).unref()}
process.on('SIGTERM',shutdown)
process.on('SIGINT',shutdown)
