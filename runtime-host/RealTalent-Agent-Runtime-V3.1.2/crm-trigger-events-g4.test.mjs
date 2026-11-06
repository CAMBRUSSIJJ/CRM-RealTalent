import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeTriggerRequest,validateTriggerModelResponse,classifyTriggerEventsG4} from './crm-trigger-events-g4.mjs'

const excerpt='Em 3 de novembro de 2026, a Escola Aurora anunciou a nomeação de uma nova diretora para liderar seu plano de expansão regional.'
const source={company:'Escola Aurora',city:'Rio Grande',sector:'Educação',
  sourceUrl:'https://escola-aurora.example.org/noticias/diretoria',excerpt}
const item={category:'transition',event:'Nomeação de nova diretora',
  quote:'a Escola Aurora anunciou a nomeação de uma nova diretora',
  dateQuote:'3 de novembro de 2026',
  hypothesis:'Novas prioridades de desenvolvimento da equipe podem surgir.',
  rationale:'Mudanças na direção podem alterar metas e necessidades.',
  suggestedQuestion:'A nova gestão estabeleceu prioridades de capacitação?'}
test('rejeita material sem origem HTTPS e fontes internas',()=>{
  assert.equal(normalizeTriggerRequest({...source,sourceUrl:'http://example.com/noticia'}),null)
  assert.equal(normalizeTriggerRequest({...source,sourceUrl:'https://127.0.0.1/admin'}),null)
  assert.equal(normalizeTriggerRequest({...source,excerpt:'Venda de cursos'}),null)
  assert.ok(normalizeTriggerRequest(source))
})
test('somente citações literais e datas presentes geram candidatos',()=>{
  const input=normalizeTriggerRequest(source)
  const result=validateTriggerModelResponse({events:[item]},input)
  assert.equal(result.length,1)
  assert.equal(result[0].status,'needs_review')
  assert.equal(result[0].sourceCheck,'not_verified')
  assert.ok(result[0].investigationPriority<=65)
  assert.equal(validateTriggerModelResponse({events:[{...item,quote:'A empresa demitiu quarenta colaboradores'}]},input).length,0)
  assert.equal(validateTriggerModelResponse({events:[{...item,dateQuote:'janeiro de 2020'}]},input).length,0)
})
test('faz chamada ao Qwen local em modo estruturado, sem gravar ou consultar CRM',async()=>{
  let req
  const result=await classifyTriggerEventsG4(source,{
    ollamaUrl:'http://127.0.0.1:11434',model:'qwen3:8b',
    fetcher:async(url,options)=>{
      req={url,body:JSON.parse(options.body)}
      return {ok:true,json:async()=>({message:{content:JSON.stringify({events:[item]})}})}
    }
  })
  assert.equal(req.url,'http://127.0.0.1:11434/api/chat')
  assert.equal(req.body.model,'qwen3:8b')
  assert.equal(req.body.think,false)
  assert.deepEqual(Object.keys(req.body).sort(),['format','messages','model','options','stream','think'])
  assert.equal(result.events.length,1)
  assert.equal(result.events[0].sourceCheck,'not_verified')
})
test('nenhum sinal é fabricado quando modelo retorna lista vazia ou hipótese sem citação',async()=>{
  const output=await classifyTriggerEventsG4(source,{
    fetcher:async()=>({ok:true,json:async()=>({message:{content:'{"events":[]}'}})})
  })
  assert.equal(output.ok,true);assert.deepEqual(output.events,[])
  const bad=await classifyTriggerEventsG4(source,{
    fetcher:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({events:[{...item,quote:'Coisa que não está na fonte'}]})}})})
  })
  assert.deepEqual(bad.events,[])
})
test('bloqueia modelo remoto e erros Ollama sem fallback hipotético',async()=>{
  const remote=await classifyTriggerEventsG4(source,{ollamaUrl:'https://api.remoto.com'})
  assert.equal(remote.error,'local_model_required')
  const fail=await classifyTriggerEventsG4(source,{fetcher:async()=>{throw Error('offline')}})
  assert.equal(fail.error,'model_unavailable')
})
