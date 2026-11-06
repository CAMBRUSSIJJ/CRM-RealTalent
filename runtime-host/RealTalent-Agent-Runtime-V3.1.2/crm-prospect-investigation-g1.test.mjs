import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeProspectForInvestigation,searchCompanySourcesG1,investigateProspectG1,
} from './crm-prospect-investigation-g1.mjs'

const analysis={summary:'Segundo as páginas públicas efetivamente lidas, o estabelecimento oferece serviços de atendimento.',
  hypotheses:['Investigar treinamento e gestão de equipe, sem pressupor demanda.'],
  questions:['Como vocês organizam o treinamento da equipe?'],
  approach:'Conversa consultiva para verificar necessidades.',caveats:['Não há intenção de compra confirmada.']}
const qwen=async(_url,opts)=>({ok:true,json:async()=>({
  message:{content:JSON.stringify(analysis)},
})})

test('private data is stripped from model input and private website is rejected',()=>{
  const item=sanitizeProspectForInvestigation({
    company:'Jardins Ltda',city:'Rio Grande',description:'Falar com contato@jardins.com ou 51999999999',
    website:'http://localhost:8791/private',
  })
  assert.equal(item.website,null)
  assert.ok(!item.description.includes('contato@jardins.com'))
  assert.ok(!item.description.includes('51999999999'))
})

test('source discovery sends only company and city to local Garimpo',async()=>{
  let payload
  const sources=await searchCompanySourcesG1({
    company:'Barbearia Aurora',city:'Rio Grande, RS',description:'informação privada',
  },{
    searxSearch:async()=>[],
    fetcher:async(_url,init)=>{
      payload=JSON.parse(init.body)
      return {ok:true,json:async()=>({ok:true,results:[
        {url:'https://aurora.example.org/noticia',title:'Barbearia Aurora',snippet:'Abertura de nova unidade.'},
      ]})}
    },
  })
  assert.deepEqual(payload,{company:'Barbearia Aurora',city:'Rio Grande, RS'})
  assert.equal(sources.length,1)
  assert.equal(sources[0].origin,'garimpo')
})

test('investigation without a registered website searches and reads a matching public source',async()=>{
  let prompt=''
  const result=await investigateProspectG1({
    company:'Barbearia Aurora',city:'Rio Grande, RS',description:'',
  },{
    searcher:async()=>[{
      title:'Barbearia Aurora inaugura nova unidade em Rio Grande',
      url:'https://noticias.example.org/aurora',snippet:'Barbearia Aurora anuncia expansão em Rio Grande.',
    }],
    readPage:async(url)=>({ok:true,url,title:'Barbearia Aurora inaugura nova unidade',
      text:'A Barbearia Aurora anunciou nova unidade em Rio Grande, Rio Grande do Sul. '.repeat(6)}),
    fetcher:async(_url,opts)=>{
      prompt=JSON.parse(opts.body).messages[1].content
      return qwen(_url,opts)
    },
  })
  assert.equal(result.pageRead,true)
  assert.equal(result.quality,'page_reviewed')
  assert.equal(result.sources[0].identity,'compatible')
  assert.equal(result.sources[0].reading,'page')
  assert.ok(result.sources[0].excerpt.includes('nova unidade'))
  assert.ok(prompt.includes('pagina_publica_lida'))
  assert.equal(result.readUrl,'https://noticias.example.org/aurora')
})

test('only literal cited events from a read source become pending G4 signals',async()=>{
  const url='https://noticias.example.org/aurora'
  const quote='A Barbearia Aurora anunciou nova unidade em Rio Grande'
  const event={sourceUrl:url,category:'transition',event:'Abertura de unidade',
    quote,dateQuote:'',hypothesis:'Possível reforço da equipe.',
    rationale:'Expansão citada exige investigação.',suggestedQuestion:'Planejam ampliar o quadro?'}
  const result=await investigateProspectG1({company:'Barbearia Aurora',city:'Rio Grande'},{
    searcher:async()=>[{title:'Barbearia Aurora',url,snippet:'Expansão em Rio Grande'}],
    readPage:async()=>({ok:true,url,title:'Barbearia Aurora em Rio Grande',text:
      (quote+' com inauguração planejada. ').repeat(8)}),
    fetcher:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({
      ...analysis,events:[event,{...event,quote:'Citação inventada sobre compra imediata',
        event:'Compra já confirmada'}],
    })}})}),
  })
  assert.equal(result.candidateEvents.length,1)
  assert.equal(result.candidateEvents[0].reviewStatus,undefined)
  assert.equal(result.candidateEvents[0].status,'needs_review')
  assert.equal(result.candidateEvents[0].sourceCheck,'not_verified')
  assert.equal(result.candidateEvents[0].quote,quote)
})

test('unrelated search results must not enter the analysis or become source evidence',async()=>{
  let read=0
  let model=0
  const result=await investigateProspectG1({
    company:'Barbearia Aurora',city:'Rio Grande',
  },{
    searcher:async()=>[{title:'Empresa Atlântico em outra cidade',
      url:'https://outra.example.org',snippet:'Notícia de uma terceira empresa'}],
    readPage:async()=>{read++;return {ok:true,text:'fake'}} ,
    fetcher:async()=>{model++;return qwen()},
  })
  assert.equal(read,0)
  assert.equal(model,0)
  assert.equal(result.pageRead,false)
  assert.equal(result.quality,'insufficient')
  assert.equal(result.sources.length,0)
})

test('unreadable or mismatching registered website never becomes verified evidence',async()=>{
  const result=await investigateProspectG1({
    company:'Barbearia Aurora',city:'Rio Grande',website:'https://aurora.example.org',
  },{
    searcher:async()=>[],
    readPage:async(url)=>({ok:true,url,title:'Página de uma empresa diferente',
      text:'Outro estabelecimento em cidade desconhecida oferece produtos variados. '.repeat(8)}),
  })
  assert.equal(result.pageRead,false)
  assert.equal(result.sources[0].identity,'unconfirmed')
  assert.equal(result.sources[0].excerpt,'')
})

test('inaccessible public research is clearly reported, not invented as a commercial analysis',async()=>{
  const result=await investigateProspectG1({
    company:'Barbearia Aurora',city:'Rio Grande',
  },{
    searcher:async()=>{throw Error('unavailable')},
  })
  assert.equal(result.searchStatus,'unavailable')
  assert.equal(result.pageRead,false)
  assert.equal(result.quality,'insufficient')
  assert.equal(result.questions.length,0)
  assert.ok(result.caveats.some(x=>x.includes('não respondeu')))
})

test('description-only analysis is explicitly marked as not externally confirmed',async()=>{
  const result=await investigateProspectG1({
    company:'Barbearia Aurora',city:'Rio Grande',description:'Serviços masculinos.',
  },{
    searcher:async()=>[],
    fetcher:qwen,
  })
  assert.equal(result.pageRead,false)
  assert.equal(result.quality,'origin_only')
  assert.ok(result.caveats.some(x=>x.includes('Nenhuma página pública compatível')))
})

test('private URLs from public search results are blocked before reading',async()=>{
  let read=0
  const result=await investigateProspectG1({
    company:'Barbearia Aurora',city:'Rio Grande',
  },{
    searcher:async()=>[{title:'Barbearia Aurora',url:'https://127.0.0.1/private',
      snippet:'Rio Grande'}],
    readPage:async()=>{read++;return {ok:true}},
  })
  assert.equal(read,0)
  assert.equal(result.sources.length,0)
})

test('invalid company is rejected',async()=>{
  assert.equal((await investigateProspectG1({company:''})).ok,false)
})
