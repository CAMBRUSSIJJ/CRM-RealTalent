#!/usr/bin/env node
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { URL } from 'node:url'
import { createWhatsAppBrowserQrBridge } from './whatsapp-browser-qr-bridge.mjs'
import { eventIdentityKey, mergeCommunicationEvent, mergeStoreSnapshots } from './communications-store-utils.mjs'
import { createRealtimeBus } from './communications-realtime-bus.mjs'
import { looksLikeEncodedMediaText } from './whatsapp-sync-utils.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const PORT = Number(process.env.REALTALENT_COMMUNICATIONS_PORT || 3002)
const HOST = process.env.REALTALENT_COMMUNICATIONS_HOST || '127.0.0.1'
const STORE_FILE = process.env.REALTALENT_COMMUNICATIONS_STORE || path.join(ROOT, '.realtalent-communications-store.json')
const KEY_FILE = process.env.REALTALENT_COMMUNICATIONS_KEY_FILE || path.join(ROOT, '.realtalent-communications.key')
const CONFIG_FILE = process.env.REALTALENT_COMMUNICATIONS_CONFIG || path.join(ROOT, '.realtalent-communications-config.json')
const MEDIA_ROOT = process.env.REALTALENT_COMMUNICATIONS_MEDIA_DIR || path.join(ROOT, '.realtalent-communications-media')
fs.mkdirSync(MEDIA_ROOT, { recursive: true, mode: 0o700 })
const CRM_PORT = Number(process.env.REALTALENT_CRM_PORT || 4188)
const SYNC_INTERVAL_MS = Math.max(30_000, Number(process.env.REALTALENT_COMMUNICATIONS_SYNC_INTERVAL_MS || 60_000))
const RUNTIME_TOKEN = String(process.env.REALTALENT_RUNTIME_TOKEN || '').trim()
const PUBLIC_GATEWAY_URL = String(process.env.REALTALENT_COMMUNICATIONS_PUBLIC_URL || '').trim().replace(/\/$/, '')
const PUBLIC_APP_URL = String(process.env.REALTALENT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
const EXTRA_ALLOWED_HOSTS = String(process.env.REALTALENT_COMMUNICATIONS_ALLOWED_HOSTS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
const INTERNAL_ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${CRM_PORT}`, `http://localhost:${CRM_PORT}`, 'http://127.0.0.1:4173', 'http://localhost:4173', 'http://127.0.0.1:4174', 'http://localhost:4174'])
// historical marker: const VERSION = '101.8.4-h10'
const VERSION = '101.8.4-h13'
let shuttingDown = false
let fatalScheduled = false
function fatal(label, error) {
  const detail = error instanceof Error ? (error.stack || error.message) : String(error)
  console.error(`[Communications Gateway] ${label}: ${detail}`)
  if (fatalScheduled || shuttingDown) return
  fatalScheduled = true
  setTimeout(() => process.exit(1), 20).unref?.()
}
process.on('unhandledRejection', error => fatal('Promise rejeitada sem tratamento', error))
process.on('uncaughtException', error => fatal('Exceção não tratada', error))

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
function writeJson(file, data) { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 }); fs.renameSync(tmp, file); try { fs.chmodSync(file, 0o600) } catch {} }
function config() { return readJson(CONFIG_FILE, {}) }
function store() { const value = readJson(STORE_FILE, null); return value && typeof value === 'object' ? { version: 1, accounts: [], events: [], ...value } : { version: 1, accounts: [], events: [] } }
function saveStore(value, realtime = true) {
  const current = readJson(STORE_FILE, { version: 1, accounts: [], events: [] })
  const merged = mergeStoreSnapshots(value, current)
  writeJson(STORE_FILE, merged)
  value.accounts = merged.accounts
  value.events = merged.events
  if (realtime) realtimeBus.publishAll('communications.changed', { reason: 'store' })
}
function keyBytes() { if (!fs.existsSync(KEY_FILE)) { fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 }) } const raw = fs.readFileSync(KEY_FILE, 'utf8').trim(); return crypto.createHash('sha256').update(raw).digest() }
function encrypt(value) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv); const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]); const tag = cipher.getAuthTag(); return { v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: data.toString('base64') } }
function decrypt(value) { const iv = Buffer.from(value.iv, 'base64'); const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), iv); decipher.setAuthTag(Buffer.from(value.tag, 'base64')); const data = Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]); return JSON.parse(data.toString('utf8')) }
function now() { return new Date().toISOString() }
const realtimeBus = createRealtimeBus({ now })
function uuid() { return crypto.randomUUID() }
function b64url(buffer) { return Buffer.from(buffer).toString('base64url') }
function sha256(text) { return crypto.createHash('sha256').update(text).digest() }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])) }
function isLoopback(req) { const address=String(req.socket.remoteAddress||''); return address==='127.0.0.1'||address==='::1'||address.endsWith('::ffff:127.0.0.1') }
function requestHostname(req) { try { return new URL(`http://${String(req.headers.host||'')}`).hostname.toLowerCase() } catch { return '' } }
function validHost(req) { const host=requestHostname(req); return host==='127.0.0.1'||host==='localhost'||EXTRA_ALLOWED_HOSTS.includes(host) }
function originAllowed(req) { const origin=String(req.headers.origin||'').trim(); return !origin||INTERNAL_ALLOWED_ORIGINS.has(origin) }
function constantTimeTextEqual(a,b){const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));if(aa.length!==bb.length)return false;try{return crypto.timingSafeEqual(aa,bb)}catch{return false}}
function suppliedRuntimeToken(req){const direct=String(req.headers['x-realtalent-runtime-token']||'').trim();if(direct)return direct;const auth=String(req.headers.authorization||'').trim();return auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():''}
function internalAuthorized(req){ if(RUNTIME_TOKEN) return constantTimeTextEqual(suppliedRuntimeToken(req),RUNTIME_TOKEN); return isLoopback(req)&&originAllowed(req) }
function applyCors(req,res) { const origin=String(req.headers.origin||''); if(origin&&INTERNAL_ALLOWED_ORIGINS.has(origin))res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin'); res.setHeader('Access-Control-Allow-Headers','content-type, authorization, x-realtalent-runtime-token'); res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS') }
function json(res, status, payload) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options':'nosniff' }); res.end(JSON.stringify(payload)) }
function html(res, status, body) { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options':'nosniff', 'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" }); res.end(body) }
async function body(req) { if(typeof req.__bodyText==='string')return req.__bodyText?JSON.parse(req.__bodyText):{}; const chunks=[]; let total=0; for await (const chunk of req) { chunks.push(chunk); total+=chunk.length; if(total>16_000_000) { const error=new Error('Payload muito grande.'); error.statusCode=413; throw error } } const raw=Buffer.concat(chunks).toString('utf8'); req.__bodyText=raw; try{return raw?JSON.parse(raw):{}}catch{const error=new Error('JSON inválido.');error.statusCode=400;throw error} }
function validWebhookSignature(req){const secret=String(config().metaAppSecret||'').trim();if(!secret)return false;const supplied=String(req.headers['x-hub-signature-256']||'');if(!supplied.startsWith('sha256='))return false;const expected='sha256='+crypto.createHmac('sha256',secret).update(String(req.__bodyText||'')).digest('hex');return constantTimeTextEqual(supplied,expected)}
function cap(provider) { if (provider === 'google' || provider === 'microsoft') return { email_send:true,email_read:true,mail_sync:true,calendar_read:false,calendar_write:false,incremental_sync:true,webhooks:false }; if (provider === 'whatsapp_cloud') return { messages:true,templates:true,delivery_status:true,webhooks:true }; return {} }
function scopes(provider) { if (provider==='google') return ['openid','email','profile','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly']; if (provider==='microsoft') return ['openid','profile','email','offline_access','Mail.Read','Mail.Send']; if(provider==='whatsapp_cloud') return ['whatsapp_business_management','whatsapp_business_messaging']; return [] }
function safeAccount(a) { return { id:a.id,workspaceId:a.workspaceId,provider:a.provider,externalAccountId:a.externalAccountId,displayName:a.displayName,status:a.status||'connected',scopes:a.scopes||scopes(a.provider),hasCredential:Boolean(a.credential),tokenExpiresAt:a.tokenExpiresAt||null,lastSyncAt:a.lastSyncAt||null,nextSyncAt:null,syncCursor:null,lastError:a.lastError||null,ownerUserId:null,accessMode:a.accessMode||'organization',allowedUserIds:[],allowedRoles:[],capabilities:a.capabilities||cap(a.provider),connectionMode:'live',credentialVersion:1,tokenRefreshedAt:a.tokenRefreshedAt||null,revokedAt:a.revokedAt||null,lastTestedAt:a.lastTestedAt||null,lastTestStatus:a.lastTestStatus||null,lastTestLatencyMs:a.lastTestLatencyMs||null,metadata:a.metadata||{},createdAt:a.createdAt||now(),updatedAt:a.updatedAt||now() } }
function accountById(s, workspaceId, accountId) { return (s.accounts||[]).find(a=>a.id===accountId && a.workspaceId===workspaceId && a.status!=='revoked') }
function upsertAccount(s, account) { const i=s.accounts.findIndex(a=>a.id===account.id); if(i>=0) s.accounts[i]=account; else s.accounts.unshift(account) }
function pushEvent(s,event){ const key=eventIdentityKey(event); const index=(s.events||[]).findIndex(e=>eventIdentityKey(e)===key); if(index>=0){s.events[index]=mergeCommunicationEvent(s.events[index],event);return false} s.events.unshift(event); s.events=s.events.slice(0,5000); return true }
function makeEvent({workspaceId,leadId=null,contactId=null,accountId,channel,direction,status='sent',externalMessageId=null,threadId=null,senderAddress='',recipientAddresses=[],subject='',bodyText='',internetMessageId=null,replyToExternalMessageId=null,hasAttachments=false,metadata={}}){ const t=now(); return {id:uuid(),workspaceId,leadId,contactId,accountId,threadId,channel,direction,eventType:channel==='email'?'email':'message',status,externalMessageId,senderAddress,recipientAddresses,subject,bodyText,bodyHtml:'',internetMessageId,replyToExternalMessageId,hasAttachments:Boolean(hasAttachments),occurredAt:t,metadata,createdAt:t} }

const safeMediaName = value => String(value || 'arquivo').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120) || 'arquivo'
const mediaKind = (mime = '', explicit = '') => explicit || (String(mime).startsWith('image/') ? 'image' : String(mime).startsWith('video/') ? 'video' : String(mime).startsWith('audio/') ? 'audio' : 'document')
function persistMedia(input = {}) {
  const raw = String(input.dataBase64 || '').replace(/^data:[^;]+;base64,/, '')
  if (!raw) return null
  const buffer = Buffer.from(raw, 'base64')
  if (!buffer.length) throw new Error('Arquivo vazio.')
  if (buffer.length > 8 * 1024 * 1024) throw new Error('O arquivo excede o limite de 8 MB desta versão.')
  const id = uuid(); const fileName = safeMediaName(input.fileName || `arquivo-${id}`); const disk = path.join(MEDIA_ROOT, `${id}--${fileName}`)
  fs.writeFileSync(disk, buffer, { mode: 0o600 })
  return { id, fileName, mimeType:String(input.mimeType || 'application/octet-stream'), size:buffer.length, kind:mediaKind(input.mimeType, input.kind), url:`/__rt/communications/api/communications/media/${id}/${encodeURIComponent(fileName)}` }
}
function mediaDiskPath(ref) {
  const id = String(ref?.id || '').replace(/[^a-zA-Z0-9-]/g, '')
  if (!id) return ''
  try { const match = fs.readdirSync(MEDIA_ROOT).find(name => name.startsWith(`${id}--`)); return match ? path.join(MEDIA_ROOT, match) : '' } catch { return '' }
}
function mediaPayload(ref) { const file = mediaDiskPath(ref); if (!file || !fs.existsSync(file)) throw new Error('Arquivo de mídia não está mais disponível no runtime local.'); return { dataBase64:fs.readFileSync(file).toString('base64'), mimeType:String(ref.mimeType || 'application/octet-stream'), fileName:String(ref.fileName || 'arquivo'), size:Number(ref.size || fs.statSync(file).size), kind:String(ref.kind || mediaKind(ref.mimeType)) } }
function contentTypeFor(name) { const ext=path.extname(name).toLowerCase(); return ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg','.opus':'audio/ogg','.wav':'audio/wav','.pdf':'application/pdf','.txt':'text/plain','.zip':'application/zip'}[ext]||'application/octet-stream') }
const whatsappQr = createWhatsAppBrowserQrBridge({ root:ROOT, now, uuid, store, saveStore, upsertAccount, pushEvent, makeEvent, persistMedia })
const sendLocks = new Map()
let outboxDraining = false
function idempotencyEvent(snapshot, input) {
  const key = String(input?.idempotencyKey || '').trim()
  if (!key) return null
  return (snapshot.events || []).find(event => event.workspaceId === input.workspaceId && event.accountId === input.accountId && event.channel === input.channel && event.metadata?.idempotencyKey === key) || null
}
async function ensureAttachmentRef(input) {
  if (input.attachmentRef?.id) return input.attachmentRef
  if (!input.attachment?.dataBase64) return null
  input.attachmentRef = persistMedia(input.attachment)
  return input.attachmentRef
}
async function performWhatsAppTransport(account, cred, input, attachmentRef = null) {
  const attachment = attachmentRef ? mediaPayload(attachmentRef) : null
  if (account.metadata?.transport === 'qr') return whatsappQr.send(account.workspaceId, input.recipient, input.body, { threadId:input.threadId || null, attachment, replyToExternalMessageId:input.replyToExternalMessageId || null, idempotencyKey:input.idempotencyKey || null })
  if (String(input.threadId || '').endsWith('@g.us')) throw new Error('Grupos são suportados somente pelo WhatsApp QR local.')
  return sendWhatsApp(account, cred, { ...input, attachment, replyToExternalMessageId:input.replyToExternalMessageId || null })
}
function queueWhatsAppEvent(snapshot, input, account, attachmentRef = null, error = null) {
  const existing = idempotencyEvent(snapshot, input)
  if (existing) { existing.status='queued'; existing.metadata={...(existing.metadata||{}),outbox:true,lastSendError:error?String(error.message||error):null,nextRetryAt:now(),attachment:attachmentRef||existing.metadata?.attachment||null}; saveStore(snapshot); return existing }
  const isGroup=String(input.threadId||'').endsWith('@g.us')
  const event=makeEvent({workspaceId:input.workspaceId,leadId:input.leadId||null,contactId:input.contactId||null,accountId:account.id,channel:'whatsapp',direction:'outbound',status:'queued',threadId:input.threadId||null,senderAddress:String(account.metadata?.displayPhoneNumber||account.displayName||''),recipientAddresses:input.recipient?[String(input.recipient)]:[],bodyText:String(input.body||''),replyToExternalMessageId:input.replyToExternalMessageId||null,hasAttachments:Boolean(attachmentRef),metadata:{provider:account.provider,transport:account.metadata?.transport||null,idempotencyKey:input.idempotencyKey||null,peerAddress:!isGroup?String(input.recipient||'').replace(/\D/g,''):null,isGroup,unofficial:account.metadata?.transport==='qr',outbox:true,attempts:0,lastSendError:error?String(error.message||error):null,nextRetryAt:now(),attachment:attachmentRef||null,replyPreview:input.replyPreview||null}})
  pushEvent(snapshot,event);saveStore(snapshot);return event
}
function isWhatsAppMediaIdRegression(error) { return /Data passed to getter must include an id property|how we memoize|WHATSAPP_WEB_MEDIA_ID_REGRESSION/i.test(String(error?.code||'')+' '+String(error?.message||error||'')) }
function friendlyWhatsAppMediaError() { return 'Não foi possível enviar a mídia pelo WhatsApp Web. A mensagem não foi duplicada. Use “Tentar novamente”.' }
async function failedWhatsAppEvent(snapshot,input,account,error){
  const attachmentRef=await ensureAttachmentRef(input)
  const existing=idempotencyEvent(snapshot,input)
  if(existing){existing.status='failed';existing.hasAttachments=Boolean(attachmentRef||existing.hasAttachments);existing.metadata={...(existing.metadata||{}),outbox:false,lastSendError:friendlyWhatsAppMediaError(),attachment:attachmentRef||existing.metadata?.attachment||null};saveStore(snapshot);return existing}
  const isGroup=String(input.threadId||'').endsWith('@g.us')
  const event=makeEvent({workspaceId:input.workspaceId,leadId:input.leadId||null,contactId:input.contactId||null,accountId:account.id,channel:'whatsapp',direction:'outbound',status:'failed',threadId:input.threadId||null,senderAddress:String(account.metadata?.displayPhoneNumber||account.displayName||''),recipientAddresses:input.recipient?[String(input.recipient)]:[],bodyText:String(input.body||''),replyToExternalMessageId:input.replyToExternalMessageId||null,hasAttachments:Boolean(attachmentRef),metadata:{provider:account.provider,transport:account.metadata?.transport||null,idempotencyKey:input.idempotencyKey||null,peerAddress:!isGroup?String(input.recipient||'').replace(/\D/g,''):null,isGroup,unofficial:account.metadata?.transport==='qr',outbox:false,lastSendError:friendlyWhatsAppMediaError(),attachment:attachmentRef||null,replyPreview:input.replyPreview||null}})
  pushEvent(snapshot,event);saveStore(snapshot);return event
}
function retryableWhatsAppError(error) { return /(fetch|network|timeout|ECONN|EAI_AGAIN|indispon|desconect|connected|ready|sessão|autentic|429|502|503|504)/i.test(String(error?.message||error||'')) }
async function executeCommunicationSend(snapshot, input, account) {
  const attachmentRef = input.channel==='whatsapp' ? await ensureAttachmentRef(input) : null
  const cred = account.metadata?.transport === 'qr' ? null : await credential(snapshot, account)
  let result
  if (input.channel === 'email' && account.provider === 'google') result = await sendGoogle(account, cred, input)
  else if (input.channel === 'email' && account.provider === 'microsoft') result = await sendMicrosoft(account, cred, input)
  else if (input.channel === 'whatsapp' && account.provider === 'whatsapp_cloud') result = await performWhatsAppTransport(account, cred, input, attachmentRef)
  else throw new Error('Canal incompatível com a conta selecionada.')
  const isGroup = String(result.threadId || input.threadId || '').endsWith('@g.us')
  const event = makeEvent({
    workspaceId:input.workspaceId, leadId:input.leadId||null, contactId:input.contactId||null, accountId:account.id,
    channel:input.channel, direction:'outbound', status:'sent', externalMessageId:result.id||null, threadId:result.threadId||input.threadId||null,
    senderAddress:String(account.metadata?.email||account.metadata?.displayPhoneNumber||account.displayName||''),
    recipientAddresses: input.recipient ? [String(input.recipient)] : [], subject:String(input.subject||''), bodyText:String(input.body||''),
    replyToExternalMessageId:input.replyToExternalMessageId||null, hasAttachments:Boolean(attachmentRef),
    metadata:{provider:account.provider,transport:account.metadata?.transport||null,idempotencyKey:input.idempotencyKey||null,peerAddress:input.channel==='whatsapp'&&!isGroup?String(input.recipient||'').replace(/\D/g,''):null,isGroup,unofficial:account.metadata?.transport==='qr',attachment:attachmentRef||null,replyPreview:input.replyPreview||null,outbox:false},
  })
  pushEvent(snapshot,event)
  const stored=(snapshot.events||[]).find(item=>eventIdentityKey(item)===eventIdentityKey(event))||event
  stored.status='sent'; stored.replyToExternalMessageId=input.replyToExternalMessageId||stored.replyToExternalMessageId||null; stored.hasAttachments=Boolean(attachmentRef||stored.hasAttachments); stored.metadata={...(stored.metadata||{}),attachment:attachmentRef||stored.metadata?.attachment||null,replyPreview:input.replyPreview||stored.metadata?.replyPreview||null,outbox:false}
  account.lastError=null; account.updatedAt=now(); saveStore(snapshot)
  return stored
}
async function attemptQueuedWhatsAppEvent(snapshot,event,account){
  const ref=event.metadata?.attachment||null
  try{
    const cred=account.metadata?.transport==='qr'?null:await credential(snapshot,account)
    const input={workspaceId:event.workspaceId,leadId:event.leadId,contactId:event.contactId,accountId:event.accountId,channel:'whatsapp',recipient:event.recipientAddresses?.[0]||'',threadId:event.threadId||null,body:event.bodyText||'',idempotencyKey:event.metadata?.idempotencyKey||null,replyToExternalMessageId:event.replyToExternalMessageId||null,replyPreview:event.metadata?.replyPreview||null}
    const result=await performWhatsAppTransport(account,cred,input,ref)
    event.externalMessageId=result.id||event.externalMessageId||null; event.threadId=result.threadId||event.threadId||null; event.status='sent'; event.metadata={...(event.metadata||{}),outbox:false,lastSendError:null,lastAttemptAt:now(),attempts:Number(event.metadata?.attempts||0)+1}; account.lastError=null; account.updatedAt=now(); return true
  }catch(error){event.status='queued';event.metadata={...(event.metadata||{}),outbox:true,lastSendError:String(error?.message||error),lastAttemptAt:now(),attempts:Number(event.metadata?.attempts||0)+1,nextRetryAt:new Date(Date.now()+Math.min(30000,2000*Math.max(1,Number(event.metadata?.attempts||1)))).toISOString()};return false}
}
async function drainWhatsAppOutbox(){
  if(outboxDraining)return;outboxDraining=true
  try{const snapshot=store();let touched=false;for(const event of snapshot.events||[]){if(event.channel!=='whatsapp'||event.direction!=='outbound'||event.status!=='queued'||event.metadata?.outbox!==true)continue;if(event.metadata?.nextRetryAt&&Date.parse(String(event.metadata.nextRetryAt))>Date.now())continue;const account=accountById(snapshot,event.workspaceId,event.accountId);if(!account||account.status!=='connected')continue;await attemptQueuedWhatsAppEvent(snapshot,event,account);touched=true}if(touched)saveStore(snapshot)}finally{outboxDraining=false}
}
for (const account of store().accounts || []) { if (account.provider==='whatsapp_cloud' && account.metadata?.transport==='qr' && account.status==='connected') { whatsappQr.start(account.workspaceId, account.displayName).catch(err=>console.warn('WhatsApp QR restore:', err instanceof Error ? err.message : String(err))) } }

const oauthStates = new Map()
function oauthReturn(urlValue){
  const allowedOrigins=new Set([`http://127.0.0.1:${CRM_PORT}`,`http://localhost:${CRM_PORT}`])
  try { if(PUBLIC_APP_URL) allowedOrigins.add(new URL(PUBLIC_APP_URL).origin) } catch {}
  try { const u=new URL(String(urlValue||'')); if(/^https?:$/.test(u.protocol)&&allowedOrigins.has(u.origin)) return u.toString() } catch {}
  return PUBLIC_APP_URL ? `${PUBLIC_APP_URL}/?rt_release=101.8.4-h2-communications-cloud#/settings` : `http://127.0.0.1:${CRM_PORT}/?rt_release=101.8.4-h2-communications-local#/settings`
}
function providerConfig(provider){ const c=config(); if(provider==='google') return {clientId:c.googleClientId||process.env.REALTALENT_GOOGLE_CLIENT_ID||'',clientSecret:c.googleClientSecret||process.env.REALTALENT_GOOGLE_CLIENT_SECRET||'',tenant:''}; if(provider==='microsoft') return {clientId:c.microsoftClientId||process.env.REALTALENT_MICROSOFT_CLIENT_ID||'',clientSecret:c.microsoftClientSecret||process.env.REALTALENT_MICROSOFT_CLIENT_SECRET||'',tenant:c.microsoftTenant||process.env.REALTALENT_MICROSOFT_TENANT||'common'}; return {clientId:'',clientSecret:'',tenant:''} }
function redirectUri(provider){
  if(PUBLIC_GATEWAY_URL) return `${PUBLIC_GATEWAY_URL}/oauth/${provider==='microsoft'?'microsoft':'google'}/callback`
  return provider==='microsoft' ? `http://localhost:${PORT}/oauth/microsoft/callback` : `http://127.0.0.1:${PORT}/oauth/google/callback`
}
function authUrl(provider, workspaceId, returnUrl){ const pc=providerConfig(provider); if(!pc.clientId) throw new Error(`${provider==='google'?'Google':'Microsoft'} OAuth ainda não foi configurado. Execute ./configure-communications-local.sh.`); const verifier=b64url(crypto.randomBytes(48)); const challenge=b64url(sha256(verifier)); const state=uuid(); oauthStates.set(state,{provider,workspaceId,verifier,returnUrl:oauthReturn(returnUrl),createdAt:Date.now()}); if(provider==='google'){ const u=new URL('https://accounts.google.com/o/oauth2/v2/auth'); for(const [k,v] of Object.entries({client_id:pc.clientId,redirect_uri:redirectUri(provider),response_type:'code',scope:scopes(provider).join(' '),access_type:'offline',prompt:'consent',include_granted_scopes:'true',state,code_challenge:challenge,code_challenge_method:'S256'}))u.searchParams.set(k,v); return u.toString() } const u=new URL(`https://login.microsoftonline.com/${encodeURIComponent(pc.tenant)}/oauth2/v2.0/authorize`); for(const [k,v] of Object.entries({client_id:pc.clientId,redirect_uri:redirectUri(provider),response_type:'code',response_mode:'query',scope:scopes(provider).join(' '),state,code_challenge:challenge,code_challenge_method:'S256'}))u.searchParams.set(k,v); return u.toString() }
async function tokenExchange(provider, code, verifier){ const pc=providerConfig(provider); const form=new URLSearchParams({client_id:pc.clientId,code,redirect_uri:redirectUri(provider),grant_type:'authorization_code',code_verifier:verifier}); if(pc.clientSecret)form.set('client_secret',pc.clientSecret); if(provider==='microsoft')form.set('scope',scopes(provider).join(' ')); const endpoint=provider==='google'?'https://oauth2.googleapis.com/token':`https://login.microsoftonline.com/${encodeURIComponent(pc.tenant)}/oauth2/v2.0/token`; const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form}); const p=await r.json().catch(()=>({})); if(!r.ok)throw new Error(String(p.error_description||p.error||'Falha ao trocar o código OAuth.')); return p }
async function refreshToken(account, cred){ if(!cred.refresh_token) return cred; const pc=providerConfig(account.provider); const form=new URLSearchParams({client_id:pc.clientId,refresh_token:cred.refresh_token,grant_type:'refresh_token'}); if(pc.clientSecret)form.set('client_secret',pc.clientSecret); if(account.provider==='microsoft')form.set('scope',scopes(account.provider).join(' ')); const endpoint=account.provider==='google'?'https://oauth2.googleapis.com/token':`https://login.microsoftonline.com/${encodeURIComponent(pc.tenant)}/oauth2/v2.0/token`; const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form}); const p=await r.json().catch(()=>({})); if(!r.ok)throw new Error(String(p.error_description||p.error||'Falha ao renovar OAuth.')); return {...cred,...p,refresh_token:p.refresh_token||cred.refresh_token,expires_at:Date.now()+Number(p.expires_in||3600)*1000} }
async function credential(s,account){ let cred=decrypt(account.credential); if((account.provider==='google'||account.provider==='microsoft') && cred.refresh_token && Number(cred.expires_at||0)<Date.now()+90_000){ cred=await refreshToken(account,cred); account.credential=encrypt(cred); account.tokenExpiresAt=new Date(cred.expires_at).toISOString(); account.tokenRefreshedAt=now(); account.updatedAt=now(); upsertAccount(s,account); saveStore(s) } return cred }
async function identity(provider, accessToken){ if(provider==='google'){ const r=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{authorization:`Bearer ${accessToken}`}}); const p=await r.json().catch(()=>({})); if(!r.ok)throw new Error(String(p.error?.message||'Não foi possível identificar a conta Google.')); return {id:String(p.id||p.email),name:String(p.name||p.email),email:String(p.email||'')} } const r=await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',{headers:{authorization:`Bearer ${accessToken}`}}); const p=await r.json().catch(()=>({})); if(!r.ok)throw new Error(String(p.error?.message||'Não foi possível identificar a conta Microsoft.')); return {id:String(p.id),name:String(p.displayName||p.mail||p.userPrincipalName),email:String(p.mail||p.userPrincipalName||'')} }

async function sendGoogle(account,cred,input){ const subject=`=?UTF-8?B?${Buffer.from(input.subject||'').toString('base64')}?=`; const mime=[`To: ${input.recipient}`,`Subject: ${subject}`,'MIME-Version: 1.0','Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: 8bit','',input.body].join('\r\n'); const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{authorization:`Bearer ${cred.access_token}`,'content-type':'application/json'},body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')})}); const p=await r.json().catch(()=>({})); if(!r.ok)throw new Error(String(p.error?.message||'Gmail recusou o envio.')); return {id:String(p.id||''),threadId:String(p.threadId||'')} }
async function sendMicrosoft(account,cred,input){ const r=await fetch('https://graph.microsoft.com/v1.0/me/sendMail',{method:'POST',headers:{authorization:`Bearer ${cred.access_token}`,'content-type':'application/json'},body:JSON.stringify({message:{subject:input.subject||'',body:{contentType:'Text',content:input.body},toRecipients:[{emailAddress:{address:input.recipient}}]},saveToSentItems:true})}); if(!r.ok){const p=await r.json().catch(()=>({}));throw new Error(String(p.error?.message||'Microsoft Graph recusou o envio.'))} return {id:null,threadId:null} }
async function sendWhatsApp(account,cred,input){
  const graphVersion=config().metaGraphVersion||'v23.0'; const phoneId=account.metadata?.phoneNumberId||account.externalAccountId
  let message
  if(input.attachment?.dataBase64){
    const buffer=Buffer.from(String(input.attachment.dataBase64),'base64');const form=new FormData();form.append('messaging_product','whatsapp');form.append('file',new Blob([buffer],{type:String(input.attachment.mimeType||'application/octet-stream')}),String(input.attachment.fileName||'arquivo'))
    const upload=await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneId)}/media`,{method:'POST',headers:{authorization:`Bearer ${cred.access_token}`},body:form});const up=await upload.json().catch(()=>({}));if(!upload.ok||!up.id)throw new Error(String(up.error?.message||'WhatsApp Cloud API recusou o upload da mídia.'))
    const kind=String(input.attachment.kind||mediaKind(input.attachment.mimeType));const type=kind==='image'?'image':kind==='video'?'video':kind==='voice'||kind==='audio'?'audio':'document';message={messaging_product:'whatsapp',to:String(input.recipient).replace(/\D/g,''),type,[type]:{id:String(up.id),...(type==='document'?{filename:String(input.attachment.fileName||'arquivo')}:{}),...(input.body&&type!=='audio'?{caption:String(input.body)}:{})}}
  } else message={messaging_product:'whatsapp',to:String(input.recipient).replace(/\D/g,''),type:'text',text:{body:input.body,preview_url:false}}
  if(input.replyToExternalMessageId)message.context={message_id:String(input.replyToExternalMessageId)}
  const r=await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneId)}/messages`,{method:'POST',headers:{authorization:`Bearer ${cred.access_token}`,'content-type':'application/json'},body:JSON.stringify(message)});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(p.error?.message||'WhatsApp Cloud API recusou o envio.'));return{id:String(p.messages?.[0]?.id||''),threadId:null}
}
function decodeB64Url(s=''){ try{return Buffer.from(String(s).replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8')}catch{return ''} }
function gmailBody(payload){ if(!payload)return''; if(payload.mimeType==='text/plain'&&payload.body?.data)return decodeB64Url(payload.body.data); for(const part of payload.parts||[]){const v=gmailBody(part);if(v)return v} return payload.body?.data?decodeB64Url(payload.body.data):'' }
function header(headers,name){ return String((headers||[]).find(h=>String(h.name).toLowerCase()===name.toLowerCase())?.value||'') }
function emailAddress(value){ const m=String(value||'').match(/<([^>]+)>/); return (m?m[1]:String(value||'')).trim().toLowerCase() }
async function syncGoogle(s,account){ const cred=await credential(s,account); const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q=in%3Ainbox%20newer_than%3A30d',{headers:{authorization:`Bearer ${cred.access_token}`}}); const p=await r.json().catch(()=>({})); if(!r.ok)throw new Error(String(p.error?.message||'Falha ao sincronizar Gmail.')); let imported=0; for(const item of p.messages||[]){ if(s.events.some(e=>e.externalMessageId===item.id))continue; const mr=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,{headers:{authorization:`Bearer ${cred.access_token}`}}); const m=await mr.json().catch(()=>({})); if(!mr.ok)continue; const from=header(m.payload?.headers,'From'); const to=header(m.payload?.headers,'To'); const subject=header(m.payload?.headers,'Subject'); const event=makeEvent({workspaceId:account.workspaceId,accountId:account.id,channel:'email',direction:'inbound',status:'received',externalMessageId:String(m.id),threadId:String(m.threadId||''),senderAddress:emailAddress(from),recipientAddresses:to.split(',').map(emailAddress).filter(Boolean),subject,bodyText:gmailBody(m.payload)||String(m.snippet||''),internetMessageId:header(m.payload?.headers,'Message-ID')||null,metadata:{provider:'google'}}); event.occurredAt=m.internalDate?new Date(Number(m.internalDate)).toISOString():now(); if(pushEvent(s,event))imported++ } account.lastSyncAt=now(); account.updatedAt=now(); return imported }
async function syncMicrosoft(s,account){ const cred=await credential(s,account); const url='https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=30&$orderby=receivedDateTime%20desc&$select=id,conversationId,subject,bodyPreview,receivedDateTime,from,toRecipients,internetMessageId,isRead'; const r=await fetch(url,{headers:{authorization:`Bearer ${cred.access_token}`}}); const p=await r.json().catch(()=>({})); if(!r.ok)throw new Error(String(p.error?.message||'Falha ao sincronizar Outlook.')); let imported=0; for(const m of p.value||[]){ if(s.events.some(e=>e.externalMessageId===m.id))continue; const event=makeEvent({workspaceId:account.workspaceId,accountId:account.id,channel:'email',direction:'inbound',status:m.isRead?'read':'received',externalMessageId:String(m.id),threadId:String(m.conversationId||''),senderAddress:String(m.from?.emailAddress?.address||'').toLowerCase(),recipientAddresses:(m.toRecipients||[]).map(x=>String(x.emailAddress?.address||'').toLowerCase()).filter(Boolean),subject:String(m.subject||''),bodyText:String(m.bodyPreview||''),internetMessageId:String(m.internetMessageId||'')||null,metadata:{provider:'microsoft'}}); event.occurredAt=String(m.receivedDateTime||now()); if(pushEvent(s,event))imported++ } account.lastSyncAt=now(); account.updatedAt=now(); return imported }
async function syncAccount(s,account,{background=false}={}){ const qr=account.provider==='whatsapp_cloud'&&account.metadata?.transport==='qr'; if(account.status!=='connected'&&!qr)return 0; if(account.provider==='google')return syncGoogle(s,account); if(account.provider==='microsoft')return syncMicrosoft(s,account); if(qr){ const result=await whatsappQr.syncHistory(account.workspaceId,background?{chatLimit:20,messageLimit:25,incremental:true,includeGroups:false}:{chatLimit:60,messageLimit:80,includeGroups:false},s); return Number(result.imported||0) } return 0 }

async function testAccount(s,account){ const start=Date.now(); try { if(account.metadata?.transport==='qr'){const q=whatsappQr.status(account.workspaceId);if(q.state!=='connected')throw new Error('Sessão WhatsApp QR não está conectada.');account.lastTestedAt=now();account.lastTestStatus='pass';account.lastTestLatencyMs=Date.now()-start;account.lastError=null;account.updatedAt=now();saveStore(s);return{status:'pass',message:'Sessão WhatsApp QR local conectada.',latencyMs:account.lastTestLatencyMs}} const cred=await credential(s,account); if(account.provider==='google'){const r=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{authorization:`Bearer ${cred.access_token}`}});if(!r.ok)throw new Error('Google recusou a credencial.')} else if(account.provider==='microsoft'){const r=await fetch('https://graph.microsoft.com/v1.0/me?$select=id',{headers:{authorization:`Bearer ${cred.access_token}`}});if(!r.ok)throw new Error('Microsoft recusou a credencial.')} else if(account.provider==='whatsapp_cloud'){const v=config().metaGraphVersion||'v23.0';const r=await fetch(`https://graph.facebook.com/${v}/${encodeURIComponent(account.metadata?.phoneNumberId||account.externalAccountId)}?fields=id,display_phone_number,verified_name`,{headers:{authorization:`Bearer ${cred.access_token}`}});if(!r.ok){const p=await r.json().catch(()=>({}));throw new Error(String(p.error?.message||'Meta recusou a credencial.'))}} account.lastTestedAt=now();account.lastTestStatus='pass';account.lastTestLatencyMs=Date.now()-start;account.lastError=null;account.updatedAt=now();saveStore(s);return{status:'pass',message:'Conexão externa validada com sucesso.',latencyMs:account.lastTestLatencyMs} } catch(err){account.lastTestedAt=now();account.lastTestStatus='fail';account.lastTestLatencyMs=Date.now()-start;account.lastError=err instanceof Error?err.message:String(err);account.updatedAt=now();saveStore(s);return{status:'fail',message:account.lastError,latencyMs:account.lastTestLatencyMs} } }

function markConversationRead(s,{workspaceId,threadId='',peerAddress=''}){ const date=now();let updated=0;const peer=String(peerAddress||'').replace(/\D/g,'');for(const event of s.events||[]){if(event.workspaceId!==workspaceId||event.channel!=='whatsapp'||event.direction!=='inbound')continue;const sameThread=threadId&&String(event.threadId||'')===String(threadId);const eventPeer=String(event.metadata?.peerAddress||event.senderAddress||'').replace(/\D/g,'');const samePeer=peer&&eventPeer===peer;if(!sameThread&&!samePeer)continue;if(event.metadata?.crmReadAt)continue;event.metadata={...(event.metadata||{}),crmReadAt:date};updated++}return updated}

async function materializeCloudInboundMedia(s,account,mediaNode,type='document'){
  const cloudMediaId=String(mediaNode?.id||'');const base={cloudMediaId,mimeType:String(mediaNode?.mime_type||''),fileName:String(mediaNode?.filename||''),kind:String(type||'document')};if(!cloudMediaId)return base
  try{const cred=await credential(s,account);const graphVersion=config().metaGraphVersion||'v23.0';const infoResponse=await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(cloudMediaId)}`,{headers:{authorization:`Bearer ${cred.access_token}`}});const info=await infoResponse.json().catch(()=>({}));if(!infoResponse.ok||!info.url)throw new Error(String(info.error?.message||'Meta não retornou a URL da mídia.'));const fileResponse=await fetch(String(info.url),{headers:{authorization:`Bearer ${cred.access_token}`}});if(!fileResponse.ok)throw new Error(`Download da mídia recusado (HTTP ${fileResponse.status}).`);const buffer=Buffer.from(await fileResponse.arrayBuffer());const persisted=persistMedia({dataBase64:buffer.toString('base64'),mimeType:String(info.mime_type||mediaNode?.mime_type||fileResponse.headers.get('content-type')||'application/octet-stream'),fileName:String(mediaNode?.filename||`whatsapp-${cloudMediaId}`),kind:String(type||'document')});return{...base,...(persisted||{}),cloudMediaId}}
  catch(error){return{...base,downloadError:String(error?.message||error)}}
}
async function parseWhatsAppWebhook(s,payload){ let imported=0; for(const entry of payload.entry||[]){for(const change of entry.changes||[]){const value=change.value||{};const phoneId=String(value.metadata?.phone_number_id||'');const account=(s.accounts||[]).find(a=>a.provider==='whatsapp_cloud'&&(a.externalAccountId===phoneId||a.metadata?.phoneNumberId===phoneId)); if(!account)continue; for(const m of value.messages||[]){ const mediaNode=m.image||m.video||m.audio||m.document||null; const attachment=mediaNode?await materializeCloudInboundMedia(s,account,mediaNode,m.type||'document'):null; const text=m.text?.body||m.image?.caption||m.video?.caption||m.document?.caption||m.button?.text||m.interactive?.button_reply?.title||(mediaNode?'[Mídia WhatsApp]':'[Mensagem WhatsApp]'); const peerAddress=String(m.from||'').replace(/\D/g,''); const event=makeEvent({workspaceId:account.workspaceId,accountId:account.id,channel:'whatsapp',direction:'inbound',status:'received',externalMessageId:String(m.id||uuid()),threadId:peerAddress||null,senderAddress:String(m.from||''),recipientAddresses:[String(value.metadata?.display_phone_number||'')],bodyText:String(text),replyToExternalMessageId:String(m.context?.id||'')||null,hasAttachments:Boolean(mediaNode),metadata:{provider:'whatsapp_cloud',type:m.type||'unknown',peerAddress,...(attachment?{attachment}:{})}}); if(m.timestamp)event.occurredAt=new Date(Number(m.timestamp)*1000).toISOString();if(pushEvent(s,event))imported++ } for(const st of value.statuses||[]){ const event=s.events.find(e=>e.externalMessageId===st.id&&e.workspaceId===account.workspaceId&&e.accountId===account.id); if(event){event.status=st.status==='delivered'?'delivered':st.status==='read'?'read':st.status==='sent'?'sent':st.status==='failed'?'failed':event.status;event.metadata={...(event.metadata||{}),whatsappStatus:st.status,errors:st.errors||[]}} }} } return imported }

async function route(req,res){
  if(!validHost(req))return json(res,421,{error:'Host não autorizado para o Communications Gateway.'})
  applyCors(req,res)
  if(req.method==='OPTIONS'){if(!originAllowed(req))return json(res,403,{error:'Origem não autorizada.'});res.writeHead(204);return res.end()}
  const u=new URL(req.url,`http://${req.headers.host||`127.0.0.1:${PORT}`}`)
  const internalApi=u.pathname.startsWith('/api/')
  if(internalApi&&!originAllowed(req))return json(res,403,{error:'Origem não autorizada para o Communications Gateway.'})
  if(internalApi&&!internalAuthorized(req))return json(res,401,{error:'Autenticação local do Communications Gateway ausente ou inválida.'})
  const s=store();
  if(req.method==='GET'&&u.pathname==='/api/communications/health'){const google=providerConfig('google');const microsoft=providerConfig('microsoft');return json(res,200,{ok:true,mode:'local-gateway',version:VERSION,security:{runtimeAuth:Boolean(RUNTIME_TOKEN),hostValidation:true,originValidation:true,webhooksFailClosed:true},providers:{google:Boolean(google.clientId),microsoft:Boolean(microsoft.clientId),whatsapp:true,whatsappQr:true},syncIntervalMs:SYNC_INTERVAL_MS,realtime:{transport:'sse',...realtimeBus.stats()}})}
  if(req.method==='GET'&&u.pathname==='/api/integrations/accounts'){const workspaceId=u.searchParams.get('workspaceId')||'';const accounts=s.accounts.filter(a=>a.workspaceId===workspaceId&&a.status!=='revoked').map(a=>{const view=safeAccount(a);if(a.provider==='whatsapp_cloud'&&a.metadata?.transport==='qr'){const live=whatsappQr.status(a.workspaceId);view.metadata={...(view.metadata||{}),liveState:live.state,qrEngine:live.engine||a.metadata?.qrEngine};if(live.state==='connected'){view.status='connected';view.lastError=null}else if(['starting','disconnected','idle'].includes(live.state)){view.status='attention';view.lastError=live.lastError||a.lastError||'WhatsApp QR reconectando.'}else if(live.state==='qr'){view.status='attention';view.lastError='WhatsApp QR aguardando leitura do código.'}}return view});return json(res,200,{accounts})}
  if(req.method==='POST'&&u.pathname==='/api/integrations/oauth/start'){const b=await body(req); if(!['google','microsoft'].includes(b.provider))return json(res,400,{error:b.provider==='whatsapp_cloud'?'No modo Linux local, conecte o WhatsApp Business pela tela WhatsApp informando o token permanente e o Phone Number ID.':'Este provedor ainda exige o backend hospedado.'}); try{return json(res,200,{mode:'oauth',url:authUrl(b.provider,b.workspaceId,b.returnUrl),message:'OAuth real iniciado pelo gateway local.'})}catch(e){return json(res,400,{error:e.message})}}
  if(req.method==='GET'&&(u.pathname==='/oauth/google/callback'||u.pathname==='/oauth/microsoft/callback')){const provider=u.pathname.includes('google')?'google':'microsoft';const stateId=u.searchParams.get('state')||'';const code=u.searchParams.get('code')||'';const error=u.searchParams.get('error_description')||u.searchParams.get('error');const st=oauthStates.get(stateId);oauthStates.delete(stateId);if(error)return html(res,400,`<h2>Conexão cancelada</h2><p>${escapeHtml(error)}</p>`);if(!st||st.provider!==provider||Date.now()-st.createdAt>10*60_000)return html(res,400,'<h2>Estado OAuth inválido ou expirado.</h2>');try{const token=await tokenExchange(provider,code,st.verifier);token.expires_at=Date.now()+Number(token.expires_in||3600)*1000;const who=await identity(provider,token.access_token);const date=now();const existing=s.accounts.find(a=>a.workspaceId===st.workspaceId&&a.provider===provider&&a.externalAccountId===who.id);const account={id:existing?.id||uuid(),workspaceId:st.workspaceId,provider,externalAccountId:who.id,displayName:who.email||who.name,status:'connected',scopes:scopes(provider),credential:encrypt(token),tokenExpiresAt:new Date(token.expires_at).toISOString(),lastSyncAt:existing?.lastSyncAt||null,lastError:null,capabilities:cap(provider),metadata:{email:who.email},createdAt:existing?.createdAt||date,updatedAt:date};upsertAccount(s,account);saveStore(s);const ret=new URL(st.returnUrl);ret.searchParams.set('integration','connected');ret.searchParams.set('provider',provider);res.writeHead(302,{location:ret.toString(),'cache-control':'no-store'});return res.end()}catch(e){return html(res,500,`<h2>Falha ao conectar ${escapeHtml(provider)}</h2><p>${escapeHtml(e instanceof Error?e.message:e)}</p>`)} }
  if(req.method==='POST'&&u.pathname==='/api/integrations/whatsapp/qr/start'){const b=await body(req);if(!b.workspaceId)return json(res,400,{error:'Workspace é obrigatório.'});try{return json(res,200,await whatsappQr.start(String(b.workspaceId),String(b.displayName||'WhatsApp QR Local')))}catch(e){return json(res,500,{error:e instanceof Error?e.message:String(e)})}}
  if(req.method==='GET'&&u.pathname==='/api/integrations/whatsapp/qr/diagnostics'){const workspaceId=u.searchParams.get('workspaceId')||'';if(!workspaceId)return json(res,400,{error:'Workspace é obrigatório.'});return json(res,200,await whatsappQr.diagnostics(String(workspaceId)))}
  if(req.method==='GET'&&u.pathname==='/api/integrations/whatsapp/qr/status'){return json(res,200,whatsappQr.status(String(u.searchParams.get('workspaceId')||'default')))}
  if(req.method==='GET'&&u.pathname==='/api/integrations/whatsapp/qr/contacts'){const workspaceId=String(u.searchParams.get('workspaceId')||'');if(!workspaceId)return json(res,400,{error:'Workspace é obrigatório.'});try{return json(res,200,{contacts:await whatsappQr.listContacts(workspaceId)})}catch(e){return json(res,502,{error:e instanceof Error?e.message:String(e)})}}
  if(req.method==='GET'&&u.pathname==='/api/integrations/whatsapp/qr/groups/info'){const workspaceId=String(u.searchParams.get('workspaceId')||'');const groupId=String(u.searchParams.get('groupId')||'');if(!workspaceId||!groupId)return json(res,400,{error:'Workspace e grupo são obrigatórios.'});try{return json(res,200,await whatsappQr.groupInfo(workspaceId,groupId))}catch(e){return json(res,502,{error:e instanceof Error?e.message:String(e)})}}
  if(req.method==='POST'&&u.pathname==='/api/integrations/whatsapp/qr/disconnect'){const b=await body(req);return json(res,200,await whatsappQr.disconnect(String(b.workspaceId||'default')))}
  if(req.method==='POST'&&u.pathname==='/api/integrations/whatsapp/qr/groups'){
    const b=await body(req)
    if(!b.workspaceId||!String(b.title||'').trim())return json(res,400,{error:'Workspace e nome do grupo são obrigatórios.'})
    const participants=Array.isArray(b.participants)?b.participants:[]
    if(!participants.length)return json(res,400,{error:'Adicione pelo menos um participante.'})
    try{
      const result=await whatsappQr.createGroup(String(b.workspaceId),String(b.title),participants)
      const account=(s.accounts||[]).find(a=>a.workspaceId===String(b.workspaceId)&&a.provider==='whatsapp_cloud'&&a.metadata?.transport==='qr'&&a.status!=='revoked')
      let event=null
      if(account){
        event=makeEvent({workspaceId:String(b.workspaceId),accountId:account.id,channel:'whatsapp',direction:'internal',status:'sent',externalMessageId:null,threadId:result.groupId,senderAddress:String(account.metadata?.displayPhoneNumber||account.displayName||''),recipientAddresses:participants.map(value=>String(value)),bodyText:`Grupo “${result.title}” criado.`,metadata:{provider:'whatsapp_qr',transport:'qr',qrEngine:'whatsapp-web-js',unofficial:true,isGroup:true,chatName:result.title,groupCreated:true,peerAddress:''}})
        pushEvent(s,event);saveStore(s)
      }
      return json(res,200,{ok:true,...result,event})
    }catch(e){return json(res,502,{error:e instanceof Error?e.message:String(e)})}
  }
  if(req.method==='POST'&&u.pathname==='/api/integrations/whatsapp/connect'){const b=await body(req);if(!b.workspaceId||!b.accessToken||!b.phoneNumberId)return json(res,400,{error:'Workspace, Access Token e Phone Number ID são obrigatórios.'});const v=config().metaGraphVersion||'v23.0';const start=Date.now();const r=await fetch(`https://graph.facebook.com/${v}/${encodeURIComponent(String(b.phoneNumberId))}?fields=id,display_phone_number,verified_name`,{headers:{authorization:`Bearer ${b.accessToken}`}});const p=await r.json().catch(()=>({}));if(!r.ok)return json(res,400,{error:String(p.error?.message||'Não foi possível validar o número no WhatsApp Cloud API.')});const date=now();const existing=s.accounts.find(a=>a.workspaceId===b.workspaceId&&a.provider==='whatsapp_cloud'&&a.externalAccountId===String(b.phoneNumberId));const account={id:existing?.id||uuid(),workspaceId:String(b.workspaceId),provider:'whatsapp_cloud',externalAccountId:String(b.phoneNumberId),displayName:String(b.displayName||p.verified_name||p.display_phone_number||'WhatsApp Business'),status:'connected',scopes:scopes('whatsapp_cloud'),credential:encrypt({access_token:String(b.accessToken)}),tokenExpiresAt:null,lastSyncAt:null,lastError:null,lastTestedAt:date,lastTestStatus:'pass',lastTestLatencyMs:Date.now()-start,capabilities:cap('whatsapp_cloud'),metadata:{phoneNumberId:String(b.phoneNumberId),wabaId:String(b.wabaId||''),displayPhoneNumber:String(p.display_phone_number||''),verifiedName:String(p.verified_name||'')},createdAt:existing?.createdAt||date,updatedAt:date};upsertAccount(s,account);saveStore(s);return json(res,200,{account:safeAccount(account),message:'WhatsApp Business conectado e validado pela Cloud API.'})}
  if(req.method==='POST'&&u.pathname==='/api/integrations/test'){const b=await body(req);const a=accountById(s,b.workspaceId,b.accountId);if(!a)return json(res,404,{error:'Conta não encontrada.'});return json(res,200,await testAccount(s,a))}
  if(req.method==='POST'&&u.pathname==='/api/integrations/account-action'){const b=await body(req);const a=accountById(s,b.workspaceId,b.accountId);if(!a)return json(res,404,{error:'Conta não encontrada.'});if(b.action==='disconnect'&&a.metadata?.transport==='qr')return json(res,200,await whatsappQr.disconnect(String(b.workspaceId)));if(b.action==='disconnect'){a.status='revoked';a.revokedAt=now();a.credential=null}else if(b.action==='pause')a.status='paused';else if(b.action==='resume')a.status='connected';else return json(res,400,{error:'Ação inválida.'});a.updatedAt=now();saveStore(s);return json(res,200,{ok:true})}
  if(req.method==='GET'&&u.pathname==='/api/communications/stream'){
    const workspaceId=String(u.searchParams.get('workspaceId')||'default')
    res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no-store'})
    res.write('retry: 1200\n\n')
    const unsubscribe=realtimeBus.subscribe(workspaceId,res)
    const close=()=>unsubscribe()
    req.on('close',close);req.on('aborted',close)
    return
  }
  if(req.method==='GET'&&u.pathname==='/api/communications/events'){const workspaceId=u.searchParams.get('workspaceId')||'';const limit=Math.min(5000,Math.max(1,Number(u.searchParams.get('limit')||3000)));const events=s.events.filter(e=>e.workspaceId===workspaceId).sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)).slice(0,limit);return json(res,200,{events})}
  if(req.method==='GET'&&u.pathname.startsWith('/api/communications/media/')){const parts=u.pathname.split('/').filter(Boolean);const id=String(parts[3]||'').replace(/[^a-zA-Z0-9-]/g,'');const file=id?mediaDiskPath({id}):'';if(!file||!fs.existsSync(file))return json(res,404,{error:'Mídia não encontrada.'});const stat=fs.statSync(file);res.writeHead(200,{'content-type':contentTypeFor(file),'content-length':stat.size,'cache-control':'private, max-age=3600','x-content-type-options':'nosniff'});return fs.createReadStream(file).pipe(res)}
  if(req.method==='POST'&&u.pathname==='/api/communications/retry'){const b=await body(req);const event=(s.events||[]).find(item=>item.id===String(b.eventId||'')&&item.workspaceId===String(b.workspaceId||'')&&item.channel==='whatsapp'&&item.direction==='outbound');if(!event)return json(res,404,{error:'Mensagem não encontrada.'});event.status='queued';event.metadata={...(event.metadata||{}),outbox:true,nextRetryAt:now(),lastSendError:null};saveStore(s);void drainWhatsAppOutbox();return json(res,200,{event})}
  if(req.method==='POST'&&u.pathname==='/api/communications/send'){
    const b=await body(req); const a=accountById(s,b.workspaceId,b.accountId)
    if(b.channel==='whatsapp'&&looksLikeEncodedMediaText(b.body)){b.body=''}
    if(!a)return json(res,400,{error:'Conta não encontrada ou revogada.'})
    if((!b.body&&!b.attachment?.dataBase64)||(!b.recipient&&!b.threadId))return json(res,400,{error:'Destino e mensagem/arquivo são obrigatórios.'})
    const existing=idempotencyEvent(s,b); if(existing)return json(res,200,{event:existing,idempotent:true})
    const lockKey=String(b.idempotencyKey||'').trim()?`${b.workspaceId}|${b.accountId}|${b.channel}|${b.idempotencyKey}`:''
    try{
      if(lockKey&&sendLocks.has(lockKey))return json(res,200,{event:await sendLocks.get(lockKey),idempotent:true})
      const operation=(async()=>{
        if(b.channel==='whatsapp'&&a.status!=='connected'){const ref=await ensureAttachmentRef(b);return queueWhatsAppEvent(s,b,a,ref,new Error('WhatsApp desconectado. A mensagem ficará na fila.'))}
        try{return await executeCommunicationSend(s,b,a)}catch(error){if(b.channel==='whatsapp'&&isWhatsAppMediaIdRegression(error))return await failedWhatsAppEvent(s,b,a,error);if(b.channel==='whatsapp'&&retryableWhatsAppError(error)){const ref=await ensureAttachmentRef(b);return queueWhatsAppEvent(s,b,a,ref,error)}throw error}
      })()
      if(lockKey)sendLocks.set(lockKey,operation)
      const event=await operation;return json(res,200,{event})
    }catch(e){a.lastError=e instanceof Error?e.message:String(e);a.updatedAt=now();saveStore(s);return json(res,502,{error:a.lastError})}
    finally{if(lockKey)sendLocks.delete(lockKey)}
  }
  if(req.method==='POST'&&u.pathname==='/api/communications/sync'){const b=await body(req);const list=s.accounts.filter(a=>a.workspaceId===b.workspaceId&&(a.status==='connected'||(a.provider==='whatsapp_cloud'&&a.metadata?.transport==='qr'&&a.status==='attention'))&&(!b.accountId||a.id===b.accountId));let imported=0;const triggered=[];const failures=[];for(const a of list){try{const n=await syncAccount(s,a);imported+=n;triggered.push(a.id);a.lastError=null;a.status='connected'}catch(e){a.lastError=e instanceof Error?e.message:String(e);a.updatedAt=now();const live=a.metadata?.transport==='qr'?whatsappQr.status(a.workspaceId):null;failures.push({accountId:a.id,provider:a.provider,transport:a.metadata?.transport||null,displayName:a.displayName||'',liveState:live?.state||null,message:a.lastError})}}saveStore(s);return json(res,200,{queued:[],triggered,accounts:list.length,imported,failures})}
  if(req.method==='POST'&&u.pathname==='/api/communications/read'){const b=await body(req);if(!b.workspaceId)return json(res,400,{error:'Workspace é obrigatório.'});const updated=markConversationRead(s,{workspaceId:String(b.workspaceId),threadId:String(b.threadId||''),peerAddress:String(b.peerAddress||'')});if(updated)saveStore(s);return json(res,200,{updated})}
  if(req.method==='GET'&&u.pathname==='/webhooks/whatsapp'){const token=String(config().whatsappWebhookVerifyToken||'').trim();if(!token)return json(res,503,{error:'Webhook WhatsApp bloqueado: verify token não configurado.'});if(u.searchParams.get('hub.mode')==='subscribe'&&constantTimeTextEqual(u.searchParams.get('hub.verify_token')||'',token)){res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store'});return res.end(u.searchParams.get('hub.challenge')||'')}return res.writeHead(403).end()}
  if(req.method==='POST'&&u.pathname==='/webhooks/whatsapp'){const b=await body(req);if(!String(config().metaAppSecret||'').trim())return json(res,503,{error:'Webhook WhatsApp bloqueado: Meta App Secret não configurado.'});if(!validWebhookSignature(req))return json(res,401,{error:'Assinatura Meta inválida.'});const imported=await parseWhatsAppWebhook(s,b);saveStore(s);return json(res,200,{ok:true,imported})}
  return json(res,404,{error:'Endpoint não encontrado.'})
}

const server=http.createServer((req,res)=>Promise.resolve(route(req,res)).catch(err=>json(res,Number(err?.statusCode||500),{error:err instanceof Error?err.message:String(err)})))
server.on('error', error => fatal('Falha no servidor HTTP', error))
server.listen(PORT,HOST,()=>{console.log(`RealTalent Communications Gateway ${VERSION} em http://${HOST}:${PORT}`);console.log(`OAuth Google: ${redirectUri('google')}`);console.log(`OAuth Microsoft: ${redirectUri('microsoft')}`);console.log(`WhatsApp webhook local: http://${HOST}:${PORT}/webhooks/whatsapp`)})

let syncing=false
async function runBackgroundSync(){
  if(syncing)return
  syncing=true
  try{
    const s=store()
    for(const a of s.accounts.filter(x=>(x.status==='connected'||(x.provider==='whatsapp_cloud'&&x.metadata?.transport==='qr'&&x.status==='attention'))&&(x.provider==='google'||x.provider==='microsoft'||(x.provider==='whatsapp_cloud'&&x.metadata?.transport==='qr')))){
      try{await syncAccount(s,a,{background:true});a.lastError=null}
      catch(e){a.lastError=e instanceof Error?e.message:String(e);a.updatedAt=now()}
    }
    saveStore(s)
  } finally { syncing=false }
}
const backgroundTimer=setInterval(()=>{void runBackgroundSync().catch(error=>console.warn('[Communications Gateway] sincronização em segundo plano falhou:', error instanceof Error ? error.message : String(error)))},SYNC_INTERVAL_MS)
backgroundTimer.unref()
const outboxTimer=setInterval(()=>{void drainWhatsAppOutbox().catch(error=>console.warn('[Communications Gateway] fila WhatsApp falhou:',error instanceof Error?error.message:String(error)))},2_000)
outboxTimer.unref()
const realtimeHeartbeatTimer=setInterval(()=>realtimeBus.heartbeat(),15_000)
realtimeHeartbeatTimer.unref()

async function shutdown(signal){
  if(shuttingDown)return
  shuttingDown=true
  clearInterval(backgroundTimer)
  clearInterval(outboxTimer)
  clearInterval(realtimeHeartbeatTimer)
  realtimeBus.closeAll()
  console.log(`[Communications Gateway] encerrando por ${signal}`)
  try{await whatsappQr.shutdown?.()}catch(error){console.warn('[Communications Gateway] falha ao encerrar WhatsApp Web:',error instanceof Error?error.message:String(error))}
  await new Promise(resolve=>server.close(()=>resolve()))
  process.exit(0)
}
process.on('SIGTERM',()=>{void shutdown('SIGTERM')})
process.on('SIGINT',()=>{void shutdown('SIGINT')})
