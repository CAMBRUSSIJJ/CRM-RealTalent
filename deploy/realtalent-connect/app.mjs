import http from 'node:http'
import { readFile, mkdir, writeFile, chmod, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWhatsAppWebEngine } from './whatsapp-web-engine.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STATE = join(homedir(), '.config', 'realtalent-connect')
const SETTINGS = join(STATE, 'device.json')
const PORT = 4375
const SUPABASE_URL = 'https://bacdqruzxklfqdydijjn.supabase.co'
const PUBLIC_KEY = 'sb_publishable_xJOiFDc2_TUp1a78khj0ZA_FFwpCGGg'
const ENDPOINT = SUPABASE_URL + '/functions/v1/whatsapp-connect'
const CSRF = randomBytes(24).toString('hex')
const uuid = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const state = {
  appRunning: false,
  dockerReady: false,
  started: false,
  paired: false,
  connection: 'offline',
  message: 'Preparando o aplicativo...',
  lastTick: null,
  lastError: null,
  qrReady: false,
}
let config = null
let inTick = false
let inStart = false
let qrCache = { image: null, expires: 0 }
let lastRecoveryAt = 0
let recovering = false

const webEngine = createWhatsAppWebEngine({
  packageDir: join(HERE, 'runtime'),
  authDir: join(STATE, 'whatsapp-web-session'),
  onQr: image => {
    qrCache = { image, expires: image ? Date.now() + 90000 : 0 }
    state.qrReady = Boolean(image)
    if (image) {
      state.lastError = null
      state.message = 'QR Code disponível. Abra o RealTalent Connect ou o CRM para escanear.'
    }
  },
  onState: value => {
    state.connection = value
    if (value === 'open') {
      qrCache = { image: null, expires: 0 }
      state.qrReady = false
      state.lastError = null
      state.message = 'WhatsApp Web conectado ao RealTalent.'
    }
  },
  onError: value => {
    // Browser errors may contain paths and other local details. Only return
    // user-safe messages from the engine, not raw logs or conversation data.
    state.lastError = String(value).slice(0, 220)
    state.message = state.lastError
  },
})

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
  // Keep the existing device credential and the prior Evolution volumes.
  // WhatsApp Web persists an independent LocalAuth profile here.
  await mkdir(join(STATE, 'whatsapp-web-session'), { recursive: true, mode: 0o700 })

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
async function startServices() {
  if (!config || inStart || state.started) return
  inStart = true
  state.message = 'Inicializando WhatsApp Web, sem Evolution nem Docker...'
  try {
    await webEngine.start(config.organizationId)
    state.started = true
    state.dockerReady = true // Historical compatibility with the local UI.
    state.message = 'WhatsApp Web iniciado. O QR aparecerá aqui ou no CRM.'
  } catch (error) {
    state.started = false
    state.dockerReady = false
    state.lastError = error instanceof Error ? error.message : 'Motor WhatsApp Web não iniciou.'
    state.message = state.lastError
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
async function sendText(phone, text) {
  return webEngine.sendText(phone, text)
}
async function processCommand(command) {
  if (!uuid(command?.requestId)) return
  let error = null
  try {
    if (command.action === 'connect') {
      const previous = webEngine.status()
      if (previous.state === 'error') await webEngine.restart()
      else await webEngine.start(config.organizationId)
      state.started = true
      state.message = 'WhatsApp Web inicializado. Aguarde o QR ou a restauração da sessão.'
    } else if (command.action === 'disconnect') {
      await webEngine.stop()
      state.started = false
      state.connection = 'close'
      qrCache = { image: null, expires: 0 }
      state.qrReady = false
      state.lastError = null
      state.message = 'WhatsApp Web interrompido neste computador. A sessão local foi preservada.'
    } else {
      error = 'Ação de conexão desconhecida.'
    }
  } catch {
    error = 'Não foi possível iniciar WhatsApp Web. Confira o diagnóstico do aplicativo Linux.'
    state.lastError = error
    state.message = error
  }
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
  if (!config || inTick || recovering) return
  inTick = true
  try {
    const wa = webEngine.status()
    state.connection = wa.state
    const qr = wa.qr
    state.qrReady = Boolean(qr)
    if (qr) qrCache = { image: qr, expires: Date.now() + 90000 }
    if (wa.error) state.lastError = wa.error
    if (wa.state === 'open') state.lastError = null
    await callDevice('heartbeat', {
      state: wa.state,
      qr,
      // Clear a stale Evolution error when this new browser engine is healthy
      // but is still loading its login page.
      error: wa.error || '',
    })
    const batch = await callDevice('poll')
    for (const cmd of batch.commands || []) await processCommand(cmd)
    if ((batch.commands || []).length) {
      const updated = webEngine.status()
      await callDevice('heartbeat', { state: updated.state, qr: updated.qr,
        ...(updated.error ? { error: updated.error } : { error: '' }) })
    }
    if (webEngine.status().state === 'open') {
      for (const item of batch.verifications || []) await processVerification(item)
      for (const item of batch.reminders || []) await processReminder(item)
    }
    if (state.lastError) state.message = state.lastError
    else if (wa.state === 'open') state.message = 'WhatsApp conectado. Notificações de tarefas disponíveis.'
    else if (qr) state.message = 'QR Code pronto. Escaneie aqui ou nas configurações do CRM.'
    else if (wa.state === 'connecting') state.message = 'Abrindo WhatsApp Web no Chromium...'
    else if (!state.started) state.message = 'Inicie o motor WhatsApp Web pelo aplicativo.'
    else state.message = 'WhatsApp Web desconectado. Use Conectar WhatsApp no CRM.'
    state.lastTick = new Date().toISOString()
  } catch {
    state.message = 'Não foi possível sincronizar com o Supabase. O WhatsApp Web continua no Linux.'
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
  state.message = 'Computador vinculado. Preparando WhatsApp Web...'
  void startServices()
}
async function recoverWhatsApp() {
  if (!config || !state.started) throw new Error('O motor WhatsApp Web não está iniciado.')
  if (state.connection === 'open') throw new Error('O WhatsApp já está conectado.')
  if (recovering) throw new Error('A recuperação já está em andamento.')
  if (Date.now() - lastRecoveryAt < 10 * 60_000)
    throw new Error('Aguarde dez minutos antes de tentar outra recuperação.')
  recovering = true
  lastRecoveryAt = Date.now()
  state.message = 'Reiniciando apenas o Chromium. A sessão do telefone será preservada.'
  try {
    await webEngine.restart()
    state.connection = 'connecting'
    state.lastError = null
  } catch {
    throw new Error('Falha ao reiniciar WhatsApp Web. Verifique se o Chromium está instalado.')
  } finally { recovering = false }
}
async function diagnostic() {
  const wa = webEngine.status()
  let browser = wa.chromium
  const status = wa.state
  return {
    engine: 'WhatsApp Web nativo — sem Docker',
    whatsApp: status,
    qr: wa.qr ? 'Código disponível' : 'Código não disponível',
    browser,
    detail: wa.error || state.lastError || null,
    advice: wa.error ||
      (status === 'open' ? 'WhatsApp conectado.' :
       wa.qr ? 'QR gerado neste Linux. Escaneie com Dispositivos conectados.' :
       status === 'connecting' ? 'WhatsApp Web está inicializando no Chromium. Aguarde o QR.' :
       'Use Gerar QR Code no CRM. O motor não utiliza Evolution, PostgreSQL ou Redis.'),
  }
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
  if (req.method === 'GET' && path === '/api/diagnostic') {
    json(res, 200, await diagnostic())
    return
  }
  if (req.method === 'GET' && path === '/api/qr') {
    // QR is a temporary WhatsApp login secret. It is intentionally not sent
    // to general /status responses. Same-origin local UI supplies the CSRF
    // header; arbitrary external websites cannot read it via CORS.
    if (req.headers['x-rt-csrf'] !== CSRF) {
      json(res, 403, { error: 'Acesso não autorizado ao QR.' })
      return
    }
    const image = webEngine.status().qr
    const ready = state.connection !== 'open' && Boolean(image)
    json(res, 200, { ready, image: ready ? image : null })
    return
  }
  if (req.method === 'GET' && path === '/api/status') {
    json(res, 200, {
      ...state, paired: !!config && state.paired, engine: 'whatsapp-web.js',
      crmUrl: 'https://crm-real-talen-git-a52b30-marcelocambrussijunior-3071s-projects.vercel.app/#/settings?filter=whatsapp',
    })
    return
  }
  if (req.method !== 'POST' || !['/api/pair','/api/start','/api/recover'].includes(path)) {
    json(res, 404, { error: 'Não encontrado.' }); return
  }
  if (!['http://127.0.0.1:' + PORT, 'http://localhost:' + PORT]
    .includes(req.headers.origin || '') || req.headers['x-rt-csrf'] !== CSRF) {
    json(res, 403, { error: 'Solicitação não autorizada.' }); return
  }
  try {
    const data = await readBody(req)
    if (path === '/api/pair') await pair(String(data.code || '').toUpperCase())
    else if (path === '/api/recover') await recoverWhatsApp()
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
process.on('SIGTERM', () => { void webEngine.stop(); server.close() })
