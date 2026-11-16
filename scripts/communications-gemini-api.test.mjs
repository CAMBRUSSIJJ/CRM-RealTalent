import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/communications-gemini.mjs'
const response = () => ({
  code: 200, body: null,
  setHeader() {},
  status(value) { this.code = value; return this },
  json(value) { this.body = value; return this },
})
test('servidor rejeita método GET sem consultar provedor', async () => {
  const res = response()
  await handler({ method: 'GET', headers: {} }, res)
  assert.equal(res.code, 405)
})
test('servidor exige login antes de consultar histórico', async () => {
  const res = response()
  await handler({ method: 'POST', headers: {}, body: {} }, res)
  assert.equal(res.code, 401)
})
