import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { persistEvaluationReport, evaluateReleaseGate, loadAcceptedBaseline, CATEGORY_FLOORS } from './reliability-evaluation.mjs'
import { loadRegressionLatest, learningReleaseGate } from './learning-evaluation.mjs'

const HERE=path.dirname(fileURLToPath(import.meta.url))
const BASE=String(process.env.REALTALENT_AGENT_GATEWAY_URL||'http://127.0.0.1:8791').replace(/\/$/,'')
const profile=process.argv.includes('--full')?'full':'quick'
const noPersist=process.argv.includes('--no-persist')
const results=[]
const request=async(url,opt={})=>{try{const r=await fetch(BASE+url,{headers:{'content-type':'application/json'},...opt});const x=await r.json().catch(()=>({}));return{ok:r.ok,status:r.status,x}}catch(e){return{ok:false,status:0,x:{error:String(e?.message||e)}}}}
const add=(category,name,pass,weight,detail='')=>results.push({category,name,pass:Boolean(pass),weight,earned:pass?weight:0,detail:String(detail||'').slice(0,1200)})
const cmd=(file,args=[],timeout=180000)=>spawnSync(file.endsWith('.py')?'python3':process.execPath,[path.join(HERE,file),...args],{cwd:HERE,encoding:'utf8',timeout,env:{...process.env}})
const commandPass=(category,name,file,args,weight,pattern=null)=>{const r=cmd(file,args);const text=(r.stdout||'')+(r.stderr||'');add(category,name,r.status===0&&(!pattern||pattern.test(text)),weight,text.slice(-900))}

const health=await request('/health')
if(!health.ok){console.error('RealTalent Agent não está online em '+BASE+'. Abra o runtime antes do benchmark.');process.exit(2)}

// Conversation — 100
const convCases=[
  ['oi',[], 'greeting',true,0],
  ['como posso me amar?',[], 'personal_emotional',true,0],
  ['o que é CRM?',[], 'general_question',false,0],
  ['e qual a diferença para ERP?',[{role:'user',content:'o que é CRM?'},{role:'assistant',content:'CRM organiza relacionamento com clientes.'}], 'follow_up',false,8],
  ['onde está implementado o WhatsApp?',[], 'project_question',false,6],
]
for(const [message,messages,intent,topicShift,ctx] of convCases){const r=await request('/conversation-intelligence/classify',{method:'POST',body:JSON.stringify({message,messages,product:'auto',mode:'auto'})});const p=r.x.plan||{};add('conversation',message,r.ok&&p.intent===intent&&p.topicShift===topicShift&&Number(p.contextMessages||0)===ctx,20,JSON.stringify({intent:p.intent,topicShift:p.topicShift,contextMessages:p.contextMessages}))}

// Context — 100
const contextCases=[
  ['oi',[{role:'user',content:'o que é CRM?'},{role:'assistant',content:'CRM é...'}],p=>p.topicShift===true&&p.contextMessages===0&&!p.includeProjectAwareness],
  ['como posso me amar?',[{role:'user',content:'o que é CRM?'},{role:'assistant',content:'CRM é...'}],p=>p.topicShift===true&&p.contextMessages===0&&/usuário/.test(p.perspectiveNote||'')],
  ['e quais módulos ele possui?',[{role:'user',content:'o que é CRM?'},{role:'assistant',content:'CRM organiza vendas.'}],p=>p.intent==='follow_up'&&p.contextMessages>0],
  ['onde está o gateway?',[{role:'user',content:'vamos revisar o WhatsApp do CRM'},{role:'assistant',content:'Certo.'}],p=>p.includeProjectAwareness===true],
  ['obrigado',[{role:'user',content:'erro no pipeline'},{role:'assistant',content:'Vou analisar.'}],p=>p.intent==='thanks'&&p.contextMessages===0],
]
for(const [message,messages,test] of contextCases){const r=await request('/conversation-intelligence/classify',{method:'POST',body:JSON.stringify({message,messages,product:'auto',mode:'auto'})});const p=r.x.plan||{};add('context',message,r.ok&&test(p),20,JSON.stringify(p))}

// Tool selection — 100
const routeCases=[
  ['Preparar todo o CRM para comercialização','crm','program',15],
  ['Sincronizar CRM e Blue Ocean em fluxo ponta a ponta','both','mission',15],
  ['Corrigir layout da tela de Contatos','crm','builder',15],
  ['Validar a tela sem alterar nada','crm','qa',15],
  ['Revisar o funil e depois validar etapas','crm','workflow',15],
  ['Melhorar o blueprint do serviço','blue_ocean','builder',10],
  ['Investigue por que o WhatsApp duplica mensagens, corrija e valide','crm','engineering',15],
]
for(const [objective,product,expected,weight] of routeCases){const r=await request('/intelligence/classify',{method:'POST',body:JSON.stringify({objective,product})});add('tool_selection',objective,r.ok&&r.x.route?.kind===expected,weight,`esperado=${expected}; recebido=${r.x.route?.kind||'erro'}`)}

// Project Knowledge — 100
commandPass('project_knowledge','Project Awareness','project-awareness-selftest.mjs',[],40)
commandPass('project_knowledge','Project Brain','project-brain-selftest.mjs',[],60)

// Grounding / hallucination — 100
commandPass('grounding','Grounding & hallucination guard','grounding-selftest.mjs',[],100)

// Coding — 100
commandPass('coding','Builder isolation & rollback','builder_agent.py',['--self-test'],100)

// Visual QA — 100
commandPass('visual_qa','Browser QA','browser_qa.py',['--self-test'],40)
commandPass('visual_qa','Deep Visual QA','browser_qa.py',['--deep-self-test'],60)

// Recovery — 100
commandPass('recovery','Autonomous Engineering recovery','autonomous-engineering-selftest.mjs',[],100)

// Governance — 100
commandPass('governance','Governance policies','governance-selftest.mjs',[],45)
commandPass('governance','Identity & Team Governance','identity-team-governance-selftest.mjs',[],55)

// Continuous reliability — 100
commandPass('continuous','Continuous Agent','continuous-agent-selftest.mjs',[],60)
commandPass('continuous','Runtime contract audit','audit.mjs',[],40,/contratos aprovados|PASS/)

if(profile==='full'){
  // Full profile adds evidence but does not change the fixed 1000 score.
  const extras=[['workflow-selftest.mjs'],['mission-selftest.mjs'],['program-selftest.mjs'],['local-ai-selftest.mjs'],['intelligence-selftest.mjs'],['chat-experience-selftest.mjs'],['conversational-workbench-selftest.mjs'],['conversation-intelligence-selftest.mjs'],['conversation-intelligence-gateway-selftest.mjs']]
  for(const [file] of extras){const r=cmd(file,[],240000);results.push({category:'full_evidence',name:file,pass:r.status===0,weight:0,earned:0,detail:((r.stdout||'')+(r.stderr||'')).slice(-900)})}
}

const categoryIds=['conversation','context','project_knowledge','grounding','tool_selection','coding','visual_qa','recovery','governance','continuous']
const categories=categoryIds.map(id=>{const rows=results.filter(x=>x.category===id);const score=rows.reduce((s,x)=>s+x.earned,0),max=rows.reduce((s,x)=>s+x.weight,0);return{id,label:id.replaceAll('_',' '),score,max,percent:max?Math.round(score/max*100):0,floor:CATEGORY_FLOORS[id],pass:max?Math.round(score/max*100)>=CATEGORY_FLOORS[id]:false,tests:rows}})
const score=categories.reduce((s,x)=>s+x.score,0), total=categories.reduce((s,x)=>s+x.max,0), percent=Math.round(score/total*100)
const report={id:`eval_${crypto.randomUUID()}`,suiteVersion:'2.0',agentVersion:String(health.x.version||'unknown'),profile,generatedAt:new Date().toISOString(),score,total,percent,status:'PENDING_GATE',categories,extraEvidence:results.filter(x=>x.category==='full_evidence'),runtime:{architecture:health.x.architecture||null,aiProvider:health.x.aiProvider||health.x.ai_provider||null}}
const baseline=loadAcceptedBaseline();const gate=evaluateReleaseGate(report,baseline);const fullFailures=report.extraEvidence.filter(x=>!x.pass);if(profile==='full'&&fullFailures.length){gate.pass=false;gate.status='BLOCKED';gate.reasons=[...(gate.reasons||[]),`full profile: ${fullFailures.length} self-test(s) adicionais falharam`];gate.fullEvidenceFailures=fullFailures.map(x=>x.name)}
const learningRun=cmd('learning-regression-benchmark.mjs',noPersist?['--no-persist']:[],180000);const learningText=((learningRun.stdout||'')+(learningRun.stderr||'')).slice(-3000);const learningReport=noPersist?null:loadRegressionLatest();const learningGate=learningReport?learningReleaseGate(learningReport):{pass:learningRun.status===0,status:learningRun.status===0?'PASS':'BLOCKED',reasons:learningRun.status===0?[]:['Known-failure regression V2.6 falhou.']};report.learningRegression={pass:learningRun.status===0,exitCode:learningRun.status,report:learningReport?{id:learningReport.id,total:learningReport.total,passed:learningReport.passed,failed:learningReport.failed,passPercent:learningReport.passPercent,datasetHash:learningReport.datasetHash}:null,gate:learningGate,detail:learningText};if(learningRun.status!==0||!learningGate.pass){gate.pass=false;gate.status='BLOCKED';gate.reasons=[...(gate.reasons||[]),...(learningGate.reasons||['Known-failure regression V2.6 bloqueou a release.'])]}report.gate=gate;report.status=gate.pass?'PASS':'BLOCKED'
if(!noPersist)persistEvaluationReport(report)
console.log(`RealTalent Agent Reliability Benchmark V2.0 — ${score}/${total} (${percent}%) ${report.status}`)
for(const c of categories)console.log(`${c.pass?'PASS':'FAIL'} ${c.id.padEnd(20)} ${String(c.score).padStart(3)}/${c.max} ${String(c.percent).padStart(3)}% floor=${c.floor}%`)
if(baseline)console.log(`Baseline aceita: ${baseline.percent}% · delta ${gate.delta>=0?'+':''}${gate.delta}%`);else console.log('Baseline aceita: nenhuma (use avaliacao-agent.sh accept após validar esta execução).')
console.log(`Learning Regression V2.6: ${report.learningRegression?.pass?'PASS':'BLOCKED'}${report.learningRegression?.report?' · '+report.learningRegression.report.passed+'/'+report.learningRegression.report.total:''}`);if(gate.reasons?.length)for(const reason of gate.reasons)console.log('BLOCK:',reason)
if(!noPersist)console.log('Relatório persistido no estado local da Agent.')
if(!gate.pass)process.exit(1)
