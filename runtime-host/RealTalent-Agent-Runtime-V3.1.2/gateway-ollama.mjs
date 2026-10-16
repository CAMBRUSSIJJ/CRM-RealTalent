// RealTalent Agent — Ollama-only entrypoint with deterministic-first semantic routing.
// Public Agent: 8791. Original runtime: internal port. No OpenAI fallback in this flow.

import fs from 'node:fs'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { preserveExplicitPlannerArguments, routeBusinessDomain, routeCapability } from './crm-semantic-router.mjs'

const OUTER_HOST = process.env.REALTALENT_AGENT_HOST || '127.0.0.1'
const OUTER_PORT = Number(process.env.REALTALENT_AGENT_PORT || 8791)
const INNER_PORT = Number(process.env.REALTALENT_AGENT_INNER_PORT || (OUTER_PORT + 1))

process.env.REALTALENT_AI_PROVIDER = 'ollama'
process.env.OLLAMA_URL = String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')

const CRM_OLLAMA_MODEL = process.env.REALTALENT_OLLAMA_MODEL || process.env.OLLAMA_MODEL || 'qwen3:4b'
process.env.OLLAMA_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_GENERAL_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_FAST_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_REASONING_MODEL = CRM_OLLAMA_MODEL
process.env.OLLAMA_CODER_MODEL = CRM_OLLAMA_MODEL
process.env.REALTALENT_OLLAMA_STRUCTURED_TIMEOUT_MS = process.env.REALTALENT_OLLAMA_STRUCTURED_TIMEOUT_MS || '90000'

delete process.env.OPENAI_API_KEY
delete process.env.OPENAI_RESPONSES_URL
delete process.env.OPENAI_PROTECTION_BYPASS

process.env.REALTALENT_AGENT_PORT = String(INNER_PORT)
const sourcePath = fileURLToPath(new URL('./gateway.mjs', import.meta.url))
const generatedPath = fileURLToPath(new URL('./.gateway-ollama-runtime.generated.mjs', import.meta.url))
let source = fs.readFileSync(sourcePath, 'utf8')

const timeoutPattern = "timeoutMs:15_000,taskType:'classification'"
const timeoutReplacement = "timeoutMs:Number(process.env.REALTALENT_OLLAMA_STRUCTURED_TIMEOUT_MS || 90_000),taskType:'classification'"
const timeoutMatches = source.split(timeoutPattern).length - 1
if (timeoutMatches !== 2) {
  throw new Error(`O gateway mudou: esperava 2 timeouts semânticos de 15s, encontrei ${timeoutMatches}. Nada foi iniciado para evitar patch silencioso incorreto.`)
}
source = source.replaceAll(timeoutPattern, timeoutReplacement)

const structuredPattern = 'model, stream: false, format: schema,'
if (source.includes(structuredPattern)) source = source.replace(structuredPattern, 'model, stream: false, think: false, format: schema,')

fs.writeFileSync(generatedPath, source, 'utf8')
await import('./.gateway-ollama-runtime.generated.mjs')

const OLLAMA_URL = process.env.OLLAMA_URL
const ROUTER_TIMEOUT_MS = Number(process.env.REALTALENT_OLLAMA_ROUTER_TIMEOUT_MS || 60_000)

const MODULE_SEMANTICS = {
  dashboard: 'ações gerais do CRM: navegar, consultar globalmente, notificações ou desfazer',
  leads: 'cadastro e manutenção de contatos, empresas, clientes e leads já existentes no CRM',
  pipeline: 'oportunidades e negócios: etapas do funil, mover estágio, ganhar ou perder negócio',
  tasks: 'tarefas e lembretes comerciais',
  followups: 'follow-ups, atividades, notas, cadências e retornos comerciais',
  agenda: 'agenda e calendário: reunião, compromisso ou evento futuro',
  calls: 'ligação telefônica: discador, resultado, próxima tentativa e gravação',
  communications: 'mensagens externas por WhatsApp ou e-mail',
  proposals: 'propostas, Buyer Room, catálogo, produtos e serviços',
  goals: 'metas, objetivos, quotas e alvos comerciais',
  playbooks: 'roteiros comerciais, scripts e playbooks',
  automations: 'automações, gatilhos e regras automáticas',
  teams: 'equipes, membros, papéis e permissões',
  revenue: 'receita, faturamento e reconhecimento financeiro',
  prospecting: 'Garimpo: descobrir, analisar, ranquear, aprovar e enviar prospects',
  settings: 'configurações e administração do workspace',
}

const MODULE_EXAMPLES = {
  agenda: ['marque uma reunião amanhã às 14h', 'reagende o compromisso para 16h'],
  goals: ['meta de 40 ligações amanhã', 'defina objetivo de receita do mês'],
  prospecting: ['encontre 30 barbearias', 'ranqueie os prospects encontrados'],
  communications: ['mande um WhatsApp', 'envie um e-mail com a proposta'],
  calls: ['registre que a ligação não atendeu', 'abra a gravação da ligação'],
  tasks: ['crie uma tarefa para amanhã'],
  pipeline: ['mova esse negócio para negociação'],
  proposals: ['crie uma proposta', 'adicione um serviço no catálogo'],
}

const readJsonBody = async (req, maxBytes = 1_000_000) => {
  let raw = ''
  for await (const chunk of req) {
    raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    if (Buffer.byteLength(raw) > maxBytes) throw new Error('payload_too_large')
  }
  return raw.trim() ? JSON.parse(raw) : {}
}

const sendJson = (res, status, value) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

const compactCapability = (capability) => ({
  id: String(capability?.id || ''),
  module: String(capability?.module || ''),
  title: String(capability?.title || ''),
  description: String(capability?.description || ''),
  action: String(capability?.action || ''),
  risk: String(capability?.risk || ''),
  reversible: Boolean(capability?.reversible),
  arguments: Array.isArray(capability?.arguments) ? capability.arguments.slice(0, 24) : [],
  requiredSlots: Array.isArray(capability?.requiredSlots) ? capability.requiredSlots.slice(0, 16) : [],
})

const semanticModuleRouter = async ({ prompt, capabilities }) => {
  const modules = [...new Set(capabilities.map((item) => String(item?.module || '')).filter(Boolean))]
  if (modules.length <= 1) return { modules, primaryModule: modules[0] || '', confidence: 1, rationale: 'catálogo já restrito', source: 'single-module' }

  const deterministic = routeBusinessDomain(prompt, modules)
  if (deterministic) return deterministic

  const moduleCatalog = modules.map((module) => ({
    module,
    meaning: MODULE_SEMANTICS[module] || `módulo ${module}`,
    examples: MODULE_EXAMPLES[module] || [],
  }))
  const schema = {
    type: 'object', additionalProperties: false,
    properties: {
      primaryModule: { type: 'string', enum: modules },
      secondaryModules: { type: 'array', maxItems: 2, items: { type: 'string', enum: modules } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      canonicalIntent: { type: 'string' },
    },
    required: ['primaryModule', 'secondaryModules', 'confidence', 'canonicalIntent'],
  }
  const instructions = `Você é o roteador de domínio do RealTalent CRM. Classifique o OBJETIVO PRINCIPAL da mensagem em um domínio. Interprete intenção, não palavras isoladas. Ignore a tela atual. Uma call futura agendada é agenda; resultado de ligação é calls; envio de mensagem é communications; descoberta de novos prospects é prospecting; cadastro de lead/contato/empresa existente é leads; meta é goals; proposta é proposals. Retorne somente JSON compatível com o schema.`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ROUTER_TIMEOUT_MS)
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({
        model: CRM_OLLAMA_MODEL, stream: false, think: false, keep_alive: '30m', format: schema,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: JSON.stringify({ request: String(prompt || '').slice(0, 4000), domains: moduleCatalog }) },
        ],
        options: { temperature: 0, num_predict: 240 },
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || data?.message || `Ollama router HTTP ${response.status}`)
    const parsed = JSON.parse(String(data?.message?.content || '{}'))
    const primary = modules.includes(String(parsed?.primaryModule || '')) ? String(parsed.primaryModule) : ''
    const secondary = Array.isArray(parsed?.secondaryModules)
      ? [...new Set(parsed.secondaryModules.map(String).filter((item) => modules.includes(item) && item !== primary))].slice(0, 2)
      : []
    if (!primary) throw new Error('router_semantic_empty')
    return {
      modules: [primary, ...secondary], primaryModule: primary,
      confidence: Number.isFinite(Number(parsed?.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0,
      rationale: String(parsed?.canonicalIntent || '').slice(0, 400), source: 'ollama-domain',
    }
  } finally {
    clearTimeout(timer)
  }
}

const callInnerPlanner = async (body, reqHeaders = {}) => {
  const headers = { 'content-type': 'application/json' }
  const token = String(reqHeaders['x-realtalent-agent-token'] || '').trim()
  if (token) headers['x-realtalent-agent-token'] = token
  const response = await fetch(`http://${OUTER_HOST}:${INNER_PORT}/capabilities/plan`, { method: 'POST', headers, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

const handleCapabilityPlan = async (req, res) => {
  try {
    const body = await readJsonBody(req)
    const capabilities = Array.isArray(body?.capabilities)
      ? body.capabilities.map(compactCapability).filter((item) => item.id && item.module)
      : []
    const prompt = String(body?.prompt || '').trim()

    if (!prompt || !capabilities.length) {
      const { response, payload } = await callInnerPlanner(body, req.headers)
      return sendJson(res, response.status, payload)
    }

    let routing
    try {
      routing = await semanticModuleRouter({ prompt, capabilities })
    } catch (error) {
      console.warn(`[ollama-router] domain routing failed; using original catalog: ${error instanceof Error ? error.message : error}`)
      routing = { modules: [], primaryModule: '', confidence: 0, rationale: 'router fallback', source: 'fallback' }
    }

    const pendingId = String(body?.context?.pending_capability?.capabilityId || '')
    const pendingModule = pendingId ? capabilities.find((item) => item.id === pendingId)?.module : ''
    const selectedModules = new Set(routing.modules)
    if (pendingModule) selectedModules.add(pendingModule)

    const narrowed = selectedModules.size ? capabilities.filter((item) => selectedModules.has(item.module)) : capabilities
    const capabilityRouting = routeCapability(prompt, narrowed, pendingId)
    const finalCapabilities = capabilityRouting?.ids?.length
      ? narrowed.filter((item) => capabilityRouting.ids.includes(item.id))
      : narrowed

    console.log(`[ollama-router] primary=${routing.primaryModule || 'none'} modules=${[...selectedModules].join(',') || 'all'} capabilities=${capabilities.length}->${narrowed.length}->${finalCapabilities.length} confidence=${routing.confidence} intent=${routing.rationale} capability=${capabilityRouting?.ids?.join(',') || 'model-choice'}`)

    const planned = await callInnerPlanner({ ...body, capabilities: finalCapabilities }, req.headers)
    const payload = preserveExplicitPlannerArguments(prompt, planned.payload, body?.context || {})
    if (payload && typeof payload === 'object') {
      payload.routing = {
        provider: 'ollama', model: CRM_OLLAMA_MODEL,
        primaryModule: routing.primaryModule || '', modules: [...selectedModules], canonicalIntent: routing.rationale,
        originalCapabilityCount: capabilities.length, routedCapabilityCount: finalCapabilities.length,
        confidence: routing.confidence, capabilitySource: capabilityRouting ? 'deterministic' : 'ollama-planner',
      }
    }
    return sendJson(res, planned.response.status, payload)
  } catch (error) {
    return sendJson(res, 503, {
      ok: false,
      error: `Ollama semantic capability router: ${error instanceof Error ? error.message : String(error)}`,
      provider: 'ollama', model: CRM_OLLAMA_MODEL,
    })
  }
}

const LOCAL_BROWSER_ORIGINS = new Set(['http://127.0.0.1:4188', 'http://localhost:4188'])
const applyLocalBrowserCors = (req, res) => {
  const origin = String(req.headers.origin || '')
  if (!LOCAL_BROWSER_ORIGINS.has(origin)) return false
  res.setHeader('access-control-allow-origin', origin)
  res.setHeader('vary', 'Origin')
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type,x-realtalent-agent-token,authorization')
  res.setHeader('access-control-max-age', '600')
  return true
}

const proxyToInner = (req, res) => {
  const upstream = http.request({
    hostname: OUTER_HOST, port: INNER_PORT, path: req.url, method: req.method,
    headers: { ...req.headers, host: `${OUTER_HOST}:${INNER_PORT}` },
  }, (upstreamRes) => {
    const headers = { ...upstreamRes.headers }
    const origin = String(req.headers.origin || '')
    if (LOCAL_BROWSER_ORIGINS.has(origin)) {
      headers['access-control-allow-origin'] = origin
      headers.vary = 'Origin'
    }
    res.writeHead(upstreamRes.statusCode || 502, headers)
    upstreamRes.pipe(res)
  })
  upstream.on('error', (error) => {
    if (!res.headersSent) sendJson(res, 502, { ok: false, error: `Agent interno indisponível: ${error.message}` })
    else res.end()
  })
  req.pipe(upstream)
}

const routerServer = http.createServer((req, res) => {
  applyLocalBrowserCors(req, res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method === 'POST' && String(req.url || '').split('?')[0] === '/capabilities/plan') { handleCapabilityPlan(req, res); return }
  proxyToInner(req, res)
})

routerServer.listen(OUTER_PORT, OUTER_HOST, () => {
  console.log(`RealTalent Agent Ollama Router em http://${OUTER_HOST}:${OUTER_PORT}`)
  console.log(`Runtime interno: http://${OUTER_HOST}:${INNER_PORT}`)
  console.log(`IA: ollama · modelo único: ${CRM_OLLAMA_MODEL}`)
})