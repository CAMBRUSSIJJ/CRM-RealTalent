import test from 'node:test'
import assert from 'node:assert/strict'
import {searchSourcesV56,researchQuestionV56} from './crm-research-v56.mjs'
test('query externo usa apenas texto explícito, nunca dados do CRM',async()=>{
  let q=''
  const sources=await searchSourcesV56('pesquise scripts do Thiago Reis; fale para 11987654321 e email@meucrm.com',{
    searcher:async query=>{q=query;return [{title:'Growth Machine',url:'https://growthmachine.com.br/script-de-vendas/',excerpt:'guia'}]},
  })
  assert.equal(sources.length,1)
  assert.match(q,/Thiago Reis/)
  assert.doesNotMatch(q,/11987654321|email@/)
})
test('resultado retorna fontes reais e adaptação original',async()=>{
  const response=await researchQuestionV56({
    question:'Pesquise roteiros de prospecção do Thiago Reis',document:'roteiro antigo',
    model:'model-test',ollamaUrl:'http://127.0.0.1:11434',
    searcher:async()=>[{title:'Exemplo',url:'https://example.org/article',excerpt:'Trecho de roteiro consultivo'}],
    fetcher:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({
      answer:'A fonte [1] mostra um exemplo de diagnóstico.',adaptedBody:'Roteiro original de vendas consultivas',
    })}})}),
  })
  assert.equal(response.ok,true)
  assert.equal(response.sources[0].url,'https://example.org/article')
  assert.match(response.adaptedBody,/original/)
})
test('sem fontes não afirma pesquisa concluída',async()=>{
  const result=await researchQuestionV56({question:'pesquise autores',model:'qwen',ollamaUrl:'http://localhost:11434',searcher:async()=>[]})
  assert.equal(result.ok,false)
  assert.equal(result.error,'no_search_results')
})
