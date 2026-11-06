import test from 'node:test'
import assert from 'node:assert/strict'
import {transcribeOneReceivedMessage} from './inline-voice.mjs'

const chatId='12345678901@lid',messageId='voice_123456'
test('individual voice is transcribed only from the selected authenticated WAHA chat',async()=>{
  let transcribed=0
  const messages=[{id:messageId,hasMedia:true,fromMe:false,media:{mimetype:'audio/ogg'},body:''}]
  const result=await transcribeOneReceivedMessage({chatId,messageId},{
    readMessages:async id=>{assert.equal(id,chatId);return messages},
    transcribeMessages:async selected=>{
      transcribed++;assert.deepEqual(selected,messages)
      return {messages:[{...selected[0],_localTranscript:'Cliente quer reunião na sexta.'}]}
    },
  })
  assert.equal(result.text,'Cliente quer reunião na sexta.')
  assert.equal(result.sent,false)
  assert.equal(result.readOnly,true)
  assert.equal(transcribed,1)
})
test('rejects arbitrary media injection, sending audio and missing messages',async()=>{
  let reads=0
  const ctx={readMessages:async()=>{reads++;return [{id:messageId,hasMedia:true,fromMe:true,media:{mimetype:'audio/ogg'}}]},
    transcribeMessages:async()=>{throw Error('should not call')}}
  await assert.rejects(transcribeOneReceivedMessage({chatId:'evil@unknown',messageId},ctx),/válido/)
  await assert.rejects(transcribeOneReceivedMessage({chatId,messageId:'../escape'},ctx),/válido/)
  assert.equal(reads,0)
  await assert.rejects(transcribeOneReceivedMessage({chatId,messageId},ctx),/recebidos/)
  await assert.rejects(transcribeOneReceivedMessage({chatId,messageId:'other_123'},ctx),/não localizada/)
})
test('failed audio never returns a synthetic transcript',async()=>{
  await assert.rejects(transcribeOneReceivedMessage({chatId,messageId},{
    readMessages:async()=>[{id:messageId,hasMedia:true,media:{mimetype:'audio/ogg'}}],
    transcribeMessages:async()=>({messages:[{}],audioSkipped:1})
  }),/não pôde/)
})
