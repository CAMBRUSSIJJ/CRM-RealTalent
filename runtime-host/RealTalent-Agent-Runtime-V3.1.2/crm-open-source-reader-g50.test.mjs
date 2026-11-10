import test from 'node:test'
import assert from 'node:assert/strict'
import {readPublicPageOpenSourceG50} from './crm-open-source-reader-g50.mjs'

const URL='https://escola-horizonte.org.br/novidades'
const QUOTE='A Escola Horizonte abriu uma nova unidade de ensino na zona norte da cidade.'
const HTML='<html><head><title>Escola Horizonte</title></head><body><p>'+
  QUOTE+' Nossa instituição oferece cursos presenciais de educação básica, projetos de aprendizagem '+
  'e atividades de orientação para estudantes e famílias desde o início do ano letivo. '+
  'Esta página reúne as informações publicadas oficialmente pela organização.</p></body></html>'

test('disabled: existing page reader is unchanged',async()=>{
  let fetches=0
  const result=await readPublicPageOpenSourceG50(URL,{
    enabled:false,fallback:async()=>{fetches++;return {ok:true,text:'legacy'}}
  })
  assert.equal(fetches,1)
  assert.equal(result.text,'legacy')
})
test('enabled: reads pinned HTML, uses offline worker and validates exact quotes',async()=>{
  let called=0
  const result=await readPublicPageOpenSourceG50(URL,{
    enabled:true,requestPage:async()=>({html:HTML}),
    fallback:async()=>{throw Error('unexpected fallback')},
    worker:async(data)=>{
      called++
      assert.equal(data.html,HTML)
      return {ok:true,text:QUOTE+' '.repeat(2)+'A escola divulga projetos em seu portal institucional. '.repeat(4),
        facts:[{fact:'Nova unidade',quote:QUOTE},{fact:'Receita confirmada',quote:'Lucro anual de 999 milhões'}]}
    },
  })
  assert.equal(result.ok,true)
  assert.equal(result.engine,'crawl4ai')
  assert.equal(result.extractedFacts.length,1)
  assert.equal(result.extractedFacts[0].quote,QUOTE)
  assert.equal(called,1)
})
test('unsafe redirect is not passed to local processor',async()=>{
  let calls=0
  const result=await readPublicPageOpenSourceG50(URL,{
    enabled:true,requestPage:async()=>({redirect:'http://127.0.0.1/admin'}),
    fallback:async()=>({ok:false,error:'legacy_rejected'}),
    worker:async()=>{calls++;return {ok:true,text:'unsafe'}}
  })
  assert.equal(calls,0)
  assert.equal(result.error,'legacy_rejected')
})
test('missing worker library preserves original extracted text',async()=>{
  const result=await readPublicPageOpenSourceG50(URL,{
    enabled:true,requestPage:async()=>({html:HTML}),
    worker:async()=>{throw Error('python_not_installed')},
    fallback:async()=>{throw Error('unexpected fallback')},
  })
  assert.equal(result.ok,true)
  assert.equal(result.engine,'legacy_fallback')
  assert.match(result.text,/Escola Horizonte abriu/)
})
test('only one expensive worker runs concurrently',async()=>{
  let release
  const waiting=new Promise(resolve=>{release=resolve})
  let began
  const begun=new Promise(resolve=>{began=resolve})
  const first=readPublicPageOpenSourceG50(URL,{
    enabled:true,requestPage:async()=>({html:HTML}),
    worker:async()=>{began();await waiting;return {ok:false}},
    fallback:async()=>({ok:true,engine:'legacy'}),
  })
  await begun
  const second=await readPublicPageOpenSourceG50(URL,{
    enabled:true,fallback:async()=>({ok:true,engine:'legacy'}),
    worker:async()=>{throw Error('must not run')},
  })
  assert.equal(second.engine,'legacy')
  release()
  assert.equal((await first).engine,'legacy_fallback')
})
