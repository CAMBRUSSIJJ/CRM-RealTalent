import test from 'node:test'
import assert from 'node:assert/strict'
import {sanitizeProspectForInvestigation,investigateProspectG1} from './crm-prospect-investigation-g1.mjs'
test('public profile strips emails and telephone and rejects local websites',()=>{
  const item=sanitizeProspectForInvestigation({company:'Jardins Ltda',city:'Rio Grande',
    description:'Chame em contato@jardins.com ou 51999999999',
    website:'http://localhost:8791/private'})
  assert.equal(item.website,null)
  assert.ok(!item.description.includes('contato@jardins.com'))
  assert.ok(!item.description.includes('51999999999'))
})
test('private network link is never sent to page reader',async()=>{
  let read=0
  const result=await investigateProspectG1({
    company:'Jardins Ltda',city:'Rio Grande',website:'https://192.168.1.1/private'
  },{readPage:async()=>{read++;return {ok:true,text:'fake'}}})
  assert.equal(read,0)
  assert.equal(result.pageRead,false)
  assert.equal(result.quality,'insufficient')
})
test('website reading is identified independently of invented model assertions',async()=>{
  let prompt=''
  const result=await investigateProspectG1({company:'Paisagismo ABC',city:'Rio Grande',
    description:'Paisagismo público',website:'https://example.org/page'},{
    readPage:async(url)=>({ok:true,url,title:'Página da empresa',
      text:'A empresa oferece serviços de manutenção, paisagismo e consultoria de jardins. '.repeat(5)}),
    fetcher:async(_url,opts)=>{prompt=JSON.parse(opts.body).messages[1].content
      return {ok:true,json:async()=>({message:{content:JSON.stringify({
        summary:'Segundo a página pública, a empresa anuncia serviços de paisagismo e manutenção.',
        hypotheses:['Possível aderência a contratos recorrentes; validar'],
        questions:['Como trabalham com condomínios?'],approach:'Iniciar pelo diagnóstico.',
        caveats:['Não há evidência de intenção de compra.']
      })}})}
    }
  })
  assert.equal(result.ok,true)
  assert.equal(result.pageRead,true)
  assert.equal(result.quality,'page_reviewed')
  assert.ok(prompt.includes('website_lido'))
  assert.equal(result.readUrl,'https://example.org/page')
})
test('website failure never becomes a false claim of reading',async()=>{
  const result=await investigateProspectG1({
    company:'Jardins Ltda',city:'Rio Grande',description:'Vende jardinagem',
    website:'https://example.org'
  },{
    readPage:async()=>({ok:false,error:'unavailable'}),
    fetcher:async()=>{throw new Error('ollama_offline')}
  })
  assert.equal(result.pageRead,false)
  assert.equal(result.quality,'insufficient')
  assert.ok(result.summary.includes('Não consegui'))
})
test('invalid company is rejected',async()=>{
  assert.equal((await investigateProspectG1({company:''})).ok,false)
})
