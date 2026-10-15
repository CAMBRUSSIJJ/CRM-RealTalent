#!/usr/bin/env node
import assert from 'node:assert/strict'
import { isWhatsAppTechnicalMessage, looksLikeEncodedMediaText, whatsappMessageBody } from './whatsapp-sync-utils.mjs'
let pass=0
const ok=(name,fn)=>{fn();console.log('OK  ',name);pass++}
ok('texto normal permanece texto',()=>assert.equal(whatsappMessageBody({type:'chat',body:'Oi, tudo bem?'}),'Oi, tudo bem?'))
ok('e2e_notification é técnico',()=>assert.equal(isWhatsAppTechnicalMessage({type:'e2e_notification'}),true))
ok('evento técnico não vira body',()=>assert.equal(whatsappMessageBody({type:'e2e_notification',body:'[WhatsApp • e2e_notification]'}),''))
ok('Data URL é reconhecida como mídia codificada',()=>assert.equal(looksLikeEncodedMediaText('data:image/png;base64,iVBORw0KGgoAAA'),true))
ok('Base64 longa sem espaços é reconhecida',()=>assert.equal(looksLikeEncodedMediaText('A'.repeat(800)),true))
ok('Base64 com mídia não vaza e vira marcador de imagem',()=>assert.equal(whatsappMessageBody({type:'image',body:'A'.repeat(800),hasMedia:true}),'[Imagem]'))
ok('sticker vira marcador sem payload',()=>assert.equal(whatsappMessageBody({type:'sticker',body:'',hasMedia:true}),'[Sticker]'))
ok('caption real da imagem é preservada',()=>assert.equal(whatsappMessageBody({type:'image',body:'',hasMedia:true,_data:{caption:'Foto do contrato'}}),'Foto do contrato'))
console.log(`\nWhatsApp normalization runtime smoke: ${pass}/8`)
