import { strict as assert } from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const page = read('src/features/prospecting/prospecting-page.tsx')
const client = read('src/services/prospecting-linux-agent.ts')
const proxy = read('api/runtime/_proxy.mjs')
const sourceReview = read('src/features/prospecting/prospecting-raw-source-review.tsx')
const workspace = read('src/services/prospecting-workspace.ts')
const config = JSON.parse(read('vercel.json'))

const checks = [
 ['single-flight polling', () => assert.match(page, /refreshAgentInFlight\.current/)],
 ['polling pauses in background tabs', () => assert.match(page, /document\.visibilityState === 'hidden'/)],
 ['polling refreshes on tab return', () => assert.match(page, /visibilitychange/)],
 ['polling not every second', () => assert.match(page, /active \? 4000 : 20000/)],
 ['health tolerates cold starts', () => assert.match(client, /getProspectingAgentHealth[\s\S]{0,220}12000/)],
 ['proxy demands Supabase identity', () => assert.match(proxy, /authenticatedUser\(req\)/)],
 ['proxy passes preview protection bypass only when configured', () => assert.match(proxy, /service === 'prospecting' && protectionBypass/)],
 ['proxy returns JSON for deployment protection', () => assert.match(proxy, /runtime_preview_protection_blocked/)],
 ['human review exists in source', () => assert.match(sourceReview, /Revisar como empresa/)],
 ['sources need confirmation', () => assert.match(sourceReview, /!draft\.company\.trim\(\)/)],
 ['human review does not directly send to CRM', () => assert.doesNotMatch(sourceReview, /sendToCrm\(/)],
 ['local-only decisions are explicitly modeled', () => assert.match(workspace, /rawSourceDecisions/)],
 ['runtime proxy present', () => assert.ok(existsSync(new URL('../api/runtime/_proxy.mjs', import.meta.url)))],
 ['no source patch at build time', () => assert.doesNotMatch(JSON.stringify(config), /patch-preview-cloud-prospecting-ui/)],
 ['source lockfile present', () => assert.ok(existsSync(new URL('../package-lock.json', import.meta.url)))],
]
let failed = 0
for (const [name, check] of checks) {
  try { check(); console.log('OK   ' + name) } catch (e) { console.error('FAIL ' + name + ': ' + e.message); failed++ }
}
console.log('RC1 Preview Foundation Gates:', checks.length - failed + '/' + checks.length)
if (failed) process.exitCode = 1
