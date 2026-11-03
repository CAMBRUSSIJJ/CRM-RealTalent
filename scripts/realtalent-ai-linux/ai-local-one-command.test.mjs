import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const read = filename => readFileSync(new URL('../../'+filename,import.meta.url),'utf8')
const installer=read('scripts/realtalent-ai-linux/start-linux.sh')
const launcher=read('scripts/realtalent-ai-linux/ativar-ia-no-crm.sh')
const transport=read('src/services/realtalent-ai-local-browser.ts')
const settings=read('src/features/settings/realtalent-ai-panel.tsx')

test('Linux start script no longer pins obsolete Cloudflare-only branch',()=>{
  assert.match(installer,/REPO_BRANCH="feat\/tasks-team-recipient-routing-20261102"/)
  assert.doesNotMatch(installer,/REPO_BRANCH="feat\/realtalent-ai-persistent-cloudflare-20261031"/)
  assert.match(installer,/git -C "\$ROOT\/repo" switch -C/)
  assert.match(installer,/realtalent-ia/)
})

test('launcher uses systemd user services, loopback-only Ollama and a 6-digit browser pairing code',()=>{
  execFileSync('bash',['-n','scripts/realtalent-ai-linux/start-linux.sh'])
  execFileSync('bash',['-n','scripts/realtalent-ai-linux/ativar-ia-no-crm.sh'])
  assert.match(launcher,/systemctl --user start realtalent-ai-agent.service realtalent-ai-bridge.service/)
  assert.match(launcher,/127\.0\.0\.1:11434\/api\/generate/)
  assert.match(launcher,/browser\/ping/)
  assert.match(launcher,/pair-local\.mjs/)
  assert.doesNotMatch(launcher,/cloudflared tunnel --token|OPENAI_API_KEY|sk-[A-Za-z0-9]/)
})

test('private token stays in Linux env file, never passed to browser',()=>{
  assert.match(installer,/chmod 600 "\$ENV"/)
  assert.match(installer,/REALTALENT_AGENT_RUNTIME_TOKEN/)
  assert.match(installer,/export OLLAMA_URL=http:\/\/127\.0\.0\.1:11434/)
  assert.match(transport,/x-realtalent-browser-token/)
  assert.doesNotMatch(transport,/REALTALENT_AGENT_RUNTIME_TOKEN/)
})

test('local-only mode prevents automatic paid model fallback',()=>{
  assert.match(transport,/localAiOnlyEnabled/)
  assert.match(transport,/setLocalAiOnlyEnabled\(true\)/)
  assert.match(transport,/offlineLocalAiResponse\(\)/)
  assert.match(transport,/status:503/)
  assert.match(settings,/Usar somente IA local \(sem consumo de API paga\)/)
})
