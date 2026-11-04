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

const QR_WORKSPACE = '4d26b0a2-1391-48ba-b6a1-5c0def2490a6'
const QR_USER = 'ff091d5e-ab2f-4f3f-94ad-1ad555a12345'

async function qrScenario({ role = 'owner', method = 'GET', workspaceId = QR_WORKSPACE, membershipStatus = 200, path = '' } = {}) {
  const originalFetch = globalThis.fetch
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
  let result = ''
  let status = 200
  const calls = []
  try {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable'
    process.env.REALTALENT_COMMUNICATIONS_UPSTREAM_URL = 'https://runtime.example/communications'
    process.env.REALTALENT_RUNTIME_TOKEN = 'private-runtime-token'
    process.env.VERCEL_ENV = 'production'
    globalThis.fetch = async (url, options) => {
      const target = String(url)
      calls.push({ url: target, options })
      if (target.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: QR_USER }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (target.includes('/rest/v1/organization_members')) {
        return new Response(JSON.stringify(role ? [{ role }] : []), { status: membershipStatus, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ ok:true, state: 'idle' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const qrPath = path || (method === 'POST' ? '/api/integrations/whatsapp/qr/start'
      : '/api/integrations/whatsapp/qr/status?workspaceId=' + encodeURIComponent(workspaceId))
    await proxyRuntime({
      method,
      url: '/api/runtime/communications' + qrPath,
      __realtalentRuntimePath: qrPath,
      headers: { authorization: 'Bearer test-user-access-token', 'content-type': 'application/json' },
      body: method === 'POST' ? { workspaceId, displayName: 'RealTalent' } : undefined,
    }, {
      setHeader() {},
      end(chunk='') { result += chunk },
      get statusCode() { return status },
      set statusCode(code) { status=code },
    }, 'communications')
    return { status, body: JSON.parse(result), calls }
  } finally {
    globalThis.fetch = originalFetch
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key]
      else process.env[key] = originalEnv[key]
    }
  }
}

test('owner/admin QR permission: scope verified before forwarding QR status', async () => {
  for (const role of ['owner','admin']) {
    const result = await qrScenario({ role })
    assert.equal(result.status, 200)
    assert.equal(result.calls.length, 3)
    const membership = result.calls[1]
    assert.equal(new URL(membership.url).searchParams.get('organization_id'), 'eq.' + QR_WORKSPACE)
    assert.equal(new URL(membership.url).searchParams.get('user_id'), 'eq.' + QR_USER)
    assert.ok(membership.options.headers.authorization.startsWith('Bearer '))
    assert.equal(result.calls[2].options.headers['x-realtalent-runtime-token'], 'private-runtime-token')
  }
})

test('owner/admin QR permission: denied users cannot read QR or start a session', async () => {
  for (const role of ['member','viewer',null]) {
    for (const method of ['GET','POST']) {
      const result = await qrScenario({ role, method })
      assert.equal(result.status, 403)
      assert.equal(result.body.error, 'workspace_admin_required')
      assert.equal(result.calls.length, 2)
    }
  }
})

test('owner/admin QR permission: invalid workspace and unavailable membership fail closed', async () => {
  const invalid = await qrScenario({ workspaceId:'other-organization' })
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.error, 'invalid_workspace_id')
  assert.equal(invalid.calls.length, 1)
  const unavailable = await qrScenario({ membershipStatus: 500 })
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.body.error, 'workspace_permission_check_unavailable')
  assert.equal(unavailable.calls.length, 2)
})

test('owner/admin QR permission: authorized POST pairing retains original request payload', async () => {
  const allowed = await qrScenario({ method:'POST',role:'admin' })
  assert.equal(allowed.status, 200)
  assert.equal(allowed.calls.length, 3)
  assert.deepEqual(JSON.parse(allowed.calls[2].options.body), { workspaceId: QR_WORKSPACE, displayName:'RealTalent' })
})

test('gateway data API: QR chat history and account list require matching workspace membership', async () => {
  for (const path of [
    '/api/communications/events?workspaceId=' + QR_WORKSPACE,
    '/api/integrations/accounts?workspaceId=' + QR_WORKSPACE,
  ]) {
    const member = await qrScenario({ role:'member',path })
    assert.equal(member.status,200)
    assert.equal(member.calls.length,3)
    const outsider = await qrScenario({ role:null,path })
    assert.equal(outsider.status,403)
    assert.equal(outsider.body.error,'workspace_membership_required')
    assert.equal(outsider.calls.length,2)
  }
})

test('gateway data API: sync uses workspace authorization and refuses mismatched tenant', async () => {
  const path='/api/communications/sync'
  const allowed=await qrScenario({role:'member',method:'POST',path})
  assert.equal(allowed.status,200)
  assert.equal(allowed.calls.length,3)
  const denied=await qrScenario({role:null,method:'POST',path})
  assert.equal(denied.status,403)
  assert.equal(denied.body.error,'workspace_membership_required')
  assert.equal(denied.calls.length,2)
  const unknown=await qrScenario({role:'admin',method:'GET',path:'/api/communications/events?workspaceId=other-tenant'})
  assert.equal(unknown.status,400)
  assert.equal(unknown.calls.length,1)
})

test('gateway data API: membership lookup failures cannot leak conversations', async () => {
  const result=await qrScenario({path:'/api/communications/events?workspaceId='+QR_WORKSPACE,membershipStatus:500})
  assert.equal(result.status,503)
  assert.equal(result.body.error,'workspace_permission_check_unavailable')
  assert.equal(result.calls.length,2)
})

test('gateway outgoing messages and WhatsApp group operations reject cross-workspace access', async () => {
  for (const path of [
    '/api/communications/send',
    '/api/communications/retry',
    '/api/communications/read',
    '/api/integrations/whatsapp/qr/groups',
  ]) {
    const member = await qrScenario({ role:'member', method:'POST', path })
    assert.equal(member.status,200)
    assert.equal(member.calls.length,3)
    const outsider = await qrScenario({ role:null, method:'POST', path })
    assert.equal(outsider.status,403)
    assert.equal(outsider.body.error,'workspace_membership_required')
    assert.equal(outsider.calls.length,2)
  }
})
