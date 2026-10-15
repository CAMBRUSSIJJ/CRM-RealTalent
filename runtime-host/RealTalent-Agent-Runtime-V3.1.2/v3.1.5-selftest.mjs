import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { normalizeSemanticSalesInterpretation, semanticDecision, semanticSalesLanguageInfo } from './semantic-sales-language.mjs'

const here=path.dirname(fileURLToPath(import.meta.url))
const bundle=path.resolve(here,'..')
const crmDir=fs.readdirSync(bundle).find((name)=>name.startsWith('RealTalent-CRM-')&&fs.existsSync(path.join(bundle,name,'src/services/realtalent-assistant-provider.ts')))
const crm=crmDir?path.join(bundle,crmDir):''
const read=(rel)=>crmDir?fs.readFileSync(path.join(crm,rel),'utf8'):''
const provider=read('src/services/realtalent-assistant-provider.ts')
const assistant=read('src/services/realtalent-assistant.ts')
const fast=read('src/services/realtalent-fast-actions.ts')
const sales=read('src/services/realtalent-sales-language.ts')
const client=read('src/services/realtalent-semantic-language-client.ts')
const gateway=fs.readFileSync(path.join(here,'gateway.mjs'),'utf8')
const dataset=JSON.parse(fs.readFileSync(path.join(here,'KNOWN_FAILURE_DATASET_V3.1.5.json'),'utf8'))
let ok=0,total=0
const t=(name,fn)=>{total+=1;try{fn();ok+=1;console.log('PASS',name)}catch(e){console.error('FAIL',name,e instanceof Error?e.message:String(e))}}

t('semantic engine version',()=>assert.equal(semanticSalesLanguageInfo.version,'3.1.5'))
t('structured semantic endpoint exists',()=>assert.ok(gateway.includes("req.url === '/language/interpret'")&&gateway.includes('semanticSalesLanguageSchema')))
t('feedback endpoint exists',()=>assert.ok(gateway.includes("req.url === '/language/feedback'")&&gateway.includes('SEMANTIC_LANGUAGE_FEEDBACK_FILE')))
t('classification uses structured AI fast role',()=>assert.ok(gateway.includes("taskType:'classification'")&&gateway.includes("name:'realtalent_semantic_sales_language'")))
t('CRM semantic client exists',()=>assert.ok(client.includes('/language/interpret')&&client.includes('interpretSalesLanguage')))
t('provider routes non-trivial prompts through semantic model',()=>assert.ok(provider.includes('await interpretSalesLanguage(prompt, context)')&&provider.includes("semantic?.decision === 'execute'")))
t('lexical H3 is compatibility fallback, not only router',()=>assert.ok(provider.includes('local-language-fallback-v3.1.5')&&sales.includes('Fallback local de compatibilidade')))
t('semantic interpretation enters assistant context',()=>assert.ok(assistant.includes('semanticInterpretation?: SemanticSalesInterpretation')&&assistant.includes('semantic.confidence >= 0.78')))
t('semantic create_task can force native action path',()=>assert.ok(fast.includes('forcedIntent: FastActionIntent')&&assistant.includes('parseActionWithSemantic')))
t('semantic entities feed contact, assignee, date and task type',()=>assert.ok(assistant.includes('semantic.entities.contact_query')&&assistant.includes('semantic.entities.assignee_query')&&assistant.includes('semantic.entities.due_at_iso')&&assistant.includes('semantic.entities.task_type')))
t('known failure dataset includes typo/informal/multilingual cases',()=>assert.ok(dataset.cases.length>=14&&dataset.cases.some(x=>x.input.includes('qem devo'))&&dataset.cases.some(x=>x.input.includes('¿a quién'))&&dataset.cases.some(x=>x.input.includes('não deixa eu esquecer'))))
t('high-confidence interpretation executes',()=>{const x=normalizeSemanticSalesInterpretation({intent:'best_contacts',object:'contact',action:'rank',confidence:.91,language:'pt',needs_clarification:false,clarification:'',canonical_request:'priorizar contatos',rationale:'ranking',entities:{contact_query:'',assignee_query:'',task_title:'',due_at_iso:'',explicit_time:false,task_type:'none',criteria:['sales_score'],reference:''}});assert.equal(semanticDecision(x),'execute')})
t('ambiguous interpretation clarifies',()=>{const x=normalizeSemanticSalesInterpretation({intent:'create_task',object:'task',action:'create',confidence:.7,language:'pt',needs_clarification:true,clarification:'Para qual horário?',canonical_request:'agendar ligação',rationale:'horário faltante',entities:{contact_query:'Camila',assignee_query:'',task_title:'Ligar para Camila',due_at_iso:'',explicit_time:false,task_type:'call',criteria:[],reference:''}});assert.equal(semanticDecision(x),'clarify')})
t('learned corrections are fed back into future classification',()=>assert.ok(gateway.includes('learned_corrections:loadSemanticLanguageFeedback().items.slice(-20)')))
t('commercial criteria are canonicalized',()=>{const x=normalizeSemanticSalesInterpretation({intent:'best_contacts',object:'contact',action:'rank',confidence:.9,language:'pt',needs_clarification:false,clarification:'',canonical_request:'maior valor',rationale:'valor',entities:{contact_query:'',assignee_query:'',task_title:'',due_at_iso:'',explicit_time:false,task_type:'none',criteria:['deal_value','invented_metric'],reference:''}});assert.deepEqual(x.entities.criteria,['deal_value'])})
t('fuzzy CRM entity resolution exists',()=>assert.ok(assistant.includes('levenshteinDistance')&&assistant.includes('fuzzyEntityMatches')&&assistant.includes('entitySimilarity')))
t('semantic action context can lazy-load assignees and tasks',()=>assert.ok(provider.includes('loadWorkspaceMembers')&&provider.includes('loadWorkTasks')&&assistant.includes('conversationContext?: string')))
console.log(`RESULT ${ok}/${total}`)
if(ok!==total)process.exit(1)
