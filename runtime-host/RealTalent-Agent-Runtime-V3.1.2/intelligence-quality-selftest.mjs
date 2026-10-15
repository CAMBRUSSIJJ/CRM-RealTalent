import assert from 'node:assert/strict'
import {buildResponseStyleProfile,naturalizeResponse,selectPrecisionContext,refineReference31,rankToolsForRequest,buildLatencyBudget,responseQualityMetrics,buildQualityPlan,intelligenceQualityInfo} from './intelligence-quality.mjs'
import {nativeAppToolCatalog} from './app-tools.mjs'
import {classifyConversationTurn} from './conversation-intelligence.mjs'
import {buildIntelligencePlan} from './intelligence-core.mjs'
import {classifyOrchestration} from './intelligence-orchestration.mjs'

const results=[];const t=(name,fn)=>{try{fn();results.push([name,true])}catch(e){results.push([name,false,e.message])}}

t('V3.1 info',()=>assert.equal(intelligenceQualityInfo.version,'3.1'))
t('Naturalização remove preâmbulo genérico',()=>assert.equal(naturalizeResponse('Claro! A resposta é 42.',{avoidGenericPreamble:true,avoidGenericClosing:true,maxHeadings:2}),'A resposta é 42.'))
t('Naturalização remove fechamento genérico',()=>assert.equal(naturalizeResponse('A resposta é 42.\n\nSe quiser, posso explicar mais.',{avoidGenericPreamble:true,avoidGenericClosing:true,maxHeadings:2}),'A resposta é 42.'))
t('Context Precision prefere tópico relacionado',()=>{const m=[{role:'user',content:'vamos falar de gatos'},{role:'assistant',content:'ok gatos'},{role:'user',content:'pipeline oportunidade Acme etapa proposta'},{role:'assistant',content:'Acme está em proposta'}];const out=selectPrecisionContext({messages:m,query:'e a oportunidade Acme?',limit:2});assert.ok(out.some(x=>x.content.includes('Acme')));assert.ok(!out.some(x=>x.content.includes('gatos')))})
t('Referência visual ganha com pista visual',()=>{const base={source:'app_context',confidence:.96,candidates:[{source:'app_context',confidence:.96},{source:'visual_context',confidence:.91}]};const out=refineReference31({message:'esse botão',baseReference:base});assert.equal(out.source,'visual_context')})
t('Referência ambígua pode abster',()=>{const base={source:'app_context',confidence:.94,candidates:[{source:'app_context',confidence:.94},{source:'conversation',confidence:.91}]};const out=refineReference31({message:'isso',baseReference:base});assert.equal(out.source,'unresolved')})
t('Tool Selection prioriza pipeline read',()=>{const r=rankToolsForRequest({message:'mostre oportunidades do pipeline',tools:nativeAppToolCatalog('crm'),product:'crm'});assert.equal(r.rankedTools[0].name,'crm.pipeline.list');assert.equal(r.rankedTools[0].capability,'read')})
t('Tool Selection prioriza envio em pedido de escrita',()=>{const r=rankToolsForRequest({message:'envie uma mensagem no WhatsApp',tools:nativeAppToolCatalog('crm'),product:'crm'});assert.equal(r.rankedTools[0].name,'crm.communications.sendMessage');assert.equal(r.writeIntent,true)})
t('Latency instant é menor que deep',()=>{const a=buildLatencyBudget({complexity:{tier:'instant'}}),b=buildLatencyBudget({complexity:{tier:'deep'}});assert.ok(a.totalMs<b.totalMs);assert.ok(a.maxOutputTokens<b.maxOutputTokens)})
t('Métrica penaliza preâmbulo',()=>{const s=buildResponseStyleProfile({turnPlan:{intent:'general_question'},complexity:{tier:'standard'}});const a=responseQualityMetrics({prompt:'o que é CRM?',answer:'Claro! CRM é gestão de relacionamento com clientes.',style:s});const b=responseQualityMetrics({prompt:'o que é CRM?',answer:'CRM é gestão de relacionamento com clientes.',style:s});assert.ok(b.score>a.score)})
t('Plano integra estilo, tools e latência',()=>{const turn=classifyConversationTurn({message:'mostre contatos sem follow-up',product:'crm'});const orch=classifyOrchestration({message:'mostre contatos sem follow-up',product:'crm',conversationPlan:turn});const core=buildIntelligencePlan({message:'mostre contatos sem follow-up',turnPlan:turn,orchestration:orch});const q=buildQualityPlan({message:'mostre contatos sem follow-up',turnPlan:turn,orchestration:orch,tools:nativeAppToolCatalog('crm'),intelligenceCore:core});assert.equal(q.version,'3.1');assert.ok(q.toolSelection.recommended.includes('crm.contacts.search'));assert.ok(q.latency.totalMs>0)})

const pass=results.filter(x=>x[1]).length
for(const [n,ok,e] of results)console.log(`${ok?'PASS':'FAIL'} ${n}${e?` — ${e}`:''}`)
console.log(`\nIntelligence Quality V3.1: ${pass}/${results.length} PASS`)
if(pass!==results.length)process.exit(1)
