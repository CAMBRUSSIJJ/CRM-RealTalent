import test from 'node:test'
import assert from 'node:assert/strict'
import {publicTopicSearchQuery,safePublicSource,searchResearchSources,buildResearchedScript} from './crm-script-research-v52.mjs'

test('busca não contém e-mail, URL ou telefones de CRM',()=>{
 const query=publicTopicSearchQuery('jardineiros autonomos 11999998888 email@empresa.com https://example.com')
 assert.ok(query.includes('jardineiros'))
 assert.ok(!query.includes('@'))
 assert.ok(!query.includes('11999998888'))
 assert.ok(!query.includes('example.com'))
})
test('filtra links privados e protocolos inseguros',()=>{
 assert.equal(safePublicSource({title:'test',url:'http://127.0.0.1/admin'}),null)
 assert.equal(safePublicSource({title:'test',url:'javascript:alert(1)'}),null)
 assert.ok(safePublicSource({title:'Google',url:'https://support.google.com/business'}))
})
test('sem provedor externo não simula pesquisa na internet',async()=>{
 assert.deepEqual(await searchResearchSources('jardineiros',{endpoint:''}),[])
})
test('gerador recebe evidências e retorna recomendação + roteiro sem executar ferramentas',async()=>{
 const fetcher=async(_url,init)=>({
   ok:true,
   json:async()=>({message:{content:JSON.stringify({body:'Roteiro específico '.repeat(20),strategy:{
     audience:'jardineiros autônomos',approach:'diagnóstico',rationale:'vínculo com o serviço oferecido',
     alternatives:['recomendação','demonstração'],assumptions:['oferta declarada pelo usuário'],
   }})}}),
 })
 const result=await buildResearchedScript({request:'roteiro para jardineiros',draft:'rascunho',topic:'jardineiros',model:'test',ollamaUrl:'http://localhost:11434',fetcher,searcher:async()=>[]})
 assert.equal(result?.researchStatus,'contextual')
 assert.ok(result?.strategy?.approach)
 assert.deepEqual(result?.sources,[])
})
