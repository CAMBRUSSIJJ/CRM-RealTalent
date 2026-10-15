import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { importCommunicationsPackage } from './communications-runtime-deps.mjs'

let qrRuntime = null
async function loadQrRuntime() {
  if (qrRuntime) return qrRuntime
  const [qrMod, baileysMod] = await Promise.all([
    importCommunicationsPackage('qrcode'),
    importCommunicationsPackage('@whiskeysockets/baileys'),
  ])
  const QRCode = qrMod.default || qrMod
  const makeWASocket = baileysMod.default || baileysMod.makeWASocket
  const useMultiFileAuthState = baileysMod.useMultiFileAuthState
  const Browsers = baileysMod.Browsers
  const DisconnectReason = baileysMod.DisconnectReason
  if (!QRCode?.toDataURL || !makeWASocket || !useMultiFileAuthState || !Browsers || !DisconnectReason) {
    throw new Error('Runtime QR Local incompleto. Reinicie pelo ./start-linux.sh.')
  }
  qrRuntime = { QRCode, makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason }
  return qrRuntime
}

const sessions = new Map()
const cleanNumber = value => String(value||'').split('@')[0].split(':')[0].replace(/\D/g,'')
const textFromMessage = msg => msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || msg?.videoMessage?.caption || msg?.buttonsResponseMessage?.selectedDisplayText || msg?.listResponseMessage?.title || '[Mensagem WhatsApp]'

export function createWhatsAppQrBridge({ root, now, uuid, store, saveStore, upsertAccount, pushEvent, makeEvent }) {
  const authRoot = path.join(root, '.realtalent-whatsapp-qr')
  fs.mkdirSync(authRoot,{recursive:true,mode:0o700})
  const get = workspaceId => sessions.get(String(workspaceId)) || null
  const status = workspaceId => {
    const s=get(workspaceId)
    return s ? { state:s.state, qrDataUrl:s.qrDataUrl||null, phone:s.phone||'', displayName:s.displayName||'WhatsApp QR Local', lastError:s.lastError||null, updatedAt:s.updatedAt } : { state:'idle', qrDataUrl:null, phone:'', displayName:'WhatsApp QR Local', lastError:null, updatedAt:now() }
  }
  async function start(workspaceId, displayName='WhatsApp QR Local') {
    workspaceId=String(workspaceId||'default')
    const previous=get(workspaceId)
    if(previous?.sock){ try{previous.sock.end?.()}catch{} }
    const dir=path.join(authRoot,workspaceId.replace(/[^a-zA-Z0-9._-]/g,'_'))
    fs.mkdirSync(dir,{recursive:true,mode:0o700})
    const { QRCode, makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } = await loadQrRuntime()
    const {state:authState,saveCreds}=await useMultiFileAuthState(dir)
    const session={workspaceId,displayName:String(displayName||'WhatsApp QR Local'),state:'starting',qrDataUrl:null,phone:'',lastError:null,updatedAt:now(),sock:null}
    sessions.set(workspaceId,session)
    const sock=makeWASocket({auth:authState,printQRInTerminal:false,browser:Browsers.ubuntu('RealTalent CRM'),syncFullHistory:false,markOnlineOnConnect:false,generateHighQualityLinkPreview:false})
    session.sock=sock
    sock.ev.on('creds.update',saveCreds)
    sock.ev.on('connection.update',async update=>{
      session.updatedAt=now()
      if(update.qr){session.state='qr';session.qrDataUrl=await QRCode.toDataURL(update.qr,{margin:1,width:320});session.lastError=null}
      if(update.connection==='open'){
        session.state='connected';session.qrDataUrl=null;session.phone=cleanNumber(sock.user?.id||'');session.lastError=null
        const s=store(); const existing=(s.accounts||[]).find(a=>a.workspaceId===workspaceId&&a.provider==='whatsapp_cloud'&&a.metadata?.transport==='qr')
        const date=now(); const account={id:existing?.id||uuid(),workspaceId,provider:'whatsapp_cloud',externalAccountId:session.phone||`qr-${crypto.randomUUID()}`,displayName:session.displayName,status:'connected',scopes:['local_qr_session'],credential:null,tokenExpiresAt:null,lastSyncAt:date,lastError:null,lastTestedAt:date,lastTestStatus:'pass',lastTestLatencyMs:0,capabilities:{messages:true,templates:false,delivery_status:true,webhooks:false},metadata:{transport:'qr',displayPhoneNumber:session.phone,unofficial:true},createdAt:existing?.createdAt||date,updatedAt:date};upsertAccount(s,account);saveStore(s);session.accountId=account.id
      }
      if(update.connection==='close'){
        const code=Number(update.lastDisconnect?.error?.output?.statusCode||update.lastDisconnect?.error?.statusCode||0)
        const loggedOut=code===DisconnectReason.loggedOut
        session.state=loggedOut?'logged_out':'disconnected';session.lastError=loggedOut?'Sessão desconectada pelo WhatsApp. Gere um novo QR.':'Conexão QR encerrada.'
      }
    })
    sock.ev.on('messages.upsert',packet=>{
      if(packet.type!=='notify'&&packet.type!=='append')return
      const s=store(); const account=(s.accounts||[]).find(a=>a.workspaceId===workspaceId&&a.provider==='whatsapp_cloud'&&a.metadata?.transport==='qr')
      if(!account)return
      let changed=false
      for(const m of packet.messages||[]){if(!m?.key?.remoteJid||m.key.fromMe)continue;const sender=cleanNumber(m.key.remoteJid);const event=makeEvent({workspaceId,accountId:account.id,channel:'whatsapp',direction:'inbound',status:'received',externalMessageId:String(m.key.id||uuid()),senderAddress:sender,recipientAddresses:[session.phone||''],bodyText:textFromMessage(m.message),metadata:{provider:'whatsapp_qr',transport:'qr',unofficial:true}});if(m.messageTimestamp)event.occurredAt=new Date(Number(m.messageTimestamp)*1000).toISOString();if(pushEvent(s,event))changed=true}
      if(changed)saveStore(s)
    })
    return status(workspaceId)
  }
  async function send(workspaceId,recipient,body){const session=get(workspaceId);if(!session?.sock||session.state!=='connected')throw new Error('WhatsApp QR não está conectado. Escaneie o QR em Configurações → WhatsApp.');const jid=`${cleanNumber(recipient)}@s.whatsapp.net`;const sent=await session.sock.sendMessage(jid,{text:String(body)});return{id:String(sent?.key?.id||uuid()),threadId:jid}}
  async function disconnect(workspaceId){const session=get(workspaceId);if(session?.sock){try{await session.sock.logout()}catch{try{session.sock.end?.()}catch{}}}const dir=path.join(authRoot,String(workspaceId).replace(/[^a-zA-Z0-9._-]/g,'_'));try{fs.rmSync(dir,{recursive:true,force:true})}catch{};sessions.delete(String(workspaceId));const s=store();for(const a of s.accounts||[]){if(a.workspaceId===workspaceId&&a.provider==='whatsapp_cloud'&&a.metadata?.transport==='qr'){a.status='revoked';a.updatedAt=now();a.revokedAt=now()}}saveStore(s);return{ok:true}}
  return {start,status,send,disconnect}
}
