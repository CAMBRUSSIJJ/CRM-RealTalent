import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {stampHealth} from './stamp-health.mjs'

function withFixture(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'realtalent-health-'))
  fs.mkdirSync(path.join(root,'public'))
  fs.mkdirSync(path.join(root,'dist'))
  fs.writeFileSync(path.join(root,'public','health.json'),JSON.stringify({
    status:'ok',builtAt:'2026-10-08',commit:'local-source',healthType:'liveness',
    readinessNote:'A liveness check cannot confirm Auth or DB readiness.'
  }))
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'101.11.3'}))
  try{return fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('stamps production identity while keeping liveness semantics',()=>withFixture(root=>{
  const sha='a'.repeat(40)
  const r=stampHealth({root,environment:{VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:sha},
    now:new Date('2026-11-06T21:00:00.000Z')})
  const doc=JSON.parse(fs.readFileSync(path.join(root,'dist','health.json')))
  assert.equal(r.commit,sha)
  assert.equal(doc.builtAt,'2026-11-06T21:00:00.000Z')
  assert.equal(doc.version,'101.11.3')
  assert.equal(doc.channel,'production')
  assert.equal(doc.healthType,'liveness')
  assert.equal(doc.readiness,'requires-production-probe')
  assert.match(doc.readinessNote,/cannot confirm Auth or DB/)
}))
test('stamps preview with its own sha and does not mislabel it as production',()=>withFixture(root=>{
  const sha='b'.repeat(40)
  stampHealth({root,environment:{VERCEL_ENV:'preview',VITE_APP_ENV:'production',VERCEL_GIT_COMMIT_SHA:sha}})
  const doc=JSON.parse(fs.readFileSync(path.join(root,'dist','health.json')))
  assert.equal(doc.channel,'preview')
  assert.equal(doc.commit,sha)
}))
test('does not echo arbitrary commit strings into public health JSON',()=>withFixture(root=>{
  stampHealth({root,environment:{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:'PRIVATE-SUPABASE-KEY'},gitCommit:'invalid'})
  const doc=JSON.parse(fs.readFileSync(path.join(root,'dist','health.json')))
  assert.equal(doc.commit,'unavailable')
  assert.doesNotMatch(JSON.stringify(doc),/PRIVATE-SUPABASE-KEY/)
}))
