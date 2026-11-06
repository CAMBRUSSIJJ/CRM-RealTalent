import test from 'node:test'
import assert from 'node:assert/strict'
import {createGroupSenderEnricher,groupSenderId,directGroupSenderName,senderFallback} from './group-senders.mjs'

test('group messages use participant not group id and preserve genuine display names',async()=>{
  let looked=[]
  const enrich=createGroupSenderEnricher({lookup:async id=>{
    looked.push(id)
    return {id,name:id.startsWith('111')?'Ana Lima':null,pushname:id.startsWith('222')?'João Silva':null}
  }})
  const messages=[
    {id:'1',from:'987654@g.us',participant:'11111111111@c.us',body:'Olá'},
    {id:'2',from:'987654@g.us',participant:'22222222222@lid',body:'Estou aqui'},
    {id:'3',from:'987654@g.us',participant:'11111111111@c.us',body:'Sim'},
    {id:'4',from:'987654@g.us',participant:'44444444444@lid',notifyName:'Maria Pereira'},
    {id:'5',fromMe:true,from:'987654@g.us',body:'Certo'},
    {id:'6',from:'987654@g.us',body:'Desconhecido'},
  ]
  const result=await enrich(messages,'987654@g.us')
  assert.deepEqual(result.map(x=>x.senderName),[
    'Ana Lima','João Silva','Ana Lima','Maria Pereira','Você','Participante não identificado'
  ])
  assert.deepEqual(looked.sort(),['11111111111@c.us','22222222222@lid'])
  await enrich(messages,'987654@g.us')
  assert.equal(looked.length,2,'contact names are cached across polling refreshes')
  assert.deepEqual(await enrich(messages,'11111111111@c.us'),messages,
    'one-on-one chats are unchanged')
})
test('never confuse group ID with participant; do not fabricate LID phone number',()=>{
  assert.equal(groupSenderId({from:'987654@g.us',participant:'1122334455@lid'}),'1122334455@lid')
  assert.equal(groupSenderId({from:'987654@g.us',participant:'not-a-user'}),'')
  assert.equal(groupSenderId({fromMe:true,participant:'1122334455@lid'}),'')
  assert.equal(directGroupSenderName({pushName:' \u0000 Carla Andrade  '}),'Carla Andrade')
  assert.equal(senderFallback('123456789@lid'),'Participante • 6789')
  assert.equal(senderFallback('987654321@c.us'),'+987654321')
  assert.equal(senderFallback(''),'Participante não identificado')
})
