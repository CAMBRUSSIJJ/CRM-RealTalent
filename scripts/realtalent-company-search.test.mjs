import test from 'node:test'
import assert from 'node:assert/strict'
import {buildCompanySearchQueries,parseSearchHtmlResults,parseBingRssResults,isSearchChallenge} from './realtalent-company-search.mjs'

test('search tries commercial name with inverted segment in a small bounded set',()=>{
  const q=buildCompanySearchQueries('Salento Barbearia','Rio Grande, RS')
  assert.equal(q[0],'Salento Barbearia Rio Grande, RS')
  assert.ok(q.some(x=>x.includes('Barbearia Salento Rio Grande RS')))
  assert.ok(q.length<=4)
  assert.equal(new Set(q).size,q.length)
})
test('search can invert segment from first to last',()=>{
  assert.ok(buildCompanySearchQueries('Barbearia Salento','Rio Grande, RS').some(q=>q.includes('Salento Barbearia')))
})
test('HTML parser accepts href before class and DDG redirect with differently ordered attributes',()=>{
  const html=String.raw`<div class="result">
  <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.econodata.com.br%2Fconsulta-empresa%2F123" class="result__a">Barbearia Salento | Rio Grande, RS</a>
  <a class="result__snippet">Barbearia Salento em Rio Grande - RS</a></div>`;
  const found=parseSearchHtmlResults(html,'https://html.duckduckgo.com/html/?q=salento',8)
  assert.equal(found.length,1)
  assert.equal(found[0].url,'https://www.econodata.com.br/consulta-empresa/123')
  assert.ok(found[0].snippet.includes('Rio Grande'))
})
test('HTML parser supports class before href and deduplicates',()=>{
  const url='https://www.sitepublico.com.br/salento'
  const html='<a class="result__a" href="'+url+'">Barbearia Salento</a>'+
    '<a href="'+url+'" class="result__a">Barbearia Salento</a>'
  assert.equal(parseSearchHtmlResults(html,'https://html.duckduckgo.com/',8).length,1)
})
test('result URLs never accept private endpoints or javascript',()=>{
  const html='<a class="result__a" href="http://127.0.0.1/test">local</a>'+
    '<a class="result__a" href="javascript:alert(1)">script</a>'+
    '<a class="result__a" href="https://192.168.0.1/test">router</a>'
  assert.equal(parseSearchHtmlResults(html,'https://html.duckduckgo.com/',8).length,0)
})
test('Bing RSS reader extracts a public result',()=>{
  const rss='<?xml version="1.0"?><rss><channel><item><title>Barbearia Salento - Rio Grande</title>'+
    '<link>https://www.wikicidades.com.br/salento</link>'+
    '<description>Salento Barbearia em Rio Grande, RS</description></item></channel></rss>'
  const found=parseBingRssResults(rss)
  assert.equal(found.length,1)
  assert.equal(found[0].title,'Barbearia Salento - Rio Grande')
})
test('challenge is not silently classified as empty organic search',()=>{
  assert.equal(isSearchChallenge('<form id="challenge-form">Are you a human?</form>'),true)
  assert.equal(isSearchChallenge('<html><body>No results found</body></html>'),false)
})
