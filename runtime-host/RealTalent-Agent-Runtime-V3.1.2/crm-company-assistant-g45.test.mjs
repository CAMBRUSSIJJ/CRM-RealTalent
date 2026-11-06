import test from 'node:test'
import assert from 'node:assert/strict'
import {classifyCompanyQuestionG45,normalizeCompanyQuestionG45,validNumericCnpj,
  answerCompanyQuestionG45,directQuestionG410} from './crm-company-assistant-g45.mjs'

const company={company:'Salento Barbearia',city:'Rio Grande, RS',question:'Traga e visualize todo o Instagram da Salento Barbearia'}
const source=(url,title,snippet)=>({id:1,url,title,snippet,provider:'duckduckgo',reading:'snippet'})
const instagram=[
  source('https://www.instagram.com/salentobarbearia/','Salento Barbearia (@salentobarbearia) - Instagram',
    'Salento Barbearia, Rio Grande RS, prótese capilar.'),
  source('https://www.instagram.com/reel/DFIyayaxCM7/','Salento Barbearia - reel',
    'Salento Barbearia em Rio Grande RS.'),
  source('https://www.riograndino.com.br/salento-barbearia/','SALENTO BARBEARIA | Riograndino',
    'Rua 24 de Maio, 532, Rio Grande RS'),
]

test('routes natural-language business research without any model-provided tool execution',()=>{
  assert.equal(classifyCompanyQuestionG45('me traga e visualize todo o Instagram deste lugar'),'instagram')
  assert.equal(classifyCompanyQuestionG45('Você consegue descobrir o CNPJ?'),'cnpj')
  assert.equal(classifyCompanyQuestionG45('Qual a razão social?'),'cnpj')
  assert.equal(classifyCompanyQuestionG45('Que serviços oferece?'),'overview')
  assert.equal(normalizeCompanyQuestionG45({company:'x',question:'Instagram'}),null)
})
test('rejects malformed and invalid numeric CNPJ',()=>{
  assert.equal(validNumericCnpj('32588458000108'),true)
  assert.equal(validNumericCnpj('32588458000109'),false)
  assert.equal(validNumericCnpj('00000000000000'),false)
})
test('Instagram lookup gives public profile and indexed posts without claiming the entire feed',async()=>{
  const result=await answerCompanyQuestionG45(company,{
    searcher:async()=>({ok:true,sources:instagram}),
    enricher:async sources=>sources,
    fetcher:async()=>({ok:false}),
  })
  assert.equal(result.ok,true)
  assert.equal(result.kind,'instagram')
  assert.equal(result.profileUrl,'https://www.instagram.com/salentobarbearia/')
  assert.equal(result.posts.length,1)
  assert.match(result.limitation,/não lê todo o feed/i)
  assert.ok(result.sources.every(x=>x.reading==='snippet'))
})
test('does not recommend an Instagram profile from another company',async()=>{
  const result=await answerCompanyQuestionG45(company,{
    searcher:async()=>({ok:true,sources:[source(
      'https://www.instagram.com/outrabarbearia/',
      'Outra Barbearia em Rio Grande RS','Sem relação com a empresa pesquisada.')] }),
    enricher:async sources=>sources,
    fetcher:async()=>({ok:false}),
  })
  assert.equal(result.profileUrl,null)
  assert.equal(result.posts.length,0)
})
test('CNPJ registry confirmed but business match depends on name and locality',async()=>{
  const cnpj='32588458000108'
  const result=await answerCompanyQuestionG45({...company,question:'Encontre o CNPJ e confira cadastro'},{
    searcher:async()=>({ok:true,sources:[
      source('https://www.econodata.com.br/consulta-empresa/32588458000108',
        'SALENTO BARBEARIA CNPJ 32.588.458/0001-08',
        'Salento Barbearia Rio Grande RS registrada com o CNPJ 32.588.458/0001-08'),
    ]}),
    fetcher:async()=>({ok:true,json:async()=>({
      cnpj,razao_social:'BARBEARIA SALENTO LTDA',nome_fantasia:'SALENTO BARBEARIA',
      municipio:'RIO GRANDE',uf:'RS',descricao_situacao_cadastral:'ATIVA',
      cnae_fiscal_descricao:'Cabeleireiros',
    })}),
  })
  assert.equal(result.kind,'cnpj')
  assert.equal(result.cnpjFindings.length,1)
  assert.equal(result.cnpjFindings[0].association,'compatible')
  assert.equal(result.cnpjFindings[0].cnpj,cnpj)
})
test('an existing CNPJ is NOT attributed to company if it does not match registry identity',async()=>{
  const cnpj='32588458000108'
  const result=await answerCompanyQuestionG45({...company,question:'Qual é o CNPJ?',cnpj}, {
    searcher:async()=>({ok:true,sources:[]}),
    fetcher:async()=>({ok:true,json:async()=>({
      cnpj,razao_social:'OUTRA EMPRESA DE OUTRA CIDADE',
      nome_fantasia:'OUTRA MARCA',municipio:'PELOTAS',uf:'RS',
    })}),
  })
  assert.equal(result.cnpjFindings[0].association,'unconfirmed')
  assert.match(result.answer,/não passou|não comprova|não atribua/i)
})
test('no candidates never returns fabricated CNPJ',async()=>{
  const result=await answerCompanyQuestionG45({...company,question:'Qual o CNPJ?'},{
    searcher:async()=>({ok:true,sources:[source('https://www.instagram.com/salentobarbearia/',
      'Salento Barbearia Rio Grande RS','Agende seu horário')]}),
    fetcher:async()=>{throw new Error('Should not fetch registry without CNPJ')},
  })
  assert.equal(result.cnpjFindings.length,0)
  assert.match(result.answer,/Não foi possível confirmar um CNPJ/)
})
test('public search contains name/city/focus only and never private CRM data',async()=>{
  let body=null
  const response=await answerCompanyQuestionG45({...company,question:'Me traga o Instagram',
    privateNotes:'cliente com dados financeiros',email:'privado@teste.com'},{
    fetcher:async(url,opts)=>{
      if(String(url).includes('4319')){
        body=JSON.parse(opts.body)
        return {ok:true,json:async()=>({ok:true,results:[]})}
      }
      return {ok:false}
    },
  })
  assert.equal(response.kind,'instagram')
  assert.deepEqual(body,{company:'Salento Barbearia',city:'Rio Grande, RS',focus:'instagram'})
})

test('Instagram public HTML and metadata reading are labeled, never treated as the full feed',async()=>{
  let analyzerPayload=null
  const result=await answerCompanyQuestionG45(company,{
    searcher:async()=>({ok:true,sources:instagram}),
    enricher:async sources=>sources.map((source,i)=>({...source,
      reading:i===0?'metadata':'snippet',excerpt:i===0?'Salento Barbearia em Rio Grande, prótese capilar.':'',
      readStatus:i===0?'metadata_only':'no_accessible_text'})),
    postAnalyzer:async payload=>{analyzerPayload=payload;return {status:'insufficient_evidence',posts:[],message:'Sem evidências suficientes.'}},
    fetcher:async()=>{throw Error('No secondary model call is required when posts are indexed.')},
  })
  assert.equal(result.pagesRead,0)
  assert.equal(result.metadataRead,1)
  assert.equal(result.sources[0].reading,'metadata')
  assert.equal(analyzerPayload.sources.length,1)
  assert.equal(analyzerPayload.sources[0].reading,'snippet')
  assert.equal(result.postAnalyses.length,0)
  assert.match(result.answer,/não consegui confirmar uma análise individual/)
})
test('a real post analysis is returned with a review-only status',async()=>{
  const result=await answerCompanyQuestionG45(company,{
    searcher:async()=>({ok:true,sources:instagram}),
    enricher:async sources=>sources,
    postAnalyzer:async()=>({status:'analyzed',posts:[{
      id:1,url:'https://www.instagram.com/reel/DFIyayaxCM7/',
      title:'Salento Barbearia - reel',quote:'Salento Barbearia em Rio Grande RS.',
      observation:'Post menciona a cidade.',topic:'positioning',
      strategicReading:'Há foco em presença local.',commercialHypothesis:'Hipótese a verificar.',
      diagnosticQuestion:'Como vocês acompanham clientes locais?',reviewStatus:'analysis_only',
      evidenceLevel:'snippet',
    }],message:'Análise limitada ao snippet.'}),
    fetcher:async()=>{throw Error('No extra calls expected')},
  })
  assert.equal(result.postAnalyses.length,1)
  assert.equal(result.postAnalyses[0].reviewStatus,'analysis_only')
  assert.equal(result.postAnalysisStatus,'analyzed')
  assert.match(result.answer,/analisei 1/)
})

test('G4.10 classifies address and mobile requests as narrow factual questions',()=>{
  assert.equal(directQuestionG410('consegue o endereço e número dessa barbearia'),true)
  assert.equal(directQuestionG410('quero número de celular'),true)
  assert.equal(directQuestionG410('investigue oportunidades comerciais, necessidades e as 10 publicações do Instagram'),false)
})
test('G4.10 prioritizes evidence matching the requested address and keeps the citation link',async()=>{
  let prompt
  const input={company:'Salento Barbearia',city:'Rio Grande, RS',question:'Qual o endereço desta barbearia?'}
  const results=[
    source('https://www.instagram.com/p/DFIyayaxCM7/','Salento Barbearia Instagram','Salento Barbearia e os seus serviços.'),
    source('https://sites.appbarber.com.br/barberlineker','Salento Barbearia - serviços','Agende online na Salento Barbearia.'),
    source('https://www.riograndino.com.br/salento-barbearia/','Salento Barbearia endereço','RUA VINTE E QUATRO DE MAIO, 532 - CENTRO, Rio Grande, RS'),
  ].map((s,i)=>({...s,id:i+1}))
  const result=await answerCompanyQuestionG45(input,{
    searcher:async()=>({ok:true,sources:results}),
    fetcher:async(_url,options)=>{
      prompt=JSON.parse(options.body)
      return {ok:true,json:async()=>({message:{content:JSON.stringify({
        answer:'Rua Vinte e Quatro de Maio, 532, Centro, Rio Grande/RS [3].',
      })}})}
    },
  })
  assert.equal(result.kind,'overview')
  assert.equal(result.directAnswer,true)
  assert.deepEqual(result.answerSourceIds,[3])
  assert.equal(result.sources[2].id,3)
  const evidence=JSON.parse(prompt.messages[1].content).evidence
  assert.equal(evidence[0].id,3)
  assert.match(prompt.messages[0].content,/UMA frase/)
})
test('G4.10 prioritizes telephone evidence and refuses unsupported extra source IDs',async()=>{
  let prompt
  const results=[
    source('https://sites.appbarber.com.br/barberlineker','Salento Barbearia','Agende cortes e barba.'),
    source('https://www.riograndino.com.br/salento-barbearia/','Salento Barbearia contato','Telefone: (53) 91137642'),
  ].map((s,i)=>({...s,id:i+1}))
  const result=await answerCompanyQuestionG45({
    company:'Salento Barbearia',city:'Rio Grande, RS',question:'Qual é o número de celular?',
  },{
    searcher:async()=>({ok:true,sources:results}),
    fetcher:async(_url,options)=>{
      prompt=JSON.parse(options.body)
      return {ok:true,json:async()=>({message:{content:JSON.stringify({
        answer:'O número publicado é (53) 91137642 [2]. [99]',
      })}})}
    },
  })
  assert.equal(JSON.parse(prompt.messages[1].content).evidence[0].id,2)
  assert.deepEqual(result.answerSourceIds,[2])
  assert.match(result.answer,/fonte não confirmada/)
})
test('G4.10 short questions without accessible evidence do not invent an answer',async()=>{
  const result=await answerCompanyQuestionG45({
    company:'Salento Barbearia',city:'Rio Grande, RS',question:'Qual celular?',
  },{
    searcher:async()=>({ok:true,sources:[]}),
    fetcher:async()=>{throw Error('should not query Ollama with no sources')},
  })
  assert.equal(result.directAnswer,true)
  assert.deepEqual(result.answerSourceIds,[])
  assert.match(result.answer,/Não consegui confirmar/)
})
