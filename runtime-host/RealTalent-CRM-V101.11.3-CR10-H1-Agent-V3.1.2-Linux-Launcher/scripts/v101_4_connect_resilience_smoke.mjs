import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const port = Number(process.env.REALTALENT_CONNECT_SMOKE_PORT || 4392)
const phoneStore = path.join('/tmp', `realtalent-phone-v1014-${port}.json`)
const runtimeStore = path.join('/tmp', `realtalent-runtime-v1014-${port}.json`)
for (const file of [phoneStore, runtimeStore]) { try { fs.rmSync(file, { force: true }) } catch {} }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const base = `http://127.0.0.1:${port}`
let server = null
let stderr = ''
let stdout = ''

function launch() {
  stderr = ''; stdout = ''
  server = spawn(process.execPath, ['scripts/realtalent-connect-server.mjs'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      REALTALENT_CONNECT_PORT: String(port),
      REALTALENT_CRM_PORT: '4187',
      REALTALENT_CONNECT_HOST: '127.0.0.1',
      REALTALENT_PHONE_STORE: phoneStore,
      REALTALENT_CONNECT_RUNTIME_STORE: runtimeStore,
      TWILIO_ACCOUNT_SID: '',
      TWILIO_AUTH_TOKEN: '',
      TWILIO_FROM_NUMBER: '',
      REALTALENT_AGENT_PHONE_NUMBER: '',
    },
  })
  server.stderr.on('data', (chunk) => { stderr += String(chunk) })
  server.stdout.on('data', (chunk) => { stdout += String(chunk) })
}

async function stop() {
  if (!server || server.exitCode !== null) return
  const child = server
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {}; resolve() }, 1800)
    child.once('exit', () => { clearTimeout(timer); resolve() })
    try { child.kill('SIGTERM') } catch { clearTimeout(timer); resolve() }
  })
}

async function request(url, opts = {}) {
  const response = await fetch(base + url, opts)
  const data = await response.json().catch(() => ({}))
  return { response, data }
}

async function waitReady() {
  for (let index = 0; index < 40; index += 1) {
    try {
      const { response, data } = await request('/api/voice/v1/health')
      if (response.ok && data.version === '101.4.0') return data
    } catch {}
    await sleep(100)
  }
  throw new Error(`Connect não iniciou V101.4. ${stderr || stdout}`)
}

const cleanup = async () => {
  await stop()
  for (const file of [phoneStore, runtimeStore]) { try { fs.rmSync(file, { force: true }) } catch {} }
}
process.on('exit', () => { for (const file of [phoneStore, runtimeStore]) { try { fs.rmSync(file, { force: true }) } catch {} } })

try {
  launch()
  await waitReady()

  const blocked = await request('/api/voice/v1/capabilities', { headers: { origin: 'http://example.invalid' } })
  if (blocked.response.status !== 403) throw new Error('origin guard não bloqueou origem externa')

  const pairing = await request('/api/phone/v1/pairing')
  if (!pairing.response.ok || !pairing.data.code) throw new Error('pareamento indisponível')
  const paired = await request('/api/phone/v1/pair', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: pairing.data.code, name: 'Runtime QA Phone V101.4', platform: 'qa' }),
  })
  if (paired.response.status !== 201) throw new Error('pareamento falhou')
  const { token, deviceId } = paired.data
  await request(`/api/phone/v1/poll?token=${encodeURIComponent(token)}`)

  const requestId = 'qa-v1014-idempotent-attempt'
  const payload = {
    schema: 'realtalent.voice.call.v1', direction: 'outbound', workspaceId: 'qa-v1014', leadId: 'lead-v1014',
    phone: '51999999999', deviceId: `connect:phone:${deviceId}`, displayName: 'Lead QA V101.4', requestId,
  }
  const first = await request('/api/voice/v1/calls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  if (first.response.status !== 201 || !first.data.callId) throw new Error(first.data.error || 'primeira chamada não criada')
  const callId = first.data.callId

  const duplicate = await request('/api/voice/v1/calls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  if (duplicate.data.callId !== callId || duplicate.data.reused !== true) throw new Error('requestId não impediu chamada duplicada')

  let poll = await request(`/api/phone/v1/poll?token=${encodeURIComponent(token)}`)
  if (poll.data.command?.callId !== callId) throw new Error('comando não chegou ao phone antes do restart')
  await request('/api/phone/v1/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, callId, state: 'ringing' }) })

  if (!fs.existsSync(runtimeStore)) throw new Error('runtime store não foi persistido')
  const persisted = JSON.parse(fs.readFileSync(runtimeStore, 'utf8'))
  if (persisted.version !== '101.4.0' || !persisted.activeCalls?.some((item) => item.callId === callId)) throw new Error('runtime store não contém a chamada')

  await stop()
  launch()
  const healthAfterRestart = await waitReady()
  if (healthAfterRestart.activeCalls < 1) throw new Error('chamada ativa não foi restaurada após restart')

  await request(`/api/phone/v1/poll?token=${encodeURIComponent(token)}`)
  const replay = await request('/api/voice/v1/calls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  if (replay.data.callId !== callId || replay.data.reused !== true) throw new Error('idempotência não sobreviveu ao restart do bridge')

  const restored = await request(`/api/voice/v1/calls/${encodeURIComponent(callId)}`)
  if (restored.data.state !== 'ringing') throw new Error(`estado restaurado incorreto: ${restored.data.state}`)

  await request('/api/phone/v1/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, callId, state: 'connected' }) })
  const connected = await request(`/api/voice/v1/calls/${encodeURIComponent(callId)}`)
  if (connected.data.state !== 'connected') throw new Error('estado connected não sincronizou após restart')
  await request('/api/phone/v1/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, callId, state: 'ended' }) })
  const ended = await request(`/api/voice/v1/calls/${encodeURIComponent(callId)}`)
  if (ended.data.state !== 'ended') throw new Error('estado ended não sincronizou')

  console.log('RealTalent Connect resilience smoke V101.4: OK (requestId idempotente → persistência → restart → retomada → connected → ended; origin guard 403).')
  await cleanup()
} catch (error) {
  await cleanup()
  console.error(`RealTalent Connect resilience smoke V101.4: FALHOU — ${error instanceof Error ? error.message : String(error)}`)
  if (stderr.trim()) console.error(stderr.trim())
  process.exit(1)
}
