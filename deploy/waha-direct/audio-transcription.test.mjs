import test from 'node:test'
import assert from 'node:assert/strict'
import { createAudioTranscriber, downloadWahaVoice, isReceivedAudio } from './audio-transcription.mjs'
import { sanitizeMediaSrc } from './tools.mjs'
import { analyzeWahaConversation, normalizeConversationHistory } from './conversation-intelligence.mjs'

const chatId='12345678901@lid'
const voice=(id,timestamp,url='http://localhost:4385/api/files/false_123@c.us_'+id+'.ogg')=>({
  id,fromMe:false,timestamp,body:'',hasMedia:true,media:{mimetype:'audio/ogg; codecs=opus',url},
})
test('WAHA audio URL accepts @ but blocks outbound hosts and traversal',()=>{
  assert.equal(sanitizeMediaSrc('http://localhost:4385/api/files/false_123@c.us_abc.ogg'),'/api/files/false_123@c.us_abc.ogg')
  assert.equal(sanitizeMediaSrc('http://malicious.invalid/api/files/voice.ogg'),null)
  assert.equal(sanitizeMediaSrc('http://127.0.0.1:4385/api/files/../secret'),null)
  assert.equal(sanitizeMediaSrc('http://127.0.0.1:4385/api/files/%2e%2e/secret'),null)
})
test('transcription only includes received audio; message evidence preserves chronology',async()=>{
  let calls=0
  const transcriber=createAudioTranscriber({apiKey:'test',download:async()=>Buffer.from('test'),
    transcribe:async()=>{calls++;return 'Precisamos de uma solução até sexta-feira.'}})
  const received=voice('a1',200)
  const sent={...voice('a2',220),fromMe:true}
  const plain={id:'text',timestamp:100,body:'Bom dia',fromMe:false}
  assert.equal(isReceivedAudio(sent),false)
  const result=await transcriber([sent,received,plain],chatId)
  assert.equal(result.audioDetected,1)
  assert.equal(result.audioTranscribed,1)
  assert.equal(result.audioSkipped,0)
  const history=normalizeConversationHistory(result.messages)
  assert.deepEqual(history.map(x=>x.source),['text','audio'])
  assert.deepEqual(history.map(x=>x.id),['M01','M02'])
  assert.match(history[1].text,/sexta-feira/)
  assert.equal(calls,1)
  await transcriber([sent,received,plain],chatId)
  assert.equal(calls,1,'in-memory TTL cache avoids re-transcribing voice note')
})
test('bounded audio selection and missing media are reported, never invented',async()=>{
  let calls=0
  const transcriber=createAudioTranscriber({apiKey:'test',download:async()=>Buffer.from('voice'),
    transcribe:async()=>{calls++;return 'Cliente quer desconto'}})
  const messages=[voice('v1',1),voice('v2',2),voice('v3',3),voice('v4',4),voice('v5',5,'')]
  messages[4].media.url=''
  const result=await transcriber(messages,chatId)
  assert.equal(result.audioDetected,5)
  assert.equal(result.audioTranscribed,2)
  assert.equal(result.audioSkipped,3)
  assert.equal(calls,2)
  assert.equal(result.messages[4]._localTranscript,undefined)
})
test('unsupported media does not enter prompt, downloaded audio stays on loopback',async()=>{
  let reached=false
  await assert.rejects(downloadWahaVoice('https://example.com/api/files/voice.ogg','secret',{
    fetchImpl:async()=>{reached=true}
  }),/inválido/)
  assert.equal(reached,false)
  let target='',seenKey=''
  const bytes=await downloadWahaVoice('http://localhost:4385/api/files/a@c.us.ogg','secret',{
    fetchImpl:async (url,options)=>{
      target=url;seenKey=options.headers['X-Api-Key']
      return new Response(Buffer.from('audio bytes'),{headers:{'Content-Type':'audio/ogg'}})
    }
  })
  assert.equal(bytes.toString(),'audio bytes')
  assert.equal(target,'http://127.0.0.1:4385/api/files/a@c.us.ogg')
  assert.equal(seenKey,'secret')
})
test('commercial intelligence cites voice transcripts, identifies partial failures and never sends',async()=>{
  const transcriber=createAudioTranscriber({apiKey:'test',download:async()=>Buffer.from('voice'),
    transcribe:async()=> 'Nossa escola precisa de treinamento para professores.'})
  let prompt=''
  const result=await analyzeWahaConversation({chatId,task:'commercial'},{
    readMessages:async()=>[
      voice('v2',300,''),
      voice('v1',200),
      {id:'text',timestamp:100,fromMe:true,body:'Olá, como posso ajudar?'}
    ],
    transcribeMessages:transcriber,
    models:async()=>['qwen3:8b'],
    generate:async request=>{
      prompt=request.prompt
      return JSON.stringify({
        summary:'Cliente quer formação',confidence:'média',limitations:'Histórico curto',
        needs:[{description:'Treinamento de professores',evidenceIds:['M02']}],
        objections:[],opportunities:[],nextSteps:[],
      })
    },
  })
  assert.match(prompt,/ÁUDIO TRANSCRITO LOCALMENTE/)
  assert.match(prompt,/Nossa escola/)
  assert.equal(result.audioTranscribed,1)
  assert.equal(result.audioSkipped,1)
  assert.equal(result.textMessagesRead,1)
  assert.equal(result.messagesRead,2)
  assert.equal(result.analysis.needs[0].evidence[0].source,'audio')
  assert.match(result.analysis.limitations,/não transcrito/)
  assert.equal(result.audioTranscripts.length,1)
  assert.equal(result.sent,false)
})
