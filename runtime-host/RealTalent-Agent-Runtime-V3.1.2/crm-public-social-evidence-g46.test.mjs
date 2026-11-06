import test from 'node:test'
import assert from 'node:assert/strict'
import {publicPageMetaG46,evidenceMatchesCompanyG46,readPublicSocialEvidenceG46,
  enrichPublicSocialSourcesG46} from './crm-public-social-evidence-g46.mjs'

const url='https://www.instagram.com/salentobarbearia/'
const company='Salento Barbearia'
const metaPage=String.raw`<!doctype html><html><head>
<title>Salento Barbearia (@salentobarbearia) - Instagram</title>
<meta property="og:description" content="Salento Barbearia em Rio Grande - Serviços de barbearia moderna e prótese capilar.">
</head><body><div>Faça login para continuar no Instagram.</div></body></html>`;
const publicPage=String.raw`<!doctype html><html><head><title>Salento Barbearia — Rio Grande RS</title></head>
<body><article><h1>Salento Barbearia Rio Grande</h1>
<p>A Salento Barbearia está localizada no centro de Rio Grande e oferece serviços de barbearia moderna.</p>
<p>A equipe realiza cortes, barbas e prótese capilar, conforme a página pública de agendamentos.</p>
<p>Serviços disponíveis por agendamento, com horários informados no site oficial.</p>
</article></body></html>`;

test('extracts only visible public metadata and labels it metadata, not complete post',async()=>{
  const meta=publicPageMetaG46(metaPage)
  assert.match(meta.description,/prótese capilar/)
  const result=await readPublicSocialEvidenceG46({url},{company,
    requestPage:async()=>({html:metaPage})})
  assert.equal(result.reading,'metadata')
  assert.equal(result.readStatus,'metadata_only')
  assert.match(result.excerpt,/Salento Barbearia/)
})
test('public HTML is considered a read page only if identity matches',async()=>{
  const result=await readPublicSocialEvidenceG46({url:'https://sites.appbarber.com.br/barberlineker'},{company,
    requestPage:async()=>({html:publicPage})})
  assert.equal(result.reading,'page')
  assert.equal(result.readStatus,'read')
  assert.match(result.excerpt,/prótese capilar/)
})
test('unrelated readable pages must not be attributed to this company',async()=>{
  const result=await readPublicSocialEvidenceG46({url},{company,
    requestPage:async()=>({html:publicPage.replaceAll('Salento','Outro')})})
  assert.equal(result.reading,'snippet')
  assert.equal(result.readStatus,'identity_not_confirmed')
  assert.equal(result.excerpt,'')
})
test('rejects unsafe redirect without requesting it',async()=>{
  let calls=0
  const r=await readPublicSocialEvidenceG46({url},{company,
    requestPage:async()=>{calls++;return {redirect:'http://127.0.0.1/admin'}}})
  assert.equal(r.readStatus,'unsafe_redirect')
  assert.equal(calls,1)
})
test('denies direct local URLs before making a request',async()=>{
  let calls=0
  const r=await readPublicSocialEvidenceG46({url:'http://127.0.0.1:8791/secrets'},{
    company,requestPage:async()=>{calls++;return {html:publicPage}}
  })
  assert.equal(r.readStatus,'unsafe_url')
  assert.equal(calls,0)
})
test('unavailable Instagram page is labeled as not read, without fabricated evidence',async()=>{
  const r=await readPublicSocialEvidenceG46({url},{company,
    requestPage:async()=>{throw new Error('non_html_response')}})
  assert.equal(r.reading,'snippet')
  assert.equal(r.excerpt,'')
  assert.equal(r.readStatus,'restricted_or_non_html')
})
test('never fetches the entire Instagram feed: at most 3 bounded URLs',async()=>{
  let called=0
  const urls=[
    url,'https://www.instagram.com/reel/ABC1/','https://www.instagram.com/reel/ABC2/',
    'https://www.riograndino.com.br/salento-barbearia/',
    'https://www.riograndino.com.br/mais-postagens/',
  ]
  const sources=urls.map((item,i)=>({url:item,title:'Salento Barbearia',snippet:'Salento Barbearia RS',id:i+1}))
  const result=await enrichPublicSocialSourcesG46(sources,{company,reader:async()=>{
    called++;return {reading:'metadata',excerpt:'Salento Barbearia em Rio Grande com serviços publicados no site.',
      readStatus:'metadata_only'}
  }})
  assert.equal(called,3)
  assert.equal(result.filter(x=>x.reading==='metadata').length,3)
  assert.equal(result.filter(x=>x.reading==='snippet').length,2)
})
test('requires distinctive business name and does not match a generic category',()=>{
  assert.equal(evidenceMatchesCompanyG46('Salento Barbearia','Salento Barbearia em Rio Grande'),true)
  assert.equal(evidenceMatchesCompanyG46('Salento Barbearia','Outra Barbearia em Rio Grande'),false)
  assert.equal(evidenceMatchesCompanyG46('Barbearia','Barbearia em Rio Grande'),false)
})
