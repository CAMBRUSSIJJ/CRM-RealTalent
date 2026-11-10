import test from 'node:test'
import assert from 'node:assert/strict'
import {canonicalBusinessNameG56,buildBusinessQueriesG56,businessNameMatchG56,
  publicBusinessSourceKindG56,rankBusinessSourcesG56} from './crm-business-source-discovery-g56.mjs'

test('G5.6 trims SEO location suffix without dropping the brand',()=>{
  assert.equal(canonicalBusinessNameG56('Lelo Barbershop Barbearia em Rio Grande','Rio Grande, RS'),'Lelo Barbershop')
  assert.equal(canonicalBusinessNameG56('Barbearia Matheus','Rio Grande, RS'),'Barbearia Matheus')
})
test('G5.6 builds distinct, bounded brand/city/social queries',()=>{
  const queries=buildBusinessQueriesG56('Lelo Barbershop Barbearia em Rio Grande','Rio Grande, RS')
  assert.ok(queries.length<=3)
  assert.ok(queries.every(x=>x.length<=160))
  assert.ok(queries.every(x=>!x.includes('Barbearia em Rio Grande')))
  assert.ok(queries.some(x=>x.includes('site:instagram.com')))
  assert.ok(queries.some(x=>x.includes('Lelo Barbershop')))
})
test('G5.6 allows company category variants while protecting single-name identity',()=>{
  assert.equal(businessNameMatchG56('Barbearia Matheus','Matheus professor de Matemática em Rio Grande'),false)
  assert.equal(businessNameMatchG56('Barbearia Matheus','Barbearia Matheus Rio Grande RS'),true)
  assert.equal(businessNameMatchG56('Lelo Barbershop Barbearia em Rio Grande','Lelo Barbearia Rio Grande', 'Rio Grande, RS'),true)
  assert.equal(businessNameMatchG56('Lelo Barbershop Barbearia em Rio Grande','Lelo Matos Rio Grande', 'Rio Grande, RS'),false)
  assert.equal(businessNameMatchG56('Barbearia Matheus','Barbearia Lucas Rio Grande'),false)
})
test('G5.6 separates public social profiles from posts and private routes',()=>{
  assert.equal(publicBusinessSourceKindG56('https://www.instagram.com/lelocortes/'),'social_profile')
  assert.equal(publicBusinessSourceKindG56('https://www.instagram.com/p/C12345/'),'social_post')
  assert.equal(publicBusinessSourceKindG56('https://instagram.com/reel/ABC/'),'social_post')
  assert.equal(publicBusinessSourceKindG56('https://www.facebook.com/lelocortes'),'social_profile')
  assert.equal(publicBusinessSourceKindG56('https://example.org/news'),'website')
})
test('G5.6 prioritizes official websites over social and deduplicates URLs',()=>{
  const candidates=[
    {url:'https://instagram.com/lelocortes/',title:'Lelo Barbershop',snippet:'Rio Grande'},
    {url:'https://barber.example.org/',title:'Lelo Barbershop',snippet:'Rio Grande'},
    {url:'https://barber.example.org/',title:'duplicate',snippet:''},
  ]
  const ranked=rankBusinessSourcesG56(candidates,'Rio Grande, RS')
  assert.deepEqual(ranked.map(x=>x.url),['https://barber.example.org/','https://instagram.com/lelocortes/'])
})
