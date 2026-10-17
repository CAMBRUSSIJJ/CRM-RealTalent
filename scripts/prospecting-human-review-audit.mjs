import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const read=(p)=>readFileSync(new URL('../'+p, import.meta.url),'utf8')
const page=read('src/features/prospecting/prospecting-page.tsx')
const triage=read('src/features/prospecting/prospecting-raw-source-review.tsx')
const workspace=read('src/services/prospecting-workspace.ts')
const tests=[
 ['aba Fontes brutas visível em Revisar',()=>assert.match(page,/Fontes brutas <span>\{rawSourceReviewCount\(agentJob\)\}/)],
 ['resultados brutos e filtrados na fila',()=>{assert.match(triage,/row\.type !== 'raw' && row\.type !== 'rejected'/);assert.match(triage,/uniqueSources\(job\)/)}],
 ['origem pública acessível ao usuário',()=>assert.match(triage,/Ver origem <ExternalLink/)],
 ['confirmação manual do nome antes de promover',()=>{assert.match(triage,/!draft\.company\.trim\(\)/);assert.match(triage,/Nome confirmado da empresa/)}],
 ['URL original preservada no rascunho',()=>{assert.match(triage,/sourceUrl: current\.url/);assert.match(triage,/sourceTitle: current\.name/)}],
 ['website oficial nunca vem automaticamente do diretório',()=>assert.match(triage,/website: draft\.website\.trim\(\)/)],
 ['localização não é afirmada como comprovada',()=>{assert.match(triage,/locationVerified: false/);assert.match(triage,/placeConfidence: 0/);assert.match(page,/Coordenadas pendentes/)}],
 ['não envia dados brutos diretamente para CRM',()=>{assert.match(page,/importDrafts\(\[draft\], 'manual', 'capture'/);assert.doesNotMatch(triage,/sendToCrm|createCompany\(/)}],
 ['ignorar, desfazer e marcar promovido',()=>{assert.match(triage,/Ignorar fonte/);assert.match(triage,/Desfazer decisão/);assert.match(page,/\[sourceRecord\.key\]: 'promoted'/)}],
 ['decisões locais sobrevivem à leitura do Supabase',()=>{assert.match(workspace,/rawSourceDecisions\?/);assert.match(page,/rawSourceDecisions: readProspectingState\(workspaceId\)/)}],
 ['deduplicação das fontes por URL no mesmo job',()=>assert.match(triage,/jobId \+ '::'/)],
 ['sinalização de amostragem limitada',()=>assert.match(triage,/histórico de fontes é limitado/)],
]
for(const [name,fn] of tests){try{fn();console.log('OK',name)}catch(error){console.error('FAIL',name);throw error}}
console.log('Garimpo Human Source Triage:',tests.length+'/'+tests.length)
