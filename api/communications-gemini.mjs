// Gemini on Vercel: Supabase session and workspace checked before any billed request.
import { generateGeminiCopilot, validateCopilotInput } from '../scripts/communications-gemini-copilot.mjs'

const response = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  return res.status(status).json(body)
}
const clean = (value) => String(value || '').trim()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
  if (req.method !== 'POST') return response(res, 405, { error: 'Método não permitido.' })
  const bearer = clean(req.headers.authorization)
  if (!bearer.startsWith('Bearer ')) return response(res, 401, { error: 'Entre no CRM para usar o Gemini.' })
  let input, rawInput
  try {
    rawInput = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    input = validateCopilotInput(rawInput)
  } catch (error) {
    return response(res, Number(error?.statusCode || 400), { error: error?.message || 'Solicitação inválida.' })
  }
  if (!UUID.test(input.workspaceId)) return response(res, 400, { error: 'Workspace inválido.' })
  const supabaseUrl = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/$/, '')
  const publicKey = clean(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  if (!/^https:\/\/[^/?#]+$/.test(supabaseUrl) || !publicKey) return response(res, 503, { error: 'Verificação de usuário indisponível no servidor.' })
  const authHeaders = { apikey: publicKey, authorization: bearer, accept: 'application/json' }
  try {
    const userResponse = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: authHeaders, signal: AbortSignal.timeout(8000),
    })
    if (!userResponse.ok) return response(res, 401, { error: 'Sua sessão expirou. Entre novamente no CRM.' })
    const user = await userResponse.json()
    if (!UUID.test(user?.id || '')) return response(res, 401, { error: 'Usuário não identificado.' })
    const q = new URLSearchParams({
      select: 'role', organization_id: 'eq.' + input.workspaceId,
      user_id: 'eq.' + user.id, limit: '1',
    })
    const membership = await fetch(supabaseUrl + '/rest/v1/organization_members?' + q, {
      headers: authHeaders, signal: AbortSignal.timeout(8000),
    })
    if (!membership.ok) return response(res, 503, { error: 'Não foi possível validar as permissões do workspace.' })
    const rows = await membership.json()
    if (!Array.isArray(rows) || !rows.some((row) => typeof row?.role === 'string' && row.role)) {
      return response(res, 403, { error: 'Você não pertence a este workspace.' })
    }
  } catch {
    return response(res, 503, { error: 'Não foi possível validar a sessão ou o workspace.' })
  }
  if (!process.env.GEMINI_API_KEY) return response(res, 503, { error: 'Gemini ainda não configurado no servidor. Adicione GEMINI_API_KEY nas variáveis da Vercel.' })
  try {
    const output = await generateGeminiCopilot(rawInput, {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      timeoutMs: 25000,
    })
    return response(res, 200, output)
  } catch (error) {
    return response(res, [400,403,422,429,502,503].includes(Number(error?.statusCode)) ? Number(error.statusCode) : 502,
      { error: error instanceof Error ? error.message : 'Gemini indisponível.' })
  }
}
