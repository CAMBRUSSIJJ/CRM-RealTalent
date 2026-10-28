import test from 'node:test'
import assert from 'node:assert/strict'
import {isPublicIpV60,validResearchUrlV60,extractReadableV60,readPublicPageV60} from './crm-web-reader-v60.mjs'
import {buildResearchQueriesV60,rankSourcesV60,deepResearchV60} from './crm-deep-research-v60.mjs'

test('SSRF: reject private, localhost, alternate ports and downgrade redirects',async()=>{
  for(const url of ['http://example.com','https://127.0.0.1/admin','https://localhost/x',
      'https://service.internal/','https://example.com:8443','https://user:pass@example.org']) {
    assert.equal(validResearchUrlV60(url),null,url)
  }
  for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.2','192.168.1.2','169.254.169.254','::1','fc00::1','::ffff:127.0.0.1'])
    assert.equal(isPublicIpV60(ip),false,ip)
  assert.equal(isPublicIpV60('8.8.8.8'),true)
  assert.ok(validResearchUrlV60('https://blog.growthmachine.com.br/roteiro'))
  const blocked=await readPublicPageV60('https://example.com',{
    requestPage:async()=>({redirect:'http://192.168.0.1/admin'})
  })
  assert.equal(blocked.error,'unsafe_redirect')
})
test('read actual main text rather than headers/cookie UI',async()=>{
  const result=extractReadableV60('<html><head><title>Venda consultiva</title><style>junk</style></head><body><nav>Menu</nav><article><h1>Metodologia</h1><p>O profissional deve explorar o problema, ouvir o cliente e verificar necessidades antes de propor alternativas.</p><p>Depois, deve confirmar um próximo passo concreto para avançar.</p></article><footer>Rodape</footer></body></html>')
  assert.equal(result.title,'Venda consultiva')
  assert.ok(result.text.includes('ouvir o cliente'))
  assert.ok(!result.text.includes('Menu'))
})
test('search prioritizes relevant nonvideo sources and deduplicates URLs',()=>{
  const list=rankSourcesV60('Thiago Reis metodologia vendas',[
    {title:'YouTube generic',url:'https://youtube.com/watch?v=1',excerpt:'Não há conteúdo pertinente'},
    {title:'Thiago Reis: metodologia de vendas',url:'https://blog.growthmachine.com.br/script',excerpt:'Roteiro, diagnóstico de cliente'},
    {title:'Thiago Reis: metodologia de vendas',url:'https://blog.growthmachine.com.br/script',excerpt:'duplicado'},
  ])
  assert.equal(list[0].url,'https://blog.growthmachine.com.br/script')
  assert.equal(list.length,2)
  assert.equal(buildResearchQueriesV60('Thiago Reis scripts').length,2)
})
test('agent researches pages, links citations and adapts existing script',async()=>{
  let searchCalls=0,readCalls=0,asked=null
  const out=await deepResearchV60({question:'Pesquise Thiago Reis e adapte o roteiro de jardinagem',
    document:'Roteiro anterior de jardim',history:'Usuário: eu vendo jardinagem',model:'qwen',ollamaUrl:'http://localhost:11434',
    searcher:async()=>{searchCalls++;return [{title:'Thiago Reis metodologia de vendas',url:'https://blog.growthmachine.com.br/script',excerpt:'Diagnóstico de clientes'}]},
    reader:async url=>{readCalls++;return {ok:true,url,text:'A recomendação da página é conhecer os clientes antes de fazer uma proposta de valor.'}},
    fetcher:async (_url,options)=>{asked=JSON.parse(options.body);return {ok:true,json:async()=>({
      message:{content:JSON.stringify({answer:'Uma abordagem consultiva é recomendável [1].',adaptedBody:'Roteiro original para jardinagem',quality:'sufficient'})}
    })}},
  })
  assert.equal(searchCalls,2)
  assert.equal(readCalls,1)
  assert.equal(out.evidence.readPages,1)
  assert.match(out.answer,/\[1\]/)
  assert.equal(out.adaptedBody,'Roteiro original para jardinagem')
  assert.equal(asked.messages[1].content.includes('Roteiro anterior'),true)
})
test('failure of model does not fabricate page reading or conclusions',async()=>{
  const out=await deepResearchV60({question:'pesquise metodologia de serviços',model:'qwen',ollamaUrl:'http://localhost:11434',
    searcher:async()=>[{title:'Guia',url:'https://example.org/guia',excerpt:'Uma frase do resumo'}],
    reader:async()=>({ok:false,error:'not_html'}),fetcher:async()=>{throw new Error('offline')}})
  assert.equal(out.ok,true)
  assert.equal(out.quality,'insufficient')
  assert.equal(out.sources[0].reading,'snippet')
  assert.match(out.answer,/não consegui ler páginas completas/)
})
