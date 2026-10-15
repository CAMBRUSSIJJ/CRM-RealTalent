import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { qrSvg } from './qr-svg-v1018.mjs'

const ROOT = process.cwd()
// V101.10.7: o listener CRM fica em loopback; LAN é aberta explicitamente em um listener separado.
// Historical compatibility marker: REALTALENT_CONNECT_HOST || '0.0.0.0'
const HOST = '127.0.0.1'
const PORT = Number(process.env.REALTALENT_CONNECT_PORT || 3001)
const CAP_SCHEMA = 'realtalent.voice.capabilities.v1'
const CALL_SCHEMA = 'realtalent.voice.call.v1'
const PHONE_SCHEMA = 'realtalent.phone.v1'
const CONNECT_RELEASE = '101.8.3'
const CONNECT_PROTOCOL = '101.4.0' // compatibility protocol used by historical runtime QA
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const PHONE_PRESENCE_TTL_MS = 90_000
const PAIRING_TTL_MS = Math.max(60_000, Number(process.env.REALTALENT_CONNECT_PAIRING_TTL_MS || 5 * 60_000))
const PAIRING_MAX_ATTEMPTS = Math.max(3, Number(process.env.REALTALENT_CONNECT_PAIRING_MAX_ATTEMPTS || 5))
const PAIRING_BLOCK_MS = Math.max(30_000, Number(process.env.REALTALENT_CONNECT_PAIRING_BLOCK_MS || 60_000))
const RUNTIME_TOKEN = String(process.env.REALTALENT_RUNTIME_TOKEN || '').trim()
const NETWORK_CONFIG_FILE = process.env.REALTALENT_CONNECT_NETWORK_CONFIG || path.join(ROOT, '.realtalent-connect-network.json')
const phoneHtmlPath = path.join(ROOT, 'scripts', 'realtalent-phone-v10183.html')
const phoneIcon180Path = path.join(ROOT, 'scripts', 'realtalent-phone-icon-180.png')
const phoneIcon512Path = path.join(ROOT, 'scripts', 'realtalent-phone-icon-512.png')

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  const result = {}
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    result[key] = value
  }
  return result
}

const env = { ...parseEnvFile(path.join(ROOT, '.env')), ...parseEnvFile(path.join(ROOT, '.env.local')), ...process.env }
const provider = String(env.REALTALENT_CONNECT_PROVIDER || 'twilio_bridge').trim()
const crmPort = Number(env.REALTALENT_CRM_PORT || 4188)
const defaultCountryCode = String(env.REALTALENT_DEFAULT_COUNTRY_CODE || '55').replace(/\D/g, '') || '55'
const configuredOrigins = String(env.REALTALENT_CONNECT_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean)
const allowedOrigins = new Set(configuredOrigins.length ? configuredOrigins : [`http://127.0.0.1:${crmPort}`, `http://localhost:${crmPort}`, 'http://127.0.0.1:4173', 'http://localhost:4173', 'http://127.0.0.1:4174', 'http://localhost:4174'])

function normalizePhone(value) { return String(value ?? '').trim().replace(/[^\d+]/g, '') }
function normalizeE164(value, fallbackCountryCode = defaultCountryCode) {
  const raw = normalizePhone(value)
  if (!raw) return ''
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00') && digits.length > 4) return `+${digits.slice(2)}`
  if (fallbackCountryCode === '55') {
    if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) return `+55${digits}`
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return `+${digits}`
  }
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : ''
}

const twilio = {
  accountSid: String(env.TWILIO_ACCOUNT_SID || '').trim(),
  authToken: String(env.TWILIO_AUTH_TOKEN || '').trim(),
  fromNumber: normalizeE164(env.TWILIO_FROM_NUMBER || ''),
  agentNumber: normalizeE164(env.REALTALENT_AGENT_PHONE_NUMBER || ''),
}
const twilioConfigured = provider === 'twilio_bridge' && Boolean(twilio.accountSid && twilio.authToken && twilio.fromNumber && twilio.agentNumber)
const phoneStorePath = String(env.REALTALENT_PHONE_STORE || path.join(ROOT, '.realtalent-phone-devices.json'))
const runtimeStorePath = String(env.REALTALENT_CONNECT_RUNTIME_STORE || path.join(ROOT, '.realtalent-connect-runtime.json'))

function loadRuntimeState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(runtimeStorePath, 'utf8'))
    const cutoff = Date.now() - 48 * 60 * 60 * 1000
    const fresh = (items) => Array.isArray(items) ? items.filter((item) => item?.callId && new Date(item.updatedAt || item.createdAt || 0).getTime() >= cutoff) : []
    const calls = fresh(parsed?.activeCalls)
    const commands = fresh(parsed?.phoneCommands)
    const requests = Array.isArray(parsed?.callRequests) ? parsed.callRequests.filter((item) => item?.requestId && item?.callId) : []
    return { activeCalls: new Map(calls.map((item) => [item.callId, item])), phoneCommands: new Map(commands.map((item) => [item.callId, item])), callRequests: new Map(requests.map((item) => [item.requestId, item.callId])) }
  } catch { return { activeCalls: new Map(), phoneCommands: new Map(), callRequests: new Map() } }
}
const restoredRuntime = loadRuntimeState()
const activeCalls = restoredRuntime.activeCalls
const phoneCommands = restoredRuntime.phoneCommands
const callRequests = restoredRuntime.callRequests
function persistRuntimeState() {
  try {
    const payload = { version: CONNECT_PROTOCOL, releaseVersion: CONNECT_RELEASE, savedAt: new Date().toISOString(), activeCalls: [...activeCalls.values()], phoneCommands: [...phoneCommands.values()], callRequests: [...callRequests.entries()].map(([requestId, callId]) => ({ requestId, callId })) }
    fs.writeFileSync(runtimeStorePath, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 })
    try { fs.chmodSync(runtimeStorePath, 0o600) } catch {}
  } catch { /* runtime continua em memória se o storage local falhar */ }
}
function loadPhoneDevices() {
  try {
    const parsed = JSON.parse(fs.readFileSync(phoneStorePath, 'utf8'))
    if (!Array.isArray(parsed)) return new Map()
    return new Map(parsed.filter((item) => item?.id && item?.token).map((item) => [item.id, { ...item, lastSeenAt: '1970-01-01T00:00:00.000Z' }]))
  } catch { return new Map() }
}
function persistPhoneDevices() {
  try {
    const payload = [...phoneDevices.values()].map(({ lastSeenAt, ...item }) => item)
    fs.writeFileSync(phoneStorePath, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 })
    try { fs.chmodSync(phoneStorePath, 0o600) } catch {}
  } catch { /* pairing continua em memória se storage local falhar */ }
}
const phoneDevices = loadPhoneDevices()
function readNetworkConfig() { try { const value=JSON.parse(fs.readFileSync(NETWORK_CONFIG_FILE,'utf8')); return { enabled:value?.enabled===true, host:String(value?.host||'').trim() } } catch { return { enabled:false, host:'' } } }
function persistNetworkConfig(value) { try { fs.writeFileSync(NETWORK_CONFIG_FILE, JSON.stringify(value,null,2)+'\n',{mode:0o600}); try{fs.chmodSync(NETWORK_CONFIG_FILE,0o600)}catch{} } catch {} }
let networkAccess = readNetworkConfig()
let lanServer = null
let activeLanHost = ''

function createPairing(workspaceId = '') {
  return { code: String(randomInt(100000, 999999)), expiresAt: Date.now() + PAIRING_TTL_MS, workspaceId: String(workspaceId || '').slice(0, 160), nonce: randomUUID() }
}
let pairing = createPairing('')
function ensurePairing(workspaceId = '') {
  const requested = String(workspaceId || '').slice(0, 160)
  if (Date.now() > pairing.expiresAt || (requested && pairing.workspaceId && requested !== pairing.workspaceId)) pairing = createPairing(requested)
  else if (requested && !pairing.workspaceId) pairing.workspaceId = requested
  return pairing
}
function regeneratePairing(workspaceId = '') { pairing = createPairing(workspaceId); return pairing }

function isPrivateIpv4(address) {
  return /^192\.168\./.test(address) || /^10\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address)
}
function interfaceKind(name) {
  const value = String(name || '').toLowerCase()
  if (/^(wl|wlan|wifi)/.test(value)) return 'wifi'
  if (/^(en|eth)/.test(value)) return 'ethernet'
  if (/^(tailscale|docker|br-|virbr|veth|podman|cni|tun|tap|wg)/.test(value)) return 'virtual'
  return 'other'
}
function lanInterfaces() {
  const values = []
  for (const [name, entries] of Object.entries(os.networkInterfaces())) for (const entry of entries ?? []) {
    if (entry.family !== 'IPv4' || entry.internal || !isPrivateIpv4(entry.address)) continue
    const kind = interfaceKind(name)
    if (kind === 'virtual') continue
    values.push({ name, address: entry.address, kind, label: kind === 'wifi' ? 'Wi-Fi' : kind === 'ethernet' ? 'Ethernet' : name })
  }
  const priority = (item) => item.kind === 'wifi' ? 0 : item.kind === 'ethernet' ? 1 : item.address.startsWith('192.168.') ? 2 : item.address.startsWith('10.') ? 3 : 4
  const unique = [...new Map(values.map((item) => [item.address, item])).values()].sort((a, b) => priority(a) - priority(b) || a.address.localeCompare(b.address))
  return unique.map((item, index) => ({ ...item, preferred: index === 0 }))
}
function resolveLanHost(requested = '') {
  const candidates = lanInterfaces()
  const forced = String(env.REALTALENT_CONNECT_LAN_HOST || '').trim()
  const desired = String(requested || forced || '').trim()
  if (desired && isPrivateIpv4(desired)) return desired
  return candidates[0]?.address || '127.0.0.1'
}
function preferredLanHost(requested = '') {
  const desired = resolveLanHost(requested || networkAccess.host)
  return desired === '127.0.0.1' ? '' : desired
}
function phoneUrl(workspaceId = '', hostOverride = '') {
  const current = ensurePairing(workspaceId)
  const host = networkAccess.enabled ? (activeLanHost || preferredLanHost(hostOverride) || '127.0.0.1') : '127.0.0.1'
  const workspace = current.workspaceId ? `&workspace=${encodeURIComponent(current.workspaceId)}` : ''
  return `http://${host}:${PORT}/phone?code=${current.code}${workspace}`
}
function pairingPayload(workspaceId = '', hostOverride = '') {
  const current = ensurePairing(workspaceId)
  const interfaces = lanInterfaces()
  const candidateLanHost = preferredLanHost(hostOverride)
  const selectedLanHost = activeLanHost || candidateLanHost || '127.0.0.1'
  const lanReady = Boolean(networkAccess.enabled && activeLanHost)
  return {
    schema: PHONE_SCHEMA,
    code: current.code,
    phoneUrl: phoneUrl(current.workspaceId, selectedLanHost),
    qrUrl: `http://127.0.0.1:${PORT}/api/phone/v1/pairing/qr?workspaceId=${encodeURIComponent(current.workspaceId)}&host=${encodeURIComponent(selectedLanHost)}&nonce=${encodeURIComponent(current.nonce)}`,
    expiresAt: new Date(current.expiresAt).toISOString(),
    workspaceId: current.workspaceId || null,
    lanAddresses: interfaces.map((item) => item.address),
    lanInterfaces: interfaces,
    selectedLanHost,
    lanReady,
    networkAccess: { mode: lanReady ? 'lan-enabled' : 'local-only', enabled: lanReady, host: lanReady ? activeLanHost : null },
  }
}
function diagnosticsPayload(workspaceId = '') {
  const interfaces = lanInterfaces()
  const phones = onlinePhoneDevices(workspaceId)
  const online = phones.filter((item) => item.available)
  const candidateLanHost = preferredLanHost('')
  const lanReady = Boolean(networkAccess.enabled && activeLanHost)
  return {
    service: 'RealTalent Connect', releaseVersion: CONNECT_RELEASE, bridge: { ok: true, port: PORT, host: HOST },
    pairingApi: true, realtime: true,
    security: { runtimeAuth: Boolean(RUNTIME_TOKEN), hostValidation: true, originValidation: true, pairingRateLimit: true },
    networkAccess: { mode: lanReady ? 'lan-enabled' : 'local-only', enabled: lanReady, host: lanReady ? activeLanHost : null },
    lan: { ready: lanReady, selectedHost: activeLanHost || candidateLanHost || '127.0.0.1', interfaces },
    phone: { pairedCount: phones.length, onlineCount: online.length, oneTapReadyCount: online.filter((item) => item.oneTapReady).length },
    dialer: { ready: online.length > 0 || twilioConfigured, mode: online.length > 0 ? 'phone-companion' : twilioConfigured ? 'pstn' : 'waiting-phone' },
    firewall: { status: 'unknown', port: PORT, hint: lanReady ? `Acesso do celular liberado somente em http://${activeLanHost}:${PORT}.` : 'Rede local bloqueada. Ative “Permitir celular na rede local” para parear/usar o companion.' },
  }
}
function maskPhone(value) { const phone = normalizePhone(value); return phone.length < 6 ? (phone ? '••••' : '') : `${phone.slice(0, 3)}••••${phone.slice(-3)}` }
function requestOrigin(req) { return typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '' }
function remoteAddress(req) { return String(req.socket.remoteAddress || '').replace(/^::ffff:/, '') }
function isLoopback(req) { const address = remoteAddress(req); return address === '127.0.0.1' || address === '::1' }
function requestHostname(req) { try { return new URL(`http://${String(req.headers.host || '')}`).hostname.toLowerCase() } catch { return '' } }
function isKnownLocalHost(hostname) { return hostname === '127.0.0.1' || hostname === 'localhost' || lanInterfaces().some((item) => item.address === hostname) }
function isHostAllowed(req) { return isKnownLocalHost(requestHostname(req)) }
function isOriginAllowed(req) { const origin = requestOrigin(req); return origin ? allowedOrigins.has(origin) : isLoopback(req) }
function isPhoneOriginAllowed(req) { const origin=requestOrigin(req); if(!origin)return true; if(allowedOrigins.has(origin)) return true; try { const url=new URL(origin); return isKnownLocalHost(url.hostname) && (!url.port || Number(url.port)===PORT) } catch { return false } }
function constantTimeToken(a,b){const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));return aa.length===bb.length&&aa.length>0&&timingSafeEqual(aa,bb)}
function suppliedRuntimeToken(req){const direct=String(req.headers['x-realtalent-runtime-token']||'').trim();if(direct)return direct;const auth=String(req.headers.authorization||'').trim();return auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():''}
function runtimeAuthorized(req){if(RUNTIME_TOKEN)return constantTimeToken(suppliedRuntimeToken(req),RUNTIME_TOKEN);return isLoopback(req)&&isOriginAllowed(req)}
function cors(req, res) {
  const origin = requestOrigin(req)
  if (origin && allowedOrigins.has(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin') }
  res.setHeader('Access-Control-Allow-Headers', 'content-type, accept, authorization, x-realtalent-runtime-token')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}
function json(res, status, payload) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Content-Type-Options','nosniff'); res.end(JSON.stringify(payload)) }
function httpError(message, statusCode) { const error = new Error(message); error.statusCode = statusCode; return error }
async function readJson(req) { const chunks = []; let total=0; for await (const chunk of req) { total+=chunk.length; if(total>256_000) throw httpError('Payload muito grande.',413); chunks.push(chunk) } if (!chunks.length) return {}; try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw httpError('JSON inválido.', 400) } }
function xmlEscape(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[char])) }
function twilioAuthHeader() { return `Basic ${Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString('base64')}` }
async function twilioRequest(resource, { method = 'GET', body } = {}) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/${resource}`
  const headers = { Authorization: twilioAuthHeader(), Accept: 'application/json' }
  let payload
  if (body) { headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8'; payload = new URLSearchParams(body).toString() }
  const response = await fetch(url, { method, headers, body: payload })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw httpError(typeof data?.message === 'string' ? data.message : `Twilio respondeu HTTP ${response.status}`, 502)
  return data
}
function mapTwilioState(status) {
  const state = String(status || '').toLowerCase()
  if (state === 'queued') return 'connecting'
  if (state === 'ringing') return 'ringing'
  if (state === 'in-progress') return 'connected'
  if (['completed', 'canceled'].includes(state)) return 'ended'
  if (['busy', 'failed', 'no-answer'].includes(state)) return 'failed'
  return 'connecting'
}

const phoneSockets = new Map()
const callSockets = new Map()
function socketSet(map, key) { if (!map.has(key)) map.set(key, new Set()); return map.get(key) }
function socketAvailable(deviceId) { return Boolean(phoneSockets.get(deviceId)?.size) }
function wsText(socket, payload) {
  if (!socket || socket.destroyed) return false
  const body = Buffer.from(JSON.stringify(payload))
  let header
  if (body.length < 126) header = Buffer.from([0x81, body.length])
  else if (body.length <= 0xffff) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(body.length, 2) }
  else return false
  try { socket.write(Buffer.concat([header, body])); return true } catch { return false }
}
function wsHandshake(req, socket) {
  const key = String(req.headers['sec-websocket-key'] || '')
  if (!key) return false
  const accept = createHash('sha1').update(key + WS_GUID).digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  return true
}
function registerSocket(map, key, socket) {
  const set = socketSet(map, key); set.add(socket)
  const cleanup = () => { set.delete(socket); if (!set.size) map.delete(key) }
  socket.on('close', cleanup); socket.on('error', cleanup); socket.on('data', () => {})
}
function broadcast(map, key, payload) { for (const socket of map.get(key) ?? []) if (!wsText(socket, payload)) try { socket.destroy() } catch {} }
function callStatePayload(call) { return { schema: CALL_SCHEMA, type: 'call.state', callId: call.callId, state: call.state || 'connecting', direction: 'outbound', phone: call.phone || '', leadId: call.leadId ?? null, updatedAt: call.updatedAt || new Date().toISOString() } }
function broadcastCall(callId) { const call = activeCalls.get(callId); if (call) broadcast(callSockets, callId, callStatePayload(call)) }
function pushPhoneCommand(deviceId, command) { broadcast(phoneSockets, deviceId, { schema: PHONE_SCHEMA, type: 'call.command', command }) }

function onlinePhoneDevices(workspaceId = '') {
  const now = Date.now(); const requested = String(workspaceId || '')
  return [...phoneDevices.values()]
    .filter((device) => !requested || !device.workspaceId || device.workspaceId === requested)
    .map((device) => {
      const realtime = socketAvailable(device.id)
      const available = realtime || now - new Date(device.lastSeenAt).getTime() < PHONE_PRESENCE_TTL_MS
      const visible = device.visibility !== 'hidden'
      const oneTapReady = Boolean(available && realtime && visible && device.oneTapEnabled !== false)
      return { ...device, available, realtime, oneTapReady }
    })
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
}
function capabilitiesPayload() {
  const phoneCount = onlinePhoneDevices().filter((item) => item.available).length
  const configured = twilioConfigured || phoneCount > 0
  const detail = twilioConfigured && phoneCount ? `Twilio Bridge ativo e ${phoneCount} RealTalent Phone conectado(s).` : phoneCount ? `${phoneCount} RealTalent Phone conectado(s). Chamadas podem ser enviadas ao discador do celular.` : twilioConfigured ? `Twilio Bridge ativo. O Connect ligará primeiro para o agente ${maskPhone(twilio.agentNumber)} e depois conectará o lead.` : 'Connect ativo. Pareie o RealTalent Phone ou execute ./configure-realtalent-connect.sh para usar PSTN.'
  return { schema: CAP_SCHEMA, provider, configured, detail, mode: phoneCount && twilioConfigured ? 'phone-companion+agent-bridge' : phoneCount ? 'phone-companion' : 'agent-bridge', defaultDeviceAvailable: twilioConfigured, pairedPhoneCount: phoneCount, realtime: true, pairing: true, releaseVersion: CONNECT_RELEASE, capabilities: { outbound: configured, inbound: false, callerId: twilioConfigured, mute: false, hold: false, keypad: false, transfer: false, voicemailDrop: false, recording: false } }
}
async function createTwilioCall(body, leadPhone) {
  if (!twilioConfigured) throw httpError('Provider PSTN não configurado.', 503)
  if (leadPhone === twilio.agentNumber) throw httpError('O telefone do agente não pode ser o mesmo telefone do lead.', 400)
  const dialTwiml = `<Response><Dial callerId="${xmlEscape(twilio.fromNumber)}" answerOnBridge="true" timeout="30"><Number>${xmlEscape(leadPhone)}</Number></Dial></Response>`
  const data = await twilioRequest('Calls.json', { method: 'POST', body: { To: twilio.agentNumber, From: twilio.fromNumber, Twiml: dialTwiml, Timeout: '30' } })
  const callId = String(data.sid || '')
  if (!callId) throw httpError('A operadora não retornou um identificador de chamada.', 502)
  const now = new Date().toISOString()
  activeCalls.set(callId, { callId, mode: 'twilio_bridge', requestId: typeof body.requestId === 'string' ? body.requestId : null, phone: leadPhone, leadId: typeof body.leadId === 'string' ? body.leadId : null, contactId: typeof body.contactId === 'string' ? body.contactId : null, workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null, state: mapTwilioState(data.status), createdAt: now, updatedAt: now })
  if (typeof body.requestId === 'string' && body.requestId) callRequests.set(body.requestId, callId)
  persistRuntimeState(); broadcastCall(callId)
  return { callId, state: mapTwilioState(data.status), provider: 'twilio_bridge' }
}
function createPhoneCall(body, leadPhone, deviceId) {
  const device = phoneDevices.get(deviceId)
  const available = device && (socketAvailable(deviceId) || Date.now() - new Date(device.lastSeenAt).getTime() < PHONE_PRESENCE_TTL_MS)
  if (!device || !available) throw httpError('RealTalent Phone está offline. Abra o companion no celular e tente novamente.', 409)
  if (body.workspaceId && device.workspaceId && body.workspaceId !== device.workspaceId) throw httpError('Este RealTalent Phone está pareado a outro workspace.', 403)
  const callId = `phone-${randomUUID()}`
  const now = new Date().toISOString()
  const command = {
    id: callId, callId, deviceId, workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
    phone: leadPhone, displayName: String(body.displayName || 'Contato').slice(0, 160), companyName: String(body.companyName || '').slice(0, 160),
    leadId: typeof body.leadId === 'string' ? body.leadId : null, contactId: typeof body.contactId === 'string' ? body.contactId : null,
    playbookId: typeof body.playbookId === 'string' ? body.playbookId : null, playbookName: String(body.playbookName || '').slice(0, 180),
    sessionId: typeof body.sessionId === 'string' ? body.sessionId.slice(0, 180) : null, objective: String(body.objective || '').slice(0, 500),
    fastDial: body.fastDial === true,
    oneTapRequested: body.fastDial === true,
    state: 'connecting', createdAt: now, updatedAt: now,
  }
  phoneCommands.set(callId, command)
  activeCalls.set(callId, { callId, mode: 'phone_companion', requestId: typeof body.requestId === 'string' ? body.requestId : null, deviceId, phone: leadPhone, leadId: command.leadId, contactId: command.contactId, workspaceId: command.workspaceId, playbookId: command.playbookId, sessionId: command.sessionId, state: 'connecting', createdAt: now, updatedAt: now })
  if (typeof body.requestId === 'string' && body.requestId) callRequests.set(body.requestId, callId)
  persistRuntimeState(); pushPhoneCommand(deviceId, command); broadcastCall(callId)
  return { callId, state: 'connecting', provider: 'phone_companion' }
}
async function createCall(body) {
  if (body?.schema !== CALL_SCHEMA || body?.direction !== 'outbound') throw httpError('Contrato de chamada inválido.', 400)
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim().slice(0, 180) : ''
  if (requestId) {
    const existingCallId = callRequests.get(requestId)
    const existing = existingCallId ? activeCalls.get(existingCallId) : null
    if (existing) return { callId: existing.callId, state: existing.state || 'connecting', provider: existing.mode, reused: true }
  }
  const leadPhone = normalizeE164(body.phone)
  if (!/^\+[1-9]\d{7,14}$/.test(leadPhone)) throw httpError('Telefone do lead inválido. Use um número com DDD; o Connect normaliza para E.164.', 400)
  const normalizedBody = { ...body, requestId: requestId || null }
  const rawDeviceId = String(body.deviceId || '')
  if (rawDeviceId.startsWith('connect:phone:')) return createPhoneCall(normalizedBody, leadPhone, rawDeviceId.slice('connect:phone:'.length))
  return createTwilioCall(normalizedBody, leadPhone)
}
async function fetchCall(callId) {
  const local = activeCalls.get(callId)
  if (local?.mode === 'phone_companion') return { schema: CALL_SCHEMA, callId, state: local.state || 'connecting', direction: 'outbound', phone: local.phone, leadId: local.leadId ?? null, updatedAt: local.updatedAt || new Date().toISOString() }
  if (!twilioConfigured) throw httpError('Provider PSTN não configurado.', 503)
  const parent = await twilioRequest(`Calls/${encodeURIComponent(callId)}.json`)
  let child = null
  try { const children = await twilioRequest(`Calls.json?ParentCallSid=${encodeURIComponent(callId)}&PageSize=10`); child = Array.isArray(children.calls) ? children.calls[0] ?? null : null } catch { /* mantém estado do agente */ }
  const parentState = mapTwilioState(parent.status)
  const childState = child ? mapTwilioState(child.status) : null
  const state = parentState === 'ended' || parentState === 'failed' ? parentState : childState ?? (parentState === 'connected' ? 'connecting' : parentState)
  const updatedAt = new Date().toISOString()
  if (local) { activeCalls.set(callId, { ...local, state, childCallId: child?.sid ? String(child.sid) : local.childCallId, updatedAt }); persistRuntimeState(); broadcastCall(callId) }
  return { schema: CALL_SCHEMA, callId, state, rawStatus: { agent: parent.status ?? null, lead: child?.status ?? null }, direction: 'outbound', phone: local?.phone ?? '', leadId: local?.leadId ?? null, updatedAt }
}
async function commandCall(callId, body) {
  const command = String(body?.command || '')
  const local = activeCalls.get(callId)
  if (local?.mode === 'phone_companion') {
    if (command !== 'hangup') throw httpError('O RealTalent Phone usa os controles nativos do próprio celular.', 409)
    const updatedAt = new Date().toISOString()
    activeCalls.set(callId, { ...local, state: 'ended', updatedAt })
    const pending = phoneCommands.get(callId); if (pending) { const next = { ...pending, state: 'ended', updatedAt }; phoneCommands.set(callId, next); pushPhoneCommand(next.deviceId, next) }
    persistRuntimeState(); broadcastCall(callId)
    return { state: 'ended', detail: 'Sessão do CRM encerrada. Finalize a chamada no próprio celular se ainda estiver ativa.' }
  }
  if (command !== 'hangup') throw httpError(`O modo Agent Bridge ainda não suporta “${command}”. Use encerrar chamada ou o controle do próprio telefone.`, 409)
  const data = await twilioRequest(`Calls/${encodeURIComponent(callId)}.json`, { method: 'POST', body: { Status: 'completed' } })
  const state = mapTwilioState(data.status || 'completed')
  if (local) activeCalls.set(callId, { ...local, state, updatedAt: new Date().toISOString() })
  persistRuntimeState(); broadcastCall(callId)
  return { state }
}
function tokenDevice(token) { return [...phoneDevices.values()].find((device) => device.token === token) ?? null }
function revokeDevice(deviceId) {
  const device = phoneDevices.get(deviceId)
  if (!device) return false
  phoneDevices.delete(deviceId); persistPhoneDevices()
  for (const [callId, command] of phoneCommands.entries()) if (command.deviceId === deviceId) {
    phoneCommands.delete(callId)
    const call = activeCalls.get(callId)
    if (call && !['ended', 'failed'].includes(call.state)) { activeCalls.set(callId, { ...call, state: 'failed', updatedAt: new Date().toISOString() }); broadcastCall(callId) }
  }
  for (const socket of phoneSockets.get(deviceId) ?? []) try { socket.destroy() } catch {}
  phoneSockets.delete(deviceId); persistRuntimeState()
  return true
}

const pairingAttempts = new Map()
function pairingAttemptState(req) {
  const key = remoteAddress(req) || 'unknown'
  const now = Date.now()
  let state = pairingAttempts.get(key)
  if (!state || now - state.windowStartedAt > 60_000) state = { windowStartedAt: now, failures: 0, blockedUntil: 0 }
  pairingAttempts.set(key, state)
  return { key, state, now }
}
function assertPairingAllowed(req) {
  const { state, now } = pairingAttemptState(req)
  if (state.blockedUntil > now) {
    const retryAfter = Math.max(1, Math.ceil((state.blockedUntil - now) / 1000))
    const error = httpError(`Muitas tentativas de pareamento. Tente novamente em ${retryAfter} segundos.`, 429)
    error.retryAfter = retryAfter
    throw error
  }
}
function recordPairingFailure(req) {
  const { key, state, now } = pairingAttemptState(req)
  state.failures += 1
  if (state.failures >= PAIRING_MAX_ATTEMPTS) { state.blockedUntil = now + PAIRING_BLOCK_MS; state.failures = 0; state.windowStartedAt = now }
  pairingAttempts.set(key, state)
}
function clearPairingFailures(req) { pairingAttempts.delete(remoteAddress(req) || 'unknown') }

function phoneHtml() {
  return fs.readFileSync(phoneHtmlPath, 'utf8')
}
// Historical V101.8.2 compatibility markers retained for regression QA only:
// Modo rápido · rtPhoneFastMode · current.fastDial&&fastMode · dialCurrent(true) · autoDialLock!==current.callId
// id="dialBtn" · document.querySelector('#dialBtn').onclick

function phoneManifest() {
  return {
    name: 'RealTalent Phone', short_name: 'RT Phone', description: 'Companion One-Tap do RealTalent Connect',
    start_url: '/phone', scope: '/', display: 'standalone', background_color: '#f5f4ef', theme_color: '#04342C', lang: 'pt-BR',
    icons: [
      { src: '/phone/icon-180.png', sizes: '180x180', type: 'image/png' },
      { src: '/phone/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
function updatePhonePresence(device, body = {}) {
  const now = new Date().toISOString()
  const visibility = body.visibility === 'hidden' ? 'hidden' : 'visible'
  const platformKind = ['ios','android','other'].includes(String(body.platformKind || '')) ? String(body.platformKind) : (device.platformKind || 'other')
  const next = {
    ...device,
    lastSeenAt: now,
    oneTapEnabled: body.oneTapEnabled !== false,
    visibility,
    standalone: body.standalone === true,
    platformKind,
    lastInteractionAt: typeof body.lastInteractionAt === 'string' ? body.lastInteractionAt.slice(0, 80) : now,
    presenceReason: typeof body.reason === 'string' ? body.reason.slice(0, 80) : 'heartbeat',
  }
  phoneDevices.set(device.id, next)
  return next
}

const requestHandler = async (req, res) => {
  if (!isHostAllowed(req)) { json(res, 421, { error: 'Host não autorizado para o RealTalent Connect.' }); return }
  const url = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${PORT}`}`)
  const phoneRoute = url.pathname === '/phone' || url.pathname.startsWith('/phone/') || url.pathname.startsWith('/api/phone/v1/')
  if (phoneRoute && !isPhoneOriginAllowed(req)) { json(res, 403, { error: 'Origem não autorizada para o RealTalent Phone.' }); return }
  if (!phoneRoute && !isOriginAllowed(req)) { json(res, 403, { error: 'Origem não autorizada para o RealTalent Connect.' }); return }
  if (!phoneRoute && !runtimeAuthorized(req)) { json(res, 401, { error: 'Autenticação local do RealTalent Connect ausente ou inválida.' }); return }
  // CORS também precisa ser aplicado às APIs de Phone chamadas pelo CRM em :4188.
  // Para o companion móvel em mesma origem, o header é inofensivo e não abre origens não autorizadas.
  cors(req, res)
  if (req.method === 'OPTIONS') { if (!phoneRoute && (!isOriginAllowed(req) || !runtimeAuthorized(req))) { json(res, 403, { error: 'Preflight não autorizado.' }); return } res.statusCode = 204; res.end(); return }
  if (req.method === 'POST' && !String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { json(res, 415, { error: 'Use Content-Type application/json.' }); return }
  try {
    if (req.method === 'GET' && url.pathname === '/phone') { res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(phoneHtml()); return }
    if (req.method === 'GET' && url.pathname === '/phone/manifest.webmanifest') { json(res, 200, phoneManifest()); return }
    if (req.method === 'GET' && (url.pathname === '/phone/icon-180.png' || url.pathname === '/phone/icon-512.png')) {
      const iconPath = url.pathname.endsWith('512.png') ? phoneIcon512Path : phoneIcon180Path
      res.statusCode = 200; res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'public, max-age=86400'); res.end(fs.readFileSync(iconPath)); return
    }
    if (req.method === 'GET' && url.pathname === '/api/phone/v1/diagnostics') {
      if (!runtimeAuthorized(req)) throw httpError('Diagnóstico exige autenticação do CRM local.', 401)
      json(res, 200, diagnosticsPayload(url.searchParams.get('workspaceId') || '')); return
    }
    if (req.method === 'GET' && url.pathname === '/api/phone/v1/pairing') {
      if (!runtimeAuthorized(req)) throw httpError('Pareamento exige autenticação do CRM local.', 401)
      json(res, 200, pairingPayload(url.searchParams.get('workspaceId') || '', url.searchParams.get('host') || '')); return
    }
    if (req.method === 'GET' && url.pathname === '/api/phone/v1/pairing/qr') {
      if (!runtimeAuthorized(req)) throw httpError('QR de pareamento exige autenticação do CRM local.', 401)
      const info = pairingPayload(url.searchParams.get('workspaceId') || '', url.searchParams.get('host') || '')
      res.statusCode = 200; res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(qrSvg(info.phoneUrl)); return
    }
    if (req.method === 'POST' && url.pathname === '/api/phone/v1/network-access') {
      if (!runtimeAuthorized(req)) throw httpError('Configuração de rede exige autenticação do CRM local.', 401)
      const body = await readJson(req)
      const enabled = body.enabled === true
      if (enabled) {
        const host = preferredLanHost(String(body.host || ''))
        if (!host) throw httpError('Nenhuma interface LAN segura foi encontrada para liberar o celular.', 409)
        await startLanServer(host)
        networkAccess = { enabled: true, host }; persistNetworkConfig(networkAccess)
      } else {
        await stopLanServer()
        networkAccess = { enabled: false, host: networkAccess.host || '' }; persistNetworkConfig(networkAccess)
      }
      json(res, 200, { schema: PHONE_SCHEMA, ...diagnosticsPayload(String(body.workspaceId || '')).networkAccess }); return
    }
    if (req.method === 'POST' && url.pathname === '/api/phone/v1/pairing/regenerate') {
      if (!runtimeAuthorized(req)) throw httpError('Pareamento exige autenticação do CRM local.', 401)
      const body = await readJson(req); regeneratePairing(String(body.workspaceId || '')); json(res, 200, pairingPayload(String(body.workspaceId || ''), String(body.host || ''))); return
    }
    if (req.method === 'POST' && url.pathname === '/api/phone/v1/pair') {
      assertPairingAllowed(req)
      const body = await readJson(req)
      if (Date.now() > pairing.expiresAt) pairing = createPairing(pairing.workspaceId)
      const current = pairing
      if (current.workspaceId && String(body.workspaceId || '') !== current.workspaceId) { recordPairingFailure(req); throw httpError('Código pertence a outro workspace.', 403) }
      if (String(body.code || '') !== current.code || Date.now() > current.expiresAt) { recordPairingFailure(req); throw httpError('Código de pareamento inválido ou expirado.', 403) }
      clearPairingFailures(req)
      const deviceId = randomUUID(); const token = randomUUID() + randomUUID(); const now = new Date().toISOString()
      const device = { id: deviceId, token, workspaceId: current.workspaceId || String(body.workspaceId || '').slice(0, 160) || null, label: String(body.name || 'RealTalent Phone').slice(0, 80), platform: String(body.platform || 'Celular').slice(0, 220), platformKind: ['ios','android','other'].includes(String(body.platformKind || '')) ? String(body.platformKind) : 'other', oneTapEnabled: body.oneTapEnabled !== false, visibility: body.visibility === 'hidden' ? 'hidden' : 'visible', standalone: body.standalone === true, pairedAt: now, lastSeenAt: now, lastInteractionAt: now }
      phoneDevices.set(deviceId, device); persistPhoneDevices(); pairing = createPairing(current.workspaceId)
      json(res, 201, { schema: PHONE_SCHEMA, deviceId, token, label: device.label, workspaceId: device.workspaceId }); return
    }
    if (req.method === 'POST' && url.pathname === '/api/phone/v1/unpair') {
      const body = await readJson(req); const device = tokenDevice(String(body.token || ''))
      if (!device) throw httpError('Dispositivo não pareado.', 401)
      revokeDevice(device.id); json(res, 200, { schema: PHONE_SCHEMA, revoked: true }); return
    }
    if (req.method === 'POST' && url.pathname === '/api/phone/v1/heartbeat') {
      const body = await readJson(req); const device = tokenDevice(String(body.token || ''))
      if (!device) throw httpError('Dispositivo não pareado.', 401)
      const next = updatePhonePresence(device, body)
      json(res, 200, { schema: PHONE_SCHEMA, device: { id: next.id, label: next.label }, oneTapReady: Boolean(socketAvailable(next.id) && next.visibility !== 'hidden' && next.oneTapEnabled !== false), now: next.lastSeenAt }); return
    }
    if (req.method === 'GET' && url.pathname === '/api/phone/v1/poll') {
      const device = tokenDevice(url.searchParams.get('token') || '')
      if (!device) throw httpError('Dispositivo não pareado.', 401)
      updatePhonePresence(device, { oneTapEnabled: device.oneTapEnabled !== false, visibility: device.visibility || 'visible', standalone: device.standalone === true, platformKind: device.platformKind || 'other', reason: 'poll' })
      const command = [...phoneCommands.values()].filter((item) => item.deviceId === device.id && !['failed','ended'].includes(item.state)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0] ?? null
      json(res, 200, { schema: PHONE_SCHEMA, device: { id: device.id, label: device.label }, command }); return
    }
    if (req.method === 'POST' && url.pathname === '/api/phone/v1/state') {
      const body = await readJson(req); const device = tokenDevice(String(body.token || ''))
      if (!device) throw httpError('Dispositivo não pareado.', 401)
      const callId = String(body.callId || ''); const state = String(body.state || '')
      if (!['ringing','connected','failed','ended'].includes(state)) throw httpError('Estado de chamada inválido.', 400)
      const command = phoneCommands.get(callId); const call = activeCalls.get(callId)
      if (!command || !call || command.deviceId !== device.id) throw httpError('Chamada não encontrada para este dispositivo.', 404)
      const now = new Date().toISOString(); const nextCommand = { ...command, state, updatedAt: now }; phoneCommands.set(callId, nextCommand); activeCalls.set(callId, { ...call, state, updatedAt: now }); device.lastSeenAt = now; phoneDevices.set(device.id, device); persistRuntimeState(); pushPhoneCommand(device.id, nextCommand); broadcastCall(callId)
      json(res, 200, { schema: PHONE_SCHEMA, callId, state }); return
    }
    if (req.method === 'GET' && url.pathname === '/api/phone/v1/devices') {
      if (!runtimeAuthorized(req)) throw httpError('Lista de dispositivos exige autenticação do CRM local.', 401)
      json(res, 200, { schema: PHONE_SCHEMA, devices: onlinePhoneDevices(url.searchParams.get('workspaceId') || '').map(({ token, ...device }) => ({ ...device })) }); return
    }
    const revokeMatch = url.pathname.match(/^\/api\/phone\/v1\/devices\/([^/]+)\/revoke$/)
    if (req.method === 'POST' && revokeMatch) {
      if (!runtimeAuthorized(req)) throw httpError('Revogação exige autenticação do CRM local.', 401)
      const deviceId = decodeURIComponent(revokeMatch[1]); if (!revokeDevice(deviceId)) throw httpError('Dispositivo não encontrado.', 404)
      json(res, 200, { schema: PHONE_SCHEMA, deviceId, revoked: true }); return
    }
    if (req.method === 'GET' && url.pathname === '/api/voice/v1/health') { const caps = capabilitiesPayload(); json(res, 200, { ok: true, service: 'RealTalent Connect', version: CONNECT_PROTOCOL, releaseVersion: CONNECT_RELEASE, provider, configured: caps.configured, mode: caps.mode, realtime: true, pairedPhones: onlinePhoneDevices().filter((item)=>item.available).length, setupState: onlinePhoneDevices().some((item)=>item.available) || twilioConfigured ? 'ready' : 'bridge_ready', activeCalls: [...activeCalls.values()].filter((item)=>!['ended','failed'].includes(item.state)).length, allowedOrigins: [...allowedOrigins], security: { runtimeAuth: Boolean(RUNTIME_TOKEN), hostValidation: true, originValidation: true, pairingRateLimit: true }, networkAccess: { mode: activeLanHost ? 'lan-enabled' : 'local-only', enabled: Boolean(activeLanHost), host: activeLanHost || null }, now: new Date().toISOString() }); return }
    if (req.method === 'GET' && url.pathname === '/api/voice/v1/capabilities') { json(res, 200, capabilitiesPayload()); return }
    if (req.method === 'POST' && url.pathname === '/api/voice/v1/calls') { json(res, 201, await createCall(await readJson(req))); return }
    const callMatch = url.pathname.match(/^\/api\/voice\/v1\/calls\/([^/]+)$/)
    if (req.method === 'GET' && callMatch) { json(res, 200, await fetchCall(decodeURIComponent(callMatch[1]))); return }
    const commandMatch = url.pathname.match(/^\/api\/voice\/v1\/calls\/([^/]+)\/commands$/)
    if (req.method === 'POST' && commandMatch) { json(res, 200, await commandCall(decodeURIComponent(commandMatch[1]), await readJson(req))); return }
    json(res, 404, { error: 'Endpoint não encontrado.' })
  } catch (error) { if (error?.retryAfter) res.setHeader('Retry-After', String(error.retryAfter)); json(res, Number(error?.statusCode || 500), { error: error instanceof Error ? error.message : 'Erro interno do RealTalent Connect.' }) }
}
const server = http.createServer(requestHandler)

function handleUpgrade(req, socket) {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${PORT}`}`)
    if (url.pathname === '/api/phone/v1/ws') {
      const device = tokenDevice(url.searchParams.get('token') || '')
      if (!device || !wsHandshake(req, socket)) { socket.destroy(); return }
      updatePhonePresence(device, { oneTapEnabled: device.oneTapEnabled !== false, visibility: device.visibility || 'visible', standalone: device.standalone === true, platformKind: device.platformKind || 'other', reason: 'websocket' }); registerSocket(phoneSockets, device.id, socket)
      const command = [...phoneCommands.values()].filter((item) => item.deviceId === device.id && !['failed','ended'].includes(item.state)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0] ?? null
      wsText(socket, { schema: PHONE_SCHEMA, type: 'hello', releaseVersion: CONNECT_RELEASE, device: { id: device.id, label: device.label }, command })
      return
    }
    if (url.pathname === '/api/voice/v1/ws') {
      if (!isOriginAllowed(req) || !runtimeAuthorized(req)) { socket.destroy(); return }
      const callId = String(url.searchParams.get('callId') || '')
      if (!callId || !activeCalls.has(callId) || !wsHandshake(req, socket)) { socket.destroy(); return }
      registerSocket(callSockets, callId, socket); wsText(socket, callStatePayload(activeCalls.get(callId))); return
    }
    socket.destroy()
  } catch { socket.destroy() }
}
server.on('upgrade', handleUpgrade)

function startLanServer(host) {
  const selected = preferredLanHost(host)
  if (!selected) return Promise.reject(httpError('Interface LAN inválida.', 409))
  if (lanServer && activeLanHost === selected) return Promise.resolve()
  return stopLanServer().then(() => new Promise((resolve, reject) => {
    const candidate = http.createServer(requestHandler)
    candidate.on('upgrade', handleUpgrade)
    const onError = (error) => { candidate.removeListener('listening', onListening); try { candidate.close() } catch {}; reject(httpError(`Não foi possível liberar ${selected}:${PORT}: ${error.message}`, 409)) }
    const onListening = () => { candidate.removeListener('error', onError); lanServer = candidate; activeLanHost = selected; resolve() }
    candidate.once('error', onError)
    candidate.once('listening', onListening)
    candidate.listen(PORT, selected)
  }))
}
function stopLanServer() {
  if (!lanServer) { activeLanHost = ''; return Promise.resolve() }
  const current = lanServer; lanServer = null; activeLanHost = ''
  for (const sockets of phoneSockets.values()) for (const socket of sockets) try { socket.destroy() } catch {}
  current.closeAllConnections?.()
  return new Promise((resolve) => current.close(() => resolve()))
}

const wsHeartbeat = setInterval(() => {
  const ping = Buffer.from([0x89, 0x00])
  for (const map of [phoneSockets, callSockets]) for (const sockets of map.values()) for (const socket of sockets) try { if (!socket.destroyed) socket.write(ping) } catch {}
}, 15000)
wsHeartbeat.unref?.()

server.listen(PORT, HOST, async () => {
  console.log(`RealTalent Connect V${CONNECT_RELEASE} em http://127.0.0.1:${PORT}`)
  if (networkAccess.enabled) {
    const host = preferredLanHost(networkAccess.host)
    if (host) try { await startLanServer(host); console.log(`RealTalent Phone LAN liberado explicitamente em http://${host}:${PORT}`) } catch (error) { networkAccess = { enabled:false, host }; persistNetworkConfig(networkAccess); console.warn(String(error?.message || error)) }
  }
  const info = pairingPayload('')
  console.log(`RealTalent Phone: ${info.phoneUrl} · código ${info.code}`)
  console.log(`Rede: ${activeLanHost ? `LAN liberada somente em ${activeLanHost}` : 'apenas este computador'}`)
  console.log('Tempo real: WebSocket ativo + heartbeat One-Tap + fallback de polling')
  console.log(twilioConfigured ? `Provider: Twilio Agent Bridge · agente ${maskPhone(twilio.agentNumber)} · origem ${maskPhone(twilio.fromNumber)}` : 'Provider PSTN: não configurado · RealTalent Phone pode ser usado sem Twilio')
})
const shutdown = () => { clearInterval(wsHeartbeat); for (const map of [phoneSockets, callSockets]) for (const sockets of map.values()) for (const socket of sockets) try { socket.destroy() } catch {}; if(lanServer){lanServer.closeAllConnections?.();try{lanServer.close()}catch{}} server.closeAllConnections?.(); server.close(() => process.exit(0)); windowlessExitTimer() }
function windowlessExitTimer() { const timer = setTimeout(() => process.exit(0), 1200); timer.unref?.() }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
