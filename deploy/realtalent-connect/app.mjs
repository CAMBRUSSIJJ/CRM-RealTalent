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
  lastError: null,
  qrReady: false,
}
let config = null
let inTick = false
let inStart = false
let qrCache = { image: null, expires: 0 }
let qrRequested = false
let lastQrAttempt = 0
let qrAttempts = 0
let qrZeroCount = false
const MAX_QR_ATTEMPTS = 5

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
const qrFromResponse = async response => {
  const candidates = [response?.base64,response?.qrcode?.base64,response?.data?.base64,
    response?.data?.qrcode?.base64,response?.qr?.base64,response?.code,
    response?.qrcode?.code,response?.data?.code]
  for (const item of candidates) {
    const valid = qrImage(item)
    if (valid) return valid
  }
  const raw = candidates.find(v => typeof v === 'string' && v.startsWith('2@') && v.length < 4096)
  if (raw) {
    try {
      const { default: QRCode } = await import('qrcode')
      return qrImage(await QRCode.toDataURL(raw, {
        type: 'image/png', width: 360, margin: 2, errorCorrectionLevel: 'M',
      }))
    } catch {
      state.lastError = 'Biblioteca do QR local ausente. Reinstale o RealTalent Connect atualizado.'
    }
  }
  return null
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
async function fetchNewQr(instance, allowCreate = true) {
  const status = await connectionState()
  if (status === 'open') {
    qrRequested = false
    state.connection = 'open'
    qrCache = { image: null, expires: 0 }
    state.qrReady = false
    state.lastError = null
    return true
  }
  if (status === 'missing' && allowCreate) {
    let created = null
    try {
      created = await evolution('/instance/create', 'POST', {
        instanceName: instance, integration: 'WHATSAPP-BAILEYS', qrcode: true,
      })
    } catch (error) {
      // A simultaneous previous request may already have created the instance.
      if (await connectionState() === 'missing') throw error
    }
    const fromCreate = await qrFromResponse(created)
    if (fromCreate) {
      qrCache = { image: fromCreate, expires: Date.now() + 30000 }
      state.qrReady = true
      state.lastError = null
      state.connection = 'connecting'
      return true
    }
  }
  // Evolution v2 uses GET /instance/connect/{name}. The QR may appear
  // asynchronously. This function is retried while pairing is requested.
  const connected = await evolution('/instance/connect/' + instance)
  if (connected.notFound) throw new Error('Evolution instance missing')
  qrZeroCount = Number(connected?.count ?? connected?.qrcode?.count ?? -1) === 0
  const image = await qrFromResponse(connected)
  if (image) {
    qrCache = { image, expires: Date.now() + 30000 }
    state.qrReady = true
    state.lastError = null
    state.connection = 'connecting'
    return true
  }
  qrAttempts += 1
  state.connection = 'connecting'
  state.qrReady = false
  if (qrAttempts >= MAX_QR_ATTEMPTS) {
    // QR count=0 is a known Baileys/Evolution symptom; repeating indefinitely
    // can exceed WhatsApp rate limits without solving the underlying issue.
    qrRequested = false
    state.connection = 'error'
    state.lastError = qrZeroCount
      ? 'Evolution API devolveu count=0: não está conseguindo gerar o QR. Verifique o diagnóstico do Evolution.'
      : 'Evolution não devolveu imagem nem código de QR após 5 tentativas. Verifique o diagnóstico do Evolution.'
    state.message = state.lastError
  }
  return false
}
async function processCommand(command) {
  if (!uuid(command?.requestId)) return
  let error = null
  try {
    const instance = 'realtalent-' + config.organizationId
    if (command.action === 'connect') {
      qrRequested = true
      qrAttempts = 0
      qrZeroCount = false
      lastQrAttempt = Date.now()
      state.lastError = null
      await fetchNewQr(instance)
    } else if (command.action === 'disconnect') {
      qrRequested = false
      if (await connectionState() !== 'missing')
        await evolution('/instance/logout/' + instance, 'DELETE')
      state.connection = 'close'
      qrCache = { image: null, expires: 0 }
      state.qrReady = false
      state.lastError = null
    } else error = 'Ação desconhecida.'
  } catch (cause) {
    error = cause instanceof Error && /^Evolution HTTP [0-9]{3}$/.test(cause.message)
      ? cause.message + '. Consulte o serviço Evolution no Linux.'
      : 'A Evolution não conseguiu gerar o QR. Confira os serviços no Linux.'
    state.lastError = error
    state.message = error
    state.qrReady = false
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
  if (!config || inTick || !state.started) return
  inTick = true
  try {
    const evolutionState = await connectionState()
    if (evolutionState === 'open') {
      qrRequested = false
      state.connection = 'open'
      qrCache = { image: null, expires: 0 }
      state.qrReady = false
      state.lastError = null
    } else {
      state.connection = qrRequested ? 'connecting' : state.lastError ? 'error' : evolutionState
      if (qrRequested && Date.now() - lastQrAttempt >= 7000 &&
          qrCache.expires <= Date.now()) {
        lastQrAttempt = Date.now()
        try {
          await fetchNewQr('realtalent-' + config.organizationId)
        } catch (err) {
          state.lastError = err instanceof Error && /^Evolution HTTP [0-9]{3}$/.test(err.message)
            ? err.message + '. Verifique a Evolution no computador.'
            : 'Evolution não conseguiu criar um QR. Verifique os serviços no Linux.'
        }
      }
    }
    let qr = state.connection !== 'open' && qrCache.expires > Date.now()
      ? qrCache.image : null
    const heartbeat = { state: state.connection, qr }
    if (qr || state.connection === 'open') heartbeat.error = ''
    else if (state.lastError) heartbeat.error = state.lastError
    await callDevice('heartbeat', heartbeat)
    const batch = await callDevice('poll')
    for (const cmd of batch.commands || []) await processCommand(cmd)
    if ((batch.commands || []).length > 0) {
      qr = state.connection !== 'open' && qrCache.expires > Date.now()
        ? qrCache.image : null
      await callDevice('heartbeat', { state: state.connection, qr,
        ...(qr ? { error: '' } : state.lastError ? { error: state.lastError } : {}) })
    }
    if (state.connection === 'open') {
      for (const item of batch.verifications || []) await processVerification(item)
      for (const item of batch.reminders || []) await processReminder(item)
    }
    state.qrReady = !!qr && qrCache.expires > Date.now()
    if (state.lastError) state.message = state.lastError
    else if (state.connection === 'open') state.message = 'WhatsApp conectado. Notificações locais habilitadas.'
    else if (state.qrReady) state.message = 'QR Code pronto. Abra Configurações → WhatsApp no CRM.'
    else if (qrRequested) state.message = 'Preparando QR Code no Evolution (tentativa ' + qrAttempts + ').'
    else state.message = 'Abra Configurações → WhatsApp no CRM e clique em Gerar QR Code.'
    state.lastTick = new Date().toISOString()
  } catch (err) {
    state.message = 'Conector sem sincronização. Confira a internet e os serviços Docker.'
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
async function diagnostic() {
  const result = {
    engine: state.started ? 'Serviços inicializados' : 'Serviços não inicializados',
    whatsApp: state.connection,
    qr: state.qrReady ? 'Código disponível' : qrZeroCount ? 'Evolution retornou count=0' : 'Código não disponível',
    detail: state.lastError || null,
    advice: '',
    postgres: 'Não verificado',
    redis: 'Não verificado',
    evolution: 'Não verificado',
  }
  const base = ['compose','--project-name','realtalent-connect','--env-file',ENV,'-f',COMPOSE]
  async function probe(service, command, expected) {
    try {
      const { stdout = '' } = await runDocker([...base,'exec','-T',service,...command],10000)
      return stdout.includes(expected) ? 'Saudável' : 'Sem resposta válida'
    } catch { return 'Indisponível' }
  }
  ;[result.postgres, result.redis] = await Promise.all([
    probe('postgres',['pg_isready','-U','evolution','-d','evolution'],'accepting connections'),
    probe('redis',['redis-cli','PING'],'PONG'),
  ])
  try { await connectionState(); result.evolution = 'API respondendo' }
  catch { result.evolution = 'API indisponível' }
  try {
    const { stdout = '', stderr = '' } = await runDocker([
      'compose', '--project-name', 'realtalent-connect',
      '--env-file', ENV, '-f', COMPOSE, 'logs', '--tail', '90',
      '--no-color', 'evolution',
    ], 12_000)
    // Classify locally. Never expose logs, WhatsApp pairing material,
    // phone numbers, or Docker secrets to the browser or to Supabase.
    const lines = (stdout + '\n' + stderr).slice(-30000)
    if (result.postgres !== 'Saudável')
      result.advice = 'O PostgreSQL não responde. Verifique o banco local, sem apagar volumes.'
    else if (result.redis !== 'Saudável')
      result.advice = 'O Redis não responde. Verifique o serviço de cache antes do QR.'
    else if (result.evolution !== 'API respondendo')
      result.advice = 'PostgreSQL e Redis respondem, mas a API Evolution está indisponível.'
    else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|DNS|resolve failed/i.test(lines))
      result.advice = 'A Evolution pode estar com falha de DNS. Verifique a rede do Docker.'
    else if (/ECONNREFUSED|ETIMEDOUT|websocket.*(?:error|closed)|connection timeout/i.test(lines))
      result.advice = 'A Evolution não conseguiu manter conexão com os servidores WhatsApp.'
    else if (/P1000|P1001|P1002|P1017|PrismaClient(?:Initialization|KnownRequest)Error|database.*(?:connection refused|authentication failed)|redis.*(?:ECONNREFUSED|NOAUTH|WRONGPASS|failed to connect)/i.test(lines))
      result.advice = 'Há erros de banco de dados ou Redis no Evolution.'
    else if (/bad.session|version.*(?:unsupported|invalid)|handshake.*failed/i.test(lines))
      result.advice = 'A versão do motor WhatsApp pode estar incompatível.'
  } catch {
    result.advice = 'Não foi possível consultar os registros do Docker. Verifique o serviço Evolution.'
  }
  if (!result.advice && result.postgres === 'Saudável' && result.redis === 'Saudável' && result.evolution === 'API respondendo') {
    result.advice = qrZeroCount
      ? 'PostgreSQL e Redis estão saudáveis. A Evolution responde count=0: a sessão WhatsApp não gerou QR.'
      : 'Os serviços estão saudáveis. O bloqueio parece ocorrer na sessão WhatsApp, não no banco.'
  }
  if (!result.advice && qrZeroCount)
    result.advice = 'Evolution respondeu count=0. Isso pode ser incompatibilidade do motor WhatsApp, rede ou sessão travada.'
  if (!result.advice && !state.qrReady && qrAttempts >= MAX_QR_ATTEMPTS)
    result.advice = 'O Evolution não enviou dados de QR. Não insista no botão; verifique a rede e a versão do conector.'
  if (!result.advice && state.connection === 'open') result.advice = 'WhatsApp conectado.'
  if (!result.advice) result.advice = 'Solicite o QR no CRM; se falhar, consulte os serviços da Evolution.'
  return result
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
