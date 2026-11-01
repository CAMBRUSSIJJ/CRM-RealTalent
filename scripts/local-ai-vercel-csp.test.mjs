import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const config=JSON.parse(readFileSync('vercel.json','utf8'))
const glob=config.headers.find(x=>x.source==='/(.*)')
const csp=glob.headers.find(x=>x.key.toLowerCase()==='content-security-policy')?.value||''
test('Vercel production CSP permits only the localhost AI connector port',()=>{
  const connect=csp.split(';').map(x=>x.trim()).find(x=>x.startsWith('connect-src '))
  assert.ok(connect,'connect-src CSP required')
  assert.match(connect,/\bhttp:\/\/127\.0\.0\.1:8798\b/,'localhost AI port must be permitted')
  assert.doesNotMatch(connect,/\bhttp:\/\/\*|\bhttp:\/\/0\.0\.0\.0|http:\/\/127\.0\.0\.1:11434|http:\/\/127\.0\.0\.1:8792/,
    'Ollama and inner Agent ports must not be exposed via browser CSP')
})
test('Vercel still blocks unsafe content by default',()=>{
  assert.match(csp,/default-src 'self'/)
  assert.match(csp,/object-src 'none'/)
  assert.match(csp,/frame-ancestors 'none'/)
})
