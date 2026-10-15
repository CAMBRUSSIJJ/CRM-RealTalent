#!/usr/bin/env node
import { isPhoneCandidate, mapWhatsAppAckStatus, whatsappMessageBody } from './whatsapp-sync-utils.mjs'
import { mergeCommunicationEvent } from './communications-store-utils.mjs'

const checks=[]
const ok=(name,cond)=>{checks.push([name,Boolean(cond)]);console.log(`${cond?'OK  ':'FAIL'} ${name}`)}

ok('E.164 plausível é aceito', isPhoneCandidate('5551999991001@c.us')==='5551999991001')
ok('LID longo não vira telefone', isPhoneCandidate('120363420605141530@lid')==='')
ok('parser prioriza corpo real sobre placeholder', whatsappMessageBody({body:'[Mensagem WhatsApp]',_data:{body:'Olá de verdade'}})==='Olá de verdade')
ok('parser identifica mídia', whatsappMessageBody({type:'image',hasMedia:true})==='[Imagem]')
ok('ACK 3 vira lido', mapWhatsAppAckStatus(3)==='read')
const base={id:'1',workspaceId:'w',accountId:'a',channel:'whatsapp',externalMessageId:'m',status:'received',bodyText:'Olá real',metadata:{}}
const stale={...base,id:'2',bodyText:'[Mensagem WhatsApp]',status:'received'}
ok('merge não rebaixa texto real para placeholder', mergeCommunicationEvent(base,stale).bodyText==='Olá real')
ok('merge enriquece placeholder antigo com texto real', mergeCommunicationEvent(stale,{...base,id:'3',bodyText:'Texto recuperado'}).bodyText==='Texto recuperado')

const failed=checks.filter(([,pass])=>!pass)
console.log(`\nV101.8.4-H11 sync recovery smoke: ${checks.length-failed.length}/${checks.length}`)
if(failed.length)process.exit(1)
