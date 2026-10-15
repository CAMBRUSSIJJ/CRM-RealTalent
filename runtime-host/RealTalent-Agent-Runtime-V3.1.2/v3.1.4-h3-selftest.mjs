import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = path.resolve(here, '..')
const crmDir = fs.readdirSync(bundle).find((name) => name.startsWith('RealTalent-CRM-') && fs.existsSync(path.join(bundle, name, 'src/features/assistant/assistant-drawer.tsx')))
const crm = path.join(bundle, crmDir ?? '')
const read = (rel) => crmDir ? fs.readFileSync(path.join(crm, rel), 'utf8') : ''
const lang = read('src/services/realtalent-sales-language.ts')
const assistant = read('src/services/realtalent-assistant.ts')
const provider = read('src/services/realtalent-assistant-provider.ts')
const client = read('src/services/realtalent-agent-client.ts')
const drawer = read('src/features/assistant/assistant-drawer.tsx')
const gateway = read('src/services/realtalent-ai-gateway.ts')
const checks=[]
const test=(name,fn)=>{try{fn();checks.push(1);console.log('PASS',name)}catch(e){checks.push(0);console.error('FAIL',name,e instanceof Error?e.message:String(e))}}

test('CRM source package found',()=>assert.ok(crmDir))
test('H3 version visible',()=>assert.ok(drawer.includes('V3.1.4-H3')))
test('semantic language interpreter exists',()=>assert.ok(lang.includes('inferCommercialLanguageIntent')))
test('best contacts language family exists',()=>assert.ok(lang.includes("'melhor', 'melhores'")&&lang.includes("'contato', 'contatos'")))
test('colloquial priority forms exist',()=>assert.ok(lang.includes('quem eu priorizo')&&lang.includes('vale mais a pena')))
test('English and Spanish variants exist',()=>assert.ok(lang.includes('who should i call')&&lang.includes('mejores')))
test('best_contacts is a canonical assistant intent',()=>assert.ok(assistant.includes("| 'best_contacts'")))
test('ranking uses existing CRM Lead Score',()=>assert.ok(assistant.includes('buildLeadScoreBoard')&&assistant.includes('Score Comercial do CRM')))
test('ranking produces CRM result items',()=>assert.ok(assistant.includes("title: 'Melhores contatos agora'")&&assistant.includes('insight.lead.name')))
test('known commercial intents execute locally',()=>assert.ok(provider.includes("localFast.intent !== 'unknown' && localFast.intent !== 'help'")))
test('remote fallback is allowed to read CRM Native Tools',()=>assert.ok(client.includes("'crm.contacts.search'")&&client.includes("'crm.pipeline.summary'")&&client.includes("'crm.tasks.search'")))
test('tool documentation leakage is rejected',()=>assert.ok(client.includes('technicalInstructionLeak')&&client.includes('if (technicalInstructionLeak && !payload.action) return null')))
test('seller UI hides internal tool syntax',()=>assert.ok(client.includes('sanitizeUserFacingAgentText')))
test('contacts screen offers natural best-contact prompt',()=>assert.ok(drawer.includes("'Me traga os melhores contatos'")))
test('AI audit identifies contact ranking as read operation',()=>assert.ok(gateway.includes("answer.intent === 'best_contacts'")))
test('H2 Natural Action Bridge preserved',()=>assert.ok(drawer.includes('V3.1.4-H2 compatibility marker')))
const ok=checks.reduce((a,b)=>a+b,0)
console.log(`RESULT ${ok}/${checks.length}`)
if(ok!==checks.length) process.exit(1)
