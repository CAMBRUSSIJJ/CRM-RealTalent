import test from 'node:test'
import assert from 'node:assert/strict'
import {validateLocalScreenshotG46,analyzeLocalScreenshotG46} from './crm-social-vision-g46.mjs'

const png=Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  Buffer.alloc(180,1),
]).toString('base64')
const payload={company:'Salento Barbearia',question:'Analise o Instagram mostrado',mime:'image/png',imageBase64:png}

test('requires a genuine image MIME/header match and bounded payload',()=>{
  assert.equal(validateLocalScreenshotG46(payload).ok,true)
  assert.equal(validateLocalScreenshotG46({...payload,mime:'image/jpeg'}).error,'unsupported_image')
  assert.equal(validateLocalScreenshotG46({...payload,imageBase64:'%%%'}).error,'invalid_image')
  assert.equal(validateLocalScreenshotG46({...payload,imageBase64:Buffer.alloc(2_200_000).toString('base64')}).ok,false)
})
test('never downloads a vision model or calls paid API when Ollama lacks it',async()=>{
  let count=0
  const result=await analyzeLocalScreenshotG46(payload,{fetcher:async url=>{
    count++
    assert.match(url,/127\.0\.0\.1:11434\/api\/tags/)
    return {ok:true,json:async()=>({models:[{name:'qwen3:8b'}]})}
  }})
  assert.equal(result.error,'vision_model_missing')
  assert.equal(result.model,'qwen2.5vl:3b')
  assert.equal(count,1)
})
test('local Ollama sees user-supplied screenshot only, with no automatic CRM writes',async()=>{
  let chatBody=null
  const response=await analyzeLocalScreenshotG46(payload,{
    fetcher:async (url,init)=>{
      if(url.endsWith('/api/tags'))return {ok:true,json:async()=>({models:[{name:'qwen2.5vl:3b'}]})}
      assert.match(url,/127\.0\.0\.1:11434\/api\/chat/)
      chatBody=JSON.parse(init.body)
      return {ok:true,json:async()=>({message:{content:JSON.stringify({
        answer:'Na captura consta o serviço de prótese capilar, mas não há necessidade comercial confirmada.',
        visibleObservations:['Serviço de prótese capilar aparece no texto visível.'],
        commercialHypotheses:['Verificar se há necessidade de capacitação da equipe.'],
        limitations:['Não é possível confirmar a data da captura.'],
      })}})}
    },
  })
  assert.equal(response.ok,true)
  assert.equal(response.kind,'screenshot')
  assert.equal(response.stored,false)
  assert.equal(response.evidence,'user_supplied_image')
  assert.equal(chatBody.messages[1].images[0],png)
  assert.equal(chatBody.model,'qwen2.5vl:3b')
  assert.ok(!JSON.stringify(chatBody).includes('instagram_access_token'))
  assert.equal(response.commercialHypotheses.length,1)
})
test('invalid payload is rejected without calling Ollama',async()=>{
  let calls=0
  const result=await analyzeLocalScreenshotG46({company:'Salento Barbearia',mime:'image/png',imageBase64:'abc'},
    {fetcher:async()=>{calls++;throw Error('Should not fetch')}})
  assert.equal(result.ok,false)
  assert.equal(calls,0)
})
