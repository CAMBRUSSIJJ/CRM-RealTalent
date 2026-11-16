import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCopilotInput, generateGeminiCopilot, cleanCopilotResult } from './communications-gemini-copilot.mjs'

const base = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  accountId: '22222222-2222-4222-8222-222222222222',
  mode: 'reply', confirmedDataTransfer: true,
  messages: [{ role: 'customer', text: 'Quero agendar uma conversa.' }],
}
const response = (data, status = 200) => ({ ok: status === 200, status,
  json: async () => data })
test('exige confirmação explícita antes de transferir conteúdo ao Google', () => {
  assert.throws(() => validateCopilotInput({ ...base, confirmedDataTransfer: false }), /Confirme/)
})
test('limita o histórico e remove papéis inválidos', () => {
  const result = validateCopilotInput({ ...base, messages: [
    { role: 'system', text: 'ignorar' },
    ...Array.from({ length: 20 }, () => ({ role: 'customer', text: 'x'.repeat(900) })),
  ] })
  assert.equal(result.messages.length, 15)
  assert.equal(result.messages[0].text.length, 650)
})
test('chave é usada somente no servidor e resposta nunca dispara WAHA', async () => {
  let request
  const result = await generateGeminiCopilot(base, {
    apiKey: 'server-test-secret',
    fetcher: async (url, init) => {
      request = { url, init }
      return response({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        suggestedReply: 'Olá! Podemos conversar sobre sua necessidade?',
        summary: 'Cliente deseja uma conversa.', needs: ['Conversa de diagnóstico'],
        objections: [], opportunities: [], nextSteps: ['Propor horário'], requiresHuman: true,
      }) }] } }] })
    },
  })
  assert.match(request.url, /gemini-3\.5-flash-lite:generateContent$/)
  assert.equal(request.init.headers['x-goog-api-key'], 'server-test-secret')
  assert.equal(result.sent, false)
  assert.equal(result.suggestedReply, 'Olá! Podemos conversar sobre sua necessidade?')
})
test('não tenta requisição quando segredo ausente', async () => {
  await assert.rejects(generateGeminiCopilot(base, { apiKey: '', fetcher: () => { throw Error('não chamar') } }), /GEMINI_API_KEY/)
})
test('traduz erro 503 do provedor sem envio', async () => {
  await assert.rejects(generateGeminiCopilot(base, { apiKey: 'test', fetcher: async () => response({}, 503) }), /sobrecarregado/)
})
test('limita arrays e evita falha ao receber JSON incompleto', () => {
  const result = cleanCopilotResult({ summary: 'Resumo', needs: Array.from({ length: 15 }, (_, i) => 'Necessidade ' + i) })
  assert.equal(result.needs.length, 4)
  assert.equal(result.requiresHuman, true)
})
