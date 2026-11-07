import test from 'node:test'
import assert from 'node:assert/strict'
import {collectInstagramPostEvidenceG47,validateInstagramPostAnalysisG47,
  analyzeInstagramPostsG47} from './crm-instagram-post-analysis-g47.mjs'

const sources=[
  {id:1,url:'https://www.instagram.com/salentobarbearia/',title:'Salento Barbearia',
    snippet:'Perfil de Salento Barbearia.',reading:'snippet'},
  {id:2,url:'https://www.instagram.com/p/DFIyayaxCM7/',title:'Salento Barbearia: Bem vindos',
    snippet:'Bem vindos ao início de nossa história! Endereço: 24 de Maio, 532, Rio Grande.',
    reading:'snippet'},
  {id:3,url:'https://www.instagram.com/reel/DFIyayaxCM8/',title:'Salento Barbearia - reels',
    snippet:'Prótese capilar é um dos serviços anunciados pelo estabelecimento.',reading:'metadata',
    excerpt:'Salento Barbearia — Prótese capilar é um dos serviços anunciados no perfil.'},
]
test('reads only specific public post URLs and rejects private/wrong domain links',()=>{
  const picked=collectInstagramPostEvidenceG47([...sources,
    {...sources[1],url:'https://www.instagram.com/api/v1/private/'},
    {...sources[1],url:'http://127.0.0.1:4319/api'},
    {...sources[1],url:'https://evil-instagram.com/p/DFIyayaxCM7/'}])
  assert.equal(picked.length,2)
  assert.deepEqual(picked.map(s=>s.id),[2,3])
  assert.equal(picked[0].reading,'snippet')
  assert.equal(picked[1].reading,'metadata')
  assert.match(picked[1].text,/Prótese capilar/)
})
test('rejects hallucinated quotes, unknown source IDs and duplicate output',()=>{
  const evidence=collectInstagramPostEvidenceG47(sources)
  const raw=[
    {id:2,quote:'Bem vindos ao início de nossa história!',observation:'A publicação recebe visitantes.',
      topic:'positioning',strategicReading:'A marca comunica lançamento.',
      commercialHypothesis:'Avaliar suporte a agendamento.',diagnosticQuestion:'Como agendam?',},
    {id:3,quote:'O negócio duplicou seu faturamento',observation:'Faturamento aumentou',
      topic:'expansion',strategicReading:'Alta demanda',commercialHypothesis:'Comprar CRM',
      diagnosticQuestion:'Tem verba?'},
    {id:900,quote:'Bem vindos ao início de nossa história!',observation:'Post conhecido',
      topic:'other',strategicReading:'',commercialHypothesis:'',diagnosticQuestion:''},
    {id:2,quote:'Bem vindos ao início de nossa história!',observation:'Outro registro',
      topic:'other',strategicReading:'',commercialHypothesis:'',diagnosticQuestion:''},
  ]
  const checked=validateInstagramPostAnalysisG47({posts:raw},evidence)
  assert.equal(checked.length,1)
  assert.equal(checked[0].evidenceLevel,'snippet')
  assert.equal(checked[0].reviewStatus,'analysis_only')
  assert.equal(checked[0].topic,'positioning')
})
test('Ollama responds with per-post review-only hypotheses and exact quotations',async()=>{
  let request
  const answer=await analyzeInstagramPostsG47({
    company:'Salento Barbearia',city:'Rio Grande, RS',
    question:'Analise as publicações e separe fatos e hipóteses',sources,
  },{
    fetcher:async(url,init)=>{
      assert.equal(url,'http://127.0.0.1:11434/api/chat')
      request=JSON.parse(init.body)
      return {ok:true,json:async()=>({message:{content:JSON.stringify({posts:[
        {id:2,quote:'Bem vindos ao início de nossa história!',
          observation:'O post apresenta o início da história da marca.',
          topic:'positioning',strategicReading:'Pode enfatizar vínculo e identidade.',
          commercialHypothesis:'Possível interesse em estruturação da experiência.',
          diagnosticQuestion:'Como vocês acompanharam os primeiros clientes?'},
        {id:3,quote:'Faturamento triplicou',observation:'Informação não disponível.',
          topic:'expansion',strategicReading:'Evidência não existe.',
          commercialHypothesis:'Intenção de compra',diagnosticQuestion:'Quando compram?'},
      ]})}})}
    },
  })
  assert.equal(request.model,'qwen3:8b')
  assert.equal(request.stream,false)
  assert.equal(request.messages[1].images,undefined)
  assert.equal(answer.status,'analyzed')
  assert.equal(answer.posts.length,1)
  assert.equal(answer.posts[0].quote,'Bem vindos ao início de nossa história!')
  assert.equal(answer.posts[0].evidenceLevel,'snippet')
  assert.equal(answer.posts[0].reviewStatus,'analysis_only')
})
test('if there are no publicly indexed publications, Ollama is not called',async()=>{
  let count=0
  const result=await analyzeInstagramPostsG47({
    company:'Salento Barbearia',city:'Rio Grande',sources:[sources[0]],
  },{fetcher:async()=>{count++;return {ok:false}}})
  assert.equal(count,0)
  assert.equal(result.status,'no_indexed_posts')
  assert.deepEqual(result.posts,[])
})
test('invalid response creates no analysis and never marks events approved',async()=>{
  const result=await analyzeInstagramPostsG47({
    company:'Salento Barbearia',sources,
  },{fetcher:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({
    posts:[{id:2,quote:'Empresa anuncia 20 novas contratações',
      observation:'Contratou 20',topic:'hiring',strategicReading:'Gatilho importante',
      commercialHypothesis:'Precisa contratar',diagnosticQuestion:'Quantas vagas?'}],
  })}})})})
  assert.equal(result.status,'insufficient_evidence')
  assert.equal(result.posts.length,0)
})
test('limits source selection to six public indexed posts',()=>{
  const many=Array.from({length:20},(_,i)=>({
    id:i+1,url:'https://www.instagram.com/p/ABC123'+i+'/',
    title:'Salento Barbearia',snippet:'Promoção da Salento Barbearia - cortesia de boas-vindas',
    reading:'snippet',
  }))
  assert.equal(collectInstagramPostEvidenceG47(many).length,6)
})
