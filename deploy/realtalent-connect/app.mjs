import http from 'node:http'
import { readFile, mkdir, writeFile, chmod, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const STATE = join(homedir(), '.config', 'realtalent-connect')
const SETTINGS = join(STATE, 'device.json')
const ENV = join(STATE, 'docker.env')
const COMPOSE = join(HERE, 'compose.yaml')
const PORT = 4375
const SUPABASE_URL = 'https://bacdqruzxklfqdydijjn.supabase.co'
const PUBLIC_KEY = 'sb_publishable_xJOiFDc2_TUp1a78khj0ZA_FFwpCGGg'
const ENDPOINT = SUPABASE_URL + '/functions/v1/whatsapp-connect'
const CSRF = randomBytes(24).toString('hex')
const emailFreeError = 'Verifique se o Docker foi instalado e se sua conta tem permissão para executá-lo.'
const uuid = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const qrImage = value => {
  if (typeof value !== 'string' || value.length > 500000) return null
  const payload = value.replace(/^data:image\/png;base64,/, '')
  return /^iVBORw0KGgo[A-Za-z0-9+/=\r\n]+$/.test(payload)
    ? 'data:image/png;base64,' + payload : null
}
const state = {
  appRunning: false,
  dockerReady: false,
  started: false,
  paired: false,
  connection: 'offline',
  message: 'Preparando o aplicativo...',
  lastTick: null,
}
let config = null
let inTick = false
let inStart = false
let qrCache = { image: null, expires: 0 }

async function prepare() {
  await mkdir(STATE, { recursive: true, mode: 0o700 })
  await chmod(STATE, 0o700)
  if (existsSync(SETTINGS)) {
    try {
      config = JSON.parse(await readFile(SETTINGS, 'utf8'))
      if (!uuid(config?.organizationId) || !/^[0-9a-f]{64}$/.test(config?.deviceToken || '')) {
        config = null
      }
    } catch { config = null }
  }
  state.paired = !!config
  if (!existsSync(ENV)) {
    const content = 'POSTGRES_PASSWORD=' + randomBytes(32).toString('hex') +
      '\nEVOLUTION_API_KEY=' + randomBytes(32).toString('hex') + '\n'
    await writeFile(ENV, content, { mode: 0o600, flag: 'wx' })
  }
  await chmod(ENV, 0o600)
}
async function saveDevice(result) {
  const next = {
    organizationId: result.organizationId,
    deviceToken: result.deviceToken,
    pairedAt: new Date().toISOString(),
  }
  if (!uuid(next.organizationId) || !/^[0-9a-f]{64}$/.test(next.deviceToken))
    throw new Error('Resposta de vinculação inválida.')
  await writeFile(SETTINGS, JSON.stringify(next), { mode: 0o600 })
  await chmod(SETTINGS, 0o600)
  config = next
  state.paired = true
}
async function readDockerKeys() {
  const text = await readFile(ENV, 'utf8')
  const values = Object.fromEntries(text.split(/\r?\n/).filter(v => v.includes('='))
    .map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)] }))
  if (!/^[0-9a-f]{64}$/.test(values.EVOLUTION_API_KEY || ''))
    throw new Error('Configuração local Evolution inválida.')
  return values
}
async function runDocker(args, timeout = 90_000) {
  return execFileAsync('docker', args, { timeout, maxBuffer: 1024 * 1024 })
}
async function dockerCheck() {
  try {
    await runDocker(['compose', 'version'], 10_000)
    await runDocker(['info', '--format', '{{.ServerVersion}}'], 10_000)
    return true
  } catch { return false }
}
async function startServices() {
  if (!config || inStart) return
  inStart = true
  try {
    if (!await dockerCheck()) {
      state.dockerReady = false
      state.started = false
      state.message = emailFreeError
      return
    }
    state.dockerReady = true
    state.message = 'Iniciando os serviços do WhatsApp...'
    // A distinct compose project never deletes or changes legacy session volumes.
    await runDocker(['compose', '--project-name', 'realtalent-connect',
      '--env-file', ENV, '-f', COMPOSE, 'up', '-d'], 180_000)
    state.started = true
    state.message = 'Conector iniciado. Agora gere o QR no CRM.'
  } catch {
    state.started = false
    state.message = 'Não foi possível iniciar o Docker. Verifique se a porta 8080 está livre.'
  } finally { inStart = false }
}
async function callDevice(action, payload = {}) {
  if (!config) throw new Error('Vincule este computador primeiro.')
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: PUBLIC_KEY,
      'x-rt-device-token': config.deviceToken },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(15_000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.ok) {
    if (response.status === 401) {
      state.message = 'Vínculo revogado. Gere um novo código no CRM.'
      state.paired = false
      state.started = false
      config = null
      await unlink(SETTINGS).catch(() => {})
    }
    throw new Error('Conector Supabase: ' + (result.error || response.status))
  }
  return result
}
async function evolution(path, method = 'GET', body) {
  const keys = await readDockerKeys()
  const response = await fetch('http://127.0.0.1:8080' + path, {
    method, headers: { apikey: keys.EVOLUTION_API_KEY, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  })
  if (response.status === 404) return { notFound: true }
  if (!response.ok) throw new Error('Evolution HTTP ' + response.status)
  return response.json().catch(() => ({}))
}
async function connectionState() {
  const result = await evolution('/instance/connectionState/' + 'realtalent-' + config.organizationId)
  return result.notFound ? 'missing' : result.instance?.state || 'close'
}
async function sendText(phone, text) {
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone) ||
      typeof text !== 'string' || text.length > 3000) return null
  const result = await evolution('/message/sendText/realtalent-' + config.organizationId, 'POST', {
    number: phone.slice(1), text,
  })
  return typeof result.key?.id === 'string' && result.key.id ? result.key.id : null
}
async function processCommand(command) {
  if (!uuid(command?.requestId)) return
  let error = null
  try {
    const instance = 'realtalent-' + config.organizationId
    if (command.action === 'connect') {
      const status = await connectionState()
      if (status === 'open') {
        state.connection = 'open'
        qrCache = { image: null, expires: 0 }
      } else {
        let image = null
        if (status === 'missing') {
          try {
            const created = await evolution('/instance/create', 'POST', {
              instanceName: instance, integration: 'WHATSAPP-BAILEYS', qrcode: true,
            })
            image = qrImage(created.qrcode?.base64 || created.base64)
          } catch { /* instance may have been created by another command */ }
        }
        if (!image) {
          const connected = await evolution('/instance/connect/' + instance)
          image = qrImage(connected.base64 || connected.qrcode?.base64)
        }
        if (image) qrCache = { image, expires: Date.now() + 35_000 }
        state.connection = 'connecting'
      }
    } else if (command.action === 'disconnect') {
      if (await connectionState() !== 'missing')
        await evolution('/instance/logout/' + instance, 'DELETE')
      state.connection = 'close'
      qrCache = { image: null, expires: 0 }
    } else error = 'Ação desconhecida.'
  } catch { error = 'Não foi possível concluir o pareamento no Evolution.' }
  await callDevice('ack', { kind: 'command', requestId: command.requestId, error })
}
async function processVerification(item) {
  let providerMessageId = null
  try { providerMessageId = await sendText(item.phone, item.text) } catch {}
  // Unknown delivery outcomes are never retried automatically.
  await callDevice('ack', { kind: 'verification', userId: item.userId, providerMessageId })
}
async function processReminder(item) {
  let providerMessageId = null
  try { providerMessageId = await sendText(item.phone, item.text) } catch {}
  // No requeue on failed/unknown ACK: prevents accidental duplicate sends.
  await callDevice('ack', { kind: 'reminder', jobId: item.jobId, providerMessageId })
}
async function tick() {
  if (!config || inTick || !state.started) return
  inTick = true
  try {
    state.connection = await connectionState()
    if (state.connection === 'open') qrCache = { image: null, expires: 0 }
    const qr = qrCache.expires > Date.now() ? qrCache.image : null
    await callDevice('heartbeat', { state: state.connection, qr })
    const batch = await callDevice('poll')
    for (const cmd of batch.commands || []) await processCommand(cmd)
    if (state.connection === 'open') {
      for (const item of batch.verifications || []) await processVerification(item)
      for (const item of batch.reminders || []) await processReminder(item)
    }
    if (state.connection === 'open') state.message = 'WhatsApp conectado. Notificações locais habilitadas.'
    else if (state.connection === 'connecting') state.message = 'Abra o CRM e escaneie o QR Code.'
    else state.message = 'Abra Configurações → WhatsApp no CRM e clique em Gerar QR Code.'
    state.lastTick = new Date().toISOString()
  } catch {
    state.message = 'A comunicação ainda não foi estabelecida. Confira a conexão com a internet e o Docker.'
  } finally { inTick = false }
}
async function pair(code) {
  if (!/^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/.test(String(code).toUpperCase()))
    throw new Error('Digite o código de 16 caracteres, com os hífens.')
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: PUBLIC_KEY },
    body: JSON.stringify({ action: 'claim', code }),
    signal: AbortSignal.timeout(20_000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.deviceToken) {
    throw new Error(result.error === 'pairing_code_expired_or_used'
      ? 'Código expirado ou já utilizado. Gere um novo código no CRM.'
      : 'Não foi possível vincular. Confira o código e a conexão com a internet.')
  }
  await saveDevice(result)
  state.message = 'Computador vinculado. Preparando o WhatsApp...'
  void startServices()
}
const json = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(data))
}
async function readBody(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk.toString('utf8')
    if (raw.length > 4096) throw new Error('Solicitação muito grande.')
  }
  return JSON.parse(raw)
}
const server = http.createServer(async (req, res) => {
  const host = req.headers.host || ''
  if (host !== '127.0.0.1:' + PORT && host !== 'localhost:' + PORT) {
    res.writeHead(403); res.end(); return
  }
  const path = (req.url || '').split('?')[0]
  if (req.method === 'GET' && path === '/') {
    const source = await readFile(join(HERE, 'index.html'), 'utf8')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store', 'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" })
    res.end(source.replaceAll('__CSRF_TOKEN__', CSRF))
    return
  }
  if (req.method === 'GET' && path === '/api/status') {
    json(res, 200, {
      ...state, paired: !!config && state.paired,
      crmUrl: 'https://crm-real-talen-git-a52b30-marcelocambrussijunior-3071s-projects.vercel.app/#/settings?filter=whatsapp',
    })
    return
  }
  if (req.method !== 'POST' || !['/api/pair','/api/start'].includes(path)) {
    json(res, 404, { error: 'Não encontrado.' }); return
  }
  if (!['http://127.0.0.1:' + PORT, 'http://localhost:' + PORT]
    .includes(req.headers.origin || '') || req.headers['x-rt-csrf'] !== CSRF) {
    json(res, 403, { error: 'Solicitação não autorizada.' }); return
  }
  try {
    const data = await readBody(req)
    if (path === '/api/pair') await pair(String(data.code || '').toUpperCase())
    else await startServices()
    json(res, 200, { ok: true })
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : 'Operação indisponível.' })
  }
})
await prepare()
server.listen(PORT, '127.0.0.1', () => {
  state.appRunning = true
  state.message = config ? 'Computador vinculado. Verificando o Docker...' :
    'Abra o CRM para gerar seu código de vinculação.'
  console.log('RealTalent Connect em http://127.0.0.1:' + PORT)
})
if (config) void startServices()
setInterval(async () => {
  if (config && !state.started && !inStart) await startServices()
  await tick()
}, 6_000)
process.on('SIGTERM', () => server.close())
