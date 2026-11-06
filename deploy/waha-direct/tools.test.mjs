import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLocalTools, sanitizeMediaSrc, analyzeConversation } from './tools.mjs'

test('labels, favorites and quick replies persist locally with strict validation',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'realtalent-waha-tools-'))
  try{
    const a=createLocalTools(dir)
    assert.deepEqual(a.read(),{labels:{},favorites:[],quickReplies:[]})
    const chat='12345678901@lid'
    a.update({type:'labels',chatId:chat,labels:['Em diagnóstico','Proposta enviada','Em diagnóstico']})
    a.update({type:'favorite',chatId:chat,enabled:true})
    a.update({type:'reply',title:'Saudação',text:'Olá, tudo bem?'})
    const b=createLocalTools(dir)
    assert.deepEqual(b.read().labels[chat],['Em diagnóstico','Proposta enviada'])
    assert.deepEqual(b.read().favorites,[chat])
    assert.equal(b.read().quickReplies.length,1)
    const reply=b.read().quickReplies[0]
    b.update({type:'deleteReply',id:reply.id})
    assert.equal(createLocalTools(dir).read().quickReplies.length,0)
    b.update({type:'favorite',chatId:chat,enabled:false})
    assert.deepEqual(b.read().favorites,[])
    assert.throws(()=>b.update({type:'favorite',chatId:'../secret',enabled:true}),/inválida/i)
    assert.throws(()=>b.update({type:'labels',chatId:chat,labels:Array(9).fill('A')}),/inválida/i)
    assert.throws(()=>b.update({type:'reply',title:'x',text:' ' }),/inválida/i)
    assert.equal(fs.statSync(path.join(dir,'communication-tools.json')).mode&0o777,0o600)
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
})

test('media proxy only allows WAHA local file paths',()=>{
  assert.equal(sanitizeMediaSrc('/files/a-b.jpeg'),'/files/a-b.jpeg')
  assert.equal(sanitizeMediaSrc('http://127.0.0.1:4385/api/files/photo.png'),'/api/files/photo.png')
  assert.equal(sanitizeMediaSrc('http://localhost:4385/files/audio.ogg?token=abc'),'/files/audio.ogg?token=abc')
  assert.equal(sanitizeMediaSrc('https://example.com/files/private.png'),null)
  assert.equal(sanitizeMediaSrc('http://127.0.0.1:8181/files/a.png'),null)
  assert.equal(sanitizeMediaSrc('/api/other/messages'),null)
  assert.equal(sanitizeMediaSrc('/files/%2e%2e/secret'),null)
})

test('AI rejects invalid requests before Ollama or any network call',async()=>{
  await assert.rejects(analyzeConversation({task:'send',messages:[]}),/Solicitação inválida/)
  await assert.rejects(analyzeConversation({task:'summary',messages:[]}),/Sem mensagens de texto/)
  await assert.rejects(analyzeConversation({task:'suggest',messages:[{body:' ',fromMe:false}]}),/Sem mensagens de texto/)
})
