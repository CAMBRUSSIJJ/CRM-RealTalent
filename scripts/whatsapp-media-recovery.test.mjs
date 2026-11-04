import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { isRecoverableWhatsAppMediaEvent, whatsappMediaFilename, whatsappMediaKind } from './whatsapp-media-recovery.mjs'
import { restoreReferencedCommunicationMedia } from './communications-media-migration.mjs'

const read = p => fs.readFileSync(p, 'utf8')
const browser = read('scripts/whatsapp-browser-qr-bridge.mjs')
const hosted = read('runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/whatsapp-browser-qr-bridge.mjs')
const gateway = read('scripts/realtalent-communications-gateway.mjs')
const hostedGateway = read('runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/realtalent-communications-gateway.mjs')
const ui = read('src/features/communications/whatsapp-chat-panel.tsx')
const proxy = read('api/runtime/_proxy.mjs')

test('only QR media belonging to this workspace can be recovered', () => {
  const event = { workspaceId:'test-workspace',channel:'whatsapp',hasAttachments:true,externalMessageId:'true_551199999999@c.us_abc', metadata:{transport:'qr'} }
  assert.equal(isRecoverableWhatsAppMediaEvent(event,'test-workspace'),true)
  assert.equal(isRecoverableWhatsAppMediaEvent(event,'someone-else'),false)
  assert.equal(isRecoverableWhatsAppMediaEvent({...event, metadata:{transport:'cloud'}},'test-workspace'),false)
  assert.equal(isRecoverableWhatsAppMediaEvent({...event, metadata:{transport:'qr',attachment:{url:'/api/media/id'}}},'test-workspace'),false)
  assert.equal(isRecoverableWhatsAppMediaEvent({...event,hasAttachments:false},'test-workspace'),false)
})

test('voice, audio, images and documents retain browser-compatible file extensions', () => {
  assert.equal(whatsappMediaKind('ptt','audio/ogg; codecs=opus'),'voice')
  assert.equal(whatsappMediaKind('','image/jpeg'),'image')
  assert.equal(whatsappMediaKind('sticker','image/webp'),'sticker')
  assert.match(whatsappMediaFilename({mimetype:'audio/ogg; codecs=opus'},'abc'),/\.ogg$/)
  assert.match(whatsappMediaFilename({mimetype:'image/jpeg'},'abc'),/\.jpg$/)
  assert.match(whatsappMediaFilename({mimetype:'video/mp4'},'abc'),/\.mp4$/)
  assert.equal(whatsappMediaFilename({filename:'relatorio.pdf',mimetype:'application/pdf'},'abc'),'relatorio.pdf')
})

test('update preserves prior confirmed message and does not wait for media download', () => {
  assert.equal(browser,hosted)
  const persistAt=browser.indexOf('ingestMessage(s, account, session, message, chat, source, identity, {')
  const mediaAt=browser.indexOf('const media = await message.downloadMedia()',persistAt)
  assert.ok(persistAt>0 && mediaAt>persistAt,'message must be persisted before media download')
  assert.match(browser,/ingestMessage\(s, account, session, message, chat, source, identity, \{/)
  assert.match(browser,/saveStore\(s\)\s+if \(message\.hasMedia/)
  assert.match(browser,/item\.externalMessageId === liveId/)
  assert.match(browser,/async function hydrateMedia\(workspaceId, eventId\)/)
  assert.match(browser,/typeof session\.client\?\.getMessageById/)
  assert.match(browser,/const strongestAck/)
  assert.match(browser,/requestedChatId/)
})

test('historical media route requires a workspace membership before hosted proxy forwards it', () => {
  for (const src of [gateway,hostedGateway]) {
    assert.match(src,/u\.pathname==='\/api\/communications\/media\/resolve'/)
    assert.match(src,/whatsappQr\.hydrateMedia\(String\(b\.workspaceId\),String\(b\.eventId\)\)/)
  }
  assert.ok(proxy.includes("'/api/communications/media/resolve'"))
  assert.match(ui,/Carregar mídia/)
  assert.match(ui,/recoverGatewayWhatsAppMedia/)
  assert.match(ui,/mediaAttemptsRef/)
  assert.ok(!ui.includes('recoverMedia(eventId, true); await sendOfficialWhatsApp'))
})

test('migration restores only existing attachment references without overwriting local files', () => {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'realtalent-media-'))
  try {
    const root=path.join(base,'CRM'),old=path.join(base,'RealTalent-Teste-WhatsApp')
    const dest=path.join(root,'.realtalent-communications-media')
    const src=path.join(old,'.realtalent-communications-media')
    fs.mkdirSync(dest,{recursive:true});fs.mkdirSync(src,{recursive:true})
    const id='a7d729e2-7900-4d21-ad53-4a34f8a74740',other='7bea4e46-022a-4566-862f-3bbc04c8ecc7'
    fs.writeFileSync(path.join(root,'.realtalent-communications-store.json'),JSON.stringify({events:[{metadata:{attachment:{id}}}]}))
    fs.writeFileSync(path.join(src,id+'--audio.ogg'),'some-audio')
    fs.writeFileSync(path.join(src,other+'--other.jpg'),'secret-unreferenced')
    assert.deepEqual(restoreReferencedCommunicationMedia(root,[old]),{restored:1,missing:0})
    assert.equal(fs.readFileSync(path.join(dest,id+'--audio.ogg'),'utf8'),'some-audio')
    assert.equal(fs.existsSync(path.join(dest,other+'--other.jpg')),false)
    fs.writeFileSync(path.join(dest,id+'--audio.ogg'),'newer-file')
    assert.deepEqual(restoreReferencedCommunicationMedia(root,[old]),{restored:0,missing:0})
    assert.equal(fs.readFileSync(path.join(dest,id+'--audio.ogg'),'utf8'),'newer-file')
  }finally{fs.rmSync(base,{recursive:true,force:true})}
})
