#!/usr/bin/env node
import assert from 'node:assert/strict'
import { patchWhatsAppWebMediaSource, REALTALENT_MEDIA_HOTFIX_MARKER } from './whatsapp-web-media-hotfix.mjs'
let pass=0
const ok=(name,fn)=>{fn();console.log('OK  ',name);pass++}
const fixture=`        const message = {\n            ...options,\n            id: newMsgKey,\n            ...mediaOptions,\n            ...(mediaOptions.toJSON ? mediaOptions.toJSON() : {}),\n        };\n        // Bot's won't reply if canonicalUrl is set (linking)\n`
let patched=''
ok('transforma Utils.js afetado',()=>{const result=patchWhatsAppWebMediaSource(fixture);assert.equal(result.changed,true);patched=result.source;assert.match(patched,/delete message\.__x_id;/)})
ok('guard entra depois da construção da mensagem',()=>assert.ok(patched.indexOf('};')<patched.indexOf('delete message.__x_id')))
ok('guard entra antes do uso da mensagem',()=>assert.ok(patched.indexOf('delete message.__x_id')<patched.indexOf("// Bot's won't reply")))
ok('patch é idempotente',()=>{const result=patchWhatsAppWebMediaSource(patched);assert.equal(result.changed,false);assert.equal(result.state,'already-patched');assert.equal((result.source.match(/delete message\.__x_id/g)||[]).length,1)})
ok('upstream já corrigido não é reescrito',()=>{const result=patchWhatsAppWebMediaSource(fixture.replace("        // Bot's", "        delete message.__x_id;\n        // Bot's"));assert.equal(result.changed,false);assert.equal(result.state,'upstream-fixed')})
ok('layout desconhecido é recusado com segurança',()=>assert.throws(()=>patchWhatsAppWebMediaSource('const x = 1'),/Estrutura de Utils\.js não reconhecida/))
ok('marker da release está no patch',()=>assert.ok(patched.includes(REALTALENT_MEDIA_HOTFIX_MARKER)))
console.log(`\nWhatsApp Media Delivery Fix runtime smoke: ${pass}/7`)
