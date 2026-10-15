import assert from 'node:assert/strict'
import { classifyConversationTurn, contextWindowForTurn, polishResponseText, conversationIntelligenceSummary } from './conversation-intelligence.mjs'
let checks=0
const ok=(name,fn)=>{try{fn();checks++;console.log('OK   '+name)}catch(e){console.error('FAIL '+name+' — '+e.message);throw e}}
const crmHistory=[
  {role:'user',content:'o que é um CRM'},
  {role:'assistant',content:'CRM é um sistema de gestão de relacionamento com clientes.'}
]
ok('saudação quebra contexto CRM',()=>{const p=classifyConversationTurn({message:'oi',messages:crmHistory});assert.equal(p.intent,'greeting');assert.equal(p.topicShift,true);assert.equal(p.contextMessages,0);assert.equal(p.includeProjectAwareness,false);assert.equal(p.cannedReply,'Oi! Como posso ajudar?')})
ok('follow-up mantém contexto CRM',()=>{const p=classifyConversationTurn({message:'e qual a diferença para ERP?',messages:crmHistory});assert.equal(p.intent,'follow_up');assert.ok(p.contextMessages>=6);assert.equal(p.includeProjectAwareness,true)})
ok('pergunta conceitual CRM não força Project Awareness',()=>{const p=classifyConversationTurn({message:'o que é um CRM?',messages:[]});assert.equal(p.intent,'general_question');assert.equal(p.includeProjectAwareness,false)})
ok('pergunta de implementação ativa Project Awareness',()=>{const p=classifyConversationTurn({message:'onde está implementado o WhatsApp?',messages:[],product:'auto'});assert.equal(p.intent,'project_question');assert.equal(p.requestedProduct,'crm');assert.equal(p.includeProjectAwareness,true)})
ok('pedido de execução é execute_task',()=>{const p=classifyConversationTurn({message:'corrija o WhatsApp e rode os testes',messages:[]});assert.equal(p.intent,'execute_task');assert.equal(p.includeProjectAwareness,true)})
ok('perspectiva de amor próprio aponta para usuário',()=>{const p=classifyConversationTurn({message:'como posso me amar?',messages:crmHistory});assert.equal(p.intent,'personal_emotional');assert.equal(p.contextMessages,0);assert.match(p.perspectiveNote,/usuário/i);assert.equal(p.includeProjectAwareness,false)})
ok('context gate remove mensagens antigas em topic shift',()=>{const p=classifyConversationTurn({message:'como posso me amar?',messages:crmHistory});const c=contextWindowForTurn({conversation:{messages:[...crmHistory,{role:'user',content:'como posso me amar?'}],memory:{summary:'CRM antigo'},productScope:'auto'},turnPlan:p});assert.deepEqual(c.recent_messages,[]);assert.equal(c.conversation_memory,null)})
ok('context gate mantém histórico em follow-up',()=>{const p=classifyConversationTurn({message:'e qual a diferença para ERP?',messages:crmHistory});const c=contextWindowForTurn({conversation:{messages:[...crmHistory,{role:'user',content:'e qual a diferença para ERP?'}],memory:{summary:'CRM'},productScope:'auto'},turnPlan:p});assert.ok(c.recent_messages.length>=2);assert.equal(c.conversation_memory.summary,'CRM')})
ok('anti-repetição remove frase duplicada',()=>{const p=classifyConversationTurn({message:'o que é CRM?',messages:[]});const x=polishResponseText('CRM organiza clientes. CRM organiza clientes. Ele centraliza histórico.',p);assert.equal(x,'CRM organiza clientes. Ele centraliza histórico.')})
ok('limite de resposta é aplicado',()=>{const p={maxAnswerChars:180};const x=polishResponseText('Uma frase curta. '.repeat(40),p);assert.ok(x.length<=181)})
ok('summary expõe as proteções preservadas na V1.7',()=>{const s=conversationIntelligenceSummary();assert.equal(s.version,'2.3');assert.equal(s.features.contextRelevanceGate,true);assert.equal(s.features.perspectiveGuard,true);assert.equal(s.features.responseQualityLayer,true)})
console.log(`\nConversation Intelligence V2.3: ${checks}/11 PASS`)
