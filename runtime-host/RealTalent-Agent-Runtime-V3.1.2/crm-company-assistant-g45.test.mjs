import test from 'node:test'
import assert from 'node:assert/strict'
import {classifyCompanyQuestionG45,normalizeCompanyQuestionG45,validNumericCnpj,
  answerCompanyQuestionG45} from './crm-company-assistant-g45.mjs'

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
  let prompt=''
  const result=await answerCompanyQuestionG45(company,{
    searcher:async()=>({ok:true,sources:instagram}),
    enricher:async sources=>sources.map((source,i)=>({...source,
      reading:i===0?'metadata':'snippet',excerpt:i===0?'Salento Barbearia em Rio Grande, prótese capilar.':'',
      readStatus:i===0?'metadata_only':'no_accessible_text'})),
    fetcher:async(url,options)=>{
      const body=JSON.parse(options.body)
      prompt=body.messages[1].content
      return {ok:true,json:async()=>({message:{content:JSON.stringify({
        answer:'Fontes públicas indicam serviços de barbearia [1]. A necessidade de treinamento ainda precisa ser investigada.'
      })}})}
    },
  })
  assert.equal(result.pagesRead,0)
  assert.equal(result.metadataRead,1)
  assert.equal(result.sources[0].reading,'metadata')
  assert.match(prompt,/metadata/)
  assert.match(prompt,/prótese capilar/)
  assert.match(result.answer,/precisa ser investigada/)
})
