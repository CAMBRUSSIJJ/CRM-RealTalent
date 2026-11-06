import test from 'node:test'
import assert from 'node:assert/strict'
import {createAutoReplyController,safeAutoReplyText} from './auto-reply.mjs'

const chat='5511999999999@c.us',group='11111111111@g.us'
const start=1793964000000
const message=(id,time,text='Olá, gostaria de saber mais sobre os serviços')=>
  ({event:'message',session:'realtalent',payload:{id,chatId:chat,from:chat,
    fromMe:false,timestamp:Math.floor(time/1000),body:text,hasMedia:false}})

test('default OFF; explicit per-contact enable; no groups or unwanted outgoing triggers',async()=>{
  let now=start,sends=[]
  const controller=createAutoReplyController({now:()=>now,delay:async()=>{},
    readMessages:async()=>[{id:'msg_test1',fromMe:false,timestamp:Math.floor(now/1000),body:'Olá'}],
    buildReply:async()=> 'Olá! Sou o assistente virtual. Posso ajudar com informações gerais.',
    send:async(id,text)=>sends.push({id,text}),
  })
  assert.equal(controller.status(chat).enabled,false)
  assert.equal((await controller.onMessage(message('msg_test1',now))).outcome,'ignored')
  assert.throws(()=>controller.setEnabled(group,true),/conversas privadas/)
  assert.equal(controller.setEnabled(chat,true).enabled,true)
  assert.equal((await controller.onMessage({...message('msg_test1',now),event:'message.any'})).outcome,'ignored')
  assert.equal((await controller.onMessage({...message('msg_test1',now),payload:{...message('msg_test1',now).payload,fromMe:true}})).outcome,'ignored')
  assert.equal((await controller.onMessage(message('msg_test1',now))).outcome,'sent')
  assert.equal(sends.length,1)
  assert.equal(sends[0].id,chat)
  assert.match(sends[0].text,/Assistente virtual RealTalent/)
  assert.equal((await controller.onMessage(message('msg_test1',now))).outcome,'duplicate')
  assert.equal(sends.length,1)
  assert.equal(controller.status(chat).survivesRestart,false)
})
test('stale timestamps, unsupported media and opt-out never call model or send',async()=>{
  const now=start,sends=[]
  const controller=createAutoReplyController({now:()=>now,delay:async()=>{},
    readMessages:async()=>{throw Error('should not read')},
    buildReply:async()=>{throw Error('should not generate')},
    send:async(...a)=>sends.push(a),
  })
  controller.setEnabled(chat,true)
  assert.equal((await controller.onMessage(message('msg_old1',now-600000))).outcome,'stale')
  assert.equal((await controller.onMessage({...message('msg_img1',now),payload:{...message('msg_img1',now).payload,
    hasMedia:true,media:{mimetype:'image/jpeg'}}})).outcome,'unsupported_media')
  assert.equal((await controller.onMessage(message('msg_opt1',now,'PARE'))).outcome,'opt_out')
  assert.equal(controller.status(chat).enabled,false)
  assert.equal(sends.length,0)
})
test('a human response or a newer incoming message cancels the draft before send',async()=>{
  let now=start,sends=0,round=0
  const controller=createAutoReplyController({now:()=>now,delay:async()=>{},
    readMessages:async()=>{
      round++
      return round===1?[{id:'msg_1001',timestamp:now/1000,fromMe:false,body:'Preço?'}]:
        [{id:'msg_newer2',timestamp:now/1000+2,fromMe:true,body:'Atendente respondeu'}]
    },
    buildReply:async()=> 'Posso ajudar com uma explicação geral dos serviços.',
    send:async()=>{sends++},
  })
  controller.setEnabled(chat,true)
  assert.equal((await controller.onMessage(message('msg_1001',now))).outcome,'superseded')
  assert.equal(sends,0)
})
test('limits automated sending to 3 per contact/hour and never auto retries uncertain sends',async()=>{
  let now=start,triggerId='',count=0
  const controller=createAutoReplyController({now:()=>now,delay:async()=>{},
    readMessages:async()=>[{id:triggerId,timestamp:now/1000,fromMe:false,body:'Gostaria de informações'}],
    buildReply:async()=> 'Olá! Posso ajudar com informações gerais. Em que área você tem interesse?',
    send:async()=>{count++;if(count===2)throw Error('Network timeout, uncertain delivery')},
  })
  controller.setEnabled(chat,true)
  for(let i=0;i<3;i++){
    triggerId='msg_c'+i+'xxxx'
    const outcome=(await controller.onMessage(message(triggerId,now))).outcome
    assert.equal(outcome,i===1?'failed':'sent')
    now+=COOLDOWN_PLUS
  }
  triggerId='msg_fourxxx'
  assert.equal((await controller.onMessage(message(triggerId,now))).outcome,'limited')
  assert.equal(count,3)
  assert.equal(controller.status(chat).remainingHour,0)
  assert.equal((await controller.onMessage(message('msg_c1xxxx',now-130000))).outcome,'duplicate')
})
const COOLDOWN_PLUS=130000
test('unsafe financial promises and empty outputs are never transmitted',()=>{
  assert.equal(safeAutoReplyText(''),null)
  assert.equal(safeAutoReplyText('O valor é R$ 5000 e temos desconto de 20%.'),null)
  assert.equal(safeAutoReplyText('Prazo confirmado para amanhã, garanto isso.'),null)
  assert.equal(safeAutoReplyText('Olá! Posso explicar como nossos serviços funcionam.'),'Olá! Posso explicar como nossos serviços funcionam.')
})
