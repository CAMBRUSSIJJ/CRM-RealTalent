import test from 'node:test'
import assert from 'node:assert/strict'
import { proxyRuntime } from './_proxy.mjs'

const envKeys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'REALTALENT_COMMUNICATIONS_UPSTREAM_URL', 'REALTALENT_RUNTIME_TOKEN', 'VERCEL_ENV']

async function scenario({ authorization, upstreamCode = 200, machineToken = 'machine-token-ending/' } = {}) {
  const originalFetch = globalThis.fetch
  const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  const calls = []
  let output = ''
  let status = 200
  const response = {
    setHeader() {},
    end(value = '') { output += value },
    get statusCode() { return status },
    set statusCode(value) { status = value },
  }
  try {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable'
    process.env.REALTALENT_COMMUNICATIONS_UPSTREAM_URL = 'https://runtime.example/communications'
    process.env.REALTALENT_RUNTIME_TOKEN = machineToken
    process.env.VERCEL_ENV = 'production'
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options })
      if (String(url).includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'authenticated-user' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify(upstreamCode === 200 ? { ok: true } : { error: 'invalid_runtime_token' }), {
        status: upstreamCode, headers: { 'content-type': 'application/json' },
      })
    }
    await proxyRuntime({
      method: 'GET',
      url: '/api/runtime/communications/api/communications/health',
      headers: authorization ? { authorization: 'Bearer test-user-access-token' } : {},
    }, response, 'communications')
    return { status, body: JSON.parse(output), calls }
  } finally {
    globalThis.fetch = originalFetch
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key]
      else process.env[key] = originalEnv[key]
    }
  }
}

test('anonymous requests never reach upstream', async () => {
  const result = await scenario({ authorization: false })
  assert.equal(result.status, 401)
  assert.equal(result.body.error, 'authentication_required')
  assert.equal(result.calls.length, 0)
})

test('machine credential is forwarded exactly even if it ends with a slash', async () => {
  const result = await scenario({ authorization: true })
  assert.equal(result.status, 200)
  assert.equal(result.calls.length, 2)
  assert.equal(result.calls[1].options.headers['x-realtalent-runtime-token'], 'machine-token-ending/')
})

test('upstream auth failure differs from session failure without exposing credentials', async () => {
  const result = await scenario({ authorization: true, upstreamCode: 401 })
  assert.equal(result.status, 502)
  assert.equal(result.body.error, 'runtime_upstream_auth_rejected')
  assert.ok(!JSON.stringify(result.body).includes('machine-token-ending/'))
})

test('healthy upstream response is passed back', async () => {
  const result = await scenario({ authorization: true, upstreamCode: 200 })
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
})
