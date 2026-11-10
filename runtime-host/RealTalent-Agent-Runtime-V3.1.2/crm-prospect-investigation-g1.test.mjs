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
  assert.equal(result.quality,'insufficient')
  assert.equal(result.modelStatus,'skipped_no_public_evidence')
  assert.deepEqual(result.hypotheses,[])
  assert.deepEqual(result.questions,[])
  assert.deepEqual(result.candidateEvents,[])
  assert.ok(result.caveats.some(x=>x.includes('site ou perfil público oficial')))
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


test('G5: full official company name is accepted without trailing acronym',async()=>{
  const url='https://www.furg.br/en/'
  const result=await investigateProspectG1({
    company:'Universidade Federal do Rio Grande FURG',city:'Rio Grande, RS',
    website:'https://www.furg.br'
  },{
    searcher:async()=>[],
    readPage:async()=>({ok:true,url,engine:'crawl4ai',title:'Universidade Federal do Rio Grande',
      text:'A Universidade Federal do Rio Grande oferece graduação e programas de pesquisa. '.repeat(8)}),
    fetcher:qwen
  })
  assert.equal(result.pageRead,true)
  assert.equal(result.quality,'page_reviewed')
  assert.equal(result.sources[0].identity,'compatible')
  assert.equal(result.sources[0].engine,'crawl4ai')
})

test('G5: unrelated university cannot pass trailing acronym fallback',async()=>{
  const result=await investigateProspectG1({
    company:'Universidade Federal do Rio Grande FURG',city:'Rio Grande',
    website:'https://www.furg.br'
  },{
    searcher:async()=>[],
    readPage:async()=>({ok:true,title:'Universidade Federal do Paraná',
      text:'A Universidade Federal do Paraná mantém unidades de ensino na região sul. '.repeat(8)})
  })
  assert.equal(result.pageRead,false)
  assert.equal(result.sources[0].identity,'unconfirmed')
})

test('G5: when public page fails, preserve useful read error in source diagnostics',async()=>{
  const result=await investigateProspectG1({
    company:'Universidade Federal do Rio Grande FURG',city:'Rio Grande',
    website:'https://www.furg.br'
  },{
    searcher:async()=>[],
    readPage:async()=>({ok:false,error:'page_too_large'})
  })
  assert.equal(result.pageRead,false)
  assert.equal(result.sources[0].readError,'page_too_large')
  assert.equal(result.sources[0].reading,'snippet')
  assert.equal(result.sources[0].identity,'unconfirmed')
})


test('G5: model receives at most two independent sites and short excerpts',async()=>{
  let evidence=[],options={},prompt=''
  const page=(name,url)=>({ok:true,url,title:'Barbearia Aurora Rio Grande',
    text:('Barbearia Aurora Rio Grande '+name+' divulgou informações públicas sobre a equipe e atendimento. ').repeat(70)})
  const result=await investigateProspectG1({
    company:'Barbearia Aurora',city:'Rio Grande',website:'https://aurora.example.org'
  },{
    searcher:async()=>[
      {url:'https://aurora.example.org/news',title:'Barbearia Aurora',snippet:'Rio Grande'},
      {url:'https://news.example.org/story',title:'Barbearia Aurora',snippet:'Rio Grande'},
      {url:'https://blog.example.org/story',title:'Barbearia Aurora',snippet:'Rio Grande'},
    ],
    readPage:async url=>page(url,url),
    fetcher:async(_url,init)=>{
      const payload=JSON.parse(init.body)
      const context=JSON.parse(payload.messages[1].content)
      evidence=context.evidence
      assert.equal(context.verifiedPublicPages,2)
      prompt=payload.messages[0].content
      options=payload.options
      return qwen(_url,init)
    },
  })
  const publicPages=evidence.filter(item=>item.source==='pagina_publica_lida')
  assert.equal(publicPages.length,2)
  assert.equal(publicPages[0].url,'https://aurora.example.org/')
  assert.equal(publicPages[1].url,'https://news.example.org/story')
  assert.ok(publicPages.every(item=>item.text.length<=2100))
  assert.equal(options.num_ctx,5500)
  assert.equal(result.modelStatus,'completed')
  assert.equal(result.modelEvidenceCount,2)
  assert.ok(prompt.includes('fatos específicos'))
  assert.ok(prompt.includes('fonte externa'))
  assert.equal(result.pageRead,true)
})

test('G5: Ollama HTTP failure preserves page evidence and reports a safe error code',async()=>{
  const result=await investigateProspectG1({
    company:'Barbearia Aurora',city:'Rio Grande',website:'https://aurora.example.org'
  },{
    searcher:async()=>[],
    readPage:async()=>({ok:true,title:'Barbearia Aurora',
      text:'A Barbearia Aurora anunciou um evento de negócios em Rio Grande. '.repeat(8)}),
    fetcher:async()=>({ok:false,status:503}),
  })
  assert.equal(result.pageRead,true)
  assert.equal(result.modelStatus,'ollama_http_error')
  assert.equal(result.modelHttpStatus,503)
  assert.equal(result.quality,'insufficient')
  assert.equal(result.candidateEvents.length,0)
  assert.equal(result.sources[0].reading,'page')
})

test('G5: invalid JSON never becomes an approved event or a fabricated summary',async()=>{
  const result=await investigateProspectG1({
    company:'Barbearia Aurora',city:'Rio Grande',website:'https://aurora.example.org'
  },{
    searcher:async()=>[],
    readPage:async()=>({ok:true,title:'Barbearia Aurora',
      text:'Barbearia Aurora tem atendimento em Rio Grande, RS. '.repeat(8)}),
    fetcher:async()=>({ok:true,json:async()=>({message:{content:'não é JSON'},done_reason:'stop'})}),
  })
  assert.equal(result.modelStatus,'ollama_invalid_json')
  assert.equal(result.pageRead,true)
  assert.equal(result.hypotheses.length,0)
  assert.equal(result.candidateEvents.length,0)
})

test('G5: model timeout reports timeout without discarding read pages',async()=>{
  const result=await investigateProspectG1({
    company:'Barbearia Aurora',city:'Rio Grande',website:'https://aurora.example.org'
  },{
    searcher:async()=>[],
    readPage:async()=>({ok:true,title:'Barbearia Aurora',
      text:'Barbearia Aurora atende clientes na cidade de Rio Grande. '.repeat(8)}),
    modelTimeoutMs:1,
    fetcher:async(_url,opts)=>new Promise((resolve,reject)=>{
      opts.signal.addEventListener('abort',()=>{
        const error=new Error('aborted');error.name='AbortError';reject(error)
      },{once:true})
    }),
  })
  assert.equal(result.modelStatus,'ollama_timeout')
  assert.equal(result.pageRead,true)
  assert.equal(result.candidateEvents.length,0)
})


test('G5.5: irrelevant SearXNG hits cannot suppress eligible Garimpo search hits',async()=>{
  let localCalls=0
  const sources=await searchCompanySourcesG1({
    company:'Barbearia Matheus',city:'Rio Grande, RS'
  },{
    searxSearch:async()=>[
      {url:'https://unrelated.example.org',title:'Barbearia Lucas',snippet:'Corte de cabelo'},
      {url:'http://not-secure.example.org',title:'Barbearia Matheus',snippet:'Rio Grande'}
    ],
    fetcher:async(_url,init)=>{
      localCalls++
      assert.deepEqual(JSON.parse(init.body),{company:'Barbearia Matheus',city:'Rio Grande, RS'})
      return {ok:true,json:async()=>({ok:true,results:[
        {url:'https://matheus.example.org',title:'Barbearia Matheus em Rio Grande',snippet:'Atendimento local'},
      ]})}
    },
  })
  assert.equal(localCalls,1)
  assert.equal(sources.length,1)
  assert.equal(sources[0].url,'https://matheus.example.org/')
  assert.equal(sources[0].origin,'garimpo')
})

test('G5.5: search results with no eligible company identity return no sources',async()=>{
  const sources=await searchCompanySourcesG1({company:'Barbearia Matheus',city:'Rio Grande'},{
    searxSearch:async()=>[
      {url:'https://unrelated.example.org',title:'Barbearia Aurora',snippet:'Profissionais da região'},
    ],
    fetcher:async()=>({ok:true,json:async()=>({ok:true,results:[
      {url:'https://other.example.org',title:'Barbearia Lucas',snippet:'Rio Grande'}
    ]})}),
  })
  assert.deepEqual(sources,[])
})

test('G5.5: category-only investigation does not call Ollama or generate generic business hypotheses',async()=>{
  let called=0
  const result=await investigateProspectG1({
    company:'Barbearia Matheus',city:'Rio Grande, RS',segment:'Barbearia',
    description:'Estabelecimento do segmento de estética masculina.'
  },{
    searcher:async()=>[],
    fetcher:async()=>{called++;throw new Error('Ollama must not run without public evidence')},
  })
  assert.equal(called,0)
  assert.equal(result.ok,true)
  assert.equal(result.modelStatus,'skipped_no_public_evidence')
  assert.equal(result.quality,'insufficient')
  assert.equal(result.pageRead,false)
  assert.equal(result.modelEvidenceCount,0)
  assert.equal(result.searchDiagnostics.resultsReturned,0)
  assert.deepEqual(result.hypotheses,[])
  assert.deepEqual(result.questions,[])
  assert.deepEqual(result.candidateEvents,[])
  assert.ok(result.summary.includes('não permite identificar necessidades'))
})

test('G5.5: inaccessible candidate link preserves diagnostics without using registry-only AI',async()=>{
  let called=0
  const result=await investigateProspectG1({
    company:'Barbearia Matheus',city:'Rio Grande, RS',segment:'Barbearia'
  },{
    searcher:async()=>[{url:'https://matheus.example.org',title:'Barbearia Matheus',snippet:'Rio Grande'}],
    readPage:async()=>({ok:false,error:'page_timeout'}),
    fetcher:async()=>{called++;return qwen()},
  })
  assert.equal(called,0)
  assert.equal(result.modelStatus,'skipped_no_public_evidence')
  assert.equal(result.pageRead,false)
  assert.equal(result.searchDiagnostics.eligibleUrls,1)
  assert.equal(result.sources[0].readError,'page_timeout')
  assert.ok(result.caveats.some(x=>x.includes('não puderam ser lidos')))
})

test('G5.5: valid public source still allows verified analysis',async()=>{
  let called=0
  const result=await investigateProspectG1({
    company:'Barbearia Matheus',city:'Rio Grande',segment:'Barbearia'
  },{
    searcher:async()=>[{url:'https://matheus.example.org',title:'Barbearia Matheus Rio Grande',snippet:'Atendimento'}],
    readPage:async()=>({ok:true,engine:'crawl4ai',url:'https://matheus.example.org/',
      title:'Barbearia Matheus Rio Grande',text:'A Barbearia Matheus anunciou reforma do espaço em Rio Grande. '.repeat(8)}),
    fetcher:async()=>{called++;return qwen()},
  })
  assert.equal(called,1)
  assert.equal(result.pageRead,true)
  assert.equal(result.quality,'page_reviewed')
  assert.equal(result.modelStatus,'completed')
})


test('G5.5: a person named Matheus does not verify Barbearia Matheus',async()=>{
  let modelCalls=0
  const result=await investigateProspectG1({
    company:'Barbearia Matheus',city:'Rio Grande, RS',segment:'Barbearia'
  },{
    searcher:async()=>[{url:'https://personal.example.org',title:'Matheus professor em Rio Grande',
      snippet:'Entrevista a Matheus Rio Grande'}],
    readPage:async()=>{throw new Error('Unrelated site should never be read')},
    fetcher:async()=>{modelCalls++;return qwen()},
  })
  assert.equal(modelCalls,0)
  assert.equal(result.sources.length,0)
  assert.equal(result.pageRead,false)
  assert.equal(result.modelStatus,'skipped_no_public_evidence')
})

test('G5.5: SearXNG public candidate remains valid when local search is unavailable',async()=>{
  const sources=await searchCompanySourcesG1({company:'Barbearia Matheus',city:'Rio Grande'},{
    searxSearch:async()=>[{url:'https://matheus.example.org',title:'Barbearia Matheus',snippet:'Rio Grande'}],
    fetcher:async()=>{throw new Error('Local Garimpo offline')},
  })
  assert.equal(sources.length,1)
  assert.equal(sources[0].origin,'searxng')
})


test('G5.6: local discovery uses canonical small-business name, not directory SEO label',async()=>{
  const sent=[]
  const sources=await searchCompanySourcesG1({
    company:'Lelo Barbershop Barbearia em Rio Grande',city:'Rio Grande, RS'
  },{
    searxSearch:async query=>{
      sent.push(query)
      return [{title:'Lelo Barbearia Rio Grande',url:'https://www.instagram.com/lelocortes/',snippet:'Lelo barbearia em Rio Grande'}]
    },
    fetcher:async(_url,init)=>{
      const req=JSON.parse(init.body)
      assert.deepEqual(req,{company:'Lelo Barbershop',city:'Rio Grande, RS'})
      return {ok:true,json:async()=>({ok:true,results:[
        {title:'Lelo Barbershop Rio Grande',url:'https://lelocortes.example.org/',snippet:'Barbearia em Rio Grande'},
        {title:'Barbearia de Lucas',url:'https://lucas.example.org/',snippet:'Rio Grande'}
      ]})}
    },
  })
  assert.ok(sent.some(q=>q.includes('site:instagram.com')))
  assert.ok(sources.some(s=>s.url==='https://lelocortes.example.org/'))
  assert.ok(sources.some(s=>s.url==='https://www.instagram.com/lelocortes/'))
  assert.equal(sources[0].sourceKind,'website')
  assert.equal(sources.filter(s=>s.url.includes('lucas.example.org')).length,0)
})

test('G5.6: a social profile suggestion is not fetched and cannot become model evidence',async()=>{
  let crawled=0,modelCalls=0
  const result=await investigateProspectG1({
    company:'Lelo Barbershop Barbearia em Rio Grande',city:'Rio Grande, RS',segment:'Barbearia',
  },{
    searcher:async()=>[{url:'https://www.instagram.com/lelocortes/',title:'Lelo Barbershop Rio Grande',
      snippet:'Barbearia Lelo Rio Grande'}],
    readPage:async()=>{crawled++;throw Error('Social media must not be scraped as verified page')},
    fetcher:async()=>{modelCalls++;return qwen()},
  })
  assert.equal(crawled,0)
  assert.equal(modelCalls,0)
  assert.equal(result.pageRead,false)
  assert.equal(result.modelStatus,'skipped_no_public_evidence')
  assert.equal(result.searchDiagnostics.socialProfiles,1)
  assert.equal(result.sources[0].sourceKind,'social_profile')
  assert.equal(result.sources[0].identity,'unconfirmed')
  assert.equal(result.sources[0].readError,'public_profile_manual_review')
  assert.equal(result.sources[0].excerpt,'')
  assert.deepEqual(result.candidateEvents,[])
})

test('G5.6: manually supplied public website is re-checked before Qwen receives it',async()=>{
  let analyzed=0
  const result=await investigateProspectG1({
    company:'Lelo Barbershop Barbearia em Rio Grande',city:'Rio Grande, RS',
    publicSourceUrl:'https://lelocortes.example.org/sobre',
  },{
    searcher:async()=>[],
    readPage:async url=>{
      assert.equal(url,'https://lelocortes.example.org/sobre')
      return {ok:true,engine:'crawl4ai',title:'Lelo Barbearia Rio Grande',
        text:'A Lelo Barbearia está localizada em Rio Grande e apresenta seus serviços publicamente. '.repeat(8)}
    },
    fetcher:async()=>{analyzed++;return qwen()},
  })
  assert.equal(analyzed,1)
  assert.equal(result.pageRead,true)
  assert.equal(result.quality,'page_reviewed')
  assert.equal(result.sources[0].origin,'manual')
  assert.equal(result.sources[0].engine,'crawl4ai')
  assert.equal(result.modelEvidenceCount,1)
})

test('G5.6: a manual social URL stays an unverified lead without Qwen',async()=>{
  const result=await investigateProspectG1({
    company:'Barbearia Matheus',city:'Rio Grande, RS',
    publicSourceUrl:'https://www.instagram.com/matheusbarbearia/',
  },{
    searcher:async()=>[],
    readPage:async()=>{throw Error('social read not allowed')},
    fetcher:async()=>{throw Error('model requires public verification')},
  })
  assert.equal(result.pageRead,false)
  assert.equal(result.sources[0].sourceKind,'social_profile')
  assert.equal(result.modelStatus,'skipped_no_public_evidence')
  assert.equal(result.modelEvidenceCount,0)
})

test('G5.6: private manual input cannot enter candidate reading',async()=>{
  const parsed=sanitizeProspectForInvestigation({
    company:'Barbearia Matheus',city:'Rio Grande',
    publicSourceUrl:'http://127.0.0.1:8791/tools/health'
  })
  assert.equal(parsed.publicSourceUrl,null)
})


test('G5.6: Lelo public Instagram URL is returned as an unverified review link',async()=>{
  let readCalls=0,modelCalls=0
  const url='https://www.instagram.com/lelo.barbershop/'
  const result=await investigateProspectG1({
    company:'Lelo Barbershop Barbearia em Rio Grande',
    city:'Rio Grande, RS',
    publicSourceUrl:url,
  },{
    searcher:async()=>[],
    readPage:async()=>{readCalls++;throw Error('Do not read Instagram')},
    fetcher:async()=>{modelCalls++;throw Error('Do not infer from Instagram link alone')},
  })
  assert.equal(readCalls,0)
  assert.equal(modelCalls,0)
  assert.equal(result.pageRead,false)
  assert.equal(result.modelStatus,'skipped_no_public_evidence')
  assert.equal(result.searchDiagnostics.socialProfiles,1)
  assert.equal(result.sources.length,1)
  assert.equal(result.sources[0].url,url)
  assert.equal(result.sources[0].sourceKind,'social_profile')
  assert.equal(result.sources[0].readError,'public_profile_manual_review')
  assert.deepEqual(result.hypotheses,[])
  assert.deepEqual(result.candidateEvents,[])
})
