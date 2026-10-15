const CATALOG={
  crm:[
    ['crm.contacts.search','read','Busca contatos/leads com filtros comerciais no snapshot autorizado.'],
    ['crm.contacts.get','read','Obtém um contato/lead autorizado por ID.'],
    ['crm.opportunities.search','read','Busca oportunidades por etapa, status, valor, fechamento e inatividade.'],
    ['crm.opportunities.get','read','Obtém uma oportunidade autorizada por ID.'],
    ['crm.pipeline.summary','read','Resume o pipeline por etapa, quantidade, valor e oportunidades paradas.'],
    ['crm.pipeline.list','read','Lista etapas e oportunidades autorizadas do pipeline.'],
    ['crm.tasks.search','read','Busca tarefas autorizadas por status, prazo, prioridade e responsável.'],
    ['crm.tasks.get','read','Obtém uma tarefa autorizada por ID.'],
    ['crm.followups.search','read','Busca follow-ups autorizados, inclusive vencidos e de hoje.'],
    ['crm.myday.read','read','Monta o Meu Dia com tarefas, follow-ups, agenda e oportunidades prioritárias.'],
    ['crm.calendar.read','read','Lê compromissos autorizados da agenda.'],
    ['crm.contacts.update','write','Atualiza contato/lead; requer confirmação e execução no aplicativo.'],
    ['crm.pipeline.moveOpportunity','write','Move oportunidade; requer confirmação e execução no aplicativo.'],
    ['crm.communications.getThread','read','Obtém thread disponível no contexto da tela.'],
    ['crm.communications.sendMessage','write','Envia mensagem; requer confirmação explícita no aplicativo.'],
    ['crm.prospecting.runSearch','write','Inicia Garimpo; requer confirmação explícita no aplicativo.']
  ],
  blue_ocean:[
    ['blueOcean.journey.get','read','Obtém uma jornada do contexto ativo.'],['blueOcean.blueprint.get','read','Obtém o blueprint atual.'],
    ['blueOcean.persona.get','read','Obtém uma persona do Discovery.'],['blueOcean.serviceGraph.read','read','Lê o grafo de serviço/contexto ativo.']
  ]
}

export const crmNativeReadInfo={
  version:'1.0',release:'3.1.2',mode:'read-only',product:'crm',
  domains:['contacts','opportunities','pipeline','tasks','followups','my_day','calendar'],
  zeroMutation:true,source:'app-context-authorized-snapshot',maxResultRows:100,
}

export function nativeAppToolCatalog(product=null,{readOnly=false}={}){
  let entries=product&&CATALOG[product]?CATALOG[product]:[...CATALOG.crm,...CATALOG.blue_ocean]
  if(readOnly)entries=entries.filter(([,capability])=>capability==='read')
  return entries.map(([name,capability,description])=>({name,capability,description,confirmation:capability==='write',execution:capability==='write'?'delegated-to-app':'runtime',nativeReadV1:product==='crm'&&capability==='read'}))
}

const norm=(v)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const list=(v)=>Array.isArray(v)?v:[]
const dataOf=(ctx)=>ctx?.data||{}
const findById=(arr,id)=>list(arr).find((x)=>String(x?.id)===String(id))||null
const num=(v,fallback=null)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}
const bool=(v)=>v===true||v==='true'||v===1||v==='1'
const msDay=86400000
const dateMs=(v)=>{const n=Date.parse(String(v||''));return Number.isFinite(n)?n:null}
const startOfDay=(v=Date.now())=>{const d=new Date(v);d.setHours(0,0,0,0);return d.getTime()}
const endOfDay=(v=Date.now())=>startOfDay(v)+msDay-1
const daysSince=(v,now=Date.now())=>{const t=dateMs(v);return t==null?null:Math.floor((now-t)/msDay)}
const withinDays=(v,days,now=Date.now())=>{const t=dateMs(v);return t!=null&&t>=startOfDay(now)&&t<=endOfDay(now)+Math.max(0,days-1)*msDay}
const dueToday=(v,now=Date.now())=>{const t=dateMs(v);return t!=null&&t>=startOfDay(now)&&t<=endOfDay(now)}
const overdue=(v,now=Date.now())=>{const t=dateMs(v);return t!=null&&t<startOfDay(now)}
const clampLimit=(v,def=30)=>Math.max(1,Math.min(100,Number(v||def)||def))
const uniqueBy=(arr,key='id')=>[...new Map(list(arr).map(x=>[String(x?.[key]??''),x])).values()].filter(x=>String(x?.[key]??''))
const sourceMeta=(ctx,tool,rows)=>({tool,readOnly:true,source:'app-context-authorized-snapshot',capturedAt:ctx?.capturedAt||null,workspaceId:ctx?.workspace?.id||null,rows:Number(rows||0)})

const indexes=(d)=>{
  const stages=new Map(list(d.stages).map(x=>[String(x.id),x]));
  const companies=new Map(list(d.companies).map(x=>[String(x.id),x]));
  const leads=new Map(list(d.leads).map(x=>[String(x.id),x]));
  const contacts=new Map(list(d.contacts).map(x=>[String(x.id),x]));
  const opportunities=new Map(list(d.opportunities).map(x=>[String(x.id),x]));
  return {stages,companies,leads,contacts,opportunities}
}

const lastTouchByLead=(d)=>{
  const map=new Map();
  for(const a of list(d.activities)){
    if(!a?.leadId)continue;const t=dateMs(a.completedAt||a.updatedAt||a.createdAt);if(t!=null&&t>(map.get(String(a.leadId))||0))map.set(String(a.leadId),t)
  }
  for(const a of list(d.openActivities)){
    if(!a?.leadId)continue;const t=dateMs(a.updatedAt||a.createdAt);if(t!=null&&t>(map.get(String(a.leadId))||0))map.set(String(a.leadId),t)
  }
  return map
}

const openFollowups=(d)=>uniqueBy([...list(d.followups),...list(d.activities).filter(a=>a?.type==='followup'&&!a.completedAt&&a.resolutionStatus!=='cancelled'),...list(d.openActivities).filter(a=>a?.type==='followup')])
const tasksOf=(d)=>uniqueBy(list(d.tasks))
const eventsOf=(d)=>uniqueBy(list(d.events))

const contactRows=(d,now=Date.now())=>{
  const ix=indexes(d);const touches=lastTouchByLead(d);const followups=openFollowups(d);const opps=list(d.opportunities)
  const contacts=list(d.contacts).map(c=>{
    const leadIds=list(c.leadIds).map(String);const relatedLeads=leadIds.map(id=>ix.leads.get(id)).filter(Boolean)
    const relatedOpps=opps.filter(o=>String(o.primaryContactId||'')===String(c.id)||leadIds.includes(String(o.leadId||'')))
    const latestLeadTouch=Math.max(0,...leadIds.map(id=>touches.get(id)||0));const explicit=dateMs(c.lastContactAt)||0;const last=Math.max(explicit,latestLeadTouch)
    const pending=followups.filter(f=>String(f.contactId||'')===String(c.id)||leadIds.includes(String(f.leadId||'')))
    return {...c,companyName:ix.companies.get(String(c.companyId||''))?.name||'',leadIds,lastContactAt:last?new Date(last).toISOString():(c.lastContactAt||null),daysSinceLastContact:last?Math.floor((now-last)/msDay):null,nextFollowupAt:pending.map(f=>f.dueAt).filter(Boolean).sort()[0]||c.nextActionAt||null,openFollowups:pending.length,openOpportunities:relatedOpps.filter(o=>!['won','lost','archived'].includes(String(o.status||''))).length,openOpportunityValue:relatedOpps.filter(o=>!['won','lost','archived'].includes(String(o.status||''))).reduce((s,o)=>s+Number(o.value||0),0)}
  })
  const leadOnly=list(d.leads).filter(l=>!contacts.some(c=>list(c.leadIds).map(String).includes(String(l.id)))).map(l=>({id:l.id,name:l.name,companyName:l.company||'',companyId:l.companyId||null,jobTitle:'',phone:l.phone||'',email:l.email||'',leadIds:[l.id],ownerId:l.ownerId||null,lastContactAt:(touches.get(String(l.id))?new Date(touches.get(String(l.id))).toISOString():null),daysSinceLastContact:touches.get(String(l.id))?Math.floor((now-touches.get(String(l.id)))/msDay):null,nextFollowupAt:followups.filter(f=>String(f.leadId||'')===String(l.id)).map(f=>f.dueAt).filter(Boolean).sort()[0]||null,openFollowups:followups.filter(f=>String(f.leadId||'')===String(l.id)).length,openOpportunities:opps.filter(o=>String(o.leadId||'')===String(l.id)&&!['won','lost','archived'].includes(String(o.status||''))).length,openOpportunityValue:opps.filter(o=>String(o.leadId||'')===String(l.id)&&!['won','lost','archived'].includes(String(o.status||''))).reduce((s,o)=>s+Number(o.value||0),0),source:'lead'}))
  return [...contacts,...leadOnly]
}

const opportunityRows=(d,now=Date.now())=>{const ix=indexes(d);const touches=lastTouchByLead(d);return list(d.opportunities).map(o=>{const lead=ix.leads.get(String(o.leadId||''));const last=Math.max(dateMs(o.updatedAt)||0,touches.get(String(o.leadId||''))||0);return {...o,title:o.title||lead?.company||lead?.name||'Oportunidade',companyName:ix.companies.get(String(o.companyId||''))?.name||lead?.company||'',contactName:ix.contacts.get(String(o.primaryContactId||''))?.name||'',stageName:ix.stages.get(String(o.stageId||''))?.name||'',stageProbability:ix.stages.get(String(o.stageId||''))?.probability??null,lastActivityAt:last?new Date(last).toISOString():null,daysWithoutActivity:last?Math.floor((now-last)/msDay):null}})}

const toolResult=(ctx,name,result)=>({ok:true,status:'ok',tool:name,result,evidence:sourceMeta(ctx,name,Array.isArray(result)?result.length:(result?.items?.length||0))})

export function executeNativeAppTool({name,args={},context}={}){
  const spec=nativeAppToolCatalog().find((x)=>x.name===name)
  if(!spec)return {ok:false,status:'unknown_tool',error:'Ferramenta nativa desconhecida.'}
  if(spec.capability==='write') return {ok:false,status:'requires_confirmation',tool:name,confirmation:true,error:'Ação de escrita bloqueada no runtime. Confirme e execute pelo aplicativo conectado.',proposal:{tool:name,args}}
  if(!context)return {ok:false,status:'missing_app_context',error:'App Context Bridge sem snapshot atual.'}
  const d=dataOf(context);const now=dateMs(d.asOf||context.rawContext?.now)||Date.now();const ix=indexes(d)

  if(name==='crm.contacts.search'){
    const q=norm(args.query||args.q||'');const stale=num(args.withoutFollowupDays??args.staleDays,null);const hasOpen=args.hasOpenOpportunity==null?null:bool(args.hasOpenOpportunity);const missing=norm(args.missingField||'')
    let rows=contactRows(d,now)
    rows=rows.filter(x=>!q||norm(`${x.name||''} ${x.companyName||x.company||''} ${x.jobTitle||''} ${x.email||''} ${x.phone||''} ${x.id||''}`).includes(q))
    if(stale!=null)rows=rows.filter(x=>x.daysSinceLastContact==null||x.daysSinceLastContact>=stale)
    if(hasOpen!=null)rows=rows.filter(x=>(x.openOpportunities>0)===hasOpen)
    if(missing)rows=rows.filter(x=>{if(missing==='telefone'||missing==='phone')return !String(x.phone||'').trim();if(missing==='email')return !String(x.email||'').trim();if(missing==='responsavel'||missing==='owner')return !String(x.ownerId||'').trim();return true})
    rows.sort((a,b)=>(Number(b.openOpportunityValue||0)-Number(a.openOpportunityValue||0))||((b.daysSinceLastContact??9999)-(a.daysSinceLastContact??9999)))
    return toolResult(context,name,rows.slice(0,clampLimit(args.limit)))
  }
  if(name==='crm.contacts.get') return toolResult(context,name,findById(contactRows(d,now),args.id))

  if(name==='crm.opportunities.search'){
    const q=norm(args.query||args.q||'');const stale=num(args.staleDays,null);const closeDays=num(args.closingWithinDays,null);const min=num(args.minValue,null);const max=num(args.maxValue,null);const status=norm(args.status||'');const stage=String(args.stageId||'');const owner=String(args.ownerId||'');const riskOnly=bool(args.riskOnly)
    let rows=opportunityRows(d,now).filter(x=>!q||norm(`${x.title||''} ${x.companyName||''} ${x.contactName||''} ${x.stageName||''} ${x.id||''}`).includes(q))
    if(status)rows=rows.filter(x=>norm(x.status)===status);if(stage)rows=rows.filter(x=>String(x.stageId)===stage);if(owner)rows=rows.filter(x=>String(x.ownerId||'')===owner)
    if(stale!=null)rows=rows.filter(x=>(x.daysWithoutActivity??9999)>=stale);if(closeDays!=null)rows=rows.filter(x=>withinDays(x.expectedCloseAt,closeDays,now));if(min!=null)rows=rows.filter(x=>Number(x.value||0)>=min);if(max!=null)rows=rows.filter(x=>Number(x.value||0)<=max)
    if(riskOnly)rows=rows.filter(x=>!['won','lost','archived'].includes(norm(x.status))&&((x.daysWithoutActivity??0)>=7||(x.expectedCloseAt&&dateMs(x.expectedCloseAt)<startOfDay(now))))
    rows.sort((a,b)=>Number(b.value||0)-Number(a.value||0));return toolResult(context,name,rows.slice(0,clampLimit(args.limit)))
  }
  if(name==='crm.opportunities.get')return toolResult(context,name,findById(opportunityRows(d,now),args.id))

  if(name==='crm.pipeline.list') return toolResult(context,name,{stages:list(d.stages),opportunities:opportunityRows(d,now),leads:list(d.leads)})
  if(name==='crm.pipeline.summary'){
    const opps=opportunityRows(d,now);const stages=list(d.stages).map(s=>{const rows=opps.filter(o=>String(o.stageId)===String(s.id)&&!['lost','archived'].includes(norm(o.status)));return {id:s.id,name:s.name,order:s.order,probability:s.probability,count:rows.length,value:rows.reduce((n,o)=>n+Number(o.value||0),0),stale7:rows.filter(o=>(o.daysWithoutActivity??0)>=7).length,stale14:rows.filter(o=>(o.daysWithoutActivity??0)>=14).length}})
    const active=opps.filter(o=>!['won','lost','archived'].includes(norm(o.status)));const total=active.reduce((n,o)=>n+Number(o.value||0),0)
    return toolResult(context,name,{stages,totalOpen:active.length,totalOpenValue:total,weightedValue:active.reduce((n,o)=>n+Number(o.value||0)*Number((o.probability??o.stageProbability??0))/100,0),stale7:active.filter(o=>(o.daysWithoutActivity??0)>=7).length,stale14:active.filter(o=>(o.daysWithoutActivity??0)>=14).length,closing7:active.filter(o=>withinDays(o.expectedCloseAt,7,now)).length})
  }

  if(name==='crm.tasks.search'){
    let rows=tasksOf(d);const q=norm(args.query||args.q||'');const status=norm(args.status||'');const priority=norm(args.priority||'');const assignee=String(args.assigneeId||'');
    rows=rows.filter(x=>!q||norm(`${x.title||''} ${x.description||''} ${x.assigneeName||''} ${(x.tags||[]).join(' ')}`).includes(q));if(status)rows=rows.filter(x=>norm(x.status)===status);if(priority)rows=rows.filter(x=>norm(x.priority)===priority);if(assignee)rows=rows.filter(x=>String(x.assigneeId||'')===assignee);if(bool(args.overdue))rows=rows.filter(x=>!['completed','cancelled'].includes(norm(x.status))&&overdue(x.dueAt,now));if(bool(args.dueToday))rows=rows.filter(x=>!['completed','cancelled'].includes(norm(x.status))&&dueToday(x.dueAt,now))
    rows.sort((a,b)=>(dateMs(a.dueAt)||Number.MAX_SAFE_INTEGER)-(dateMs(b.dueAt)||Number.MAX_SAFE_INTEGER));return toolResult(context,name,rows.slice(0,clampLimit(args.limit)))
  }
  if(name==='crm.tasks.get')return toolResult(context,name,findById(tasksOf(d),args.id))

  if(name==='crm.followups.search'){
    let rows=openFollowups(d);const q=norm(args.query||args.q||'');const lead=String(args.leadId||'');const assigned=String(args.assignedTo||'');
    rows=rows.filter(x=>!q||norm(`${x.title||''} ${x.description||''} ${x.id||''}`).includes(q));if(lead)rows=rows.filter(x=>String(x.leadId||'')===lead);if(assigned)rows=rows.filter(x=>String(x.assignedTo||'')===assigned);if(bool(args.overdue))rows=rows.filter(x=>overdue(x.dueAt,now));if(bool(args.dueToday))rows=rows.filter(x=>dueToday(x.dueAt,now));
    rows=rows.map(x=>({...x,leadName:ix.leads.get(String(x.leadId||''))?.name||'',companyName:ix.leads.get(String(x.leadId||''))?.company||'',daysOverdue:overdue(x.dueAt,now)?Math.max(1,Math.floor((startOfDay(now)-(dateMs(x.dueAt)||startOfDay(now)))/msDay)):0})).sort((a,b)=>(dateMs(a.dueAt)||Number.MAX_SAFE_INTEGER)-(dateMs(b.dueAt)||Number.MAX_SAFE_INTEGER));return toolResult(context,name,rows.slice(0,clampLimit(args.limit)))
  }

  if(name==='crm.calendar.read'){
    let rows=eventsOf(d).filter(x=>norm(x.status)!=='cancelled');const days=num(args.days,1);const assigned=String(args.assignedTo||'');if(assigned)rows=rows.filter(x=>String(x.assignedTo||'')===assigned);rows=rows.filter(x=>withinDays(x.startsAt,days,now)).sort((a,b)=>(dateMs(a.startsAt)||0)-(dateMs(b.startsAt)||0));return toolResult(context,name,rows.slice(0,clampLimit(args.limit,50)))
  }

  if(name==='crm.myday.read'){
    const userId=String(args.userId||context?.user?.id||'');const mine=(v)=>!userId||!v||String(v)===userId
    const tasks=tasksOf(d).filter(x=>mine(x.assigneeId)&&!['completed','cancelled'].includes(norm(x.status))&&(bool(args.includeUpcoming)?withinDays(x.dueAt,3,now):dueToday(x.dueAt,now)||overdue(x.dueAt,now))).sort((a,b)=>(dateMs(a.dueAt)||0)-(dateMs(b.dueAt)||0))
    const followups=openFollowups(d).filter(x=>mine(x.assignedTo)&&(dueToday(x.dueAt,now)||overdue(x.dueAt,now))).sort((a,b)=>(dateMs(a.dueAt)||0)-(dateMs(b.dueAt)||0))
    const events=eventsOf(d).filter(x=>mine(x.assignedTo)&&norm(x.status)!=='cancelled'&&dueToday(x.startsAt,now)).sort((a,b)=>(dateMs(a.startsAt)||0)-(dateMs(b.startsAt)||0))
    const opportunities=opportunityRows(d,now).filter(x=>mine(x.ownerId)&&!['won','lost','archived'].includes(norm(x.status))&&((x.daysWithoutActivity??0)>=7||withinDays(x.expectedCloseAt,7,now))).sort((a,b)=>Number(b.value||0)-Number(a.value||0)).slice(0,12)
    return toolResult(context,name,{date:new Date(now).toISOString().slice(0,10),userId:userId||null,summary:{overdueTasks:tasks.filter(x=>overdue(x.dueAt,now)).length,todayTasks:tasks.filter(x=>dueToday(x.dueAt,now)).length,overdueFollowups:followups.filter(x=>overdue(x.dueAt,now)).length,todayFollowups:followups.filter(x=>dueToday(x.dueAt,now)).length,meetings:events.length,priorityOpportunities:opportunities.length},tasks:tasks.slice(0,20),followups:followups.slice(0,20),events:events.slice(0,20),opportunities})
  }

  if(name==='crm.communications.getThread'){const threads=list(d.communicationThreads||d.threads);return toolResult(context,name,args.id?findById(threads,args.id):threads.slice(0,30))}
  if(name==='blueOcean.journey.get') return toolResult(context,name,findById(list(d.journeys),args.id)||list(d.journeys)[0]||null)
  if(name==='blueOcean.blueprint.get') return toolResult(context,name,d.blueprintDraft||d.blueprint||null)
  if(name==='blueOcean.persona.get'){const personas=list(d.discovery?.personas);return toolResult(context,name,findById(personas,args.id)||personas.find((x)=>norm(x.title).includes(norm(args.query||'')))||null)}
  if(name==='blueOcean.serviceGraph.read') return toolResult(context,name,d)
  return {ok:false,status:'unsupported_read',error:'Ferramenta ainda não possui executor de leitura.'}
}
