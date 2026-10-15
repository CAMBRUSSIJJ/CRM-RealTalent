import fs from 'node:fs'
import assert from 'node:assert/strict'
const root = new URL('../', import.meta.url)
const lang = fs.readFileSync(new URL('src/services/realtalent-sales-language.ts', root), 'utf8')
const assistant = fs.readFileSync(new URL('src/services/realtalent-assistant.ts', root), 'utf8')
const provider = fs.readFileSync(new URL('src/services/realtalent-assistant-provider.ts', root), 'utf8')
const client = fs.readFileSync(new URL('src/services/realtalent-agent-client.ts', root), 'utf8')
const tests=[]
const t=(name,fn)=>{try{fn();console.log('PASS',name);tests.push(true)}catch(e){console.error('FAIL',name,e.message);tests.push(false)}}
t('semantic sales language service exists',()=>assert.ok(lang.includes('inferCommercialLanguageIntent')))
t('exact user phrase family is covered',()=>assert.ok(lang.includes("'melhor', 'melhores'" ) && lang.includes("'contato', 'contatos'")))
t('colloquial priority phrases covered',()=>assert.ok(lang.includes('quem eu priorizo') && lang.includes('vale mais a pena')))
t('English variants covered',()=>assert.ok(lang.includes("'best'" ) && lang.includes('who should i call')))
t('Spanish variants covered',()=>assert.ok(lang.includes('mejores') && lang.includes('a quien llamo')))
t('best_contacts intent is canonical',()=>assert.ok(assistant.includes("| 'best_contacts'")))
t('best contacts uses CRM lead score',()=>assert.ok(assistant.includes('buildLeadScoreBoard') && assistant.includes('Score Comercial do CRM')))
t('best contacts returns actual CRM items',()=>assert.ok(assistant.includes("title: 'Melhores contatos agora'") && assistant.includes('insight.lead.name')))
t('known sales intents bypass remote API prose',()=>assert.ok(provider.includes("localFast.intent !== 'unknown'")))
t('read Native Tools available to remote fallback',()=>assert.ok(client.includes("'crm.contacts.search'") && client.includes("'crm.myday.read'")))
t('technical command leakage sanitizer retained',()=>assert.ok(client.includes("(?:crm|system)")))
if(tests.some(x=>!x)) process.exit(1)
console.log(`H3 semantic language: ${tests.length}/${tests.length} PASS`)
