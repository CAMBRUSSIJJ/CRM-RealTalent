import {test} from 'node:test'
import assert from 'node:assert/strict'
import {cloudflareAgentAccessHeaders} from '../api/runtime/_cloudflare-access.mjs'

test('Cloudflare Access credentials are forwarded only from server config',()=>{
  assert.deepEqual(cloudflareAgentAccessHeaders({
    REALTALENT_CF_ACCESS_CLIENT_ID:'id.access',
    REALTALENT_CF_ACCESS_CLIENT_SECRET:'secret',
  }),{'CF-Access-Client-Id':'id.access','CF-Access-Client-Secret':'secret'})
})
test('No Cloudflare Access credentials preserves legacy Railway upstream',()=>{
  assert.deepEqual(cloudflareAgentAccessHeaders({}),{})
})
test('One missing Access credential fails closed',()=>{
  assert.throws(()=>cloudflareAgentAccessHeaders({REALTALENT_CF_ACCESS_CLIENT_ID:'id.access'}),/cloudflare_access_not_configured/)
  assert.throws(()=>cloudflareAgentAccessHeaders({REALTALENT_CF_ACCESS_CLIENT_SECRET:'secret'}),/cloudflare_access_not_configured/)
})
