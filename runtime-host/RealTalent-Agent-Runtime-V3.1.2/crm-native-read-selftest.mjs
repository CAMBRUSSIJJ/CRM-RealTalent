import assert from 'node:assert/strict'
import {executeNativeAppTool,nativeAppToolCatalog,crmNativeReadInfo} from './app-tools.mjs'
import {crmReadToolSelection,runCrmNativeRead,renderCrmNativeRead,crmNativeReadCatalog} from './crm-native-read.mjs'

const now='2026-10-14T12:00:00.000Z'
const context={capturedAt:now,workspace:{id:'w1',name:'RealTalent'},user:{id:'u1',role:'admin'},data:{asOf:now,
 stages:[{id:'s1',name:'Qualificação',order:1,probability:30},{id:'s2',name:'Negociação',order:2,probability:70}],
 companies:[{id:'co1',name:'Acme'}],
 leads:[{id:'l1',name:'Ana',company:'Acme',companyId:'co1',ownerId:'u1',updatedAt:'2026-10-01T10:00:00Z'},{id:'l2',name:'Bruno',company:'Beta',companyId:null,ownerId:'u2',updatedAt:'2026-10-13T10:00:00Z'}],
 contacts:[{id:'c1',name:'Ana Compras',companyId:'co1',leadIds:['l1'],phone:'',email:'ana@acme.com',lastContactAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-01T10:00:00Z'}],
 opportunities:[{id:'o1',leadId:'l1',companyId:'co1',primaryContactId:'c1',title:'Projeto Acme',stageId:'s2',status:'active',value:50000,ownerId:'u1',expectedCloseAt:'2026-10-18T00:00:00Z',probability:70,updatedAt:'2026-10-01T10:00:00Z'},{id:'o2',leadId:'l2',companyId:null,primaryContactId:null,title:'Beta',stageId:'s1',status:'active',value:10000,ownerId:'u2',expectedCloseAt:'2026-11-10T00:00:00Z',probability:30,updatedAt:'2026-10-13T10:00:00Z'}],
 activities:[{id:'a1',leadId:'l1',contactId:'c1',type:'followup',title:'Retornar Acme',description:'',dueAt:'2026-10-12T10:00:00Z',completedAt:null,resolutionStatus:'pending',assignedTo:'u1',createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-01T10:00:00Z'}],
 openActivities:[{id:'a1',leadId:'l1',contactId:'c1',type:'followup',title:'Retornar Acme',description:'',dueAt:'2026-10-12T10:00:00Z',assignedTo:'u1',createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-01T10:00:00Z'}],
 tasks:[{id:'t1',title:'Ligar Acme',description:'',status:'todo',priority:'high',dueAt:'2026-10-13T10:00:00Z',assigneeId:'u1',assigneeName:'Marcelo',teamId:null,tags:[],createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-01T10:00:00Z'},{id:'t2',title:'Preparar reunião',description:'',status:'todo',priority:'normal',dueAt:'2026-10-14T16:00:00Z',assigneeId:'u1',assigneeName:'Marcelo',teamId:null,tags:[],createdAt:'2026-10-10T10:00:00Z',updatedAt:'2026-10-10T10:00:00Z'}],
 events:[{id:'e1',leadId:'l1',title:'Reunião Acme',startsAt:'2026-10-14T15:00:00Z',endsAt:'2026-10-14T16:00:00Z',status:'confirmed',assignedTo:'u1'}]
}}
let pass=0
const t=(name,fn)=>{try{fn();pass++;console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}}
t('manifest read-only',()=>{assert.equal(crmNativeReadInfo.mode,'read-only');assert.equal(crmNativeReadInfo.zeroMutation,true)})
t('catálogo V1 não contém write',()=>{const c=crmNativeReadCatalog();assert.ok(c.length>=10);assert.ok(c.every(x=>x.capability==='read'))})
t('roteia contatos sem follow-up',()=>{const s=crmReadToolSelection('Mostre contatos sem follow-up há mais de 7 dias');assert.equal(s.tool,'crm.contacts.search');assert.equal(s.args.withoutFollowupDays,7)})
t('roteia pipeline',()=>assert.equal(crmReadToolSelection('Analise meu pipeline').tool,'crm.pipeline.summary'))
t('roteia tarefas vencidas',()=>{const s=crmReadToolSelection('Quais tarefas estão vencidas?');assert.equal(s.tool,'crm.tasks.search');assert.equal(s.args.overdue,true)})
t('roteia follow-ups',()=>{const s=crmReadToolSelection('Quais follow-ups estão atrasados?');assert.equal(s.tool,'crm.followups.search');assert.equal(s.args.overdue,true)})
t('roteia Meu Dia',()=>assert.equal(crmReadToolSelection('Prepare meu dia').tool,'crm.myday.read'))
t('contatos stale usam dados reais',()=>{const r=runCrmNativeRead({message:'contatos sem follow-up há mais de 7 dias',context});assert.equal(r.ok,true);assert.ok(r.result.some(x=>x.id==='c1'));assert.equal(r.evidence.source,'app-context-authorized-snapshot')})
t('oportunidades em risco',()=>{const r=executeNativeAppTool({name:'crm.opportunities.search',args:{riskOnly:true},context});assert.equal(r.ok,true);assert.equal(r.result[0].id,'o1')})
t('pipeline agrega valor',()=>{const r=executeNativeAppTool({name:'crm.pipeline.summary',context});assert.equal(r.result.totalOpen,2);assert.equal(r.result.totalOpenValue,60000);assert.ok(r.result.stale7>=1)})
t('tarefas vencidas',()=>{const r=executeNativeAppTool({name:'crm.tasks.search',args:{overdue:true},context});assert.deepEqual(r.result.map(x=>x.id),['t1'])})
t('follow-up vencido',()=>{const r=executeNativeAppTool({name:'crm.followups.search',args:{overdue:true},context});assert.equal(r.result.length,1);assert.equal(r.result[0].id,'a1')})
t('Meu Dia agrega 4 fontes',()=>{const r=executeNativeAppTool({name:'crm.myday.read',context});assert.equal(r.result.summary.overdueTasks,1);assert.equal(r.result.summary.todayTasks,1);assert.equal(r.result.summary.overdueFollowups,1);assert.equal(r.result.summary.meetings,1);assert.ok(r.result.summary.priorityOpportunities>=1)})
t('renderização grounded',()=>{const r=runCrmNativeRead({message:'Prepare meu dia',context});const md=renderCrmNativeRead(r);assert.match(md,/Meu Dia/);assert.match(md,/Tarefas vencidas/)})
t('write permanece bloqueado',()=>{const r=executeNativeAppTool({name:'crm.contacts.update',args:{id:'c1'},context});assert.equal(r.status,'requires_confirmation');assert.equal(r.confirmation,true)})
t('pergunta conceitual sobre pessoa não vira consulta CRM',()=>{assert.equal(crmReadToolSelection('Por que uma empresa perde eficiência quando centraliza decisões em uma pessoa?'),null)})
t('catalog geral preserva writes como confirmation',()=>{const x=nativeAppToolCatalog('crm').find(x=>x.name==='crm.contacts.update');assert.equal(x.confirmation,true)})
console.log(`RESULT ${pass}/17`)
if(pass!==17)process.exit(1)
