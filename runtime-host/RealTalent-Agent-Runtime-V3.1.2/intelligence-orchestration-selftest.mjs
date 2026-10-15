import { classifyOrchestration, deterministicPlan, evidenceGate, editMarkdownResponse, contextRetrieval2, orchestrationInfo } from './intelligence-orchestration.mjs'
import { classifyConversationTurn } from './conversation-intelligence.mjs'

const checks=[];const t=(name,pass)=>{checks.push([name,Boolean(pass)]);console.log(`${pass?'OK  ':'FAIL'} ${name}`)}
let turn=classifyConversationTurn({message:'Analise o CRM inteiro e priorize o que impede a comercialização.',messages:[],product:'auto',mode:'auto'})
let o=classifyOrchestration({message:'Analise o CRM inteiro e priorize o que impede a comercialização.',product:'auto',conversationPlan:turn})
t('analysis job detectado',o.kind==='analysis_job')
t('commercial readiness detectado',o.protocol==='commercial_readiness')
t('tool-first obrigatório',o.toolFirst===true)
t('produto CRM inferido',o.product==='crm')
t('evidências obrigatórias',o.evidenceRequired.includes('project_brain')&&o.evidenceRequired.includes('production_readiness')&&o.evidenceRequired.includes('health_map'))
const plan=deterministicPlan(o);t('planner determinístico',plan.kind==='commercial_readiness'&&plan.steps.length>=5&&plan.successCriteria.length>=2)
let gate=evidenceGate({orchestration:o,evidence:[{id:'project_brain',verified:true},{id:'production_readiness',verified:true}]});t('evidence gate bloqueia ausência',gate.pass===false&&gate.missing.includes('health_map'))
gate=evidenceGate({orchestration:o,evidence:o.evidenceRequired.map(id=>({id,verified:true}))});t('evidence gate libera pack completo',gate.pass===true)
gate=evidenceGate({orchestration:o,evidence:o.evidenceRequired.map(id=>({id,verified:id!=='project_brain'}))});t('verified:false não satisfaz evidence gate',gate.pass===false&&gate.missing.includes('project_brain'))
turn=classifyConversationTurn({message:'o que é um CRM?',messages:[],product:'auto',mode:'auto'});o=classifyOrchestration({message:'o que é um CRM?',product:'auto',conversationPlan:turn});t('definição geral não ativa tool-first',o.kind==='chat'&&!o.toolFirst)
turn=classifyConversationTurn({message:'onde está implementado o WhatsApp?',messages:[],product:'auto',mode:'auto'});o=classifyOrchestration({message:'onde está implementado o WhatsApp?',product:'auto',conversationPlan:turn});t('pergunta técnica ativa Project Brain',o.kind==='project_query'&&o.toolFirst&&o.product==='crm')
turn=classifyConversationTurn({message:'investigue por que o WhatsApp duplica mensagens, corrija e valide',messages:[],product:'auto',mode:'auto'});o=classifyOrchestration({message:'investigue por que o WhatsApp duplica mensagens, corrija e valide',product:'auto',conversationPlan:turn});t('engenharia autônoma priorizada',o.kind==='autonomous_job'&&o.protocol==='engineering')
const edited=editMarkdownResponse('## Título\n\n**Importante**\n\n**Importante**\n\n- um\n- dois',{maxWords:80});t('response editor preserva Markdown e remove bloco duplicado',edited.includes('## Título')&&edited.includes('**Importante**')&&edited.match(/\*\*Importante\*\*/g)?.length===1&&edited.includes('- um'))
const ctx=contextRetrieval2({orchestration:{kind:'project_query',toolFirst:true},conversationContext:{x:1},projectContext:{files:['a']},evidence:[{id:'project_brain'}]});t('Context Retrieval 2.0 prioriza projeto',ctx.project?.files?.[0]==='a'&&!ctx.conversation)
t('manifesto V2.3',orchestrationInfo.version==='2.3'&&orchestrationInfo.features.commercialReadinessProtocol)
const ok=checks.filter(x=>x[1]).length;console.log(`\nIntelligence Orchestration V2.3: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exit(1)
