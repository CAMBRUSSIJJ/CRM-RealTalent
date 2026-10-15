import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-eng-v19-'))
process.env.REALTALENT_AGENT_STATE_DIR = tmp
const eng = await import(`./autonomous-engineering.mjs?test=${Date.now()}`)
const gateway = fs.readFileSync(new URL('./gateway.mjs', import.meta.url), 'utf8')
const builder = fs.readFileSync(new URL('./builder_agent.py', import.meta.url), 'utf8')

const checks = []
const check = (name, fn) => { try { fn(); checks.push([name, true]) } catch (e) { checks.push([name, false, e.message]) } }

check('versão 1.10.0', () => assert.equal(eng.engineeringInfo.version, '1.10.0'))
check('store persistente dedicado', () => assert.match(eng.engineeringInfo.store, /engineering-cases\.json$/))
check('limite recovery 3', () => assert.equal(eng.engineeringInfo.maxBuilderRecoveryAttempts, 3))
check('caso inicia com investigação', () => {
  const c = eng.createEngineeringCase({ product:'crm', objective:'WhatsApp duplica mensagens; investigue, corrija e teste.', investigation:{hypotheses:[{hypothesis:'listener duplicado',confidence:.58,evidence:[{path:'src/a.ts'}]}]}, impact:{risk:'high'}, projectBrain:{enabled:true}, baselineQaId:'qa_1' })
  assert.equal(c.status, 'investigating'); assert.equal(c.phase, 'baseline_qa'); assert.equal(c.baselineQaId, 'qa_1')
})
check('objetivo Builder carrega hipótese sem tratar como fato', () => {
  const c = eng.engineeringList()[0]; const text = eng.builderObjectiveForEngineering(c)
  assert.match(text, /hipóteses, NÃO fatos confirmados/); assert.match(text, /listener duplicado/); assert.match(text, /Baseline Browser QA/)
})
check('eventos persistem', () => {
  const c = eng.engineeringCaseById(eng.engineeringList()[0].id); eng.addEngineeringEvent(c,'approval','aguardando'); eng.upsertEngineeringCase(c)
  assert.ok(eng.engineeringCaseById(c.id).events.some(x=>x.type==='approval'))
})
check('public case não perde refs operacionais', () => {
  const c = eng.engineeringList()[0]; assert.equal(c.baselineQaId,'qa_1'); assert.ok(c.investigation)
})
check('gateway expõe endpoint /engineering/run', () => assert.ok(gateway.includes("req.url === '/engineering/run'")))
check('gateway expõe consulta de casos', () => assert.ok(gateway.includes("/^\\/engineering\\/([^/?]+)$/")))
check('classificador possui rota engineering', () => assert.ok(gateway.includes("kind = 'engineering'")))
check('root cause ocorre antes de Builder', () => {
  const a=gateway.indexOf('rootCauseEvidence({ product, workspace, symptom: cleanObjective'); const b=gateway.indexOf('startBuilderJob({ product:item.product'); assert.ok(a>=0&&b>a)
})
check('baseline QA é observe', () => assert.ok(gateway.includes("Baseline antes de qualquer alteração") && gateway.includes("mode:'observe'")))
check('aprovação humana explícita antes do Builder', () => {
  assert.ok(gateway.includes("createGovernanceApproval({ operation:'builder.run'")); assert.ok(gateway.includes("item.status = 'awaiting_approval'"))
})
check('Builder usa 3 iterações', () => assert.ok(gateway.includes("'--max-iterations', '3'")))
check('Builder mantém rollback quando QA falha', () => assert.ok(builder.includes("if qa.get('status') == 'FAIL'") && builder.includes('rollback(root, backup_dir, manifest)')))
check('chat suporta Antes × Depois cross-job', () => assert.ok(gateway.includes("baselineQaId&&finalQaId") && gateway.includes("kindLabel:'Engenharia autônoma'")))

let ok=0
for (const [name, pass, error] of checks) { console.log(`${pass?'OK  ':'FAIL'} ${name}${error?` — ${error}`:''}`); if(pass) ok++ }
console.log(`\nAutonomous Engineering V1.9: ${ok}/${checks.length} PASS`)
fs.rmSync(tmp,{recursive:true,force:true})
if(ok!==checks.length) process.exit(1)
