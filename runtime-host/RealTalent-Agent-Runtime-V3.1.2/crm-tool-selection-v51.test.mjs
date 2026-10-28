import test from 'node:test'
import assert from 'node:assert/strict'
import {isMultiToolRequest,validateToolSelection,verifyModelPlannerCoverage,validateRunPreflight} from './crm-tool-selection-v51.mjs'
const catalog=[
 {id:'tasks.create',execution:'native',risk:'low'},
 {id:'calendar.create',execution:'native',risk:'low'},
 {id:'contacts.delete',execution:'native',risk:'high'},
 {id:'sales.read',execution:'native',risk:'read'},
 {id:'guided.action',execution:'guided',risk:'low'},
 {id:'agent.undo_last',execution:'native',risk:'low'},
]
test('detecta dois objetivos em português',()=>{
 assert.equal(isMultiToolRequest('crie uma tarefa e agende retorno amanhã'),true)
 assert.equal(isMultiToolRequest('consulte minhas propostas; crie follow-ups'),true)
 assert.equal(isMultiToolRequest('crie um roteiro de abordagem'),false)
})
test('seleção do Ollama só aceita IDs reais, sem duplicar nem ignorar pedido composto',()=>{
 assert.equal(validateToolSelection({capabilityIds:['tasks.create'],confidence:.99},catalog,{compound:true}),null)
 assert.equal(validateToolSelection({capabilityIds:['tasks.create','unknown'],confidence:.99},catalog,{compound:true}),null)
 assert.equal(validateToolSelection({capabilityIds:['tasks.create','guided.action'],confidence:.99},catalog,{compound:true}),null)
 assert.equal(validateToolSelection({capabilityIds:['tasks.create','tasks.create'],confidence:.99},catalog,{compound:true}),null)
 assert.equal(validateToolSelection({capabilityIds:['tasks.create','calendar.create'],confidence:.41},catalog,{compound:true}),null)
 assert.deepEqual(validateToolSelection({capabilityIds:['tasks.create','calendar.create'],confidence:.9},catalog,{compound:true})?.ids,['tasks.create','calendar.create'])
})
test('recusa resposta do planejador que omite ferramentas antes da execução',()=>{
 const sel={ids:['tasks.create','calendar.create'],confidence:.9}
 assert.equal(verifyModelPlannerCoverage(sel,{ok:true,decision:'execute',plan:{steps:[{capabilityId:'tasks.create'}]}}).ok,false)
 assert.equal(verifyModelPlannerCoverage(sel,{ok:true,decision:'execute',plan:{steps:[{capabilityId:'tasks.create'},{capabilityId:'contacts.delete'}]}}).ok,false)
 assert.equal(verifyModelPlannerCoverage(sel,{ok:true,decision:'clarify',plan:{steps:[]}}).ok,true)
 assert.equal(verifyModelPlannerCoverage(sel,{ok:true,decision:'execute',plan:{steps:[{capabilityId:'tasks.create'},{capabilityId:'calendar.create'}]}}).ok,true)
})
test('preflight rejeita ferramenta desconhecida, risco errado e undo combinado',()=>{
 const step=(id,capabilityId,risk='low')=>({id,capabilityId,risk})
 assert.equal(validateRunPreflight([step('one','tasks.create')],catalog).ok,true)
 assert.equal(validateRunPreflight([step('one','tasks.create','read')],catalog).ok,false)
 assert.equal(validateRunPreflight([step('one','tasks.create'),step('one','calendar.create')],catalog).ok,false)
 assert.equal(validateRunPreflight([step('u','agent.undo_last'),step('t','tasks.create')],catalog).ok,false)
 assert.equal(validateRunPreflight([step('x','other')],catalog).ok,false)
})
