import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('dedicated Garimpo mode never terminates or substitutes the G1/G2 search engine',()=>{
  const runtime=read('scripts/start.mjs')
  assert.match(runtime,/if \(argv\.includes\('--garimpo'\)\) return 'garimpo'/)
  assert.match(runtime,/startServices\(token, \{ preserveProspecting: mode === 'garimpo' \}\)/)
  const preserved=runtime.split('if (preserveProspecting) {')[1]?.split('} else {')[0]
  assert.ok(preserved,'missing dedicated preservation branch')
  assert.doesNotMatch(preserved,/terminatePid|spawnService/)
  assert.match(runtime,/if \(mode !== 'garimpo'\) await recoverPreviewPort\(\)/)
  assert.match(runtime,/mode === 'dev' \|\| mode === 'garimpo'/)
})
test('launcher uses isolated ports and managed Vite token, not raw --dev runtime',()=>{
  const launcher=read('scripts/garimpo-g1g2-linux/abrir-local.sh')
  for(const port of ['3011','3012','3013','4197','4320'])assert.ok(launcher.includes(port),port)
  assert.match(launcher,/node scripts\/start\.mjs --garimpo/)
  assert.match(launcher,/REALTALENT_RUNTIME_CONTROL_PORT="\$RT_CONTROL_PORT"/)
  assert.match(launcher,/REAL[T]?TALENT_COMMUNICATIONS_PORT="\$RT_COMM_PORT"/)
  assert.doesNotMatch(launcher,/node scripts\/start\.mjs --dev/)
  assert.doesNotMatch(launcher,/pkill|killall/)
  assert.match(launcher,/COMMUNICATIONS_PORTS_FREE=0/)
})
test('runtime status truth: parent starts managed Vite after issuing token',()=>{
  const runtime=read('scripts/start.mjs')
  assert.match(runtime,/process\.env\.REALTALENT_RUNTIME_TOKEN = token/)
  assert.match(runtime,/env: \{ \.\.\.process\.env, REALTALENT_CONNECT_PORT:/)
  assert.match(runtime,/if \(mode !== 'dev' && mode !== 'garimpo'\) verifyDistLineage\(\)/)
})
