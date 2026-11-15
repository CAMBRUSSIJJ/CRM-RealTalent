import test from 'node:test'
import assert from 'node:assert/strict'
import {extractReadableV60,normalizeCompanyWebsiteV60} from './crm-web-reader-v60.mjs'
import {investigateProspectG1} from './crm-prospect-investigation-g1.mjs'
import {deepResearchV60} from './crm-deep-research-v60.mjs'
import {ollamaContextBudget,fitOllamaJsonMessages} from './crm-ollama-budget-v61.mjs'

const analysis={summary:'A empresa anuncia serviços de beleza e atendimento na sua página pública.',
  hypotheses:['Validar se há interesse em agendamento.'],questions:['Como organizam os horários?'],
  approach:'Conversar sobre a rotina atual.',caveats:['Não há evidência de intenção de compra.']}
const answer={answer:'A página descreve uma abordagem consultiva [1].',adaptedBody:'',quality:'partial'}
const reply=value=>({ok:true,json:async()=>({message:{content:JSON.stringify(value)}})})
const source={title:'Serviços',url:'https://example.org/servicos',excerpt:'Serviços para empresas.'}

test('short business details survive while scripts, menus and head metadata are removed',()=>{
  const page=extractReadableV60('<head><title>Salão Aurora</title><script>segredo</script></head>'+
    '<header><h1>Salão Aurora</h1><nav>Menu privado</nav></header><p>Manicure</p><p>Pedicure</p>'+
    '<footer><p>Canoas</p><p>(51) 99999-0000</p><p>contato@aurora.com.br</p></footer><script>ruído</script>')
  for(const text of ['Salão Aurora','Manicure','Pedicure','Canoas','(51) 99999-0000','contato@aurora.com.br'])
    assert.ok(page.text.includes(text),text)
  assert.equal(page.title,'Salão Aurora')
  assert.ok(!/Menu privado|segredo|ruído/.test(page.text))
})

test('company websites gain HTTPS without relaxing restrictions on hosts or protocols',()=>{
  for(const value of ['empresa.com.br','http://empresa.com.br','//empresa.com.br',' HTTPS://empresa.com.br#contato '])
    assert.equal(normalizeCompanyWebsiteV60(value)?.href,'https://empresa.com.br/')
  for(const value of ['javascript:alert(1)','ftp://empresa.com.br','https://user:pass@empresa.com.br',
    'localhost','127.0.0.1','https://empresa.com.br:8443','empresa.internal',
    'empresa.com.br\n@localhost','empresa.com.br\\@localhost',null,'x'.repeat(1101)])
    assert.equal(normalizeCompanyWebsiteV60(value),null,String(value))
})

test('a bare company domain reaches the reader using HTTPS and contacts stay redacted for analysis',async()=>{
  let target,prompt
  const out=await investigateProspectG1({company:'Salão Aurora',website:'aurora.com.br'},
    {readPage:async url=>{target=url;return {ok:true,url,title:'Aurora',
      text:'Serviços de manicure e pedicure para clientes de Canoas. '.repeat(5)+' contato@aurora.com.br 51999990000'}},
    fetcher:async(url,options)=>{prompt=JSON.parse(options.body).messages[1].content;return reply(analysis)}})
  assert.equal(target,'https://aurora.com.br/')
  assert.equal(out.quality,'page_reviewed')
  assert.ok(prompt.includes('manicure'))
  assert.ok(!prompt.includes('contato@aurora.com.br'))
  assert.ok(!prompt.includes('51999990000'))
})

test('partial JSON and invalid nested analysis fields cannot become a successful analysis',async()=>{
  for(const value of [{...analysis,hypotheses:23},{...analysis,approach:{}},{...analysis,questions:['']},
    {summary:analysis.summary}]){
    const out=await investigateProspectG1({company:'Aurora',description:'Serviços de beleza'},
      {fetcher:async()=>reply(value)})
    assert.equal(out.quality,'insufficient')
    assert.equal(out.errorCode,'invalid_analysis')
  }
})

test('timeout has a distinct diagnostic and never invents a page reading',async()=>{
  const out=await investigateProspectG1({company:'Aurora',description:'Serviços de beleza'},
    {fetcher:async()=>{throw Object.assign(new Error('cancelled'),{name:'AbortError'})}})
  assert.equal(out.errorCode,'model_timeout')
  assert.equal(out.pageRead,false)
})

test('budget trimming preserves the request, source identities and valid JSON',()=>{
  const budget=ollamaContextBudget(1024,'4096')
  const input={question:'Compare os serviços de manicure.',history:'Histórico antigo. '.repeat(400),
    sources:[{id:1,content:'Manicure e pedicure. '.repeat(500)}, {id:2,content:'Atendimento em Canoas. '.repeat(500)}]}
  const messages=fitOllamaJsonMessages({system:'Use apenas as evidências fornecidas.',input,budget,
    trimGroups:[[{path:['history']}],[{path:['sources',0,'content'],minLength:80},{path:['sources',1,'content'],minLength:80}]]})
  assert.ok(messages)
  const sent=JSON.parse(messages[1].content)
  assert.equal(sent.question,input.question)
  assert.deepEqual(sent.sources.map(s=>s.id),[1,2])
  assert.ok(sent.sources.every(s=>s.content.length>=80))
  assert.ok(messages.reduce((bytes,m)=>bytes+Buffer.byteLength(m.content),0)<=budget.maxInputBytes)
  assert.ok(input.history.length>sent.history.length)
  assert.equal(fitOllamaJsonMessages({system:'s'.repeat(budget.maxInputBytes+1),input:{question:'Não cortar'},budget}),null)
})

test('research respects configured context with several long pages and retains the current question',async()=>{
  const previous=process.env.OLLAMA_CONTEXT_LENGTH
  process.env.OLLAMA_CONTEXT_LENGTH='4096'
  try{
    let asked
    const question='Compare as abordagens de atendimento e explique as diferenças.'
    const out=await deepResearchV60({question,document:'Documento antigo. '.repeat(400),history:'Histórico. '.repeat(400),
      model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434',
      searcher:async()=>Array.from({length:6},(_,i)=>({...source,url:`https://site${i}.com.br/servicos`})),
      reader:async url=>({ok:true,url,text:'Atendimento consultivo e agendamento de serviços. '.repeat(150)}),
      fetcher:async(url,options)=>{asked=JSON.parse(options.body);return reply(answer)}})
    assert.equal(out.quality,'partial')
    assert.equal(asked.options.num_ctx,4096)
    assert.equal(JSON.parse(asked.messages[1].content).question,question)
    const budget=ollamaContextBudget(2200,'4096')
    assert.ok(asked.messages.reduce((bytes,m)=>bytes+Buffer.byteLength(m.content),0)<=budget.maxInputBytes)
    assert.ok(out.sources.every(s=>s.url.startsWith('https://')))
  }finally{
    if(previous===undefined)delete process.env.OLLAMA_CONTEXT_LENGTH
    else process.env.OLLAMA_CONTEXT_LENGTH=previous
  }
})

test('research rejects an unknown quality level from the model',async()=>{
  const out=await deepResearchV60({question:'Compare os serviços disponíveis',model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434',
    searcher:async()=>[source],reader:async()=>({ok:false}),fetcher:async()=>reply({...answer,quality:'inventado'})})
  assert.equal(out.quality,'insufficient')
  assert.equal(out.errorCode,'invalid_analysis')
})
